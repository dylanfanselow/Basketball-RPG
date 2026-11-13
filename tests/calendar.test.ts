import { describe, it, expect } from 'vitest';
import { dateOf, dayOf, dateLabel, longDate, seasonGrid, pageRange, keyGamesByDay, seasonPages, YEAR_DAYS } from '../src/career/calendar';
import { newCareer, gameDay, isKeyGame } from '../src/career/career';

describe('season calendar (round 46; round 83: Stardew-style seasons)', () => {
  it('day 1 is Fall 1 of Year 1, a Monday; every season is 28 days and starts on a Monday', () => {
    expect(dateOf(1)).toEqual({ year: 1, season: 0, d: 1, wd: 0 });
    expect(dateOf(2)).toEqual({ year: 1, season: 0, d: 2, wd: 1 });
    expect(dateOf(29)).toEqual({ year: 1, season: 1, d: 1, wd: 0 });
    expect(dateOf(YEAR_DAYS + 1)).toEqual({ year: 2, season: 0, d: 1, wd: 0 });
    expect(dateLabel(57)).toBe('Spring 1');
    expect(longDate(YEAR_DAYS)).toBe('Summer 28, Year 1');
  });

  it('dates and days round-trip, across seasons and years', () => {
    for (const n of [1, 13, 28, 29, 56, 84, 85, 112, 113, 300]) { const t = dateOf(n); expect(dayOf(t.year, t.season, t.d)).toBe(n); }
  });

  it('a season page is always 4 full weeks, Monday first', () => {
    const g = seasonGrid(1, 2);
    expect(g.length).toBe(4);
    for (const w of g) expect(w.length).toBe(7);
    expect(g[0][0]).toEqual({ d: 1, day: dayOf(1, 2, 1) });
    expect(g[3][6]).toEqual({ d: 28, day: dayOf(1, 2, 28) });
    expect(pageRange([[2, 1], [1, 3]])).toEqual([[1, 3], [2, 0], [2, 1]]);
  });

  it('key games sit on their game days; the NBA season is Fall and Winter of Year 2', () => {
    const c = newCareer('T', 'SG', 'LAL');
    const kg = keyGamesByDay(c);
    expect(kg.get(gameDay(c, 0))?.why).toBe('Opener');
    c.season.schedule.forEach((_, i) => expect(kg.has(gameDay(c, i))).toBe(!!isKeyGame(c, i)));
    expect(seasonPages(c)).toEqual([[2, 0], [2, 1]]);
    expect(dateLabel(gameDay(c, 0))).toBe('Fall 1');
    expect(dateLabel(gameDay(c, c.season.schedule.length - 1))).toBe('Winter 28');
  });
});
