import { describe, it, expect } from 'vitest';
import { makeGame } from './helpers';
import { emptyInput } from '../src/sim/game';
import { planShot } from '../src/sim/ballPhysics';
import { Rng } from '../src/sim/math';

describe('round 75: crunch time', () => {
  const live = () => {
    const g = makeGame({ seed: 5 });
    for (let t = 0; t < 30 && !(g.live && g.holder()); t += 1 / 30) g.update(1 / 30, emptyInput());
    return g;
  };
  it('is clutch time: the last stretch of the final period in a close game (round 76)', () => {
    const g = live();
    g.teams[0].score = 80; g.teams[1].score = 78;
    g.quarter = g.periods; g.clock = g.cfg.quarterLen * 0.1;
    expect(g.crunchTime).toBe(true);
    g.teams[1].score = 66; // a blowout: no hush
    expect(g.crunchTime).toBe(false);
    g.teams[1].score = 78; g.clock = g.cfg.quarterLen * 0.5; // too early
    expect(g.crunchTime).toBe(false);
    g.quarter = g.periods - 1; g.clock = 5; // end of the 3rd
    expect(g.crunchTime).toBe(false);
  });
  it('a jumper released in crunch time tells the arena to hush (not a dunk, not earlier)', () => {
    const shot = (crunch: boolean, type: string) => {
      const g = live();
      g.quarter = g.periods; g.clock = crunch ? g.cfg.quarterLen * 0.1 : g.cfg.quarterLen * 0.6;
      g.teams[0].score = 70; g.teams[1].score = 70;
      const h = g.holder()!;
      g.events.length = 0;
      g.startShot(h, type);
      for (let t = 0; t < 2 && h.pendingShot; t += 1 / 60) g.update(1 / 60, emptyInput());
      return g.events.find((e) => e.kind === 'release')?.data?.crunch;
    };
    expect(shot(true, 'mid')).toBe(true);
    expect(shot(false, 'mid')).toBe(false);
    expect(shot(true, 'dunk')).toBe(false);
  });
});

describe('round 75: suspense on the rim', () => {
  it('crunch-time shots dance on the iron (2+ rim bounces) and still give the decided result', () => {
    const hoop = { x: 88.75, y: 25, dir: 1 as const };
    const rims = (suspense: boolean) => {
      const r = new Rng(3); let multi = 0, n = 0;
      for (let i = 0; i < 40; i++) {
        const d = 12 + (i % 4) * 4, ang = (i % 7 - 3) * 0.2;
        const release = { x: hoop.x - Math.cos(ang) * d, y: 25 + Math.sin(ang) * d, z: 9.3 };
        for (const made of [true, false]) {
          const p = planShot({ release, hoop, type: d > 22 ? 'three' : 'mid', made, airball: false, dist: d, contest: 0.3, suspense }, r);
          expect(made ? p.through !== null : p.through === null).toBe(true);
          n++; if (p.contacts.filter((c) => c.kind === 'rim').length >= 2) multi++;
        }
      }
      return multi / n;
    };
    const plain = rims(false), tense = rims(true);
    expect(tense).toBeGreaterThan(0.8);
    expect(tense).toBeGreaterThan(plain + 0.2);
  });
});
