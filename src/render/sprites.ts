/**
 * Procedural pixel-art player sprites. Tall, realistic proportions (~1:7.5 head-to-body),
 * not chibi. Each pose is a skeleton in pixel space and limbs are rasterized as thick
 * pixel lines, so new animations are just new joint tables.
 */
export const FRAME_W = 32;
export const FRAME_H = 72;
export const PIXEL = 3; // on-screen scale

export const FRAMES = ['idle', 'run0', 'run1', 'run2', 'run3', 'dribble', 'defend', 'shoot', 'block', 'dunk', 'layup', 'screen', 'fallen', 'stagger', 'pass', 'swipe', 'charge', 'dribble2', 'cross'] as const;
export type FrameName = (typeof FRAMES)[number];

type J = [number, number]; // x offset from center (+ = facing direction), y = height up from floor in px
interface Pose { head: J; neck: J; hip: J; sB: J; eB: J; hB: J; sF: J; eF: J; hF: J; kB: J; fB: J; kF: J; fF: J; lean?: number }

/** Skeleton for a figure of height H px. Front = limbs nearer the camera. */
function pose(name: FrameName, H: number): Pose {
  const hipY = H * 0.5, shY = H * 0.8, kneeY = H * 0.26, neckY = H * 0.85, headY = H * 0.92;
  const P = (o: Partial<Pose>): Pose => ({
    head: [0, headY], neck: [0, neckY], hip: [0, hipY],
    sB: [-1, shY], eB: [-2, shY - H * 0.16], hB: [-2, shY - H * 0.31],
    sF: [1, shY], eF: [2, shY - H * 0.16], hF: [2, shY - H * 0.31],
    kB: [-1, kneeY], fB: [-2, 0], kF: [1, kneeY], fF: [2, 0], ...o,
  });
  const s = H / 64;
  switch (name) {
    case 'idle': return P({});
    case 'run0': return P({ kF: [5 * s, kneeY + 2], fF: [9 * s, 3], kB: [-3 * s, kneeY], fB: [-8 * s, 4], eF: [-3, shY - H * 0.15], hF: [-1, shY - H * 0.27], eB: [4, shY - H * 0.14], hB: [7, shY - H * 0.22], lean: 2 });
    case 'run1': return P({ kF: [2 * s, kneeY + 1], fF: [1, 0], kB: [-1, kneeY + 3], fB: [-6 * s, 6], lean: 2 });
    case 'run2': return P({ kB: [5 * s, kneeY + 2], fB: [9 * s, 3], kF: [-3 * s, kneeY], fF: [-8 * s, 4], eB: [-3, shY - H * 0.15], hB: [-1, shY - H * 0.27], eF: [4, shY - H * 0.14], hF: [7, shY - H * 0.22], lean: 2 });
    case 'run3': return P({ kB: [2 * s, kneeY + 1], fB: [1, 0], kF: [-1, kneeY + 3], fF: [-6 * s, 6], lean: 2 });
    case 'dribble': return P({ head: [2, headY - 3], neck: [2, neckY - 3], hip: [-1, hipY - 3], sF: [3, shY - 3], eF: [6, shY - H * 0.17], hF: [8, shY - H * 0.32], sB: [1, shY - 3], eB: [-1, shY - H * 0.18], hB: [1, shY - H * 0.3], kF: [4, kneeY], fF: [4, 0], kB: [-4, kneeY], fB: [-5, 0] });
    case 'dribble2': return P({ head: [2, headY - 3], neck: [2, neckY - 3], hip: [-1, hipY - 3], sF: [3, shY - 3], eF: [6, shY - H * 0.15], hF: [8, shY - H * 0.24], sB: [1, shY - 3], eB: [-1, shY - H * 0.18], hB: [1, shY - H * 0.3], kF: [4, kneeY], fF: [4, 0], kB: [-4, kneeY], fB: [-5, 0] });
    case 'cross': return P({ head: [3, headY - 5], neck: [3, neckY - 5], hip: [0, hipY - 5], sF: [4, shY - 5], eF: [2, shY - H * 0.2], hF: [-4, shY - H * 0.34], sB: [2, shY - 5], eB: [-3, shY - H * 0.2], hB: [-1, shY - H * 0.32], kF: [7, kneeY - 1], fF: [9, 0], kB: [-6, kneeY], fB: [-9, 0], lean: 3 });
    case 'defend': return P({ head: [1, headY - 6], neck: [1, neckY - 6], hip: [-1, hipY - 6], sF: [2, shY - 6], eF: [8, shY - 8], hF: [12, shY - 4], sB: [0, shY - 6], eB: [-6, shY - 8], hB: [-10, shY - 3], kF: [6, kneeY - 2], fF: [8, 0], kB: [-6, kneeY - 2], fB: [-8, 0] });
    case 'shoot': return P({ sF: [1, shY], eF: [4, shY + H * 0.1], hF: [3, shY + H * 0.24], sB: [-1, shY], eB: [-2, shY + H * 0.1], hB: [1, shY + H * 0.22] });
    case 'block': return P({ sF: [1, shY], eF: [2, shY + H * 0.15], hF: [3, shY + H * 0.3], sB: [-1, shY], eB: [-1, shY + H * 0.15], hB: [-1, shY + H * 0.29], kF: [2, kneeY + 3], fF: [0, 2], kB: [-2, kneeY + 2], fB: [-4, 1] });
    case 'dunk': return P({ head: [2, headY], sF: [2, shY], eF: [6, shY + H * 0.14], hF: [9, shY + H * 0.26], eB: [-4, shY - H * 0.1], hB: [-7, shY - H * 0.18], kF: [5, kneeY + 6], fF: [1, 6], kB: [-3, kneeY - 1], fB: [-7, 1], lean: 3 });
    case 'layup': return P({ sF: [2, shY], eF: [5, shY + H * 0.13], hF: [7, shY + H * 0.27], eB: [-3, shY - H * 0.12], hB: [-4, shY - H * 0.25], kF: [6, kneeY + 8], fF: [3, 5], kB: [-1, kneeY], fB: [-3, 0], lean: 2 });
    case 'screen': return P({ sF: [2, shY], eF: [5, shY - H * 0.1], hF: [0, shY - H * 0.12], sB: [-2, shY], eB: [-5, shY - H * 0.1], hB: [1, shY - H * 0.13], kF: [5, kneeY], fF: [7, 0], kB: [-5, kneeY], fB: [-7, 0] });
    case 'charge': return P({ head: [-1, headY - 2], neck: [-1, neckY - 2], sF: [1, shY - 2], eF: [4, shY - H * 0.12], hF: [0, shY - H * 0.14], eB: [-4, shY - H * 0.12], hB: [0, shY - H * 0.15], kF: [4, kneeY], fF: [6, 0], kB: [-4, kneeY], fB: [-6, 0], lean: -2 });
    case 'stagger': return P({ head: [-5, headY - 2], neck: [-4, neckY - 2], hip: [-1, hipY], sF: [-3, shY - 2], eF: [3, shY + 2], hF: [7, shY + 6], sB: [-5, shY - 2], eB: [-10, shY], hB: [-13, shY + 4], kF: [3, kneeY], fF: [6, 0], kB: [-3, kneeY + 2], fB: [-2, 0], lean: -4 });
    case 'fallen': return P({ head: [-26, 5], neck: [-21, 5], hip: [0, 5], sF: [-19, 7], eF: [-14, 13], hF: [-9, 9], sB: [-19, 5], eB: [-24, 10], hB: [-28, 4], kF: [8, 10], fF: [16, 3], kB: [8, 5], fB: [17, 2] });
    case 'pass': return P({ sF: [2, shY], eF: [8, shY - 2], hF: [14, shY - 2], sB: [0, shY], eB: [6, shY - 3], hB: [12, shY - 4], kF: [4, kneeY], fF: [6, 0], kB: [-3, kneeY], fB: [-5, 0], lean: 2 });
    case 'swipe': return P({ head: [3, headY - 6], neck: [3, neckY - 6], hip: [0, hipY - 6], sF: [4, shY - 6], eF: [10, shY - 14], hF: [16, shY - 20], kF: [7, kneeY - 2], fF: [10, 0], kB: [-5, kneeY - 1], fB: [-8, 0], lean: 4 });
  }
}

export interface Palette { skin: string; skinShade: string; hair: string; jersey: string; jerseyShade: string; trim: string; shorts: string; shoe: string; sock: string }

export const SKINS: [string, string][] = [['#f3c9a2', '#d9a77e'], ['#d9a066', '#b98048'], ['#a86b3c', '#8a5228'], ['#7a4a26', '#5e3519'], ['#4e2f1a', '#3a2010']];

export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) * f));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) * f));
  const b = Math.max(0, Math.min(255, (n & 255) * f));
  return '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);
}

function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number) {
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

/** Draw one frame into ctx at frame offset ox. H = figure height in px. */
export function drawFrame(ctx: CanvasRenderingContext2D, ox: number, name: FrameName, H: number, pal: Palette, number: number) {
  const p = pose(name, H);
  const cx = ox + FRAME_W / 2 - 2;
  const fy = FRAME_H - 2;
  const lean = p.lean ?? 0;
  const X = (j: J, upper = false) => cx + j[0] + (upper ? lean * (j[1] / H) : 0);
  const Y = (j: J) => fy - j[1];
  const limb = (a: J, b: J, c: J, color: string, w1: number, w2: number, upper: boolean) => {
    ctx.fillStyle = color;
    line(ctx, X(a, upper), Y(a), X(b, upper), Y(b), w1);
    line(ctx, X(b, upper), Y(b), X(c, upper), Y(c), w2);
  };
  // back leg (shaded) + shoe
  limb(p.hip, p.kB, p.fB, pal.skinShade, 4, 3, false);
  ctx.fillStyle = pal.sock; ctx.fillRect(X(p.fB) - 1, Y(p.fB) - 4, 3, 2);
  ctx.fillStyle = shade(pal.shoe, 0.7); ctx.fillRect(X(p.fB) - 2, Y(p.fB) - 2, 6, 3);
  // back arm
  limb(p.sB, p.eB, p.hB, pal.skinShade, 3, 3, true);
  // shorts
  ctx.fillStyle = pal.shorts;
  const hx = X(p.hip, true), hy = Y(p.hip);
  ctx.fillRect(hx - 5, hy - 3, 11, 8);
  ctx.fillRect(X(p.kB) - 2, hy + 3, 4, Math.max(2, (Y(p.kB) - hy) * 0.55));
  // torso (jersey)
  const sx = X(p.sF, true), sy = Y(p.sF);
  ctx.fillStyle = pal.jersey;
  const top = Math.min(sy, Y(p.sB)) - 1;
  const left = Math.min(hx, sx) - 4;
  const right = Math.max(hx, sx) + 4;
  for (let y = top; y <= hy; y++) {
    const t = (y - top) / Math.max(1, hy - top);
    const cxr = sx + (hx - sx) * t;
    ctx.fillRect(Math.round(cxr - 4.5), y, 9, 1);
  }
  ctx.fillStyle = pal.jerseyShade;
  for (let y = top; y <= hy; y++) { const t = (y - top) / Math.max(1, hy - top); ctx.fillRect(Math.round(sx + (hx - sx) * t - 4.5), y, 2, 1); }
  ctx.fillStyle = pal.trim; ctx.fillRect(Math.round(sx - 2), top, 5, 1); ctx.fillRect(hx - 5, hy - 3, 11, 1);
  // number
  ctx.fillStyle = pal.trim;
  drawDigits(ctx, Math.round((sx + hx) / 2) - 2, Math.round(top + (hy - top) * 0.35), number);
  void left; void right;
  // front leg
  ctx.fillStyle = pal.shorts; ctx.fillRect(X(p.kF) - 2 + Math.round((hx - X(p.kF)) * 0.4), hy + 3, 5, Math.max(2, (Y(p.kF) - hy) * 0.55));
  limb(p.hip, p.kF, p.fF, pal.skin, 4, 3, false);
  ctx.fillStyle = pal.sock; ctx.fillRect(X(p.fF) - 1, Y(p.fF) - 4, 3, 2);
  ctx.fillStyle = pal.shoe; ctx.fillRect(X(p.fF) - 2, Y(p.fF) - 2, 6, 3);
  // neck + head
  ctx.fillStyle = pal.skin;
  line(ctx, X(p.neck, true), Y(p.neck), X(p.sF, true) - 1, Y(p.sF), 3);
  const hdx = Math.round(X(p.head, true)), hdy = Math.round(Y(p.head));
  ctx.fillRect(hdx - 3, hdy - 4, 7, 8);
  ctx.fillStyle = pal.skinShade; ctx.fillRect(hdx - 3, hdy + 2, 7, 2);
  ctx.fillStyle = pal.hair; ctx.fillRect(hdx - 3, hdy - 5, 7, 3); ctx.fillRect(hdx - 3, hdy - 3, 2, 3);
  ctx.fillStyle = '#111'; ctx.fillRect(hdx + 2, hdy - 1, 1, 1); // eye (facing right)
  // front arm on top
  limb(p.sF, p.eF, p.hF, pal.skin, 3, 3, true);
  ctx.fillStyle = pal.jersey; ctx.fillRect(X(p.sF, true) - 1, Y(p.sF) - 1, 3, 3);
}

const DIG: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '011', '001', '111'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'], '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111'],
};
function drawDigits(ctx: CanvasRenderingContext2D, x: number, y: number, n: number) {
  const s = String(n % 100);
  const w = s.length * 4 - 1;
  let ox = x - (w - 3) / 2;
  for (const ch of s) {
    const g = DIG[ch];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r][c] === '1') ctx.fillRect(Math.round(ox + c), y + r, 1, 1);
    ox += 4;
  }
}

/** Build a horizontal strip canvas with every frame. */
export function buildSheet(heightFt: number, pal: Palette, number: number): HTMLCanvasElement {
  const H = Math.round(heightFt * 9.2);
  const c = document.createElement('canvas');
  c.width = FRAME_W * FRAMES.length; c.height = FRAME_H;
  const ctx = c.getContext('2d')!;
  FRAMES.forEach((f, i) => drawFrame(ctx, i * FRAME_W, f, H, pal, number));
  return c;
}

export function teamPalette(colors: string[], skin: number, hairDark = true): Palette {
  const [primary, secondary] = colors;
  const [s, ss] = SKINS[skin % SKINS.length];
  return { skin: s, skinShade: ss, hair: hairDark ? '#1b1410' : '#3b2a1a', jersey: primary, jerseyShade: shade(primary, 0.75), trim: secondary, shorts: shade(primary, 0.9), shoe: '#f4f4f4', sock: '#ffffff' };
}
