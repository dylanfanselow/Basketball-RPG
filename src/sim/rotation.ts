/** Coach trust -> minutes and stints. You start as a deep-bench rookie and earn your way up. */
export interface RotationPlan { minutes: number; starter: boolean; role: string; stints: [number, number][] }

export function minutesFor(coachTrust: number): { minutes: number; role: string } {
  if (coachTrust < 25) return { minutes: 4, role: 'Garbage time' };
  if (coachTrust < 40) return { minutes: 10, role: 'Deep bench' };
  if (coachTrust < 55) return { minutes: 16, role: 'Spot minutes' };
  if (coachTrust < 70) return { minutes: 24, role: 'Rotation' };
  if (coachTrust < 85) return { minutes: 30, role: 'Starter' };
  return { minutes: 35, role: 'Closer' };
}

/** Stints in elapsed game-seconds. quarterLen is the real-time length of a quarter in this game. */
export function planRotation(coachTrust: number, quarterLen: number, forceStarter = false): RotationPlan {
  const m = forceStarter ? { minutes: 48, role: 'Dev: forced starter' } : minutesFor(coachTrust);
  const starter = forceStarter || coachTrust >= 70;
  const frac = Math.min(1, m.minutes / 48);
  const stints: [number, number][] = [];
  for (let q = 0; q < 4; q++) {
    const qs = q * quarterLen;
    if (frac >= 0.999) stints.push([qs, qs + quarterLen]);
    else if (starter) stints.push([qs, qs + frac * quarterLen]);
    else if (m.minutes <= 4) { if (q === 3) stints.push([qs + quarterLen * (1 - frac * 4), qs + quarterLen]); }
    else { const start = Math.min(0.3, 1 - frac); stints.push([qs + start * quarterLen, qs + (start + frac) * quarterLen]); }
  }
  return { minutes: m.minutes, starter, role: m.role, stints };
}

export const shouldBeOn = (plan: RotationPlan, elapsed: number) => plan.stints.some(([a, b]) => elapsed >= a && elapsed < b);
