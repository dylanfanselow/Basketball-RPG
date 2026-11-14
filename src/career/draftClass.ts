/**
 * Round 86 (owner): the draft class. Sixty prospects, one per pick: the average drafted player has 281 points over the
 * five core stats, spread by draft position like a binomial (pick 1 about 315, pick 60 about 248), each with a small
 * random modifier and a random spread over the stats. Two of them are the projected first and second picks before you
 * show up, at the positions you don't play (you a guard: a forward and a center; a forward: a center and a guard; a
 * center: a guard and a forward), with a slight boost on top.
 * Phaser-free, no state.ts; deterministic per story (its seed).
 */
import { CORE_STATS, CoreStats } from '../sim/data';
import type { Position } from '../sim/attributes';
import { STARTER_CORE, HEIGHT_RANGE } from './career';
import type { StoryState } from './career';
import { FIRST_NAMES, LAST_NAMES, MORE_FIRST, MORE_LAST } from './names';

/** The story's seeded random (stable for a given story). */
export function storyRng(st: Pick<StoryState, 'squadSeed'> | undefined, salt: number): () => number {
  let s = (((st?.squadSeed ?? 12345) ^ salt) >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export interface Prospect {
  id: string; name: string; pos: Position; heightIn: number;
  core: CoreStats; total: number;
  /** what the teams think he's worth (the total plus a little scouting noise): the draft takes the best available */
  value: number;
  /** the class's projected pick (1 = first) */
  proj: number;
  /** a seed for his look */
  look: number;
}

export const CLASS_SIZE = 60;
/** Round 86 (owner): the average drafted player's five stats add up to this. */
export const CLASS_MEAN = 281;
/** The binomial: 281 + STEP x (Binomial(N, 1/2) - N/2), sd = STEP x sqrt(N) / 2 = 15. */
export const CLASS_N = 100, CLASS_STEP = 3;
/** The small random modifier on each total (±), and the projected top two's extra boost. */
export const CLASS_JITTER = 4, TOP_BOOST = 8;
/** Each stat's random wobble (±) before it's renormalised to the total. */
export const SPREAD_JITTER = 6;

const isG = (p: Position) => p === 'PG' || p === 'SG';
const isF = (p: Position) => p === 'SF' || p === 'PF';
/** The projected top two's positions: the two you don't play (owner). */
export function topTwoPositions(you: Position, rnd: () => number): [Position, Position] {
  const g: Position = rnd() < 0.5 ? 'PG' : 'SG', f: Position = rnd() < 0.5 ? 'SF' : 'PF';
  if (isG(you)) return rnd() < 0.5 ? [f, 'C'] : ['C', f];
  if (isF(you)) return rnd() < 0.5 ? ['C', g] : [g, 'C'];
  return rnd() < 0.5 ? [g, f] : [f, g];
}

/** A total spread over the five stats: the position's shape, a random wobble, back to the total, 25..99. */
export function spreadStats(pos: Position, total: number, rnd: () => number): CoreStats {
  const shape = STARTER_CORE[pos], base = CORE_STATS.reduce((s, k) => s + shape[k], 0);
  const raw = CORE_STATS.map((k) => Math.max(1, shape[k] * (total / base) + (rnd() * 2 - 1) * SPREAD_JITTER));
  const sum = raw.reduce((a, b) => a + b, 0);
  const out = Object.fromEntries(CORE_STATS.map((k, i) => [k, Math.max(25, Math.min(99, Math.round((raw[i] * total) / sum)))])) as CoreStats;
  // rounding / clamping can leave it a point or two off: put the difference on the stats with room
  let diff = total - CORE_STATS.reduce((s, k) => s + out[k], 0);
  for (let i = 0; diff !== 0 && i < 50; i++) {
    const k = CORE_STATS[i % CORE_STATS.length], v = out[k] + Math.sign(diff);
    if (v >= 25 && v <= 99) { out[k] = v; diff -= Math.sign(diff); }
  }
  return out;
}

const POS_MIX: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

/** The class (pick order = projection): deterministic per story and your position. */
export function draftClass(st: Pick<StoryState, 'squadSeed'> | undefined, you: Position): Prospect[] {
  const rnd = storyRng(st, 0xd2af7c);
  // the binomial totals, re-centred so the class averages exactly 281, high to low
  const draws = Array.from({ length: CLASS_SIZE }, () => { let k = 0; for (let i = 0; i < CLASS_N; i++) if (rnd() < 0.5) k++; return CLASS_MEAN + CLASS_STEP * (k - CLASS_N / 2); });
  const mean = draws.reduce((a, b) => a + b, 0) / CLASS_SIZE;
  const totals = draws.map((t) => t - mean + CLASS_MEAN).sort((a, b) => b - a);
  // the small random modifier, zero-sum so the mean stays put
  const jit = totals.map(() => (rnd() * 2 - 1) * CLASS_JITTER), jm = jit.reduce((a, b) => a + b, 0) / CLASS_SIZE;
  const top = topTwoPositions(you, rnd);
  const firsts = [...FIRST_NAMES, ...MORE_FIRST], lasts = [...LAST_NAMES, ...MORE_LAST], used = new Set<string>();
  const out: Prospect[] = totals.map((t0, i) => {
    let total = Math.round(t0 + jit[i] - jm);
    const pos = i < 2 ? top[i] : POS_MIX[Math.floor(rnd() * POS_MIX.length) % POS_MIX.length];
    if (i < 2) total += TOP_BOOST; // the projected top two: a slight boost on top (owner)
    let name = '';
    for (let k = 0; k < 20 && (!name || used.has(name)); k++) name = `${firsts[Math.floor(rnd() * firsts.length) % firsts.length]} ${lasts[Math.floor(rnd() * lasts.length) % lasts.length]}`;
    used.add(name);
    const [lo, hi] = HEIGHT_RANGE[pos];
    return { id: `P${i + 1}`, name, pos, heightIn: lo + Math.floor(rnd() * (hi - lo + 1)), core: spreadStats(pos, total, rnd), total, value: total, proj: i + 1, look: Math.floor(rnd() * 1e9) };
  });
  // the core sums are the totals; the value is what the teams see (the total, with a little noise past the top two)
  out.forEach((p, i) => { p.total = CORE_STATS.reduce((s, k) => s + p.core[k], 0); p.value = i < 2 ? p.total : p.total + (rnd() * 2 - 1) * 2; });
  out.sort((a, b) => b.value - a.value).forEach((p, i) => { p.proj = i + 1; });
  return out;
}
/** The class's mean total (the test checks it's 281 before the top two's boost). */
export const classMean = (c: Prospect[]) => c.reduce((s, p) => s + p.total, 0) / c.length;
