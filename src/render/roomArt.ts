import Phaser from 'phaser';
import { FURNITURE, Piece, ROOM, RS, RD, wallL, wallR, DOORS, footprint, CALENDAR } from '../world/apartment';
import { shade, tint } from './sprites';

/**
 * The starter apartment, drawn in code as pixel art on the players' pixel grid (1 art px = 2 device px, like the
 * sprites): warm, cluttered and cozy like the owner's reference room, shaded with our sprite recipe (3-4 tone ramps,
 * light from the top left, dark coloured outlines, contact shadows) so the player sprite fits in.
 *
 * Art coordinates: the 1280x720 scene is 960x540 art px (AS = 0.75 art px per scene unit).
 */
export const AS = 0.75;
export const ART_W = 960, ART_H = 540;
const HF = RS * AS; // art px per foot of height (16.5)
const AX = (x: number) => (ROOM.ox + x * RS) * AS;
const AY = (y: number) => (ROOM.oy + y * RD) * AS;
/** Room depth (feet) of an art row. */
const yOfRow = (row: number) => (row / AS - ROOM.oy) / RD;

type C = CanvasRenderingContext2D;
const BEAM_TOP = 76, WALL_TOP = 93, FLOOR_ROW = Math.round(AY(0)); // 289
const POST_L: [number, number] = [105, 129];
const POST_R: [number, number] = [Math.round(AX(wallR(ROOM.depth))), Math.round(AX(wallR(ROOM.depth))) + 24];

function canvas(w: number, h: number): HTMLCanvasElement { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const R = (c: C, x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const P = (c: C, x: number, y: number, col: string) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), 1, 1); };
/** Deterministic pixel noise in [0, 1). */
const hn = (x: number, y: number, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const mix = (a: string, b: string, t: number) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
};
const OL = (col: string) => shade(col, 0.42); // our sprites outline in a dark version of the fill

/** A shaded box in the room's 3/4 view: top face + front face, outlined. Feet in, art px out. */
function block(c: C, x0f: number, x1f: number, ybf: number, yff: number, hft: number, base: string, o: { top?: string; outline?: string; noTop?: boolean } = {}) {
  const x0 = Math.round(AX(x0f)), x1 = Math.round(AX(x1f)), yb = Math.round(AY(ybf)), yf = Math.round(AY(yff)), H = Math.round(hft * HF);
  return box(c, x0, x1, yb, yf, H, base, o);
}
function box(c: C, x0: number, x1: number, yb: number, yf: number, H: number, base: string, o: { top?: string; outline?: string; noTop?: boolean } = {}) {
  const top = o.top ?? tint(base, 0.22), ol = o.outline ?? OL(base);
  const ty = o.noTop ? yf - H : yb - H;
  R(c, x0 - 1, ty - 1, x1 - x0 + 2, yf - ty + 2, ol);
  if (!o.noTop) { R(c, x0, yb - H, x1 - x0, yf - yb, top); R(c, x0, yb - H, x1 - x0, 1, tint(top, 0.25)); }
  R(c, x0, yf - H, x1 - x0, H, base);
  R(c, x0, yf - H, x1 - x0, 1, tint(base, 0.3));                 // lit front edge
  R(c, x0, yf - H + 1, 1, H - 1, tint(base, 0.15));               // light from the left
  R(c, x1 - 1, yf - H + 1, 1, H - 1, shade(base, 0.82));          // shade on the right
  R(c, x0, yf - Math.min(3, H), x1 - x0, Math.min(3, H), shade(base, 0.78)); // occlusion at the floor
  return { x0, x1, yb, yf, H, faceTop: yf - H, top: yb - H };
}

// ---------------------------------------------------------------- background
const PAL = {
  attic: '#5b3b29', atticSeam: '#3f281a', beam: '#86593a',
  brick: ['#8a4230', '#7d3a2a', '#96503a', '#843f2e'], mortar: '#5a2b20',
  kitchenWall: '#cbc5b5', livingWall: '#dcc79a', leftWall: '#b9ad96', rightWall: '#d3bc8d', base: '#8b6b4f',
  floor: ['#8f7f6f', '#877766', '#958470', '#8b7b6a', '#837360'], seam: '#5f5145',
  siding: '#c3cdd0', sidingLine: '#a3afb3', roof: ['#59616a', '#4c535b', '#636c75'],
  grass: ['#5f9a3a', '#6fae44', '#558c33', '#4f8530'], sky: '#c4e2ee',
  leaf: ['#4f8a2f', '#66a63a', '#3d6e25', '#77b847'], trunk: '#6a4a2e',
};

function drawExteriorLeft(c: C) {
  // neighbour's roof (gray tiles), gutter, clapboard siding, garage door, driveway
  for (let y = 0; y < 84; y++) for (let x = 0; x < POST_L[0]; x++) {
    const row = Math.floor(y / 7), off = (row % 2) * 6, tx = (x + off) % 12, ty = y % 7;
    let col = PAL.roof[(Math.floor((x + off) / 12) + row) % 3];
    if (ty === 6 || tx === 0) col = '#3a4046'; else if (ty === 0) col = tint(col, 0.15);
    P(c, x, y, col);
  }
  R(c, 0, 84, POST_L[0], 5, '#e0e4e5'); R(c, 0, 89, POST_L[0], 2, '#9aa5a9');
  for (let y = 91; y < 470; y++) for (let x = 0; x < POST_L[0]; x++) {
    const ty = (y - 91) % 8;
    P(c, x, y, ty === 7 ? PAL.sidingLine : ty === 0 ? tint(PAL.siding, 0.25) : hn(x, y) < 0.04 ? shade(PAL.siding, 0.95) : PAL.siding);
  }
  // garage door (the future garage), cut off by the screen edge
  const gx0 = 0, gx1 = 92, gy0 = 230, gy1 = 470;
  R(c, gx0, gy0 - 5, gx1 - gx0 + 5, 5, '#8f9a9d'); R(c, gx1, gy0 - 5, 5, gy1 - gy0 + 5, '#8f9a9d');
  for (let s = 0; s < 6; s++) {
    const y0 = gy0 + s * 40;
    R(c, gx0, y0, gx1 - gx0, 40, '#d8dcdc'); R(c, gx0, y0 + 39, gx1 - gx0, 1, '#a9b1b3'); R(c, gx0, y0, gx1 - gx0, 1, '#eef0f0');
    for (const px of [6, 50]) { R(c, px, y0 + 7, 36, 26, '#c9cecf'); R(c, px, y0 + 7, 36, 1, '#aeb6b8'); R(c, px, y0 + 7, 1, 26, '#aeb6b8'); R(c, px, y0 + 32, 36, 1, '#eef0f0'); R(c, px + 35, y0 + 7, 1, 26, '#eef0f0'); }
  }
  R(c, 0, 470, POST_L[0], 70, '#a5a7a2');
  for (let y = 470; y < 540; y++) for (let x = 0; x < POST_L[0]; x++) if (hn(x, y, 3) < 0.08) P(c, x, y, '#979994');
  R(c, 0, 470, POST_L[0], 2, '#8d8f8a');
  for (let y = 470; y < 540; y++) for (let x = 92; x < POST_L[0]; x++) P(c, x, y, PAL.grass[Math.floor(hn(x, y, 5) * 4)]);
}

function drawExteriorRight(c: C) {
  const x0 = POST_R[1];
  R(c, x0, 0, ART_W - x0, 290, PAL.sky);
  // picket fence
  for (let x = x0; x < ART_W; x++) {
    const k = (x - x0) % 9;
    if (k < 6) { const tip = k === 2 || k === 3 ? 222 : k === 1 || k === 4 ? 223 : 225; R(c, x, tip, 1, 300 - tip, k === 0 ? '#c9c4b9' : k === 5 ? '#d6d1c6' : '#ece8df'); }
  }
  R(c, x0, 240, ART_W - x0, 3, '#d6d1c6'); R(c, x0, 276, ART_W - x0, 3, '#d6d1c6');
  // grass + sandy path
  for (let y = 290; y < ART_H; y++) for (let x = x0; x < ART_W; x++) {
    let col = PAL.grass[Math.floor(hn(x, y, 7) * 4)];
    if (y > 352 && y < 372 && x > x0 + 20) col = hn(x, y, 8) < 0.15 ? '#b8935a' : '#caa66b';
    P(c, x, y, col);
  }
  // tree: trunk + big leafy canopy (clusters with light on the top-left)
  R(c, 905, 150, 22, 160, PAL.trunk); R(c, 905, 150, 4, 160, '#82603e'); R(c, 923, 150, 4, 160, '#523720');
  for (let y = 160; y < 310; y += 7) R(c, 910 + (y % 3) * 3, y, 1, 4, '#523720');
  R(c, 895, 306, 44, 4, '#4a2f1b');
  const blobs: [number, number, number][] = [[915, 60, 52], [880, 95, 34], [948, 100, 36], [900, 140, 34], [940, 150, 30], [915, 25, 34], [960, 50, 30]];
  for (const [bx, by, r] of blobs) for (let y = by - r; y < by + r; y++) for (let x = Math.max(x0, bx - r); x < Math.min(ART_W, bx + r); x++) {
    const d = Math.hypot(x - bx, (y - by) * 1.1) / r;
    if (d > 1 - hn(x, y, 9) * 0.12) continue;
    const lit = (x - bx) + (y - by) < -r * 0.3, dark = (x - bx) + (y - by) > r * 0.5;
    const n = hn(x >> 2, y >> 2, 11);
    P(c, x, y, dark ? PAL.leaf[2] : lit ? (n < 0.4 ? PAL.leaf[3] : PAL.leaf[1]) : n < 0.25 ? PAL.leaf[1] : PAL.leaf[0]);
  }
  for (let y = 312; y < 330; y++) for (let x = 875; x < ART_W; x++) if (Math.hypot((x - 915) / 50, (y - 318) / 9) < 1) P(c, x, y, shade(PAL.grass[0], 0.75));
}

function drawPost(c: C, xa: number, xb: number) {
  for (let y = 0; y < ART_H; y++) for (let x = xa; x < xb; x++) {
    const row = Math.floor(y / 5), off = (row % 2) * 6, bx = (x - xa + off) % 12, by = y % 5;
    let col = PAL.brick[(Math.floor((x - xa + off) / 12) + row * 3) % 4];
    if (by === 4 || bx === 11) col = PAL.mortar; else if (by === 0) col = tint(col, 0.12);
    if (x === xa) col = tint(col, 0.15); if (x === xb - 1) col = shade(col, 0.75);
    P(c, x, y, col);
  }
}

/** Fill the strip of a side wall between two room depths and heights, column by column (the wall plane slants). */
function onWall(c: C, side: 'L' | 'R', y0f: number, y1f: number, h0: number, h1: number, paint: (x: number, y: number, u: number, v: number) => string | null) {
  const wx = side === 'L' ? wallL : wallR;
  const xa = Math.round(Math.min(AX(wx(y0f)), AX(wx(y1f)))), xb = Math.round(Math.max(AX(wx(y0f)), AX(wx(y1f))));
  for (let x = xa; x <= xb; x++) {
    const u = (x - AX(wx(y0f))) / (AX(wx(y1f)) - AX(wx(y0f))); // 0 at y0f, 1 at y1f
    const yf = y0f + (y1f - y0f) * u, floor = AY(yf);
    const top = Math.round(floor - h1 * HF), bot = Math.round(floor - h0 * HF);
    for (let y = top; y < bot; y++) { const col = paint(x, y, u, (bot - y) / (bot - top)); if (col) P(c, x, y, col); }
  }
}

function drawRoomShell(c: C) {
  // attic boards above the beam
  for (let y = 0; y < BEAM_TOP; y++) for (let x = POST_L[1]; x < POST_R[0]; x++) {
    const k = (x - POST_L[1]) % 11;
    P(c, x, y, k === 0 ? PAL.atticSeam : k === 1 ? tint(PAL.attic, 0.1) : hn(x, y, 2) < 0.05 ? shade(PAL.attic, 0.9) : PAL.attic);
  }
  // beam
  for (let y = BEAM_TOP; y < WALL_TOP; y++) for (let x = POST_L[0] - 4; x < POST_R[1] + 4; x++) {
    let col = PAL.beam;
    if (y === BEAM_TOP) col = '#a8784f'; else if (y >= WALL_TOP - 3) col = '#5c3b25'; else if (hn(x >> 3, y, 4) < 0.18) col = shade(PAL.beam, 0.9);
    P(c, x, y, col);
  }
  // back wall (kitchen part a cool gray-beige, living part warm), dithered plaster
  const kitchenEnd = Math.round(AX(19.4));
  const bx0 = Math.round(AX(ROOM.backL)), bx1 = Math.round(AX(ROOM.backR));
  for (let y = WALL_TOP; y < FLOOR_ROW; y++) for (let x = bx0; x < bx1; x++) {
    let col = x < kitchenEnd ? PAL.kitchenWall : PAL.livingWall;
    const n = hn(x, y, 1);
    if (n < 0.05) col = shade(col, 0.95); else if (n > 0.97) col = tint(col, 0.12);
    if (y < WALL_TOP + 8) col = shade(col, 0.82 + (y - WALL_TOP) * 0.02);
    if (x === kitchenEnd) col = shade(col, 0.9);
    P(c, x, y, col);
  }
  // side walls
  for (let y = WALL_TOP; y < ART_H; y++) {
    const yf = y < FLOOR_ROW ? 0 : yOfRow(y);
    const lx = y < FLOOR_ROW ? bx0 : AX(wallL(yf)), rx = y < FLOOR_ROW ? bx1 : AX(wallR(yf));
    for (let x = POST_L[1]; x < Math.round(lx); x++) {
      let col = PAL.leftWall; const n = hn(x, y, 12);
      if (n < 0.05) col = shade(col, 0.95);
      if (y < WALL_TOP + 8) col = shade(col, 0.85);
      if (x >= Math.round(lx) - 2) col = shade(col, 0.9);
      P(c, x, y, col);
    }
    for (let x = Math.round(rx); x < POST_R[0]; x++) {
      let col = PAL.rightWall; const n = hn(x, y, 13);
      if (n < 0.05) col = shade(col, 0.95); else if (n > 0.975) col = tint(col, 0.1);
      if (y < WALL_TOP + 8) col = shade(col, 0.85);
      if (x <= Math.round(rx) + 1) col = shade(col, 0.88);
      P(c, x, y, col);
    }
  }
  // floor: planks running toward the vanishing point, staggered end joints, grain, warm light pools
  const vx = 463, vy = -81, plank = 14;
  for (let y = FLOOR_ROW; y < ART_H; y++) {
    const yf = yOfRow(y), s = (FLOOR_ROW - vy) / (y - vy);
    const lx = Math.round(AX(wallL(yf))), rx = Math.round(AX(wallR(yf)));
    for (let x = lx; x < rx; x++) {
      const bxp = vx + (x - vx) * s - AX(ROOM.backL) + 400; // back-projected x on the back row
      const pi = Math.floor(bxp / plank), f = bxp / plank - pi;
      let col = PAL.floor[Math.floor(hn(pi, 0, 21) * PAL.floor.length)];
      const jointEvery = 5.5, jo = hn(pi, 1, 22) * jointEvery, seg = Math.floor((yf + jo) / jointEvery);
      col = mix(col, PAL.floor[Math.floor(hn(pi, seg, 23) * PAL.floor.length)], 0.5);
      const fy = ((yf + jo) / jointEvery) % 1;
      if (f < 0.07 * s * 2 && f * plank < 1.1 / s) col = PAL.seam;
      else if (fy < 0.012 * (y / FLOOR_ROW)) col = PAL.seam;
      else {
        const g = hn(Math.floor(f * 6), Math.floor(yf * 3) + pi * 7, 24);
        if (g < 0.12) col = shade(col, 0.93); else if (g > 0.93) col = tint(col, 0.08);
        if (f > 0.85) col = tint(col, 0.04);
      }
      // light: lamp pool, window light, darker at the edges and the front
      const lamp = Math.max(0, 1 - Math.hypot((x - AX(21.6)) / 120, (y - AY(1.2)) / 60));
      const win = Math.max(0, 1 - Math.hypot((x - AX(27.5)) / 110, (y - AY(3)) / 45));
      const edge = Math.min(1, (x - lx) / 40, (rx - x) / 40);
      col = mix(col, '#e8c27a', lamp * 0.28);
      col = mix(col, '#e9dcc0', win * 0.12);
      col = shade(col, 0.82 + 0.18 * Math.max(0, edge));
      P(c, x, y, col);
    }
    // baseboards along the slanted walls
    for (let k = 0; k < 2; k++) { P(c, lx - 1 - k, y - 4, PAL.base); P(c, rx + k, y - 4, PAL.base); }
  }
  // baseboard along the back wall + along the foot of the side walls (column-wise)
  R(c, bx0, FLOOR_ROW - 7, bx1 - bx0, 7, PAL.base); R(c, bx0, FLOOR_ROW - 7, bx1 - bx0, 1, '#a6866a'); R(c, bx0, FLOOR_ROW - 1, bx1 - bx0, 1, '#5f4532');
  onWall(c, 'L', 0, ROOM.depth + 1, 0, 0.42, (_x, _y, _u, v) => (v > 0.85 ? '#a6866a' : PAL.base));
  onWall(c, 'R', 0, ROOM.depth + 1, 0, 0.42, (_x, _y, _u, v) => (v > 0.85 ? '#a6866a' : PAL.base));
}

function drawWindow(c: C, x0: number, y0: number, w: number, h: number, blinds: number) {
  R(c, x0 - 4, y0 - 4, w + 8, h + 8, '#8f8a80');
  R(c, x0 - 3, y0 - 3, w + 6, h + 6, '#eeeae2'); R(c, x0 - 3, y0 + h, w + 6, 3, '#c9c4b8');
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const t = (y - y0) / h;
    let col = mix('#d9edf3', '#b9d8e0', t);
    // distant houses and a fence outside
    const roof = y0 + h * 0.58 + Math.round(Math.sin(x * 0.11) * 3) + ((x >> 4) % 2) * 5;
    if (y > roof) col = (x >> 3) % 3 === 0 ? '#c9b9a5' : '#d8d2c7';
    if (y > y0 + h * 0.8) col = (x - x0) % 5 === 0 ? '#bdb6aa' : '#e7e3da';
    if (y > y0 + h * 0.92) col = '#86b06a';
    if (y < y0 + h * blinds) col = (y - y0) % 4 === 3 ? '#cfc6b3' : '#f0eadb';
    // glare streak
    if ((x - x0) - (y - y0) * 0.6 > w * 0.15 && (x - x0) - (y - y0) * 0.6 < w * 0.15 + 3 && y > y0 + h * blinds) col = tint(col, 0.35);
    P(c, x, y, col);
  }
  R(c, x0 + Math.floor(w / 2) - 1, y0, 3, h, '#eeeae2'); R(c, x0, y0 + Math.floor(h / 2) - 1, w, 3, '#eeeae2');
  R(c, x0 + Math.floor(w / 2) + 1, y0, 1, h, '#c9c4b8');
  R(c, x0 - 6, y0 + h + 3, w + 12, 3, '#f4f1ea'); R(c, x0 - 6, y0 + h + 6, w + 12, 1, '#a9a396');
  if (blinds > 0) { R(c, x0 - 2, y0 - 2, w + 4, 3, '#e6decb'); R(c, x0 + w - 6, y0 + h * blinds, 1, 14, '#cfc6b3'); }
}

function drawWallDecor(c: C) {
  // kitchen window
  drawWindow(c, Math.round(AX(12.6)), 128, 50, 62, 0);
  // backsplash tiles behind the counter
  const sx0 = Math.round(AX(12.3)), sx1 = Math.round(AX(18.9)), sTop = Math.round(AY(0) - 3 * HF) - 26;
  for (let y = sTop; y < sTop + 26; y++) for (let x = sx0; x < sx1; x++) {
    P(c, x, y, (x - sx0) % 7 === 0 || (y - sTop) % 7 === 0 ? '#b6b2a6' : hn(x, y) < 0.1 ? '#e3e1da' : '#d9d7cf');
  }
  // living-room window with half-drawn blinds
  drawWindow(c, Math.round(AX(24.4)), 120, Math.round(AX(30.4) - AX(24.4)), 82, 0.28);
  // framed team photo on the back wall (where the calendar used to be)
  const fx = Math.round(AX(32.0)), fy = 150;
  P(c, fx + 13, fy - 4, '#4a4a4a');
  R(c, fx - 1, fy - 1, 28, 24, '#4a2f1c'); R(c, fx, fy, 26, 22, '#7a5232'); R(c, fx + 3, fy + 3, 20, 16, '#d8e6ea');
  R(c, fx + 3, fy + 13, 20, 6, '#c9874a'); for (let k = 0; k < 5; k++) { R(c, fx + 5 + k * 4, fy + 8, 2, 6, '#5a3a8a'); P(c, fx + 5 + k * 4, fy + 7, '#8a5a3a'); }
  // wall calendar on the left wall, next to the fridge (future: upcoming key games + special events)
  const K = CALENDAR;
  onWall(c, 'L', K.y0 - 0.12, K.y1 + 0.12, K.h0 - 0.08, K.h1 + 0.2, (_x, _y, u, v) => (u < 0.03 || u > 0.97 || v < 0.025 || v > 0.94 ? '#6e665a' : null));
  onWall(c, 'L', K.y0, K.y1, K.h0, K.h1, (_x, _y, u, v) => {
    const a = 1 - u; // 0 at the fridge end ... 1 toward the garage door (reads left to right on screen)
    if (v > 0.8) return v > 0.97 ? '#9b2f28' : Math.abs(a - 0.25) < 0.05 && v > 0.93 ? '#555555' : Math.abs(a - 0.75) < 0.05 && v > 0.93 ? '#555555' : '#c8433a';
    if (v > 0.74) return '#f6f3ea';
    const col = Math.floor(a * 5), row = Math.floor((0.74 - v) / 0.74 * 5);
    const cu = a * 5 - col, cv = ((0.74 - v) / 0.74) * 5 - row;
    if (cu < 0.18 || cv < 0.15) return '#f6f3ea';
    if ((row === 1 && col === 3) || (row === 3 && col === 1)) return cu > 0.35 && cu < 0.85 && cv > 0.3 && cv < 0.85 ? '#e07a2c' : '#e2ddd0';
    if (row === 0 && col < 2 && Math.abs(cu - cv) < 0.2) return '#8a8478';
    return '#e2ddd0';
  });
  // light switch + outlets
  R(c, Math.round(AX(20.2)), 196, 5, 8, '#f1eee6'); P(c, Math.round(AX(20.2)) + 2, 199, '#9a958a'); P(c, Math.round(AX(20.2)) + 2, 200, '#9a958a');
  for (const ox of [21.0, 31.0]) { R(c, Math.round(AX(ox)), FLOOR_ROW - 16, 5, 6, '#f1eee6'); P(c, Math.round(AX(ox)) + 1, FLOOR_ROW - 14, '#8a8478'); P(c, Math.round(AX(ox)) + 3, FLOOR_ROW - 14, '#8a8478'); }
  // original poster on the right wall: a dunker silhouette on a sunset ball
  onWall(c, 'R', 1.0, 3.4, 4.9, 8.4, (x, y, u, v) => {
    if (u < 0.05 || u > 0.95 || v < 0.04 || v > 0.96) return '#2b1d3d';
    const dx = (u - 0.5) * 2, dy = (v - 0.55) * 2.2;
    const inBall = dx * dx + dy * dy < 0.62;
    let col = inBall ? (v > 0.55 ? '#f08a3c' : '#f7b24a') : mix('#3d2a5e', '#6a2f5a', 1 - v);
    if (inBall && (Math.abs(dx) < 0.05 || Math.abs(dy + 0.0) < 0.04)) col = '#9a4a1e';
    const fig = Math.abs(dx - 0.05 + (v - 0.6) * 0.5) < 0.12 && v > 0.25 && v < 0.82;
    const arm = v > 0.74 && v < 0.82 && dx > -0.1 && dx < 0.45;
    if (fig || arm) col = '#1d1428';
    if (v < 0.16 && v > 0.08 && u > 0.2 && u < 0.8) col = (Math.floor(u * 30) % 3 === 0) ? '#2b1d3d' : '#ffd36b';
    void x; void y;
    return col;
  });
}

function drawDoors(c: C) {
  for (const d of DOORS) {
    const side = d.id === 'garage' ? 'L' : 'R';
    const wood = d.id === 'garage' ? '#7b5235' : '#3f6f6a';
    // frame, then the door leaf with two panels and a brass knob
    onWall(c, side, d.wallY[0] - 0.25, d.wallY[1] + 0.25, 0, 7.4, (_x, _y, u, v) => (u < 0.06 || u > 0.94 || v > 0.965 ? '#e9e3d6' : null));
    onWall(c, side, d.wallY[0], d.wallY[1], 0, 7.0, (_x, _y, u, v) => {
      let col = wood;
      const pu = side === 'L' ? 1 - u : u;
      if (u < 0.04 || u > 0.96 || v > 0.985) col = shade(wood, 0.6);
      else if (pu > 0.16 && pu < 0.84 && ((v > 0.56 && v < 0.92) || (v > 0.08 && v < 0.48))) {
        col = shade(wood, 0.88);
        if (Math.abs(v - 0.56) < 0.012 || Math.abs(v - 0.08) < 0.012) col = tint(wood, 0.2);
      } else if (hn(Math.floor(u * 40), Math.floor(v * 90)) < 0.15) col = shade(wood, 0.94);
      if (pu > 0.84 && pu < 0.92 && v > 0.47 && v < 0.53) col = '#e2b84a';
      return col;
    });
    // doormat on the floor
    const sx = AX(d.spot.x), sy = AY(d.spot.y);
    for (let y = -9; y < 9; y++) for (let x = -16; x < 16; x++) {
      const skew = (side === 'L' ? 0.55 : -0.6) * y;
      const px = Math.round(sx + x + skew - (side === 'L' ? 4 : -4)), py = Math.round(sy + y * 0.9);
      const edge = Math.abs(x) > 14 || Math.abs(y) > 7;
      P(c, px, py, edge ? '#6b4f33' : (x + y) % 3 === 0 ? '#9c7a4f' : '#b08b5c');
    }
  }
}

function drawFloorClutter(c: C) {
  // slippers by the front-left wall
  for (const [x, y] of [[7.4, 22.3], [8.6, 22.6]] as const) {
    const px = Math.round(AX(x)), py = Math.round(AY(y));
    R(c, px - 1, py - 1, 13, 6, '#3e3a36'); R(c, px, py, 11, 4, '#6d675f'); R(c, px + 1, py, 5, 2, '#8b847a');
  }
  // magazines near the coffee table, a phone with its cord by the TV, popcorn by the box
  const mags: [number, number, string][] = [[29.6, 7.6, '#3f7fb3'], [30.4, 8.0, '#d9d2c2'], [31.0, 7.4, '#c84d3c']];
  for (const [x, y, col] of mags) { const px = Math.round(AX(x)), py = Math.round(AY(y)); R(c, px - 1, py - 1, 16, 9, OL(col)); R(c, px, py, 14, 7, col); R(c, px + 2, py + 2, 8, 1, tint(col, 0.5)); R(c, px + 2, py + 4, 6, 1, tint(col, 0.5)); }
  const ph = { x: Math.round(AX(23.2)), y: Math.round(AY(10.2)) };
  R(c, ph.x - 1, ph.y - 1, 12, 8, '#4a4846'); R(c, ph.x, ph.y, 10, 6, '#e8e4da'); R(c, ph.x + 1, ph.y - 2, 8, 3, '#d6d1c5'); R(c, ph.x + 3, ph.y + 2, 4, 2, '#bdb7aa');
  for (let k = 0; k < 18; k++) P(c, ph.x + 10 + k, ph.y + 3 + Math.round(Math.sin(k * 0.6) * 2), '#3a3836');
  for (let k = 0; k < 10; k++) P(c, Math.round(AX(35.6)) + Math.round(hn(k, 1) * 26), Math.round(AY(20.6)) + Math.round(hn(k, 2) * 10), k % 3 ? '#f2e6b8' : '#e9c56e');
}

/** Soft contact shadows under every piece (baked into the floor). */
function drawContactShadows(c: C) {
  c.save();
  c.fillStyle = 'rgba(46, 30, 18, 0.28)';
  for (const p of FURNITURE) {
    if (p.kind === 'ball') continue;
    const poly = footprint(p);
    c.beginPath();
    poly.forEach((q, i) => { const x = AX(q.x) + 1, y = AY(q.y) + 2; if (i) c.lineTo(x, y); else c.moveTo(x, y); });
    c.closePath(); c.fill();
  }
  c.restore();
}

export function drawBackground(): HTMLCanvasElement {
  const cv = canvas(ART_W, ART_H), c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  drawExteriorLeft(c);
  drawExteriorRight(c);
  drawRoomShell(c);
  drawWallDecor(c);
  drawDoors(c);
  drawFloorClutter(c);
  drawContactShadows(c);
  drawPost(c, POST_L[0], POST_L[1]);
  drawPost(c, POST_R[0], POST_R[1]);
  return cv;
}

// ---------------------------------------------------------------- furniture
const WOOD = '#8a5a36', WOOD_D = '#6e4428', ROSE = '#b8706a';

function drawFridge(c: C, p: Piece) {
  const b = block(c, p.x, p.x + p.w, p.y, p.y + p.d, 6.3, '#e4e6e3', { top: '#f3f4f2' });
  const split = b.faceTop + Math.round(b.H * 0.34);
  R(c, b.x0, split, b.x1 - b.x0, 1, '#a9aeab'); R(c, b.x0, split + 1, b.x1 - b.x0, 1, '#f7f8f6');
  for (const [y0, y1] of [[b.faceTop + 6, split - 5], [split + 6, split + 40]]) { R(c, b.x1 - 7, y0, 2, y1 - y0, '#9ba19e'); R(c, b.x1 - 7, y0, 1, y1 - y0, '#c8ccca'); }
  R(c, b.x0 + 6, split + 12, 8, 6, '#e7c64d'); R(c, b.x0 + 15, split + 16, 6, 7, '#d65a4a'); // magnets / a note
  R(c, b.x0 + 4, split + 30, 12, 9, '#f6f1df'); R(c, b.x0 + 6, split + 33, 7, 1, '#9a948a'); R(c, b.x0 + 6, split + 35, 5, 1, '#9a948a');
  // water bottles on top
  for (let i = 0; i < 4; i++) {
    const bx = b.x0 + 5 + i * 9 + (i % 2), by = b.top + 10 - (i % 2) * 4;
    R(c, bx - 1, by - 15, 8, 16, '#4c6f86'); R(c, bx, by - 14, 6, 14, '#a8d0e6'); R(c, bx + 1, by - 13, 1, 11, '#e2f2fa');
    R(c, bx + 1, by - 18, 4, 4, '#2f6fb5'); R(c, bx, by - 9, 6, 3, '#4f9bd1');
  }
}

const TOP = '#2c3134'; // shared counter / peninsula top so they read as one piece

function drawCounter(c: C, p: Piece) {
  const b = block(c, p.x, p.x + p.w, p.y, p.y + p.d, 3.0, '#5b6366', { top: TOP });
  // dark counter top with a lip, cabinet doors, sink + tap, dish rack
  R(c, b.x0 - 1, b.faceTop - 1, b.x1 - b.x0 + 2, 4, '#26292c'); R(c, b.x0 - 1, b.faceTop - 1, b.x1 - b.x0 + 2, 1, '#4c5358');
  const doors = 4, dw = (b.x1 - b.x0) / doors;
  for (let i = 0; i < doors; i++) {
    const dx = Math.round(b.x0 + i * dw);
    R(c, dx + 2, b.faceTop + 6, Math.round(dw) - 4, b.H - 12, '#535b5e'); R(c, dx + 2, b.faceTop + 6, Math.round(dw) - 4, 1, '#727a7d');
    R(c, dx + (i % 2 ? 4 : Math.round(dw) - 7), b.faceTop + 10, 1, 6, '#c9cfd1');
  }
  const sx = b.x0 + 8, sy = b.top + 6;
  R(c, sx - 1, sy - 1, 30, 16, '#3c4245'); R(c, sx, sy, 28, 14, '#a8b0b4'); R(c, sx + 2, sy + 2, 24, 10, '#7f888c'); R(c, sx + 2, sy + 2, 24, 2, '#5c6468');
  R(c, sx + 12, sy - 14, 3, 14, '#c3cacd'); R(c, sx + 12, sy - 14, 10, 3, '#c3cacd'); R(c, sx + 20, sy - 14, 2, 5, '#9aa2a6');
  // dish rack: wire tray, plates standing on edge, a cup upside down
  const rx = sx + 33, ry = sy + 12;
  R(c, rx - 1, ry - 1, 26, 4, '#5c6468'); R(c, rx, ry, 24, 2, '#c3cacd');
  for (let k = 0; k < 5; k++) { const px = rx + 2 + k * 3; R(c, px - 1, ry - 14, 3, 14, '#7d8a90'); R(c, px, ry - 13, 1, 13, k % 2 ? '#f2f0ea' : '#e2ece9'); P(c, px, ry - 13, '#ffffff'); }
  for (let k = 0; k < 4; k++) R(c, rx + 1 + k * 4, ry - 4, 1, 4, '#9aa2a6');
  R(c, rx + 18, ry - 8, 6, 8, '#3c4245'); R(c, rx + 19, ry - 7, 4, 7, '#d65a4a'); R(c, rx + 19, ry - 7, 1, 7, '#e8806e');
}

/** Peninsula joined to the back counter: cabinet doors on its left side, cooktop under a fume hood, a duct up to the
 * ceiling and along the top, and the pole dropping from that duct to the peninsula's end (like the reference). */
function drawIsland(c: C, p0: Piece) {
  const sideF = 0.55, p = { ...p0, x: p0.x + sideF, w: p0.w - sideF };
  const H = Math.round(3.1 * HF);
  const xs = Math.round(AX(p0.x)), x0 = Math.round(AX(p.x)), x1 = Math.round(AX(p.x + p.w));
  const yb = Math.round(AY(p.y)), yf = Math.round(AY(p.y + p.d));
  // left side: a run of cabinet doors facing left (toward the fridge)
  R(c, xs - 1, yb - H, x0 - xs + 2, yf - yb + H + 1, '#3c4447');
  const doorH = 26;
  for (let y = yb - H + 1; y < yf; y++) for (let x = xs; x < x0; x++) {
    const k = (y - (yb - H + 1)) % doorH;
    let col = '#8f999d';
    if (k === 0) col = '#4f585c'; else if (k < 3) col = '#a9b3b7'; else if (x === xs) col = '#a3adb1'; else if (x === x0 - 1) col = '#6f7a7e';
    if (k > 8 && k < 15 && x === xs + 2) col = '#d4dadc'; // handle
    P(c, x, y, col);
  }
  const b = block(c, p.x, p.x + p.w, p.y, p.y + p.d, 3.1, '#707a7e', { top: TOP });
  R(c, b.x0, b.top - 1, b.x1 - b.x0, 2, TOP); // no seam where it meets the back counter
  R(c, b.x0 - 2, b.faceTop - 1, b.x1 - b.x0 + 4, 4, '#222528');           // overhang lip at the end
  R(c, b.x0 + 4, b.faceTop + 7, b.x1 - b.x0 - 8, b.H - 14, '#6a7377');      // plain end panel
  // cooktop on the back part
  const cy0 = Math.round(AY(p.y + 0.6) - H), cy1 = Math.round(AY(p.y + 2.9) - H);
  R(c, b.x0 + 4, cy0, b.x1 - b.x0 - 8, cy1 - cy0, '#16191b');
  for (const [ox, oy] of [[7, 3], [24, 3], [7, cy1 - cy0 - 10], [24, cy1 - cy0 - 10]]) { R(c, b.x0 + ox, cy0 + oy, 10, 7, '#3a3f43'); R(c, b.x0 + ox + 2, cy0 + oy + 2, 6, 3, '#55595c'); P(c, b.x0 + ox + 4, cy0 + oy + 3, '#7a2e22'); }
  // bonsai in a shallow pot
  const px = b.x0 + 9, py = Math.round(AY(p.y + 6.4) - H);
  R(c, px - 1, py - 1, 20, 7, '#2a1a12'); R(c, px, py, 18, 5, '#3f5a8a'); R(c, px, py, 18, 1, '#6f8ac0'); R(c, px + 2, py + 5, 2, 2, '#2a1a12'); R(c, px + 14, py + 5, 2, 2, '#2a1a12');
  const trunk: [number, number][] = [[8, -1], [8, -2], [9, -3], [9, -4], [10, -5], [10, -6], [9, -7], [8, -8], [11, -7], [12, -8], [7, -9]];
  for (const [tx, ty] of trunk) { P(c, px + tx, py + ty, '#6a4428'); P(c, px + tx + 1, py + ty, '#4a2f1c'); }
  const pads: [number, number, number][] = [[4, -12, 5], [13, -11, 5], [9, -15, 6], [16, -8, 3]];
  for (const [ox, oy, w] of pads) { R(c, px + ox - 1, py + oy - 1, w * 2 + 2, 6, '#1f4a1a'); R(c, px + ox, py + oy, w * 2, 4, '#3f8a2f'); R(c, px + ox + 1, py + oy, w * 2 - 3, 1, '#6cbf4a'); }
  // fume hood over the cooktop, a duct up to the ceiling and one along the top to the end, then the pole down
  const hoodX0 = b.x0 + 2, hoodX1 = b.x1 - 2, cen = Math.round((b.x0 + b.x1) / 2), mid = b.x1 - 9;
  const hTop = Math.round(AY(p.y + 1.6) - 8.4 * HF), hBot = Math.round(AY(p.y + 1.6) - 6.4 * HF);
  const ductRow = (y: number) => Math.round(AY(y) - 8.6 * HF);
  const endY = p.y + p.d - 0.7, ductEnd = ductRow(endY);
  R(c, cen - 6, WALL_TOP, 12, hTop - WALL_TOP, '#8e969a'); R(c, cen - 6, WALL_TOP, 2, hTop - WALL_TOP, '#b5bcbf'); R(c, cen + 4, WALL_TOP, 2, hTop - WALL_TOP, '#6b7377');
  const dTop = hBot - 6;
  R(c, mid - 5, dTop, 10, ductEnd - dTop + 6, '#3f4649'); R(c, mid - 4, dTop, 8, ductEnd - dTop + 5, '#9ba3a7'); R(c, mid - 4, dTop, 2, ductEnd - dTop + 5, '#c0c7ca'); R(c, mid + 2, dTop, 2, ductEnd - dTop + 5, '#7d8589');
  for (let y = dTop + 14; y < ductEnd; y += 16) R(c, mid - 4, y, 8, 1, '#7d8589');
  for (let y = 0; y < hBot - hTop; y++) { const t = y / (hBot - hTop), ins = Math.round((1 - t) * ((hoodX1 - hoodX0) / 2 - 7)), cx = Math.round((hoodX0 + hoodX1) / 2), hw = Math.round((hoodX1 - hoodX0) / 2);
    void cx; void hw; R(c, hoodX0 + ins - 1, hTop + y, hoodX1 - hoodX0 - ins * 2 + 2, 1, '#5f676b'); R(c, hoodX0 + ins, hTop + y, hoodX1 - hoodX0 - ins * 2, 1, mix('#b5bcbf', '#8a9296', t)); }
  R(c, hoodX0 - 1, hBot, hoodX1 - hoodX0 + 2, 3, '#4a5155'); R(c, hoodX0 + 3, hBot + 1, hoodX1 - hoodX0 - 6, 1, '#f3e7b5');
  // the pole: from the end of the top duct down into the end of the peninsula
  const poleTop = ductEnd + 4, poleBot = Math.round(AY(endY) - H) + 2;
  R(c, mid - 3, poleTop, 6, poleBot - poleTop, '#5c6468'); R(c, mid - 2, poleTop, 4, poleBot - poleTop, '#9aa2a6'); R(c, mid - 2, poleTop, 1, poleBot - poleTop, '#c3cacd');
  R(c, mid - 5, poleBot - 2, 10, 3, '#3f4649'); R(c, mid - 6, ductEnd + 2, 12, 4, '#6b7377');
}

function drawLamp(c: C, p: Piece) {
  const cx = Math.round(AX(p.x + p.w / 2)), fy = Math.round(AY(p.y + p.d / 2));
  R(c, cx - 8, fy - 3, 17, 5, '#2e2a26'); R(c, cx - 7, fy - 3, 15, 2, '#5a534c');
  R(c, cx - 1, fy - 88, 3, 86, '#3a3632'); R(c, cx - 1, fy - 88, 1, 86, '#6a6460');
  // glowing shade
  for (let y = 0; y < 20; y++) { const hw = 7 + Math.round(y * 0.45); R(c, cx - hw - 1, fy - 108 + y, hw * 2 + 3, 1, '#a07a1e'); R(c, cx - hw, fy - 108 + y, hw * 2 + 1, 1, mix('#fff3a8', '#f7cf3c', y / 20)); }
  R(c, cx - 6, fy - 108, 13, 2, '#fffbe0');
  R(c, cx - 15, fy - 89, 31, 1, '#c99a2a');
}

function drawCouch(c: C, p: Piece) {
  const x0 = p.x, x1 = p.x + p.w, arm = 0.95;
  const back = block(c, x0 + 0.2, x1 - 0.2, p.y, p.y + 0.9, 2.9, shade(ROSE, 0.92));
  // back cushions
  const n = 3, cw = (back.x1 - back.x0 - 24) / n;
  for (let i = 0; i < n; i++) { const bx = Math.round(back.x0 + 12 + i * cw); R(c, bx, back.faceTop + 2, Math.round(cw) - 1, back.H - 8, shade(ROSE, 0.97)); R(c, bx + 1, back.faceTop + 3, Math.round(cw) - 3, 2, tint(ROSE, 0.2)); R(c, bx + Math.round(cw) - 2, back.faceTop + 2, 1, back.H - 8, shade(ROSE, 0.78)); }
  const seat = block(c, x0 + arm, x1 - arm, p.y + 0.9, p.y + p.d, 1.5, shade(ROSE, 0.88), { top: tint(ROSE, 0.08) });
  for (let i = 1; i < n; i++) { const sx = Math.round(seat.x0 + (i * (seat.x1 - seat.x0)) / n); R(c, sx, seat.top, 1, seat.yf - seat.yb, shade(ROSE, 0.8)); }
  for (const ax of [x0, x1 - arm]) {
    const a = block(c, ax, ax + arm, p.y + 0.3, p.y + p.d, 2.1, shade(ROSE, 0.9), { top: tint(ROSE, 0.15) });
    R(c, a.x0 + 2, a.top + 1, a.x1 - a.x0 - 4, 2, tint(ROSE, 0.35));
  }
  // feet
  for (const fx of [Math.round(AX(x0)) + 3, Math.round(AX(x1)) - 6]) R(c, fx, Math.round(AY(p.y + p.d)) - 1, 3, 3, '#3a2418');
  // rust blanket: one sheet of fabric draped over the right half — over the top of the back cushion, down its face,
  // across the seat and over the seat's front edge. Volume comes from how each surface catches the light (tops lit,
  // faces mid, the hanging part in shade), soft wrinkles running out from where it bunches, and a woven border.
  const bx0 = Math.round(AX(x0 + p.w * 0.44)), bx1 = Math.round(AX(x1 - arm)) + 1;
  const RAMP = ['#3a1208', '#56200d', '#742c15', '#91391c', '#ab4825', '#c45b31', '#d9743f', '#e88f5c'];
  const backFace = back.faceTop, seatTopRow = seat.top, seatFront = seat.faceTop;
  const startRow = back.top + 2;
  for (let y = startRow - 2; y < seat.yf; y++) {
    // the sheet's side edges wander a little (it's draped, not cut square); the right side tucks against the arm
    const lx = bx0 + Math.round(Math.sin(y * 0.23) * 2 + (y > seatFront ? (y - seatFront) * 0.5 : 0));
    const rx = bx1 - Math.round(Math.abs(Math.sin(y * 0.19 + 1)) * 2);
    for (let x = lx; x < rx; x++) {
      const u = (x - bx0) / (bx1 - bx0);
      // where the sheet ends: a soft wavy top edge on the back cushion, a scalloped hem hanging over the front
      const topEdge = startRow + Math.round(Math.abs(Math.sin(u * 5.1)) * 2);
      const hem = seatFront + 7 + Math.round(Math.sin(u * 11) * 2 + Math.sin(u * 4.3 + 1) * 2) + (u < 0.2 ? Math.round((0.2 - u) * 30) : 0);
      if (y < topEdge || y > hem) continue;
      // base tone by surface
      let k = y < backFace ? 6 : y < seatTopRow ? 4 : y < seatFront ? 5 : 3;
      // soft wrinkles fanning out from where it bunches on the seat (around the cat), plus a long diagonal fold
      const ang = Math.atan2(y - (seatTopRow + 6), x - (bx0 + (bx1 - bx0) * 0.62));
      const wr = Math.sin(ang * 7 + Math.hypot(x - bx0, y) * 0.05);
      const diag = Math.sin((x * 0.5 - y * 0.9) * 0.22);
      if (wr > 0.72) k += 1; else if (wr < -0.78) k -= 1;
      if (diag > 0.85) k -= 1;
      if (y >= seatFront && y <= seatFront + 1) k -= 1;          // the fold over the seat's front edge
      if (y >= backFace - 1 && y <= backFace) k += 1;             // rolling over the top of the cushion face
      if (y >= seatTopRow - 1 && y <= seatTopRow) k -= 1;         // tucked into the crease between back and seat
      if (y > seatFront + 2) {                                    // hanging folds: vertical light / dark bands
        const f = Math.sin(x * 0.55 + Math.sin(y * 0.2));
        k += f > 0.5 ? 1 : f < -0.5 ? -1 : 0;
      }
      if (hn(x, y, 43) < 0.05) k -= 1;                             // weave
      let col = RAMP[Math.max(0, Math.min(RAMP.length - 1, k))];
      // woven border along the hem and the left edge
      const dEdge = Math.min(hem - y, x - lx);
      if (dEdge === 2 || dEdge === 3) col = mix(col, '#e2b35a', 0.55);
      if (y === topEdge || x === lx || x === rx - 1 || y === hem) col = '#2e0e06';
      P(c, x, y, col);
    }
  }
  // fringe on the hem + a soft shadow it throws on the seat front
  for (let x = bx0; x < bx1; x++) {
    const u = (x - bx0) / (bx1 - bx0);
    const hem = seatFront + 7 + Math.round(Math.sin(u * 11) * 2 + Math.sin(u * 4.3 + 1) * 2) + (u < 0.2 ? Math.round((0.2 - u) * 30) : 0);
    if (x % 2 === 0) { P(c, x, hem + 1, '#e6c08a'); P(c, x, hem + 2, '#c9a06a'); }
    c.fillStyle = 'rgba(40,10,5,0.28)'; c.fillRect(x, hem + 3, 1, 2);
  }

  // plump cream pillow: sitting on the seat cushion and leaning on the back cushion, tilted, with real thickness
  const pw = 30, ph = 27, pl = Math.round(AX(x0 + arm + 0.15)), pt = back.faceTop + 2, tilt = -0.2;
  const inside = (x: number, y: number) => {
    const cx = x - pw / 2 + 0.5, cy = y - ph / 2 + 0.5;
    const rx = cx * Math.cos(tilt) - cy * Math.sin(tilt), ry = cx * Math.sin(tilt) + cy * Math.cos(tilt);
    const nx = rx / (pw / 2 - 1), ny = ry / (ph / 2 - 2);
    const pinch = 1 - 0.22 * (1 - Math.min(1, Math.abs(nx) * 1.2)) * (Math.abs(ny) > 0.62 ? 1 : 0) - 0.22 * (1 - Math.min(1, Math.abs(ny) * 1.2)) * (Math.abs(nx) > 0.62 ? 1 : 0);
    return { r: Math.abs(nx) ** 2.4 + Math.abs(ny) ** 2.4, pinch, nx, ny };
  };
  // thickness: the same outline pushed down/right, dark
  for (let y = -2; y < ph + 4; y++) for (let x = -2; x < pw + 4; x++) {
    const a = inside(x - 2, y - 3);
    if (a.r <= a.pinch) P(c, pl + x, pt + y, a.r > a.pinch - 0.12 ? '#6e5c40' : '#c9b48c');
  }
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
    const a = inside(x, y);
    if (a.r > a.pinch) continue;
    // dome shading: brightest up-left of centre, falling off to the edges, a soft dent in the middle
    const dome = 1 - a.r;
    const light = dome * 0.9 - a.nx * 0.25 - a.ny * 0.35;
    let col = light > 0.75 ? '#fffbef' : light > 0.5 ? '#f7efdc' : light > 0.28 ? '#ebdfc2' : light > 0.08 ? '#d9c8a2' : '#c2ad84';
    if (Math.abs(a.nx) < 0.1 && Math.abs(a.ny) < 0.12) col = '#cdb98f';
    if (Math.abs(Math.abs(a.nx) - Math.abs(a.ny)) < 0.05 && a.r > 0.35 && a.r < 0.8) col = mix(col, '#a8946c', 0.5); // pinch creases toward the corners
    if (a.r > a.pinch - 0.1) col = '#7a6646';
    P(c, pl + x, pt + y, col);
  }
}

function drawTank(c: C, p: Piece, frame: number) {
  const st = block(c, p.x, p.x + p.w, p.y, p.y + p.d, 2.3, WOOD);
  R(c, st.x0 + 4, st.faceTop + 6, st.x1 - st.x0 - 8, st.H - 12, shade(WOOD, 0.88)); R(c, st.x0 + 4, st.faceTop + 6, st.x1 - st.x0 - 8, 1, tint(WOOD, 0.2));
  R(c, Math.round((st.x0 + st.x1) / 2) - 1, st.faceTop + 14, 3, 2, '#d8b24a');
  // aquarium: glass box sitting on the stand
  const x0 = st.x0 + 3, x1 = st.x1 - 3, top = st.top - Math.round(1.7 * HF), bot = st.faceTop;
  R(c, x0 - 1, top - 1, x1 - x0 + 2, bot - top + 1, '#1e3a3a');
  for (let y = top; y < bot; y++) for (let x = x0; x < x1; x++) {
    const t = (y - top) / (bot - top);
    let col = mix('#7cc3b8', '#2f7d78', t);
    if (y < top + 4) col = '#2b3638';
    if (y > bot - 6) col = hn(x, y) < 0.5 ? '#d9c48e' : '#c7ad74';
    if (x === x0 || y === top + 4) col = tint(col, 0.35);
    P(c, x, y, col);
  }
  // weeds, a castle, fish and bubbles (2 frames)
  for (const [wx, h] of [[x0 + 5, 18], [x0 + 9, 12], [x1 - 8, 22], [x1 - 13, 14]]) for (let k = 0; k < h; k++) P(c, wx + Math.round(Math.sin(k * 0.5 + frame) * 1.2), bot - 6 - k, k % 3 ? '#3f9a3a' : '#6cc04f');
  R(c, x0 + 20, bot - 16, 10, 10, '#8f8a84'); R(c, x0 + 20, bot - 18, 3, 3, '#8f8a84'); R(c, x0 + 27, bot - 18, 3, 3, '#8f8a84'); R(c, x0 + 24, bot - 11, 3, 5, '#2f4848');
  const fish: [number, number, string][] = [[x0 + 12 + frame * 3, top + 14, '#f08a2c'], [x1 - 18 - frame * 2, top + 24, '#f2d24a'], [x0 + 26 - frame * 2, top + 30 + frame, '#e8553c']];
  for (const [fx, fy, col] of fish) { R(c, fx, fy, 5, 3, col); P(c, fx - 1, fy + 1, col); P(c, fx - 2, fy, col); P(c, fx - 2, fy + 2, col); P(c, fx + 3, fy, '#1a1a1a'); }
  for (let k = 0; k < 4; k++) P(c, x1 - 10 + (k % 2), bot - 10 - ((k * 7 + frame * 4) % 26), '#d8f2ee');
  R(c, x0 - 2, top - 3, x1 - x0 + 4, 3, '#2a2f31'); R(c, x0 + 6, top - 2, x1 - x0 - 12, 1, '#5d6568');
}

function drawTvTable(c: C, p: Piece) {
  const t = block(c, p.x, p.x + p.w, p.y, p.y + p.d, 1.9, WOOD_D, { top: '#9a6a42' });
  // we're behind the stand: plain back panel with a cable hole
  R(c, t.x0 + 3, t.faceTop + 4, t.x1 - t.x0 - 6, t.H - 8, shade(WOOD_D, 0.85)); R(c, t.x0 + 3, t.faceTop + 4, t.x1 - t.x0 - 6, 1, tint(WOOD_D, 0.15));
  R(c, Math.round((t.x0 + t.x1) / 2) - 3, t.faceTop + 9, 6, 4, '#2a1a10');
  // chunky CRT from behind: the front bezel (far side) peeks over, the tapered housing with vents faces us
  const tw = 34, tx = Math.round((t.x0 + t.x1) / 2 - tw / 2), base = t.top + 10;
  R(c, tx - 1, base - 32, tw + 2, 6, '#1f2124'); R(c, tx, base - 31, tw, 4, '#4a4e53');            // bezel top behind
  const hx0 = tx + 4, hx1 = tx + tw - 4;
  for (let y = 0; y < 27; y++) { const ins = Math.round(y < 6 ? 0 : (y - 6) * 0.12); R(c, hx0 + ins - 1, base - 27 + y, hx1 - hx0 - ins * 2 + 2, 1, '#1d1f22'); R(c, hx0 + ins, base - 27 + y, hx1 - hx0 - ins * 2, 1, y < 2 ? '#6a7076' : mix('#53585e', '#3c4045', y / 27)); }
  for (let k = 0; k < 4; k++) R(c, hx0 + 7, base - 21 + k * 4, hx1 - hx0 - 14, 1, '#2a2d31');           // vents
  R(c, hx0 + 3, base - 25, 1, 22, '#7a8086');
  P(c, hx1 - 6, base - 6, '#c8c8c8'); P(c, hx1 - 7, base - 6, '#c8c8c8');                           // label
  // cables down the back + game console with a controller on the side
  for (let k = 0; k < 14; k++) P(c, Math.round((t.x0 + t.x1) / 2) + Math.round(Math.sin(k * 0.7) * 1.5), base - 2 + k, '#1a1a1a');
  R(c, t.x0 + 2, t.top + 3, 10, 6, '#2b2d30'); R(c, t.x0 + 3, t.top + 3, 8, 2, '#4a4e52'); P(c, t.x0 + 4, t.top + 6, '#5f5');
  R(c, t.x1 - 11, t.top + 4, 9, 4, '#2b2d30'); P(c, t.x1 - 9, t.top + 5, '#7aa'); P(c, t.x1 - 5, t.top + 5, '#c77');
}

function drawCoffeeTable(c: C, p: Piece) {
  const t = block(c, p.x, p.x + p.w, p.y, p.y + p.d, 1.25, WOOD, { top: '#a3713f' });
  for (let y = t.top + 2; y < t.faceTop; y += 4) R(c, t.x0 + 2, y, t.x1 - t.x0 - 4, 1, '#94643a');
  R(c, t.x0 + 3, t.faceTop + 3, 3, t.H - 3, shade(WOOD, 0.7)); R(c, t.x1 - 6, t.faceTop + 3, 3, t.H - 3, shade(WOOD, 0.7));
  R(c, t.x0 + 6, t.faceTop + 2, t.x1 - t.x0 - 12, t.H - 6, shade(WOOD, 0.6));
  // magazines + a remote + a mug
  R(c, t.x0 + 8, t.top + 3, 18, 12, '#2f5d8a'); R(c, t.x0 + 9, t.top + 4, 16, 3, '#e8e2d2'); R(c, t.x0 + 12, t.top + 8, 9, 5, '#d55c3c');
  R(c, t.x0 + 30, t.top + 6, 14, 10, '#e9d9a2'); R(c, t.x0 + 31, t.top + 7, 12, 2, '#3a3a3a');
  R(c, t.x1 - 20, t.top + 5, 10, 3, '#222'); P(c, t.x1 - 18, t.top + 6, '#c33');
  R(c, t.x1 - 12, t.top + 9, 6, 6, '#e6e1d6'); R(c, t.x1 - 11, t.top + 9, 4, 1, '#5a3a22'); P(c, t.x1 - 6, t.top + 11, '#e6e1d6');
}

function drawArmchair(c: C, p: Piece) {
  // faces left (toward the room): backrest along the right side, an arm at the back and one at the front
  const x0 = p.x, x1 = p.x + p.w, y0 = p.y, y1 = p.y + p.d, armD = 0.55, backW = 0.85;
  const backArm = block(c, x0 + 0.1, x1 - 0.1, y0, y0 + armD, 2.25, shade(ROSE, 0.86), { top: tint(ROSE, 0.12) });
  R(c, backArm.x0 + 2, backArm.top + 1, backArm.x1 - backArm.x0 - 4, 2, tint(ROSE, 0.3));
  const back = block(c, x1 - backW, x1, y0 + 0.15, y1 - 0.15, 3.2, shade(ROSE, 0.9), { top: tint(ROSE, 0.1) });
  R(c, back.x0 + 2, back.top + 1, back.x1 - back.x0 - 4, back.yf - back.yb - 2, tint(ROSE, 0.22));
  const seat = block(c, x0 + 0.1, x1 - backW, y0 + armD, y1 - armD, 1.55, shade(ROSE, 0.88), { top: tint(ROSE, 0.1) });
  R(c, seat.x0 + 2, seat.top + 2, seat.x1 - seat.x0 - 4, 2, tint(ROSE, 0.25));
  // the backrest's padded inner face (toward the room), tufted, between the arms
  for (let y = back.top + 2; y < seat.top + (seat.yf - seat.yb); y++) for (let x = back.x0 - 7; x < back.x0; x++) {
    const k = (y - back.top) % 14, edge = x === back.x0 - 7;
    P(c, x, y, edge ? OL(ROSE) : k === 0 ? shade(ROSE, 0.72) : x < back.x0 - 4 ? tint(ROSE, 0.12) : shade(ROSE, 0.92));
    if (k === 7 && x === back.x0 - 4) P(c, x, y, shade(ROSE, 0.6));
  }
  const front = block(c, x0, x1, y1 - armD, y1, 2.2, shade(ROSE, 0.92), { top: tint(ROSE, 0.18) });
  R(c, front.x0 + 2, front.top + 1, front.x1 - front.x0 - 4, 2, tint(ROSE, 0.35));
  // the front arm's rolled end faces left: a darker scroll on its front face
  R(c, front.x0 + 2, front.faceTop + 3, 6, front.H - 7, shade(ROSE, 0.8)); R(c, front.x0 + 3, front.faceTop + 4, 3, 3, tint(ROSE, 0.2));
  for (const fx of [Math.round(AX(x0)) + 3, Math.round(AX(x1)) - 6]) R(c, fx, Math.round(AY(y1)) - 1, 3, 3, '#3a2418');
}

/** The bookshelf stands along the slanted right wall (a little off it), drawn column by column like the wall: its
 * long face into the room, a lit top with real thickness, an end panel toward the camera and a shadow on the wall. */
function drawBookshelf(c: C, p: Piece) {
  const y0 = p.y, y1 = p.y + p.d, depth = 1.9, gap = 0.3, H = 6.6;
  const front = (y: number) => AX(wallR(y) - depth), back = (y: number) => AX(wallR(y) - gap);
  const yAt = (x: number, off: number) => ((x / AS - ROOM.ox) / RS + off - ROOM.backR) / ROOM.slopeR; // depth where that line crosses column x
  const BOOKS = ['#3b6e8f', '#8f3b3b', '#3f7a4a', '#c9a24a', '#5a3f7a', '#2f4f6f', '#a0522d', '#d6d0c0', '#6e2f2f', '#2f6e5e'];
  const xa = Math.round(front(y0)), xb = Math.round(front(y1));
  // shadow it throws on the wall above/behind it
  for (let x = Math.round(back(y0)); x <= Math.round(back(y1)) + 8; x++) {
    const yb = Math.min(y1, Math.max(y0, yAt(x, gap))), topRow = Math.round(AY(yb) - H * HF);
    for (let k = 1; k <= 7; k++) { c.fillStyle = `rgba(60, 40, 20, ${0.22 - k * 0.025})`; c.fillRect(x, topRow - k, 1, 1); }
  }
  // long face (facing into the room)
  for (let x = xa; x <= xb; x++) {
    const yf = Math.min(y1, Math.max(y0, yAt(x, depth))), floor = Math.round(AY(yf)), top = Math.round(floor - H * HF);
    for (let y = top; y < floor; y++) {
      const h = (floor - y) / HF;
      let col: string;
      const level = Math.floor((h - 0.35) / 1.55), within = h - 0.35 - level * 1.55;
      const book = Math.floor((x - xa) / 3 + level * 5), bookTop = 1.55 - 0.35 - hn(book, 3) * 0.35;
      if (x <= xa + 1) col = x === xa ? OL(WOOD) : tint(WOOD, 0.2);                        // near side panel
      else if (h < 0.35) col = shade(WOOD, 0.75);                                             // plinth
      else if (within < 0.2 || h > 6.4) col = within < 0.07 ? tint(WOOD, 0.25) : WOOD;        // shelf boards
      else if (within < bookTop && hn(book, 7) > 0.1) {
        const bc = BOOKS[Math.floor(hn(book, 5) * BOOKS.length)];
        col = (x - xa) % 3 === 2 ? shade(bc, 0.7) : (x - xa) % 3 === 0 ? tint(bc, 0.15) : bc;
        if (Math.abs(within - bookTop * 0.7) < 0.06) col = '#e8d9a8';
      } else col = shade(WOOD, 0.45);                                                         // inside, in shadow
      P(c, x, y, col);
    }
    P(c, x, floor - 1, OL(WOOD));
  }
  // top: between the front edge and the back edge, lit
  for (let x = xa; x <= Math.round(back(y1)); x++) {
    const yF = Math.min(y1, Math.max(y0, yAt(x, depth))), yB = Math.min(y1, Math.max(y0, yAt(x, gap)));
    const rF = Math.round(AY(yF) - H * HF), rB = Math.round(AY(yB) - H * HF);
    for (let y = rB; y <= rF; y++) P(c, x, y, y === rF ? tint(WOOD, 0.45) : y === rB ? OL(WOOD) : hn(x, y, 31) < 0.1 ? tint(WOOD, 0.22) : tint(WOOD, 0.3));
    P(c, x, rB - 1, OL(WOOD));
  }
  // end panel toward the camera (shows the board thickness) and its outline
  const fx0 = Math.round(front(y1)), fx1 = Math.round(back(y1)), fb = Math.round(AY(y1)), ft = Math.round(fb - H * HF);
  R(c, fx0 - 1, ft, fx1 - fx0 + 2, fb - ft + 1, OL(WOOD));
  R(c, fx0, ft + 1, fx1 - fx0, fb - ft - 1, shade(WOOD, 0.88)); R(c, fx0, ft + 1, 2, fb - ft - 1, tint(WOOD, 0.18)); R(c, fx1 - 2, ft + 1, 2, fb - ft - 1, shade(WOOD, 0.7));
  for (let y = ft + 14; y < fb - 6; y += 22) R(c, fx0 + 3, y, fx1 - fx0 - 6, 1, shade(WOOD, 0.75));
  // a basketball trophy on top
  const tx = Math.round(front(y0 + 2.5)) + 8, ty = Math.round(AY(y0 + 2.5) - H * HF) - 2;
  R(c, tx, ty - 4, 8, 4, '#6e4a1e'); R(c, tx + 3, ty - 10, 2, 6, '#e2b84a'); R(c, tx + 1, ty - 16, 6, 6, '#f0c44c'); P(c, tx + 2, ty - 15, '#fff2b8');
}

function drawWardrobe(c: C, p: Piece) {
  const w = block(c, p.x, p.x + p.w, p.y, p.y + p.d, 5.3, WOOD, { top: '#a06c40' });
  const mid = Math.round((w.x0 + w.x1) / 2);
  R(c, mid, w.faceTop + 3, 1, w.H - 9, shade(WOOD, 0.6));
  for (const [dx0, dx1] of [[w.x0 + 3, mid - 2], [mid + 3, w.x1 - 3]]) { R(c, dx0, w.faceTop + 6, dx1 - dx0, w.H - 18, shade(WOOD, 0.92)); R(c, dx0, w.faceTop + 6, dx1 - dx0, 1, tint(WOOD, 0.2)); }
  R(c, mid - 4, w.faceTop + w.H / 2, 2, 5, '#d8b24a'); R(c, mid + 3, w.faceTop + w.H / 2, 2, 5, '#d8b24a');
  R(c, w.x0, w.faceTop - 1, w.x1 - w.x0, 3, tint(WOOD, 0.1));
}

function drawDiningTable(c: C, p: Piece) {
  const t = block(c, p.x, p.x + p.w, p.y, p.y + p.d, 2.55, WOOD_D, { top: '#8f5f37', noTop: false });
  for (let y = t.top + 2; y < t.faceTop; y += 5) R(c, t.x0 + 2, y, t.x1 - t.x0 - 4, 1, '#7f5230');
  R(c, t.x0 + 4, t.faceTop + 5, t.x1 - t.x0 - 8, t.H - 5, 'rgba(0,0,0,0)');
  c.clearRect(t.x0 + 5, t.faceTop + 7, t.x1 - t.x0 - 10, t.H - 7); // open under the table: legs only
  for (const lx of [t.x0, t.x1 - 4]) { R(c, lx - 1, t.faceTop + 6, 5, t.H - 6, OL(WOOD_D)); R(c, lx, t.faceTop + 6, 3, t.H - 7, shade(WOOD_D, 0.9)); }
  // cereal box (original), milk carton, papers, a lava lamp
  const cx = t.x0 + 22, cy = t.top + 20;
  R(c, cx - 1, cy - 22, 15, 24, '#5a1d14'); R(c, cx, cy - 21, 13, 22, '#d8402e'); R(c, cx + 2, cy - 18, 9, 7, '#f2c443'); R(c, cx + 4, cy - 16, 5, 3, '#e37b2a'); R(c, cx, cy - 21, 13, 2, '#ef6a52'); R(c, cx + 2, cy - 8, 9, 2, '#f5ead2');
  const mx = t.x0 + 40;
  R(c, mx - 1, cy - 17, 10, 19, '#4a5a6a'); R(c, mx, cy - 16, 8, 17, '#f0f2f2'); R(c, mx, cy - 9, 8, 5, '#4f86c6'); R(c, mx + 1, cy - 19, 6, 3, '#d9dcdc');
  R(c, t.x0 + 58, t.top + 12, 22, 14, '#e9e4d6'); R(c, t.x0 + 61, t.top + 10, 22, 14, '#f6f2e8'); for (let k = 0; k < 4; k++) R(c, t.x0 + 64, t.top + 13 + k * 3, 14 - k * 2, 1, '#9b968a');
  const lx = t.x1 - 26, ly = t.top + 22;
  R(c, lx - 1, ly - 3, 12, 5, '#2b2b30'); R(c, lx, ly - 2, 10, 3, '#4c4c55');
  for (let y = 0; y < 26; y++) { const hw = 3 + Math.round(Math.sin((y / 26) * Math.PI) * 2); R(c, lx + 5 - hw - 1, ly - 4 - y, hw * 2 + 2, 1, '#2a3a5a'); R(c, lx + 5 - hw, ly - 4 - y, hw * 2, 1, y % 9 < 4 && y > 4 ? '#ffb238' : '#5f8fd9'); }
  R(c, lx + 2, ly - 34, 6, 4, '#2b2b30'); P(c, lx + 3, ly - 20, '#ffe08a'); P(c, lx + 4, ly - 12, '#ffe08a');
}

function drawChair(c: C, p: Piece, facing: 'L' | 'R' | 'F') {
  const col = '#7a4c2c';
  if (facing === 'F') { // behind the table: backrest on the far side, seat toward us
    const back = block(c, p.x + 0.1, p.x + p.w - 0.1, p.y, p.y + 0.35, 3.3, col);
    for (let k = 0; k < 3; k++) R(c, back.x0 + 4 + k * 7, back.faceTop + 6, 3, back.H - 26, shade(col, 0.8));
    block(c, p.x, p.x + p.w, p.y + 0.35, p.y + p.d, 1.55, col, { top: tint(col, 0.2) });
    return;
  }
  const backX = facing === 'R' ? p.x : p.x + p.w - 0.35;
  block(c, p.x, p.x + p.w, p.y, p.y + p.d, 1.55, col, { top: tint(col, 0.2) });
  const b = block(c, backX, backX + 0.35, p.y, p.y + p.d, 3.3, shade(col, 0.95));
  R(c, b.x0, b.faceTop + 10, b.x1 - b.x0, 2, shade(col, 0.7));
}

function drawBox(c: C, p: Piece) {
  const b = block(c, p.x, p.x + p.w, p.y, p.y + p.d, 1.7, '#bb8b55', { top: '#d2a56b' });
  R(c, b.x0, b.top + Math.round((b.yf - b.yb) / 2) - 1, b.x1 - b.x0, 3, '#c9b48a');
  R(c, Math.round((b.x0 + b.x1) / 2) - 1, b.faceTop, 3, b.H, '#c9b48a');
  R(c, b.x0 - 3, b.top - 5, 14, 6, '#c99a60'); R(c, b.x1 - 10, b.top - 4, 13, 5, '#b4834e'); // open flaps
  R(c, b.x0 + 6, b.faceTop + 8, 12, 2, '#3a2a1a'); R(c, b.x0 + 6, b.faceTop + 12, 8, 2, '#3a2a1a'); // marker
}

function drawBall(c: C, p: Piece) {
  const cx = Math.round(AX(p.x + p.w / 2)), cy = Math.round(AY(p.y + p.d / 2)) - 7, r = 7;
  for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) {
    const d = Math.hypot(x, y);
    if (d > r + 0.5) continue;
    let col = d > r - 0.6 ? '#5a2410' : x + y < -4 ? '#f08a4a' : x + y > 5 ? '#b44a1c' : '#d9652b';
    if (Math.abs(x - y * 0.25) < 0.6 || Math.abs(y + x * 0.1) < 0.6) col = '#3a1a0a';
    P(c, cx + x, cy + y, col);
  }
  P(c, cx - 3, cy - 4, '#ffc08a');
}

/** Ceiling fan hanging in front of the living-room window (3 blade frames). */
function drawFan(c: C, frame: number) {
  const cx = Math.round(AX(27.4)), rodTop = WALL_TOP, hub = 168;
  R(c, cx - 1, rodTop, 3, hub - rodTop, '#5f6366'); R(c, cx - 5, rodTop, 11, 3, '#5f6366');
  const ang = (frame / 3) * (Math.PI * 2 / 3);
  for (let k = 0; k < 3; k++) {
    const a = ang + (k * Math.PI * 2) / 3;
    const dx = Math.cos(a), dy = Math.sin(a) * 0.22;
    for (let s = 4; s < 40; s++) for (let w = -2; w <= 2; w++) P(c, cx + Math.round(dx * s - dy * w * 4), hub + Math.round(dy * s + dx * w * 0.6), w === -2 ? '#a7aba9' : s > 36 ? '#7f8482' : '#9a9f9d');
  }
  R(c, cx - 6, hub - 4, 13, 7, '#4a4e50'); R(c, cx - 5, hub - 4, 11, 2, '#7a7f81'); R(c, cx - 3, hub + 3, 7, 5, '#f3e7b5');
}

// ---------------------------------------------------------------- sprites built from the drawings
export interface ArtPiece { key: string; frames: number; x: number; y: number; w: number; h: number; depthFt: number; piece?: Piece }

const scratch = () => { const cv = canvas(ART_W, ART_H); const c = cv.getContext('2d', { willReadFrequently: true })!; c.imageSmoothingEnabled = false; return { cv, c }; };
function bbox(c: C): [number, number, number, number] | null {
  const d = c.getImageData(0, 0, ART_W, ART_H).data;
  let x0 = ART_W, y0 = ART_H, x1 = -1, y1 = -1;
  for (let y = 0; y < ART_H; y++) for (let x = 0; x < ART_W; x++) if (d[(y * ART_W + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1];
}

/** Register a (multi-frame) drawing as a texture cropped to its bounds; frames sit side by side. */
function bake(tm: Phaser.Textures.TextureManager, key: string, frames: number, draw: (c: C, f: number) => void): Omit<ArtPiece, 'depthFt'> {
  const shots: HTMLCanvasElement[] = [];
  let bb: [number, number, number, number] | null = null;
  for (let f = 0; f < frames; f++) {
    const { cv, c } = scratch(); draw(c, f);
    const b = bbox(c);
    if (b) bb = bb ? [Math.min(bb[0], b[0]), Math.min(bb[1], b[1]), Math.max(bb[2], b[2]), Math.max(bb[3], b[3])] : b;
    shots.push(cv);
  }
  const [x0, y0, x1, y1] = bb ?? [0, 0, 1, 1], w = x1 - x0, h = y1 - y0;
  const out = canvas(w * frames, h), oc = out.getContext('2d')!;
  shots.forEach((s, f) => oc.drawImage(s, x0, y0, w, h, f * w, 0, w, h));
  if (tm.exists(key)) tm.remove(key);
  const tex = tm.addCanvas(key, out)!;
  for (let f = 0; f < frames; f++) tex.add(f, 0, f * w, 0, w, h);
  return { key, frames, x: x0, y: y0, w, h };
}

const DRAW: Record<string, (c: C, p: Piece, f: number) => void> = {
  fridge: drawFridge, counter: drawCounter, island: drawIsland, lamp: drawLamp, couch: drawCouch, tank: drawTank,
  tvTable: drawTvTable, coffeeTable: drawCoffeeTable, armchair: drawArmchair, bookshelf: drawBookshelf, wardrobe: drawWardrobe,
  diningTable: drawDiningTable, chairL: (c, p) => drawChair(c, p, 'R'), chairR: (c, p) => drawChair(c, p, 'L'), chairBack: (c, p) => drawChair(c, p, 'F'),
  box: drawBox, ball: drawBall,
};
const FRAMES: Record<string, number> = { tank: 2 };

/** Background + one cropped texture per furniture piece (+ the fan). Textures persist across scene visits. */
export function buildRoomArt(tm: Phaser.Textures.TextureManager): { bg: string; pieces: ArtPiece[] } {
  const bg = 'room_bg';
  if (!tm.exists(bg)) tm.addCanvas(bg, drawBackground());
  const pieces: ArtPiece[] = [];
  for (const p of FURNITURE) {
    const draw = DRAW[p.kind]; if (!draw) continue;
    const key = `room_${p.id}`, frames = FRAMES[p.kind] ?? 1;
    const art = CACHE.get(key) ?? bake(tm, key, frames, (c, f) => draw(c, p, f));
    CACHE.set(key, art);
    pieces.push({ ...art, depthFt: p.y + p.d, piece: p });
  }
  const fan = CACHE.get('room_fan') ?? bake(tm, 'room_fan', 3, drawFan);
  CACHE.set('room_fan', fan);
  pieces.push({ ...fan, depthFt: 3 });
  return { bg, pieces };
}
const CACHE = new Map<string, Omit<ArtPiece, 'depthFt'>>();

// ---------------------------------------------------------------- the cat
/**
 * Orange tabby, hand-placed pixels (taller and more angular, round 36c). Eyes follow the house rule for every face:
 * front view `W I · · · · · · I W`
 * (white outside, iris inside, mirrored, looking straight ahead); profile = iris in front of the white.
 * o outline, O fur, d stripe, l light fur, w white fur, p inner ear, W eye white, I iris, n nose, m mouth, - closed eye
 */
const CAT_FRAMES: string[][] = [
  [ // 0: sitting, facing the camera (tall, sharp ears; tail curls at the side)
    '..o............o..',
    '.oOo..........oOo.',
    '.oOOo........oOOo.',
    '.oppOo......oOppo.',
    '.opppOooooooOpppo.',
    '.oppOOdOddOdOOppo.',
    'oOOOOOOdOOdOOOOOOo',
    'oOOOOOOOOOOOOOOOOo',
    'odOOWIOOOOOOIWOOdo',
    'oOOOWIOOOOOOIWOOOo',
    'odOOOOOOnnOOOOOOdo',
    '.oOOOwwwmmwwwOOOo.',
    '..oOwwwwwwwwwwOo..',
    '...ooowwwwwwooo...',
    '...oOdwwwwwwdOo...',
    '..oOOOwwwwwwOOOo..',
    '..odOOwwwwwwOOdo....',
    '.oOOOOOwwwwOOOOOo...',
    '.odOOOOwwwwOOOOdo...oo',
    '.oOOdOOOwwOOOdOOo..oOdo',
    'oOOOOdOOOOOOdOOOOooOOo',
    'oOdOOOdOOOOdOOOdOodOo.',
    'oOOOOOOdoodOOOOOOoOo..',
    'oOdOOOOwoowOOOOdOoo...',
    'ooOOOOwwoowwOOOOoo....',
    '.owwooowoowooowwo.....',
    '..ooo.oooooo.ooo......',
  ],
  [ // 1: loafing, eyes closed (side view)
    '...............o...o....',
    '..............oOo.oOo...',
    '..............opOoOpo...',
    '.............oOOOOOOOo..',
    '.......oooooooOdOO-OOOo.',
    '.....ooOOdOOdOOOOOOOOwno',
    '....oOOOOOOOOOOOOOOOwwmo',
    '...oOOdOOOOOdOOOOOOwwwo.',
    '..oOOOOOOOOOOOOOOOOOwwo.',
    '..odOOOOOdOOOOOOdOOOOo..',
    '..oOOOOOOOOOOOOOOOwwwo..',
    '.oOdoooooooooooooowwwo..',
    'oOdOOdOOdOOoooooooooo...',
    '.ooooooooooo............',
  ],
  [ // 2: walking A (side view, facing right)
    '...................o...o......',
    '..................oOo.oOo.....',
    '..................opOoOpo.....',
    '.................oOOOOOOOo....',
    '..oo.............oOdOOWIOOo...',
    '.oOdo............oOOOOWIOOOo..',
    '.oOo.............oOOdOOOOOwn..',
    '..oOo.oooooooooooOOOOOOwwwwo..',
    '...oOoOOdOOdOOdOOOdOOOwwwmo...',
    '....oOOOOOOOOOOOOOOOOOOwwo....',
    '....odOOOOOOOOOOOOOOOOOOo.....',
    '....oOOOdOOOOOdOOOOOdOOOo.....',
    '....oOOOOOOOOOOOOOOOOOwwo.....',
    '.....oOOOOooooooooooOOOo......',
    '.....oOOo..oOo...oOOo.oOo.....',
    '.....oOo...oOo...oOo...oOo....',
    '....oOo.....oOo..oOo....oOo...',
    '....owwo....owwo.owwo...owwo..',
    '....oooo....oooo.oooo...oooo..',
  ],
  [ // 3: walking B
    '...................o...o......',
    '..................oOo.oOo.....',
    '..................opOoOpo.....',
    '.................oOOOOOOOo....',
    '..oo.............oOdOOWIOOo...',
    '.oOdo............oOOOOWIOOOo..',
    '.oOo.............oOOdOOOOOwn..',
    '..oOo.oooooooooooOOOOOOwwwwo..',
    '...oOoOOdOOdOOdOOOdOOOwwwmo...',
    '....oOOOOOOOOOOOOOOOOOOwwo....',
    '....odOOOOOOOOOOOOOOOOOOo.....',
    '....oOOOdOOOOOdOOOOOdOOOo.....',
    '....oOOOOOOOOOOOOOOOOOwwo.....',
    '.....oOOOOooooooooooOOOo......',
    '......oOOooOo.....oOOooOo.....',
    '......oOo.oOo.....oOo.oOo.....',
    '......oOo.oOo.....oOo.oOo.....',
    '.....owwo.owwo...owwo.owwo....',
    '.....oooo.oooo...oooo.oooo....',
  ],
];
const CAT_COL: Record<string, string> = { o: '#3a1f0e', O: '#e08a3c', d: '#a8541f', l: '#f2b066', w: '#f6f1e6', W: '#ffffff', I: '#1e1e1e', n: '#e58a8a', m: '#3a1f0e', p: '#e9a0a0', '-': '#3a1f0e' };
export const CAT_W = 30, CAT_H = 27;

export function buildCatTexture(tm: Phaser.Textures.TextureManager): string {
  const key = 'room_cat';
  if (tm.exists(key)) return key;
  const cv = canvas(CAT_W * CAT_FRAMES.length, CAT_H), c = cv.getContext('2d')!;
  CAT_FRAMES.forEach((rows, f) => {
    const ox = f * CAT_W + Math.floor((CAT_W - rows[0].length) / 2), oy = CAT_H - rows.length;
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (CAT_COL[ch]) P(c, ox + x, oy + y, CAT_COL[ch]); }));
  });
  const tex = tm.addCanvas(key, cv)!;
  for (let f = 0; f < CAT_FRAMES.length; f++) tex.add(f, 0, f * CAT_W, 0, CAT_W, CAT_H);
  return key;
}

// ---------------------------------------------------------------- HUD icons (pixel maps)
const ICONS: Record<string, { rows: string[]; pal: Record<string, string> }> = {
  energy: { rows: ['...yyy', '..yyy.', '.yyy..', 'yyyyyy', '...yy.', '..yy..', '.yy...', 'yy....'], pal: { y: '#ffd84a' } },
  food: { rows: ['....bb', '...bbb', '..mmb.', '.mmmm.', 'mmmmm.', 'mmmm..', '.mm...', '......'], pal: { m: '#d9893f', b: '#f4efe6' } },
  coin: { rows: ['.yyyy.', 'yyttyy', 'yytyyy', 'yyttyy', 'yyytyy', 'yyttyy', '.yyyy.'], pal: { y: '#f2c443', t: '#b8862a' } },
  ball: { rows: ['.oooo.', 'oaoaao', 'aaaaaa', 'oaoaao', 'oaoaao', '.oooo.'], pal: { o: '#e0702e', a: '#5a2410' } },
  star: { rows: ['...y...', '..yyy..', 'yyyyyyy', '.yyyyy.', '..yyy..', '.yy.yy.', 'y.....y'], pal: { y: '#ffe27a' } },
};
export function buildIcons(tm: Phaser.Textures.TextureManager) {
  for (const [name, ic] of Object.entries(ICONS)) {
    const key = `icon_${name}`; if (tm.exists(key)) continue;
    const w = Math.max(...ic.rows.map((r) => r.length)), h = ic.rows.length;
    const cv = canvas(w, h), c = cv.getContext('2d')!;
    ic.rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ic.pal[ch]) P(c, x, y, ic.pal[ch]); }));
    tm.addCanvas(key, cv);
  }
}

/** The warm lamp glow (additive). */
export function buildGlow(tm: Phaser.Textures.TextureManager): string {
  const key = 'room_glow'; if (tm.exists(key)) return key;
  const s = 96, cv = canvas(s, s), c = cv.getContext('2d')!;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const d = Math.hypot(x - s / 2, y - s / 2) / (s / 2);
    if (d >= 1) continue;
    const a = Math.round((1 - d) ** 2.2 * 14) / 14; // gently banded falloff (pixel-art glow)
    c.fillStyle = `rgba(255, 214, 120, ${(a * 0.42).toFixed(3)})`; c.fillRect(x, y, 1, 1);
  }
  tm.addCanvas(key, cv);
  return key;
}
export const LAMP_ART = { x: AX(21.6), y: AY(1.1) - 98 };
export { AX, AY };
