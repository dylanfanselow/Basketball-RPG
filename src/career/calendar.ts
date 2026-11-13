import { CareerState, StoryStage, isKeyGame, gameDay } from './career';

/**
 * The calendar (round 46; round 83, owner: Stardew-style seasons). A year is four 28-day seasons, Fall, Winter,
 * Spring, Summer (112 days). Day 1 is Fall 1 of Year 1, a Monday, so every season starts on a Monday and is exactly
 * four weeks. The NBA season is Fall + Winter, Spring the playoffs, Summer the offseason. Pure: no Phaser, no
 * `state.ts`.
 */
export const SEASONS = ['Fall', 'Winter', 'Spring', 'Summer'] as const;
export const SEASON_DAYS = 28, YEAR_DAYS = SEASON_DAYS * SEASONS.length;
/** Column headers, Monday first (like the owner's reference calendar). */
export const WEEKDAYS = ['M', 'T', 'W', 'Th', 'F', 'Sa', 'Su'];
export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export interface CalDate { year: number; /** 0 = Fall … 3 = Summer */ season: number; /** 1-28 */ d: number; /** 0 = Monday … 6 = Sunday */ wd: number }

/** The date of a career day. */
export function dateOf(day: number): CalDate {
  const z = Math.max(0, day - 1);
  return { year: Math.floor(z / YEAR_DAYS) + 1, season: Math.floor((z % YEAR_DAYS) / SEASON_DAYS), d: (z % SEASON_DAYS) + 1, wd: z % 7 };
}
/** The career day of a date (year from 1, season 0-3, day 1-28). */
export const dayOf = (year: number, season: number, d: number) => (year - 1) * YEAR_DAYS + season * SEASON_DAYS + d;
/** "Spring 1". */
export const dateLabel = (day: number) => { const t = dateOf(day); return `${SEASONS[t.season]} ${t.d}`; };
/** "Spring 1, Year 1". */
export const longDate = (day: number) => `${dateLabel(day)}, Year ${dateOf(day).year}`;

/** A season page: 4 weeks of 7 days (Monday first). */
export function seasonGrid(year: number, season: number): { d: number; day: number }[][] {
  return Array.from({ length: 4 }, (_, w) => Array.from({ length: 7 }, (_, k) => { const d = w * 7 + k + 1; return { d, day: dayOf(year, season, d) }; }));
}

/** A calendar page: [year, season]. Every page from the first to the last given (no gaps), sorted. */
export function pageRange(pages: [number, number][]): [number, number][] {
  if (!pages.length) return [];
  const k = pages.map(([y, s]) => y * 4 + s), lo = Math.min(...k), hi = Math.max(...k);
  const out: [number, number][] = [];
  for (let i = lo; i <= hi; i++) out.push([Math.floor(i / 4), i % 4]);
  return out;
}
/** The page a day is on. */
export const pageOf = (day: number): [number, number] => { const t = dateOf(day); return [t.year, t.season]; };

export interface KeyGameDay { index: number; opponent: string; why: string }
/** The season's key games by career day. */
export function keyGamesByDay(c: CareerState): Map<number, KeyGameDay> {
  const out = new Map<number, KeyGameDay>();
  c.season.schedule.forEach((opponent, i) => {
    const why = isKeyGame(c, i);
    if (why) out.set(gameDay(c, i), { index: i, opponent, why });
  });
  return out;
}
export interface SimGameDay { index: number; opponent: string; result: { won: boolean; us: number; them: number } | null }
/** Round 83: the off-screen games by career day (on the calendar, you don't play them), with results once played. */
export function simGamesByDay(c: CareerState): Map<number, SimGameDay> {
  const out = new Map<number, SimGameDay>(), s = c.season;
  if (!s.key) return out;
  s.schedule.forEach((opponent, i) => { if (!s.key![i]) out.set(gameDay(c, i), { index: i, opponent, result: s.results?.[i] ?? null }); });
  return out;
}

/** The pages the NBA season covers (first game to the last). */
export function seasonPages(c: CareerState): [number, number][] {
  const n = c.season.schedule.length;
  if (!n) return [];
  return pageRange([pageOf(gameDay(c, 0)), pageOf(gameDay(c, n - 1))]);
}

/**
 * Round 82 / 83 (owner): the story's fixed dates. The national final is the last day of winter (Winter 28); the next
 * morning the letter comes (Spring 1), the meeting is the day after (Spring 2); the combine is 7 days after that,
 * then the scrimmage; the draft is the last day of spring (Spring 28), the night the NBA playoffs end.
 */
export const STORY_DATES = {
  final: [1, 1, 28], letter: [1, 2, 1], agent: [1, 2, 2], draft: [1, 2, 28],
} as const satisfies Record<string, readonly [number, number, number]>;
export type StoryDate = keyof typeof STORY_DATES;
/** The career day of a story date. */
export const storyDay = (k: StoryDate) => { const [y, s, d] = STORY_DATES[k]; return dayOf(y, s, d); };
/** Move today forward to a story date (never back). */
export function skipTo(c: CareerState, k: StoryDate) { c.life.day = Math.max(c.life.day, storyDay(k)); }
/** Round 83: Hale calls about the teams on the last mornings before the draft. */
export const HALE_CALL_DAYS = 4;
/** Round 82: the day a story stage happens on (dev jumps); null = left as is. */
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
