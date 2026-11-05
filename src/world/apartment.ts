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
  | 'bookshelf' | 'wardrobe' | 'diningTable' | 'chairL' | 'chairR' | 'chairBack' | 'box' | 'ball' | 'plant';

/** x/y/w/d = bounding footprint; `poly` (optional) = the real footprint when it isn't a rectangle (along a slanted wall). */
export interface Piece { id: string; kind: Kind; x: number; y: number; w: number; d: number; solid: boolean; poly?: Poly }

/** Furniture footprints (feet). Arrangement follows the owner's reference room; art is in render/roomArt.ts. */
export const FURNITURE: Piece[] = [
  { id: 'fridge', kind: 'fridge', x: 9.2, y: 0, w: 3.1, d: 2.6, solid: true },
  { id: 'counter', kind: 'counter', x: 12.3, y: 0, w: 6.6, d: 2.3, solid: true },
  { id: 'island', kind: 'island', x: 15.6, y: 4.4, w: 3.55, d: 8.2, solid: true },
  { id: 'lamp', kind: 'lamp', x: 21.0, y: 0.6, w: 1.2, d: 1.0, solid: true },
  { id: 'couch', kind: 'couch', x: 22.6, y: 0.2, w: 8.4, d: 3.1, solid: true },
  { id: 'tank', kind: 'tank', x: 31.4, y: 0.2, w: 3.4, d: 2.7, solid: true },
  { id: 'tvTable', kind: 'tvTable', x: 23.6, y: 7.0, w: 3.0, d: 2.0, solid: true },
  { id: 'coffeeTable', kind: 'coffeeTable', x: 28.0, y: 7.4, w: 4.2, d: 2.2, solid: true },
  { id: 'armchair', kind: 'armchair', x: 33.8, y: 9.6, w: 3.4, d: 3.0, solid: true },
  { id: 'bookshelf', kind: 'bookshelf', x: 37.0, y: 13.8, w: 5.6, d: 8.6, solid: true, poly: alongRightWall(13.8, 22.4, 1.9) },
  { id: 'wardrobe', kind: 'wardrobe', x: 1.6, y: 16.6, w: 3.0, d: 3.2, solid: true },
  { id: 'diningTable', kind: 'diningTable', x: 17.6, y: 17.6, w: 7.2, d: 3.6, solid: true },
  { id: 'chairL', kind: 'chairL', x: 16.0, y: 18.4, w: 1.5, d: 1.8, solid: true },
  { id: 'chairR', kind: 'chairR', x: 24.9, y: 18.4, w: 1.5, d: 1.8, solid: true },
  { id: 'chairBack', kind: 'chairBack', x: 19.4, y: 15.9, w: 1.7, d: 1.6, solid: true },
  { id: 'box', kind: 'box', x: 37.6, y: 22.4, w: 2.4, d: 1.6, solid: true },
  { id: 'ball', kind: 'ball', x: 36.4, y: 21.0, w: 1.0, d: 0.8, solid: false },
];

/** Doors: ✕ within reach of `spot` uses them. */
export interface Door { id: 'garage' | 'front'; label: string; spot: V; wallY: [number, number] }
export const DOORS: Door[] = [
  { id: 'garage', label: 'Garage', spot: { x: 6.4, y: 9.6 }, wallY: [6.9, 12.3] },
  { id: 'front', label: 'Leave', spot: { x: 34.4, y: 5.9 }, wallY: [3.7, 8.3] },
];

export const PLAYER_R = 0.8;
export const SPAWN: V = { x: 20.5, y: 9.5 };

function alongRightWall(y0: number, y1: number, depth: number): Poly {
  return [{ x: wallR(y0) - depth, y: y0 }, { x: wallR(y0) + 1, y: y0 }, { x: wallR(y1) + 1, y: y1 }, { x: wallR(y1) - depth, y: y1 }];
}

const rect = (x: number, y: number, w: number, d: number): Poly => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + d }, { x, y: y + d }];

/** A piece's footprint polygon. */
export const footprint = (p: Piece): Poly => p.poly ?? rect(p.x, p.y, p.w, p.d);

/** Everything solid: furniture footprints + the four walls (big polygons outside the floor). */
export function solids(extra: Poly[] = []): Poly[] {
  const F = ROOM.depth, far = 60;
  const walls: Poly[] = [
    rect(-far, -far, far * 3, far),                                                            // back wall
    [{ x: -far, y: -1 }, { x: wallL(-1), y: -1 }, { x: wallL(F + 1), y: F + 1 }, { x: -far, y: F + 1 }], // left wall
    [{ x: wallR(-1), y: -1 }, { x: far, y: -1 }, { x: far, y: F + 1 }, { x: wallR(F + 1), y: F + 1 }],     // right wall
    rect(-far, F, far * 3, far),                                                               // front edge
  ];
  return [...walls, ...FURNITURE.filter((p) => p.solid).map(footprint), ...extra];
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

/** The door within reach of p (closest first), if any. */
export function doorNear(p: V, reach = 1.6): Door | null {
  let best: Door | null = null, bd = reach;
  for (const d of DOORS) { const k = Math.hypot(p.x - d.spot.x, p.y - d.spot.y); if (k <= bd) { bd = k; best = d; } }
  return best;
}

// ---------- the cat ----------
export interface Cat { p: V; target: V | null; state: 'sit' | 'walk' | 'loaf'; until: number; face: 1 | -1 }
export const CAT_R = 0.55;
/** Favourite spots (in front of the couch, by the armchair, under the window, by the fridge). */
export const CAT_SPOTS: V[] = [{ x: 28.4, y: 4.4 }, { x: 32.2, y: 11.8 }, { x: 21.6, y: 3.0 }, { x: 13.2, y: 3.4 }, { x: 28.5, y: 13.0 }, { x: 11.5, y: 13.0 }];
export const newCat = (): Cat => ({ p: { ...CAT_SPOTS[0] }, target: null, state: 'loaf', until: 4, face: 1 });

/** One cat tick: loaf / sit at a spot, then trot to another one (cosmetic randomness only). */
export function catStep(cat: Cat, t: number, dt: number, polys: Poly[], rand: () => number = Math.random) {
  if (cat.state === 'walk' && cat.target) {
    const dx = cat.target.x - cat.p.x, dy = cat.target.y - cat.p.y, d = Math.hypot(dx, dy);
    if (d < 0.3 || t > cat.until) { cat.state = rand() < 0.5 ? 'loaf' : 'sit'; cat.until = t + 5 + rand() * 9; cat.target = null; return; }
    const sp = 3.2 * dt;
    const before = cat.p;
    cat.p = moveWithCollision(cat.p, { x: (dx / d) * sp, y: (dy / d) * sp }, CAT_R, polys);
    if (Math.abs(dx) > 0.05) cat.face = dx > 0 ? 1 : -1;
    // stuck on furniture: sidestep a little
    if (Math.hypot(cat.p.x - before.x, cat.p.y - before.y) < sp * 0.2) cat.p = moveWithCollision(cat.p, { x: 0, y: (dy >= 0 ? 1 : -1) * sp }, CAT_R, polys);
    return;
  }
  if (t > cat.until) {
    const options = CAT_SPOTS.filter((s) => Math.hypot(s.x - cat.p.x, s.y - cat.p.y) > 2);
    cat.target = options[Math.floor(rand() * options.length)] ?? CAT_SPOTS[0];
    cat.state = 'walk'; cat.until = t + 12;
  }
}
