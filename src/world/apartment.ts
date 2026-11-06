/**
 * The starter apartment: room layout in feet + collision. Pure (no Phaser), so it's unit-tested.
 *
 * Room feet: x across the screen (0 = inner edge of the left brick post), y = depth (0 = back wall, ~24 = front).
 * Screen (1280x720 scene units): sx = ROOM.ox + x * RS, sy = ROOM.oy + y * RD. Players use the court's 22 px/ft
 * horizontally and for height, so they're the same size as on court; depth is stretched (RD) for the 3/4 view.
 * The side walls slant inward toward the back (cutaway look), so the walkable floor is a trapezoid.
 */

export interface V { x: number; y: number }
/** A convex polygon on the floor (feet), counter-clockwise or clockwise — either works. */
export type Poly = V[];

export const RS = 22;   // scene px per foot across (and per foot of height)
export const RD = 14;   // scene px per foot of depth
export const ROOM = {
  ox: 172, oy: 385,     // screen position of (0, 0): left post inner edge, back-wall floor line
  depth: 23.6,          // front edge of the walkable floor (feet)
  backL: 8.18,          // left wall at the back (x at y = 0)
  backR: 33.9,          // right wall at the back
  slopeL: -7.52 / RS,   // left wall moves this many feet in x per foot of depth (toward the front = outward)
  slopeR: 8.53 / RS,
};
export const sxOf = (x: number) => ROOM.ox + x * RS;
export const syOf = (y: number) => ROOM.oy + y * RD;
export const wallL = (y: number) => ROOM.backL + ROOM.slopeL * y; // feet
export const wallR = (y: number) => ROOM.backR + ROOM.slopeR * y;

export type Kind =
  | 'fridge' | 'counter' | 'island' | 'lamp' | 'couch' | 'tank' | 'tvTable' | 'coffeeTable' | 'armchair'
  | 'bookshelf' | 'wardrobe' | 'diningTable' | 'chairL' | 'chairR' | 'chairBack' | 'box' | 'ball' | 'plant' | 'trash'
  // garage (round 37)
  | 'bench' | 'squatRack' | 'treadmill' | 'hoop' | 'van' | 'car' | 'boxes' | 'kettlebells' | 'jumpRope'
  | 'trailerDoor' | 'hitch' | 'barrel' | 'generator' | 'cooler' | 'bush';

/** x/y/w/d = bounding footprint; `poly` (optional) = the real footprint when it isn't a rectangle (along a slanted wall). */
export interface Piece { id: string; kind: Kind; x: number; y: number; w: number; d: number; solid: boolean; poly?: Poly }

/** Furniture footprints (feet). Arrangement follows the owner's reference room; art is in render/roomArt.ts. */
export const FURNITURE: Piece[] = [
  { id: 'fridge', kind: 'fridge', x: 9.2, y: 0, w: 3.1, d: 2.6, solid: true },
  { id: 'counter', kind: 'counter', x: 12.3, y: 0, w: 6.65, d: 2.3, solid: true },
  // a peninsula joined to the back counter (cabinet doors on its left side, cooktop + fume hood, pole at the end)
  { id: 'island', kind: 'island', x: 15.4, y: 2.3, w: 3.55, d: 9.4, solid: true },
  { id: 'lamp', kind: 'lamp', x: 21.0, y: 0.6, w: 1.2, d: 1.0, solid: true },
  { id: 'couch', kind: 'couch', x: 22.6, y: 0.2, w: 8.4, d: 3.1, solid: true },
  { id: 'tank', kind: 'tank', x: 31.4, y: 0.2, w: 3.4, d: 2.7, solid: true },
  // couch -> coffee table -> TV (the TV faces the couch, so we see its back)
  { id: 'coffeeTable', kind: 'coffeeTable', x: 24.3, y: 4.9, w: 5.0, d: 1.6, solid: true },
  { id: 'tvTable', kind: 'tvTable', x: 25.3, y: 9.8, w: 3.0, d: 1.5, solid: true },
  { id: 'armchair', kind: 'armchair', x: 33.8, y: 9.6, w: 3.4, d: 3.0, solid: true },
  { id: 'bookshelf', kind: 'bookshelf', x: 37.0, y: 13.8, w: 5.6, d: 8.6, solid: true, poly: alongRightWall(13.8, 22.4, 1.9) },
  // against the left wall, doors facing right into the room
  { id: 'wardrobe', kind: 'wardrobe', x: 0.4, y: 16.0, w: 4.2, d: 3.6, solid: true, poly: alongLeftWall(16.0, 19.6, 2.1) },
  { id: 'diningTable', kind: 'diningTable', x: 17.6, y: 17.6, w: 7.2, d: 3.6, solid: true },
  { id: 'chairL', kind: 'chairL', x: 16.0, y: 18.4, w: 1.5, d: 1.8, solid: true },
  { id: 'chairR', kind: 'chairR', x: 24.9, y: 18.4, w: 1.5, d: 1.8, solid: true },
  { id: 'chairBack', kind: 'chairBack', x: 19.4, y: 15.9, w: 1.7, d: 1.6, solid: true },
  // trash can by the kitchen: paper balls inside, missed shots on the floor around it
  { id: 'trash', kind: 'trash', x: 12.8, y: 14.6, w: 1.4, d: 1.2, solid: true },
  { id: 'box', kind: 'box', x: 37.6, y: 22.4, w: 2.4, d: 1.6, solid: true },
  { id: 'ball', kind: 'ball', x: 32.6, y: 15.6, w: 1.0, d: 0.8, solid: true },
];

/**
 * Doors: ✕ within reach of `spot` uses them. `side` = which wall; `span` = its extent along that wall (depth range for
 * the side walls, x range for the back wall). `to` = the scene it leads to and the door you arrive at there.
 */
export interface Door { id: string; label: string; spot: V; side: 'L' | 'R' | 'B'; span: [number, number]; to?: { scene: string; at?: string }; soon?: string }
export const DOORS: Door[] = [
  { id: 'garage', label: 'Garage', spot: { x: 6.4, y: 9.6 }, side: 'L', span: [8.1, 11.1], to: { scene: 'Garage', at: 'apartment' } },
  { id: 'front', label: 'Leave', spot: { x: 34.4, y: 5.9 }, side: 'R', span: [4.5, 7.4], to: { scene: 'Title' } },
];

/** Things you'll use later (no action yet): where you stand to use them. */
export const SPOTS = {
  calendar: { x: 7.9, y: 4.4 },   // on the left wall (the garage-door wall), next to the fridge
  fridge: { x: 10.7, y: 3.5 },
  couch: { x: 23.2, y: 4.3 },     // sleep here to end the day
};
/** The calendar on the left wall: depth range + height (ft). */
export const CALENDAR = { y0: 2.9, y1: 5.9, h0: 4.2, h1: 7.0 };

export const PLAYER_R = 0.8;
export const SPAWN: V = { x: 20.5, y: 9.5 };

export function alongLeftWall(y0: number, y1: number, depth: number): Poly {
  return [{ x: wallL(y0) - 1, y: y0 }, { x: wallL(y0) + depth, y: y0 }, { x: wallL(y1) + depth, y: y1 }, { x: wallL(y1) - 1, y: y1 }];
}
export function alongRightWall(y0: number, y1: number, depth: number): Poly {
  return [{ x: wallR(y0) - depth, y: y0 }, { x: wallR(y0) + 1, y: y0 }, { x: wallR(y1) + 1, y: y1 }, { x: wallR(y1) - depth, y: y1 }];
}

export const rect = (x: number, y: number, w: number, d: number): Poly => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + d }, { x, y: y + d }];

/** A piece's footprint polygon. */
export const footprint = (p: Piece): Poly => p.poly ?? rect(p.x, p.y, p.w, p.d);

/**
 * Draw order for something that walks around (you, the cat): furniture keeps a fixed depth (its footprint's front edge),
 * and the walker goes in front of every piece it stands behind or beside, and behind every piece that starts in front
 * of its feet. Only pieces whose picture overlaps the walker's matter (`overlaps`). Returns a depth in feet.
 */
export function actorDepthFt(pos: V, pieces: Piece[], overlaps: (p: Piece) => boolean = () => true): number {
  let lo = pos.y, hi = Infinity;
  for (const p of pieces) {
    if (!p.solid || !overlaps(p)) continue;
    const fp = footprint(p);
    const minY = Math.min(...fp.map((q) => q.y)), maxY = Math.max(...fp.map((q) => q.y));
    if (minY >= pos.y - 1e-6) hi = Math.min(hi, maxY);   // starts in front of the feet: draw over the walker
    else lo = Math.max(lo, maxY + 0.02);                  // behind or beside (can't be inside): the walker goes in front
  }
  return lo < hi ? lo : hi - 0.02;
}
/** A piece's fixed depth (feet): the front edge of its footprint. */
export const pieceDepthFt = (p: Piece) => Math.max(...footprint(p).map((q) => q.y));

/**
 * Something you can use (round 38: garage workouts). ✕ within reach of `spot` starts it: you move to `at` and loop
 * `clip` (one rep every `period` s), shown at `yaw` (0 = side view, 90 = facing us, -90 = facing away), mirrored if
 * `flip`, raised `lift` ft (standing on a treadmill deck). `depthFt` overrides the draw depth while in use.
 */
export interface Station { id: string; label: string; spot: V; at: V; clip: string; period: number; yaw: number; flip: boolean; lift: number; depthFt?: number; shotDur?: number }
/** Where in its clip (0..1) a station's animation is after t seconds: loops play straight through; one-shot clips
 * (the jump shot) play over `shotDur` s, then hold their last frame until the next rep. */
export function stationU(st: Station, t: number, loop: boolean): number {
  return loop ? t / st.period : Math.min(1, (t % st.period) / (st.shotDur ?? st.period));
}

/**
 * A walkable room: its furniture, doors, default spawn and stations (all rooms share the cutaway frame `ROOM`).
 * `rightX`: the room runs straight to a cut-off at this x (feet) instead of a slanted right wall.
 */
export interface RoomDef {
  id: string; furniture: Piece[]; doors: Door[]; spawn: V; rightX?: number; stations?: Station[];
  /** round 57: an open left side, cut off at this x (outdoors) instead of the slanted left wall */
  leftX?: number;
  /** round 57: how high you stand here (ft) — walking up steps */
  liftAt?: (p: V) => number;
}
export const APARTMENT: RoomDef = { id: 'apartment', furniture: FURNITURE, doors: DOORS, spawn: SPAWN };

/** Everything solid: furniture footprints + the four walls (big polygons outside the floor). */
export function solids(extra: Poly[] = [], room: RoomDef = APARTMENT): Poly[] {
  const F = ROOM.depth, far = 60;
  const walls: Poly[] = [
    rect(-far, -far, far * 3, far),                                                            // back wall
    room.leftX !== undefined ? rect(room.leftX - far, -far, far, far * 3)                            // open side, cut off
      : [{ x: -far, y: -1 }, { x: wallL(-1), y: -1 }, { x: wallL(F + 1), y: F + 1 }, { x: -far, y: F + 1 }], // left wall
    room.rightX !== undefined ? rect(room.rightX, -far, far, far * 3)                                // open side, cut off
      : [{ x: wallR(-1), y: -1 }, { x: far, y: -1 }, { x: far, y: F + 1 }, { x: wallR(F + 1), y: F + 1 }], // right wall
    rect(-far, F, far * 3, far),                                                               // front edge
  ];
  return [...walls, ...room.furniture.filter((p) => p.solid).map(footprint), ...extra];
}

/** Closest point on a convex polygon's boundary to p, and whether p is inside. */
function closest(poly: Poly, p: V): { q: V; inside: boolean } {
  let best: V = poly[0], bd = Infinity, sign = 0, inside = true;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x, ey = b.y - a.y, L = ex * ex + ey * ey;
    const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / L)) : 0;
    const q = { x: a.x + ex * t, y: a.y + ey * t };
    const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
    if (d < bd) { bd = d; best = q; }
    const cr = ex * (p.y - a.y) - ey * (p.x - a.x);
    if (cr !== 0) { const s = Math.sign(cr); if (sign === 0) sign = s; else if (s !== sign) inside = false; }
  }
  return { q: best, inside };
}

/** Push a circle out of every polygon it overlaps (a few passes so corners settle). */
export function resolve(p: V, r: number, polys: Poly[]): V {
  let c = { ...p };
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const poly of polys) {
      const { q, inside } = closest(poly, c);
      const dx = c.x - q.x, dy = c.y - q.y, d = Math.hypot(dx, dy);
      if (inside) {
        // centre inside: exit through the nearest edge (direction from the edge point outward)
        const n = d > 1e-9 ? { x: -dx / d, y: -dy / d } : { x: 0, y: 1 };
        c = { x: q.x + n.x * r, y: q.y + n.y * r }; moved = true;
      } else if (d < r - 1e-9) {
        c = { x: q.x + (dx / d) * r, y: q.y + (dy / d) * r }; moved = true;
      }
    }
    if (!moved) break;
  }
  return c;
}

/** Move by delta in small steps (no tunnelling), sliding along anything solid. */
export function moveWithCollision(p: V, delta: V, r: number, polys: Poly[]): V {
  const dist = Math.hypot(delta.x, delta.y);
  const steps = Math.max(1, Math.ceil(dist / (r * 0.4)));
  let c = { ...p };
  for (let i = 0; i < steps; i++) {
    const n = resolve({ x: c.x + delta.x / steps, y: c.y + delta.y / steps }, r, polys);
    // wedged between two things (a gap narrower than the body): stay put instead of overlapping
    if (!isFree(n, r * 0.99, polys)) break;
    c = n;
  }
  return c;
}

/** Is a circle at p clear of every polygon? */
export function isFree(p: V, r: number, polys: Poly[]): boolean {
  for (const poly of polys) {
    const { q, inside } = closest(poly, p);
    if (inside || Math.hypot(p.x - q.x, p.y - q.y) < r - 1e-6) return false;
  }
  return true;
}

/** The room's right boundary at depth y (feet). */
export const rightBound = (y: number, room: RoomDef = APARTMENT) => room.rightX ?? wallR(y);

/** The station within reach of p (closest first), if any. */
export function stationNear(p: V, room: RoomDef, reach = 1.4): Station | null {
  let best: Station | null = null, bd = reach;
  for (const s of room.stations ?? []) { const k = Math.hypot(p.x - s.spot.x, p.y - s.spot.y); if (k <= bd) { bd = k; best = s; } }
  return best;
}

/** The door within reach of p (closest first), if any. */
export function doorNear(p: V, reach = 1.6, room: RoomDef = APARTMENT): Door | null {
  let best: Door | null = null, bd = reach;
  for (const d of room.doors) { const k = Math.hypot(p.x - d.spot.x, p.y - d.spot.y); if (k <= bd) { bd = k; best = d; } }
  return best;
}

// ---------- simple grid pathfinding (the cat) ----------
const GRID = 0.5, GW = 90, GH = 50;
const FREE = new WeakMap<Poly[], Map<number, Uint8Array>>();
function freeGrid(polys: Poly[], r: number): Uint8Array {
  let m = FREE.get(polys); if (!m) { m = new Map(); FREE.set(polys, m); }
  let g = m.get(r);
  if (!g) { g = new Uint8Array(GW * GH); for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) g[j * GW + i] = isFree({ x: i * GRID, y: j * GRID }, r, polys) ? 1 : 0; m.set(r, g); }
  return g;
}
/** BFS over a 0.5 ft grid (8-way, no corner cutting); waypoints from `from` to `to`, or null if unreachable. */
export function findPath(from: V, to: V, r: number, polys: Poly[]): V[] | null {
  const g = freeGrid(polys, r);
  const cell = (p: V) => { const i = Math.max(0, Math.min(GW - 1, Math.round(p.x / GRID))), j = Math.max(0, Math.min(GH - 1, Math.round(p.y / GRID))); return j * GW + i; };
  const nearestFree = (k: number) => { if (g[k]) return k; let best = -1, bd = 1e9; const ci = k % GW, cj = (k / GW) | 0; for (let j = cj - 3; j <= cj + 3; j++) for (let i = ci - 3; i <= ci + 3; i++) { if (i < 0 || j < 0 || i >= GW || j >= GH || !g[j * GW + i]) continue; const d = (i - ci) ** 2 + (j - cj) ** 2; if (d < bd) { bd = d; best = j * GW + i; } } return best; };
  const a = nearestFree(cell(from)), b = nearestFree(cell(to));
  if (a < 0 || b < 0) return null;
  const prev = new Int32Array(GW * GH).fill(-1); prev[a] = a;
  const q = [a];
  for (let h = 0; h < q.length && prev[b] < 0; h++) {
    const k = q[h], i = k % GW, j = (k / GW) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
      const nk = nj * GW + ni; if (prev[nk] >= 0 || !g[nk]) continue;
      if (di && dj && (!g[j * GW + ni] || !g[nj * GW + i])) continue;
      prev[nk] = k; q.push(nk);
    }
  }
  if (prev[b] < 0) return null;
  const out: V[] = [];
  for (let k = b; k !== a; k = prev[k]) out.push({ x: (k % GW) * GRID, y: ((k / GW) | 0) * GRID });
  out.reverse(); out.push({ ...to });
  // drop waypoints on straight runs
  return out.filter((p, n) => n === out.length - 1 || n === 0 || (out[n + 1].x - p.x) !== (p.x - out[n - 1].x) || (out[n + 1].y - p.y) !== (p.y - out[n - 1].y));
}

// ---------- the cat ----------
/** The cat's home is on the couch, on the blanket; it hops down now and then to wander, then hops back up. */
export interface Cat {
  p: V; z: number; target: V | null; path: V[]; state: 'sit' | 'walk' | 'loaf'; until: number; face: 1 | -1;
  perch: boolean; home: boolean; stops: number;
  hop: { from: V; to: V; t0: number; up: boolean } | null;
}
export const CAT_R = 0.55;
export const CAT_PERCH: V = { x: 28.7, y: 1.9 };   // on the blanket
export const CAT_HOP: V = { x: 28.7, y: 4.25 };    // the floor in front of the couch
export const PERCH_Z = 1.55;                        // seat height (ft)
export const HOP_TIME = 0.45;
/** Floor spots it likes (by the lamp, under the kitchen, by the armchair, by the table, by the wardrobe). */
export const CAT_SPOTS: V[] = [{ x: 21.6, y: 3.0 }, { x: 13.2, y: 3.4 }, { x: 32.2, y: 11.8 }, { x: 28.5, y: 13.0 }, { x: 11.5, y: 13.0 }];
export const newCat = (): Cat => ({ p: { ...CAT_PERCH }, z: PERCH_Z, target: null, path: [], state: 'sit', until: 18, face: 1, perch: true, home: false, stops: 0, hop: null });

/** One cat tick (cosmetic randomness only). */
export function catStep(cat: Cat, t: number, dt: number, polys: Poly[], rand: () => number = Math.random) {
  if (cat.hop) {
    const u = Math.min(1, (t - cat.hop.t0) / HOP_TIME), h = cat.hop;
    cat.p = { x: h.from.x + (h.to.x - h.from.x) * u, y: h.from.y + (h.to.y - h.from.y) * u };
    cat.z = (h.up ? PERCH_Z * u : PERCH_Z * (1 - u)) + Math.sin(u * Math.PI) * 0.9;
    if (u >= 1) {
      cat.z = h.up ? PERCH_Z : 0; cat.perch = h.up; cat.hop = null;
      cat.state = 'sit'; cat.until = t + (h.up ? 20 + rand() * 25 : 1 + rand() * 2);
    }
    return;
  }
  if (cat.perch) {
    if (t > cat.until) {
      if (cat.state === 'sit' && rand() < 0.5) { cat.state = 'loaf'; cat.until = t + 15 + rand() * 20; return; }
      cat.hop = { from: { ...cat.p }, to: { ...CAT_HOP }, t0: t, up: false }; cat.face = rand() < 0.5 ? 1 : -1;
    }
    return;
  }
  if (cat.state === 'walk' && cat.target) {
    const goal = cat.path[0] ?? cat.target;
    if (cat.path.length > 1 && Math.hypot(goal.x - cat.p.x, goal.y - cat.p.y) < 0.35) { cat.path.shift(); return; }
    const dx = goal.x - cat.p.x, dy = goal.y - cat.p.y;
    const d = Math.hypot(cat.target.x - cat.p.x, cat.target.y - cat.p.y), dg = Math.hypot(dx, dy) || 1;
    if (d < 0.3 || t > cat.until) {
      cat.target = null;
      if (cat.home && d < 0.6) { cat.home = false; cat.stops = 0; cat.hop = { from: { ...cat.p }, to: { ...CAT_PERCH }, t0: t, up: true }; return; }
      cat.home = false; cat.stops++;
      cat.state = rand() < 0.5 ? 'loaf' : 'sit'; cat.until = t + 4 + rand() * 7; return;
    }
    const sp = 3.2 * dt;
    const before = cat.p;
    cat.p = moveWithCollision(cat.p, { x: (dx / dg) * Math.min(sp, dg), y: (dy / dg) * Math.min(sp, dg) }, CAT_R, polys);
    if (Math.abs(dx) > 0.05) cat.face = dx > 0 ? 1 : -1;
    // stuck on furniture: sidestep a little
    if (Math.hypot(cat.p.x - before.x, cat.p.y - before.y) < sp * 0.2) cat.p = moveWithCollision(cat.p, { x: 0, y: (dy >= 0 ? 1 : -1) * sp }, CAT_R, polys);
    return;
  }
  if (t > cat.until) {
    // after a stop or two, head home to the couch
    if (cat.stops >= 1 && rand() < 0.35 + cat.stops * 0.25) { cat.target = { ...CAT_HOP }; cat.home = true; }
    else {
      const options = CAT_SPOTS.filter((s) => Math.hypot(s.x - cat.p.x, s.y - cat.p.y) > 2);
      cat.target = options[Math.floor(rand() * options.length)] ?? CAT_SPOTS[0];
    }
    cat.path = findPath(cat.p, cat.target, CAT_R, polys) ?? [cat.target];
    cat.state = 'walk'; cat.until = t + 20;
  }
}
