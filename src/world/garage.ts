import { Piece, Door, RoomDef, Station, V, Poly, alongLeftWall, wallR } from './apartment';

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
  // the back-wall door goes back into the apartment (you come in through it too)
  { id: 'apartment', label: 'Apartment', spot: { x: 31.8, y: 1.4 }, side: 'B', span: [30.4, 33.2], to: { scene: 'Apartment', at: 'garage' } },
  // the left-wall door: outside (not yet)
  { id: 'outside', label: 'Outside', spot: { x: 7.6, y: 5.6 }, side: 'L', span: [4.2, 7.0], soon: 'Outside: coming soon' },
];

export const GARAGE_SPAWN: V = { x: 20.0, y: 12.6 };
/** The red square you shoot from (same depth as the rim, straight out from it). */
export const SHOT_MARK: V = { x: 20.6, y: 15.2 };

/** Workouts (round 38): stand at the spot, ✕ to start, ✕ / L1 to stop. */
export const GARAGE_STATIONS: Station[] = [
  // squat inside the rack, facing us (the rack faces the camera), the bar across the shoulders
  { id: 'squat', label: 'Squat', spot: { x: 20.8, y: 4.4 }, at: { x: 20.8, y: 1.9 }, clip: 'squat', period: 2.6, yaw: 90, flip: false, lift: 0, depthFt: 3.2 },
  // bench press lying along the bench (long axis left→right), head under the uprights at the left end
  { id: 'bench', label: 'Bench press', spot: { x: 14.4, y: 6.2 }, at: { x: 14.3, y: 3.7 }, clip: 'benchPress', period: 2.4, yaw: 0, flip: false, lift: 0, depthFt: 5.3 },
  // dribbling on the mat: low wide stance facing us (like the owner's reference), the ball pounded beside you
  { id: 'dribble', label: 'Dribble', spot: { x: 19.4, y: 10.2 }, at: { x: 19.4, y: 10.4 }, clip: 'mat_pound', period: 0.5, yaw: 90, flip: false, lift: 0 },
  // shooting: a red square straight out from the rim; jump shots facing the hoop (to the left)
  { id: 'shoot', label: 'Shoot', spot: { x: 20.6, y: 15.2 }, at: { x: 20.6, y: 15.2 }, clip: 'shot_jumper', period: 2.7, yaw: 0, flip: true, lift: 0, shotDur: 1.1 },
  // treadmill: on the belt, running toward the console (back to us)
  { id: 'treadmill', label: 'Treadmill', spot: { x: 28.2, y: 7.9 }, at: { x: 28.2, y: 4.6 }, clip: 'jog', period: 0.62, yaw: -90, flip: false, lift: 0.65, depthFt: 7.0 },
];
export const GARAGE: RoomDef = { id: 'garage', furniture: GARAGE_FURNITURE, doors: GARAGE_DOORS, spawn: GARAGE_SPAWN, stations: GARAGE_STATIONS };
