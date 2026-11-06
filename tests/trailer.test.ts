import { describe, it, expect } from 'vitest';
import { solids, moveWithCollision, PLAYER_R, footprint, V } from '../src/world/apartment';
import { TRAILER_YARD, TRAILER_SOLID, DOOR_SPOT, STEPS, liftAt, TRAILER } from '../src/world/trailer';

const polys = solids([TRAILER_SOLID], TRAILER_YARD);
const blocked = (p: V) => moveWithCollision(p, { x: 0, y: 0 }, PLAYER_R, polys);
/** Walk toward a target in small steps; returns where you end up. */
function walk(from: V, to: V, steps = 600): V {
  let p = { ...from };
  for (let i = 0; i < steps; i++) {
    const dx = to.x - p.x, dy = to.y - p.y, d = Math.hypot(dx, dy);
    if (d < 0.05) break;
    p = moveWithCollision(p, { x: (dx / d) * 0.05, y: (dy / d) * 0.05 }, PLAYER_R, polys);
  }
  return p;
}

describe('round 57: the trailer yard', () => {
  it('the trailer, generator and cooler are solid; the steps are not', () => {
    const gen = TRAILER_YARD.furniture.find((p) => p.id === 'generator')!, cool = TRAILER_YARD.furniture.find((p) => p.id === 'cooler')!;
    for (const c of [{ x: 10, y: 0.5 }, { x: gen.x + gen.w / 2, y: gen.y + gen.d / 2 }, { x: cool.x + cool.w / 2, y: cool.y + cool.d / 2 }]) {
      const out = blocked(c);
      expect(Math.hypot(out.x - c.x, out.y - c.y)).toBeGreaterThan(0.3);
    }
    expect(TRAILER_YARD.furniture.some((p) => p.id === 'door' && !p.solid)).toBe(true);
    const onStep = { x: (STEPS.x0 + STEPS.x1) / 2, y: 2.7 };
    expect(blocked(onStep)).toEqual(onStep);
    void footprint;
  });
  it('walking up the steps raises you a step at a time; the ground is 0', () => {
    const x = DOOR_SPOT.x;
    expect(liftAt({ x, y: 6 })).toBe(0);
    const hs = [3.7, 2.7, 1.9].map((y) => liftAt({ x, y }));
    expect(hs[0]).toBeGreaterThan(0);
    expect(hs[1]).toBeGreaterThan(hs[0]);
    expect(hs[2]).toBeGreaterThan(hs[1]);
    expect(hs[2]).toBeLessThanOrEqual(TRAILER.floorFt);
    expect(liftAt({ x: STEPS.x1 + 3, y: 2.7 })).toBe(0);
  });
  it('from the path you can walk up to the door (the "Go inside" spot)', () => {
    const end = walk(TRAILER_YARD.spawn, { x: DOOR_SPOT.x, y: 6 });
    const top = walk(end, DOOR_SPOT);
    expect(Math.hypot(top.x - DOOR_SPOT.x, top.y - DOOR_SPOT.y)).toBeLessThan(0.3);
    expect(liftAt(top)).toBeGreaterThan(1.5);
  });
});
