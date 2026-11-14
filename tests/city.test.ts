import { describe, it, expect } from 'vitest';
import { PLACES, PLACE, placeToward, travelCost, canTravel, TRIP_ENERGY, PlaceId } from '../src/world/city';

describe('round 92 city map', () => {
  it('every place is on the map, below the stat bar, with a name and a blurb', () => {
    for (const p of PLACES) {
      expect(p.at.x).toBeGreaterThan(40); expect(p.at.x).toBeLessThan(920);
      expect(p.at.y).toBeGreaterThan(90); expect(p.at.y).toBeLessThan(520);
      expect(p.name.length).toBeGreaterThan(2); expect(p.blurb.length).toBeGreaterThan(10);
    }
    expect(PLACES.filter((p) => p.open).map((p) => p.id).sort()).toEqual(['arena', 'home', 'lincoln', 'trailer']);
  });

  it('the stick reaches every place from every other (four directions)', () => {
    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 1 }, { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }];
    for (const start of PLACES) {
      const seen = new Set<PlaceId>([start.id]), todo: PlaceId[] = [start.id];
      while (todo.length) { const p = todo.pop()!; for (const d of dirs) { const n = placeToward(p, d); if (n && !seen.has(n)) { seen.add(n); todo.push(n); } } }
      expect(seen.size).toBe(PLACES.length);
    }
    // a hop goes the way you pushed
    const right = placeToward('trailer', { x: 1, y: 0 })!;
    expect(PLACE[right].at.x).toBeGreaterThan(PLACE.trailer.at.x);
    expect(placeToward('home', { x: 0, y: 0 })).toBeNull();
  });

  it('trips cost energy by distance; home is free; too tired stops you', () => {
    expect(travelCost('trailer', 'home')).toBe(0);
    expect(travelCost('home', 'arena')).toBe(TRIP_ENERGY[0]);
    expect(travelCost('home', 'trailer')).toBe(TRIP_ENERGY[2]);
    expect(travelCost('trailer', 'lincoln')).toBe(TRIP_ENERGY[0]);
    const c = { life: { energy: 5 } } as any;
    expect(canTravel(c, 4)).toBe(true);
    expect(canTravel(c, 6)).toBe(false);
  });
});
