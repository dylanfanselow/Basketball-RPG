/**
 * Round 86 (owner): the draft class. Sixty prospects, one per pick: the average drafted player has 281 points over the
 * five core stats, spread by draft position like a binomial (pick 1 about 315, pick 60 about 248), each with a small
 * random modifier and a random spread over the stats. Two of them are the projected first and second picks before you
 * show up, at the positions you don't play (you a guard: a forward and a center; a forward: a center and a guard; a
 * center: a guard and a forward), with a slight boost on top.
 * Phaser-free, no state.ts; deterministic per story (its seed).
 */
import { CORE_STATS, CoreStats, CoreStat } from '../sim/data';
import type { Position } from '../sim/attributes';
import { STARTER_CORE, HEIGHT_RANGE } from './career';
import type { StoryState } from './career';
import { FIRST_NAMES, LAST_NAMES, MORE_FIRST, MORE_LAST } from './names';
import { randomAppearance, Appearance } from '../render/appearance';

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
/**
 * The projected top two's positions: the two you don't play (owner), round 87: #1 is the smaller one (a SG or a SF),
 * #2 the biggest position allowed (a C, or a PF when you're the center). You a guard: #1 SF, #2 C; a forward: #1 SG,
 * #2 C; a center: #1 SG, #2 PF.
 */
export function topTwoPositions(you: Position): [Position, Position] {
  if (isG(you)) return ['SF', 'C'];
  if (isF(you)) return ['SG', 'C'];
  return ['SG', 'PF'];
}
/**
 * Round 87 (owner): where the top two's extra boost goes. #1 (the smooth one, really a snake) shooting, finishing,
 * playmaking; #2 (the athletic freak) mobility and strength. Each also leans his spread toward them (`LEAN` points
 * moved from the others).
 */
export const TOP_SIGNATURE: [CoreStat[], CoreStat[]] = [['shooting', 'finishing', 'playmaking'], ['mobility', 'strength']];
export const LEAN = 8;
/** Lean a spread toward `sig` (points moved from the other stats), then add `boost` split over `sig`; 25..99. */
export function signature(core: CoreStats, sig: CoreStat[], boost: number): CoreStats {
  const out = { ...core }, rest = CORE_STATS.filter((k) => !sig.includes(k));
  for (const k of rest) { const m = Math.min(LEAN / rest.length * sig.length, out[k] - 25); out[k] -= m; const share = m / sig.length; for (const g of sig) out[g] += share; }
  sig.forEach((k, i) => { out[k] += Math.floor(boost / sig.length) + (i < boost % sig.length ? 1 : 0); });
  for (const k of CORE_STATS) out[k] = Math.max(25, Math.min(99, Math.round(out[k])));
  return out;
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
  const top = topTwoPositions(you);
  const firsts = [...FIRST_NAMES, ...MORE_FIRST], lasts = [...LAST_NAMES, ...MORE_LAST], used = new Set<string>();
  const out: Prospect[] = totals.map((t0, i) => {
    let total = Math.round(t0 + jit[i] - jm);
    const pos = i < 2 ? top[i] : POS_MIX[Math.floor(rnd() * POS_MIX.length) % POS_MIX.length];
    let name = '';
    for (let k = 0; k < 20 && (!name || used.has(name)); k++) name = `${firsts[Math.floor(rnd() * firsts.length) % firsts.length]} ${lasts[Math.floor(rnd() * lasts.length) % lasts.length]}`;
    used.add(name);
    const [lo, hi] = HEIGHT_RANGE[pos];
    // the projected top two: a slight boost on top, in their signature stats (owner); #2 is tall (his position's top)
    const core = i < 2 ? signature(spreadStats(pos, total, rnd), TOP_SIGNATURE[i], TOP_BOOST) : spreadStats(pos, total, rnd);
    const heightIn = i === 1 ? hi : lo + Math.floor(rnd() * (hi - lo + 1));
    return { id: `P${i + 1}`, name, pos, heightIn, core, total, value: total, proj: i + 1, look: Math.floor(rnd() * 1e9) };
  });
  // the core sums are the totals; the value is what the teams see (the total, with a little noise past the top two)
  out.forEach((p, i) => { p.total = CORE_STATS.reduce((s, k) => s + p.core[k], 0); p.value = i < 2 ? p.total : p.total + (rnd() * 2 - 1) * 2; });
  // round 87: the story's pair always goes in order (#1 the snake, #2 the freak)
  out[0].value = Math.max(out[0].value, out[1].value + 1);
  for (const p of out.slice(2)) p.value = Math.min(p.value, out[1].value - 1);
  out.sort((a, b) => b.value - a.value).forEach((p, i) => { p.proj = i + 1; });
  return out;
}
/** Round 87: the projected #1 and #2 (the story's pair). */
export function topTwo(st: Pick<StoryState, 'squadSeed'> | undefined, you: Position): { first: Prospect; second: Prospect } {
  const k = draftClass(st, you);
  return { first: k.find((p) => p.id === 'P1')!, second: k.find((p) => p.id === 'P2')! };
}
/** The class's mean total (the test checks it's 281 before the top two's boost). */
export const classMean = (c: Prospect[]) => c.reduce((s, p) => s + p.total, 0) / c.length;

/** Round 87: a prospect's face, hair and skin (the same in the combine room and in the scrimmage). */
export function prospectLook(p: Prospect): Appearance {
  let seed = (p.look % 2147483646) + 1;
  return randomAppearance(() => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; });
}
