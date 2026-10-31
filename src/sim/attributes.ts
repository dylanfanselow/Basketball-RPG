import { CORE_STATS, CoreStats, STAT_INFLUENCE, SUB_KEYS } from './data';
import { clamp, lerp } from './math';

export type SubRatings = Record<string, number>;

/** Core stats -> gameplay sub-ratings via the data-driven influence matrix. 'base' weight pulls toward 50. */
export function computeSubRatings(core: CoreStats, adds: Record<string, number> = {}): SubRatings {
  const out: SubRatings = {};
  for (const key of SUB_KEYS) {
    const w = STAT_INFLUENCE[key];
    let total = 0, wsum = 0;
    for (const [stat, weight] of Object.entries(w)) {
      total += (stat === 'base' ? 50 : core[stat as keyof CoreStats] ?? 50) * weight;
      wsum += weight;
    }
    out[key] = clamp(total / (wsum || 1) + (adds[key] ?? 0), 0, 99);
  }
  return out;
}

/** 0-99 rating -> multiplier used in the shot equation. 60 = 1.00, 99 = ~1.29, 25 = ~0.74 */
export const statFactor = (r: number) => 0.55 + (r / 100) * 0.75;

/** Map 0-99 rating to [lo, hi]. */
export const rmap = (r: number, lo: number, hi: number) => lerp(lo, hi, clamp(r, 0, 99) / 99);

export const defaultCore = (): CoreStats => Object.fromEntries(CORE_STATS.map((s) => [s, 60])) as CoreStats;

export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
export type Position = (typeof POSITIONS)[number];
export const HEIGHTS: Record<Position, number> = { PG: 6.25, SG: 6.45, SF: 6.7, PF: 6.85, C: 7.0 };
