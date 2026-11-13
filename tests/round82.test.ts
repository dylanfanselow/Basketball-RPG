import { describe, it, expect } from 'vitest';
import { createCareer, draftWeek, haleCalls, storyKeyGame } from '../src/career/career';
import { dateOf, dateLabel, storyDay, skipTo, stageDay, HALE_CALL_DAYS } from '../src/career/calendar';
import { defaultAppearance } from '../src/render/appearance';
import { newStory } from '../src/sim/story';
import { TEAMS } from '../src/sim/data';

function career(seed = 42) {
  const c = createCareer({ firstName: 'Dee', lastName: 'Jones', number: 8, pos: 'PG', heightIn: 76, appearance: defaultAppearance() });
  let s = seed; c.story = newStory(c, () => ((s = (s * 16807) % 2147483647) / 2147483647));
  return c;
}

describe('round 82 / 83: the story calendar', () => {
  it('the story dates fall on the owner\'s days (round 83: seasons)', () => {
    expect(dateLabel(storyDay('final'))).toBe('Winter 28');
    expect(dateOf(storyDay('final')).wd).toBe(6); // a Sunday
    expect(dateLabel(storyDay('letter'))).toBe('Spring 1'); // a day after the final
    expect(dateLabel(storyDay('agent'))).toBe('Spring 2');
    expect(dateLabel(storyDay('draft'))).toBe('Spring 28'); // the night the playoffs end
    expect(storyDay('letter') - storyDay('final')).toBe(1);
    expect(storyDay('agent') - storyDay('letter')).toBe(1);
  });
  it('skipTo only moves forward; dev jumps land on the stage date', () => {
    const c = career();
    skipTo(c, 'final'); expect(c.life.day).toBe(storyDay('final'));
    c.life.day = storyDay('draft'); skipTo(c, 'agent'); expect(c.life.day).toBe(storyDay('draft'));
    expect(stageDay('bus')).toBe(storyDay('final'));
    expect(stageDay('letter')).toBe(storyDay('letter'));
    expect(stageDay('agentGarage')).toBe(storyDay('agent'));
    expect(stageDay('done')).toBeNull();
  });
  it('the combine 7 days after the meeting, the scrimmage, the draft on Spring 28; Hale calls the last 4 mornings', () => {
    const c = career(), d = storyDay('agent');
    c.life.day = d; c.story!.stage = 'draftWeek';
    c.story!.draft = draftWeek(d, storyDay('draft'));
    expect(dateLabel(c.story!.draft.combine1)).toBe('Spring 9');
    expect(dateLabel(c.story!.draft.combine2)).toBe('Spring 10');
    expect(dateLabel(c.story!.draft.scrimmage)).toBe('Spring 12');
    expect(dateLabel(c.story!.draft.draft - HALE_CALL_DAYS)).toBe('Spring 24');
    c.life.day = storyDay('draft') - HALE_CALL_DAYS; expect(storyKeyGame(c)).toEqual({ when: '4 DAYS', what: 'The draft' });
  });
  it('Hale calls four mornings about four different real teams, the same every time', () => {
    const c = career(), calls = haleCalls(c);
    expect(calls.length).toBe(HALE_CALL_DAYS);
    expect(new Set(calls.map((k) => k.team)).size).toBe(4);
    for (const k of calls) expect(TEAMS.some((t) => t.city === k.team)).toBe(true);
    expect(haleCalls(c)).toEqual(calls);
    expect(calls[0].lines[0].text).toContain('Dee');
  });
});
