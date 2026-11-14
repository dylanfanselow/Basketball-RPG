/**
 * Round 90 (owner): what the scouts are saying about you after the scrimmage (on the TV, once Garcia tells you): three
 * strengths and three weaknesses. Each descriptor scores how far from average you are, mostly from your ratings
 * against the prospects at your position in the draft class, a little from your scrimmage numbers against the other
 * nine on the floor. Strengths are the furthest above average, weaknesses the furthest below; descriptors that say
 * nearly the same thing (big / strong, great handles / turnover prone) share a group and only one of a group is used.
 * Phaser-free, no state.ts.
 */
import type { GameSim, GameEvent } from '../sim/game';
import type { Player } from '../sim/player';
import type { CareerState } from './career';
import { careerPlayer } from './career';
import { draftClass } from './draftClass';
import { prospectPlayer } from '../sim/draftGames';

export interface ReportLine { key: string; title: string; why: string; value: number }
export interface ScoutReport { strengths: ReportLine[]; weaknesses: ReportLine[] }

/** One player's night, from the box score and the shot log. */
export interface GameLine {
  pts: number; fga: number; fgm: number; fta: number; ast: number; reb: number; oreb: number; stl: number; blk: number; tov: number;
  contests: number; allowed: number; faced: number; badShots: number; offDribble: number; catchMade: number; catchAtt: number;
  postPts: number; postTypes: number; transPts: number; ankles: number; scoreTypes: number; dunks: number;
}
export function gameLines(sim: GameSim): Map<string, GameLine> {
  const out = new Map<string, GameLine>(), sets = new Map<string, { post: Set<string>; types: Set<string> }>();
  const line = (id: string): GameLine => {
    let l = out.get(id);
    if (!l) {
      const p = sim.players.find((q) => q.id === id), b = p?.box;
      l = { pts: b?.pts ?? 0, fga: b?.fga ?? 0, fgm: b?.fgm ?? 0, fta: b?.fta ?? 0, ast: b?.ast ?? 0, reb: b?.reb ?? 0, oreb: b?.oreb ?? 0, stl: b?.stl ?? 0, blk: b?.blk ?? 0, tov: b?.tov ?? 0,
        contests: 0, allowed: 0, faced: 0, badShots: 0, offDribble: 0, catchMade: 0, catchAtt: 0, postPts: 0, postTypes: 0, transPts: 0, ankles: 0, scoreTypes: 0, dunks: 0 };
      out.set(id, l); sets.set(id, { post: new Set(), types: new Set() });
    }
    return l;
  };
  for (const p of sim.players) line(p.id);
  for (const e of sim.events as GameEvent[]) {
    if (e.kind === 'ankles' && e.pid) line(e.pid).ankles++;
    if (e.kind !== 'shotLog' || !e.pid || !e.data) continue;
    const d = e.data, l = line(e.pid), s = sets.get(e.pid)!, how: string[] = d.how ?? [], pts = d.made ? d.pts : 0;
    if (d.contest >= 0.4) l.badShots++;
    if (d.made && (how.includes('pullUp') || how.includes('drive'))) l.offDribble++;
    if (how.includes('catchShoot')) { l.catchAtt++; if (d.made) l.catchMade++; }
    if (how.includes('post') && d.made) { l.postPts += pts; s.post.add(d.type); }
    if (d.trans) l.transPts += pts;
    if (d.made) { s.types.add(d.type); if (d.type === 'dunk' || d.type === 'alleyOop') l.dunks++; }
    for (const pid of d.by ?? []) line(pid).contests++;
    if (d.def) { const dl = line(d.def); dl.faced++; dl.allowed += pts; }
  }
  for (const [id, l] of out) { const s = sets.get(id)!; l.postTypes = s.post.size; l.scoreTypes = s.types.size; }
  return out;
}

/** How much the ratings count vs the night (owner: "a little based on stats"). */
export const RATING_W = 0.65, STAT_W = 0.35;
const POS_WORD: Record<string, string> = { PG: 'guard', SG: 'guard', SF: 'forward', PF: 'forward', C: 'center' };

interface Desc {
  key: string; group: string;
  good?: [string, string]; bad?: [string, string];
  /** ratings deviation (z) and the night's (z vs the other nine), either may be absent */
  r?: (z: (k: string) => number, me: Player, hz: number) => number;
  s?: (zs: (f: (l: GameLine) => number, floor?: number) => number) => number;
}
const avg = (...v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
/** The descriptors (owner's list plus a few): good / bad titles with what they mean. */
export const DESCRIPTORS: Desc[] = [
  { key: 'scorer', group: 'scoring', good: ['Good scorer for a {pos}', 'gets buckets'], bad: ['Poor scorer for a {pos}', 'struggles to score'],
    r: (z) => avg(z('shooting'), z('finishing')), s: (zs) => zs((l) => l.pts, 2) },
  { key: 'passer', group: 'passing', good: ['Good passer for a {pos}', 'finds the open man'], bad: ['Poor passer for a {pos}', 'doesn\'t see the floor'],
    r: (z) => z('playmaking'), s: (zs) => zs((l) => l.ast, 1) },
  { key: 'volume', group: 'passing', bad: ['Volume scorer', 'shoots a lot, doesn\'t pass a lot'],
    s: (zs) => -Math.max(0, zs((l) => l.fga, 2) - zs((l) => l.ast, 1)) },
  { key: 'rebounder', group: 'boards', good: ['Good rebounder for a {pos}', 'cleans the glass'], bad: ['Poor rebounder for a {pos}', 'gets beat on the boards'],
    r: (z) => z('rebound'), s: (zs) => zs((l) => l.reb, 1) },
  { key: 'motor', group: 'boards', good: ['High motor', 'second chances, hustle plays'], bad: ['Low motor', 'doesn\'t chase the loose ones'],
    r: (z) => z('stamina'), s: (zs) => zs((l) => l.oreb + l.stl, 1) },
  { key: 'rim', group: 'rim', good: ['Good rim defender for a {pos}', 'protects the paint'], bad: ['Poor rim defender for a {pos}', 'no resistance at the rim'],
    r: (z) => z('block'), s: (zs) => zs((l) => l.blk, 1) },
  { key: 'hands', group: 'hands', good: ['Good hands for a {pos}', 'pokes it loose, jumps passing lanes'], bad: ['Bad hands for a {pos}', 'never gets a hand on it'],
    r: (z) => z('steal'), s: (zs) => zs((l) => l.stl, 1) },
  { key: 'help', group: 'help', good: ['Great help defender', 'contests opponents\' shots'], bad: ['Lazy defender', 'doesn\'t contest shots'],
    r: (z) => avg(z('perimD'), z('mobility')), s: (zs) => zs((l) => l.contests, 1.5) },
  { key: 'onball', group: 'onball', good: ['Lockdown on-ball defender', 'holds his man down'], bad: ['Bad on-ball defender', 'allows points'],
    r: (z) => z('perimD'), s: (zs) => -zs((l) => l.allowed, 2) },
  { key: 'shotSel', group: 'selection', good: ['Smart shot selection', 'takes the good ones'], bad: ['Tunnel vision', 'shoots bad shots'],
    s: (zs) => -zs((l) => l.badShots, 1) },
  { key: 'handles', group: 'handle', good: ['Great handles', 'breaks ankles, doesn\'t turn it over'], bad: ['Loose handle', 'coughs it up off the dribble'],
    r: (z) => avg(z('ankleBreak'), z('ballSpeed')), s: (zs) => zs((l) => l.ankles, 0.7) - zs((l) => l.tov, 1) },
  { key: 'turnovers', group: 'handle', bad: ['Turnover prone', 'careless with the ball'],
    s: (zs) => -Math.max(0, zs((l) => l.tov, 1)) },
  { key: 'creator', group: 'creation', good: ['Creator', 'makes shots off the dribble and sets others up'], bad: ['Needs to be set up', 'can\'t create his own shot'],
    r: (z) => avg(z('playmaking'), z('mid')), s: (zs) => zs((l) => l.offDribble + 0.5 * l.ast, 1) },
  { key: 'size', group: 'size', good: ['Big for his position', 'size to play through anybody'], bad: ['Small for his position', 'gets shot over'],
    r: (_z, _me, hz) => hz },
  { key: 'strength', group: 'size', good: ['Strong', 'plays through contact'], bad: ['Weak', 'gets pushed around'],
    r: (z) => z('strength') },
  { key: 'shooter', group: 'shooting', good: ['Catch-and-shoot threat', 'punishes open looks'], bad: ['Bad shooter', 'doesn\'t make his open shots'],
    r: (z) => z('three'), s: (zs) => zs((l) => l.catchMade * 2 - (l.catchAtt - l.catchMade), 1) },
  { key: 'post', group: 'post', good: ['Low-post savant', 'every post move in the book'], bad: ['No post game', 'nothing with his back to the basket'],
    r: (z) => z('post'), s: (zs) => avg(zs((l) => l.postPts, 1), zs((l) => l.postTypes, 0.5)) },
  { key: 'transition', group: 'transition', good: ['Transition player', 'scores a lot of fast-break points'], bad: ['Slow in transition', 'gets beat down the floor'],
    r: (z) => z('speed'), s: (zs) => zs((l) => l.transPts, 1.5) },
  { key: 'dimension', group: 'dimension', good: ['Multi-dimensional scorer', 'scores in many ways'], bad: ['One-dimensional', 'scores one way'],
    r: (z) => Math.min(z('shooting'), z('finishing')), s: (zs) => zs((l) => l.scoreTypes, 0.7) },
  { key: 'athlete', group: 'athletic', good: ['Explosive athlete', 'plays above the rim'], bad: ['Below the rim', 'not much bounce'],
    r: (z) => avg(z('jump'), z('mobility')), s: (zs) => zs((l) => l.dunks, 0.5) },
  { key: 'line', group: 'line', good: ['Gets to the line', 'draws contact'], bad: ['Avoids contact', 'rarely gets to the line'],
    r: (z) => z('contactFinish'), s: (zs) => zs((l) => l.fta, 1) },
];

/** How a value reads: a rating key looks in `core` first, then the sub-ratings. */
const val = (p: Player, k: string) => (p.core as Record<string, number>)[k] ?? p.sub[k] ?? 50;

/**
 * The report for you after the scrimmage `sim`. Ratings against the class at your position (mean and spread), the
 * night against the other nine players.
 */
export function buildScoutReport(c: CareerState, sim: GameSim): ScoutReport {
  const me = careerPlayer(c, 0), user = sim.user;
  const klass = draftClass(c.story, c.pos).map((p, i) => ({ p: prospectPlayer(p, `R${i}`, 1, 0), h: p.heightIn }));
  const peers = klass.filter((x) => x.p.pos === c.pos).length >= 4 ? klass.filter((x) => x.p.pos === c.pos) : klass;
  const z = (k: string) => {
    const vs = peers.map((x) => val(x.p, k)), m = avg(...vs), sd = Math.max(4, Math.sqrt(avg(...vs.map((v) => (v - m) ** 2))));
    return (val(me, k) - m) / sd;
  };
  const hs = peers.map((x) => x.h), hm = avg(...hs), hz = ((c.height * 12) - hm) / Math.max(1.5, Math.sqrt(avg(...hs.map((v) => (v - hm) ** 2))));
  const lines = gameLines(sim), mine = user ? lines.get(user.id) : undefined;
  const others = [...lines.entries()].filter(([id]) => id !== user?.id).map(([, l]) => l);
  const zs = (f: (l: GameLine) => number, floor = 1) => {
    if (!mine || !others.length) return 0;
    const vs = others.map(f), m = avg(...vs), sd = Math.max(floor, Math.sqrt(avg(...vs.map((v) => (v - m) ** 2))));
    return Math.max(-3, Math.min(3, (f(mine) - m) / sd));
  };
  const pos = POS_WORD[c.pos] ?? 'player';
  const scored = DESCRIPTORS.map((d) => {
    const r = d.r ? d.r(z, me, hz) : null, s = d.s ? d.s(zs) : null;
    const value = r !== null && s !== null ? RATING_W * r + STAT_W * s : r !== null ? r : STAT_W * (s ?? 0) * 1.6;
    return { d, value };
  });
  // each group goes to whichever side it deviates furthest on; the biggest deviations are placed first
  const used = new Set<string>(), strengths: ReportLine[] = [], weaknesses: ReportLine[] = [];
  const add = (d: Desc, value: number, side: 'good' | 'bad') => {
    const list = side === 'good' ? strengths : weaknesses, t = d[side];
    if (!t || used.has(d.group) || list.length >= 3) return;
    used.add(d.group);
    list.push({ key: d.key, title: t[0].replace('{pos}', pos), why: t[1], value: Math.round(value * 100) / 100 });
  };
  for (const { d, value } of [...scored].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))) add(d, value, value >= 0 ? 'good' : 'bad');
  // not three on a side (a very even player): the closest ones fill it
  for (const { d, value } of [...scored].sort((a, b) => b.value - a.value)) add(d, value, 'good');
  for (const { d, value } of [...scored].sort((a, b) => a.value - b.value)) add(d, value, 'bad');
  strengths.sort((a, b) => b.value - a.value); weaknesses.sort((a, b) => a.value - b.value);
  return { strengths, weaknesses };
}
