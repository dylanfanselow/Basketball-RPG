import { Player } from './player';
import { clamp, clamp01 } from './math';

/**
 * Round 47: how a defense reacts to scorers, the way real defenses do.
 *  - Who guards whom: the best-fitting defender goes on the biggest threat, the weakest defender hides on the least
 *    dangerous man (Brunson doesn't guard Luka). Works for 3v3 and 5v5 (every pairing is tried).
 *  - Heat: the outliers — a player taking a huge share of his team's shots (and scoring on them) draws more
 *    attention: keyed in, then doubles, then triples. A star taking ~30% of the shots is normal and is left alone.
 *    Heat never cools in a game; if his efficiency drops under the current coverage, the coverage is working and
 *    the defense doesn't send another man.
 * Pure (no Phaser, no state.ts).
 */

export type ScorerStyle = 'post' | 'catch' | 'creator';
const s = (p: Player, k: string) => p.sub[k] ?? 50;

/** Scoring reputation 0-99: best of jumper / finishing / post game, weighted toward his best skill. */
export function scorerRep(p: Player): number {
  const parts = [Math.max(s(p, 'three'), s(p, 'mid')), Math.max(s(p, 'layup'), s(p, 'dunk'), s(p, 'craft')), Math.max(s(p, 'post'), s(p, 'hook'))].sort((a, b) => b - a);
  // shot creation matters: a scorer who can't create his own shot is less of a problem
  const create = (s(p, 'ballSpeed') + p.core.playmaking) / 2;
  return clamp(0.55 * parts[0] + 0.3 * parts[1] + 0.15 * parts[2] + (create - 65) * 0.12, 0, 99);
}

/** How he scores: back to the basket, off the catch, or creating off the dribble (decides who should guard him). */
export function scorerStyle(p: Player): ScorerStyle {
  const post = Math.max(s(p, 'post'), s(p, 'hook')), jumper = Math.max(s(p, 'three'), s(p, 'mid'));
  const finish = Math.max(s(p, 'layup'), s(p, 'dunk'));
  const create = (s(p, 'ballSpeed') + p.core.playmaking) / 2;
  if ((p.role === '4' || p.role === '5' || p.height >= 6.8) && post >= jumper && post >= finish - 6) return 'post';
  if (create < 62 && jumper - create > 10) return 'catch';
  return 'creator';
}

/** How well defender d handles man o (higher = better). */
export function guardFit(d: Player, o: Player): number {
  const st = scorerStyle(o), dh = o.height - d.height;
  let fit: number;
  if (st === 'post') {
    fit = 0.5 * s(d, 'postD') + 0.3 * s(d, 'block') + 0.2 * d.core.strength;
    fit -= Math.max(0, dh - 0.1) * 40;                                 // giving up size on the block is a disaster
  } else {
    fit = 0.65 * s(d, 'perimD') + 0.35 * s(d, 'speed');
    fit -= Math.max(0, dh - 0.35) * 22;                                // shot over / posted up
    fit -= Math.max(0, s(o, 'speed') - s(d, 'speed') - 6) * 0.45;      // can't stay in front
  }
  if (d.role === o.role) fit += 2;                                     // ties keep the usual positions
  return fit;
}

/** Size mismatch every coach avoids regardless of who scores (rebounding, switches): applied unweighted. */
function mismatch(d: Player, o: Player): number {
  const dh = o.height - d.height;
  return Math.max(0, dh - 0.3) * 30 + Math.max(0, -dh - 0.6) * 8;
}

/** How much a man matters to the defense: reputation, plus his heat in this game. */
export const threatWeight = (rep: number, heatScore = 0) => ((rep + heatScore * 0.5) / 60) ** 2;

/**
 * Who guards whom: tries every pairing (5! = 120, 3! = 6) and keeps the one that maximises
 * Σ weight(o) × fit(d, o) − mismatch(d, o). Returns defender id → offensive player id.
 */
/** `distW` > 0 (round 48, live changes of possession): weigh how far each defender is from each man (per ft) — in
 *  transition you pick up the nearest man, the scouting matchups come back at the next dead ball. */
export function assignGuards(defs: Player[], offs: Player[], weight: (o: Player) => number, distW = 0): Map<string, string> {
  const n = Math.min(defs.length, offs.length), out = new Map<string, string>();
  if (!n) return out;
  const w = offs.map(weight);
  const val = defs.map((d) => offs.map((o, j) => w[j] * guardFit(d, o) - mismatch(d, o) - distW * Math.hypot(d.p.x - o.p.x, d.p.y - o.p.y)));
  let best = -Infinity, bestPerm: number[] = [];
  const perm: number[] = [], used = new Array(offs.length).fill(false);
  const rec = (i: number, acc: number) => {
    if (i === n) { if (acc > best) { best = acc; bestPerm = perm.slice(); } return; }
    for (let j = 0; j < offs.length; j++) {
      if (used[j]) continue;
      used[j] = true; perm.push(j);
      rec(i + 1, acc + val[i][j]);
      perm.pop(); used[j] = false;
    }
  };
  rec(0, 0);
  bestPerm.forEach((j, i) => out.set(defs[i].id, offs[j].id));
  return out;
}

// ---------------------------------------------------------------- heat
/** 0 normal, 1 keyed in, 2 doubles, 3 triples. */
export type Tier = 0 | 1 | 2 | 3;
export const TIER_NAME = ['', 'KEYED IN', 'DOUBLE TEAMS', 'TRIPLE TEAM'] as const;
/** Heat score needed for each tier (index = tier). */
export const HEAT_AT = [0, 40, 52, 70];
/** Heat only counts once the team has taken this many shots and he has taken this many (early shares are noise). */
export const HEAT_MIN_TEAM_FGA = 25, HEAT_MIN_FGA = 6;
/** Shots he must take against the current coverage (and beat it) before the defense sends more. */
export const BEAT_FGA = 3;

export interface Heat {
  score: number; tier: Tier;
  /** box score when the current tier started (to judge whether he's beating it) */
  since: { fga: number; fgm: number; pts: number };
  /** last few shots, newest last (true = made) */
  recent: boolean[];
  /** round 48: where his points come from this game (decides how the defense helps) */
  buckets: { rim: number; jumper: number; post: number };
}
export const newHeat = (): Heat => ({ score: 0, tier: 0, since: { fga: 0, fgm: 0, pts: 0 }, recent: [], buckets: { rim: 0, jumper: 0, post: 0 } });

// ---------------------------------------------------------------- coverage (round 48)
/** How the defense helps on him: protect the rim, pack a shooter, dig on the post, or a mix. */
export type Coverage = 'wall' | 'chase' | 'post' | 'mixed';
export const COVERAGE_NAME: Record<Coverage, string> = { wall: 'protecting the rim', chase: 'packing the shooter', post: 'digging on the post', mixed: 'mixing it up' };
const RIM_SHOTS = new Set(['layup', 'dunk', 'euro', 'alleyOop', 'alleyOopLayup', 'stepThrough', 'jelly', 'push']);
/** Which bucket a made shot goes in. */
export function bucketOf(type: string, post: boolean): keyof Heat['buckets'] {
  if (post || type === 'hook') return 'post';
  return RIM_SHOTS.has(type) ? 'rim' : 'jumper';
}
/**
 * The scheme, from how he's actually scoring this game, with a small prior from his style so the early game leans on
 * reputation: ≥ 40% of his points in the post → dig on the post; 55%+ at the rim → wall off the drive; 55%+ from
 * jumpers → pack the shooter (strictly more than 55% either way); otherwise a mix (one high, one deep).
 */
export function coverage(p: Player, h: Heat | undefined): Coverage {
  const st = scorerStyle(p), b = { ...(h?.buckets ?? { rim: 0, jumper: 0, post: 0 }) };
  if (st === 'post') b.post += 4;
  else if (st === 'catch') b.jumper += 4;
  else { b.rim += 2; b.jumper += 2; }
  const tot = b.rim + b.jumper + b.post;
  if (b.post / tot >= 0.4) return 'post';
  if (b.rim / tot > 0.55) return 'wall';
  if (b.jumper / tot > 0.55) return 'chase';
  return 'mixed';
}

/**
 * The heat score from this game so far (before the never-cools max): mostly his share of the team's shots (70%) and
 * points (30%), ×100 — ~30 for a normal star, 50+ for someone taking half the shots, 70+ for a ball hog — plus a
 * little for reputation (up to 5) and a hot streak (up to 4).
 */
export function heatScore(rep: number, box: { fga: number; pts: number }, team: { fga: number; pts: number }, recent: boolean[]): number {
  if (team.fga < HEAT_MIN_TEAM_FGA || box.fga < HEAT_MIN_FGA) return 0;
  const share = 0.7 * (box.fga / team.fga) + 0.3 * (team.pts > 0 ? box.pts / team.pts : 0);
  const repTerm = clamp01((rep - 80) / 15) * 5;
  const hot = recent.slice(-4).filter(Boolean).length;
  return share * 100 + repTerm + hot;
}

/** Is he beating the coverage he's seeing now? (enough shots against it, scoring efficiently) */
export function beatingCoverage(h: Heat, box: { fga: number; fgm: number; pts: number }): boolean {
  const fga = box.fga - h.since.fga;
  if (fga < BEAT_FGA) return false;
  return (box.pts - h.since.pts) / fga >= 1.0 || (box.fgm - h.since.fgm) / fga >= 0.5;
}

/**
 * After one of his shots: update the heat (it never goes down) and maybe raise the tier by one. `cap` = the highest
 * tier this game allows (3 in 5v5, 2 in 3v3, 0 in 1v1). Returns the new tier if it went up, else null.
 */
export function afterShot(h: Heat, rep: number, box: { fga: number; fgm: number; pts: number }, team: { fga: number; pts: number }, made: boolean, cap: number, shot?: { type: string; post: boolean; pts: number }): Tier | null {
  h.recent.push(made); if (h.recent.length > 6) h.recent.shift();
  if (made && shot) h.buckets[bucketOf(shot.type, shot.post)] += shot.pts;
  h.score = Math.max(h.score, heatScore(rep, box, team, h.recent));
  const next = (h.tier + 1) as Tier;
  if (next > cap || h.score < HEAT_AT[next] || !beatingCoverage(h, box)) return null;
  h.tier = next; h.since = { fga: box.fga, fgm: box.fgm, pts: box.pts };
  return next;
}

/** The highest tier a game allows: triples need 5v5 (two others left to rotate), doubles need 3 a side. */
export const tierCap = (perSide: number): Tier => (perSide >= 5 ? 3 : perSide >= 3 ? 2 : 0);

/** Which attention behaviours are on (dev panel / stats experiments). */
export const ATT = { shade: true, deny: true, trap: true, load: true, scramble: true };

// ---------------------------------------------------------------- screen coverages (round 49)
/** How a defense plays a ball screen for a handler it cares about (you, or a hot handler). */
export type ScreenCov = 'under' | 'blitz' | 'switch' | 'over';
export const SCREEN_COV_TEXT: Record<ScreenCov, string> = { under: 'going under', blitz: 'blitzing', switch: 'switching', over: 'fighting over' };
/**
 * Can't shoot (best jumper < 70 and few jumper points tonight) → go under and dare him; a shooter (80+, or they're
 * packing him) → blitz the screen and make him give it up; the screener's man guards him about as well → switch;
 * otherwise fight over the top with the big in drop.
 */
export function screenCoverage(h: Player, onBall: Player | null, scrDef: Player | null, heat: Heat | undefined): ScreenCov {
  const jumper = Math.max(s(h, 'three'), s(h, 'mid'));
  const b = heat?.buckets, tot = b ? b.rim + b.jumper + b.post : 0;
  const jumperShare = tot > 0 ? b!.jumper / tot : 0;
  if (jumper < 70 && jumperShare < 0.4) return 'under';
  if (jumper >= 80 || (heat && heat.tier >= 2 && coverage(h, heat) === 'chase')) return 'blitz';
  if (onBall && scrDef && guardFit(scrDef, h) >= guardFit(onBall, h) - 8) return 'switch';
  return 'over';
}
