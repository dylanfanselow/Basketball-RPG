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
  else {
    // shorts: a fitted tube around each thigh, slightly tapered, with a trim hem
    part(ctx, hip, knee, 0, 0.3, 8, dim(kit.shorts));
    part(ctx, hip, knee, 0.28, 0.55, 7, dim(kit.shorts));
    const hx = hip[0] + (knee[0] - hip[0]) * 0.55, hy = hip[1] + (knee[1] - hip[1]) * 0.55;
    rect(ctx, Math.round(hx) - 3, Math.round(hy) + 2, 7, 1, dim(kit.trim)); // thin hem line
  }
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

/**
 * Torso as a shaped silhouette: rounded shoulder caps, a fuller chest at the front, lats at the
 * back, a taper to the waist and a slight hem flare. Shading on the back edge and arm-hole give it volume.
 */
function drawTorso(ctx: Ctx, neck: J, hip: J, sF: J, sB: J, kit: Kit) {
  const top: J = [(sF[0] + sB[0]) / 2, Math.min(sF[1], sB[1]) - 1];
  const len = Math.max(1, Math.abs(hip[1] - top[1]));
  // half-widths [front, back] along the torso (t = 0 shoulders .. 1 hips)
  const prof = (t: number): [number, number] => {
    if (t < 0.06) return [4.5, 4.5];                       // shoulder cap (rounded)
    if (t < 0.14) return [6, 6];
    if (t < 0.4) return [7, 6.5];                          // chest / lats
    if (t < 0.85) return [7 - (t - 0.4) * 4.5, 6.5 - (t - 0.4) * 3.3]; // taper to the waist
    return [5.4, 5.3];                                     // hem flare
  };
  const hi = shade(kit.jersey, 1.12);
  for (let i = 0; i <= len; i++) {
    const t = i / len;
    const cx = top[0] + (hip[0] - top[0]) * t;
    const cy = Math.round(top[1] + (hip[1] - top[1]) * t);
    const [wf, wb] = prof(t);
    const x0 = Math.round(cx - wb), x1 = Math.round(cx + wf);
    rect(ctx, x0, cy, x1 - x0 + 1, 1, kit.jersey);
    rect(ctx, x0, cy, t < 0.12 ? 1 : 2, 1, kit.jerseyShade);                     // back-edge shadow
    if (t > 0.1 && t < 0.42) px(ctx, x1, cy, hi);                                  // chest highlight
    if (t > 0.08 && t < 0.3) px(ctx, Math.round(cx - 1), cy, kit.jerseyShade);    // arm-hole shading
  }
  rect(ctx, top[0] - 2, top[1], 5, 1, kit.trim);                                   // collar
  // waistband only; the shorts themselves wrap each leg (drawLeg)
  rect(ctx, hip[0] - 5, hip[1] - 1, 11, 4, kit.shorts);
  rect(ctx, hip[0] - 5, hip[1] - 1, 11, 1, kit.trim);
  if (kit.number >= 0) digits(ctx, top[0] + (hip[0] - top[0]) * 0.4 + 1, top[1] + (hip[1] - top[1]) * 0.25, kit.number, kit.trim);
  else { rect(ctx, top[0] - 1, top[1], 3, Math.round((hip[1] - top[1]) * 0.6), '#f4f4f4'); px(ctx, top[0], top[1] + 2, kit.trim); } // shirt + tie
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

// ---------- front view (bench players facing the court) ----------
export const FRONT_W = 32, FRONT_H = 80;

/** Two frames, facing the camera: 0 = seated, 1 = standing and cheering. */
export function buildFrontSheet(heightFt: number, a: Appearance, kit: Kit): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = FRONT_W * 2; c.height = FRONT_H;
  const ctx = c.getContext('2d')!;
  const s = figureHeight(heightFt) / 66; // scale relative to a 6'6" player
  drawFront(ctx, 0, a, kit, false, s);
  drawFront(ctx, FRONT_W, a, kit, true, s);
  return c;
}

function drawFront(ctx: Ctx, ox: number, a: Appearance, kit: Kit, standing: boolean, s: number) {
  const [skin, skinSh] = SKIN_TONES[a.skin % SKIN_TONES.length];
  const cx = ox + 16, floor = FRONT_H - 3;
  const L = (n: number) => Math.round(n * s);
  // legs
  const shinTop = standing ? floor - L(26) : floor - L(17);
  for (const lx of [cx - 5, cx + 2]) {
    rect(ctx, lx, shinTop, 3, floor - 3 - shinTop, skin);
    const sockH = a.socks === 'high' ? L(11) : a.socks === 'crew' ? L(6) : 2;
    rect(ctx, lx, floor - 3 - sockH, 3, sockH, a.sockColor);
    if (a.legSleeve === 'both' || (a.legSleeve === 'one' && lx > cx)) rect(ctx, lx, shinTop, 3, L(8), a.legSleeveColor);
    rect(ctx, lx - 1, floor - 3, 5, 3, a.shoe); rect(ctx, lx, floor - 2, 3, 1, a.shoeAccent);
  }
  // thighs / shorts: seated thighs point at the camera (short block); standing they hang down
  const hipY = standing ? shinTop - L(16) : shinTop - L(5);
  rect(ctx, cx - 7, hipY, 15, shinTop - hipY + (standing ? 0 : 1), kit.shorts);
  rect(ctx, cx, hipY + 2, 1, shinTop - hipY - 1, shade(kit.shorts, 0.75));                  // leg split
  rect(ctx, cx - 7, shinTop - 1, 6, 1, kit.trim); rect(ctx, cx + 2, shinTop - 1, 6, 1, kit.trim);
  if (!standing) { rect(ctx, cx - 6, shinTop - 2, 4, 3, skin); rect(ctx, cx + 3, shinTop - 2, 4, 3, skin); } // knees
  // torso
  const shY = hipY - L(19);
  for (let y = shY; y <= hipY; y++) {
    const t = (y - shY) / Math.max(1, hipY - shY);
    const w = t < 0.08 ? 11 : t < 0.4 ? 15 : 15 - (t - 0.4) * 5;
    rect(ctx, Math.round(cx - w / 2), y, Math.round(w), 1, kit.jersey);
  }
  rect(ctx, cx - 7, shY + 3, 1, hipY - shY - 4, kit.jerseyShade); rect(ctx, cx + 7, shY + 3, 1, hipY - shY - 4, kit.jerseyShade);
  rect(ctx, cx - 2, shY, 5, 2, skin); rect(ctx, cx - 3, shY, 1, 3, kit.trim); rect(ctx, cx + 3, shY, 1, 3, kit.trim); // v-neck
  if (kit.number >= 0) digits(ctx, cx + 0.5, shY + 5, kit.number, kit.trim);
  // arms: resting on the knees, or raised when cheering
  for (const side of [-1, 1]) {
    const axO = cx + side * 8;
    const sleeve = a.armSleeve === 'both' || (a.armSleeve === 'shooting' && side === 1);
    if (standing) {
      line(ctx, axO, shY + 2, axO + side * 3, shY - L(14), 3, skin);
      if (sleeve) line(ctx, axO, shY + 2, axO + side * 2, shY - L(8), 3, a.sleeveColor);
      rect(ctx, axO + side * 3 - 1, shY - L(14) - 3, 4, 4, skin);
    } else {
      line(ctx, axO, shY + 2, axO + side * 1, hipY + 1, 3, skin);
      if (sleeve) line(ctx, axO, shY + 2, axO + side * 1, hipY - 2, 3, a.sleeveColor);
      if (a.wristband) rect(ctx, axO + side - 1, hipY - 2, 3, 2, a.wristband);
      rect(ctx, axO + side * 1 - 1, hipY + 1, 3, 3, skin);
    }
  }
  // neck + head
  const hy = shY - 8;
  rect(ctx, cx - 2, shY - 3, 5, 4, skinSh);
  for (let y = -6; y <= 6; y++) { const w = y < -4 || y > 4 ? 7 : 11; rect(ctx, cx - Math.floor(w / 2), hy + y, w, 1, skin); }
  rect(ctx, cx - 6, hy - 1, 1, 3, skinSh); rect(ctx, cx + 6, hy - 1, 1, 3, skinSh);                    // ears
  const ey = hy - 1 + a.eyeY;
  for (const ex of [cx - 3, cx + 2]) { px(ctx, ex, ey, '#f4f4f4'); px(ctx, ex + 1, ey, a.eyeColor); }
  for (let r = 0; r < a.brow; r++) { rect(ctx, cx - 4, ey - 2 - r, 3, 1, shade(a.hairColor, 0.9)); rect(ctx, cx + 2, ey - 2 - r, 3, 1, shade(a.hairColor, 0.9)); }
  px(ctx, cx, ey + 2, skinSh); if (a.nose === 'wide') { px(ctx, cx - 1, ey + 2, skinSh); px(ctx, cx + 1, ey + 2, skinSh); }
  const my = hy + 4 + a.mouthY, lip = '#5a1f1f';
  if (a.mouth === 'open' || standing) rect(ctx, cx - 1, my, 3, 2, '#2a0d0d'); else rect(ctx, cx - 1, my, 3, 1, lip);
  if (a.mouth === 'smile' && !standing) { px(ctx, cx - 2, my - 1, lip); px(ctx, cx + 2, my - 1, lip); }
  if (a.facial === 'beard') { rect(ctx, cx - 5, hy + 2, 2, 4, a.hairColor); rect(ctx, cx + 4, hy + 2, 2, 4, a.hairColor); rect(ctx, cx - 3, hy + 6, 7, 1, a.hairColor); }
  if (a.facial === 'goatee' || a.facial === 'beard' || a.facial === 'mustache') rect(ctx, cx - 2, my - 1, 5, 1, a.hairColor);
  if (a.facial === 'goatee') rect(ctx, cx - 1, my + 2, 3, 2, a.hairColor);
  // hair from the front
  const hc = a.hairColor;
  switch (a.hair) {
    case 'bald': break;
    case 'afro': rect(ctx, cx - 8, hy - 11, 17, 8, hc); rect(ctx, cx - 7, hy - 3, 2, 4, hc); rect(ctx, cx + 6, hy - 3, 2, 4, hc); break;
    case 'hightop': rect(ctx, cx - 5, hy - 13, 11, 8, hc); break;
    case 'mohawk': rect(ctx, cx - 1, hy - 11, 3, 6, hc); break;
    case 'bun': rect(ctx, cx - 5, hy - 7, 11, 2, hc); rect(ctx, cx - 2, hy - 10, 5, 3, hc); break;
    case 'dreads': case 'braids':
      rect(ctx, cx - 5, hy - 8, 11, 3, hc);
      for (const x of [-6, -5, 5, 6]) rect(ctx, cx + x, hy - 5, 1, a.hair === 'dreads' ? 12 : 9, hc);
      break;
    case 'twists': case 'curly': rect(ctx, cx - 5, hy - 9, 11, 4, hc); for (let x = -5; x <= 5; x += 2) px(ctx, cx + x, hy - 10, hc); break;
    default: rect(ctx, cx - 5, hy - 7, 11, 2 + (a.hair === 'fade' || a.hair === 'waves' ? 1 : 0), hc);
  }
  if (a.headband) rect(ctx, cx - 5, hy - 4, 11, 2, a.headband);
  if (a.goggles) { rect(ctx, cx - 6, ey, 13, 1, '#222'); rect(ctx, cx - 4, ey - 1, 4, 3, '#222'); rect(ctx, cx + 1, ey - 1, 4, 3, '#222'); px(ctx, cx - 3, ey, '#8fd3ff'); px(ctx, cx + 2, ey, '#8fd3ff'); }
}
