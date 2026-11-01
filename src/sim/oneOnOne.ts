import { TEAMS } from './data';
import { GameSim } from './game';
import { generateRoster } from '../career/roster';

/** 1v1 make-it-take-it choices: each side's team + roster index, P2 human/CPU, scoring. */
export interface OneOnOneSetup {
  p1Team: string; p1Idx: number; p2Team: string; p2Idx: number;
  p2Human: boolean; target: number; scoring: '1s2s' | '2s3s'; winBy2: boolean;
}
export const DEFAULT_1V1: OneOnOneSetup = { p1Team: 'LAL', p1Idx: 0, p2Team: 'BOS', p2Idx: 0, p2Human: false, target: 11, scoring: '1s2s', winBy2: true };

/**
 * Build a half-court 1v1 game between the two picked players (P1 = user, P2 = second human or CPU).
 * P2 ids get a suffix when both picks come from the same team so every player id stays unique.
 * p1Human=false makes P1 a CPU too (headless tests).
 */
export function buildOneOnOne(o: OneOnOneSetup, seed: number, p1Human = true): GameSim {
  const t1 = TEAMS.find((t) => t.id === o.p1Team) ?? TEAMS[0];
  const t2 = TEAMS.find((t) => t.id === o.p2Team) ?? TEAMS[1];
  const r1 = generateRoster(t1, 0);
  const r2 = generateRoster(t2, 1);
  if (t1.id === t2.id) for (const p of r2) p.id += '-p2';
  const p1 = r1[Math.max(0, Math.min(o.p1Idx, r1.length - 1))];
  const p2 = r2[Math.max(0, Math.min(o.p2Idx, r2.length - 1))];
  const first = <T>(r: T[], p: T) => [p, ...r.filter((q) => q !== p)];
  return new GameSim({
    mode: 'practice',
    quarterLen: 180,
    seed,
    teams: [t1, t2],
    rosters: [first(r1, p1), first(r2, p2)],
    userId: p1Human ? p1.id : null,
    user2Id: o.p2Human ? p2.id : undefined,
    trust: { team: 60, coach: 60 },
    ult: { unlocked: false, id: null, level: 0 }, // no ultimates in 1v1
    featureUser: false,
    oneOnOne: { target: o.target, scoring: o.scoring, winBy2: o.winBy2 },
  });
}
