import { Piece, Door, RoomDef, V, Poly, alongLeftWall, wallR } from './apartment';

/**
 * The garage gym behind the apartment's left door (round 37), laid out like the owner's reference, in the same
 * cutaway frame as the apartment. Orientations follow the reference: bench press long axis left→right with the bar
 * running into the room, squat rack facing us, treadmill console at the back (you run facing the wall), the hoop with
 * its back to the left wall facing right, the van parked along the right wall nose toward the camera.
 */
/** The car: its left side runs along a line slanted like the room's perspective (as the right wall would be). */
export const CAR = { y0: 10.8, y1: 22.6, sideAt: (y: number) => wallR(y) - 6.3, width: 6.0, height: 4.3 };
function carPoly(): Poly {
  return [{ x: CAR.sideAt(CAR.y0), y: CAR.y0 }, { x: CAR.sideAt(CAR.y0) + CAR.width + 6, y: CAR.y0 }, { x: CAR.sideAt(CAR.y1) + CAR.width + 6, y: CAR.y1 }, { x: CAR.sideAt(CAR.y1), y: CAR.y1 }];
}

export const GARAGE_FURNITURE: Piece[] = [
  { id: 'bench', kind: 'bench', x: 10.4, y: 2.2, w: 6.2, d: 3.0, solid: true },
  { id: 'squatRack', kind: 'squatRack', x: 18.4, y: 0.3, w: 4.8, d: 3.0, solid: true },
  { id: 'treadmill', kind: 'treadmill', x: 26.8, y: 0.5, w: 2.8, d: 6.4, solid: true },
  // portable hoop like the arena's: base against the left wall, board + rim facing right into the room
  { id: 'hoop', kind: 'hoop', x: 0.0, y: 13.2, w: 6.4, d: 4.0, solid: true, poly: alongLeftWall(13.2, 17.2, 3.1) },
  // a broken-down fastback parked along the right wall, nose toward the camera
  { id: 'car', kind: 'car', x: 35.0, y: CAR.y0, w: 12, d: CAR.y1 - CAR.y0, solid: true, poly: carPoly() },
  { id: 'boxesL', kind: 'boxes', x: 2.3, y: 20.6, w: 3.4, d: 2.6, solid: true },
  { id: 'kettlebells', kind: 'kettlebells', x: 6.2, y: 22.0, w: 1.9, d: 1.2, solid: true },
  { id: 'boxesR', kind: 'boxes', x: 29.6, y: 20.4, w: 3.6, d: 2.6, solid: true },
];

export const GARAGE_DOORS: Door[] = [
  // the door you come in through from the apartment, on the left wall
  { id: 'apartment', label: 'Apartment', spot: { x: 7.6, y: 5.6 }, side: 'L', span: [4.2, 7.0], to: { scene: 'Apartment', at: 'garage' } },
  { id: 'outside', label: 'Outside', spot: { x: 31.8, y: 1.4 }, side: 'B', span: [30.4, 33.2], soon: 'Outside — coming soon' },
];

export const GARAGE_SPAWN: V = { x: 20.0, y: 13.0 };
export const GARAGE: RoomDef = { id: 'garage', furniture: GARAGE_FURNITURE, doors: GARAGE_DOORS, spawn: GARAGE_SPAWN };
