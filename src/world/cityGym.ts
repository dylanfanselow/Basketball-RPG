import { RoomDef } from './apartment';
import { GARAGE_FURNITURE, GARAGE_STATIONS, GARAGE_SPAWN } from './garage';

/**
 * Round 93 (owner): Iron Works, the big gym downtown. The garage's floor plan and machines (so every station, the hoop
 * and the mini-games work unchanged), minus the car and the boxes; a glass door at the back out to the street (the
 * city map). Entry costs a day pass and the machines give more per energy (`GYM_DAY_PASS`, `GYM_XP_MULT` in
 * `world/city.ts`). Phaser-free.
 */
export const CITY_GYM_FURNITURE = GARAGE_FURNITURE.filter((p) => ['bench', 'squatRack', 'treadmill', 'hoop', 'kettlebells'].includes(p.id));

export const CITY_GYM: RoomDef = {
  id: 'cityGym', furniture: CITY_GYM_FURNITURE, spawn: GARAGE_SPAWN, stations: GARAGE_STATIONS,
  doors: [{ id: 'street', label: 'Leave', spot: { x: 31.8, y: 1.4 }, side: 'B', span: [30.4, 33.2], to: { scene: 'City', at: 'gym' } }],
};
