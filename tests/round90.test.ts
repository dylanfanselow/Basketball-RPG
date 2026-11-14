import { describe, it, expect } from 'vitest';
import { createCareer, draftWeek } from '../src/career/career';
import { storyDay } from '../src/career/calendar';
import { buildScoutReport, gameLines, DESCRIPTORS } from '../src/career/scoutReport';
import { buildDraftScrimmage } from '../src/sim/draftGames';
import { emptyInput } from '../src/sim/game';
import { defaultAppearance } from '../src/render/appearance';
import { newStory } from '../src/sim/story';
import { CORE_STATS } from '../src/sim/data';
import type { Position } from '../src/sim/attributes';

function career(pos: Position, heightIn: number, core?: Partial<Record<string, number>>) {
  const c = createCareer({ firstName: 'Dee', lastName: 'Jones', number: 8, pos, heightIn, appearance: defaultAppearance() });
  let s = 42; c.story = newStory(c, () => ((s = (s * 16807) % 2147483647) / 2147483647));
  c.story.stage = 'draftWeek'; c.story.draft = draftWeek(storyDay('agent'), storyDay('draft'));
  for (const k of CORE_STATS) if (core?.[k] !== undefined) { c.core[k] = core[k]!; c.skills[k].level = core[k]!; }
  return c;
}
function playScrimmage(c: ReturnType<typeof career>) {
  const sim = buildDraftScrimmage(c, 11); sim.user!.isUser = false; // let the AI play you too (headless)
  let guard = 0; while (!sim.over && guard++ < 60 * 60 * 12) sim.update(1 / 60, emptyInput());
  return sim;
}
const EM = String.fromCharCode(0x2014);

describe('round 90: the scouting report', () => {
  it('three strengths and three weaknesses, no two from the same group, biggest first', () => {
    const c = career('SG', 77), sim = playScrimmage(c), r = buildScoutReport(c, sim);
    console.log('REPORT', JSON.stringify(r, null, 1));
    expect(r.strengths.length).toBe(3); expect(r.weaknesses.length).toBe(3);
    const groups = [...r.strengths, ...r.weaknesses].map((l) => DESCRIPTORS.find((d) => d.key === l.key)!.group);
    expect(new Set(groups).size).toBe(6);
    for (let i = 1; i < 3; i++) { expect(r.strengths[i].value).toBeLessThanOrEqual(r.strengths[i - 1].value); expect(r.weaknesses[i].value).toBeGreaterThanOrEqual(r.weaknesses[i - 1].value); }
    expect(JSON.stringify(r).includes(EM)).toBe(false);
    const lines = gameLines(sim); expect([...lines.values()].some((l) => l.contests > 0)).toBe(true);
  }, 60000);
  it('it reads the player: a tall, strong, low-skill center vs a small sharpshooting guard', () => {
    const big = career('C', 87, { strength: 80, finishing: 70, shooting: 30, playmaking: 30, mobility: 40 });
    const rb = buildScoutReport(big, playScrimmage(big));
    const small = career('PG', 72, { shooting: 85, playmaking: 75, strength: 25, finishing: 45, mobility: 60 });
    const rs = buildScoutReport(small, playScrimmage(small));
    console.log('BIG', rb.strengths.map((l) => l.title).join(' | '), '//', rb.weaknesses.map((l) => l.title).join(' | '));
    console.log('SMALL', rs.strengths.map((l) => l.title).join(' | '), '//', rs.weaknesses.map((l) => l.title).join(' | '));
    expect(rb.strengths.some((l) => l.key === 'size' || l.key === 'strength')).toBe(true);
    expect(rs.weaknesses.some((l) => l.key === 'size' || l.key === 'strength')).toBe(true);
    expect(rs.strengths.some((l) => ['shooter', 'scorer', 'passer', 'creator'].includes(l.key))).toBe(true);
  }, 120000);
});
