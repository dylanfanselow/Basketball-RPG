import { describe, it, expect } from 'vitest';
import { PLACES, PLACE, placeToward, travelCost, canTravel, TRIP_ENERGY, PlaceId, gymPass, buyGymPass, GYM_DAY_PASS, GYM_XP_MULT } from '../src/world/city';

describe('round 92 city map', () => {
  it('every place is on the map, below the stat bar, with a name and a blurb', () => {
    for (const p of PLACES) {
      expect(p.at.x).toBeGreaterThan(40); expect(p.at.x).toBeLessThan(920);
      expect(p.at.y).toBeGreaterThan(90); expect(p.at.y).toBeLessThan(520);
      expect(p.name.length).toBeGreaterThan(2); expect(p.blurb.length).toBeGreaterThan(10);
    }
    expect(PLACES.filter((p) => p.open).map((p) => p.id).sort()).toEqual(['arena', 'gym', 'home', 'lincoln', 'trailer']);
    // round 93 (owner): Ridgemont and Crestview are off the map; the gas station, the cabin and the highway are on it
    const ids = PLACES.map((p) => p.id as string);
    expect(ids).not.toContain('ridgemont'); expect(ids).not.toContain('crestview');
    for (const id of ['gas', 'cabin', 'highway', 'gym', 'burger']) expect(ids).toContain(id);
    // the south is the trailer park: Mom's trailer, Lincoln and the gas station are all down there
    for (const id of ['trailer', 'lincoln', 'gas'] as PlaceId[]) expect(PLACE[id].at.y).toBeGreaterThan(400);
    // round 95 (owner): the cabin is high up the mountain, above the waterfall's lip (y 126) and well above the town
    expect(PLACE.cabin.at.y).toBeLessThan(140);
    expect(PLACE.cabin.at.y).toBeLessThan(PLACE.home.at.y - 60);
    // the gym and Burger Barn sit by the downtown towers (around the arena)
    for (const id of ['gym', 'burger'] as PlaceId[]) expect(Math.hypot(PLACE[id].at.x - PLACE.arena.at.x, PLACE[id].at.y - PLACE.arena.at.y)).toBeLessThan(160);
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
    expect(travelCost('home', 'gym')).toBe(TRIP_ENERGY[0]);
    const c = { life: { energy: 5 } } as any;
    expect(canTravel(c, 4)).toBe(true);
    expect(canTravel(c, 6)).toBe(false);
  });

  it('the big gym: a day pass once a day, refused when broke; more XP per orb', () => {
    const c = { life: { day: 5, money: 60, energy: 50, food: 50 } } as any;
    expect(gymPass(c)).toBe('pay');
    expect(buyGymPass(c)).toBe(true);
    expect(c.life.money).toBe(60 - GYM_DAY_PASS);
    expect(gymPass(c)).toBe('paid');
    expect(buyGymPass(c)).toBe(true);
    expect(c.life.money).toBe(60 - GYM_DAY_PASS); // not charged twice the same day
    c.life.day = 6; c.life.money = GYM_DAY_PASS - 1;
    expect(gymPass(c)).toBe('broke');
    expect(buyGymPass(c)).toBe(false);
    expect(c.life.money).toBe(GYM_DAY_PASS - 1);
    expect(GYM_XP_MULT).toBeGreaterThan(1);
  });
});
