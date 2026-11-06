import { describe, it, expect } from 'vitest';
import { makeGame } from './helpers';
import { emptyInput } from '../src/sim/game';
import { clearPath } from '../src/sim/ai/offense';

describe('round 48: open court — finish the run', () => {
  const setup = (blocker: boolean) => {
    const g = makeGame({ seed: 5 });
    const inp = emptyInput();
    for (let t = 0; t < 30 && !(g.live && g.holder()); t += 1 / 30) g.update(1 / 30, inp);
    const team = g.possession, rim = g.rim(team), sgn = Math.sign(rim.x - 47);
    const runner = g.teams[team].onCourt.find((p) => p.role === '5')!; // a big — the old outlet rule threw it back to the PG
    g.transitionUntil = g.time + 5; g.shotClock = 24;
    runner.p = { x: 47 + sgn * 4, y: 22 }; runner.vel = { x: sgn * 14, y: 0 };
    // everyone else is behind the play (toward the other basket)
    g.teams[team].onCourt.filter((p) => p !== runner).forEach((p, i) => { p.p = { x: 47 - sgn * (8 + i * 3), y: 10 + i * 8 }; });
    g.opp(team).forEach((d, i) => { d.p = { x: 47 - sgn * (6 + i * 2), y: 12 + i * 7 }; });
    if (blocker) g.opp(team)[0].p = { x: rim.x - sgn * 14, y: 23 };
    g.giveBall(runner);
    return { g, inp, runner };
  };
  it('nobody in front: he keeps driving and shoots it himself', () => {
    const { g, inp, runner } = setup(false);
    expect(clearPath(g, runner)).toBe(true);
    let other = false, shot = false;
    for (let t = 0; t < 4 && !shot; t += 1 / 30) {
      g.update(1 / 30, inp);
      const h = g.holder(); if (h && h !== runner) other = true;
      if (g.ball.st.kind === 'shot' && g.ball.st.shooter === runner) shot = true;
      if (g.ball.st.kind === 'pass') other = true;
    }
    expect(other).toBe(false);
    expect(shot).toBe(true);
  });
  it('a defender back in his path: the way is not clear', () => {
    const { g, runner } = setup(true);
    expect(clearPath(g, runner)).toBe(false);
  });
});
