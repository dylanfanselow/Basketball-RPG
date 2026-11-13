import Phaser from 'phaser';
import { canvas, hn, mix, text3, textW } from './roomArt';

/**
 * Round 80: the bus ride to the national final (the owner's reference: a pixel-art school bus side-on on a road
 * through pines). Side view, **front to the right** (door and driver's window at the right end, travelling right),
 * as in the reference. Winter: snow on the roof, the verges and the pines, an overcast sky. Everything is drawn on a
 * small pixel canvas and scaled up nearest (`BUS_ART` scene units per art px).
 */
export const BUS_ART = 3;
/** The view in art px (1280×720 scene units / BUS_ART). */
export const VW = Math.ceil(1280 / BUS_ART), VH = 240;
/** Rows (art px): the horizon, the road's far edge, the centre line, the near edge. */
export const ROWS = { horizon: 118, roadTop: 142, centre: 169, roadBot: 196 };
/** The bus picture (art px) and where its wheels' centres are on it. */
export const BUS_W = 196, BUS_H = 84, WHEELS = [36, 158], WHEEL_Y = 72, WHEEL_R = 11;

type C = CanvasRenderingContext2D;
const P = (c: C, x: number, y: number, col: string) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), 1, 1); };
const R = (c: C, x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const SNOW = ['#f6f9fd', '#e8eef5', '#d6dfea', '#bfcbdb', '#a7b5c9'];

function add(tm: Phaser.Textures.TextureManager, key: string, cv: HTMLCanvasElement, frames = 1, fw = cv.width) {
  if (tm.exists(key)) return key;
  const tex = tm.addCanvas(key, cv)!;
  for (let f = 0; f < frames; f++) tex.add(f, 0, f * fw, 0, fw, cv.height);
  return key;
}

/** A snowy pine: dark green tiers with snow loads on top of each, a short trunk. */
function pine(c: C, cx: number, base: number, h: number, dark: string, light: string, seed: number, snowK = 1) {
  const tiers = Math.max(3, Math.round(h / 9));
  R(c, cx - 1, base - Math.round(h * 0.16), 3, Math.round(h * 0.16), '#4a3426');
  for (let t = 0; t < tiers; t++) {
    const top = base - h + Math.round((t / tiers) * h * 0.82), bot = top + Math.round(h / tiers * 1.5);
    const w0 = 2 + Math.round((t + 1) / tiers * h * 0.36);
    for (let y = top; y < bot; y++) {
      const k = (y - top) / (bot - top), half = Math.round(1 + k * w0);
      for (let x = cx - half; x <= cx + half; x++) {
        const edge = Math.abs(x - cx) > half - 2 && hn(x, y, seed) < 0.35;
        if (edge && y > top + 1) continue;
        const left = x < cx - half * 0.2;
        let col = left ? light : dark;
        // snow sits on the top of each tier and in clumps on the branches
        if ((k < 0.28 * snowK && hn(x >> 1, y, seed + 1) < 0.85) || hn(x >> 1, y >> 1, seed + 2) < 0.12 * snowK) col = left ? SNOW[0] : SNOW[2];
        P(c, x, y, col);
      }
    }
  }
}

/** The overcast sky (one screen, it doesn't scroll). */
function drawSky(): HTMLCanvasElement {
  const cv = canvas(VW, ROWS.horizon + 4), c = cv.getContext('2d')!;
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < VW; x++) {
    const band = Math.sin(y / 9 + Math.sin(x / 70) * 1.6) * 0.5 + 0.5;
    P(c, x, y, mix(mix('#8f9aaa', '#d5dbe3', y / ROWS.horizon), '#b9c1cc', band * 0.3 + (hn(x >> 3, y >> 2, 1) < 0.08 ? 0.15 : 0)));
  }
  return cv;
}

/** Far hills with a pale pine line (tiles horizontally). */
function drawFar(): HTMLCanvasElement {
  const W = 480, cv = canvas(W, ROWS.horizon + 6), c = cv.getContext('2d')!;
  for (let x = 0; x < W; x++) {
    const hill = Math.round(ROWS.horizon - 16 - Math.sin(x / W * Math.PI * 4) * 6 - Math.sin(x / W * Math.PI * 10 + 1) * 3);
    for (let y = hill; y < cv.height; y++) P(c, x, y, y - hill < 2 ? SNOW[1] : mix('#c8d2de', '#a9b6c6', (y - hill) / 22));
  }
  for (let i = 0; i < 46; i++) {
    const x = Math.round((i / 46) * W + hn(i, 1, 3) * 8), h = 14 + Math.round(hn(i, 2, 3) * 12);
    const base = ROWS.horizon + 2 - Math.round(hn(i, 3, 3) * 4);
    for (const dx of [0, W]) pine(c, x - dx, base, h, '#7f8f9c', '#97a6b3', 40 + i, 1.3);
  }
  return cv;
}

/** Near pines along the far verge, snow-loaded, with the snowbank in front (tiles horizontally). */
function drawNear(): HTMLCanvasElement {
  const W = 560, cv = canvas(W, ROWS.roadTop + 2), c = cv.getContext('2d')!;
  const trees: [number, number][] = [];
  for (let i = 0; i < 17; i++) trees.push([Math.round((i / 17) * W + hn(i, 1, 5) * 14), 40 + Math.round(hn(i, 2, 5) * 30)]);
  for (const [x, h] of trees) for (const dx of [0, W, -W]) pine(c, x + dx, ROWS.roadTop - 10 + Math.round(hn(x, 1, 6) * 4), h, '#284434', '#3b5e46', x, 1);
  // the snowbank along the road
  for (let x = 0; x < W; x++) {
    const top = ROWS.roadTop - 14 + Math.round(Math.sin(x / 23) * 2 + Math.sin(x / 7 + 2) * 1 + hn(x >> 2, 0, 7) * 2);
    for (let y = top; y < ROWS.roadTop + 2; y++) P(c, x, y, y - top < 2 ? SNOW[0] : y > ROWS.roadTop - 2 ? '#9aa6b4' : SNOW[Math.min(3, 1 + Math.floor((y - top) / 4))]);
  }
  for (let i = 0; i < 9; i++) { const x = Math.round(hn(i, 1, 8) * W); R(c, x, ROWS.roadTop - 22, 2, 14, '#5b4a3a'); R(c, x, ROWS.roadTop - 23, 2, 2, SNOW[0]); } // marker posts
  return cv;
}

/** The road: wet grey asphalt, slush at the edges, white edge lines, the dashed centre line (tiles horizontally). */
function drawRoad(): HTMLCanvasElement {
  const W = 52, H = ROWS.roadBot - ROWS.roadTop + 2, cv = canvas(W, H), c = cv.getContext('2d')!;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const row = y + ROWS.roadTop;
    let col = hn(x, y, 11) < 0.1 ? '#737880' : hn(x >> 1, y, 12) < 0.06 ? '#5f646b' : '#6a6f77';
    if (row < ROWS.roadTop + 4 || row > ROWS.roadBot - 4) col = hn(x, y, 13) < 0.5 ? '#aeb6c0' : '#c3cad3'; // slush
    if (row === ROWS.roadTop + 4 || row === ROWS.roadBot - 5) col = '#e9eef3';
    if ((row === ROWS.centre || row === ROWS.centre + 1) && x < 26) col = '#e8e2c8';
    P(c, x, y, col);
  }
  return cv;
}

/** The near verge: a snowbank below the road with a few fence posts (fast foreground, tiles horizontally). */
function drawVerge(): HTMLCanvasElement {
  const W = 320, H = VH - ROWS.roadBot + 2, cv = canvas(W, H), c = cv.getContext('2d')!;
  for (let x = 0; x < W; x++) {
    const top = 2 + Math.round(Math.sin(x / 31) * 2 + hn(x >> 2, 1, 14) * 2);
    for (let y = top; y < H; y++) P(c, x, y, y - top < 2 ? '#a3adbb' : SNOW[Math.min(4, Math.floor((y - top) / 9) % 3)]);
  }
  for (let i = 0; i < 4; i++) {
    const x = 20 + i * 80;
    R(c, x, 4, 4, 30, '#6b5440'); R(c, x + 3, 4, 1, 30, '#4e3c2c'); R(c, x - 1, 2, 6, 3, SNOW[0]);
    R(c, x + 4, 12, 76, 2, '#5c4836'); R(c, x + 4, 11, 76, 1, SNOW[1]);
  }
  return cv;
}

/** A wheel (4 frames turning): black tyre, a silver hub with lug nuts, a little snow on the tread. */
function drawWheel(): HTMLCanvasElement {
  const D = WHEEL_R * 2 + 2, cv = canvas(D * 4, D), c = cv.getContext('2d')!;
  for (let f = 0; f < 4; f++) {
    const ox = f * D, cx = ox + D / 2, cy = D / 2;
    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
      const d = Math.hypot(x + 0.5 - D / 2, y + 0.5 - D / 2);
      if (d > WHEEL_R) continue;
      let col = d > WHEEL_R - 1.2 ? '#101010' : d > WHEEL_R - 4 ? '#222222' : d > 4.6 ? '#c9ccd0' : '#8d9298';
      if (d > WHEEL_R - 4 && d < WHEEL_R - 1.2 && hn(x, y, 20 + f) < 0.06) col = '#d8dee6'; // slush in the tread
      if (d <= 4.6 && d > 3.4) col = '#e6e8eb';
      P(c, ox + x, y, col);
    }
    for (let k = 0; k < 5; k++) { const a = f * (Math.PI / 10) + k * (Math.PI * 2 / 5); P(c, cx + Math.cos(a) * 5.8 - 0.5, cy + Math.sin(a) * 5.8 - 0.5, '#4a4e54'); }
    R(c, cx - 1, cy - 1, 2, 2, '#4a4e54');
  }
  return cv;
}

/** The bus, side-on, front to the right. Frame 0 / 1: the head silhouettes shift a little (they talk, they laugh). */
function drawBus(): HTMLCanvasElement {
  const cv = canvas(BUS_W * 2, BUS_H), c = cv.getContext('2d')!;
  const AMBER = '#e2a225', AMBER_D = '#b97e18', AMBER_L = '#f2c048', OUT = '#3a2a10';
  for (let f = 0; f < 2; f++) {
    const o = f * BUS_W;
    const top = 8, bot = 68, x0 = 2, x1 = BUS_W - 3;
    const inside = (x: number, y: number) => {
      const rr = (cx: number, cy: number, r: number) => Math.hypot(x - cx, y - cy) <= r;
      if (x < x0 + 8 && y < top + 8) return rr(x0 + 8, top + 8, 8);
      if (x > x1 - 12 && y < top + 12) return rr(x1 - 12, top + 12, 12); // the rounder front
      return x >= x0 && x <= x1 && y >= top && y <= bot;
    };
    for (let y = top - 1; y <= bot + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
      if (!inside(x, y)) { if (inside(x + 1, y) || inside(x - 1, y) || inside(x, y + 1) || inside(x, y - 1)) P(c, o + x, y, OUT); continue; }
      let col = AMBER;
      if (y < top + 9) col = (y - top) % 3 === 2 ? AMBER_D : AMBER_L;           // the roof's ribs
      if (y > bot - 12) col = AMBER_D;                                         // shade toward the bottom
      if (y === top + 9) col = OUT;                                            // the rain rail
      P(c, o + x, y, col);
    }
    // snow on the roof, piled a bit higher toward the back, a few drips over the edge
    for (let x = x0 + 2; x < x1 - 4; x++) {
      const yTop = (() => { for (let y = top - 1; y < top + 14; y++) if (inside(x, y)) return y; return top; })();
      const h = 3 + (x < BUS_W * 0.6 ? 1 : 0) + (hn(x >> 2, 1, 30) < 0.3 ? 1 : 0);
      for (let k = 0; k < h; k++) P(c, o + x, yTop - h + 2 + k, k === 0 ? SNOW[0] : k === h - 1 ? SNOW[3] : SNOW[1]);
      if (hn(x, 2, 31) < 0.06) R(c, o + x, yTop + 2, 1, 2 + Math.round(hn(x, 3, 32) * 2), SNOW[1]);
    }
    // passenger windows (rear to the door) with people inside: dark silhouettes against the cabin, no faces
    const winY = top + 13, winH = 15;
    for (let i = 0; i < 7; i++) {
      const wx = x0 + 10 + i * 20;
      R(c, o + wx - 1, winY - 1, 18, winH + 2, OUT);
      for (let y = 0; y < winH; y++) for (let x = 0; x < 16; x++) P(c, o + wx + x, winY + y, (x + y) % 11 < 2 && y < 9 ? '#9db6c9' : y < 4 ? '#6f8ea6' : '#5d7a93');
      R(c, o + wx, winY + 7, 16, 1, '#3e4c58'); // the sash
      // a head and shoulders in most windows (frame 1 nudges a few: laughing, turning)
      if (hn(i, 5, 33) < 0.85) {
        const hx = wx + 5 + Math.round(hn(i, 6, 34) * 5) + (f && i % 2 ? 1 : 0), hy = winY + 4 - (f && i % 3 === 0 ? 1 : 0);
        for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) if (Math.hypot(x - 2.5, y - 2.5) < 3.1) P(c, o + hx + x, hy + y, '#232a33');
        R(c, o + hx - 2, hy + 6, 10, winH - 10, '#232a33');
        if (i === 2 || i === 5) R(c, o + hx - 1, hy - 1, 8, 2, '#232a33'); // a beanie
      }
      // frost in the bottom corners
      for (let k = 0; k < 4; k++) { P(c, o + wx + k, winY + winH - 1, '#e8eef5'); P(c, o + wx + 15 - k, winY + winH - 1, '#e8eef5'); }
      P(c, o + wx, winY + winH - 2, '#e8eef5'); P(c, o + wx + 15, winY + winH - 2, '#e8eef5');
    }
    // the door (two narrow glass panels) and the driver's big window at the front
    const dx = x0 + 152;
    R(c, o + dx - 1, winY - 1, 16, 47, OUT);
    for (const px of [dx, dx + 7]) { R(c, o + px, winY, 6, 45, AMBER_D); R(c, o + px + 1, winY + 1, 4, 20, '#6f8ea6'); R(c, o + px + 1, winY + 23, 4, 18, '#5d7a93'); }
    R(c, o + dx + 6, winY, 1, 45, OUT);
    R(c, o + dx + 16, winY - 1, 22, winH + 4, OUT);
    for (let y = 0; y < winH + 2; y++) for (let x = 0; x < 20; x++) P(c, o + dx + 17 + x, winY + y, (x - y + 30) % 13 < 2 ? '#a7bfd1' : '#6f8ea6');
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) if (Math.hypot(x - 2.5, y - 2.5) < 3.1) P(c, o + dx + 22 + x, winY + 5 + y, '#232a33'); // the driver
    R(c, o + dx + 20, winY + 11, 10, 6, '#232a33');
    // black trim lines, the name, the white stripe low on the side
    R(c, o + x0 + 1, winY + winH + 3, 148, 1, OUT);
    text3(c, o + x0 + 8 + Math.round((140 - textW('RIDGEMONT ACADEMY')) / 2), winY + winH + 7, 'RIDGEMONT ACADEMY', '#1b1408'); // round 80i
    R(c, o + x0 + 1, bot - 13, x1 - x0 - 2, 4, '#f4f0e4'); R(c, o + x0 + 1, bot - 9, x1 - x0 - 2, 1, '#cfc8b4');
    // the engine grille and headlight at the front, the stop arm folded, a red tail light at the back
    for (let y = 0; y < 12; y++) R(c, o + x1 - 12, winY + winH + 6 + y, 10, 1, y % 2 ? '#8a6a1a' : '#c79a3a');
    R(c, o + x1 - 3, bot - 14, 3, 5, '#fff6c8'); R(c, o + x1 - 2, bot - 13, 2, 3, '#ffffff');
    R(c, o + dx - 6, winY + 10, 4, 8, '#c4302a'); R(c, o + dx - 6, winY + 13, 4, 1, '#ffffff');
    R(c, o + x0, bot - 20, 3, 6, '#c4302a');
    // bumpers, slush sprayed up the lower body, the wheel arches
    R(c, o + x0 - 1, bot - 2, 6, 5, '#1c1c1c'); R(c, o + x1 - 5, bot - 2, 7, 5, '#1c1c1c');
    for (let x = x0; x < x1; x++) for (let y = bot - 8; y <= bot; y++) if (hn(x, y, 40) < 0.05) P(c, o + x, y, hn(x, y, 41) < 0.5 ? '#d9dee4' : '#a9b1bb');
    for (const wx of WHEELS) for (let y = 0; y < 16; y++) for (let x = -15; x <= 15; x++) {
      const d = Math.hypot(x, y - 14);
      if (d < 14.5 && WHEEL_Y - 14 + y <= bot + 1) P(c, o + wx + x, WHEEL_Y - 14 + y, d > 13.2 ? OUT : '#1a1a1a');
    }
    R(c, o + x0 - 1, bot + 1, 6, 2, '#2a2a2a'); // the exhaust pipe out the back
  }
  return cv;
}

export interface BusTextures { sky: string; far: string; near: string; road: string; verge: string; bus: string; wheel: string }

/** Every bus-ride texture (cached across visits). */
export function buildBusArt(tm: Phaser.Textures.TextureManager): BusTextures {
  return {
    sky: add(tm, 'bus_sky_v1', drawSky()),
    far: add(tm, 'bus_far_v1', drawFar()),
    near: add(tm, 'bus_near_v1', drawNear()),
    road: add(tm, 'bus_road_v1', drawRoad()),
    verge: add(tm, 'bus_verge_v1', drawVerge()),
    bus: add(tm, 'bus_body_v3', drawBus(), 2, BUS_W),
    wheel: add(tm, 'bus_wheel_v1', drawWheel(), 4, WHEEL_R * 2 + 2),
  };
}
