import { CareerState, isKeyGame, gameDay } from './career';

/**
 * The season calendar (round 46): career days mapped onto real dates. Day 1 is Monday 19 Oct 2026, so the opener
 * (game 0, day 2) falls on Tuesday 20 Oct 2026, the 2026-27 opening night. Dates are UTC so time zones can't shift
 * them. Pure: no Phaser, no `state.ts`.
 */
export const SEASON_DAY1 = Date.UTC(2026, 9, 19);
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
