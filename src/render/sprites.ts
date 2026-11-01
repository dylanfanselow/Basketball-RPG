/**
 * Procedural players in a shaded, "digitized" arcade style (think 90s 2D arcade basketball):
 * every limb is a tapered tube with muscle bulges and cylinder shading (lit from the front-top),
 * the jersey/shorts have 3-tone fabric shading and trim, and the head is a big shaded skull with a real face.
 * Shapes are drawn with canvas paths/gradients (fast), then a crisp pass snaps the alpha to pixels and darkens
 * the silhouette edge, so it still reads as pixel art when scaled with nearest-neighbour.
 *
 * Sprites are drawn at ART x detail and shown at PIXEL / ART scale; the game camera runs at 1.5x, so each art
 * pixel ends up PIXEL device pixels: same size on screen as before, 1.5x the detail.
 */
import { CLIPS, Clip, Pose, J, sampleClip, frameTime, rigArms, dropToward, TORSO_DROP } from './anim';
import { Appearance, SKIN_TONES } from './appearance';
import { view, toRad, SHOULDER_HALF, HIP_HALF, projX } from './pose3d';

export const ART = 1.5;
export const FRAME_W = 96;
export const FRAME_H = 168;
export const CX = 48;        // horizontal center of the figure in a frame
export const FOOT_Y = 159;   // floor line in a frame
export const PIXEL = 2;      // device pixels per art pixel (with the 1.5x camera)
/** Sprite scale in world units (the camera zoom supplies the rest). */
export const SPRITE_SCALE = PIXEL / ART;
export const COLS = 20;

/** number < 0 hides the number; pants = full-length trousers (coaches) */
export interface Kit { jersey: string; jerseyShade: string; trim: string; shorts: string; number: number; pants?: boolean }
export interface Sheet { canvas: HTMLCanvasElement; index: Record<string, { start: number; count: number }>; ball: (J | null)[]; total: number }

/** Art-pixel figure height for a player height in feet (6'6" -> ~99 art px). */
export const figureHeight = (heightFt: number) => Math.round(heightFt * 10.2 * ART);

/** A drawing canvas: a DOM canvas on the page, an OffscreenCanvas inside the sheet workers. */
function makeCanvas(w: number, h: number): HTMLCanvasElement {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h) as unknown as HTMLCanvasElement;
}

// ---------- color ----------
const rgb = (hex: string): [number, number, number] => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const hex = (r: number, g: number, b: number) => '#' + ((1 << 24) | (cl(r) << 16) | (cl(g) << 8) | cl(b)).toString(16).slice(1);
const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
export function shade(h: string, f: number): string { const [r, g, b] = rgb(h); return hex(r * f, g * f, b * f); }
/** Lighten toward white (keeps saturation better than multiplying). */
export function tint(h: string, f: number): string { const [r, g, b] = rgb(h); return hex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f); }
export function mix(a: string, b: string, t: number): string { const A = rgb(a), B = rgb(b); return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }

/** 4-tone ramp: highlight, base, shade, deep shade. far = the limb on the far side of the body (darker). */
interface Ramp { hi: string; base: string; sh: string; deep: string }
function ramp(base: string, far = false): Ramp {
  const b = far ? shade(base, 0.8) : base;
  const lum = rgb(b).reduce((s, v) => s + v, 0) / 765;
  return { hi: lum > 0.85 ? '#ffffff' : tint(b, 0.28), base: b, sh: shade(b, 0.74), deep: shade(b, 0.52) };
}
const skinRamp = (a: Appearance, far = false): Ramp => {
  const [base] = SKIN_TONES[a.skin % SKIN_TONES.length];
  const r = ramp(base, far);
  return { ...r, hi: mix(r.base, '#fff3e0', 0.32) }; // warm sheen on skin
};

// ---------- geometry ----------
type Ctx = CanvasRenderingContext2D;
/** Light comes from the front (+x, the way the player faces) and above. */
const LIGHT: J = [0.6, -0.8];
const sub2 = (a: J, b: J): J => [a[0] - b[0], a[1] - b[1]];
const len2 = (a: J) => Math.hypot(a[0], a[1]) || 1;
const lerp2 = (a: J, b: J, t: number): J => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Linear gradient across a shape, lit side -> dark side, given its center, the lit-side normal and a radius. */
function shadeGrad(ctx: Ctx, c: J, n: J, r: number, R: Ramp, spread = 1): CanvasGradient {
  const g = ctx.createLinearGradient(c[0] + n[0] * r * spread, c[1] + n[1] * r * spread, c[0] - n[0] * r * spread, c[1] - n[1] * r * spread);
  g.addColorStop(0, R.hi); g.addColorStop(0.3, R.base); g.addColorStop(0.72, R.sh); g.addColorStop(1, R.deep);
  return g;
}

/**
 * A tapered tube from a to b. radius(t) for t in 0..1 (muscle bulges go in here). Rounded ends.
 * Filled with cylinder shading across its width.
 */
function tube(ctx: Ctx, a: J, b: J, radius: (t: number) => number, R: Ramp, from = 0, to = 1, capA = true, capB = true): { endL: J; endR: J } {
  const d = sub2(b, a), L = len2(d);
  const u: J = [d[0] / L, d[1] / L];
  let n: J = [-u[1], u[0]];
  if (n[0] * LIGHT[0] + n[1] * LIGHT[1] < 0) n = [-n[0], -n[1]];
  const N = 8;
  const left: J[] = [], right: J[] = [];
  let rMax = 0;
  for (let i = 0; i <= N; i++) {
    const t = from + (to - from) * (i / N);
    const p = lerp2(a, b, t), r = radius(t);
    rMax = Math.max(rMax, r);
    left.push([p[0] + n[0] * r, p[1] + n[1] * r]); right.push([p[0] - n[0] * r, p[1] - n[1] * r]);
  }
  const pa = lerp2(a, b, from), pb = lerp2(a, b, to);
  const mid = lerp2(pa, pb, 0.5);
  ctx.fillStyle = shadeGrad(ctx, mid, n, rMax, R);
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (const p of left) ctx.lineTo(p[0], p[1]);
  // round end caps sweep around the far side (the side away from n: cross(u, n) sign picks the direction)
  const ccw = u[0] * n[1] - u[1] * n[0] > 0;
  if (capB) ctx.arc(pb[0], pb[1], radius(to), Math.atan2(n[1], n[0]), Math.atan2(-n[1], -n[0]), ccw);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  if (capA) ctx.arc(pa[0], pa[1], radius(from), Math.atan2(-n[1], -n[0]), Math.atan2(n[1], n[0]), ccw);
  ctx.closePath();
  ctx.fill();
  return { endL: left[N], endR: right[N] };
}
/** Smooth bump for muscle bellies: peaks at c, width w. */
const bump = (t: number, c: number, w: number) => Math.max(0, 1 - ((t - c) / w) ** 2);

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, rot = 0) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), rot, 0, Math.PI * 2); ctx.fill();
}
function poly(ctx: Ctx, pts: J[], fill: string | CanvasGradient) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath(); ctx.fill();
}
function stroke(ctx: Ctx, pts: J[], w: number, c: string, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke(); ctx.restore();
}
function px(ctx: Ctx, x: number, y: number, c: string, w = 1, h = 1) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }

const DIG: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '011', '001', '111'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'], '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111'],
};
/** Jersey number with a 1px outline (shadow color) so it reads on any jersey. */
function digits(ctx: Ctx, x: number, y: number, n: number, c: string, outline: string) {
  const s = String(Math.abs(n) % 100);
  const ox0 = Math.round(x - (s.length * 4 - 1) / 2), oy = Math.round(y);
  for (const pass of [0, 1]) {
    let ox = ox0;
    for (const ch of s) {
      const g = DIG[ch];
      for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) if (g[r][k] === '1') {
        if (pass === 0) { px(ctx, ox + k - 1, oy + r, outline, 3, 1); px(ctx, ox + k, oy + r - 1, outline, 1, 3); }
        else px(ctx, ox + k, oy + r, c);
      }
      ox += 4;
    }
  }
}

// ---------- body ----------
/** front: draw a front-facing shoe toed out to that side (open stance) instead of the profile shoe. */
function drawLeg(ctx: Ctx, hip: J, knee: J, foot: J, a: Appearance, kit: Kit, far: boolean, sleeve: boolean, pad: boolean, k: number, front?: 1 | -1) {
  const S = skinRamp(a, far);
  const ankle: J = [foot[0] - 1 * k, foot[1] - 3.2 * k];
  // thigh: quad belly up top, narrowing into the knee
  tube(ctx, hip, knee, (t) => (5.4 - 1.7 * t + 0.8 * bump(t, 0.35, 0.4)) * k, S);
  // shin: calf belly behind the upper third, slim ankle
  tube(ctx, knee, ankle, (t) => (3.9 - 1.7 * t + 1.0 * bump(t, 0.3, 0.35)) * k, S);
  ellipse(ctx, knee[0] + 0.8 * k, knee[1], 1.2 * k, 1.6 * k, S.hi); // kneecap highlight
  if (kit.pants) {
    const P = ramp(kit.shorts, far);
    tube(ctx, hip, knee, (t) => (5.2 - 1.2 * t) * k, P);
    tube(ctx, knee, ankle, () => 3.7 * k, P, 0, 1);
  } else {
    // shorts: a fitted tube around the thigh with a trim hem
    const P = ramp(kit.shorts, far);
    // shorts: a loose tube around the thigh down to just above the knee, flat hem with a trim stripe
    const hem = tube(ctx, hip, knee, (t) => (6.7 - 0.9 * t) * k, P, 0, 0.76, true, false);
    stroke(ctx, [hem.endL, hem.endR], 1.6 * k, ramp(kit.trim, far).base);
    stroke(ctx, [lerp2(hip, knee, 0.15), lerp2(hip, knee, 0.6)], 1, P.sh, 0.55); // fabric crease
  }
  if (sleeve) { const L = ramp(a.legSleeveColor, far); tube(ctx, hip, knee, (t) => (4.3 - 0.7 * t) * k, L, 0.74, 1, false); tube(ctx, knee, ankle, (t) => (4 - 1.5 * t + 0.9 * bump(t, 0.3, 0.35)) * k, L, 0, 0.75, true, false); }
  if (pad) { const D = ramp('#24272f', far); tube(ctx, hip, knee, () => 4.4 * k, D, 0.84, 1, false); tube(ctx, knee, ankle, () => 4.1 * k, D, 0, 0.16, true, false); }
  if (!kit.pants) {
    const from = a.socks === 'high' ? 0.4 : a.socks === 'crew' ? 0.7 : 0.9;
    tube(ctx, knee, ankle, (t) => (3.9 - 1.7 * t + 1.0 * bump(t, 0.3, 0.35)) * k + 0.3, ramp(a.sockColor, far), from, 1, false);
  }
  const Sh = ramp(a.shoe, far);
  if (front) {
    // front-facing high-top, toed slightly out: upper with laces, rounded toe, white sole, accent swoosh
    const fx = foot[0] + front * 0.8 * k, fy = foot[1];
    const g = ctx.createLinearGradient(fx - 4 * k, fy - 6 * k, fx + 4 * k, fy);
    g.addColorStop(0, Sh.hi); g.addColorStop(0.55, Sh.base); g.addColorStop(1, Sh.sh);
    poly(ctx, [[fx - 3.4 * k, fy - 6.4 * k], [fx + 3.4 * k, fy - 6.4 * k], [fx + 4.4 * k + front * 0.8 * k, fy - 1 * k], [fx - 4.4 * k + front * 0.8 * k, fy - 1 * k]], g);
    poly(ctx, [[fx - 4.8 * k + front * 0.8 * k, fy - 1.4 * k], [fx + 4.8 * k + front * 0.8 * k, fy - 1.4 * k], [fx + 4.6 * k + front * 0.8 * k, fy + 0.4], [fx - 4.6 * k + front * 0.8 * k, fy + 0.4]], far ? '#c9c9c9' : '#f2f2f2');
    stroke(ctx, [[fx - 1.2 * k, fy - 5.8 * k], [fx - 1.2 * k, fy - 2.6 * k]], 1, Sh.deep, 0.7);
    stroke(ctx, [[fx + 1.2 * k, fy - 5.8 * k], [fx + 1.2 * k, fy - 2.6 * k]], 1, Sh.deep, 0.7);
    stroke(ctx, [[fx + front * 1.6 * k, fy - 4.4 * k], [fx + front * 4 * k, fy - 2.2 * k]], 1.2 * k, shade(a.shoeAccent, far ? 0.8 : 1));
    return;
  }
  // high-top shoe pointing forward (+x): upper, toe box, sole, accent stripe, laces
  const fx = foot[0], fy = foot[1];
  const g = ctx.createLinearGradient(fx, fy - 6 * k, fx, fy);
  g.addColorStop(0, Sh.hi); g.addColorStop(0.5, Sh.base); g.addColorStop(1, Sh.sh);
  poly(ctx, [[fx - 4 * k, fy - 6 * k], [fx + 0.5 * k, fy - 6.2 * k], [fx + 2 * k, fy - 3.6 * k], [fx + 5.6 * k, fy - 2.6 * k], [fx + 6 * k, fy - 0.6 * k], [fx - 4.4 * k, fy - 0.6 * k]], g);
  poly(ctx, [[fx - 4.6 * k, fy - 1.3 * k], [fx + 6.2 * k, fy - 1.3 * k], [fx + 6 * k, fy + 0.4], [fx - 4.6 * k, fy + 0.4]], far ? '#c9c9c9' : '#f2f2f2');
  stroke(ctx, [[fx - 3 * k, fy - 2.6 * k], [fx + 3.6 * k, fy - 2.2 * k]], 1.2 * k, shade(a.shoeAccent, far ? 0.8 : 1));
  stroke(ctx, [[fx - 0.5 * k, fy - 5.4 * k], [fx + 1.6 * k, fy - 3.4 * k]], 1, Sh.deep, 0.7);
}

function drawArm(ctx: Ctx, sh: J, el: J, hand: J, a: Appearance, kit: Kit, far: boolean, sleeve: boolean, k: number) {
  const S = skinRamp(a, far);
  // upper arm: deltoid cap + biceps belly; forearm: thick near the elbow, tapering to the wrist
  tube(ctx, sh, el, (t) => (3.8 - 1.0 * t + 0.7 * bump(t, 0.45, 0.35) + 0.6 * bump(t, 0.02, 0.15)) * k, S);
  const wrist = lerp2(el, hand, 0.82);
  tube(ctx, el, wrist, (t) => (3.3 - 1.2 * t + 0.45 * bump(t, 0.25, 0.3)) * k, S);
  if (sleeve) { const L = ramp(a.sleeveColor, far); tube(ctx, sh, el, (t) => (3.9 - 0.8 * t + 0.6 * bump(t, 0.45, 0.35)) * k, L, 0.12, 1, false); tube(ctx, el, wrist, (t) => (3.4 - 1.1 * t) * k, L, 0, 0.85, true, false); }
  if (a.wristband) tube(ctx, el, wrist, () => 2.5 * k, ramp(a.wristband, far), 0.72, 0.98, false, false);
  // hand
  const hd = sub2(hand, el), hl = len2(hd);
  ellipse(ctx, hand[0], hand[1], 2.5 * k, 2.1 * k, shadeGrad(ctx, hand, [LIGHT[0], LIGHT[1]], 2.5 * k, S), Math.atan2(hd[1], hd[0]));
  px(ctx, hand[0] + (hd[0] / hl) * 1.5 * k, hand[1] + (hd[1] / hl) * 1.5 * k, S.sh);
  // jersey strap over the shoulder
  const J0 = ramp(kit.jersey, far);
  if (!kit.pants) tube(ctx, sh, el, () => 3.9 * k, J0, 0, 0.12, true, false);
  else tube(ctx, sh, el, (t) => (3.6 - 0.6 * t) * k, J0, 0, 1), tube(ctx, el, wrist, (t) => (3.1 - 0.5 * t) * k, J0, 0, 0.9); // suit sleeves
}

/**
 * Torso: shoulder caps, full chest at the front, lats at the back, taper to the waist, slight hem flare.
 * Fabric shading front-lit, armhole trim, side panel, collar and number.
 */
function drawTorso(ctx: Ctx, neck: J, hip: J, sF: J, sB: J, kit: Kit, a: Appearance, k: number) {
  const top: J = [(sF[0] + sB[0]) / 2, Math.min(sF[1], sB[1]) - 1.5 * k];
  const L = hip[1] - top[1];
  const prof = (t: number): [number, number] => { // [front, back] half-widths
    if (t < 0.06) return [7.4, 7.4];
    if (t < 0.14) return [9.8, 9.6];
    if (t < 0.4) return [11.4, 10.4];
    if (t < 0.86) return [11.4 - (t - 0.4) * 7, 10.4 - (t - 0.4) * 5];
    return [8.4, 8.1];
  };
  const N = 16, front: J[] = [], back: J[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, [wf, wb] = prof(t);
    const cx = top[0] + (hip[0] - top[0]) * t, cy = top[1] + L * t;
    front.push([cx + wf * k, cy]); back.push([cx - wb * k, cy]);
  }
  const J0 = ramp(kit.jersey);
  const mid = lerp2(top, hip, 0.35);
  const grad = ctx.createLinearGradient(mid[0] + 10 * k, mid[1] - 6 * k, mid[0] - 10 * k, mid[1] + 6 * k);
  grad.addColorStop(0, J0.hi); grad.addColorStop(0.35, J0.base); grad.addColorStop(0.75, J0.sh); grad.addColorStop(1, J0.deep);
  poly(ctx, [...front, ...back.reverse()], grad);
  const T = ramp(kit.trim);
  if (!kit.pants) {
    // side panel down the back edge, armhole trim, folds at the waist
    stroke(ctx, back.slice(3, 15).map((p) => [p[0] + 1.2 * k, p[1]] as J), 1.6 * k, T.sh, 0.9);
    stroke(ctx, [[top[0] - 2 * k, top[1] + 1 * k], [top[0] - 4.5 * k, top[1] + 6 * k], [top[0] - 1.5 * k, top[1] + 10 * k]], 1.2, T.base);
    stroke(ctx, [lerp2(top, hip, 0.62).map((v, i) => v + (i === 0 ? 4 * k : 0)) as J, lerp2(top, hip, 0.82).map((v, i) => v + (i === 0 ? 1 * k : 0)) as J], 1, J0.deep, 0.45);
    stroke(ctx, [lerp2(top, hip, 0.55).map((v, i) => v + (i === 0 ? -3 * k : 0)) as J, lerp2(top, hip, 0.78).map((v, i) => v + (i === 0 ? -5 * k : 0)) as J], 1, J0.deep, 0.35);
    // v-neck collar
    const S = skinRamp(a);
    poly(ctx, [[top[0] + 0.5 * k, top[1]], [top[0] + 5 * k, top[1]], [top[0] + 3.6 * k, top[1] + 4.5 * k]], S.base);
    stroke(ctx, [[top[0] + 0.3 * k, top[1]], [top[0] + 3.6 * k, top[1] + 4.6 * k], [top[0] + 5.2 * k, top[1]]], 1.4, T.base);
    // waistband
    const wb = lerp2(top, hip, 0.97);
    const P = ramp(kit.shorts);
    poly(ctx, [[wb[0] - 7.6 * k, wb[1]], [wb[0] + 7.8 * k, wb[1]], [wb[0] + 7.6 * k, wb[1] + 4 * k], [wb[0] - 7.4 * k, wb[1] + 4 * k]], P.base);
    stroke(ctx, [[wb[0] - 7.6 * k, wb[1] + 0.5], [wb[0] + 7.8 * k, wb[1] + 0.5]], 1.2, T.base);
    if (kit.number >= 0) digits(ctx, top[0] + (hip[0] - top[0]) * 0.4 + 2 * k, top[1] + L * 0.26, kit.number, T.base, J0.deep);
  } else {
    // suit jacket: lapels, shirt and tie
    poly(ctx, [[top[0] - 1 * k, top[1]], [top[0] + 4 * k, top[1]], [top[0] + 2.6 * k, top[1] + L * 0.55]], '#f2f2f2');
    stroke(ctx, [[top[0] + 1.6 * k, top[1] + 1], [top[0] + 2 * k, top[1] + L * 0.5]], 1.6 * k, kit.trim);
    stroke(ctx, [[top[0] - 1.5 * k, top[1]], [top[0] + 2 * k, top[1] + L * 0.6]], 1, J0.deep, 0.8);
  }
}

// ---------- head ----------
function drawHead(ctx: Ctx, hx: number, hy: number, a: Appearance, k: number, backView = false) {
  const S = skinRamp(a);
  const rx = 9 * k, ry = 10.2 * k;
  const cx = hx, cy = hy;
  const hair = a.hairColor, H = ramp(hair);
  hairBack(ctx, cx, cy, rx, ry, a, H, k);
  // skull: radial light from the front-top
  const rg = ctx.createRadialGradient(cx + rx * 0.35, cy - ry * 0.35, 1, cx, cy, rx * 1.35);
  rg.addColorStop(0, S.hi); rg.addColorStop(0.4, S.base); rg.addColorStop(0.8, S.sh); rg.addColorStop(1, S.deep);
  ellipse(ctx, cx, cy, rx, ry, rg);
  if (backView) {
    ellipse(ctx, cx - rx * 0.95, cy + ry * 0.05, 1.8 * k, 2.8 * k, S.sh); ellipse(ctx, cx + rx * 0.95, cy + ry * 0.05, 1.8 * k, 2.8 * k, S.sh);
    hairFront(ctx, cx, cy, rx, ry, a, H, k, true);
    if (a.headband) stroke(ctx, [[cx - rx, cy - ry * 0.4], [cx + rx, cy - ry * 0.4]], 2.6 * k, a.headband);
    return;
  }
  // jaw + chin (front-bottom), shadow under the jaw line
  poly(ctx, [[cx - rx * 0.55, cy + ry * 0.45], [cx + rx * 0.05, cy + ry * 1.02], [cx + rx * 0.75, cy + ry * 0.95], [cx + rx * 1.02, cy + ry * 0.45], [cx + rx * 0.6, cy + ry * 0.1]], S.base);
  stroke(ctx, [[cx - rx * 0.5, cy + ry * 0.55], [cx + rx * 0.05, cy + ry * 1.0], [cx + rx * 0.7, cy + ry * 0.98]], 1.2, S.deep, 0.7);
  // ear
  const big = a.bigEars ? 1.25 : 1;
  ellipse(ctx, cx - rx * 0.18, cy + ry * 0.12, 2 * k * big, 2.9 * k * big, S.sh);
  ellipse(ctx, cx - rx * 0.12, cy + ry * 0.14, 0.9 * k * big, 1.6 * k * big, S.deep);
  // brow ridge + eye socket shadow, cheekbone highlight
  const ey = cy - ry * 0.08 + a.eyeY * k;
  ellipse(ctx, cx + rx * 0.55, ey + 0.4 * k, 2.6 * k, 1.6 * k, S.sh);
  ellipse(ctx, cx + rx * 0.62, ey + 3.2 * k, 2.2 * k, 1.1 * k, S.hi);
  // eyes (3/4 view): near eye white + iris + catchlight, far eye smaller near the profile edge
  const ex = cx + rx * 0.58;
  px(ctx, ex - 1, ey, '#f2efe8', 3, 2); px(ctx, ex + 1, ey, a.eyeColor, 1, 2); px(ctx, ex, ey, '#1a1010', 1, 1);
  px(ctx, cx + rx * 0.92 - a.eyeGap, ey, '#e8e4dc', 1, 2); px(ctx, cx + rx * 0.92 - a.eyeGap + 1, ey, a.eyeColor, 1, 2);
  // brows
  const bc = shade(hair, 0.85);
  for (let r = 0; r < a.brow; r++) stroke(ctx, [[ex - 2 * k, ey - 2.2 * k - r], [ex + 3 * k, ey - 2.6 * k - r]], 1.2, bc);
  // nose: bridge, tip past the profile, nostril
  const ny = ey + 3 * k;
  const nl = a.nose === 'long' ? 2.8 : a.nose === 'wide' ? 2.2 : 1.8;
  poly(ctx, [[cx + rx * 0.8, ey], [cx + rx + nl * k, ny + 0.6 * k], [cx + rx + 0.4 * k, ny + 1.8 * k], [cx + rx * 0.72, ny + 1.6 * k]], S.base);
  stroke(ctx, [[cx + rx * 0.84, ey + 0.4 * k], [cx + rx + nl * k - 0.6, ny + 0.4 * k]], 1, S.hi, 0.8);
  px(ctx, cx + rx * 0.82, ny + 1.4 * k, S.deep, a.nose === 'wide' ? 3 : 2, 1);
  // mouth: upper lip line, lower lip
  const my = cy + ry * 0.58 + a.mouthY * k, mx = cx + rx * 0.62;
  const lip = mix(S.sh, '#7a2a2a', 0.45), lipLo = mix(S.base, '#a04848', 0.35);
  if (a.mouth === 'open') { ellipse(ctx, mx + 1, my + 0.6 * k, 2.2 * k, 1.5 * k, '#2a0d0d'); px(ctx, mx, my - 0.2 * k, '#f4f4f4', 3, 1); }
  else {
    const curve = a.mouth === 'smile' ? -1 : a.mouth === 'frown' ? 1 : 0;
    stroke(ctx, [[mx - 2.2 * k, my + curve * 0.8], [mx, my], [mx + 2.2 * k, my + curve * 0.6]], 1.1, lip);
    stroke(ctx, [[mx - 1.4 * k, my + 1.3 * k], [mx + 1.6 * k, my + 1.3 * k]], 1.2, lipLo, 0.9);
  }
  // facial hair
  if (a.facial === 'stubble') { ctx.save(); ctx.globalAlpha = 0.35; poly(ctx, [[cx - rx * 0.3, cy + ry * 0.5], [cx + rx * 0.05, cy + ry * 1.0], [cx + rx * 0.75, cy + ry * 0.95], [cx + rx * 0.95, cy + ry * 0.5], [cx + rx * 0.3, cy + ry * 0.35]], hair); ctx.restore(); }
  if (a.facial === 'mustache' || a.facial === 'goatee') stroke(ctx, [[mx - 2.4 * k, my - 1.2 * k], [mx + 2.4 * k, my - 1.2 * k]], 1.6 * k, hair);
  if (a.facial === 'goatee') ellipse(ctx, mx, my + 3 * k, 2 * k, 2.2 * k, hair);
  if (a.facial === 'beard') {
    poly(ctx, [[cx - rx * 0.4, cy + ry * 0.2], [cx - rx * 0.45, cy + ry * 0.6], [cx + rx * 0.05, cy + ry * 1.12], [cx + rx * 0.8, cy + ry * 1.05], [cx + rx * 1.02, cy + ry * 0.6], [cx + rx * 0.3, cy + ry * 0.62]], H.base);
    stroke(ctx, [[mx - 2 * k, my], [mx + 2 * k, my]], 1.1, lip);
    stroke(ctx, [[cx - rx * 0.2, cy + ry * 0.75], [cx + rx * 0.5, cy + ry * 1.0]], 1, H.hi, 0.5);
  }
  hairFront(ctx, cx, cy, rx, ry, a, H, k, false);
  if (a.headband) { stroke(ctx, [[cx - rx * 0.98, cy - ry * 0.35], [cx + rx * 0.98, cy - ry * 0.42]], 2.6 * k, a.headband); stroke(ctx, [[cx - rx * 0.9, cy - ry * 0.48], [cx + rx * 0.9, cy - ry * 0.55]], 1, tint(a.headband, 0.4), 0.7); }
  if (a.goggles) { stroke(ctx, [[cx - rx, ey + 0.5], [cx + rx, ey + 0.5]], 1.4, '#1c1c1c'); ellipse(ctx, ex + 0.5, ey + 0.8, 3 * k, 2.2 * k, '#1c1c1c'); ellipse(ctx, ex + 0.5, ey + 0.6, 2 * k, 1.3 * k, '#8fd3ff'); px(ctx, ex - 0.5, ey, '#e8f8ff'); }
  if (a.mask) { const m = '#c9d3dc'; stroke(ctx, [[cx + rx * 0.2, ey - 2.4 * k], [cx + rx * 1.02, ey - 2.4 * k], [cx + rx * 1.05, ey + 2.6 * k], [cx + rx * 0.2, ey + 2.6 * k], [cx + rx * 0.2, ey - 2.4 * k]], 1.2, m); }
}

/** Hair behind the skull (afro volume, dreads/braids hanging, bun). */
function hairBack(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, a: Appearance, H: Ramp, k: number) {
  if (a.hair === 'afro') { const g = ctx.createRadialGradient(cx + 2 * k, cy - ry * 0.7, 1, cx - 1 * k, cy - ry * 0.3, rx * 1.7); g.addColorStop(0, H.hi); g.addColorStop(0.5, H.base); g.addColorStop(1, H.deep); ellipse(ctx, cx - 1 * k, cy - ry * 0.35, rx * 1.55, ry * 1.25, g); }
  if (a.hair === 'dreads') for (let i = 0; i < 5; i++) stroke(ctx, [[cx - rx * 0.6 - i * 1.4 * k, cy - ry * 0.6], [cx - rx * 0.9 - i * 1.6 * k, cy + ry * (0.8 + (i % 2) * 0.25)]], 2.2 * k, i % 2 ? H.base : H.sh);
  if (a.hair === 'braids') for (let i = 0; i < 4; i++) stroke(ctx, [[cx - rx * 0.6 - i * 1.3 * k, cy - ry * 0.3], [cx - rx * 0.8 - i * 1.4 * k, cy + ry * 0.75]], 1.4 * k, i % 2 ? H.base : H.sh);
  if (a.hair === 'bun') ellipse(ctx, cx - rx * 0.75, cy - ry * 0.85, 3.4 * k, 3 * k, H.base);
}

/** Hair on top of the skull, front view of the 3/4 head. */
function hairFront(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, a: Appearance, H: Ramp, k: number, backView: boolean) {
  /** A cap over the top of the skull down to `line` (fraction of ry above center, negative = above), back side lower. */
  const cap = (front: number, back: number, puff = 1, fill: string | CanvasGradient = H.base) => {
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, cy - ry * 0.05 * (puff - 1), rx * puff + 0.4, ry * puff + 0.4, 0, 0, Math.PI * 2); ctx.clip();
    poly(ctx, [[cx - rx * 1.5, cy - ry * 2], [cx + rx * 1.5, cy - ry * 2], [cx + rx * 1.5, cy + ry * front], [cx + rx * 0.4, cy + ry * front], [cx - rx * 0.4, cy + ry * back], [cx - rx * 1.5, cy + ry * back]], fill);
    ctx.restore();
  };
  const g = ctx.createLinearGradient(cx + rx * 0.6, cy - ry, cx - rx * 0.6, cy);
  g.addColorStop(0, H.hi); g.addColorStop(0.45, H.base); g.addColorStop(1, H.deep);
  if (backView && a.hair !== 'bald') { cap(0.6, 0.6, 1.02, g); return; }
  switch (a.hair) {
    case 'bald': ellipse(ctx, cx + rx * 0.25, cy - ry * 0.6, 2.2 * k, 1.2 * k, tint(SKIN_TONES[a.skin % 5][0], 0.45)); break;
    case 'buzz': ctx.save(); ctx.globalAlpha = 0.85; cap(-0.42, 0.05, 1.01, g); ctx.restore(); break;
    case 'fade': cap(-0.5, -0.1, 1.04, g); ctx.save(); ctx.globalAlpha = 0.45; cap(-0.38, 0.15, 1.0, H.sh); ctx.restore(); break;
    case 'waves': cap(-0.45, 0.02, 1.04, g); for (let i = 0; i < 4; i++) stroke(ctx, [[cx - rx * 0.6 + i * 3 * k, cy - ry * 0.85], [cx - rx * 0.45 + i * 3 * k, cy - ry * 0.6]], 1, H.hi, 0.7); break;
    case 'hightop': { const top = ctx.createLinearGradient(cx, cy - ry * 2.1, cx, cy - ry * 0.4); top.addColorStop(0, H.hi); top.addColorStop(1, H.sh); poly(ctx, [[cx - rx * 0.92, cy - ry * 0.45], [cx - rx * 0.88, cy - ry * 1.95], [cx + rx * 0.82, cy - ry * 1.95], [cx + rx * 0.9, cy - ry * 0.45]], top); cap(-0.4, -0.05, 1.03, g); break; }
    case 'afro': cap(-0.38, -0.1, 1.04, g); break;
    case 'twists': cap(-0.4, 0, 1.06, g); for (let i = 0; i < 6; i++) stroke(ctx, [[cx - rx * 0.75 + i * 3 * k, cy - ry * 0.85], [cx - rx * 0.8 + i * 3 * k, cy - ry * 1.3]], 1.6 * k, i % 2 ? H.base : H.hi); break;
    case 'dreads': cap(-0.4, 0.1, 1.05, g); for (let i = 0; i < 5; i++) stroke(ctx, [[cx - rx * 0.6 + i * 3 * k, cy - ry * 0.9], [cx - rx * 0.7 + i * 3 * k, cy - ry * 1.2]], 1.8 * k, H.base); break;
    case 'braids': cap(-0.42, 0.05, 1.02, g); for (let i = 0; i < 5; i++) stroke(ctx, [[cx + rx * 0.5 - i * 3.2 * k, cy - ry * 0.55], [cx - rx * 0.1 - i * 3.2 * k, cy - ry * 0.95]], 1.1, H.hi, 0.75); break;
    case 'mohawk': { cap(-0.3, 0.1, 1.0, H.deep); poly(ctx, [[cx - rx * 0.5, cy - ry * 0.85], [cx - rx * 0.1, cy - ry * 1.6], [cx + rx * 0.35, cy - ry * 1.55], [cx + rx * 0.55, cy - ry * 0.8]], g); break; }
    case 'bun': cap(-0.42, 0, 1.03, g); break;
    case 'curly': cap(-0.36, 0.12, 1.1, g); for (let i = 0; i < 7; i++) ellipse(ctx, cx - rx * 0.9 + i * 2.8 * k, cy - ry * (0.95 + (i % 2) * 0.12), 1.5 * k, 1.3 * k, i % 2 ? H.hi : H.base); break;
  }
}

// ---------- figure ----------
/**
 * Draw one pose: arms lowered/re-rigged by `rigArms` (ballClip = the clip carries the ball somewhere), jersey top
 * lowered by TORSO_DROP. ox/oy = the frame's top-left in the sheet. Returns the ball offset (art px, origin-relative, +y up).
 */
export function drawPose(ctx: Ctx, ox: number, oy: number, keyed: Pose, H: number, a: Appearance, kit: Kit, ballClip = false, yawDeg = 0): J | null {
  if (yawDeg !== 0) return drawPoseYaw(ctx, ox, oy, keyed, H, a, kit, ballClip, yawDeg);
  const pose = rigArms(keyed, ballClip);
  const [tdx, tdy] = dropToward(keyed, TORSO_DROP);
  const u = H / 100;
  const k = H / 99; // detail scale relative to a 6'6" player
  const T = (j: J): J => [ox + CX + j[0] * u, oy + FOOT_Y - j[1] * u];
  const p = Object.fromEntries(Object.entries(pose).map(([key, v]) => [key, Array.isArray(v) ? T(v as J) : v])) as unknown as Pose;
  const sleeveF = a.armSleeve !== 'none', sleeveB = a.armSleeve === 'both';
  drawArm(ctx, p.sB, p.eB, p.hB, a, kit, true, sleeveB, k);
  drawLeg(ctx, p.hip, p.kB, p.fB, a, kit, true, a.legSleeve === 'both', false, k);
  // jersey top: the keyed shoulders lowered by TORSO_DROP; the neck runs from there up into the head, under the jersey
  const tF = T([keyed.sF[0] + tdx, keyed.sF[1] + tdy]), tB = T([keyed.sB[0] + tdx, keyed.sB[1] + tdy]);
  const S = skinRamp(a);
  const headBase: J = [p.head[0] - 1.5 * k, p.head[1] + 8 * k];
  tube(ctx, [(tF[0] + tB[0]) / 2, (tF[1] + tB[1]) / 2], headBase, () => 3.8 * k, S);
  drawTorso(ctx, p.neck, p.hip, tF, tB, kit, a, k);
  drawLeg(ctx, p.hip, p.kF, p.fF, a, kit, false, a.legSleeve !== 'none', a.kneePad, k);
  drawHead(ctx, p.head[0], p.head[1], a, k, !!pose.backView);
  drawArm(ctx, p.sF, p.eF, p.hF, a, kit, false, sleeveF, k);
  return pose.ball ? [pose.ball[0] * u, pose.ball[1] * u] : null;
}

/**
 * Any-angle player (pose3d): the side-view skeleton lifted to 3D and turned by yaw (deg, +90 = facing the camera,
 * -90 = facing away). Limbs are drawn far -> near by depth around the torso; the torso is a projected volume; the head
 * turns (profile -> three-quarter -> front, or the back of the head when facing away).
 */
function drawPoseYaw(ctx: Ctx, ox: number, oy: number, keyed: Pose, H: number, a: Appearance, kit: Kit, ballClip: boolean, yawDeg: number, mirrorText = false): J | null {
  return drawAngled(ctx, ox, oy, keyed, H, a, kit, ballClip, yawDeg, mirrorText).ball;
}

/**
 * One multi-angle frame (see drawPoseYaw). mirrorText: the frame will be shown flipped, so draw the jersey number
 * pre-mirrored to read correctly. Returns the ball offset and whether the ball is behind the body (draw it behind).
 */
export function drawAngled(ctx: Ctx, ox: number, oy: number, keyed: Pose, H: number, a: Appearance, kit: Kit, ballClip: boolean, yawDeg: number, mirrorText = false): { ball: J | null; ballBehind: boolean } {
  const yaw = toRad(yawDeg), c = Math.cos(yaw), sn = Math.sin(yaw);
  const rigged = rigArms(keyed, ballClip);
  const { pose, depth, ballDepth } = view(rigged, yaw);
  const u = H / 100, k = H / 99;
  const T = (j: J): J => [ox + CX + j[0] * u, oy + FOOT_Y - j[1] * u];
  const p = Object.fromEntries(Object.entries(pose).map(([key, v]) => [key, Array.isArray(v) ? T(v as J) : v])) as unknown as Pose;
  const [tdx, tdy] = dropToward(keyed, TORSO_DROP);
  // torso centerline: top between the (dropped) shoulders, bottom at the pelvis; legs hang from the hip sockets
  const top = T([((keyed.sF[0] + keyed.sB[0]) / 2 + tdx) * c, Math.max(keyed.sF[1], keyed.sB[1]) + tdy]);
  const hipC = p.hip;
  const sock = (side: number): J => T([projX([keyed.hip[0], side * HIP_HALF, 0], yaw), keyed.hip[1]]);
  const S = skinRamp(a);
  const away = sn < -0.35;
  const sleeveF = a.armSleeve !== 'none', sleeveB = a.armSleeve === 'both';
  const frontShoe = Math.abs(c) < 0.55;
  const avg = (...ks: (keyof typeof depth)[]) => ks.reduce((t, kk) => t + depth[kk], 0) / ks.length;
  type Item = { d: number; draw: (far: boolean) => void; leg?: boolean };
  // front/back views: once both legs are drawn, mark the shorts' split (inseam) and outer side seams on top of them
  let legsDrawn = 0;
  const legDone = () => { if (++legsDrawn === 2 && Math.abs(sn) > 0.3) shortsSeams(); };
  const shortsSeams = () => {
    const P0 = ramp(kit.shorts), Tr = ramp(kit.trim), sA = sock(1), sB = sock(-1), mx = (sA[0] + sB[0]) / 2;
    const A = (t: number) => lerp2(sA, p.kF, t), B = (t: number) => lerp2(sB, p.kB, t);
    // the split runs down between the two shorts legs for as long as they still touch
    let tEnd = 0.08;
    for (let t = 0.08; t <= 0.74; t += 0.06) { if (Math.hypot(A(t)[0] - B(t)[0], A(t)[1] - B(t)[1]) < 11.5 * k) tEnd = t; else break; }
    const end = lerp2(A(tEnd), B(tEnd), 0.5);
    const dark = shade(P0.deep, 0.55);
    stroke(ctx, [[mx, sA[1] + 2.5 * k], end], 1.6 * k, dark, 1);
    // shadowed notch where the two legs of the shorts part at the hem
    const hm = lerp2(A(0.74), B(0.74), 0.5);
    poly(ctx, [[hm[0] - 2.4 * k, hm[1] + 1 * k], [hm[0] + 2.4 * k, hm[1] + 1 * k], [hm[0], hm[1] - 5 * k]], dark);
    if (Math.abs(sn) > 0.5) for (const [h, kn] of [[sA, p.kF], [sB, p.kB]] as const) {
      const out = Math.sign(h[0] - mx) || 1, q = lerp2(h, kn, 0.62);
      stroke(ctx, [[h[0] + out * 6.2 * k, h[1] + 1 * k], [q[0] + out * 5.6 * k, q[1]]], 1.2 * k, Tr.base, 0.85);
    }
  };
  const items: Item[] = [
    { d: avg('sB', 'eB', 'hB'), draw: (far: boolean) => drawArm(ctx, p.sB, p.eB, p.hB, a, kit, far, sleeveB, k) },
    { d: avg('sF', 'eF', 'hF'), draw: (far: boolean) => drawArm(ctx, p.sF, p.eF, p.hF, a, kit, far, sleeveF, k) },
    { leg: true, d: avg('kB', 'fB') - 0.01, draw: (far: boolean) => { drawLeg(ctx, sock(-1), p.kB, p.fB, a, kit, far, a.legSleeve === 'both', false, k, frontShoe ? (sn >= 0 ? 1 : -1) : undefined); legDone(); } },
    { leg: true, d: avg('kF', 'fF'), draw: (far: boolean) => { drawLeg(ctx, sock(1), p.kF, p.fF, a, kit, far, a.legSleeve !== 'none', a.kneePad, k, frontShoe ? (sn >= 0 ? -1 : 1) : undefined); legDone(); } },
  ].sort((x, y) => x.d - y.d);
  // legs always go under the torso (the jersey's waistband sits over the shorts), far leg first; arms sort around it
  for (const it of items) if (it.leg) it.draw(it.d < 0 && items.some((o) => o.leg && o !== it && o.d > it.d));
  for (const it of items) if (!it.leg && it.d < 0) it.draw(true);
  // shorts gusset when the legs are seen apart: only closes the gap just under the waistband (the split shows below)
  if (Math.abs(sn) > 0.3) {
    const P0 = ramp(kit.shorts), hA = sock(1), hB = sock(-1), mx = (hA[0] + hB[0]) / 2;
    poly(ctx, [[Math.min(hA[0], hB[0]) - 2 * k, hA[1] - 1 * k], [Math.max(hA[0], hB[0]) + 2 * k, hA[1] - 1 * k], [mx + 2.2 * k, hA[1] + 3 * k], [mx - 2.2 * k, hA[1] + 3 * k]], P0.base);
  }
  tube(ctx, top, [p.head[0] - 1.5 * k * c, p.head[1] + 8 * k], () => 3.8 * k, S);
  drawTorsoYaw(ctx, top, hipC, yaw, kit, a, k, mirrorText);
  if (yawDeg <= -30) drawHead(ctx, p.head[0], p.head[1], a, k, true);
  else if (yawDeg < 25) drawHead(ctx, p.head[0], p.head[1], a, k, !!pose.backView);
  else frontHead(ctx, p.head[0], p.head[1], a, k * 1.25, { turn: Math.max(0, Math.min(1, c * 1.35)) });
  for (const it of items) if (!it.leg && it.d >= 0) it.draw(false);
  void away; void SHOULDER_HALF;
  return { ball: pose.ball ? [pose.ball[0] * u, pose.ball[1] * u] : null, ballBehind: !!pose.ball && ballDepth < -4 };
}

/** Torso seen at a yaw: the chest/back profile widths and a lateral (shoulder-span) width projected together. */
function drawTorsoYaw(ctx: Ctx, top: J, hip: J, yaw: number, kit: Kit, a: Appearance, k: number, mirrorText = false) {
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const L = hip[1] - top[1];
  const prof = (t: number): [number, number, number] => { // [front, back, lateral] half-widths
    if (t < 0.06) return [7.4, 7.4, 8];
    if (t < 0.14) return [9.8, 9.6, 10.8];
    if (t < 0.4) return [11.4, 10.4, 11.4];
    if (t < 0.86) return [11.4 - (t - 0.4) * 7, 10.4 - (t - 0.4) * 5, 11.4 - (t - 0.4) * 5];
    return [8.4, 8.1, 9.2];
  };
  const N = 16, R: J[] = [], Lf: J[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, [af, ab, b] = prof(t);
    let lo = Infinity, hi = -Infinity;
    for (let q = 0; q < 24; q++) {
      const ph = (q / 24) * Math.PI * 2, cf = Math.cos(ph);
      const x = (cf > 0 ? af : ab) * cf * c - b * Math.sin(ph) * sn;
      lo = Math.min(lo, x); hi = Math.max(hi, x);
    }
    const cx = top[0] + (hip[0] - top[0]) * t, cy = top[1] + L * t;
    R.push([cx + hi * k, cy]); Lf.push([cx + lo * k, cy]);
  }
  const J0 = ramp(kit.jersey), Tr = ramp(kit.trim);
  const mid = lerp2(top, hip, 0.35);
  const grad = ctx.createLinearGradient(mid[0] + 10 * k, mid[1] - 6 * k, mid[0] - 10 * k, mid[1] + 6 * k);
  grad.addColorStop(0, J0.hi); grad.addColorStop(0.35, J0.base); grad.addColorStop(0.75, J0.sh); grad.addColorStop(1, J0.deep);
  poly(ctx, [...R, ...Lf.slice().reverse()], grad);
  // side panels along the visible side seams
  stroke(ctx, Lf.slice(3, 15).map((q) => [q[0] + 1.2 * k, q[1]] as J), 1.6 * k, Tr.sh, 0.9);
  if (Math.abs(sn) > 0.5) stroke(ctx, R.slice(3, 15).map((q) => [q[0] - 1.2 * k, q[1]] as J), 1.6 * k, Tr.sh, 0.9);
  // collar: v-neck on the chest when it faces us, a round back collar when it faces away
  const S = skinRamp(a);
  if (sn > -0.35) {
    const vx = top[0] + 2.75 * k * c, hw = 2.25 * k * (0.6 + 0.6 * Math.abs(sn));
    poly(ctx, [[vx - hw, top[1]], [vx + hw, top[1]], [vx + 0.85 * k * c, top[1] + 4.5 * k]], S.base);
    stroke(ctx, [[vx - hw - 0.2 * k, top[1]], [vx + 0.85 * k * c, top[1] + 4.6 * k], [vx + hw + 0.2 * k, top[1]]], 1.4, Tr.base);
  } else stroke(ctx, [[top[0] - 3 * k, top[1] + 0.5], [top[0], top[1] + 1.5 * k], [top[0] + 3 * k, top[1] + 0.5]], 1.4, Tr.base);
  // armhole trims at both shoulders
  for (const q of [R[1], Lf[1]]) stroke(ctx, [[q[0], q[1] - 1 * k], [q[0] + (q === R[1] ? -2 : 2) * k, q[1] + 5 * k], [q[0] + (q === R[1] ? -1 : 1) * k, q[1] + 9 * k]], 1.2, Tr.base);
  // waistband and number (chest when facing us, back when facing away)
  const ext = Math.abs(sn) * 2.4 * k; // seen from the front/back the waistband wraps the full width of the shorts
  const wbL: J = [Lf[N][0] - ext, Lf[N][1]], wbR: J = [R[N][0] + ext, R[N][1]], wy = lerp2(top, hip, 0.97)[1];
  const P = ramp(kit.shorts);
  poly(ctx, [[wbL[0] + 0.4 * k, wy], [wbR[0] - 0.4 * k, wy], [wbR[0] - 0.2 * k, wy + 4 * k], [wbL[0] + 0.2 * k, wy + 4 * k]], P.base);
  stroke(ctx, [[wbL[0] + 0.4 * k, wy + 0.5], [wbR[0] - 0.4 * k, wy + 0.5]], 1.2, Tr.base);
  if (kit.number >= 0) {
    const nx = top[0] + (hip[0] - top[0]) * 0.4 + 2 * k * c;
    if (mirrorText) { ctx.save(); ctx.translate(nx, 0); ctx.scale(-1, 1); ctx.translate(-nx, 0); }
    digits(ctx, nx, top[1] + L * 0.26, kit.number, Tr.base, J0.deep);
    if (mirrorText) ctx.restore();
  }
}

/**
 * Pixel-art finish: snap alpha to on/off (no fuzzy edges when scaled up) and darken the silhouette's
 * outer pixels so figures read clearly against the floor and crowd.
 */
export function crispen(canvas: HTMLCanvasElement, edge = 0.6) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  crispenRect(ctx, 0, 0, canvas.width, canvas.height, edge);
}

/** crispen() for one region of a canvas (a single cached frame slot). */
export function crispenRect(ctx: Ctx, x0: number, y0: number, w: number, h: number, edge = 0.6) {
  const img = ctx.getImageData(x0, y0, w, h);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 110 ? 255 : 0;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] === 255;
  const mark: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!solid(x, y)) continue;
    if (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1)) mark.push((y * w + x) * 4);
  }
  for (const i of mark) { d[i] *= edge; d[i + 1] *= edge; d[i + 2] *= edge; }
  ctx.putImageData(img, x0, y0);
}

/** Build a sheet with every clip sampled into frames. */
export function buildSheet(heightFt: number, a: Appearance, kit: Kit): Sheet {
  const H = figureHeight(heightFt);
  const total = CLIPS.reduce((n, c) => n + c.frames, 0);
  const rows = Math.ceil(total / COLS);
  const canvas = makeCanvas(FRAME_W * COLS, FRAME_H * rows);
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  const index: Sheet['index'] = {};
  const ball: (J | null)[] = [];
  let i = 0;
  for (const c of CLIPS) {
    index[c.name] = { start: i, count: c.frames };
    const ballClip = c.keys.some((key) => !!key.pose.ball);
    for (let f = 0; f < c.frames; f++, i++) {
      const pose = sampleClip(c, frameTime(c, f));
      const fx = (i % COLS) * FRAME_W, fy = Math.floor(i / COLS) * FRAME_H;
      ctx.save(); ctx.beginPath(); ctx.rect(fx, fy, FRAME_W, FRAME_H); ctx.clip();
      ball.push(drawPose(ctx, fx, fy, pose, H, a, kit, ballClip));
      ctx.restore();
    }
  }
  crispen(canvas);
  return { canvas, index, ball, total };
}

export const frameRect = (i: number) => ({ x: (i % COLS) * FRAME_W, y: Math.floor(i / COLS) * FRAME_H });
export type { Clip };

// ---------- front view (bench players facing the court) ----------
export const FRONT_W = 48, FRONT_H = 120;

/** Two frames, facing the camera: 0 = seated, 1 = standing and cheering. */
export function buildFrontSheet(heightFt: number, a: Appearance, kit: Kit): HTMLCanvasElement {
  const c = makeCanvas(FRONT_W * 2, FRONT_H);
  const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  const s = figureHeight(heightFt) / 99; // relative to a 6'6" player
  drawFront(ctx, 0, a, kit, false, s);
  drawFront(ctx, FRONT_W, a, kit, true, s);
  crispen(c);
  return c;
}

/** Front-facing head (bench players, fans). Shared with the courtside crowd. */
/** turn (0..1): 0 = straight at the camera, toward 1 = turned to screen-right (three-quarter): the face slides right. */
export function frontHead(ctx: Ctx, cx0: number, hy: number, a: Appearance, k: number, opts: { open?: boolean; shades?: string | null; turn?: number } = {}) {
  const S = skinRamp(a), H = ramp(a.hairColor);
  const rx = 7.2 * k, ry = 8.6 * k;
  const turn = opts.turn ?? 0;
  const cx = cx0 + turn * rx * 0.42; // face features (eyes, nose, mouth, facial hair) ride toward the turned side
  if (a.hair === 'afro') ellipse(ctx, cx0, hy - ry * 0.35, rx * 1.6, ry * 1.25, H.base);
  if (a.hair === 'dreads' || a.hair === 'braids') for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) stroke(ctx, [[cx0 + sx * (rx * 0.8 + i * 1.2 * k), hy - ry * 0.4], [cx0 + sx * (rx * 0.9 + i * 1.3 * k), hy + ry * 1.0]], 1.6 * k, i % 2 ? H.base : H.sh);
  ellipse(ctx, cx0 - rx * (1 - 0.3 * turn), hy + ry * 0.05, 1.6 * k, 2.4 * k, S.sh); // ears (the far one hides as the head turns)
  if (turn < 0.3) ellipse(ctx, cx0 + rx, hy + ry * 0.05, 1.6 * k, 2.4 * k, S.sh);
  const rg = ctx.createRadialGradient(cx0 - rx * 0.3 + turn * rx * 0.5, hy - ry * 0.35, 1, cx0, hy, rx * 1.3);
  rg.addColorStop(0, S.hi); rg.addColorStop(0.45, S.base); rg.addColorStop(0.85, S.sh); rg.addColorStop(1, S.deep);
  ellipse(ctx, cx0, hy, rx, ry, rg);
  poly(ctx, [[cx0 - rx * 0.85 + turn * rx * 0.3, hy + ry * 0.35], [cx - rx * 0.35, hy + ry * 1.02], [cx + rx * 0.35, hy + ry * 1.02], [cx0 + rx * 0.85 + turn * rx * 0.12, hy + ry * 0.35]], S.base); // jaw
  if (turn > 0.25) poly(ctx, [[cx + rx * 0.3, hy - ry * 0.05], [cx + rx * (0.62 + 0.25 * turn), hy + ry * 0.32], [cx + rx * 0.32, hy + ry * 0.38]], S.base); // nose in profile past the cheek
  const ey = hy - ry * 0.05 + a.eyeY * k;
  for (const sx of [-1, 1]) {
    const sq = sx > 0 ? 1 - 0.55 * turn : 1; // the eye on the turned side foreshortens
    const ex = cx + sx * rx * 0.42 * (1 - 0.35 * turn);
    ellipse(ctx, ex, ey + 0.4, 2 * k * sq, 1.3 * k, S.sh); px(ctx, ex - 1, ey, '#f2efe8', sq > 0.6 ? 2 : 1, 1); px(ctx, ex + (sx > 0 ? 0 : -1) + 0.5 + turn, ey, a.eyeColor, 1, 1);
    for (let r = 0; r < a.brow; r++) stroke(ctx, [[ex - rx * 0.22 * sq, ey - 2.2 * k - r], [ex + rx * 0.28 * sq, ey - 2 * k - r]], 1.1, shade(a.hairColor, 0.85));
  }
  stroke(ctx, [[cx, ey + 1], [cx + 0.6, ey + 3.4 * k]], 1, S.sh); px(ctx, cx - 1, ey + 3.6 * k, S.deep, a.nose === 'wide' ? 3 : 2, 1);
  const my = hy + ry * 0.55 + a.mouthY * k;
  if (opts.open || a.mouth === 'open') ellipse(ctx, cx, my + 0.6 * k, 2.2 * k, 1.8 * k, '#2a0d0d');
  else stroke(ctx, [[cx - 2 * k, my + (a.mouth === 'smile' ? -0.6 : 0)], [cx, my], [cx + 2 * k, my + (a.mouth === 'smile' ? -0.6 : 0)]], 1.1, mix(S.sh, '#7a2a2a', 0.45));
  if (a.facial === 'beard') poly(ctx, [[cx - rx * 0.95, hy + ry * 0.1], [cx - rx * 0.5, hy + ry * 1.12], [cx + rx * 0.5, hy + ry * 1.12], [cx + rx * 0.95, hy + ry * 0.1], [cx + rx * 0.6, hy + ry * 0.6], [cx - rx * 0.6, hy + ry * 0.6]], H.base);
  if (a.facial === 'goatee' || a.facial === 'mustache' || a.facial === 'beard') stroke(ctx, [[cx - 2.4 * k, my - 1.3 * k], [cx + 2.4 * k, my - 1.3 * k]], 1.4 * k, a.hairColor);
  if (a.facial === 'goatee') ellipse(ctx, cx, my + 2.8 * k, 1.8 * k, 2 * k, a.hairColor);
  // hair
  const g = ctx.createLinearGradient(cx0 - rx, hy - ry * 1.3, cx0 + rx, hy);
  g.addColorStop(0, H.hi); g.addColorStop(0.5, H.base); g.addColorStop(1, H.deep);
  const capTo = (y: number, puff = 1.05) => { ctx.save(); ctx.beginPath(); ctx.ellipse(cx0, hy, rx * puff, ry * puff, 0, 0, Math.PI * 2); ctx.clip(); poly(ctx, [[cx0 - rx * 2, hy - ry * 2], [cx0 + rx * 2, hy - ry * 2], [cx0 + rx * 2, hy + ry * y], [cx0 - rx * 2, hy + ry * y]], g); ctx.restore(); };
  switch (a.hair) {
    case 'bald': ellipse(ctx, cx - rx * 0.3, hy - ry * 0.6, 2 * k, 1.1 * k, S.hi); break;
    case 'hightop': poly(ctx, [[cx - rx * 0.95, hy - ry * 0.5], [cx - rx * 0.9, hy - ry * 1.9], [cx + rx * 0.9, hy - ry * 1.9], [cx + rx * 0.95, hy - ry * 0.5]], g); capTo(-0.45); break;
    case 'mohawk': poly(ctx, [[cx - rx * 0.25, hy - ry * 0.7], [cx - rx * 0.2, hy - ry * 1.55], [cx + rx * 0.2, hy - ry * 1.55], [cx + rx * 0.25, hy - ry * 0.7]], g); break;
    case 'bun': capTo(-0.5); ellipse(ctx, cx, hy - ry * 1.15, 3 * k, 2.6 * k, H.base); break;
    case 'afro': capTo(-0.45, 1.1); break;
    case 'curly': case 'twists': capTo(-0.4, 1.12); for (let i = -3; i <= 3; i++) ellipse(ctx, cx + i * 2.2 * k, hy - ry * 1.02, 1.4 * k, 1.3 * k, i % 2 ? H.hi : H.base); break;
    default: capTo(a.hair === 'buzz' ? -0.55 : -0.48, 1.05);
  }
  if (a.headband) stroke(ctx, [[cx - rx, hy - ry * 0.45], [cx + rx, hy - ry * 0.45]], 2.4 * k, a.headband);
  if (opts.shades) { poly(ctx, [[cx - rx * 0.95, ey - 1.6 * k], [cx + rx * 0.95, ey - 1.6 * k], [cx + rx * 0.8, ey + 1.8 * k], [cx + 1 * k, ey + 1.2 * k], [cx - 1 * k, ey + 1.2 * k], [cx - rx * 0.8, ey + 1.8 * k]], opts.shades); px(ctx, cx - rx * 0.55, ey - 0.6 * k, '#ffffff', 2, 1); }
  else if (a.goggles) { stroke(ctx, [[cx - rx, ey], [cx + rx, ey]], 1.2, '#1c1c1c'); for (const sx of [-1, 1]) ellipse(ctx, cx + sx * rx * 0.42, ey + 0.3, 2.2 * k, 1.6 * k, '#8fd3ff'); }
}

/** A chair seen from the front (drawn behind a seated figure): backrest, seat edge, legs. */
export function frontChair(ctx: Ctx, cx: number, floor: number, seatY: number, backTop: number, color: string, k: number) {
  const C = ramp(color);
  const g = ctx.createLinearGradient(cx - 13 * k, 0, cx + 13 * k, 0);
  g.addColorStop(0, C.hi); g.addColorStop(0.4, C.base); g.addColorStop(1, C.sh);
  poly(ctx, [[cx - 16 * k, backTop + 2 * k], [cx - 14 * k, backTop], [cx + 14 * k, backTop], [cx + 16 * k, backTop + 2 * k], [cx + 16 * k, seatY], [cx - 16 * k, seatY]], g);   // backrest
  stroke(ctx, [[cx - 14 * k, backTop + 1], [cx + 14 * k, backTop + 1]], 1, C.hi);
  poly(ctx, [[cx - 17 * k, seatY - 1 * k], [cx + 17 * k, seatY - 1 * k], [cx + 16 * k, seatY + 4 * k], [cx - 16 * k, seatY + 4 * k]], C.base); // seat cushion
  stroke(ctx, [[cx - 17 * k, seatY - 1 * k], [cx + 17 * k, seatY - 1 * k]], 1.2, C.hi);
  for (const sx of [-1, 1]) stroke(ctx, [[cx + sx * 15 * k, seatY + 4 * k], [cx + sx * 16 * k, floor]], 1.8 * k, C.deep);
}

function drawFront(ctx: Ctx, ox: number, a: Appearance, kit: Kit, standing: boolean, s: number) {
  const S = skinRamp(a), J0 = ramp(kit.jersey), P = ramp(kit.shorts), T = ramp(kit.trim);
  const cx = ox + FRONT_W / 2, floor = FRONT_H - 3;
  const L = (n: number) => n * s;
  if (!standing) frontChair(ctx, cx, floor, floor - L(21) - L(4), floor - L(21) - L(36), '#5a6584', s);
  // legs
  const shinTop = standing ? floor - L(38) : floor - L(21);
  for (const side of [-1, 1]) {
    const lx = cx + side * L(standing ? 4.2 : 5.4); // seated: knees apart
    tube(ctx, [lx, shinTop], [lx, floor - L(3)], (t) => L(2.6 - 0.9 * t + 0.6 * bump(t, 0.3, 0.35)), S);
    const sockH = a.socks === 'high' ? 0.55 : a.socks === 'crew' ? 0.28 : 0.08;
    tube(ctx, [lx, shinTop], [lx, floor - L(3)], (t) => L(2.7 - 0.9 * t + 0.6 * bump(t, 0.3, 0.35)), ramp(a.sockColor), 1 - sockH, 1);
    if (a.legSleeve === 'both' || (a.legSleeve === 'one' && side > 0)) tube(ctx, [lx, shinTop], [lx, floor - L(3)], () => L(2.8), ramp(a.legSleeveColor), 0, 0.4);
    const Sh = ramp(a.shoe);
    poly(ctx, [[lx - L(3.4), floor - L(4)], [lx + L(3.4), floor - L(4)], [lx + L(3.8), floor], [lx - L(3.8), floor]], Sh.base);
    px(ctx, lx - L(3.6), floor - 1, '#e8e8e8', Math.round(L(7.4)), 1);
    stroke(ctx, [[lx - L(2.4), floor - L(2)], [lx + L(2.4), floor - L(2.4)]], 1, a.shoeAccent);
  }
  // thighs / shorts: seated thighs point at the camera (short block); standing they hang down
  const hipY = standing ? shinTop - L(22) : shinTop - L(7);
  const sg = ctx.createLinearGradient(cx - L(10), hipY, cx + L(10), shinTop);
  sg.addColorStop(0, P.hi); sg.addColorStop(0.4, P.base); sg.addColorStop(1, P.sh);
  poly(ctx, [[cx - L(10.5), hipY], [cx + L(10.5), hipY], [cx + L(10), shinTop + 1], [cx - L(10), shinTop + 1]], sg);
  stroke(ctx, [[cx, hipY + L(3)], [cx, shinTop]], 1, P.deep);
  stroke(ctx, [[cx - L(9.6), shinTop], [cx - L(1), shinTop]], 1.4, T.base); stroke(ctx, [[cx + L(1), shinTop], [cx + L(9.6), shinTop]], 1.4, T.base);
  if (!standing) for (const side of [-1, 1]) ellipse(ctx, cx + side * L(4.6), shinTop + L(0.5), L(3.2), L(2.4), S.base); // knees
  // torso
  const shY = hipY - L(28);
  const tg = ctx.createLinearGradient(cx - L(11), shY, cx + L(11), hipY);
  tg.addColorStop(0, J0.hi); tg.addColorStop(0.35, J0.base); tg.addColorStop(0.8, J0.sh); tg.addColorStop(1, J0.deep);
  poly(ctx, [[cx - L(8), shY], [cx + L(8), shY], [cx + L(11), shY + L(4)], [cx + L(10.5), shY + L(12)], [cx + L(8.5), hipY], [cx - L(8.5), hipY], [cx - L(10.5), shY + L(12)], [cx - L(11), shY + L(4)]], tg);
  if (!kit.pants) {
    poly(ctx, [[cx - L(3), shY], [cx + L(3), shY], [cx, shY + L(5)]], S.base);
    stroke(ctx, [[cx - L(3.2), shY], [cx, shY + L(5.2)], [cx + L(3.2), shY]], 1.4, T.base);
    if (kit.number >= 0) digits(ctx, cx + 0.5, shY + L(8), kit.number, T.base, J0.deep);
  } else {
    poly(ctx, [[cx - L(2.5), shY], [cx + L(2.5), shY], [cx, shY + L(14)]], '#f2f2f2'); stroke(ctx, [[cx, shY + L(1)], [cx, shY + L(12)]], L(1.6), kit.trim);
  }
  // arms: resting on the knees, or raised when cheering
  for (const side of [-1, 1]) {
    const sh: J = [cx + side * L(9.6), shY + L(3)];
    const sleeve = a.armSleeve === 'both' || (a.armSleeve === 'shooting' && side === 1);
    const hand: J = standing ? [sh[0] + side * L(5), shY - L(18)] : [sh[0] + side * L(1), hipY + L(3)];
    const el: J = standing ? [sh[0] + side * L(5), shY - L(6)] : [sh[0] + side * L(2.4), shY + L(15)];
    const R = kit.pants ? J0 : S;
    tube(ctx, sh, el, (t) => L(2.6 - 0.5 * t + 0.4 * bump(t, 0.45, 0.35)), R);
    tube(ctx, el, hand, (t) => L(2.3 - 0.7 * t), R);
    if (sleeve) { tube(ctx, sh, el, () => L(2.7), ramp(a.sleeveColor)); tube(ctx, el, hand, () => L(2.3), ramp(a.sleeveColor), 0, 0.8); }
    if (a.wristband) tube(ctx, el, hand, () => L(2.1), ramp(a.wristband), 0.72, 0.95);
    ellipse(ctx, hand[0], hand[1], L(2.3), L(2.3), S.base);
    if (!kit.pants) tube(ctx, sh, [sh[0], sh[1] + 1], () => L(3), J0); // strap
  }
  // neck + head
  tube(ctx, [cx, shY + L(1)], [cx, shY - L(5)], () => L(3.2), S);
  frontHead(ctx, cx, shY - L(12), a, s, { open: standing });
}
