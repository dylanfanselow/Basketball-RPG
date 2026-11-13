import { CareerState, StoryStage, isKeyGame, gameDay } from './career';

/**
 * The season calendar (round 46): career days mapped onto real dates. Round 82 (owner): everything moved a month
 * later, so day 1 (the prologue's rainy night) is Thursday 19 Nov 2026 and the big game is Friday the 20th. Dates are
 * UTC so time zones can't shift them. Pure: no Phaser, no `state.ts`.
 */
export const SEASON_DAY1 = Date.UTC(2026, 10, 19);
const DAY_MS = 86_400_000;
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** Column headers, Monday first (like the owner's reference calendar). */
export const WEEKDAYS = ['M', 'T', 'W', 'Th', 'F', 'Sa', 'Su'];

export interface CalDate { y: number; m: number; d: number; /** 0 = Monday … 6 = Sunday */ wd: number }

/** The real date of a career day. */
export function dateOfDay(day: number): CalDate {
  const t = new Date(SEASON_DAY1 + (day - 1) * DAY_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), wd: (t.getUTCDay() + 6) % 7 };
}
/** The career day of a real date (month 0-based). */
export const dayOfDate = (y: number, m: number, d: number) => Math.round((Date.UTC(y, m, d) - SEASON_DAY1) / DAY_MS) + 1;
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** A month as weeks of 7 cells (Monday first); cells outside the month are null. 4-6 rows. */
export function monthGrid(y: number, m: number): ({ d: number; day: number } | null)[][] {
  const first = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7, n = daysInMonth(y, m);
  const weeks: ({ d: number; day: number } | null)[][] = [];
  for (let i = 0; i < first + n; i += 7) {
    weeks.push(Array.from({ length: 7 }, (_, k) => {
      const d = i + k - first + 1;
      return d >= 1 && d <= n ? { d, day: dayOfDate(y, m, d) } : null;
    }));
  }
  return weeks;
}

export interface KeyGameDay { index: number; opponent: string; why: string }
/** The season's key games by career day (only key games; regular games aren't on the calendar). */
export function keyGamesByDay(c: CareerState): Map<number, KeyGameDay> {
  const out = new Map<number, KeyGameDay>();
  c.season.schedule.forEach((opponent, i) => {
    const why = isKeyGame(c, i);
    if (why) out.set(gameDay(i), { index: i, opponent, why });
  });
  return out;
}

/** The months the season covers (first day to the last game), as [year, month] pairs. */
export function seasonMonths(c: CareerState): [number, number][] {
  const a = dateOfDay(1), b = dateOfDay(gameDay(Math.max(0, c.season.schedule.length - 1)));
  const out: [number, number][] = [];
  for (let y = a.y, m = a.m; y < b.y || (y === b.y && m <= b.m); m === 11 ? (y++, m = 0) : m++) out.push([y, m]);
  return out;
}

/**
 * Round 82 (owner): the story's fixed dates. The national final is Sunday 28 Feb 2027; a month later the letter comes
 * (Wednesday 31 Mar), so Thursday 1 Apr is your first day at Hale's place; after the April combine and scrimmage the
 * story jumps to June: you're back on Sunday 20 Jun, the draft is Thursday 24 Jun.
 */
export const STORY_DATES = {
  final: [2027, 1, 28], letter: [2027, 2, 31], agent: [2027, 3, 1], june: [2027, 5, 20], draft: [2027, 5, 24],
} as const satisfies Record<string, readonly [number, number, number]>;
export type StoryDate = keyof typeof STORY_DATES;
/** The career day of a story date. */
export const storyDay = (k: StoryDate) => { const [y, m, d] = STORY_DATES[k]; return dayOfDate(y, m, d); };
/** Move today forward to a story date (never back). */
export function skipTo(c: CareerState, k: StoryDate) { c.life.day = Math.max(c.life.day, storyDay(k)); }
/** Round 82: the day a story stage happens on (dev jumps); null = early prologue, left as is. */
export function stageDay(stage: StoryStage): number | null {
  switch (stage) {
    case 'tutorial': case 'ones': case 'night': return 1;
    case 'bigGame': case 'after': return 2;
    case 'kingston': return 3;
    case 'paper': case 'snow': case 'bus': case 'final': case 'homecoming': return storyDay('final');
    case 'letter': return storyDay('letter');
    case 'agent': case 'agentGarage': case 'draftWeek': return storyDay('agent');
    default: return null;
  }
}
/** Every month from the first to the last of `months` (no gaps), sorted. */
export function monthRange(months: [number, number][]): [number, number][] {
  if (!months.length) return [];
  const k = months.map(([y, m]) => y * 12 + m), lo = Math.min(...k), hi = Math.max(...k);
  const out: [number, number][] = [];
  for (let i = lo; i <= hi; i++) out.push([Math.floor(i / 12), i % 12]);
  return out;
}
