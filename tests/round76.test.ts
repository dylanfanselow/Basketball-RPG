import { describe, it, expect } from 'vitest';
import { makeGame } from './helpers';
import { emptyInput, CLOCK } from '../src/sim/game';
import { evaluateShot, GREEN_CONTEST } from '../src/sim/shooting';
import { add, norm, scale, sub, v } from '../src/sim/math';

const live = (seed = 5) => {
  const g = makeGame({ seed });
  for (let t = 0; t < 30 && !(g.live && g.holder()); t += 1 / 30) g.update(1 / 30, emptyInput());
  return g;
};

describe('round 76: the step-back ult three is automatic when uncontested', () => {
  it('green cone: 100%; a hand in his face: not', () => {
    const g = live();
    const h = g.holder()!, side = g.side(h.team), rim = g.rim(h.team);
    h.p = add(rim, scale(norm(sub(h.p, rim)), 25));
    h.ultSureUntil = g.time + 2;
    const open = evaluateShot(h, [], side, 'three', { now: g.time, clutch: false });
    expect(open.contest).toBeLessThan(GREEN_CONTEST);
    expect(open.pct).toBe(1);
    const d = g.opp(h.team)[0];
    d.p = add(h.p, scale(norm(sub(rim, h.p)), 2)); d.state = 'idle'; d.z = 1;
    const guarded = evaluateShot(h, [d], side, 'three', { now: g.time, clutch: false });
    expect(guarded.pct).toBeLessThan(0.97);
    h.ultSureUntil = -99; // without the ult, an open three is a normal three
    expect(evaluateShot(h, [], side, 'three', { now: g.time, clutch: false }).pct).toBeLessThan(0.97);
  });
});

describe('round 76: clock management', () => {
  it('reads the clock: last shot, 2-for-1, milk a late lead, and just score when trailing late', () => {
    const g = live();
    const t = g.possession, o = (1 - t) as 0 | 1;
    g.quarter = 2; g.shotClock = 24;
    g.clock = 20; expect(g.clockPlan(t)).toBe('lastShot');
    g.clock = 38; expect(g.clockPlan(t)).toBe('twoForOne');
    g.clock = CLOCK.shootBy - 1; g.shotClock = 10; expect(g.clockPlan(t)).toBe(null);
    g.quarter = g.periods; g.teams[t].score = 90; g.teams[o].score = 85; g.clock = 50; g.shotClock = 24;
    expect(g.clockPlan(t)).toBe('milk');
    g.teams[t].score = 80; expect(g.clockPlan(t)).toBe(null); // down 5: score now
    expect(g.clockPlan(o)).toBe(null); // not their ball
  });
  it('holds for the last shot until the go time, then gets one up before the buzzer', () => {
    const g = live(7);
    const t = g.possession;
    g.quarter = 2; g.clock = 19; g.shotClock = 24;
    const before = g.events.length;
    let early = 0, shot = false;
    for (let s = 0; s < 25 && g.quarter === 2; s += 1 / 30) {
      g.update(1 / 30, emptyInput());
      for (const e of g.events.slice(before)) if (e.kind === 'release') { const p = g.players.find((q) => q.id === e.pid); if (p?.team === t) shot = true; }
      if (!shot && g.possession !== t) break; // lost it (a steal): nothing to judge
      if (g.clock > CLOCK.lastShotGo + 1 && shot) early++;
      if (shot) break;
    }
    expect(early).toBe(0);
    expect(g.events.slice(before).some((e) => e.kind === 'call' && e.text.includes('last shot'))).toBe(true);
  });
});
