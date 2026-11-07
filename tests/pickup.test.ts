import { describe, it, expect } from 'vitest';
import { makeGame } from './helpers';
import { emptyInput } from '../src/sim/game';
import { TEAMS, NODES } from '../src/sim/data';
import { generateRoster } from '../src/career/roster';

const setup = (withPerk: boolean) => {
  const g = makeGame({ seed: 11 });
  const inp = emptyInput();
  for (let t = 0; t < 30 && !(g.live && g.holder()); t += 1 / 30) g.update(1 / 30, inp);
  const h = g.holder()!, d = g.opp(h.team)[0];
  d.nodes.delete('pd_pickup'); if (withPerk) d.nodes.add('pd_pickup'); d.recompute();
  d.sub.steal = 0; // keep steals rare: this is about the misses
  return { g, h, d };
};
/** n swipes from right in front of him; returns how many killed his dribble (and resets it each time). */
const swipes = (g: ReturnType<typeof setup>['g'], h: any, d: any, n: number) => {
  let killed = 0, stolen = 0;
  for (let i = 0; i < n; i++) {
    if (g.holder() !== h) { g.giveBall(h); stolen++; }
    h.deadDribble = false; h.state = 'idle'; h.post = null;
    h.face = { x: 1, y: 0 }; d.p = { x: h.p.x + 2.5, y: h.p.y }; d.swipeCdUntil = 0; d.state = 'idle';
    g.live = true;
    g.swipe(d);
    if (g.holder() === h && h.deadDribble) killed++;
  }
  return { killed, stolen };
};

describe('round 50: Pick-Up Pressure', () => {
  it('is a high-level ability in the perimeter tree', () => {
    const n = NODES['pd_pickup'];
    expect(n.type).toBe('ability');
    expect(n.prereqs).toContain('pd_flop');
  });
  it('a missed swipe sometimes kills the dribble, only with the ability', () => {
    let s = setup(true);
    const on = swipes(s.g, s.h, s.d, 300);
    expect(on.killed).toBeGreaterThan(30);
    expect(s.g.events.some((e) => e.kind === 'pickup')).toBe(true);
    s = setup(false);
    expect(swipes(s.g, s.h, s.d, 300).killed).toBe(0);
  });
  it('great ball handlers are harder to stop dribbling', () => {
    const s = setup(true);
    s.h.sub.ballSpeed = 20; const shaky = s.g.pickUpChance(s.d, s.h);
    s.h.sub.ballSpeed = 99; const elite = s.g.pickUpChance(s.d, s.h);
    expect(shaky).toBeGreaterThan(elite * 1.5);
  });
  it('elite CPU perimeter defenders come with it; most players don\'t', () => {
    const all = TEAMS.flatMap((t) => generateRoster(t, 0));
    const ant = all.find((p) => p.name === 'Anthony Edwards');
    if (ant) expect(ant.nodes.has('pd_pickup')).toBe(true);
    const share = all.filter((p) => p.nodes.has('pd_pickup')).length / all.length;
    expect(share).toBeGreaterThan(0.04);
    expect(share).toBeLessThan(0.2);
  });
});
