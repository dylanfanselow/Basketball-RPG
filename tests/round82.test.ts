import { describe, it, expect } from 'vitest';
import { createCareer, draftWeek, storyKeyGame } from '../src/career/career';
import { dateOf, dateLabel, storyDay, skipTo, stageDay } from '../src/career/calendar';
import { defaultAppearance } from '../src/render/appearance';
import { newStory } from '../src/sim/story';

function career(seed = 42) {
  const c = createCareer({ firstName: 'Dee', lastName: 'Jones', number: 8, pos: 'PG', heightIn: 76, appearance: defaultAppearance() });
  let s = seed; c.story = newStory(c, () => ((s = (s * 16807) % 2147483647) / 2147483647));
  return c;
}

describe('round 82 / 83 / 84: the story calendar', () => {
  it('the story dates fall on the owner\'s days (round 84: the final Winter 27, the letter Winter 28, the meeting Spring 1)', () => {
    expect(dateLabel(storyDay('final'))).toBe('Winter 27');
    expect(dateOf(storyDay('final')).wd).toBe(5); // a Saturday
    expect(dateLabel(storyDay('letter'))).toBe('Winter 28'); // a day after the final
    expect(dateLabel(storyDay('agent'))).toBe('Spring 1');
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
  it('the combine 7 days after the meeting (Spring 8-9), the scrimmage Spring 11, the draft Spring 28', () => {
    const c = career(), d = storyDay('agent');
    c.life.day = d; c.story!.stage = 'draftWeek';
    c.story!.draft = draftWeek(d, storyDay('draft'));
    expect(dateLabel(c.story!.draft.combine1)).toBe('Spring 8');
    expect(dateLabel(c.story!.draft.combine2)).toBe('Spring 9');
    expect(dateLabel(c.story!.draft.scrimmage)).toBe('Spring 11');
    expect(storyKeyGame(c)).toEqual({ when: '7 DAYS', what: 'The combine' });
  });
});
