import { describe, it, expect } from 'vitest';
import { createCareer } from '../src/career/career';
import { defaultAppearance } from '../src/render/appearance';
import { newStory, buildFinal, RIVAL_ID } from '../src/sim/story';
import { FAKE_LEARN } from '../src/sim/game';

function finalSim() {
  const c = createCareer({ firstName: 'Dee', lastName: 'Jones', number: 8, pos: 'PG', heightIn: 76, appearance: defaultAppearance() });
  let s = 42; c.story = newStory(c, () => ((s = (s * 16807) % 2147483647) / 2147483647));
  return buildFinal(c, 7);
}

describe('round 80g: defenders learn your pump fake', () => {
  it('each bite makes him (and a bit less, his teammates) less likely to bite again, down to a floor', () => {
    const sim = finalSim(), me = sim.user!, opp = sim.teams[1].onCourt, [d1, d2] = opp;
    const other = sim.teams[0].onCourt.find((p) => p !== me)!;
    expect(sim.fakeWise(me, d1)).toBe(1);
    (sim as any).noteBite(me, d1);
    expect(sim.fakeWise(me, d1)).toBeCloseTo(FAKE_LEARN.per);
    expect(sim.fakeWise(me, d2)).toBeCloseTo(FAKE_LEARN.per ** FAKE_LEARN.seen); // saw it happen
    expect(sim.fakeWise(other, d1)).toBe(1); // a teammate's fake is a different read
    for (let i = 0; i < 10; i++) (sim as any).noteBite(me, d1);
    expect(sim.fakeWise(me, d1)).toBe(FAKE_LEARN.floor);
  });
  it('after the second bite the feed says they are reading your pump fake', () => {
    const sim = finalSim(), me = sim.user!, d = sim.teams[1].onCourt.find((p) => p.id !== RIVAL_ID)!;
    sim.drainEvents();
    (sim as any).noteBite(me, d);
    expect(sim.drainEvents().some((e) => e.kind === 'read')).toBe(false);
    (sim as any).noteBite(me, d);
    expect(sim.drainEvents().some((e) => e.kind === 'read' && /pump fake/.test(e.text))).toBe(true);
  });
  it('round 80i: real shots with a man on you make the fake work better (capped)', () => {
    const sim = finalSim(), me = sim.user!, d = sim.teams[1].onCourt[0];
    sim.honestShots[me.id] = 3;
    expect(sim.fakeWise(me, d)).toBeCloseTo(1 + 3 * FAKE_LEARN.honest);
    (sim as any).noteBite(me, d);
    expect(sim.fakeWise(me, d)).toBeCloseTo(FAKE_LEARN.per * (1 + 3 * FAKE_LEARN.honest));
    sim.honestShots[me.id] = 50;
    expect(sim.fakeWise(me, d)).toBe(FAKE_LEARN.max);
  });
});
