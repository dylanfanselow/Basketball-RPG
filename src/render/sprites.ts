/**
 * Procedural pixel-art players. Bodies are skeletons from anim.ts drawn as layered limb segments
 * (skin, then sleeves/socks/shoes on top), and a bigger head with face, hair and gear.
 * Every clip is sampled into frames and packed into one sheet per player.
 */
import { CLIPS, Clip, Pose, J, sampleClip, frameTime } from './anim';
import { Appearance, SKIN_TONES } from './appearance';

export const FRAME_W = 64;
export const FRAME_H = 112;
export const CX = 32;        // horizontal center of the figure in a frame
export const FOOT_Y = 106;   // floor line in a frame
export const PIXEL = 2;      // screen pixels per art pixel
export const COLS = 16;

/** number < 0 hides the number; pants = full-length trousers (coaches) */
export interface Kit { jersey: string; jerseyShade: string; trim: string; shorts: string; number: number; pants?: boolean }
export interface Sheet { canvas: HTMLCanvasElement; index: Record<string, { start: number; count: number }>; ball: (J | null)[]; total: number }

/** Art-pixel figure height for a player height in feet (6'6" -> ~66 px -> ~132 screen px). */
export const figureHeight = (heightFt: number) => Math.round(heightFt * 10.2);

export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return '#' + ((1 << 24) | (c((n >> 16) & 255) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).slice(1);
}

// ---------- raster primitives ----------
type Ctx = CanvasRenderingContext2D;
function px(ctx: Ctx, x: number, y: number, c: string) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); }
function rect(ctx: Ctx, x: number, y: number, w: number, h: number, c: string) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
function line(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, c: string) {
  ctx.fillStyle = c;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const o = Math.floor(w / 2);
  for (;;) {
    ctx.fillRect(x0 - o, y0 - o, w, w);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
/** Draw the part of segment a->b between t0 and t1. */
function part(ctx: Ctx, a: J, b: J, t0: number, t1: number, w: number, c: string) {
  line(ctx, a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0, a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1, w, c);
}

const DIG: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '011', '001', '111'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'], '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111'],
};
function digits(ctx: Ctx, x: number, y: number, n: number, c: string) {
  const s = String(n % 100);
  let ox = Math.round(x - (s.length * 4 - 1) / 2);
  for (const ch of s) {
    const g = DIG[ch];
    for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) if (g[r][k] === '1') px(ctx, ox + k, y + r, c);
    ox += 4;
  }
}

// ---------- body ----------
function drawLeg(ctx: Ctx, hip: J, knee: J, foot: J, a: Appearance, kit: Kit, back: boolean, sleeve: boolean, pad: boolean) {
  const [skin] = SKIN_TONES[a.skin % SKIN_TONES.length];
  const sk = back ? shade(skin, 0.82) : skin;
  const dim = (c: string) => (back ? shade(c, 0.8) : c);
  line(ctx, hip[0], hip[1], knee[0], knee[1], 6, sk);
  line(ctx, knee[0], knee[1], foot[0], foot[1] - 2, 5, sk);
  if (kit.pants) { line(ctx, hip[0], hip[1], knee[0], knee[1], 6, dim(kit.shorts)); part(ctx, knee, foot, 0, 0.95, 5, dim(kit.shorts)); }
  else part(ctx, hip, knee, 0, 0.58, 8, dim(kit.shorts));               // shorts
  if (sleeve) { part(ctx, hip, knee, 0.55, 1, 6, dim(a.legSleeveColor)); part(ctx, knee, foot, 0, 0.7, 5, dim(a.legSleeveColor)); }
  if (pad) part(ctx, hip, knee, 0.85, 1, 5, dim('#20232a')), part(ctx, knee, foot, 0, 0.12, 5, dim('#20232a'));
  const sockFrom = a.socks === 'high' ? 0.35 : a.socks === 'crew' ? 0.68 : 0.9;
  if (!kit.pants) part(ctx, knee, foot, sockFrom, 0.92, 5, dim(a.sockColor));
  // shoe: points forward (+x), accent stripe
  const fx = Math.round(foot[0]), fy = Math.round(foot[1]);
  rect(ctx, fx - 3, fy - 3, 7, 3, dim(a.shoe));
  rect(ctx, fx - 3, fy - 1, 7, 1, dim(shade(a.shoe, 0.7)));
  rect(ctx, fx - 1, fy - 2, 3, 1, dim(a.shoeAccent));
}

function drawArm(ctx: Ctx, sh: J, el: J, hand: J, a: Appearance, kit: Kit, back: boolean, sleeve: boolean, wrist: boolean) {
  const [skin] = SKIN_TONES[a.skin % SKIN_TONES.length];
  const sk = back ? shade(skin, 0.82) : skin;
  const dim = (c: string) => (back ? shade(c, 0.8) : c);
  line(ctx, sh[0], sh[1], el[0], el[1], 5, sk);
  line(ctx, el[0], el[1], hand[0], hand[1], 4, sk);
  if (sleeve) { part(ctx, sh, el, 0.15, 1, 5, dim(a.sleeveColor)); part(ctx, el, hand, 0, 0.78, 4, dim(a.sleeveColor)); }
  if (wrist && a.wristband) part(ctx, el, hand, 0.68, 0.86, 5, dim(a.wristband));
  rect(ctx, hand[0] - 2, hand[1] - 1, 4, 4, sk);
  rect(ctx, sh[0] - 3, sh[1] - 1, 6, 4, dim(kit.jersey)); // jersey strap over the shoulder
}

function drawTorso(ctx: Ctx, neck: J, hip: J, sF: J, sB: J, kit: Kit) {
  const top: J = [(sF[0] + sB[0]) / 2, Math.min(sF[1], sB[1]) - 1];
  const len = Math.max(1, hip[1] - top[1]);
  for (let i = 0; i <= Math.abs(len); i++) {
    const t = i / Math.abs(len || 1);
    const cx = top[0] + (hip[0] - top[0]) * t;
    const cy = top[1] + (hip[1] - top[1]) * t;
    const w = 14 - t * 2.5;
    rect(ctx, cx - w / 2, cy, Math.round(w), 1, kit.jersey);
    rect(ctx, cx - w / 2, cy, 2, 1, kit.jerseyShade);
  }
  rect(ctx, top[0] - 2, top[1], 5, 1, kit.trim);           // collar
  rect(ctx, hip[0] - 7, hip[1] - 2, 14, 7, kit.shorts);    // shorts waist
  rect(ctx, hip[0] - 7, hip[1] - 2, 14, 1, kit.trim);
  if (kit.number >= 0) digits(ctx, top[0] + (hip[0] - top[0]) * 0.4, top[1] + (hip[1] - top[1]) * 0.25, kit.number, kit.trim);
  else { rect(ctx, top[0] - 1, top[1], 3, Math.round((hip[1] - top[1]) * 0.6), '#f4f4f4'); px(ctx, top[0], top[1] + 2, kit.trim); } // shirt + tie
  line(ctx, neck[0], neck[1], top[0], top[1], 4, 'transparent');
}

// ---------- head ----------
const HEAD_ROWS: [number, number, number][] = [ // [y, xFrom, xTo] relative to head center, facing +x (12x13)
  [-6, -3, 3], [-5, -5, 5], [-4, -5, 5], [-3, -5, 5], [-2, -5, 5], [-1, -5, 5], [0, -5, 5], [1, -5, 5],
  [2, -5, 5], [3, -5, 5], [4, -4, 5], [5, -4, 5], [6, -2, 4],
];

function drawHairBack(ctx: Ctx, cx: number, cy: number, a: Appearance) {
  const c = a.hairColor;
  if (a.hair === 'afro') { for (let y = -12; y <= 3; y++) for (let x = -10; x <= 8; x++) if ((x + 1) ** 2 / 90 + (y + 4) ** 2 / 64 <= 1) px(ctx, cx + x, cy + y, c); }
  if (a.hair === 'dreads') for (let x = -7; x <= -1; x += 2) rect(ctx, cx + x, cy - 3, 2, 12 + ((x * 7) & 3), shade(c, x % 4 === 0 ? 1 : 0.85));
  if (a.hair === 'braids') for (let x = -7; x <= -3; x += 2) rect(ctx, cx + x, cy - 2, 1, 9, shade(c, 0.9));
  if (a.hair === 'bun') { for (let y = -3; y <= 1; y++) for (let x = -3; x <= 1; x++) if (x * x + y * y <= 4) px(ctx, cx - 6 + x, cy - 8 + y, c); }
}

function drawHairFront(ctx: Ctx, cx: number, cy: number, a: Appearance) {
  const c = a.hairColor, hi = shade(c, 1.35);
  /** Fill the top of the skull from row yTop to yBot (rows above the head get a slightly narrower dome). */
  const cap = (yTop: number, yBot: number, back = -6, front = 4) => {
    for (let y = yTop; y <= yBot; y++) {
      const r = HEAD_ROWS.find((h) => h[0] === y);
      const x0 = r ? Math.max(back, r[1]) : back + 2, x1 = r ? Math.min(front, r[2]) : front - 2;
      rect(ctx, cx + x0, cy + y, x1 - x0 + 1, 1, c);
    }
  };
  switch (a.hair) {
    case 'bald': px(ctx, cx - 1, cy - 5, shade(SKIN_TONES[a.skin % 5][0], 1.15)); break;
    case 'buzz': cap(-6, -5); rect(ctx, cx - 6, cy - 4, 3, 3, shade(c, 1.1)); break;
    case 'fade': cap(-7, -4); for (let y = -3; y <= 0; y++) for (let x = -6; x <= -3; x++) if ((x + y) % 2 === 0 || y < -1) px(ctx, cx + x, cy + y, c); break;
    case 'hightop': rect(ctx, cx - 5, cy - 13, 10, 8, c); rect(ctx, cx - 5, cy - 13, 10, 1, hi); cap(-5, -4); break;
    case 'afro': for (let x = -6; x <= 5; x++) px(ctx, cx + x, cy - 5, c); break;
    case 'twists': cap(-7, -4); for (let x = -6; x <= 4; x += 2) rect(ctx, cx + x, cy - 9 - (x & 2 ? 1 : 0), 1, 3, c); break;
    case 'dreads': cap(-7, -4); for (let x = -5; x <= 3; x += 2) rect(ctx, cx + x, cy - 9, 1, 3, c); break;
    case 'braids': cap(-7, -4); for (let x = -5; x <= 4; x += 2) rect(ctx, cx + x, cy - 7, 1, 3, shade(c, 1.3)); break;
    case 'mohawk': rect(ctx, cx - 2, cy - 12, 4, 7, c); rect(ctx, cx - 2, cy - 12, 4, 1, hi); for (let x = -6; x <= -3; x++) if (x % 2) px(ctx, cx + x, cy - 3, c); break;
    case 'bun': cap(-6, -4); break;
    case 'curly': cap(-8, -4); for (let x = -6; x <= 4; x++) if (x % 2 === 0) px(ctx, cx + x, cy - 9, c); rect(ctx, cx - 7, cy - 4, 2, 4, c); break;
    case 'waves': cap(-7, -4); for (let x = -5; x <= 3; x += 3) px(ctx, cx + x, cy - 6, hi), px(ctx, cx + x + 1, cy - 5, hi); break;
  }
}

function drawHead(ctx: Ctx, hx: number, hy: number, a: Appearance, backView = false) {
  const cx = Math.round(hx), cy = Math.round(hy);
  const [skin, skinSh] = SKIN_TONES[a.skin % SKIN_TONES.length];
  drawHairBack(ctx, cx, cy, a);
  for (const [y, x0, x1] of HEAD_ROWS) rect(ctx, cx + x0, cy + y, x1 - x0 + 1, 1, skin);
  if (backView) {
    // turned away: ears on both sides, hair over the back of the head, no face
    rect(ctx, cx - 6, cy - 1, 2, 3, skinSh); rect(ctx, cx + 5, cy - 1, 2, 3, skinSh);
    rect(ctx, cx - 5, cy + 4, 11, 2, skinSh);
    drawHairFront(ctx, cx, cy, a);
    if (a.hair !== 'bald') for (let y = -4; y <= 2; y++) rect(ctx, cx - 4, cy + y, 9, 1, shade(a.hairColor, y % 2 ? 1 : 0.9));
    if (a.headband) rect(ctx, cx - 5, cy - 4, 11, 2, a.headband);
    return;
  }
  rect(ctx, cx - 5, cy + 3, 3, 3, skinSh);                              // jaw shadow
  // ear
  rect(ctx, cx - 2 - (a.bigEars ? 1 : 0), cy - 1, a.bigEars ? 3 : 2, a.bigEars ? 4 : 3, skinSh);
  // eyes (3/4 view: front eye + far eye)
  const ey = cy - 1 + a.eyeY;
  px(ctx, cx + 3, ey, '#f4f4f4'); px(ctx, cx + 4, ey, a.eyeColor); px(ctx, cx + 4, ey - 1 + 1, a.eyeColor);
  px(ctx, cx + 0 - a.eyeGap, ey, a.eyeColor);
  // brows
  for (let r = 0; r < a.brow; r++) rect(ctx, cx + 2, ey - 2 - r, 4, 1, shade(a.hairColor, 0.9));
  px(ctx, cx - 1 - a.eyeGap, ey - 2, shade(a.hairColor, 0.9));
  // nose
  const ny = ey + 2;
  if (a.nose === 'small') { px(ctx, cx + 6, ny, skin); px(ctx, cx + 5, ny + 1, skinSh); }
  if (a.nose === 'wide') { px(ctx, cx + 6, ny, skin); px(ctx, cx + 6, ny + 1, skin); rect(ctx, cx + 4, ny + 1, 2, 1, skinSh); }
  if (a.nose === 'long') { px(ctx, cx + 6, ny - 1, skin); px(ctx, cx + 7, ny, skin); px(ctx, cx + 6, ny + 1, skinSh); }
  // mouth
  const my = cy + 4 + a.mouthY, lip = '#5a1f1f';
  if (a.mouth === 'neutral') rect(ctx, cx + 3, my, 3, 1, lip);
  if (a.mouth === 'smile') { px(ctx, cx + 2, my - 1, lip); rect(ctx, cx + 3, my, 3, 1, lip); px(ctx, cx + 6, my - 1, lip); }
  if (a.mouth === 'frown') { px(ctx, cx + 2, my + 1, lip); rect(ctx, cx + 3, my, 3, 1, lip); }
  if (a.mouth === 'open') { rect(ctx, cx + 4, my, 2, 2, '#2a0d0d'); px(ctx, cx + 4, my, '#f4f4f4'); }
  // facial hair
  const fh = a.hairColor;
  if (a.facial === 'stubble') for (let y = 3; y <= 7; y++) for (let x = -3; x <= 5; x++) if ((x + y) % 2 === 0 && y !== my - cy) px(ctx, cx + x, cy + y, shade(fh, 1.2));
  if (a.facial === 'mustache' || a.facial === 'goatee') rect(ctx, cx + 3, my - 1, 4, 1, fh);
  if (a.facial === 'goatee') rect(ctx, cx + 3, my + 2, 3, 2, fh);
  if (a.facial === 'beard') { for (let y = 2; y <= 7; y++) for (let x = -4; x <= 6; x++) if (y !== my - cy || x < 3) { const r = HEAD_ROWS.find((h) => h[0] === y); if (r && x >= r[1] && x <= r[2]) px(ctx, cx + x, cy + y, fh); } rect(ctx, cx + 3, my, 3, 1, lip); }
  drawHairFront(ctx, cx, cy, a);
  if (a.headband) { rect(ctx, cx - 5, cy - 4, 11, 2, a.headband); rect(ctx, cx - 5, cy - 4, 11, 1, shade(a.headband, 1.2)); }
  if (a.goggles) { rect(ctx, cx - 5, ey, 11, 1, '#222'); rect(ctx, cx + 2, ey - 1, 5, 3, '#222'); rect(ctx, cx + 3, ey, 3, 1, '#8fd3ff'); }
  if (a.mask) { const m = '#c9d3dc'; rect(ctx, cx + 1, ey - 2, 6, 1, m); rect(ctx, cx + 1, ey + 2, 6, 1, m); rect(ctx, cx + 6, ey - 2, 1, 5, m); rect(ctx, cx + 1, ey - 2, 1, 5, m); }
}

// ---------- figure ----------
/** Draw one pose. ox/oy = the frame's top-left in the sheet. Returns the ball offset (art px, origin-relative, +y up). */
export function drawPose(ctx: Ctx, ox: number, oy: number, pose: Pose, H: number, a: Appearance, kit: Kit): J | null {
  const u = H / 100;
  const T = (j: J): J => [ox + CX + j[0] * u, oy + FOOT_Y - j[1] * u];
  const p = Object.fromEntries(Object.entries(pose).map(([k, v]) => [k, Array.isArray(v) ? T(v as J) : v])) as unknown as Pose;
  const sleeveF = a.armSleeve !== 'none', sleeveB = a.armSleeve === 'both';
  drawArm(ctx, p.sB, p.eB, p.hB, a, kit, true, sleeveB, true);
  drawLeg(ctx, p.hip, p.kB, p.fB, a, kit, true, a.legSleeve === 'both', false);
  drawTorso(ctx, p.neck, p.hip, p.sF, p.sB, kit);
  drawLeg(ctx, p.hip, p.kF, p.fF, a, kit, false, a.legSleeve !== 'none', a.kneePad);
  const [skin] = SKIN_TONES[a.skin % SKIN_TONES.length];
  line(ctx, p.neck[0], p.neck[1], p.head[0] - 1, p.head[1] + 5, 4, skin);
  drawHead(ctx, p.head[0], p.head[1], a, !!pose.backView);
  drawArm(ctx, p.sF, p.eF, p.hF, a, kit, false, sleeveF, true);
  return pose.ball ? [pose.ball[0] * u, pose.ball[1] * u] : null;
}

/** Build a sheet with every clip sampled into frames. */
export function buildSheet(heightFt: number, a: Appearance, kit: Kit): Sheet {
  const H = figureHeight(heightFt);
  const total = CLIPS.reduce((n, c) => n + c.frames, 0);
  const rows = Math.ceil(total / COLS);
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W * COLS; canvas.height = FRAME_H * rows;
  const ctx = canvas.getContext('2d')!;
  const index: Sheet['index'] = {};
  const ball: (J | null)[] = [];
  let i = 0;
  for (const c of CLIPS) {
    index[c.name] = { start: i, count: c.frames };
    for (let f = 0; f < c.frames; f++, i++) {
      const pose = sampleClip(c, frameTime(c, f));
      ball.push(drawPose(ctx, (i % COLS) * FRAME_W, Math.floor(i / COLS) * FRAME_H, pose, H, a, kit));
    }
  }
  return { canvas, index, ball, total };
}

export const frameRect = (i: number) => ({ x: (i % COLS) * FRAME_W, y: Math.floor(i / COLS) * FRAME_H });
export type { Clip };
