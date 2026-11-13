import { describe, it, expect } from 'vitest';
import { createCareer, draftWeek, storyEventsByDay, takeOnDebt, GENERATOR_DEBT, storyKeyGame } from '../src/career/career';
import { defaultAppearance } from '../src/render/appearance';
import { newStory } from '../src/sim/story';

function career() {
  const c = createCareer({ firstName: 'Dee', lastName: 'Jones', number: 8, pos: 'PG', heightIn: 76, appearance: defaultAppearance() });
  let s = 42; c.story = newStory(c, () => ((s = (s * 16807) % 2147483647) / 2147483647));
  return c;
}

describe('round 81: the debt, the draft week', () => {
  it('fixing the generator puts you in debt once', () => {
    const c = career(), before = c.life.money;
    takeOnDebt(c); takeOnDebt(c);
    expect(c.life.money).toBe(before - GENERATOR_DEBT);
    expect(c.life.money).toBeLessThan(0);
    expect(c.story!.debt).toBe(GENERATOR_DEBT);
  });
  it('the draft week: two combine days, a scrimmage, the draft a week out, on the calendar and the HUD card', () => {
    const c = career(); c.life.day = 100;
    c.story!.draft = draftWeek(100);
    const ev = storyEventsByDay(c);
    expect([...ev.values()].map((e) => e.label)).toEqual(['COMBINE', 'COMBINE', 'SCRIMMAGE', 'DRAFT']);
    expect(ev.get(107)?.label).toBe('DRAFT');
    c.story!.stage = 'draftWeek';
    expect(storyKeyGame(c)).toEqual({ when: '7 DAYS', what: 'The draft' });
    c.life.day = 107; expect(storyKeyGame(c)!.when).toBe('TODAY');
  });
});
