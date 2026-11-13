import { describe, it, expect } from 'vitest';
import { createCareer, draftWeek, juneDue, haleCalls, storyKeyGame } from '../src/career/career';
import { dateOfDay, storyDay, skipTo, stageDay, monthRange } from '../src/career/calendar';
import { defaultAppearance } from '../src/render/appearance';
import { newStory } from '../src/sim/story';
import { TEAMS } from '../src/sim/data';

function career(seed = 42) {
  const c = createCareer({ firstName: 'Dee', lastName: 'Jones', number: 8, pos: 'PG', heightIn: 76, appearance: defaultAppearance() });
  let s = seed; c.story = newStory(c, () => ((s = (s * 16807) % 2147483647) / 2147483647));
  return c;
}

describe('round 82: the story calendar', () => {
  it('the story dates fall on the owner\'s days', () => {
    expect(dateOfDay(storyDay('final'))).toEqual({ y: 2027, m: 1, d: 28, wd: 6 }); // Sunday 28 Feb
    expect(dateOfDay(storyDay('letter'))).toEqual({ y: 2027, m: 2, d: 31, wd: 2 }); // Wednesday 31 Mar
    expect(dateOfDay(storyDay('agent'))).toEqual({ y: 2027, m: 3, d: 1, wd: 3 }); // Thursday 1 Apr
    expect(dateOfDay(storyDay('june'))).toMatchObject({ y: 2027, m: 5, d: 20 });
    expect(dateOfDay(storyDay('draft'))).toEqual({ y: 2027, m: 5, d: 24, wd: 3 }); // Thursday 24 Jun
    expect(storyDay('agent') - storyDay('letter')).toBe(1);
  });
  it('skipTo only moves forward; dev jumps land on the stage date', () => {
    const c = career();
    skipTo(c, 'final'); expect(c.life.day).toBe(storyDay('final'));
    c.life.day = storyDay('june'); skipTo(c, 'agent'); expect(c.life.day).toBe(storyDay('june'));
    expect(stageDay('bus')).toBe(storyDay('final'));
    expect(stageDay('letter')).toBe(storyDay('letter'));
    expect(stageDay('agentGarage')).toBe(storyDay('agent'));
    expect(stageDay('done')).toBeNull();
  });
  it('the combine and scrimmage stay in April, the draft is 24 June; June comes after the scrimmage', () => {
    const c = career(), d = storyDay('agent');
    c.life.day = d; c.story!.stage = 'draftWeek';
    c.story!.draft = draftWeek(d, storyDay('draft'));
    expect(dateOfDay(c.story!.draft.combine1)).toMatchObject({ m: 3, d: 8 });
    expect(dateOfDay(c.story!.draft.scrimmage)).toMatchObject({ m: 3, d: 11 });
    expect(juneDue(c)).toBe(false);
    c.life.day = c.story!.draft.scrimmage; expect(juneDue(c)).toBe(true);
    c.story!.june = true; expect(juneDue(c)).toBe(false);
    c.life.day = storyDay('june'); expect(storyKeyGame(c)).toEqual({ when: '4 DAYS', what: 'The draft' });
  });
  it('Hale calls four mornings about four different real teams, the same every time', () => {
    const c = career(), calls = haleCalls(c);
    expect(calls.length).toBe(4);
    expect(new Set(calls.map((k) => k.team)).size).toBe(4);
    for (const k of calls) expect(TEAMS.some((t) => t.city === k.team)).toBe(true);
    expect(haleCalls(c)).toEqual(calls);
    expect(calls[0].lines[0].text).toContain('Dee');
  });
  it('the calendar months have no gaps', () => {
    expect(monthRange([[2027, 5], [2027, 3]])).toEqual([[2027, 3], [2027, 4], [2027, 5]]);
    expect(monthRange([[2026, 11], [2027, 0]])).toEqual([[2026, 11], [2027, 0]]);
  });
});
