import { RoomDef, Station, V } from './apartment';
import { GARAGE_FURNITURE, GARAGE_STATIONS } from './garage';

/**
 * Round 85 (owner): the arena gym: the combine and the teams' tryouts happen on an arena floor (empty stands, scouts on
 * the bench), with the machines brought out onto the court. It keeps the garage's floor plan and frame, so the hoop
 * (against the left wall, facing right), the squat rack and the bench press sit exactly where they do in the garage
 * (the garage's rim and stations work unchanged). New here: the vertical jump spot by its measuring pole, and a lap
 * course around the court for the sprint. Phaser-free.
 */
export const ARENA_FURNITURE = GARAGE_FURNITURE.filter((p) => ['bench', 'squatRack', 'hoop'].includes(p.id));

/** The vertical jump: you stand beside the measuring pole (the vanes reach out over you). */
export const JUMP_SPOT: V = { x: 29.4, y: 12.8 };
export const VERTEC: V = { x: 31.2, y: 12.2 };

/** The sprint: laps around the court, corner to corner (clockwise as seen from above: right along the back first). */
export const LAPS: V[] = [{ x: 9.5, y: 7.6 }, { x: 34.0, y: 7.6 }, { x: 34.0, y: 20.4 }, { x: 9.5, y: 20.4 }];
const SEGS = LAPS.map((a, i) => { const b = LAPS[(i + 1) % LAPS.length]; return { a, b, len: Math.hypot(b.x - a.x, b.y - a.y) }; });
export const LAP_LEN = SEGS.reduce((s, g) => s + g.len, 0);
/** Where you are `d` feet into the laps, and which way you're running. */
export function lapPoint(d: number): { p: V; dir: V } {
  let r = ((d % LAP_LEN) + LAP_LEN) % LAP_LEN;
  for (const g of SEGS) {
    if (r <= g.len) { const k = r / g.len; return { p: { x: g.a.x + (g.b.x - g.a.x) * k, y: g.a.y + (g.b.y - g.a.y) * k }, dir: { x: (g.b.x - g.a.x) / g.len, y: (g.b.y - g.a.y) / g.len } }; }
    r -= g.len;
  }
  return { p: { ...LAPS[0] }, dir: { x: 1, y: 0 } };
}

export const ARENA_STATIONS: Station[] = [
  ...GARAGE_STATIONS.filter((s) => ['squat', 'bench', 'dribble', 'shoot'].includes(s.id)),
  // the jump: facing us, a crouch, then up with the arms reaching for the vanes
  { id: 'jump', label: 'Vertical jump', spot: JUMP_SPOT, at: JUMP_SPOT, clip: 'squat', period: 2, yaw: 90, flip: false, lift: 0 },
  // the sprint: running laps (the scene moves `at` along the course every frame)
  { id: 'laps', label: 'Sprint', spot: LAPS[0], at: LAPS[0], clip: 'jog', period: 0.62, yaw: 0, flip: false, lift: 0 },
];

export const ARENA_GYM: RoomDef = { id: 'arenaGym', furniture: ARENA_FURNITURE, doors: [], spawn: { x: 24, y: 12.6 }, stations: ARENA_STATIONS };
