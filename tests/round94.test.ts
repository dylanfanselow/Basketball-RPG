import { describe, it, expect } from 'vitest';
import { createCareer, setStat } from '../src/career/career';
import { defaultAppearance } from '../src/render/appearance';
import { newStory } from '../src/sim/story';
import { buildRatingsReport, DESCRIPTORS } from '../src/career/scoutReport';
import { CORE_STATS } from '../src/sim/data';

function career() {
  const c = createCareer({ firstName: 'Dee', lastName: 'Jones', number: 8, pos: 'SG', heightIn: 77, appearance: defaultAppearance() });
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  c.story = newStory(c, rnd);
  return c;
}

describe('round 94: look yourself up on the TV', () => {
  it('three strengths, three weaknesses, one per group, from ratings alone', () => {
    const c = career();
    const r = buildRatingsReport(c);
    expect(r.strengths.length).toBe(3);
    expect(r.weaknesses.length).toBe(3);
    const group = (k: string) => DESCRIPTORS.find((d) => d.key === k)!.group;
    const groups = [...r.strengths, ...r.weaknesses].map((l) => group(l.key));
    expect(new Set(groups).size).toBe(groups.length);
    // game-only descriptors (shot selection, turnovers, volume) can't show up without a game
    for (const l of [...r.strengths, ...r.weaknesses]) expect(['shotSel', 'turnovers', 'volume']).not.toContain(l.key);
  });

  it('a 99 shooter reads as a shooter or a scorer; a 25 shooter as the opposite', () => {
    const c = career();
    for (const st of CORE_STATS) setStat(c, st, 55);
    setStat(c, 'shooting', 99);
    expect(buildRatingsReport(c).strengths.map((l) => l.key).some((k) => k === 'shooter' || k === 'scorer')).toBe(true);
    setStat(c, 'shooting', 25);
    expect(buildRatingsReport(c).weaknesses.map((l) => l.key).some((k) => k === 'shooter' || k === 'scorer')).toBe(true);
  });
});
