import { describe, it, expect } from 'vitest';
import { createCareer, draftWeek } from '../src/career/career';
import { storyDay } from '../src/career/calendar';
import { topTwo, prospectLook, TOP_NAMES, withPrereqs } from '../src/career/draftClass';
import { draftBoard, draftOrder } from '../src/career/draft';
import { buildDraftScrimmage, TOP1_ID, TOP2_ID } from '../src/sim/draftGames';
import { emptyInput } from '../src/sim/game';
import { NODES } from '../src/sim/data';
import { TIPS } from '../src/scenes/tips';
import { defaultAppearance } from '../src/render/appearance';
import { newStory } from '../src/sim/story';
import type { Position } from '../src/sim/attributes';

function career(pos: Position = 'SG', seed = 42) {
  const c = createCareer({ firstName: 'Dee', lastName: 'Jones', number: 8, pos, heightIn: 77, appearance: defaultAppearance() });
  let s = seed; c.story = newStory(c, () => ((s = (s * 16807) % 2147483647) / 2147483647));
  c.story.stage = 'draftWeek'; c.story.draft = draftWeek(storyDay('agent'), storyDay('draft'));
  return c;
}

describe('round 88: Dragić and Jagadeesh, the ball hog, the board, the tips', () => {
  it('the pair: names and signature looks', () => {
    const { first, second } = topTwo(career('PG').story, 'PG');
    expect(first.name).toBe('Drako Dragić'); expect(second.name).toBe('Chinmaya Jagadeesh'); expect(TOP_NAMES.length).toBe(2);
    const a = prospectLook(first), b = prospectLook(second);
    expect(a.skin).toBe(0); expect(a.headband).toBe('#111111'); expect(a.armSleeve).toBe('shooting'); expect(a.legSleeve).toBe('one'); expect(a.socks).toBe('high'); expect(a.sockColor).toBe('#111111');
    expect(b.skin).toBe(3); expect(b.hair).toBe('afro'); expect(b.goggles).toBe(true); expect(b.armSleeve).toBe('none'); expect(b.wristband).toBe('#7a3fd0');
  });
  it('their starter perks come with every prerequisite; #1 is a ball hog; both get isos called', () => {
    const c = career('SG'), sim = buildDraftScrimmage(c, 5);
    const one = sim.players.find((p) => p.id === TOP1_ID)!, two = sim.players.find((p) => p.id === TOP2_ID)!;
    for (const p of [one, two]) for (const id of p.nodes) for (const r of NODES[id]?.prereqs ?? []) expect(p.nodes).toContain(r);
    expect(one.nodes).toContain('dr_stepback'); expect(two.nodes).toContain('fi_poster');
    expect(withPrereqs(['fi_power'])).toContain('fi_fork');
    expect(one.ballHog).toBeGreaterThan(0);
    expect(sim.cfg.isoStars?.map((s) => s.pid)).toEqual([TOP1_ID, TOP2_ID]);
  });
  it('a whole scrimmage: isos for #1 and #2, hog touches, and quiet miss events', () => {
    const c = career('C'), sim = buildDraftScrimmage(c, 9); let lastFor = -99;
    const iso: Record<string, number> = {}; let misses = 0, hog = 0, guard = 0;
    while (!sim.over && guard++ < 60 * 60 * 12) {
      sim.update(1 / 60, emptyInput());
      for (const e of sim.drainEvents()) { if (e.kind === 'play' && e.data?.iso && e.pid) iso[e.pid] = (iso[e.pid] ?? 0) + 1; if (e.kind === 'miss') misses++; }
      const one = sim.players.find((p) => p.id === TOP1_ID)!; if (one.hogFor !== lastFor) { lastFor = one.hogFor; if (one.hogOn) hog++; }
    }
    expect(iso[TOP1_ID] ?? 0).toBeGreaterThan(2); expect(iso[TOP2_ID] ?? 0).toBeGreaterThan(2);
    expect(hog).toBeGreaterThan(0); expect(misses).toBeGreaterThan(0);
  }, 30000);
  it('the draft board: 60 picks, the owners from the draft order, traded ones marked', () => {
    const c = career(), b = draftBoard(c);
    expect(b.length).toBe(60); expect(b.map((r) => r.team)).toEqual(draftOrder(c));
    expect(b.some((r) => r.via)).toBe(true);
  });
  it('loading tips exist, no em dashes', () => {
    expect(TIPS.length).toBeGreaterThan(10);
    for (const t of TIPS) expect(t.includes(String.fromCharCode(0x2014))).toBe(false);
  });
});
