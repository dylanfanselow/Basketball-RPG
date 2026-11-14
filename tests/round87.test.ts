import { describe, it, expect } from 'vitest';
import { createCareer, draftWeek } from '../src/career/career';
import { storyDay } from '../src/career/calendar';
import { topTwo, prospectLook } from '../src/career/draftClass';
import { buildDraftScrimmage, TOP1_ID, TOP2_ID } from '../src/sim/draftGames';
import { OPEN_LAYUP, OPEN_LAYUP_TYPES } from '../src/sim/shooting';
import { CLIP } from '../src/render/anim';
import { defaultAppearance } from '../src/render/appearance';
import { newStory } from '../src/sim/story';
import type { Position } from '../src/sim/attributes';

function career(pos: Position = 'SG', seed = 42) {
  const c = createCareer({ firstName: 'Dee', lastName: 'Jones', number: 8, pos, heightIn: 77, appearance: defaultAppearance() });
  let s = seed; c.story = newStory(c, () => ((s = (s * 16807) % 2147483647) / 2147483647));
  c.story.stage = 'draftWeek'; c.story.draft = draftWeek(storyDay('agent'), storyDay('draft'));
  return c;
}

describe('round 87: the projected top two, the scrimmage, open layups', () => {
  it('#1 is the smaller one, #2 the biggest position allowed and tall', () => {
    const g = topTwo(career('PG').story, 'PG'); expect([g.first.pos, g.second.pos]).toEqual(['SF', 'C']); expect(g.second.heightIn).toBe(87);
    const c = topTwo(career('C').story, 'C'); expect([c.first.pos, c.second.pos]).toEqual(['SG', 'PF']); expect(c.second.heightIn).toBe(83);
    expect(g.first.proj).toBe(1); expect(g.second.proj).toBe(2);
    expect(prospectLook(g.first)).toEqual(prospectLook(g.first)); // the same face every time
  });
  it('the scrimmage: #1 plays with you, #2 against you, with their class stats and heights', () => {
    for (const pos of ['PG', 'SF', 'C'] as Position[]) {
      const c = career(pos), sim = buildDraftScrimmage(c, 7), pair = topTwo(c.story, c.pos);
      const one = sim.players.find((p) => p.id === TOP1_ID)!, two = sim.players.find((p) => p.id === TOP2_ID)!;
      expect(one.team).toBe(0); expect(two.team).toBe(1);
      expect(one.name).toBe(pair.first.name); expect(two.pos).toBe(pair.second.pos);
      expect(two.core.strength).toBe(pair.second.core.strength);
      expect(sim.teams[0].roster.length).toBe(5); expect(sim.teams[1].roster.length).toBe(5);
      expect(new Set(sim.teams[0].roster.map((p) => p.pos)).size).toBe(5);
      expect(new Set(sim.teams[1].roster.map((p) => p.pos)).size).toBe(5);
    }
  });
  it('open layups get a bonus; the flex pose exists for the big jump', () => {
    expect(OPEN_LAYUP).toBeGreaterThan(1); expect(OPEN_LAYUP_TYPES.has('layup')).toBe(true); expect(OPEN_LAYUP_TYPES.has('mid')).toBe(false);
    expect(CLIP.flex).toBeTruthy(); expect(CLIP.sit).toBeTruthy();
  });
});
