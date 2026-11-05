import { describe, it, expect } from 'vitest';
import { GARAGE } from '../src/world/garage';
import { APARTMENT, PLAYER_R, ROOM, solids, moveWithCollision, isFree, footprint, doorNear, stationNear, wallL, rightBound } from '../src/world/apartment';
import { CLIP } from '../src/render/anim';

const polys = solids([], GARAGE);
const inside = (poly: { x: number; y: number }[], p: { x: number; y: number }) => {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const c = Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
    if (c !== 0) { if (s === 0) s = c; else if (c !== s) return false; }
  }
  return true;
};

describe('garage', () => {
  it('spawn and the house door are free and reachable', () => {
    expect(isFree(GARAGE.spawn, PLAYER_R, polys)).toBe(true);
    const step = 0.25, seen = new Set<string>(), q = [{ i: Math.round(GARAGE.spawn.x / step), j: Math.round(GARAGE.spawn.y / step) }];
    seen.add(`${q[0].i},${q[0].j}`);
    while (q.length) {
      const c = q.pop()!;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const i = c.i + di, j = c.j + dj, k = `${i},${j}`;
        if (seen.has(k) || !isFree({ x: i * step, y: j * step }, PLAYER_R, polys)) continue;
        seen.add(k); q.push({ i, j });
      }
    }
    for (const d of GARAGE.doors) {
      expect(isFree(d.spot, PLAYER_R, polys)).toBe(true);
      expect([...seen].some((k) => { const [i, j] = k.split(',').map(Number); return Math.hypot(i * step - d.spot.x, j * step - d.spot.y) < 0.5; })).toBe(true);
      expect(doorNear(d.spot, 1.6, GARAGE)?.id).toBe(d.id);
    }
  });

  it('equipment, the hoop base and the van are solid from every side', () => {
    for (const piece of GARAGE.furniture.filter((f) => f.solid)) {
      const poly = footprint(piece);
      const cx = poly.reduce((a, p) => a + p.x, 0) / poly.length, cy = poly.reduce((a, p) => a + p.y, 0) / poly.length;
      for (let k = 0; k < 12; k++) {
        const ang = (k / 12) * Math.PI * 2;
        let p = { x: cx + Math.cos(ang) * 9, y: cy + Math.sin(ang) * 9 };
        if (!isFree(p, PLAYER_R, polys)) continue;
        for (let i = 0; i < 250; i++) {
          const dx = cx - p.x, dy = cy - p.y, d = Math.hypot(dx, dy) || 1;
          p = moveWithCollision(p, { x: (dx / d) * 0.12, y: (dy / d) * 0.12 }, PLAYER_R, polys);
          expect(inside(poly, p)).toBe(false);
        }
      }
    }
  });

  it('the walls hold', () => {
    for (const dir of [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 1 }]) {
      let p = { ...GARAGE.spawn };
      for (let i = 0; i < 400; i++) p = moveWithCollision(p, { x: dir.x * 0.15, y: dir.y * 0.15 }, PLAYER_R, polys);
      expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(ROOM.depth);
      expect(p.x).toBeGreaterThan(wallL(p.y)); expect(p.x).toBeLessThan(rightBound(p.y, GARAGE));
    }
  });

  it('the doors link the apartment and the garage both ways', () => {
    const toGarage = APARTMENT.doors.find((d) => d.id === 'garage')!;
    expect(toGarage.to!.scene).toBe('Garage');
    const arrive = GARAGE.doors.find((d) => d.id === toGarage.to!.at)!;
    expect(arrive.side).toBe('L'); // the door from the apartment is on the garage's left wall
    expect(arrive.to!.scene).toBe('Apartment');
    expect(APARTMENT.doors.some((d) => d.id === arrive.to!.at)).toBe(true);
  });

  it('every workout has its animation, a free spot you can reach, and ✕ there picks it', () => {
    const ids = GARAGE.stations!.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['squat', 'bench', 'pushup', 'rope', 'treadmill']));
    for (const s of GARAGE.stations!) {
      expect(CLIP[s.clip]).toBeDefined();
      expect(CLIP[s.clip].loop).toBe(true);
      expect(isFree(s.spot, PLAYER_R * 0.9, polys)).toBe(true);
      expect(stationNear(s.spot, GARAGE)?.id).toBe(s.id);
    }
    // the squat is shown facing us, the treadmill from behind, the rest side-on
    expect(GARAGE.stations!.find((s) => s.id === 'squat')!.yaw).toBe(90);
    expect(GARAGE.stations!.find((s) => s.id === 'treadmill')!.yaw).toBe(-90);
  });
});
