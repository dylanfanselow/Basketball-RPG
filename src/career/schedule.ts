/**
 * Round 83 (owner): the NBA season. You face every other team once (29 games) across Fall and Winter. About half are
 * key games you play; the rest stay on the calendar and resolve on their own when their day passes. Key games are
 * picked by tiers of team quality, the same number from each tier. Phaser-free; doesn't import career.ts (no cycle).
 */
import { TEAMS, CORE_STATS } from '../sim/data';
import { Rng } from '../sim/math';
import { REAL_ROSTERS } from './roster';

/** The tiers of team quality, best first. */
export const TIERS = ['Contender', 'Playoff', 'Lottery'] as const;
export type Tier = typeof TIERS[number];
/** Key games per tier (3 x 5 = 15 key games, 14 off-screen). */
export const KEY_PER_TIER = 5;
/** Round 36: each team's rivals (a rival in a tier is picked as a key game first). */
export const RIVALS: Record<string, string[]> = {
  LAL: ['BOS', 'LAC', 'GSW'], BOS: ['LAL', 'NYK', 'PHI'], NYK: ['BKN', 'BOS', 'MIA'], BKN: ['NYK'], LAC: ['LAL'],
  GSW: ['LAL', 'CLE'], CLE: ['GSW'], MIA: ['NYK', 'BOS'], PHI: ['BOS'], CHI: ['DET'], DET: ['CHI'], DAL: ['HOU', 'SAS'],
  HOU: ['DAL', 'SAS'], SAS: ['DAL', 'HOU'], OKC: ['DEN'], DEN: ['OKC'],
};

/** A team's strength: the average rating of its best 8 players (real rosters). */
export function teamStrength(id: string): number {
  const ps = (REAL_ROSTERS[id] ?? []).map((p) => CORE_STATS.reduce((s, k) => s + p.core[k], 0) / CORE_STATS.length).sort((a, b) => b - a).slice(0, 8);
  return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 65;
}

/** Every opponent of `teamId` with its tier: ranked by strength, the top 10 Contenders, the next 10 Playoff, the rest Lottery. */
export function opponentTiers(teamId: string): { id: string; tier: Tier }[] {
  const opps = TEAMS.filter((t) => t.id !== teamId).map((t) => ({ id: t.id, s: teamStrength(t.id) })).sort((a, b) => b.s - a.s || a.id.localeCompare(b.id));
  const per = Math.ceil(opps.length / TIERS.length);
  return opps.map((o, i) => ({ id: o.id, tier: TIERS[Math.min(TIERS.length - 1, Math.floor(i / per))] }));
}

export interface SimResult { won: boolean; us: number; them: number }
/** The NBA season on a career. `results[i]` is set once game i is played (key) or resolved (off-screen). */
export interface SeasonState {
  gameNo: number; wins: number; losses: number; schedule: string[];
  key?: boolean[]; tier?: Tier[]; start?: number; results?: (SimResult | null)[];
}

/** A year is 112 days (four 28-day seasons, see calendar.ts); Fall 1 of year y is day (y - 1) * 112 + 1. */
const YEAR = 112;
/** The first Fall 1 on or after `day`. */
export const nextFall = (day: number) => Math.ceil((Math.max(1, day) - 1) / YEAR) * YEAR + 1;
/** Your rookie NBA season (after the prologue year's draft): Year 2, Fall 1. */
export const ROOKIE_SEASON_START = YEAR + 1;

/** The NBA season fills Fall and Winter: 56 days, so the last game is on day start + 55. */
const SPAN = 55;
/** The career day of game i. Older schedules (no `start`): every other day from day 2. */
export function gameDayOf(s: Pick<SeasonState, 'start' | 'schedule'>, i: number): number {
  if (s.start === undefined) return 2 + 2 * i;
  const n = Math.max(1, s.schedule.length - 1);
  return s.start + Math.round((i * SPAN) / n);
}

/**
 * A season for `teamId` starting on career day `start`: every other team once; 5 key games per tier (rivals first,
 * the rest seeded); key and off-screen games alternate, a key game first (the opener) and last (the finale).
 */
export function buildSeason(teamId: string, start: number, seed = 1): SeasonState {
  const rng = new Rng(seed >>> 0 || 1);
  const shuffle = <T>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const rivals = RIVALS[teamId] ?? [];
  const keys: { id: string; tier: Tier }[] = [], rest: { id: string; tier: Tier }[] = [];
  for (const tier of TIERS) {
    const inTier = shuffle(opponentTiers(teamId).filter((o) => o.tier === tier));
    inTier.sort((a, b) => Number(rivals.includes(b.id)) - Number(rivals.includes(a.id))); // rivals first (stable)
    keys.push(...inTier.slice(0, KEY_PER_TIER)); rest.push(...inTier.slice(KEY_PER_TIER));
  }
  shuffle(keys); shuffle(rest);
  const order: { id: string; tier: Tier; key: boolean }[] = [];
  for (let i = 0; i < keys.length || i < rest.length; i++) {
    if (i < keys.length) order.push({ ...keys[i], key: true });
    if (i < rest.length) order.push({ ...rest[i], key: false });
  }
  // the alternation ends on an off-screen game when there are fewer of them; make sure a key game closes the season
  if (!order[order.length - 1].key) { let k = order.length - 1; while (k > 0 && !order[k].key) k--; order.push(order.splice(k, 1)[0]); }
  return {
    gameNo: 0, wins: 0, losses: 0, start,
    schedule: order.map((o) => o.id), key: order.map((o) => o.key), tier: order.map((o) => o.tier), results: order.map(() => null),
  };
}

/** An off-screen game's result: the win chance from the strength gap, a plausible score. Deterministic per seed. */
export function simResult(myId: string, oppId: string, seed: number): SimResult {
  const rng = new Rng(seed >>> 0 || 7);
  const gap = teamStrength(myId) - teamStrength(oppId);
  const won = rng.next() < 1 / (1 + Math.exp(-gap / 2));
  const base = 100 + Math.round(rng.next() * 18), margin = 1 + Math.round(rng.next() * 15);
  return won ? { won, us: base + margin, them: base } : { won, us: base, them: base + margin };
}

/** The index of the next key game still to play (or the schedule length when they're all played). */
export function nextKeyIndex(s: SeasonState): number {
  for (let i = 0; i < s.schedule.length; i++) if ((s.key?.[i] ?? true) && !s.results?.[i]) return i;
  return s.schedule.length;
}

/** Resolve every off-screen game whose day has passed (before `today`); updates the record. Returns how many. */
export function settleSeason(s: SeasonState, teamId: string, today: number): number {
  if (!s.key || !s.results) return 0;
  let n = 0;
  s.schedule.forEach((opp, i) => {
    if (s.key![i] || s.results![i] || gameDayOf(s, i) >= today) return;
    const r = simResult(teamId, opp, (s.start ?? 0) * 131 + i * 7919 + opp.charCodeAt(0));
    s.results![i] = r; if (r.won) s.wins++; else s.losses++; n++;
  });
  return n;
}
