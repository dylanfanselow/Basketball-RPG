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
  it('the draft week: the combine 7 days out (two days), a scrimmage, the draft, on the calendar and the HUD card', () => {
    const c = career(); c.life.day = 100;
    c.story!.draft = draftWeek(100, 112);
    const ev = storyEventsByDay(c);
    expect([...ev.values()].map((e) => e.label)).toEqual(['COMBINE', 'COMBINE', 'SCRIMMAGE', 'DRAFT']);
    expect(ev.get(107)?.label).toBe('COMBINE');
    c.story!.stage = 'draftWeek';
    // the HUD card counts down to the next event
    expect(storyKeyGame(c)).toEqual({ when: '7 DAYS', what: 'The combine' });
    c.life.day = 108; expect(storyKeyGame(c)).toEqual({ when: 'TODAY', what: 'The combine' });
    c.life.day = 109; expect(storyKeyGame(c)).toEqual({ when: '1 DAY', what: 'The scrimmage' });
    c.life.day = 111; expect(storyKeyGame(c)).toEqual({ when: '1 DAY', what: 'The draft' });
    c.life.day = 112; expect(storyKeyGame(c)!.when).toBe('TODAY');
  });
});

import { AGENT_PATHS } from '../src/world/agentPaths';
import { APARTMENT, solids, moveWithCollision, PLAYER_R, V } from '../src/world/apartment';
import { GARAGE } from '../src/world/garage';

/** Walk the waypoints with the rooms' real collision: true if every one is reached (nothing in the way). */
function walk(from: V, path: V[], room = APARTMENT): { ok: boolean; at: V } {
  const polys = solids([], room);
  let p = { ...from };
  for (const w of path) {
    for (let i = 0; i < 2000; i++) {
      const dx = w.x - p.x, dy = w.y - p.y, d = Math.hypot(dx, dy);
      if (d < 0.05) break;
      const s = Math.min(d, 0.1), q = moveWithCollision(p, { x: dx / d * s, y: dy / d * s }, PLAYER_R, polys);
      if (Math.hypot(q.x - p.x, q.y - p.y) < s * 0.5) return { ok: false, at: p }; // blocked
      p = q;
    }
  }
  return { ok: true, at: p };
}

describe('round 81b: the agent scenes walk around the furniture', () => {
  const A = AGENT_PATHS.apartment, G = AGENT_PATHS.garage;
  it('apartment: Hale and you reach the calendar around the island, then the garage door', () => {
    expect(walk(A.haleStart, [...A.haleToCalendar, ...A.haleToGarage]).ok).toBe(true);
    expect(walk(APARTMENT.spawn, [...A.youToCalendar, ...A.youToGarage]).ok).toBe(true);
    // the old straight lines were blocked by the island
    expect(walk(APARTMENT.spawn, [A.youToCalendar[A.youToCalendar.length - 1]]).ok).toBe(false);
  });
  it('garage: you come in from the apartment door; Hale walks out the side door', () => {
    const door = GARAGE.doors.find((d) => d.id === 'apartment')!.spot, out = GARAGE.doors.find((d) => d.id === 'outside')!.spot;
    expect(walk(door, G.youIn, GARAGE).ok).toBe(true);
    const r = walk(G.haleStart, G.haleOut, GARAGE);
    expect(r.ok).toBe(true);
    expect(Math.hypot(r.at.x - out.x, r.at.y - out.y)).toBeLessThan(0.5);
  });
});
