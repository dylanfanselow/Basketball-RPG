import { CORE_STATS, CoreStats } from './data';
import { clamp } from './math';

/**
 * Round 51: rhythm. Every player builds it with points and assists (and, less, with stops); a scoring method you've
 * already used tonight gives less each time, and mistakes cost rhythm. Three notches (25 / 50 / 75) each add a base
 * boost to every stat — bigger for the lower stats. A full meter (100) powers the ultimate, once a game; using it
 * drops the meter back to the third notch. No fade over time. Pure (no Phaser, no state.ts).
 */
export const NOTCHES = [25, 50, 75] as const;
export const RHYTHM_MAX = 100;
/** After an ultimate the meter drops to the 3rd notch (its boosts stay). */
export const AFTER_ULT = 75;
/** Points × this, before the repeat decay and the game-length scale. */
export const POINT_GAIN = 2.6;
/** Each earlier bucket with the same method multiplies the next one's rhythm by this. */
export const REPEAT_DECAY = 0.6;
export const RHYTHM_GAIN = { assist: 4, steal: 3, block: 3, charge: 4, pickup: 2, stop: 1 } as const;
export const RHYTHM_LOSS = { playMiss: 6, posterized: 10, turnover: 6, leftMan: 6, ankles: 5, badShot: 4, blocked: 3 } as const;
export type RhythmGain = keyof typeof RHYTHM_GAIN;
export type RhythmLoss = keyof typeof RHYTHM_LOSS;
/**
 * Quarter length (s) the gains are tuned for; longer quarters scale gains down so a strong night still fills the
 * meter around the 4th quarter (calibrated with scripts/scoring.test.ts).
 */
export const REF_Q = 300;
export const gainScale = (quarterLen: number) => clamp(REF_Q / Math.max(30, quarterLen), 0.25, 6);

/** Which notch (0-3) a rhythm value has passed. */
export const notchOf = (r: number) => NOTCHES.filter((n) => r >= n).length;

/** How a basket was created (for the "same method again" decay), e.g. `mid|stepback`, `three|catch`, `layup|drive`. */
export function methodKey(type: string, conds: Set<string>, ctx: { stepback?: boolean; transition?: boolean } = {}): string {
  const how = type === 'alleyOop' || type === 'alleyOopLayup' ? 'lob'
    : conds.has('post') ? 'post'
    : ctx.transition ? 'transition'
    : ctx.stepback ? 'stepback'
    : conds.has('catchShoot') ? 'catch'
    : conds.has('drive') ? 'drive'
    : conds.has('pullUp') ? 'dribble'
    : 'set';
  return `${type}|${how}`;
}
/** Rhythm for a basket worth `pts` with a method already used `times` times tonight (before the game-length scale). */
export const scoreGain = (pts: number, times: number) => pts * POINT_GAIN * REPEAT_DECAY ** times;
/** Readable method name for HUD pops ("mid · step-back"). */
export function methodLabel(key: string): string {
  const [type, how] = key.split('|');
  const T: Record<string, string> = { mid: 'mid', three: '3', deep3: 'deep 3', fade: 'fade', floater: 'floater', hook: 'hook', layup: 'layup', dunk: 'dunk', euro: 'euro', push: 'push', alleyOop: 'oop', alleyOopLayup: 'oop', stepThrough: 'step-through', stepThroughJumper: 'step-through', jelly: 'jelly' };
  const H: Record<string, string> = { lob: '', post: 'post', transition: 'break', stepback: 'step-back', catch: 'catch', drive: 'drive', dribble: 'off dribble', set: '' };
  return [T[type] ?? type, H[how]].filter(Boolean).join(' · ');
}

/**
 * The stat boost for a notch: each core stat gets notch × 2 × clamp((90 − stat) / 30, 0.5, 2) — a 40 gets ~+3.3 a
 * notch, a 90 gets +1.
 */
export function rhythmBoost(core: CoreStats, notch: number): Partial<CoreStats> {
  const out: Partial<CoreStats> = {};
  if (notch <= 0) return out;
  for (const s of CORE_STATS) out[s] = Math.round(notch * 2 * clamp((90 - core[s]) / 30, 0.5, 2) * 10) / 10;
  return out;
}
