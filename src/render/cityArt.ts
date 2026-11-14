import Phaser from 'phaser';
import { ART_W, ART_H, C, R, P, hn, mix, bake, canvas } from './roomArt';
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
  [214, 207, 5], [250, 226, 6], [296, 244, 7], [340, 257, 8], [384, 273, 9], [428, 292, 10], [470, 310, 10],
  [512, 326, 11], [556, 344, 12], [600, 362, 12], [644, 381, 13], [690, 402, 15], [736, 424, 16], [780, 442, 18], [830, 458, 20],
];
/** Below the dam the river runs on off the bottom of the map. */
const OUTFLOW: [number, number, number][] = [[722, 516, 5], [714, 532, 6], [706, 548, 6]];
const POOL = { x: 214, y: 208, r: 11 };
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
const KEEP_CLEAR: Record<PlaceId, number> = { home: 30, arena: 62, trailer: 40, lincoln: 40, ridgemont: 40, crestview: 40, burger: 30, park: 40, trailhead: 26 };
function nearPlace(x: number, y: number, pad = 0): boolean {
  for (const p of PLACES) if (Math.hypot(x - p.at.x, (y - p.at.y) * 1.6) < KEEP_CLEAR[p.id] + pad) return true;
  return false;
}

// ---------------------------------------------------------------- zones
type Zone = 'down' | 'shop' | 'res' | 'park' | 'forest' | 'field';
function zoneAt(x: number, y: number): Zone {
  const f = footY(x);
  if ((f >= 0 && y < f + 26 + vnoise(x, y, 18, 5) * 26) || (x < 110 && y < 410) || (x > 860 && y < 120 && vnoise(x, y, 30, 6) > 0.4)) return 'forest';
  if (x < 236 && y > 476) return 'field';
  if (Math.hypot(x - 470, (y - 244) * 1.5) < 52) return 'park';
  if (waterDist(x, y) < 18) return 'park';
  if (Math.hypot((x - 650) / 168, (y - 258) / 80) < 1 && y < 360) return 'down';
  if (Math.hypot((x - 650) / 168, (y - 258) / 80) < 1.45 && hn(Math.floor(x / 40), Math.floor(y / 30), 8) < 0.55) return 'shop';
  return 'res';
}
/** The zone of the block a world point is in (decided at the block's centre, so a block is all one thing). */
function blockZone(u: number, v: number): Zone {
  const c = iso(Math.floor(u / BLOCK) * BLOCK + BLOCK / 2 + ROAD / 2, Math.floor(v / BLOCK) * BLOCK + BLOCK / 2 + ROAD / 2);
  return zoneAt(c.x, c.y);
}
const mod = (a: number, n: number) => ((a % n) + n) % n;
const isRoad = (u: number, v: number) => mod(u, BLOCK) < ROAD || mod(v, BLOCK) < ROAD;
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
  const roadHere = isRoad(u, v);
  if (wd < 0) {
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
  const bz = blockZone(u, v);
  const mu = mod(u, BLOCK) - ROAD, mv = mod(v, BLOCK) - ROAD, inner = BLOCK - ROAD;
  const edge = Math.min(mu, mv, inner - mu, inner - mv);
  if (bz === 'down' || bz === 'shop') return edge < 2 ? COL.walk : COL.concrete[Math.floor(n * 3)];
  if (bz === 'park') return (Math.abs(mu - mv) < 1 || Math.abs(mu + mv - inner) < 1) && edge > 2 ? '#c9bf98' : COL.park[Math.floor(n * 3)];
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
    if (k < 0) continue;
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
  // the creek off the snow down to the falls
  const creek: Pt[] = [{ x: 168, y: 96 }, { x: 186, y: 118 }, { x: 200, y: 136 }, { x: 210, y: 152 }];
  for (let i = 0; i + 1 < creek.length; i++) {
    const a = creek[i], b = creek[i + 1], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
    for (let t = 0; t <= n; t++) { const x = Math.round(a.x + ((b.x - a.x) * t) / n), y = Math.round(a.y + ((b.y - a.y) * t) / n); R(c, x - 1, y, 3, 1, COL.water[1]); P(c, x, y, COL.glint); }
  }
  // the cliff the falls drop over: a dark wet notch in the rock, ragged at the sides, mossy at the foot
  for (let y = 146; y < 204; y++) {
    const k = (y - 146) / 58, half = 10 + k * 6 + (vnoise(0, y, 4, 70) - 0.5) * 5, cx = 214;
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      const edge = Math.abs(x - cx) > half - 2, n = hn(x, y, 71);
      P(c, x, y, y < 148 ? COL.rockOL : edge ? COL.rockOL : y > 194 && n < 0.5 ? '#3f6a3a' : n < 0.3 ? '#3e3a36' : n < 0.7 ? COL.rockD[2] : COL.rockD[1]);
    }
  }
}

// ---------------------------------------------------------------- buildings + trees
type Obj = { y: number; draw: (c: C) => void };

function cityObjects(): Obj[] {
  const out: Obj[] = [];
  const land = (x: number, y: number) => x > 2 && x < ART_W - 2 && y > 2 && y < ART_H - 2 && waterDist(x, y) > 4 && !onMountain(x, y) && !nearPlace(x, y);
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
    const inForest = !onMountain(jx, jy) && zoneAt(jx, jy) === 'forest' && !isRoad(world(jx, jy).u, world(jx, jy).v);
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
  trailer: (c) => {
    const { u, v } = placeWorld('trailer');
    lot(c, u - 16, v - 14, u + 14, v + 12, '#9a8a62', '#7a6a48');
    const T = ['#e8e2d0', '#c9d6d2', '#d8cbb0', '#bfd0c4'];
    for (let k = 0; k < 4; k++) {
      const pv = v - 12 + k * 6, mom = k === 3;
      isoBox(c, u - 12, pv, u + 6, pv + 3.6, 5, { wall: T[k], roof: '#9aa0a6', windows: 'house', lit: mom ? 1 : 0.2, seed: k });
      if (mom) { isoBox(c, u + 8, pv, u + 10, pv + 2, 3, { wall: '#5a7a4a', roof: '#6f8a5a' }); }
    }
    for (let k = 0; k < 6; k++) { const f = iso(u + 13, v - 13 + k * 4.6); R(c, Math.round(f.x), Math.round(f.y) - 3, 1, 3, '#8a7a5a'); }
    pine(c, Math.round(iso(u - 15, v + 8).x), Math.round(iso(u - 15, v + 8).y), 10, 1);
  },
  // Lincoln High: the brick school, the fenced outdoor court with two hoops
  lincoln: (c) => {
    const { u, v } = placeWorld('lincoln');
    isoBox(c, u - 18, v - 18, u + 6, v - 8, 10, { wall: '#9a4a36', roof: '#7a1f2b', windows: 'house', lit: 0.4, seed: 9 });
    lot(c, u - 14, v - 6, u + 10, v + 8, '#5a6a72', '#3a464c');
    lot(c, u - 12, v - 4, u + 8, v + 6, '#7a1f2b');
    const mid = [iso(u - 2, v - 4), iso(u - 2, v + 6)]; line(c, mid[0], mid[1], '#e0b33a');
    for (const [hu, sgn] of [[u - 11, 1], [u + 7, -1]] as const) {
      const b = iso(hu, v + 1);
      R(c, Math.round(b.x), Math.round(b.y) - 9, 1, 9, '#3a3a3a');
      R(c, Math.round(b.x) - 2, Math.round(b.y) - 12, 5, 4, '#e8e8e8'); P(c, Math.round(b.x) + sgn * 2, Math.round(b.y) - 8, '#e05a2a');
    }
    for (let k = 0; k <= 24; k += 2) { const p = iso(u - 14 + k, v + 8); R(c, Math.round(p.x), Math.round(p.y) - 4, 1, 4, '#9aa0a6'); }
    for (let k = 0; k <= 14; k += 2) { const p = iso(u + 10, v - 6 + k); R(c, Math.round(p.x), Math.round(p.y) - 4, 1, 4, '#9aa0a6'); }
  },
  // Ridgemont Academy on its terrace: cream stone, forest-green roofs, a bell tower
  ridgemont: (c) => {
    const { u, v } = placeWorld('ridgemont');
    lot(c, u - 18, v - 14, u + 12, v + 10, '#9a9480', '#6e6a5a');
    isoBox(c, u - 14, v - 10, u + 8, v - 2, 10, { wall: '#e8e2d0', roof: '#1f5a3a', windows: 'house', lit: 0.5, seed: 11 });
    gableRoof(c, u - 14, v - 10, u + 8, v - 2, 10, 5, '#1f5a3a');
    isoBox(c, u - 14, v - 2, u - 6, v + 7, 8, { wall: '#ded6c0', roof: '#1f5a3a', windows: 'house', seed: 12 });
    gableRoof(c, u - 14, v - 2, u - 6, v + 7, 8, 4, '#1f5a3a');
    isoBox(c, u + 2, v - 1, u + 6, v + 3, 22, { wall: '#e8e2d0', roof: '#1f5a3a', windows: 'none' });
    const t = up(iso(u + 4, v + 1), 22); fillPoly(c, [{ x: t.x, y: t.y - 10 }, { x: t.x - 9, y: t.y }, { x: t.x + 9, y: t.y }], '#173f2a');
    fillPoly(c, [{ x: t.x, y: t.y - 10 }, { x: t.x - 8, y: t.y - 0.5 }, { x: t.x, y: t.y - 0.5 }], '#2a7048');
    P(c, Math.round(t.x), Math.round(t.y) - 5, '#e0b33a');
  },
  // Crestview Prep: silver halls with navy roofs, a clock tower
  crestview: (c) => {
    const { u, v } = placeWorld('crestview');
    lot(c, u - 16, v - 14, u + 14, v + 10, '#8a9a6a', '#5a6a46');
    isoBox(c, u - 12, v - 10, u + 10, v - 3, 9, { wall: '#c0c6cf', roof: '#1c2b4a', windows: 'house', lit: 0.3, seed: 21 });
    gableRoof(c, u - 12, v - 10, u + 10, v - 3, 9, 5, '#1c2b4a');
    isoBox(c, u + 3, v - 3, u + 10, v + 6, 7, { wall: '#b4bac4', roof: '#1c2b4a', windows: 'house', seed: 22 });
    gableRoof(c, u + 3, v - 3, u + 10, v + 6, 7, 4, '#1c2b4a');
    isoBox(c, u - 6, v - 2, u - 2, v + 2, 18, { wall: '#c0c6cf', roof: '#1c2b4a' });
    const t = up(iso(u - 4, v), 18); fillEllipse(c, t.x - 2, t.y - 7, 2.5, 2.5, '#f2f2ea'); P(c, Math.round(t.x - 2), Math.round(t.y) - 8, '#1c2b4a');
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
  // the trailhead: a little log cabin, a sign, the trail heading up
  trailhead: (c) => {
    const { u, v } = placeWorld('trailhead');
    lot(c, u - 6, v - 4, u + 6, v + 5, '#8a7a58');
    isoBox(c, u - 5, v - 3, u + 1, v + 2, 5, { wall: '#8a5a34', roof: '#5a3a24' });
    gableRoof(c, u - 5, v - 3, u + 1, v + 2, 5, 3, '#4a2e1c');
    const s = iso(u + 4, v + 3); R(c, Math.round(s.x), Math.round(s.y) - 7, 1, 7, '#5a3a24'); R(c, Math.round(s.x) - 3, Math.round(s.y) - 9, 7, 3, '#b08a54');
    for (let k = 0; k < 26; k++) P(c, Math.round(s.x - 4 - k * 0.9), Math.round(s.y - 10 - k * 1.6 + Math.sin(k / 2) * 2), '#c9b88a');
  },
};

// ---------------------------------------------------------------- the waterfall (animated)
function drawFalls(c: C, f: number) {
  // the sheet of water: its edges wobble, streaks slide down frame by frame, spray where it lands
  for (let y = 147; y < 201; y++) {
    const w = 5 + ((y - 147) / 54) * 3 + (vnoise(f * 3, y, 3, 72) - 0.5) * 2, x0 = Math.round(214 - w), x1 = Math.round(214 + w);
    for (let x = x0; x <= x1; x++) {
      const k = hn(x, Math.floor((y - f * 5) / 3), 51), side = x === x0 || x === x1;
      P(c, x, y, side ? '#7fc0cc' : k > 0.72 ? '#f4fbfc' : k > 0.3 ? '#bfe3ea' : '#8ccbd6');
    }
  }
  for (let k = 0; k < 40; k++) {
    const x = 214 + Math.round((hn(k, f, 53) - 0.5) * 30), y = 196 + Math.round(hn(k, f, 54) * 10);
    P(c, x, y, hn(k, f, 55) < 0.5 ? '#ffffff' : COL.foam);
  }
}

// ---------------------------------------------------------------- build
/** The whole map on one canvas (dev previews): the background with every place and the falls drawn in. */
export function drawCityCanvas(): HTMLCanvasElement {
  const cv = canvas(ART_W, ART_H), c = cv.getContext('2d')!;
  paintGround(c); paintMountain(c); paintBridges(c); paintDam(c);
  for (const o of cityObjects().sort((a, b) => a.y - b.y)) o.draw(c);
  drawFalls(c, 0);
  for (const p of [...PLACES].sort((a, b) => a.at.y - b.at.y)) PLACE_ART[p.id](c);
  return cv;
}

export const CITY_BG = 'city_bg_v1';
/** Where each baked sprite sits on the map (art px), kept with the textures. */
const OFFSETS = new Map<string, { x: number; y: number }>();
/** The map's textures (built once, kept across visits): the background, one per place, the falls (3 frames). */
export function buildCityArt(tm: Phaser.Textures.TextureManager): { places: Record<PlaceId, { key: string; x: number; y: number }>; falls: { key: string; x: number; y: number } } {
  if (!tm.exists(CITY_BG)) {
    const cv = canvas(ART_W, ART_H), c = cv.getContext('2d')!;
    paintGround(c);
    paintMountain(c);
    paintBridges(c);
    paintDam(c);
    const objs = cityObjects().sort((a, b) => a.y - b.y);
    for (const o of objs) o.draw(c);
    tm.addCanvas(CITY_BG, cv);
  }
  const places = {} as Record<PlaceId, { key: string; x: number; y: number }>;
  for (const p of PLACES) {
    const key = `city_${p.id}_v1`;
    if (!tm.exists(key) || !OFFSETS.has(key)) { const b = bake(tm, key, 1, (c) => PLACE_ART[p.id](c)); OFFSETS.set(key, { x: b.x, y: b.y }); }
    places[p.id] = { key, ...OFFSETS.get(key)! };
  }
  const fk = 'city_falls_v1';
  if (!tm.exists(fk) || !OFFSETS.has(fk)) { const b = bake(tm, fk, 3, drawFalls); OFFSETS.set(fk, { x: b.x, y: b.y }); }
  const falls = { key: fk, ...OFFSETS.get(fk)! };
  return { places, falls };
}

/** For tests and the scene: is this art px on dry, flat land (not the river, not the mountain)? */
export const isLand = (x: number, y: number) => waterDist(x, y) > 0 && !onMountain(x, y);
export { mix, R };
