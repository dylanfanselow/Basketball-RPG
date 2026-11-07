/**
 * Hand-editable face parts. A player's head is assembled from parts, hair (front + back layer), beard, brows,
 * eyes, nose, mouth, each a small picture per view (side = profile, also used for the back of the head; front =
 * front and three-quarter). Pictures live in src/art/parts/<type>/<variant>_<view>.png and are edited in the pixel
 * editor; a part with no picture is drawn by the original code in sprites.ts, so nothing changes until someone
 * draws one.
 *
 * Pictures are PART_SIZE × PART_SIZE art pixels centered on the head center at head scale 1, drawn in grays and
 * recolored per player:
 *   hair / hairBack / beard / brows → the player's hair-color ramp, nose / mouth → the skin ramp (by brightness,
 *   keeping any tint, e.g. reddish lips), eyes → kept as drawn except pure green #00ff00 = the player's eye color
 *   (#00a000 = a darker shade of it). Near-white grays (teeth, eye whites) are always kept.
 * Works in the sheet workers too (no DOM): the main thread sends the pictures a sheet needs with each job.
 */
import type { Appearance } from './appearance';

export const PART_TYPES = ['hair', 'hairBack', 'beard', 'brows', 'eyes', 'nose', 'mouth'] as const;
export type PartType = (typeof PART_TYPES)[number];
export type PartView = 'side' | 'front';
export const PART_VIEWS: PartView[] = ['side', 'front'];
export const PART_SIZE = 44;
export const PART_C = PART_SIZE / 2;

export interface PartImg { w: number; h: number; data: Uint8ClampedArray }
/** Four-tone ramp as hex strings (hi, base, sh, deep), the same shape sprites.ts uses. */
export interface Ramp4 { hi: string; base: string; sh: string; deep: string }

export const partKey = (t: PartType, variant: string, view: PartView) => `${t}/${variant}_${view}`;

/** The variant a player uses for each part type. */
export function variantOf(a: Appearance, t: PartType, opts: { open?: boolean } = {}): string {
  switch (t) {
    case 'hair': case 'hairBack': return a.hair;
    case 'beard': return a.facial;
    case 'brows': return a.brows ?? (a.brow === 2 ? 'thick' : 'thin');
    case 'eyes': return a.eyes ?? (a.eyeGap ? 'wide' : 'default');
    case 'nose': return a.nose;
    case 'mouth': return opts.open ? 'open' : a.mouth;
  }
}

// ---------- library ----------
const LIB = new Map<string, PartImg>();
let version = 0;
const listeners = new Set<() => void>();
/** Changes whenever pictures are added/changed (sprite caches key on it). */
export const partsVersion = () => version;
export function onPartsChanged(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); }
function bump() { version++; RECOLOR.clear(); for (const fn of listeners) fn(); }

export function setPart(key: string, img: PartImg | null) { if (img) LIB.set(key, img); else LIB.delete(key); bump(); }
export function setParts(all: Record<string, PartImg>, replace = false) { if (replace) LIB.clear(); for (const [k, v] of Object.entries(all)) LIB.set(k, v); bump(); }
export const getPart = (key: string) => LIB.get(key) ?? null;
export const partKeys = () => [...LIB.keys()];
/** Every variant name that has a picture for this type (either view). */
export function partVariants(t: PartType): string[] {
  const out = new Set<string>();
  for (const k of LIB.keys()) { const m = k.match(/^([^/]+)\/(.+)_(side|front)$/); if (m && m[1] === t) out.add(m[2]); }
  return [...out];
}
/** The pictures a given look needs (sent to a sheet worker with the job). */
export function partsFor(a: Appearance): Record<string, PartImg> {
  const out: Record<string, PartImg> = {};
  for (const t of PART_TYPES) for (const view of PART_VIEWS) for (const open of t === 'mouth' ? [false, true] : [false]) {
    const k = partKey(t, variantOf(a, t, { open }), view), img = LIB.get(k);
    if (img) out[k] = img;
  }
  return out;
}

// ---------- recolor ----------
const rgbOf = (h: string): [number, number, number] => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
/** Brightness of the seed grays each ramp tone came from (ramp('#808080') in sprites.ts). */
const ANCHORS = [67, 95, 128, 164];
export type RecolorMode = 'hair' | 'skin' | 'eyes';
export const modeOf = (t: PartType): RecolorMode => (t === 'eyes' ? 'eyes' : t === 'nose' || t === 'mouth' ? 'skin' : 'hair');

/** Map a brightness (0..255) onto a ramp: deep … hi, darker below, toward white above. */
function rampAt(r: Ramp4, L: number): [number, number, number] {
  const deep = rgbOf(r.deep), stops: [number, [number, number, number]][] = [
    [0, [deep[0] * 0.45, deep[1] * 0.45, deep[2] * 0.45]], [ANCHORS[0], deep], [ANCHORS[1], rgbOf(r.sh)], [ANCHORS[2], rgbOf(r.base)], [ANCHORS[3], rgbOf(r.hi)],
  ];
  const hi = rgbOf(r.hi); stops.push([255, [hi[0] + (255 - hi[0]) * 0.7, hi[1] + (255 - hi[1]) * 0.7, hi[2] + (255 - hi[2]) * 0.7]]);
  for (let i = 1; i < stops.length; i++) {
    if (L <= stops[i][0]) {
      const [l0, c0] = stops[i - 1], [l1, c1] = stops[i], u = (L - l0) / Math.max(1, l1 - l0);
      return [c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u, c0[2] + (c1[2] - c0[2]) * u];
    }
  }
  return stops[stops.length - 1][1];
}

/** Recolor one picture's pixels in place into `out` (RGBA). */
export function recolorPixels(src: Uint8ClampedArray, out: Uint8ClampedArray, mode: RecolorMode, ramp: Ramp4, eye: string) {
  const E = rgbOf(eye);
  for (let i = 0; i < src.length; i += 4) {
    const r = src[i], g = src[i + 1], b = src[i + 2], al = src[i + 3];
    out[i + 3] = al;
    if (!al) { out[i] = out[i + 1] = out[i + 2] = 0; continue; }
    if (mode === 'eyes') {
      if (r < 40 && b < 40 && g > 120) { const f = g / 255; out[i] = E[0] * f; out[i + 1] = E[1] * f; out[i + 2] = E[2] * f; } // eye-color key
      else { out[i] = r; out[i + 1] = g; out[i + 2] = b; }
      continue;
    }
    const L = (r + g + b) / 3;
    const gray = Math.max(r, g, b) - Math.min(r, g, b) < 14;
    if (gray && L > 236) { out[i] = r; out[i + 1] = g; out[i + 2] = b; continue; } // whites stay white
    const c = rampAt(ramp, L), k = 1 / (L + 1);
    // keep any tint the artist used (lips, flush): scale the ramp color by the pixel's color balance
    out[i] = Math.min(255, c[0] * Math.min(2, Math.max(0.5, (r + 1) * k)));
    out[i + 1] = Math.min(255, c[1] * Math.min(2, Math.max(0.5, (g + 1) * k)));
    out[i + 2] = Math.min(255, c[2] * Math.min(2, Math.max(0.5, (b + 1) * k)));
  }
}

// ---------- eyes: pixel-snapped and mirror-exact ----------
/**
 * Screen offset (whole pixels) of a cell whose center sits d art pixels from a pixel boundary, at scale k. Mirrors
 * exactly: snapCell(-d) === -1 - snapCell(d), so a mirrored pair of cells always lands on a mirrored pair of screen
 * pixels, whatever the scale or where the head is.
 */
export const snapCell = (d: number, k: number) => (d > 0 ? Math.floor(d * k) : -1 - Math.floor(-d * k));
/** One eye pixel: dx/dy = cell center relative to the face center (±0.5, ±1.5 …); iris cells are plotted last. */
export interface EyeCell { dx: number; dy: number; color: string; iris?: boolean }
/**
 * Plot eye cells as single pixels around (x, y). Eyes are never scaled with drawImage: a 1 px iris would turn into
 * 1 or 2 px depending on where it lands, which gives cross-eyed / uneven-white faces. Iris cells go last so at tiny
 * scales an iris that collides with its white wins on both sides alike.
 */
export function plotEyeCells(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, cells: EyeCell[]) {
  const bx = Math.round(x), by = Math.round(y);
  for (const pass of [false, true]) for (const c of cells) {
    if (!!c.iris !== pass) continue;
    ctx.fillStyle = c.color;
    ctx.fillRect(bx + snapCell(c.dx, k), by + snapCell(c.dy, k), 1, 1);
  }
}
/**
 * The standard front pair, matching the owner's celeb art: `W I · · · · I W` (white outside, iris inside, mirrored,
 * looking straight ahead). gap = empty pixels between the irises (4, or 6 for wide-set eyes).
 */
export function frontEyeCells(eye: string, gap = 4, dy = 0.5, white = '#f2efe8'): EyeCell[] {
  const h = gap / 2;
  return [
    { dx: -(h + 1.5), dy, color: white }, { dx: -(h + 0.5), dy, color: eye, iris: true },
    { dx: h + 0.5, dy, color: eye, iris: true }, { dx: h + 1.5, dy, color: white },
  ];
}

const EYE_CELLS = new WeakMap<PartImg, Map<string, EyeCell[]>>();
const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0');
/** An eye picture as cells (recolored; pixel centers relative to the picture center PART_C). */
export function eyeCellsOf(img: PartImg, eye: string): EyeCell[] {
  let byEye = EYE_CELLS.get(img);
  if (!byEye) EYE_CELLS.set(img, (byEye = new Map()));
  let cells = byEye.get(eye);
  if (cells) return cells;
  cells = [];
  const out = new Uint8ClampedArray(img.data.length);
  recolorPixels(img.data, out, 'eyes', { hi: '#000000', base: '#000000', sh: '#000000', deep: '#000000' }, eye);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const i = (y * img.w + x) * 4;
    if (img.data[i + 3] < 110) continue;
    const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
    cells.push({ dx: x + 0.5 - img.w / 2, dy: y + 0.5 - img.h / 2, color: `#${hex2(out[i])}${hex2(out[i + 1])}${hex2(out[i + 2])}`, iris: (r < 40 && b < 40 && g > 120) || r + g + b < 180 }); // eye-color key or a dark pupil
  }
  byEye.set(eye, cells);
  return cells;
}

const RECOLOR = new Map<string, HTMLCanvasElement>();
function canvasOf(w: number, h: number): HTMLCanvasElement {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h) as unknown as HTMLCanvasElement;
}

/**
 * Draw a part picture for this look, centered at (x, y), scaled by k. Returns false when there's no picture (the
 * caller then draws the part the old way). dy shifts it vertically (eye / mouth height).
 */
export function drawPart(ctx: CanvasRenderingContext2D, t: PartType, view: PartView, x: number, y: number, k: number, a: Appearance, ramps: { hair: Ramp4; skin: Ramp4 }, opts: { open?: boolean; dy?: number } = {}): boolean {
  const key = partKey(t, variantOf(a, t, opts), view);
  const img = LIB.get(key);
  if (!img) return false;
  const mode = modeOf(t), ramp = mode === 'skin' ? ramps.skin : ramps.hair;
  if (mode === 'eyes') { plotEyeCells(ctx, x, y + (opts.dy ?? 0), k, eyeCellsOf(img, a.eyeColor)); return true; }
  const ck = `${key}|${version}|${mode}|${ramp.hi}${ramp.base}${ramp.sh}${ramp.deep}`;
  let can = RECOLOR.get(ck);
  if (!can) {
    can = canvasOf(img.w, img.h);
    const c2 = can.getContext('2d')!, id = c2.createImageData(img.w, img.h);
    recolorPixels(img.data, id.data, mode, ramp, a.eyeColor);
    c2.putImageData(id, 0, 0);
    if (RECOLOR.size > 400) RECOLOR.clear();
    RECOLOR.set(ck, can);
  }
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(can as unknown as CanvasImageSource, x - PART_C * k, y - PART_C * k + (opts.dy ?? 0), img.w * k, img.h * k);
  ctx.restore();
  return true;
}
