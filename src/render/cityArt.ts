import Phaser from 'phaser';
import { ART_W, ART_H, C, R, P, hn, mix, bake, canvas, text3 } from './roomArt';
import { shade, tint } from './sprites';
import { PLACES, PlaceId } from '../world/city';

/**
 * Round 92 (owner): the city map, drawn in code on the room art's pixel grid (960x540 art px). An isometric town
 * like the owner's reference (blocks of buildings between roads on the 2:1 diagonals, the stat bar across the top),
 * in our style (3-4 tone ramps, dark coloured outlines, light from the top left), built around its own landmarks:
 * a snow-capped ridge across the top left, a waterfall off it, the river down through the middle with a wooded
 * island, two bridges (road + rail), and a reservoir behind a dam at the bottom right.
 *
 * The ground is painted per pixel (water, banks, roads, rail, lots), the mountain on top, then every building and
 * tree in depth order. Each place on the map is its own baked sprite so the scene can lift and ring it.
 */

// ---------------------------------------------------------------- the iso grid
const OX = 480, OY = 0;
/** World (u, v) → art px. u runs down-right, v down-left (2:1). */
export const iso = (u: number, v: number) => ({ x: OX + (u - v) * 2, y: OY + (u + v) });
/** Art px → world. */
export const world = (x: number, y: number) => ({ u: ((x - OX) / 2 + (y - OY)) / 2, v: ((y - OY) - (x - OX) / 2) / 2 });
/** A block is BLOCK world units on a side; ROAD of it is road. */
const BLOCK = 36, ROAD = 4;
/** The rail line runs along u in this band (and its yard widens it); north of the river it ends at a little station. */
const RAIL: [number, number] = [156, 164], RAIL_END_V = 136;

type Pt = { x: number; y: number };

// ---------------------------------------------------------------- noise
/** Smooth value noise in [0, 1). */
function vnoise(x: number, y: number, s: number, seed = 0) {
  const fx = x / s, fy = y / s, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const a = hn(ix, iy, seed), b = hn(ix + 1, iy, seed), c = hn(ix, iy + 1, seed), d = hn(ix + 1, iy + 1, seed);
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}
/** Deterministic little RNG (art only, never the sim's). */
function rng(seed: number) { let s = ((((seed * 9301 + 49297) % 233280) + 233280) % 233280) || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// ---------------------------------------------------------------- landmarks
/** The river: points (art px) with its half width; it starts at the waterfall's pool and ends in the reservoir. */
const RIVER: [number, number, number][] = [
  [214, 216, 11], [236, 226, 9], [262, 236, 8], [296, 246, 7], [340, 257, 8], [384, 273, 9], [428, 292, 10], [470, 310, 10],
  [512, 326, 11], [556, 344, 12], [600, 362, 12], [644, 381, 13], [690, 402, 15], [736, 424, 16], [780, 442, 18], [830, 458, 20],
];
/** Below the dam the river runs on off the bottom of the map. */
const OUTFLOW: [number, number, number][] = [[722, 516, 5], [714, 532, 6], [706, 548, 6]];
const POOL = { x: 214, y: 214, r: 17 };
const RES = { x: 842, y: 464, rx: 150, ry: 66 };
const ISLAND = { x: 682, y: 402, rx: 13, ry: 5 };
/** Where the road and the rail cross the river. */
const ROAD_BRIDGE = { x: 604, y: 364 }, RAIL_BRIDGE = { x: 482, y: 316 };
/** The dam across the reservoir's outlet (art px ends). */
const DAM: [Pt, Pt] = [{ x: 700, y: 503 }, { x: 748, y: 527 }];

function segDist(px: number, py: number, pts: [number, number, number][]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay, aw] = pts[i], [bx, by, bw] = pts[i + 1];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
    const d = Math.hypot(px - ax - dx * t, py - ay - dy * t) - (aw + (bw - aw) * t);
    if (d < best) best = d;
  }
  return best;
}
/** Signed distance to the water's edge (negative = in the water). */
export function waterDist(x: number, y: number): number {
  const wob = (vnoise(x, y, 9, 3) - 0.5) * 3;
  let d = Math.min(segDist(x, y, RIVER), segDist(x, y, OUTFLOW)) + wob;
  d = Math.min(d, Math.hypot(x - POOL.x, (y - POOL.y) * 1.6) - POOL.r);
  const e = Math.hypot((x - RES.x) / RES.rx, (y - RES.y) / RES.ry);
  d = Math.min(d, (e - 1) * RES.ry * 0.9 + wob * 2);
  // below the dam the reservoir stops
  if (y > lineY(DAM, x) + 1 && x < DAM[1].x + 30 && x > DAM[0].x - 40) d = Math.max(d, segDist(x, y, OUTFLOW) + wob);
  // the island
  const ie = Math.hypot((x - ISLAND.x) / ISLAND.rx, (y - ISLAND.y) / ISLAND.ry);
  if (ie < 1) d = Math.max(d, (1 - ie) * 6);
  return d;
}
function lineY(l: [Pt, Pt], x: number) { const [a, b] = l; return a.y + ((x - a.x) * (b.y - a.y)) / (b.x - a.x); }

/** The foot of the ridge: the mountain is above this line (art px). */
const FOOT: [number, number][] = [[0, 272], [120, 260], [190, 228], [232, 214], [300, 196], [380, 184], [440, 166], [500, 128], [540, 98], [584, 70], [620, 40], [640, 0]];
export function footY(x: number): number {
  if (x >= FOOT[FOOT.length - 1][0]) return -1;
  for (let i = 0; i + 1 < FOOT.length; i++) {
    const [ax, ay] = FOOT[i], [bx, by] = FOOT[i + 1];
    if (x >= ax && x <= bx) return ay + ((x - ax) * (by - ay)) / (bx - ax);
  }
  return FOOT[0][1];
}
/** The peaks: apex, how fast the flanks fall (y per x), how far down the snow reaches. */
const PEAKS = [
  // the far range behind (mostly under the stat bar)
  { x: 330, y: 22, s: 0.5, snow: 16 }, { x: 470, y: 30, s: 0.55, snow: 12 }, { x: 600, y: 8, s: 0.6, snow: 14 },
  { x: -24, y: 58, s: 0.55, snow: 18 },
  { x: 108, y: 18, s: 0.6, snow: 36 },
  { x: 262, y: 86, s: 0.62, snow: 22 },
  { x: 410, y: 110, s: 0.7, snow: 12 },
  { x: 520, y: 80, s: 0.95, snow: 0 },
];
/** Which peak's flank a pixel is on (the nearest in front), or -1 off the mountain. */
function peakAt(x: number, y: number): number {
  const f = footY(x);
  if (f < 0 || y > f + (vnoise(x, 0, 7, 11) - 0.5) * 6) return -1;
  let best = -1, by = -Infinity;
  for (let i = 0; i < PEAKS.length; i++) {
    const p = PEAKS[i], jag = (vnoise(x, y, 5, 20 + i) - 0.5) * 7;
    if (y >= p.y + Math.abs(x - p.x) * p.s + jag && p.y > by) { best = i; by = p.y; }
  }
  return best;
}
const onMountain = (x: number, y: number) => peakAt(x, y) >= 0;

/** The places' ground: nothing else is built here (art px radius). */
const KEEP_CLEAR: Partial<Record<PlaceId, number>> = { cabin: 22 };
/**
 * Round 95 (owner: the arena, the gym and Burger Barn looked like they sat on top of buildings): each place's real
 * footprint in world units around its anchor [du0, dv0, du1, dv1] (the extents its art draws its lot and buildings
 * with); the generated town keeps out of it (plus a margin), so the lot sits flush with the streets around it.
 */
const PLACE_LOT: Partial<Record<PlaceId, [number, number, number, number]>> = {
  home: [-12, -12, 8, 6], arena: [-28, -28, 28, 28], gym: [-15, -12, 11, 8], trailer: [-8, -4, 9, 5],
  lincoln: [-18, -18, 10, 8], burger: [-12, -10, 10, 8], park: [-13, -11, 13, 11], gas: [-12, -10, 12, 9],
};
const LOT_ANCHORS = PLACES.map((p) => ({ id: p.id, w: world(p.at.x, p.at.y), at: p.at }));
/** Scenery with its own drawing (the trailhead at the mountain foot). */
const TRAILHEAD = { x: 150, y: 262 };
/** Round 93: the interstate east: an elevated deck along u (world), ramping up out of the downtown grid. */
const HWY = { v0: 72, v1: 86, u0: 212, u1: 350, ramp: 20, h: 12 };
const underHighway = (u: number, v: number) => u > HWY.u0 - 6 && v > HWY.v0 - 4 && v < HWY.v1 + 4;
function nearPlace(x: number, y: number, pad = 0): boolean {
  const w = world(x, y), m = 2 + pad / 2;
  for (const p of LOT_ANCHORS) {
    const lot = PLACE_LOT[p.id], r = KEEP_CLEAR[p.id];
    if (lot && w.u >= p.w.u + lot[0] - m && w.u <= p.w.u + lot[2] + m && w.v >= p.w.v + lot[1] - m && w.v <= p.w.v + lot[3] + m) return true;
    if (r !== undefined && Math.hypot(x - p.at.x, (y - p.at.y) * 1.6) < r + pad) return true;
  }
  return Math.hypot(x - TRAILHEAD.x, (y - TRAILHEAD.y) * 1.6) < 24 + pad;
}

// ---------------------------------------------------------------- zones
type Zone = 'down' | 'shop' | 'rich' | 'trailer' | 'res' | 'park' | 'forest' | 'field';
function zoneAt(x: number, y: number): Zone {
  const f = footY(x);
  if ((f >= 0 && y < f + 26 + vnoise(x, y, 18, 5) * 26) || (x < 110 && y < 410) || (x > 860 && y < 120 && vnoise(x, y, 30, 6) > 0.4)) return 'forest';
  if (x < 236 && y > 476) return 'field';
  if (Math.hypot(x - 470, (y - 244) * 1.5) < 52) return 'park';
  if (waterDist(x, y) < 18) return 'park';
  if (Math.hypot((x - 650) / 168, (y - 258) / 80) < 1 && y < 360) return 'down';
  if (Math.hypot((x - 650) / 168, (y - 258) / 80) < 1.45 && hn(Math.floor(x / 40), Math.floor(y / 30), 8) < 0.55) return 'shop';
  // round 93 (owner): the south is the trailer park; the hills north of the arena are the nice houses
  if (x > 244 && x < 720 && y > 394) return 'trailer';
  if ((y < 238 && x > 500) || (x > 800 && y < 300)) return 'rich';
  return 'res';
}
/** The zone of the block a world point is in (decided at the block's centre, so a block is all one thing). */
function blockZone(u: number, v: number): Zone {
  const c = iso(Math.floor(u / BLOCK) * BLOCK + BLOCK / 2 + ROAD / 2, Math.floor(v / BLOCK) * BLOCK + BLOCK / 2 + ROAD / 2);
  return zoneAt(c.x, c.y);
}
const mod = (a: number, n: number) => ((a % n) + n) % n;
const isRoad = (u: number, v: number) => mod(u, BLOCK) < ROAD || mod(v, BLOCK) < ROAD;
/** Blocks that are part of the town (a street between two of them is a real street). */
const BUILT = new Set<Zone>(['down', 'shop', 'rich', 'trailer', 'res', 'field']);
const BUILT_MEMO = new Map<number, boolean>();
const builtBlock = (iu: number, iv: number) => {
  const k = iu * 1000 + iv;
  let b = BUILT_MEMO.get(k);
  if (b === undefined) {
    // built, and no corner of it in the forest (so no street runs on into the trees)
    b = BUILT.has(blockZone(iu * BLOCK + ROAD, iv * BLOCK + ROAD))
      && [[0, 0], [1, 0], [0, 1], [1, 1]].every(([a, c]) => { const p = iso((iu + a) * BLOCK + ROAD * (1 - a), (iv + c) * BLOCK + ROAD * (1 - c)); return zoneAt(p.x, p.y) !== 'forest' && !onMountain(p.x, p.y); });
    BUILT_MEMO.set(k, b);
  }
  return b;
};
/** The road line that leads onto the road bridge (kept through the riverside park). */
const BRIDGE_U = Math.round(world(ROAD_BRIDGE.x, ROAD_BRIDGE.y).u / BLOCK) * BLOCK;
/**
 * Round 97 (owner: "these roads go nowhere, just have them cut off"): a street is only drawn between two built-up
 * blocks (so nothing runs off into the forest, the park or the river, and the town has no outer ring road), plus the
 * street onto the road bridge. A crossing is drawn where at least two of its four streets meet.
 */
function roadKept(u: number, v: number): boolean {
  const mu = mod(u, BLOCK), mv = mod(v, BLOCK), iu = Math.floor(u / BLOCK), iv = Math.floor(v / BLOCK);
  const onU = mu < ROAD, onV = mv < ROAD;
  if (onU && iu * BLOCK === BRIDGE_U && Math.hypot(iso(u, v).x - ROAD_BRIDGE.x, iso(u, v).y - ROAD_BRIDGE.y) < 90) return true;
  const armU = (jv: number) => builtBlock(iu - 1, jv) && builtBlock(iu, jv);   // the street along u-line iu, in block row jv
  const armV = (ju: number) => builtBlock(ju, iv - 1) && builtBlock(ju, iv);
  if (onU && onV) return [armU(iv - 1), armU(iv), armV(iu - 1), armV(iu)].filter(Boolean).length >= 2; // a lone arm's end is cut, no nub
  return onU ? armU(iv) : armV(iu);
}
const isRail = (u: number, v: number) => {
  if (v < RAIL_END_V) return false;
  const yard = v > 168 && v < 236;
  return u >= (yard ? RAIL[0] - 8 : RAIL[0]) && u < (yard ? RAIL[1] + 10 : RAIL[1]);
};

// ---------------------------------------------------------------- palette
const COL = {
  water: ['#1f4f5c', '#24596a', '#2b6576'], waterDeep: '#1a4350', foam: '#d8eef0', glint: '#5fa0ae',
  sand: ['#bba67c', '#c8b48a', '#a9946c'], mud: '#8a7a58',
  road: '#62666c', roadLine: '#8a8e92', curb: '#9fa3a6', dash: '#c9c08a',
  ballast: ['#6f6a62', '#7d776e', '#625d56'], tie: '#4a3a2a', rail: '#b9bec4',
  concrete: ['#8e9296', '#959a9e', '#878b90'], walk: '#aeb1b2',
  grass: ['#6c9a4a', '#73a24e', '#649244', '#7aa952'], park: ['#78ad50', '#82b656', '#6fa249'],
  forest: ['#3e6a34', '#456f37', '#38602f'], field: [['#a8b452', '#9aa648'], ['#7f9c42', '#88a646'], ['#c7a95c', '#bb9d52']],
  rockL: ['#a39886', '#988c7a', '#8d8270'], rockD: ['#6e665c', '#655d54', '#5b544c'], rockOL: '#3d3832',
  lush: ['#5c9a44', '#64a24a', '#56923f', '#6aa94e'], dirt: ['#a8956a', '#9f8c62', '#b19e72', '#968459'],
  snowL: ['#f1f5f7', '#e6edf1'], snowD: ['#b9c7d4', '#a9b8c6'], slope: ['#55803c', '#4c7536', '#5a8740'],
};

// ---------------------------------------------------------------- pixel helpers
/** Fill a polygon crisply (pixel centres, no anti-aliasing). */
export function fillPoly(c: C, pts: Pt[], col: string) {
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  c.fillStyle = col;
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    const sy = y + 0.5, xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a.y <= sy && b.y > sy) || (b.y <= sy && a.y > sy)) xs.push(a.x + ((sy - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) { const xa = Math.round(xs[k]), xb = Math.round(xs[k + 1]); if (xb > xa) c.fillRect(xa, y, xb - xa, 1); }
  }
}
const up = (p: Pt, h: number): Pt => ({ x: p.x, y: p.y - h });
const add = (p: Pt, dx: number, dy: number): Pt => ({ x: p.x + dx, y: p.y + dy });

export interface BoxCol { wall: string; roof: string; outline?: string; windows?: 'tower' | 'house' | 'none'; lit?: number; seed?: number }
/**
 * An isometric box on the ground: footprint u0..u1 × v0..v1 (world), h art px tall. Light from the top left: the
 * roof is lightest, the left face (facing down-left) lit, the right face in shade; a dark coloured outline.
 */
export function isoBox(c: C, u0: number, v0: number, u1: number, v1: number, h: number, col: BoxCol) {
  const A = iso(u0, v0), B = iso(u1, v0), Cc = iso(u1, v1), D = iso(u0, v1);
  const ol = col.outline ?? shade(col.wall, 0.42);
  // contact shadow toward the lower right
  c.globalAlpha = 0.28;
  const s = Math.min(14, h * 0.55);
  fillPoly(c, [Cc, B, add(B, s, s * 0.5), add(Cc, s, s * 0.5)], '#1c1a14');
  c.globalAlpha = 1;
  fillPoly(c, [add(up(D, h), -1, 0), add(D, -1, 0), add(Cc, 0, 1), add(B, 1, 0), add(up(B, h), 1, 0), add(up(A, h), 0, -1)], ol);
  const left = tint(col.wall, 0.08), right = shade(col.wall, 0.74);
  fillPoly(c, [up(D, h), D, Cc, up(Cc, h)], left);
  fillPoly(c, [up(Cc, h), Cc, B, up(B, h)], right);
  fillPoly(c, [up(A, h), up(B, h), up(Cc, h), up(D, h)], col.roof);
  // the roof's lit back edges, the corner line between the faces
  for (let x = Math.round(up(A, h).x); x < Math.round(up(B, h).x); x++) P(c, x, Math.round(up(A, h).y + (x - up(A, h).x) / 2), tint(col.roof, 0.3));
  for (let y = Math.round(up(Cc, h).y); y < Math.round(Cc.y); y++) P(c, Math.round(Cc.x), y, shade(col.wall, 0.6));
  // windows: rows on both faces (towers: a grid with some lit; houses: a pair)
  const w = col.windows ?? 'none', r = rng(col.seed ?? 1);
  if (w !== 'none' && h >= 5) {
    const face = (P0: Pt, P1: Pt, base: string) => {
      const dx = P1.x - P0.x, steps = Math.abs(dx);
      for (let i = 2; i < steps - 1; i += w === 'tower' ? 2 : 4) {
        const x = Math.round(P0.x + Math.sign(dx) * i), yTop = P0.y - h + ((P1.y - P0.y) * i) / steps;
        for (let row = w === 'tower' ? 3 : Math.round(h * 0.35); row < h - 2; row += w === 'tower' ? 3 : 99) {
          const lit = r() < (col.lit ?? 0.15);
          P(c, x, Math.round(yTop + row), lit ? '#f6e08a' : shade(base, 0.62));
        }
      }
    };
    face(D, Cc, left); face(Cc, B, right);
  }
  return { A, B, C: Cc, D };
}
/** A gable roof on a box: ridge along u, two slopes (the near one lit). */
export function gableRoof(c: C, u0: number, v0: number, u1: number, v1: number, h: number, rise: number, roof: string) {
  const vm = (v0 + v1) / 2;
  const a = up(iso(u0, v0), h), b = up(iso(u1, v0), h), cc = up(iso(u1, v1), h), d = up(iso(u0, v1), h);
  const r0 = up(iso(u0, vm), h + rise), r1 = up(iso(u1, vm), h + rise);
  const ol = shade(roof, 0.42);
  fillPoly(c, [add(d, -1, 0), add(a, 0, -1), add(r0, 0, -1), add(r1, 1, -1), add(b, 1, 0), add(cc, 0, 1)], ol);
  fillPoly(c, [a, b, r1, r0], shade(roof, 0.82));
  fillPoly(c, [r0, r1, cc, d], tint(roof, 0.12));
  fillPoly(c, [d, cc, add(cc, 0, 1), add(d, 0, 1)], shade(roof, 0.6));
  for (let x = Math.round(r0.x); x < Math.round(r1.x); x++) P(c, x, Math.round(r0.y + (x - r0.x) / 2), tint(roof, 0.35));
}
/** A round leafy tree (residential streets, parks). */
export function tree(c: C, x: number, y: number, s = 1, seed = 0) {
  const r = Math.round(3 + s * 1.5), leaf = ['#4f8a2f', '#5a9634', '#467f2a'][Math.abs(Math.floor(seed)) % 3];
  c.globalAlpha = 0.3; fillEllipse(c, x + 2, y + 1, r + 1, (r + 1) / 2, '#1c1a14'); c.globalAlpha = 1;
  R(c, x, y - 2, 1, 3, '#5a3d24');
  fillEllipse(c, x, y - r - 1, r + 1, r + 1, shade(leaf, 0.45));
  fillEllipse(c, x, y - r - 1, r, r, leaf);
  fillEllipse(c, x - 1, y - r - 2, r - 1.5, r - 1.5, tint(leaf, 0.18));
  P(c, x - Math.round(r / 2), y - r - Math.round(r / 2) - 1, tint(leaf, 0.4));
}
/** A pine (the ridge, the forest). */
export function pine(c: C, x: number, y: number, h = 9, seed = 0) {
  const g = ['#2f5a2e', '#36652f', '#2a5229'][Math.abs(Math.floor(seed)) % 3];
  c.globalAlpha = 0.28; fillEllipse(c, x + 2, y, 3, 1.5, '#121a10'); c.globalAlpha = 1;
  const w = Math.max(2, Math.round(h * 0.38));
  fillPoly(c, [{ x: x + 0.5, y: y - h - 1 }, { x: x - w - 0.5, y: y + 0.5 }, { x: x + w + 1.5, y: y + 0.5 }], shade(g, 0.5));
  fillPoly(c, [{ x: x + 0.5, y: y - h }, { x: x - w + 0.5, y: y - 0.5 }, { x: x + w + 0.5, y: y - 0.5 }], g);
  fillPoly(c, [{ x: x + 0.5, y: y - h }, { x: x - w + 0.5, y: y - 0.5 }, { x: x + 0.5, y: y - 0.5 }], tint(g, 0.16));
  R(c, x, y, 1, 1, '#4a3420');
}
export function fillEllipse(c: C, cx: number, cy: number, rx: number, ry: number, col: string) {
  c.fillStyle = col;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    const t = 1 - ((y + 0.5 - cy) / ry) ** 2;
    if (t <= 0) continue;
    const hw = rx * Math.sqrt(t), xa = Math.round(cx - hw), xb = Math.round(cx + hw);
    if (xb > xa) c.fillRect(xa, y, xb - xa, 1);
  }
}

// ---------------------------------------------------------------- the ground (per pixel)
const RGB = new Map<string, [number, number, number]>();
const rgb = (h: string) => { let v = RGB.get(h); if (!v) { const n = parseInt(h.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; RGB.set(h, v); } return v; };

function groundColor(x: number, y: number): string {
  const n = hn(x, y, 7);
  const wd = waterDist(x, y);
  const { u, v } = world(x + 0.5, y + 0.5);
  const roadHere = isRoad(u, v) && roadKept(u, v);
  if (wd < 0) {
    const dp = Math.hypot(x - POOL.x, y - POOL.y);
    if (dp < 74 && hn(x, y, 61) < (1 - dp / 74) * 0.5) return dp < 24 && hn(x, y, 62) < 0.5 ? '#ffffff' : '#cfe8ec'; // the falls' foam, fading downriver
    const deep = wd < -6;
    const g = vnoise(x * 2, y * 4, 6, 9);
    if (g > 0.78 && hn(x, y, 1) > 0.55) return COL.glint;
    if (wd > -1.2) return COL.foam;
    return deep ? (g < 0.3 ? COL.waterDeep : COL.water[0]) : COL.water[1 + (n > 0.6 ? 1 : 0)];
  }
  if (wd < 3) return wd < 1 ? COL.mud : COL.sand[Math.floor(n * 3)];
  const z = zoneAt(x, y);
  if (z === 'forest' || onMountain(x, y)) return COL.forest[Math.floor(n * 3)];
  if (isRail(u, v)) {
    const k = mod(u - RAIL[0] + 8, 4);
    if (k < 0.55 || (k > 2.2 && k < 2.75)) return COL.rail;
    if (mod(v, 2) < 0.7 && k < 3.2) return COL.tie;
    return COL.ballast[Math.floor(n * 3)];
  }
  if (roadHere && !nearPlace(x, y, -6)) {
    const mu = mod(u, BLOCK), mv = mod(v, BLOCK);
    const along = mu < ROAD && mv < ROAD ? -1 : mu < ROAD ? mu : mv;
    if (along >= 0 && (along < 0.6 || along > ROAD - 0.6)) return COL.curb;
    const pos = mu < ROAD ? v : u;
    if (along >= 0 && Math.abs(along - ROAD / 2) < 0.35 && mod(pos, 6) < 2.5) return COL.dash;
    return n > 0.93 ? COL.roadLine : COL.road;
  }
  // round 97: a street that was cut off is just ground, like what's around it (no grey strip left behind)
  if (isRoad(u, v)) {
    const zz = zoneAt(x, y);
    return zz === 'park' ? COL.park[Math.floor(n * 3)] : zz === 'rich' ? COL.lush[Math.floor(n * 4)] : zz === 'trailer' ? COL.dirt[Math.floor(n * 4)] : COL.grass[Math.floor(n * 4)];
  }
  const bz = blockZone(u, v);
  const mu = mod(u, BLOCK) - ROAD, mv = mod(v, BLOCK) - ROAD, inner = BLOCK - ROAD;
  const edge0 = Math.min(mu, mv, inner - mu, inner - mv);
  // round 97: a sidewalk only along a street that's there (no grey outlines running into the trees)
  const iu = Math.floor(u / BLOCK), iv = Math.floor(v / BLOCK), far = 99;
  const edge = Math.min(
    roadKept(iu * BLOCK + 1, v) ? mu : far, roadKept((iu + 1) * BLOCK + 1, v) ? inner - mu : far,
    roadKept(u, iv * BLOCK + 1) ? mv : far, roadKept(u, (iv + 1) * BLOCK + 1) ? inner - mv : far);
  void edge0;
  if (bz === 'down' || bz === 'shop') return edge < 2 ? COL.walk : COL.concrete[Math.floor(n * 3)];
  if (bz === 'rich') return edge < 1.2 ? COL.walk : COL.lush[Math.floor(n * 4)];
  if (bz === 'trailer') return edge < 0.8 ? '#8a7a56' : hn(x, y, 63) < 0.06 ? COL.grass[1] : COL.dirt[Math.floor(n * 4)];
  if (bz === 'park') return COL.park[Math.floor(n * 3)]; // round 97: no footpaths running into the river
  if (bz === 'field') { const f = COL.field[Math.floor(hn(Math.floor(u / BLOCK), Math.floor(v / BLOCK), 4) * 3)]; return f[mod(u + v, 4) < 2 ? 0 : 1]; }
  if (bz === 'forest') return COL.forest[Math.floor(n * 3)];
  return edge < 1.2 ? COL.walk : COL.grass[Math.floor(n * 4)];
}

function paintGround(c: C) {
  const img = c.createImageData(ART_W, ART_H), d = img.data;
  for (let y = 0; y < ART_H; y++) for (let x = 0; x < ART_W; x++) {
    const col = groundColor(x, y), i = (y * ART_W + x) * 4;
    const [r, g, b] = rgb(col);
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------- the mountain
function paintMountain(c: C) {
  const img = c.getImageData(0, 0, ART_W, ART_H), d = img.data;
  const mask = new Int8Array(ART_W * ART_H).fill(-1);
  for (let y = 0; y < 300; y++) for (let x = 0; x < 660; x++) mask[y * ART_W + x] = peakAt(x, y);
  for (let y = 0; y < 300; y++) for (let x = 0; x < 660; x++) {
    const k = mask[y * ART_W + x];
    if (k < 0 || waterDist(x, y) < 0) continue; // round 95: the plunge pool stays water at the mountain's foot
    const p = PEAKS[k], n = hn(x, y, 13), f = footY(x);
    let col: string;
    const above = y > 0 ? mask[(y - 1) * ART_W + x] : -1;
    const lit = x < p.x + (vnoise(x, y, 6, 30) - 0.5) * 6;
    // gullies: streaks running down the flank
    const streak = vnoise(x - (y - p.y) * (lit ? -0.6 : 0.6), 0, 4, 40 + k) > 0.62;
    if (above !== k && above < PEAKS.length && (above < 0 || PEAKS[above].y < p.y)) col = COL.rockOL;     // silhouette / ridge line
    else if (y < p.y + p.snow + (vnoise(x, y, 4, 50 + k) - 0.5) * 10) col = lit ? COL.snowL[n > 0.8 ? 1 : 0] : COL.snowD[n > 0.7 ? 1 : 0];
    else if (y > f - 48 + vnoise(x, y, 10, 60) * 18) col = COL.slope[Math.floor(n * 3)];
    else col = lit ? (streak ? COL.rockL[2] : COL.rockL[Math.floor(n * 2)]) : (streak ? COL.rockD[2] : COL.rockD[Math.floor(n * 2)]);
    const [r, g, b] = rgb(col), i = (y * ART_W + x) * 4;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  // the creek off the snow: it winds down the flank in little cascades and spills over the lip of the falls
  for (let y = 98; y < 128; y++) {
    const t = (y - 98) / 30, cx = 178 + t * 36 + Math.sin(y / 3.2) * 3 * (1 - t), w = 1 + t * 2.2;
    c.globalAlpha = 0.5; R(c, Math.round(cx - w - 2), y, Math.round(w * 2 + 5), 1, '#3e3a36'); c.globalAlpha = 1;
    for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) P(c, x, y, y % 6 === 0 || hn(x, y, 73) < 0.2 ? '#d8eef0' : hn(x, y, 74) < 0.4 ? COL.glint : COL.water[1]);
  }
  // round 93 (owner): the falls run down a cleft in the slope instead of a notch: the rock darkens and gets wet toward
  // the water (blended over the flank, so there are no hard edges), moss and ferns low down, boulders at the pool
  for (let y = 108; y < 218; y++) for (let x = 170; x < 258; x++) {
    const t = (y - 108) / 108, half = 6 + t * 14 + (vnoise(x, y, 5, 70) - 0.5) * 5, dx = Math.abs(x - 214) - half;
    if (dx > 16 || !onMountain(x, y) || waterDist(x, y) < 2) continue; // round 95: the pool below stays water
    const n = hn(x, y, 71), k = (dx < 0 ? 0.85 : 0.85 * (1 - dx / 16)) * Math.min(1, (y - 108) / 26) * (1 - 0.35 * Math.max(0, dx) / 16);
    c.globalAlpha = Math.max(0, k * (0.7 + n * 0.3));
    P(c, x, y, y > 186 && n < 0.45 ? (n < 0.2 ? '#4f8a3a' : '#3f6a3a') : n < 0.35 ? '#2f2c29' : n < 0.75 ? '#3e3a36' : '#55504a');
  }
  c.globalAlpha = 1;
}

// ---------------------------------------------------------------- buildings + trees
const TRAILERS = ['#e8e2d0', '#c9d6d2', '#d8cbb0', '#bfd0c4', '#e0d0c8', '#d0d4dc', '#cbbf98'];
const CARS = ['#8a3a2a', '#3a5a7a', '#6a6a5a', '#9a7a3a', '#2a2a2e', '#b0b4b8'];
/** A single-wide trailer: a long low box, a stripe along its side, skirting, a little porch step. */
function trailerAt(c: C, pu: number, pv: number, wall: string, rusty: boolean, seed: number) {
  const b = isoBox(c, pu, pv, pu + 13, pv + 3.6, 5, { wall, roof: '#a4aab0', windows: 'house', lit: 0.25, seed });
  const stripe = ['#3a6a8a', '#8a3a3a', '#5a7a4a', '#7a6a3a'][seed % 4];
  for (let x = Math.round(b.D.x) + 1; x < Math.round(b.C.x); x++) P(c, x, Math.round(b.D.y + (x - b.D.x) / 2) - 2, stripe);
  for (let x = Math.round(b.D.x); x < Math.round(b.C.x); x++) P(c, x, Math.round(b.D.y + (x - b.D.x) / 2) - 1, '#6a6a62');
  if (rusty) for (let k = 0; k < 5; k++) { const x = Math.round(b.D.x + 2 + hn(seed, k, 81) * (b.C.x - b.D.x - 4)); P(c, x, Math.round(b.D.y + (x - b.D.x) / 2) - 3 - Math.floor(hn(seed, k, 82) * 2), '#9a5a2a'); }
  const st = iso(pu + 3, pv + 3.6); R(c, Math.round(st.x) - 1, Math.round(st.y), 3, 1, '#7a6a4e');
}
/** A backyard pool: a pale rim and blue water with a glint. */
function poolAt(c: C, u0: number, v0: number, u1: number, v1: number) {
  fillPoly(c, [iso(u0, v0), iso(u1, v0), iso(u1, v1), iso(u0, v1)], '#e8e4d8');
  fillPoly(c, [iso(u0 + 0.6, v0 + 0.6), iso(u1 - 0.6, v0 + 0.6), iso(u1 - 0.6, v1 - 0.6), iso(u0 + 0.6, v1 - 0.6)], '#3aa6c8');
  const g = iso(u0 + 1.4, v0 + 1.2); R(c, Math.round(g.x), Math.round(g.y), 2, 1, '#bfeaf6');
}
/** A trimmed hedge along a lot edge. */
function hedge(c: C, u0: number, v0: number, u1: number, v1: number) {
  const du = u1 - u0, dv = v1 - v0, n = Math.ceil(Math.max(Math.abs(du), Math.abs(dv)) * 2);
  for (let k = 0; k <= n; k++) { const p = iso(u0 + (du * k) / n, v0 + (dv * k) / n); R(c, Math.round(p.x) - 1, Math.round(p.y) - 2, 2, 2, k % 3 ? '#3f6e30' : '#4f8a3a'); P(c, Math.round(p.x) - 1, Math.round(p.y) - 3, '#5f9a44'); }
}
/** A mansion: a long main wing and a side wing (an L), a pool, a fountain on the round drive, palms. */
function mansion(c: C, pu: number, pv: number, seed: number) {
  const wall = ['#f2ead8', '#e8e2d6', '#efe2cc'][Math.abs(seed) % 3], roof = ['#5a4a44', '#3e4a5a', '#6a3a2e'][Math.abs(seed) % 3];
  fillPoly(c, [iso(pu, pv + 16), iso(pu + 12, pv + 16), iso(pu + 12, pv + 26), iso(pu, pv + 26)], '#cfc6ae');   // the drive
  const f = iso(pu + 6, pv + 21); fillEllipse(c, f.x, f.y, 5, 2.5, '#8a8478'); fillEllipse(c, f.x, f.y, 4, 2, '#5ab8d8'); R(c, Math.round(f.x), Math.round(f.y) - 4, 1, 4, '#e8f6ff');
  poolAt(c, pu + 14, pv + 14, pu + 25, pv + 20);
  hedge(c, pu, pv + 26, pu + 26, pv + 26); hedge(c, pu + 26, pv, pu + 26, pv + 26);
  isoBox(c, pu, pv, pu + 24, pv + 9, 12, { wall, roof, windows: 'house', lit: 0.6, seed });
  gableRoof(c, pu, pv, pu + 24, pv + 9, 12, 6, roof);
  isoBox(c, pu, pv + 9, pu + 8, pv + 15, 10, { wall, roof, windows: 'house', lit: 0.5, seed: seed + 1 });
  gableRoof(c, pu, pv + 9, pu + 8, pv + 15, 10, 4, roof);
  for (const [du, dv] of [[25, 24], [13, 25]]) { const t = iso(pu + du, pv + dv); tree(c, Math.round(t.x), Math.round(t.y), 1.2, seed + du); }
}
type Obj = { y: number; draw: (c: C) => void };

function cityObjects(): Obj[] {
  const out: Obj[] = [];
  // round 95 (owner: houses stood in the forest): never on forest ground (the ground's forest edge is per pixel)
  const land = (x: number, y: number) => { const w = world(x, y); return x > 2 && x < ART_W - 2 && y > 2 && y < ART_H - 2 && waterDist(x, y) > 4 && !onMountain(x, y) && !nearPlace(x, y) && !underHighway(w.u, w.v) && zoneAt(x, y) !== 'forest'; };
  const free = (u0: number, v0: number, u1: number, v1: number) => [iso(u0, v0), iso(u1, v0), iso(u1, v1), iso(u0, v1)].every((p) => land(p.x, p.y))
    && ![[u0, v0], [u1, v1], [u0, v1], [u1, v0]].some(([u, v]) => isRail(u, v));
  // blocks covering the screen
  for (let iu = -2; iu < 16; iu++) for (let iv = -8; iv < 12; iv++) {
    const u0 = iu * BLOCK + ROAD, v0 = iv * BLOCK + ROAD, inner = BLOCK - ROAD;
    const z = blockZone(u0, v0), r = rng(iu * 131 + iv * 977 + 7);
    if (z === 'down') {
      // towers on a 2x2, a plaza now and then
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
        if (r() < 0.12) continue;
        const pu = u0 + 2 + a * (inner / 2), pv = v0 + 2 + b * (inner / 2), s = inner / 2 - 4;
        if (!free(pu, pv, pu + s, pv + s)) continue;
        const dcen = Math.hypot(iso(pu, pv).x - 650, (iso(pu, pv).y - 250) * 1.6);
        const h = Math.round(10 + r() * 14 + Math.max(0, 1 - dcen / 160) * 34);
        const wall = ['#8fa1b0', '#a7a29a', '#7d8fa1', '#b6aa96', '#9aa7a0'][Math.floor(r() * 5)];
        const roof = shade(wall, 0.9), seed = iu * 7 + iv * 13 + a + b * 2;
        out.push({ y: iso(pu + s, pv + s).y, draw: (c) => {
          isoBox(c, pu, pv, pu + s, pv + s, h, { wall, roof, windows: 'tower', lit: 0.18, seed });
          if (h > 30) isoBox(c, pu + 2, pv + 2, pu + 5, pv + 5, 3, { wall: '#7a7f86', roof: '#9aa0a6' }); // a roof unit
        } });
      }
    } else if (z === 'shop') {
      // low shops and offices with flat roofs, a parking strip
      for (let a = 0; a < 2; a++) for (let b = 0; b < 3; b++) {
        if (r() < 0.2) continue;
        const pu = u0 + 2 + a * (inner / 2), pv = v0 + 2 + b * (inner / 3), su = inner / 2 - 4, sv = inner / 3 - 3;
        if (!free(pu, pv, pu + su, pv + sv)) continue;
        const wall = ['#c9b89a', '#b8c4c8', '#d4c0a8', '#a8b4a0', '#c8a890'][Math.floor(r() * 5)];
        const roof = ['#8a8a84', '#7a7e86', '#9a948a'][Math.floor(r() * 3)], h = 6 + Math.round(r() * 5), seed = iu * 11 + iv * 17 + a + b * 3;
        const awning = ['#c0392b', '#2a7aa8', '#e0a030', '#3a9a5a'][Math.floor(r() * 4)];
        out.push({ y: iso(pu + su, pv + sv).y, draw: (c) => {
          const bx = isoBox(c, pu, pv, pu + su, pv + sv, h, { wall, roof, windows: 'tower', lit: 0.35, seed });
          for (let x = Math.round(bx.D.x) + 1; x < Math.round(bx.C.x) - 1; x++) P(c, x, Math.round(bx.D.y + (x - bx.D.x) / 2) - 3, awning);
        } });
      }
    } else if (z === 'rich') {
      // round 93 (owner): the hills: big houses on 2x2 lots with pools and hedges, a mansion on some blocks
      if (hn(iu, iv, 77) < 0.45) {
        const pu = u0 + 3, pv = v0 + 3, seed = iu * 5 + iv * 3;
        if (free(pu, pv, pu + 26, pv + 26)) out.push({ y: iso(pu + 26, pv + 26).y, draw: (c) => mansion(c, pu, pv, seed) });
        continue;
      }
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
        const pu = u0 + 1.5 + a * (inner / 2), pv = v0 + 1.5 + b * (inner / 2), s = inner / 2 - 3;
        if (!free(pu, pv, pu + s, pv + s)) continue;
        const wall = ['#efe6d2', '#e2e6e8', '#ead8bc', '#d8e0d0', '#f2ead8'][Math.floor(r() * 5)];
        const roof = ['#5a4a44', '#3e4a5a', '#6a3a2e', '#4a4a4a'][Math.floor(r() * 4)];
        const h = 7 + Math.round(r() * 2), pool = r() < 0.7, seed = iu * 13 + iv * 7 + a * 3 + b;
        out.push({ y: iso(pu + s, pv + s).y, draw: (c) => {
          if (pool) poolAt(c, pu + 9.5, pv + 1.5, pu + s - 0.5, pv + 5.5);
          hedge(c, pu, pv + s, pu + s, pv + s); hedge(c, pu + s, pv, pu + s, pv + s);
          isoBox(c, pu + 0.5, pv + 0.5, pu + 9, pv + s - 1.5, h, { wall, roof, windows: 'house', lit: 0.45, seed });
          gableRoof(c, pu + 0.5, pv + 0.5, pu + 9, pv + s - 1.5, h, 5, roof);
          const t = iso(pu + s - 2, pv + s - 3); tree(c, Math.round(t.x), Math.round(t.y), 0.9, seed);
        } });
      }
    } else if (z === 'trailer') {
      // round 93 (owner): the trailer park: rows of single-wides on dirt lots, a car or a shed here and there
      for (let row = 0; row < 4; row++) for (let col = 0; col < 2; col++) {
        const pu = u0 + 2 + col * 16, pv = v0 + 2 + row * 8;
        if (r() < 0.1 || !free(pu, pv, pu + 13, pv + 3.6)) {
          const t = iso(pu + 6, pv + 2);
          if (land(t.x, t.y) && r() < 0.35) out.push({ y: t.y, draw: (c) => tree(c, Math.round(t.x), Math.round(t.y), 0.5, row + col) });
          continue;
        }
        const k = Math.floor(r() * TRAILERS.length), rusty = r() < 0.3, car = r() < 0.35, shed = !car && r() < 0.3, seed = iu * 17 + iv * 11 + row * 2 + col;
        out.push({ y: iso(pu + 13, pv + 5.6).y, draw: (c) => {
          trailerAt(c, pu, pv, TRAILERS[k], rusty, seed);
          if (car) isoBox(c, pu + 2, pv + 4.4, pu + 5.2, pv + 6, 2, { wall: CARS[seed % CARS.length], roof: shade(CARS[seed % CARS.length], 0.85) });
          if (shed) { isoBox(c, pu + 10, pv + 4.3, pu + 12.5, pv + 6.3, 3, { wall: '#8a7a5a', roof: '#6a6a66' }); }
        } });
      }
    } else if (z === 'res') {
      // houses on a 3x3, trees in the gaps
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
        const pu = u0 + 1.5 + a * (inner / 3), pv = v0 + 1.5 + b * (inner / 3), s = inner / 3 - 3;
        if (a === 1 && b === 1) { // the middle: a back yard tree
          const t = iso(pu + s / 2, pv + s / 2);
          if (land(t.x, t.y) && r() < 0.8) out.push({ y: t.y, draw: (c) => tree(c, Math.round(t.x), Math.round(t.y), 0.6, iu + iv) });
          continue;
        }
        if (r() < 0.16 || !free(pu, pv, pu + s, pv + s)) {
          const t = iso(pu + s / 2, pv + s / 2);
          if (land(t.x, t.y) && r() < 0.6) out.push({ y: t.y, draw: (c) => tree(c, Math.round(t.x), Math.round(t.y), r(), a + b) });
          continue;
        }
        const wall = ['#d9cdb0', '#c9d3d6', '#e2d8c4', '#b9c4a8', '#cfb79a'][Math.floor(r() * 5)];
        const roof = ['#9a4a34', '#6a5a4e', '#5c6a78', '#8a6a3e'][Math.floor(r() * 4)];
        const h = 4 + Math.round(r() * 2), seed = iu * 3 + iv * 5 + a * 7 + b;
        out.push({ y: iso(pu + s, pv + s).y, draw: (c) => {
          isoBox(c, pu, pv, pu + s, pv + s - 2, h, { wall, roof, windows: 'house', lit: 0.3, seed });
          gableRoof(c, pu, pv, pu + s, pv + s - 2, h, 3, roof);
        } });
      }
    } else if (z === 'park') {
      for (let k = 0; k < 7; k++) {
        const t = iso(u0 + 2 + r() * (inner - 4), v0 + 2 + r() * (inner - 4));
        if (land(t.x, t.y)) { const s = r(); out.push({ y: t.y, draw: (c) => tree(c, Math.round(t.x), Math.round(t.y), s, k) }); }
      }
    } else if (z === 'field') {
      if (r() < 0.4) { // a barn and a silo
        const pu = u0 + 8, pv = v0 + 8;
        if (free(pu, pv, pu + 10, pv + 7)) out.push({ y: iso(pu + 10, pv + 7).y, draw: (c) => { isoBox(c, pu, pv, pu + 10, pv + 7, 6, { wall: '#9a3a2a', roof: '#6a4a3a' }); gableRoof(c, pu, pv, pu + 10, pv + 7, 6, 4, '#5a4a40'); } });
      }
    }
  }
  // the rail station at the end of the line north of the river, and boxcars in the yard
  const st = { u: RAIL[0] - 6, v: RAIL_END_V - 10 };
  out.push({ y: iso(st.u + 14, st.v + 8).y, draw: (c) => { isoBox(c, st.u, st.v, st.u + 14, st.v + 8, 7, { wall: '#b9a58a', roof: '#6a4a3a', windows: 'house', seed: 3 }); gableRoof(c, st.u, st.v, st.u + 14, st.v + 8, 7, 4, '#5a3a2e'); } });
  const cars = ['#8a3a2a', '#3a5a7a', '#6a6a5a', '#9a7a3a'];
  for (let k = 0; k < 9; k++) {
    const lane = RAIL[0] - 6 + (k % 3) * 9, v0 = 176 + Math.floor(k / 3) * 18 + (k % 2) * 4;
    const pu = lane + 1, pv = v0;
    out.push({ y: iso(pu + 3, pv + 12).y, draw: (c) => isoBox(c, pu, pv, pu + 3, pv + 12, 4, { wall: cars[k % 4], roof: shade(cars[k % 4], 0.85) }) });
  }
  // the forest and the ridge's lower slopes: pines
  for (let y = 4; y < 540; y += 5) for (let x = 0; x < 960; x += 6) {
    const jx = x + Math.floor(hn(x, y, 21) * 5), jy = y + Math.floor(hn(x, y, 22) * 4);
    if (waterDist(jx, jy) < 3 || nearPlace(jx, jy, 4)) continue;
    const f = footY(jx), onSlope = f >= 0 && jy < f && jy > f - 46 && onMountain(jx, jy);
    const inForest = !onMountain(jx, jy) && zoneAt(jx, jy) === 'forest' && !(isRoad(world(jx, jy).u, world(jx, jy).v) && roadKept(world(jx, jy).u, world(jx, jy).v)) && trailDist(jx, jy) > 3;
    if ((onSlope && hn(jx, jy, 23) < 0.55) || (inForest && hn(jx, jy, 24) < 0.8)) {
      const h = 7 + Math.floor(hn(jx, jy, 25) * 5), s = Math.floor(hn(jx, jy, 26) * 3);
      out.push({ y: jy, draw: (c) => pine(c, jx, jy, h, s) });
    }
  }
  // street trees along the residential roads
  for (let y = 80; y < 540; y += 7) for (let x = 0; x < 960; x += 9) {
    const { u, v } = world(x, y);
    const mu = mod(u, BLOCK), mv = mod(v, BLOCK);
    const curbside = (mu > ROAD && mu < ROAD + 1.4) || (mv > ROAD && mv < ROAD + 1.4);
    if (curbside && blockZone(u, v) === 'res' && land(x, y) && hn(x, y, 31) < 0.35) out.push({ y, draw: (c) => tree(c, x, y, 0.2, x + y) });
  }
  // the island's trees
  for (const [dx, dy] of [[-4, 0], [4, 1], [0, -1]]) out.push({ y: ISLAND.y + dy, draw: (c) => tree(c, ISLAND.x + dx, ISLAND.y + dy, 0.4, dx) });
  return out;
}

/** The bridges over the river: decks along the road / rail line, railings, piers. */
function paintBridges(c: C) {
  for (const [b, rail] of [[ROAD_BRIDGE, false], [RAIL_BRIDGE, true]] as const) {
    const { u: bu } = world(b.x, b.y);
    const u0 = rail ? RAIL[0] : Math.round(bu / BLOCK) * BLOCK, u1 = rail ? RAIL[1] : u0 + ROAD;
    const { v: bv } = world(b.x, b.y), v0 = bv - 16, v1 = bv + 16;
    const deck = rail ? '#5a5048' : '#6a6e74';
    // piers in the water
    for (const v of [bv - 6, bv + 6]) { const p = iso((u0 + u1) / 2, v); R(c, Math.round(p.x) - 1, Math.round(p.y), 3, 4, '#5a5e62'); }
    const A = iso(u0, v0), B = iso(u1, v0), Cc = iso(u1, v1), D = iso(u0, v1), lift = 3;
    fillPoly(c, [add(up(A, lift), 0, -1), add(up(B, lift), 1, 0), add(Cc, 1, 1), add(D, -1, 1)], '#34383c');
    fillPoly(c, [up(A, lift), up(B, lift), up(Cc, lift), up(D, lift)], deck);
    fillPoly(c, [up(D, lift), D, Cc, up(Cc, lift)], shade(deck, 0.7));
    if (rail) for (let v = v0; v < v1; v += 2) { const p = up(iso(u0 + 1, v), lift), q = up(iso(u1 - 1, v), lift); R(c, Math.round(q.x), Math.round(q.y), Math.round(p.x - q.x), 1, COL.tie); }
    // railings (the rail bridge gets a truss)
    for (let v = v0; v <= v1; v += rail ? 3 : 2) for (const u of [u0, u1]) {
      const p = up(iso(u, v), lift);
      R(c, Math.round(p.x), Math.round(p.y) - (rail ? 5 : 2), 1, rail ? 5 : 2, rail ? '#3a4a5a' : '#c8ccd0');
    }
    if (rail) for (const u of [u0, u1]) { const p = up(iso(u, v0), lift + 5), q = up(iso(u, v1), lift + 5), n = Math.ceil(Math.abs(q.x - p.x)); for (let t = 0; t <= n; t++) P(c, Math.round(p.x + ((q.x - p.x) * t) / n), Math.round(p.y + ((q.y - p.y) * t) / n), '#3a4a5a'); }
  }
}

/** The dam: a concrete wall across the outlet, the spillway foaming below it. */
function paintDam(c: C) {
  const [a, b] = DAM;
  const wa = world(a.x, a.y), wb = world(b.x, b.y);
  isoBox(c, wa.u, wa.v - 1.5, wb.u, wa.v + 1.5, 7, { wall: '#b4b2aa', roof: '#cfccc2' });
  for (let x = a.x + 6; x < b.x - 2; x++) for (let k = 0; k < 6; k++) if (hn(x, k, 41) < 0.6) P(c, x, Math.round(lineY(DAM, x)) + 2 + k, k < 3 ? COL.foam : COL.glint);
}

// ---------------------------------------------------------------- the places (each its own sprite)
const placeWorld = (id: PlaceId) => { const p = PLACES.find((q) => q.id === id)!.at; return world(p.x, p.y); };

/** A flat lot under a place (parking, a yard, a court). */
function lot(c: C, u0: number, v0: number, u1: number, v1: number, col: string, edge?: string) {
  const pts = [iso(u0, v0), iso(u1, v0), iso(u1, v1), iso(u0, v1)];
  if (edge) fillPoly(c, [add(pts[0], 0, -1), add(pts[1], 1, 0), add(pts[2], 0, 1), add(pts[3], -1, 0)], edge);
  fillPoly(c, pts, col);
}
function line(c: C, p: Pt, q: Pt, col: string) {
  const n = Math.ceil(Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)));
  for (let t = 0; t <= n; t++) P(c, Math.round(p.x + ((q.x - p.x) * t) / Math.max(1, n)), Math.round(p.y + ((q.y - p.y) * t) / Math.max(1, n)), col);
}

const PLACE_ART: Record<PlaceId, (c: C) => void> = {
  // your house on Cedar Street: two storeys, a gable roof, the garage (the gym) attached, a driveway
  home: (c) => {
    const { u, v } = placeWorld('home');
    lot(c, u - 12, v - 12, u + 8, v + 6, '#79a854', '#4f7a34');
    lot(c, u + 1, v - 1, u + 8, v + 6, '#9a9a96');                       // the driveway
    isoBox(c, u - 9, v - 9, u + 1, v + 1, 12, { wall: '#d8c9a6', roof: '#8a3e2a', windows: 'house', lit: 1, seed: 4 });
    gableRoof(c, u - 9, v - 9, u + 1, v + 1, 12, 6, '#8a3e2a');
    isoBox(c, u + 1, v - 7, u + 7, v - 1, 7, { wall: '#c8b892', roof: '#6a4a3a' });
    const g0 = iso(u + 1.5, v - 1), g1 = iso(u + 6.5, v - 1);            // the garage door on its left face
    for (let y = 0; y < 5; y++) line(c, add(g0, 0, -1 - y), add(g1, 0, -1 - y), y % 2 ? '#8a8478' : '#a8a296');
    const door = iso(u - 4, v + 1); R(c, Math.round(door.x) - 1, Math.round(door.y) - 6, 3, 5, '#6a3a24');
    tree(c, Math.round(iso(u - 11, v + 4).x), Math.round(iso(u - 11, v + 4).y), 1, 1);
  },
  // the arena: a big dome on a ring wall, gold band, parking around it
  arena: (c) => {
    const { u, v } = placeWorld('arena'), cen = iso(u, v);
    lot(c, u - 28, v - 28, u + 28, v + 28, '#8a8e92', '#6a6e72');
    for (let k = -24; k <= 24; k += 4) { line(c, iso(u - 26, v + k), iso(u - 20, v + k), '#e8e4d8'); line(c, iso(u + k, v + 20), iso(u + k, v + 26), '#e8e4d8'); }
    const rx = 44, ry = 22, wall = 11, dome = 18, cx = cen.x, cy = cen.y - 4;
    c.globalAlpha = 0.3; fillEllipse(c, cx + 8, cy + 4, rx + 2, ry + 1, '#1c1a14'); c.globalAlpha = 1;
    // the ring wall (front half shows): navy with a gold band, darker to the right
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const t = (x - cx) / rx; if (Math.abs(t) > 1) continue;
      const yb = Math.round(cy + ry * Math.sqrt(1 - t * t)), k = 0.95 - (t + 1) * 0.22;
      for (let y = yb - wall; y <= yb; y++) {
        const band = y - (yb - wall) === 3 || y - (yb - wall) === 4;
        P(c, x, y, band ? shade('#e0b33a', k + 0.08) : y === yb ? '#141c2c' : shade('#25365a', k + 0.1));
      }
      if (x % 6 === 0) for (let y = yb - wall + 6; y < yb - 1; y++) P(c, x, y, '#f6e08a');
    }
    // the dome: painted back to front over its footprint, shaded by its normal, ribs every 22.5°
    for (let fy = -1; fy <= 1; fy += 0.01) for (let fx = -1; fx <= 1; fx += 0.008) {
      const r2 = fx * fx + fy * fy; if (r2 > 1) continue;
      const z = Math.sqrt(1 - r2), x = Math.round(cx + fx * rx), y = Math.round(cy + fy * ry - wall - z * dome);
      const light = 0.62 + 0.38 * (-fx * 0.55 - fy * 0.3 + z * 0.75);
      const ang = (Math.atan2(fy, fx) * 180) / Math.PI, rib = Math.abs(((ang % 22.5) + 22.5) % 22.5) < 1.4 && z < 0.95;
      P(c, x, y, r2 > 0.95 ? '#3a4658' : rib ? shade('#c9d2dc', light * 0.82) : shade('#dfe6ec', Math.min(1.08, light)));
    }
    fillEllipse(c, cx - 2, cy - wall - dome - 1, 9, 4, '#3a4658'); fillEllipse(c, cx - 2, cy - wall - dome - 1, 8, 3, '#9ec8e0');
    fillEllipse(c, cx - 4, cy - wall - dome - 2, 3, 1, '#e8f6ff');
    // the jumbotron sign at the entrance
    const s = { x: Math.round(cx - 30), y: Math.round(cy + ry - 2) };
    R(c, s.x + 5, s.y - 4, 1, 8, '#3a3a3a'); R(c, s.x - 1, s.y - 13, 14, 10, '#141c2c'); R(c, s.x, s.y - 12, 12, 8, '#e0b33a'); R(c, s.x + 2, s.y - 10, 8, 4, '#25365a');
  },
  // Pine Flats: a row of trailers by the tracks, Mom's at the end with its generator
  // Mom's place: one single-wide like the others in Pine Flats, her generator beside it, a porch step, a flower pot
  trailer: (c) => {
    const { u, v } = placeWorld('trailer');
    lot(c, u - 8, v - 4, u + 8, v + 5, '#9d8a60');
    trailerAt(c, u - 7, v - 2, '#e8e2d0', false, 3);
    isoBox(c, u + 6.5, v - 1.5, u + 8.5, v + 0.5, 3, { wall: '#5a7a4a', roof: '#6f8a5a' });
    const pot = iso(u - 2, v + 2.2); R(c, Math.round(pot.x), Math.round(pot.y) - 2, 2, 2, '#9a5a3a'); P(c, Math.round(pot.x), Math.round(pot.y) - 3, '#e05a8a'); P(c, Math.round(pot.x) + 1, Math.round(pot.y) - 3, '#5aa83a');
  },
  // Lincoln High: the brick school, the fenced outdoor court (grey asphalt, white lines) with two hoops
  lincoln: (c) => {
    const { u, v } = placeWorld('lincoln');
    isoBox(c, u - 18, v - 18, u + 6, v - 8, 10, { wall: '#9a4a36', roof: '#7a1f2b', windows: 'house', lit: 0.4, seed: 9 });
    lot(c, u - 14, v - 6, u + 10, v + 8, '#6a6e72', '#4a4e52');
    lot(c, u - 12, v - 4, u + 8, v + 6, '#82868a');
    for (const [a, b] of [[iso(u - 12, v - 4), iso(u + 8, v - 4)], [iso(u + 8, v - 4), iso(u + 8, v + 6)], [iso(u + 8, v + 6), iso(u - 12, v + 6)], [iso(u - 12, v + 6), iso(u - 12, v - 4)], [iso(u - 2, v - 4), iso(u - 2, v + 6)]]) line(c, a, b, '#e8eaec');
    for (const [hu, sgn] of [[u - 11, 1], [u + 7, -1]] as const) {
      const b = iso(hu, v + 1);
      R(c, Math.round(b.x), Math.round(b.y) - 9, 1, 9, '#3a3a3a');
      R(c, Math.round(b.x) - 2, Math.round(b.y) - 12, 5, 4, '#e8e8e8'); P(c, Math.round(b.x) + sgn * 2, Math.round(b.y) - 8, '#e05a2a');
    }
    for (let k = 0; k <= 24; k += 2) { const p = iso(u - 14 + k, v + 8); R(c, Math.round(p.x), Math.round(p.y) - 4, 1, 4, '#9aa0a6'); }
    for (let k = 0; k <= 14; k += 2) { const p = iso(u + 10, v - 6 + k); R(c, Math.round(p.x), Math.round(p.y) - 4, 1, 4, '#9aa0a6'); }
  },
  // Iron Works: the big gym downtown, a wide dark box with a glass front, a red sign with a dumbbell on the roof
  gym: (c) => {
    const { u, v } = placeWorld('gym');
    lot(c, u - 15, v - 12, u + 11, v + 8, '#7a7e82', '#5a5e62');
    const b = isoBox(c, u - 13, v - 10, u + 9, v + 3, 16, { wall: '#3e434b', roof: '#565b63', windows: 'tower', lit: 0.5, seed: 41 });
    // the glass front: bright panes on the left face's lower half
    for (let x = Math.round(b.D.x) + 2; x < Math.round(b.C.x) - 1; x++) { const yb = Math.round(b.D.y + (x - b.D.x) / 2); for (let k = 2; k < 7; k++) P(c, x, yb - k, x % 5 === 0 ? '#2a2e34' : k === 6 ? '#d8eef8' : '#8ec8e8'); }
    isoBox(c, u - 9, v - 7, u - 5, v - 3, 3, { wall: '#7a7f86', roof: '#9aa0a6' });
    // the sign on the roof's front edge
    const s = up(iso(u - 2, v + 3), 16);
    R(c, Math.round(s.x) - 15, Math.round(s.y) - 11, 30, 10, '#5a1410'); R(c, Math.round(s.x) - 14, Math.round(s.y) - 10, 28, 8, '#c0392b');
    R(c, Math.round(s.x) - 12, Math.round(s.y) - 7, 6, 2, '#f2f2f2'); R(c, Math.round(s.x) - 13, Math.round(s.y) - 8, 2, 4, '#f2f2f2'); R(c, Math.round(s.x) - 7, Math.round(s.y) - 8, 2, 4, '#f2f2f2');
    text3(c, Math.round(s.x) - 2, Math.round(s.y) - 9, 'GYM', '#ffffff');
    for (const dx of [-12, 12]) R(c, Math.round(s.x) + dx, Math.round(s.y) - 1, 1, 3, '#3a3a3a');
  },
  // Burger Barn: a red barn with a big burger on a pole
  burger: (c) => {
    const { u, v } = placeWorld('burger');
    lot(c, u - 12, v - 10, u + 10, v + 8, '#7a7e82', '#5a5e62');
    isoBox(c, u - 9, v - 7, u + 3, v + 1, 7, { wall: '#b03a2a', roof: '#5a3a2e', windows: 'house', lit: 1, seed: 31 });
    gableRoof(c, u - 9, v - 7, u + 3, v + 1, 7, 5, '#4a2e24');
    const p = iso(u + 7, v + 5); R(c, Math.round(p.x), Math.round(p.y) - 16, 1, 16, '#4a4a4a');
    fillEllipse(c, p.x, p.y - 19, 6, 3, '#d8962a'); R(c, Math.round(p.x) - 6, Math.round(p.y) - 19, 12, 1, '#6a3a1a'); R(c, Math.round(p.x) - 6, Math.round(p.y) - 18, 12, 1, '#5aa83a');
    fillEllipse(c, p.x, p.y - 16, 6, 2, '#c8862a');
  },
  // Riverside Park: a blue court, a path, trees
  park: (c) => {
    const { u, v } = placeWorld('park');
    lot(c, u - 8, v - 6, u + 8, v + 6, '#3a6a9a', '#24486a');
    line(c, iso(u, v - 6), iso(u, v + 6), '#e8eef4');
    for (const hu of [u - 7, u + 7]) { const b = iso(hu, v); R(c, Math.round(b.x), Math.round(b.y) - 7, 1, 7, '#3a3a3a'); R(c, Math.round(b.x) - 2, Math.round(b.y) - 9, 5, 3, '#e8e8e8'); }
    for (const [du, dv] of [[-12, -10], [10, -9], [-11, 9], [11, 10]]) { const t = iso(u + du, v + dv); tree(c, Math.round(t.x), Math.round(t.y), 1, du); }
  },
  // Gas 'n Go: a canopy over two pumps, the little store, the price sign on its pole
  gas: (c) => {
    const { u, v } = placeWorld('gas');
    lot(c, u - 12, v - 10, u + 12, v + 9, '#6e7276', '#4e5256');
    isoBox(c, u + 2, v - 8, u + 10, v - 2, 6, { wall: '#e8e2d0', roof: '#c0392b', windows: 'house', lit: 1, seed: 51 });
    for (const pu of [u - 6, u - 1]) isoBox(c, pu, v - 0.5, pu + 1, v + 0.5, 3, { wall: '#c0392b', roof: '#e8e8e8' });
    const H = 10, A = up(iso(u - 9, v - 4), H), B = up(iso(u + 2, v - 4), H), C2 = up(iso(u + 2, v + 4), H), D = up(iso(u - 9, v + 4), H);
    for (const [pu, pv] of [[u - 8, v - 3], [u + 1, v - 3], [u - 8, v + 3], [u + 1, v + 3]]) { const p = iso(pu, pv); R(c, Math.round(p.x), Math.round(p.y) - H, 1, H, '#c8cacc'); }
    fillPoly(c, [add(A, 0, -1), add(B, 1, 0), add(C2, 0, 2), add(D, -1, 1)], '#5a1410');
    fillPoly(c, [A, B, C2, D], '#f2f2f0');
    fillPoly(c, [D, C2, add(C2, 0, 2), add(D, 0, 2)], '#c0392b');
    const sp = iso(u + 11, v + 8); R(c, Math.round(sp.x), Math.round(sp.y) - 18, 1, 18, '#4a4a4a');
    R(c, Math.round(sp.x) - 5, Math.round(sp.y) - 26, 11, 9, '#5a1410'); R(c, Math.round(sp.x) - 4, Math.round(sp.y) - 25, 9, 3, '#c0392b'); R(c, Math.round(sp.x) - 4, Math.round(sp.y) - 22, 9, 4, '#f2f2f2');
    text3(c, Math.round(sp.x) - 3, Math.round(sp.y) - 22, '3', '#2a8a3a'); text3(c, Math.round(sp.x) + 1, Math.round(sp.y) - 22, '9', '#2a8a3a');
  },
  // the cabin up the mountain: a clearing in the pines, log walls, a stone chimney with smoke, a woodpile
  cabin: (c) => {
    const { u, v } = placeWorld('cabin'), cen = iso(u, v);
    // round 95 (owner): high up the mountain on a rock ledge under the snow, a few hardy pines around it
    fillEllipse(c, cen.x, cen.y + 1, 19, 8, '#5b544c'); fillEllipse(c, cen.x - 1, cen.y, 17, 7, '#6e7a5a'); fillEllipse(c, cen.x - 3, cen.y - 1, 11, 4, '#7d8a64');
    for (const [dx, dy, h] of [[-17, -2, 9], [15, -4, 8], [18, 3, 10], [-14, 5, 8]]) pine(c, Math.round(cen.x + dx), Math.round(cen.y + dy), h, dx > 0 ? 1 : 2);
    const b = isoBox(c, u - 5, v - 3, u + 3, v + 2, 6, { wall: '#7a4a2a', roof: '#3a2a20' });
    for (let x = Math.round(b.D.x) + 1; x < Math.round(b.C.x); x++) for (let k = 2; k < 6; k += 2) P(c, x, Math.round(b.D.y + (x - b.D.x) / 2) - k, '#5a3420');
    gableRoof(c, u - 5, v - 3, u + 3, v + 2, 6, 4, '#3a2a20');
    isoBox(c, u + 1.4, v - 2.4, u + 2.4, v - 1.4, 9, { wall: '#7d7a72', roof: '#5a5852' });
    const ch = up(iso(u + 1.9, v - 1.9), 10);
    c.globalAlpha = 0.55; for (let k = 0; k < 4; k++) fillEllipse(c, ch.x + k * 2, ch.y - 3 - k * 4, 2 + k * 0.7, 1.6 + k * 0.5, '#e8eaec'); c.globalAlpha = 1;
    const wp = iso(u + 5, v + 1); for (let k = 0; k < 3; k++) R(c, Math.round(wp.x) - 2, Math.round(wp.y) - 1 - k, 5 - k, 1, k % 2 ? '#8a5a34' : '#6a4224');
    const d = iso(u - 1, v + 2); R(c, Math.round(d.x) - 1, Math.round(d.y) - 4, 2, 4, '#3a2014');
  },
  // the interstate's sign gantry over the deck: green board, EAST and an arrow
  highway: (c) => {
    const { u } = placeWorld('highway'), h = hwyH(u);
    const p0 = iso(u, HWY.v0 - 1), p1 = iso(u, HWY.v1 + 1), H = h + 14;
    R(c, Math.round(p0.x), Math.round(p0.y) - H, 1, H, '#9aa0a6'); R(c, Math.round(p1.x), Math.round(p1.y) - H, 1, H, '#9aa0a6');
    line(c, add(p0, 0, -H), add(p1, 0, -H), '#9aa0a6');
    const m = iso(u, (HWY.v0 + HWY.v1) / 2); const sx = Math.round(m.x) - 10, sy = Math.round(m.y) - H - 4;
    R(c, sx - 1, sy - 1, 22, 10, '#e8eaec'); R(c, sx, sy, 20, 8, '#1f6a3a');
    text3(c, sx + 2, sy + 2, 'EAST', '#ffffff'); P(c, sx + 18, sy + 3, '#ffffff'); P(c, sx + 18, sy + 4, '#ffffff'); P(c, sx + 19, sy + 4, '#ffffff'); P(c, sx + 18, sy + 5, '#ffffff');
  },
};

/** The trailhead at the mountain foot (scenery): a little log hut, a sign, the trail heading up. */
/** Round 97 (owner): a dirt trail from the trailhead hut down to the nearest street (computed once). */
let TRAIL: Pt[] | null = null;
function trail(): Pt[] {
  if (TRAIL) return TRAIL;
  let best: Pt = { x: TRAILHEAD.x + 60, y: TRAILHEAD.y + 40 }, bd = Infinity;
  for (let y = TRAILHEAD.y; y < TRAILHEAD.y + 140; y += 2) for (let x = TRAILHEAD.x; x < TRAILHEAD.x + 200; x += 2) {
    const w = world(x, y);
    if (!isRoad(w.u, w.v) || !roadKept(w.u, w.v) || waterDist(x, y) < 4) continue;
    const d = Math.hypot(x - TRAILHEAD.x, y - TRAILHEAD.y);
    if (d < bd) { bd = d; best = { x, y }; }
  }
  const a = { x: TRAILHEAD.x + 8, y: TRAILHEAD.y + 6 }, n = Math.max(2, Math.ceil(Math.hypot(best.x - a.x, best.y - a.y) / 3));
  TRAIL = Array.from({ length: n + 1 }, (_, k) => { const t = k / n, wob = Math.sin(t * Math.PI * 3) * 5 * Math.sin(t * Math.PI); return { x: a.x + (best.x - a.x) * t + wob * 0.5, y: a.y + (best.y - a.y) * t - wob * 0.4 }; });
  return TRAIL;
}
function trailDist(x: number, y: number) { let d = Infinity; for (const p of trail()) d = Math.min(d, Math.hypot(x - p.x, y - p.y)); return d; }
function paintTrail(c: C) {
  const pts = trail();
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2);
    for (let k = 0; k <= n; k++) { const x = a.x + ((b.x - a.x) * k) / n, y = a.y + ((b.y - a.y) * k) / n; R(c, Math.round(x) - 2, Math.round(y), 4, 1, '#8a7650'); }
  }
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2);
    for (let k = 0; k <= n; k++) { const x = a.x + ((b.x - a.x) * k) / n, y = a.y + ((b.y - a.y) * k) / n; R(c, Math.round(x) - 1, Math.round(y), 2, 1, hn(Math.round(x), Math.round(y), 98) < 0.3 ? '#cdb98a' : '#bba578'); }
  }
}

function drawTrailhead(c: C) {
  const { u, v } = world(TRAILHEAD.x, TRAILHEAD.y);
  lot(c, u - 6, v - 4, u + 6, v + 5, '#8a7a58');
  isoBox(c, u - 5, v - 3, u + 1, v + 2, 5, { wall: '#8a5a34', roof: '#5a3a24' });
  gableRoof(c, u - 5, v - 3, u + 1, v + 2, 5, 3, '#4a2e1c');
  const s = iso(u + 4, v + 3); R(c, Math.round(s.x), Math.round(s.y) - 7, 1, 7, '#5a3a24'); R(c, Math.round(s.x) - 3, Math.round(s.y) - 9, 7, 3, '#b08a54');
  for (let k = 0; k < 26; k++) P(c, Math.round(s.x - 4 - k * 0.9), Math.round(s.y - 10 - k * 1.6 + Math.sin(k / 2) * 2), '#c9b88a');
}

// ---------------------------------------------------------------- the interstate (elevated, drawn over the town)
function hwyH(u: number) { return Math.max(0, Math.min(1, (u - HWY.u0) / HWY.ramp)) * HWY.h; }
function paintHighway(c: C) {
  const { v0, v1 } = HWY;
  // its shadow on the ground, down to the right
  c.globalAlpha = 0.24;
  for (let u = HWY.u0; u < HWY.u1; u++) { const s = hwyH(u) * 0.6; fillPoly(c, [iso(u, v0), iso(u + 1.2, v0), iso(u + 1.2, v1), iso(u, v1)].map((p) => add(p, s, s * 0.5)), '#1c1a14'); }
  c.globalAlpha = 1;
  // pillars (a pair under each bent)
  for (let u = HWY.u0 + 24; u < HWY.u1; u += 14) for (const v of [v0 + 3, v1 - 3]) {
    const p = iso(u, v), h = Math.round(hwyH(u));
    R(c, Math.round(p.x) - 2, Math.round(p.y) - h, 4, h, '#7e8082'); R(c, Math.round(p.x) - 2, Math.round(p.y) - h, 1, h, '#a8aaac'); R(c, Math.round(p.x) + 1, Math.round(p.y) - h, 1, h, '#5e6062');
  }
  // the deck, back to front: the road surface, its edge face, then the markings
  for (let u = HWY.u0; u < HWY.u1; u++) {
    const h0 = hwyH(u), h1 = hwyH(u + 1);
    const A = up(iso(u, v0), h0), B = up(iso(u + 1.1, v0), h1), C2 = up(iso(u + 1.1, v1), h1), D = up(iso(u, v1), h0);
    if (h0 > 0.5) fillPoly(c, [D, C2, add(C2, 0, 3), add(D, 0, 3)], '#8a8c8e');
    fillPoly(c, [A, B, C2, D], '#55595e');
  }
  for (let u = HWY.u0; u < HWY.u1; u += 0.5) {
    const h = hwyH(u), pr = (v: number) => { const p = up(iso(u, v), h); return { x: Math.round(p.x), y: Math.round(p.y) }; };
    for (const v of [v0 + 3.5, v1 - 3.5]) if (mod(u, 6) < 3) { const p = pr(v); P(c, p.x, p.y, '#e8e4c8'); }
    const m = pr((v0 + v1) / 2); P(c, m.x, m.y - 1, '#d8dadc'); P(c, m.x, m.y, '#8a8c8e');
    for (const v of [v0 + 0.3, v1 - 0.3]) { const p = pr(v); P(c, p.x, p.y - 1, '#d0d2d4'); }
  }
}

// ---------------------------------------------------------------- the waterfall (animated)
function drawFalls(c: C, f: number) {
  // the sheet of water widens as it drops; streaks slide down frame by frame; spray off its edges
  // the lip: the creek spills over in a bright curl
  for (let x = 209; x <= 219; x++) { P(c, x, 125, '#7fc0cc'); P(c, x, 126, x % 2 ? '#ffffff' : '#d8eef0'); }
  for (let y = 127; y < 206; y++) {
    const t = (y - 127) / 79, w = 3 + t * 8 + (vnoise(f * 3, y, 3, 72) - 0.5) * 1.6, x0 = Math.round(214 - w), x1 = Math.round(214 + w);
    for (let x = x0; x <= x1; x++) {
      const k = hn(x, Math.floor((y - f * 5) / 3), 51), side = x === x0 || x === x1;
      P(c, x, y, side ? '#7fc0cc' : k > 0.72 ? '#f4fbfc' : k > 0.3 ? '#bfe3ea' : '#8ccbd6');
    }
    if (hn(y, f, 56) < 0.25 * t) P(c, x0 - 1 - Math.floor(hn(y, f, 57) * 2), y, '#d8eef0');
    if (hn(y, f, 58) < 0.25 * t) P(c, x1 + 1 + Math.floor(hn(y, f, 59) * 2), y, '#d8eef0');
  }
  // foam where it lands, and a mist cloud drifting over the pool and the start of the river
  for (let k = 0; k < 50; k++) {
    const x = 214 + Math.round((hn(k, f, 53) - 0.5) * 34), y = 204 + Math.round(hn(k, f, 54) * 12);
    P(c, x, y, hn(k, f, 55) < 0.5 ? '#ffffff' : COL.foam);
  }
  for (let k = 0; k < 9; k++) {
    c.globalAlpha = 0.1 + hn(k, f, 64) * 0.08;
    fillEllipse(c, 212 + (hn(k, 0, 65) - 0.5) * 26 + f, 199 + hn(k, 0, 66) * 8, 4 + hn(k, 0, 67) * 4, 2 + hn(k, 0, 68) * 2, '#ffffff');
  }
  c.globalAlpha = 1;
}

/** Mossy boulders around the plunge pool. */
function poolRocks(c: C) {
  for (let k = 0; k < 9; k++) {
    const a = Math.PI * (0.05 + k * 0.23), x = POOL.x + Math.cos(a) * (POOL.r + 3), y = POOL.y - 3 + Math.sin(a) * (POOL.r / 1.6 + 2);
    if (y > POOL.y + 2 && Math.abs(x - POOL.x) < 8) continue; // the outlet stays open
    const r = 2 + hn(k, 0, 69) * 2;
    fillEllipse(c, x, y, r + 1, r * 0.7 + 1, '#3a3632'); fillEllipse(c, x, y, r, r * 0.7, '#7a746a'); P(c, Math.round(x - r / 2), Math.round(y - r / 3), '#a8a296');
    if (hn(k, 1, 69) < 0.5) P(c, Math.round(x + 1), Math.round(y - r * 0.6), '#4f8a3a');
  }
}

// ---------------------------------------------------------------- build
function paintAll(c: C) {
  paintGround(c); paintMountain(c); paintBridges(c); paintDam(c); poolRocks(c); paintTrail(c);
  for (const o of cityObjects().sort((a, b) => a.y - b.y)) o.draw(c);
  drawTrailhead(c);
  paintHighway(c);
}
/** The whole map on one canvas (dev previews): the background with every place and the falls drawn in. */
export function drawCityCanvas(): HTMLCanvasElement {
  const cv = canvas(ART_W, ART_H), c = cv.getContext('2d')!;
  paintAll(c);
  drawFalls(c, 0);
  for (const p of [...PLACES].sort((a, b) => a.at.y - b.at.y)) PLACE_ART[p.id](c);
  return cv;
}

export const CITY_BG = 'city_bg_v4';
/** Where each baked sprite sits on the map (art px), kept with the textures. */
const OFFSETS = new Map<string, { x: number; y: number }>();
/** The map's textures (built once, kept across visits): the background, one per place, the falls (3 frames). */
export function buildCityArt(tm: Phaser.Textures.TextureManager): { places: Record<PlaceId, { key: string; x: number; y: number }>; falls: { key: string; x: number; y: number } } {
  if (!tm.exists(CITY_BG)) {
    const cv = canvas(ART_W, ART_H), c = cv.getContext('2d')!;
    paintAll(c);
    tm.addCanvas(CITY_BG, cv);
  }
  const places = {} as Record<PlaceId, { key: string; x: number; y: number }>;
  for (const p of PLACES) {
    const key = `city_${p.id}_v4`;
    if (!tm.exists(key) || !OFFSETS.has(key)) { const b = bake(tm, key, 1, (c) => PLACE_ART[p.id](c)); OFFSETS.set(key, { x: b.x, y: b.y }); }
    places[p.id] = { key, ...OFFSETS.get(key)! };
  }
  const fk = 'city_falls_v4';
  if (!tm.exists(fk) || !OFFSETS.has(fk)) { const b = bake(tm, fk, 3, drawFalls); OFFSETS.set(fk, { x: b.x, y: b.y }); }
  const falls = { key: fk, ...OFFSETS.get(fk)! };
  return { places, falls };
}

/** For tests and the scene: is this art px on dry, flat land (not the river, not the mountain)? */
export const isLand = (x: number, y: number) => waterDist(x, y) > 0 && !onMountain(x, y);
export { mix, R };
