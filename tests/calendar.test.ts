import { describe, it, expect } from 'vitest';
import { dateOfDay, dayOfDate, monthGrid, keyGamesByDay, seasonMonths } from '../src/career/calendar';
import { newCareer, gameDay, isKeyGame } from '../src/career/career';

describe('season calendar (round 46)', () => {
  it('day 1 is Monday 19 Oct 2026 and the opener is Tuesday the 20th', () => {
    expect(dateOfDay(1)).toEqual({ y: 2026, m: 9, d: 19, wd: 0 });
    expect(dateOfDay(gameDay(0))).toEqual({ y: 2026, m: 9, d: 20, wd: 1 });
  });

  it('dates and days round-trip, across months and the new year', () => {
    for (const n of [1, 13, 14, 44, 74, 75, 200]) { const t = dateOfDay(n); expect(dayOfDate(t.y, t.m, t.d)).toBe(n); }
    expect(dateOfDay(75)).toMatchObject({ y: 2027, m: 0, d: 1 });
  });

  it('month grids start on Monday and pad outside the month', () => {
    const oct = monthGrid(2026, 9); // 1 Oct 2026 is a Thursday
    expect(oct.length).toBe(5);
    expect(oct[0].slice(0, 3)).toEqual([null, null, null]);
    expect(oct[0][3]).toEqual({ d: 1, day: dayOfDate(2026, 9, 1) });
    expect(oct.flat().filter(Boolean).length).toBe(31);
    expect(oct.flat().find((c) => c?.d === 19)!.day).toBe(1);
    const feb = monthGrid(2027, 1); // 1 Feb 2027 is a Monday: exactly 4 rows
    expect(feb.length).toBe(4);
    expect(feb[0][0]).toMatchObject({ d: 1 });
    for (const w of [...oct, ...feb]) expect(w.length).toBe(7);
  });

  it('key games sit on their game days; regular games are left off', () => {
    const c = newCareer('T', 'SG', 'LAL');
    const kg = keyGamesByDay(c);
    expect(kg.get(gameDay(0))?.why).toBe('Opener');
    c.season.schedule.forEach((_, i) => expect(kg.has(gameDay(i))).toBe(!!isKeyGame(c, i)));
    expect(seasonMonths(c)[0]).toEqual([2026, 9]);
  });
});
