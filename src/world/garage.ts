import { Piece, Door, RoomDef, V, alongLeftWall, alongRightWall } from './apartment';

/**
 * The garage gym behind the apartment's left door (round 37), laid out like the owner's reference, in the same
 * cutaway frame as the apartment. Orientations follow the reference: bench press long axis left→right with the bar
 * running into the room, squat rack facing us, treadmill console at the back (you run facing the wall), the hoop with
 * its back to the left wall facing right, the van parked along the right wall nose toward the camera.
 */
export const GARAGE_FURNITURE: Piece[] = [
  { id: 'bench', kind: 'bench', x: 10.4, y: 2.2, w: 6.2, d: 3.0, solid: true },
  { id: 'squatRack', kind: 'squatRack', x: 18.4, y: 0.3, w: 4.8, d: 3.0, solid: true },
  { id: 'treadmill', kind: 'treadmill', x: 26.8, y: 0.5, w: 2.8, d: 6.4, solid: true },
  // portable hoop like the arena's: base against the left wall, board + rim facing right into the room
  { id: 'hoop', kind: 'hoop', x: 0.0, y: 13.2, w: 6.4, d: 4.0, solid: true, poly: alongLeftWall(13.2, 17.2, 3.1) },
  // the van along the right wall, nose toward the camera
  { id: 'van', kind: 'van', x: 30.0, y: 11.0, w: 14, d: 11.6, solid: true, poly: alongRightWall(11.0, 22.6, 6.2) },
  { id: 'boxesL', kind: 'boxes', x: 2.3, y: 20.6, w: 3.4, d: 2.6, solid: true },
  { id: 'kettlebells', kind: 'kettlebells', x: 6.2, y: 22.0, w: 1.9, d: 1.2, solid: true },
  { id: 'boxesR', kind: 'boxes', x: 29.6, y: 20.4, w: 3.6, d: 2.6, solid: true },
];

export const GARAGE_DOORS: Door[] = [
  { id: 'house', label: 'House', spot: { x: 31.8, y: 1.4 }, side: 'B', span: [30.4, 33.2], to: { scene: 'Apartment', at: 'garage' } },
];

export const GARAGE_SPAWN: V = { x: 20.0, y: 13.0 };
export const GARAGE: RoomDef = { id: 'garage', furniture: GARAGE_FURNITURE, doors: GARAGE_DOORS, spawn: GARAGE_SPAWN };
