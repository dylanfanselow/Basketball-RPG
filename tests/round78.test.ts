import { describe, it, expect } from 'vitest';
import { makeGame } from './helpers';
import { emptyInput, GameSim, STEAL } from '../src/sim/game';
import { CHASE, tryActivateUlt } from '../src/sim/ultimates';
import { thinkDefense } from '../src/sim/ai/defense';
import { SHOOT_TUNE } from '../src/sim/shooting';
import { add, norm, scale, sub } from '../src/sim/math';

const live = (seed = 6) => {
  const g = makeGame({ seed });
  for (let t = 0; t < 30 && !(g.live && g.holder()); t += 1 / 30) g.update(1 / 30, emptyInput());
  return g;
};
const setup = (g: GameSim) => {
  const h = g.holder()!;
  const d = g.opp(h.team).find((p) => p.pos === 'C')!;
  d.star = true; g.cpuUlts[d.id] = { unlocked: true, id: 'chaseDown', level: 0 };
  const rim = g.rim(h.team), toRim = norm(sub(rim, h.p));
  return { h, d, rim, toRim };
};

describe('round 78: Chase-Down fires at the finish and lands', () => {
  it('not on a jumper, and not from in front in the half court early in the game', () => {
    const g = live();
    const { h, d, rim, toRim } = setup(g);
    h.p = add(rim, scale(toRim, -9)); d.p = add(h.p, scale(toRim, -5));
    g.transitionUntil = g.time + 5; g.runner.reset();
    g.startShot(h, 'mid');
    thinkDefense(g, d, 1 / 60);
    expect(g.ult.active).toBeNull();
    const g2 = live(8);
    const s2 = setup(g2);
    s2.h.p = add(s2.rim, scale(s2.toRim, -9)); s2.d.p = add(s2.h.p, scale(s2.toRim, 4)); // between him and the rim
    g2.transitionUntil = 0; g2.quarter = 1;
    g2.startShot(s2.h, 'layup');
    thinkDefense(g2, s2.d, 1 / 60);
    expect(g2.ult.active).toBeNull();
  });
  it('a timed chase-down blocks from beyond a normal block reach', () => {
    const g = live();
    g.freezeAI = true;
    const { h, d, rim, toRim } = setup(g);
    h.p = add(rim, scale(toRim, -7)); h.vel = scale(toRim, 10);
    d.p = add(h.p, scale(toRim, -(CHASE.reach - 1))); d.z = 0; d.state = 'idle';
    g.rng.chance = () => true;
    g.startShot(h, 'layup');
    expect(tryActivateUlt(g, d)).toBe(true);
    for (let t = 0; t < 2 && g.ball.st.kind === 'held'; t += 1 / 60) g.update(1 / 60, emptyInput());
    expect(g.events.some((e) => e.kind === 'block' && e.text.startsWith('CHASE-DOWN'))).toBe(true);
  });
});

describe('round 78: tuning', () => {
  it('steals are scaled down; the shooting GOAT knobs exist', () => {
    expect(STEAL.swipe).toBeLessThan(1);
    expect(STEAL.lane).toBeLessThan(1);
    expect(SHOOT_TUNE.lethalEvery).toBeGreaterThanOrEqual(2);
    expect(SHOOT_TUNE.chefWindup).toBeLessThan(1);
  });
});
