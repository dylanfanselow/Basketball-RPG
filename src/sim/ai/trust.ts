import { clamp, clamp01 } from '../math';

/**
 * Teammate trust is how the ball finds you. Calling for the ball is only a request.
 * A rookie with low trust who is covered almost never gets it.
 */
export interface TrustState { team: number; coach: number }

export const TRUST_DELTAS = {
  playExec: { team: 1.2, coach: 1.0 },
  playMiss: { team: -0.6, coach: -1.2 },
  goodShot: { team: 0.8, coach: 0.4 },
  madeShot: { team: 1.0, coach: 0.6 },
  badShot: { team: -3.0, coach: -2.5 },
  assist: { team: 2.5, coach: 1.0 },
  turnover: { team: -3.0, coach: -2.0 },
  stop: { team: 1.5, coach: 2.0 },
  screen: { team: 1.2, coach: 0.6 },
  offReb: { team: 1.5, coach: 1.0 },
  leftMan: { team: -1.0, coach: -1.5 },
} as const;
export type TrustReason = keyof typeof TRUST_DELTAS;

export function applyTrust(t: TrustState, reason: TrustReason, mult = 1) {
  const d = TRUST_DELTAS[reason];
  t.team = clamp(t.team + d.team * mult, 0, 100);
  t.coach = clamp(t.coach + d.coach * mult, 0, 100);
}

/** Multiplies how attractive passing to the user is for an AI ball handler. */
export const passFactor = (trust: number) => 0.1 + 0.9 * Math.pow(clamp01(trust / 100), 1.3);

/** Extra pass utility when the user is calling for the ball. Only works when they're actually open. */
export const callBonus = (trust: number, openness: number) => (openness > 0.55 ? 0.4 * clamp01(trust / 100) * openness : 0);

/** Probability-style helper used by tests and the dev panel readout. */
export function passProbability(trust: number, openness: number, calling: boolean, otherBest = 0.9): number {
  const ev = 1.0 * (0.6 + 0.6 * openness);
  const val = ev * passFactor(trust) + (calling ? callBonus(trust, openness) : 0);
  // softmax-ish vs the handler's next best option
  const a = Math.exp(val * 4), b = Math.exp(otherBest * 4);
  return a / (a + b);
}
