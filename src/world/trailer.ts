import { Piece, RoomDef, V, rect } from './apartment';

/**
 * Round 57: the trailer yard — the "Lights on a generator" backstory place (the owner's photo + sketch).
 * An open yard in the rooms' frame (same feet → screen mapping, so you're the same size as at home): the old camper
 * along the back, long side to us (rounded end with the big window on the left, the door centre-right), wooden steps
 * up to the door, the rusty hitch pointing left, the generator right of the steps with its cord running to the
 * trailer, a chest cooler in the front right, bushes and a chain-link fence on the right. Pure (no Phaser).
 */
/** The trailer's front face (depth, ft) and its x extent. */
export const TRAILER = { x0: 2.0, x1: 34.0, front: 1.0, floorFt: 2.0, bodyBottomFt: 1.4, topFt: 9.2 };
/** The door (x range, ft) and the three steps in front of it: [depth from, depth to, height ft], top step first. */
export const DOOR_X: [number, number] = [19.1, 22.0];
export const STEPS = { x0: 18.5, x1: 22.6, rows: [[1.0, 2.2, 1.8], [2.2, 3.2, 1.2], [3.2, 4.2, 0.6]] as [number, number, number][] };
/** Where you stand to open the door: on the top step. */
export const DOOR_SPOT: V = { x: 20.5, y: 1.95 };

export const TRAILER_FURNITURE: Piece[] = [
  // the door is its own picture (closed / open) on the trailer's face; not solid (the trailer is)
  { id: 'door', kind: 'trailerDoor', x: DOOR_X[0], y: 0, w: DOOR_X[1] - DOOR_X[0], d: TRAILER.front, solid: false },
  { id: 'hitch', kind: 'hitch', x: -4.6, y: 0.2, w: 6.6, d: 1.6, solid: true },
  { id: 'barrel', kind: 'barrel', x: 13.2, y: 0.9, w: 2.6, d: 1.4, solid: true },
  // round 57c: further right and back, by the trailer's right end
  { id: 'generator', kind: 'generator', x: 31.0, y: 1.3, w: 4.0, d: 2.2, solid: true },
  { id: 'cooler', kind: 'cooler', x: 36.2, y: 17.2, w: 5.0, d: 3.2, solid: true },
  { id: 'bush', kind: 'bush', x: 40.5, y: 0.2, w: 7.0, d: 8.0, solid: true },
];

/** How high you stand (ft): on one of the steps, else the ground. */
export function liftAt(p: V): number {
  if (p.x < STEPS.x0 - 0.3 || p.x > STEPS.x1 + 0.3) return 0;
  for (const [y0, y1, h] of STEPS.rows) if (p.y >= y0 && p.y < y1) return h;
  return 0;
}

export const TRAILER_SPAWN: V = { x: 24.0, y: 18.0 };
/** Round 57c: the end of the path (front edge of the yard): ✕ here leaves. A mailbox marks it. */
export const PATH_END: V = { x: 20.6, y: 22.3 };
export const TRAILER_YARD: RoomDef = {
  id: 'trailer', furniture: TRAILER_FURNITURE, doors: [], spawn: TRAILER_SPAWN, leftX: -6.2, rightX: 47.5, liftAt,
};
/** The trailer itself is solid (it's drawn in the background, so the scene adds this as an obstacle). */
export const TRAILER_SOLID = rect(TRAILER.x0, -1, TRAILER.x1 - TRAILER.x0, TRAILER.front + 1);
