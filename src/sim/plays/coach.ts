import type { GameSim } from '../game';
import { Player } from '../player';
import { PLAYS } from '../data';
import { scorerRep, scorerStyle, guardFit } from '../attention';
import valuesRaw from '../../data/plays/playValues.json';

/**
 * Round 49: the CPU coach. Instead of a random set, every (play, focus player) is scored and one is picked (softmax,
 * so it stays unpredictable):
 *  - base: what the play lab measured for that play with that style of focus player (playValues.json, points per run)
 *  - matchup edge: how much better a scorer the focus is than his defender is at guarding him (bigger for isos / posts)
 *  - fit: a post scorer guarded by someone smaller; a pick & roll that drags their poor perimeter bigs into it
 *  - what's working this game (points per run of that play, shrunk toward the lab value until it has a few runs)
 *  - situation: their star in the clutch, threes when trailing late, the hot hand
 *  - variety: never the same call twice in a row, less of the last few; don't feed someone already over-using.
 * Pure (no Phaser, no state.ts).
 */
const VALUES: Record<string, Record<string, { ppr: number; n: number }>> = (valuesRaw as any).plays ?? {};
/** Softmax temperature: score gaps of ~0.1 points per run make a call ~3× likelier. */
export const COACH_T = 0.08;
/** Plays that hunt threes (called more when trailing late). */
const THREE_SETS = new Set(['hornsFlare', 'floppy', 'chicago', 'pop3', 'dho3', 'pindown3', 'zoneOverload']);

/** The lab's points per run for this play with this style of focus (the overall value if that style is rare). */
export function baseValue(play: string, style: string): number {
  const v = VALUES[play];
  if (!v) return 0.75;
  const s = v[style];
  return s && s.n >= 120 ? s.ppr : v.all?.ppr ?? 0.75;
}

export interface CallOption { play: string; focus: Player; score: number; why: string }

/** Score one call. `log` = this game's results per play; `recent` = the last few calls (newest last). */
export function scoreCall(sim: GameSim, play: string, focus: Player, log: Record<string, { runs: number; pts: number }>, recent: string[]): CallOption {
  const def = PLAYS[play], tags = def.tags, style = scorerStyle(focus);
  let score = baseValue(play, style), why = '';
  // matchup edge: his scoring vs how well his man guards him
  const man = sim.defenderOf(focus);
  const edge = man ? scorerRep(focus) - guardFit(man, focus) : 0;
  const iso = tags.includes('iso'), post = tags.includes('post');
  score += edge * (iso || post ? 0.008 : 0.004);
  if (edge > 18) why = 'mismatch';
  if (post && man) {
    const dh = focus.height - man.height;
    if (style === 'post') score += 0.05;
    if (dh > 0.25) { score += Math.min(0.12, dh * 0.15); why = 'size mismatch'; }
    // round 74: a guard (or a man 4+ inches shorter) on a big: take him down there
    if (isBig(focus) && (man.role === '1' || man.role === '2' || dh >= 0.33)) { score += 0.1; why = 'mismatch'; }
  }
  // round 74: the team's go-to scorer is a big: feed the post
  if (post && isBig(focus) && topScorer(sim.teams[focus.team].onCourt) === focus) { score += 0.15; why ||= 'feed the post'; }
  if (tags.includes('pnr')) {
    // their bigs have to guard the action: a poor perimeter big gets dragged into it (and onto the ball on a switch)
    const bigs = sim.opp(focus.team).filter((d) => d.role === '4' || d.role === '5');
    const weak = bigs.length ? Math.min(...bigs.map((d) => d.sub.perimD ?? 60)) : 70;
    if (weak < 68) { score += (68 - weak) * 0.006; why ||= 'hunting their big'; }
  }
  if ((tags.includes('offball') || tags.includes('horns') || tags.includes('dho')) && style === 'catch') score += 0.04;
  // lob sets are a wrinkle, not the base offense (less so with a real lob passer on the floor)
  if (tags.includes('lob')) score -= sim.teams[focus.team].onCourt.some((p) => p.sub.lob >= 75 || p.mods.pAdd('lob') > 0) ? 0.14 : 0.24;
  // what's working tonight (shrunk toward the lab value until it has a few runs)
  const L = log[play];
  if (L && L.runs >= 2) {
    const w = Math.min(1, L.runs / 6);
    score += (L.pts / L.runs - baseValue(play, style)) * 0.5 * w;
    if (w >= 0.5 && L.pts / L.runs > 1.1) why ||= 'working tonight';
  }
  // situation
  const team = sim.teams[focus.team], diff = team.score - sim.teams[1 - focus.team].score;
  // round 54: closing time, the last few possessions go to the team's top scorer, mostly as isos
  const closer = endgame(sim) && topScorer(team.onCourt) === focus;
  if (closer) { score += iso ? 0.3 : 0.1; why = 'closing time'; }
  const late = sim.quarter >= sim.periods && sim.clock < sim.cfg.quarterLen * 0.35;
  if (sim.clutch && focus.star) { score += 0.08; why ||= 'clutch'; }
  if (late && diff < -5 && THREE_SETS.has(play)) { score += 0.08; why ||= 'need threes'; }
  const hot = sim.heat[focus.id]?.recent.slice(-4).filter(Boolean).length ?? 0;
  if (hot >= 3) { score += 0.06; why ||= 'hot hand'; }
  // variety + spread the ball
  recent.forEach((r, i) => { if (r === play) score -= 0.06 * (i + 1) / recent.length; });
  const off = team.onCourt, avgUse = off.reduce((a, q) => a + q.box.usage, 0) / Math.max(1, off.length);
  if (focus.box.usage > avgUse * 1.8 + 2 && !closer) score -= 0.15;
  return { play, focus, score, why };
}

/** Round 54: the last few possessions of the game (Q4 / OT, last 12% of the quarter: ~85 s of a 12-minute quarter). */
export const endgame = (sim: GameSim) => sim.cfg.mode === 'game' && sim.quarter >= sim.periods && sim.clock < sim.cfg.quarterLen * 0.12;
/** Round 74: a big (plays the 4 or 5, or listed PF / C). */
export const isBig = (p: Player) => p.role === '4' || p.role === '5' || p.pos === 'PF' || p.pos === 'C';
/** The team's go-to scorer: the best-rated star on the floor, else the best scorer by reputation. */
export function topScorer(off: Player[]): Player | null {
  const pool = off.some((p) => p.star) ? off.filter((p) => p.star) : off;
  return [...pool].sort((a, b) => scorerRep(b) - scorerRep(a))[0] ?? null;
}

/**
 * The call: all allowed plays × focus players (role swaps run any set for anyone). `canOop(play, focus)` gates lob
 * sets; `isoOk(focus)` gates isos (stars, or anyone in 3v3).
 */
export function chooseCall(sim: GameSim, plays: string[], focuses: Player[], log: Record<string, { runs: number; pts: number }>, recent: string[],
  canOop: (play: string, focus: Player) => boolean, isoOk: (focus: Player) => boolean): CallOption | null {
  const last = recent[recent.length - 1];
  const opts: CallOption[] = [];
  for (const play of plays) {
    if (play === last && plays.length > 1) continue;
    const tags = PLAYS[play].tags;
    for (const f of focuses) {
      if (tags.includes('iso') && !isoOk(f)) continue;
      if (tags.includes('lob') && !canOop(play, f)) continue;
      opts.push(scoreCall(sim, play, f, log, recent));
    }
  }
  if (!opts.length) return null;
  const top = Math.max(...opts.map((o) => o.score));
  const w = opts.map((o) => Math.exp((o.score - top) / COACH_T));
  let r = sim.rng.next() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < opts.length; i++) { r -= w[i]; if (r <= 0) return opts[i]; }
  return opts[opts.length - 1];
}
