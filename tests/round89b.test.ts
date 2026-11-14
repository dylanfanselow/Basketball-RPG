import { describe, it, expect } from 'vitest';
import { DRAFT_TALK, fillTalk } from '../src/career/draftTalk';
import { mysteryCallDue } from '../src/career/draft';
import { createCareer, draftWeek } from '../src/career/career';
import { storyDay } from '../src/career/calendar';
import { defaultAppearance } from '../src/render/appearance';
import { newStory } from '../src/sim/story';

const EM = String.fromCharCode(0x2014);
function career() {
  const c = createCareer({ firstName: 'Dee', lastName: 'Jones', number: 8, pos: 'SG', heightIn: 77, appearance: defaultAppearance() });
  let s = 42; c.story = newStory(c, () => ((s = (s * 16807) % 2147483647) / 2147483647));
  c.story.stage = 'draftWeek'; c.story.draft = draftWeek(storyDay('agent'), storyDay('draft'));
  return c;
}

describe('round 89b: the lines file, the half line, the mystery call', () => {
  it('every group is there, editable, no em dashes; the removed line is gone and the half line is in', () => {
    const all = JSON.stringify(DRAFT_TALK);
    expect(all.includes(EM)).toBe(false);
    expect(all).not.toContain('Somebody has to be first overall');
    expect(DRAFT_TALK.one.halfDown).toBe('How are we losing? This is getting ridiculous.');
    for (const k of ['niceYou', 'niceHim', 'snakeYou', 'snakeHim', 'snakeThem', 'snakeMiss'] as const) expect(DRAFT_TALK.one[k].length).toBeGreaterThan(0);
    for (const k of ['scores', 'blocks', 'steals', 'youScore'] as const) expect(DRAFT_TALK.two[k].length).toBeGreaterThan(0);
    expect(DRAFT_TALK.combine.some((l) => l.who === 'walk')).toBe(true);
    expect(DRAFT_TALK.mysteryCall.some((l) => l.who === 'voice' && /Give up on basketball/.test(l.text ?? ''))).toBe(true);
    expect(fillTalk('{n1}. First overall, {you}.', { n1: 'Drako Dragić', you: 'Dee' })).toBe('Drako Dragić. First overall, Dee.');
  });
  it('the mystery call comes the day you lose the scrimmage, not after a win, only once', () => {
    const c = career(), st = c.story!;
    c.life.day = st.draft!.scrimmage;
    expect(mysteryCallDue(c)).toBe(false);
    st.scrimmage = { pts: 4, reb: 2, ast: 1, sum: 9, won: true }; expect(mysteryCallDue(c)).toBe(false);
    st.scrimmage = { pts: 4, reb: 2, ast: 1, sum: 9, won: false }; expect(mysteryCallDue(c)).toBe(true);
    c.life.day++; expect(mysteryCallDue(c)).toBe(false);
    c.life.day--; st.anonCall = true; expect(mysteryCallDue(c)).toBe(false);
    st.anonCall = false; st.scrimmage = 'missed'; expect(mysteryCallDue(c)).toBe(false);
  });
});
