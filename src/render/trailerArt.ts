import Phaser from 'phaser';
import { TRAILER_FURNITURE, TRAILER, DOOR_X, STEPS, PATH_END } from '../world/trailer';
import { Piece } from '../world/apartment';
import { C, R, P, hn, mix, canvas, bake, ArtPiece, AX, AY, HF, ART_W, ART_H, box } from './roomArt';
import { shade, tint } from './sprites';

/**
 * Round 57: the trailer yard (the owner's photo + generator sketch), drawn on the rooms' pixel grid with the same
 * shading recipe as the apartment and garage. Orientation follows the photo: the camper's long side faces us, the
 * rounded front end with the big curtained windows on the left, the door centre-right with wooden steps in front,
 * the rusty hitch pointing left, the generator right of the steps (cord zig-zagging up and over to the trailer), a
 * chest cooler in the front right, bushes + a chain-link fence on the right, the neighbour's house on the left.
 */
const Gy = (depth: number) => Math.round(AY(depth));          // art row of the ground at a depth
const Xa = (x: number) => Math.round(AX(x));
const up = (ft: number) => Math.round(ft * HF);
const FACE = Gy(TRAILER.front);                                   // the trailer's face meets the ground here
const T_TOP = FACE - up(TRAILER.topFt), T_BOT = FACE - up(TRAILER.bodyBottomFt);
const T_X0 = Xa(TRAILER.x0), T_X1 = Xa(TRAILER.x1);

const GRASS = ['#5f8f3a', '#6c9c42', '#557f33', '#78a84a', '#4c7430'];

// ---------------------------------------------------------------- night (round 57c)
/** Drawing the night version? Things that glow at night register a rect here; they're repainted after the grade. */
let NIGHT = false;
let EMIT: { x: number; y: number; w: number; h: number; col: string; folds?: boolean }[] = [];
const glow = (x: number, y: number, w: number, h: number, col: string, folds = false) => { if (NIGHT) EMIT.push({ x, y, w, h, col, folds }); };
/** Darken + cool everything (moonlight), then repaint the lights: lamp-lit windows (curtain folds), the porch light. */
function gradeNight(c: C, w: number, h: number, sky = false) {
  const img = c.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2], lum = 0.3 * r + 0.59 * g + 0.11 * b;
    d[i] = Math.round(r * 0.2 + lum * 0.05); d[i + 1] = Math.round(g * 0.24 + lum * 0.06); d[i + 2] = Math.round(b * 0.36 + lum * 0.12 + 14);
  }
  c.putImageData(img, 0, 0);
  if (sky) {
    // stars and the moon, only where it's sky (bluish and dark after the grade)
    const isSky = (x: number, y: number) => { const p = c.getImageData(x, y, 1, 1).data; return p[2] > p[0] + 18 && p[2] > p[1] + 8 && p[0] + p[1] + p[2] < 200; };
    for (let i = 0; i < 260; i++) { const x = Math.round(hn(i, 1, 120) * w), y = Math.round(hn(i, 2, 121) * 230); if (isSky(x, y)) P(c, x, y, hn(i, 3, 122) < 0.2 ? '#ffffff' : '#9fb0d8'); }
    const mx = 300, my = 56, mr = 15;
    for (let y = -mr; y <= mr; y++) for (let x = -mr; x <= mr; x++) if (x * x + y * y <= mr * mr && isSky(mx + x, my + y)) P(c, mx + x, my + y, hn(x + 40, y + 40, 123) < 0.12 ? '#cfcab4' : x + y < -8 ? '#fffbe8' : '#ece6cc');
  }
  for (const e of EMIT) for (let y = e.y; y < e.y + e.h; y++) for (let x = e.x; x < e.x + e.w; x++) {
    const k = e.folds ? ((x - e.x) % 5 === 0 ? 0.78 : (x - e.x) % 5 === 1 ? 1.08 : 0.95) : 1;
    P(c, x, y, k === 1 ? e.col : k > 1 ? tint(e.col, 0.25) : shade(e.col, k));
  }
  EMIT = [];
}

// ---------------------------------------------------------------- background
function blobTree(c: C, blobs: [number, number, number][], x0 = 0, x1 = ART_W) {
  for (const [bx, by, r] of blobs) for (let y = Math.max(0, by - r); y < by + r; y++) for (let x = Math.max(x0, bx - r); x < Math.min(x1, bx + r); x++) {
    const d = Math.hypot(x - bx, (y - by) * 1.1) / r;
    if (d > 1 - hn(x >> 1, y >> 1, 9) * 0.34 + (hn(x >> 3, y >> 3, 13) < 0.15 ? 0.1 : 0)) continue; // shaggy, untrimmed outline
    const e = (x - bx) + (y - by) + (hn(x >> 2, y >> 2, 12) - 0.5) * r * 0.6; // ragged light / shadow edges (leaf clumps)
    const lit = e < -r * 0.3, dark = e > r * 0.45, n = hn(x >> 2, y >> 2, 11);
    P(c, x, y, dark ? '#3a6524' : lit ? (n < 0.4 ? '#7fbd4c' : '#6aa83e') : n < 0.25 ? '#6aa83e' : '#4f8a2f');
  }
}

/** A tree with a real trunk: tapered, bark-shaded, a couple of branches up into the canopy, roots at the base. */
function tree(c: C, tx: number, base: number, top: number, halfW: number, blobs: [number, number, number][]) {
  for (let y = top; y < base; y++) {
    const w = Math.round(halfW * (0.7 + 0.3 * (y - top) / (base - top)) + (y > base - 8 ? (y - (base - 8)) * 0.8 : 0));
    const lean = Math.round(Math.sin((y - top) / 40) * 2);
    for (let x = -w; x <= w; x++) {
      const k = (x + w) / (2 * w + 1);
      let col = k < 0.3 ? '#7a5838' : k > 0.7 ? '#3e2a1a' : '#5a3e26';
      if (hn(x + tx, y >> 1, 101) < 0.18) col = shade(col, 0.8);                   // bark grooves
      P(c, tx + x + lean, y, col);
    }
  }
  // branches out into the canopy
  for (const [dx, len, dir] of [[0, 40, -1], [0, 46, 1], [0, 30, 1]] as [number, number, number][]) {
    const sy = top + 20 + len * 0.3;
    for (let i = 0; i < len; i++) { const x = tx + dx + dir * i, y = Math.round(sy - i * 0.7); R(c, x, y, 1, Math.max(2, 5 - Math.floor(i / 10)), i < 6 ? '#5a3e26' : '#4a321e'); }
  }
  blobTree(c, blobs);
  // scrub and suckers grown up around the base of the trunk
  blobTree(c, [[tx - 16, base - 10, 16], [tx + 14, base - 8, 14], [tx, base - 4, 12]]);
  // a few dead twigs poking out of the canopy (it hasn't been trimmed in years)
  for (const [bx, by, r] of blobs) for (let i = 0; i < 3; i++) {
    const a = hn(bx, i, 102) * Math.PI * 2, x0 = bx + Math.cos(a) * r * 0.9, y0 = by + Math.sin(a) * r * 0.9;
    for (let k = 0; k < 9; k++) P(c, Math.round(x0 + Math.cos(a) * k), Math.round(y0 + Math.sin(a) * k), '#4a321e');
  }
}

/** A trailer further back (smaller, hazier, half hidden by weeds). */
function farTrailer(c: C, x0: number, x1: number, top: number, bot: number, body: string, band: string, seed: number, lights = true) {
  const bandY = top + Math.round((bot - top) * 0.58), r = Math.round((bot - top) * 0.32);
  for (let y = top; y < bot; y++) for (let x = x0; x < Math.min(x1, ART_W); x++) {
    if (x < x0 + r && y < top + r && Math.hypot(x - (x0 + r), y - (top + r)) > r) continue;
    if (x > x1 - r && y < top + r && Math.hypot(x - (x1 - r), y - (top + r)) > r) continue;
    let col = y < bandY ? body : band;
    if ((y - top) % 3 === 2) col = shade(col, 0.88);
    if (hn(x >> 2, y >> 2, seed) < 0.05) col = mix(col, '#9a5a32', 0.5);
    P(c, x, y, mix(col, '#b9cfd8', 0.28));                                          // haze: it's further away
  }
  for (let x = x0 + 10; x < x1 - 10; x += 26) { R(c, x, top + 8, 14, 10, mix('#5a6a70', '#b9cfd8', 0.25)); R(c, x + 1, top + 9, 4, 8, mix('#93a8ae', '#b9cfd8', 0.25)); if (lights && hn(x, seed, 124) < 0.5) glow(x, top + 8, 14, 10, '#e8b45a', true); }
  R(c, x0 + Math.round((x1 - x0) * 0.62), top + 8, 9, bot - top - 12, mix('#cfc7b0', '#b9cfd8', 0.25));
  for (let x = x0; x < x1; x += 3) R(c, x, bot - 4 - Math.round(hn(x, seed, 103) * 9), 2, 12, hn(x, 1, 104) < 0.5 ? '#557f33' : '#6c9c42'); // weeds
}

function drawBackground(night: boolean): HTMLCanvasElement {
  NIGHT = night; EMIT = [];
  const cv = canvas(ART_W, ART_H), c = cv.getContext('2d')!;
  // sky + clouds
  const HZ = 262;
  for (let y = 0; y < HZ; y++) for (let x = 0; x < ART_W; x++) P(c, x, y, mix('#4f97e2', '#d2e9f5', y / HZ));
  // puffy cumulus (the photo's): clusters of round puffs, lit on top, a soft grey belly
  const clouds: [number, number, number][] = [[210, 40, 1.2], [470, 28, 0.9], [640, 70, 1.4], [820, 30, 1.0], [90, 110, 0.8], [360, 120, 0.7]];
  for (const [cx, cy, k] of clouds) {
    const puffs: [number, number, number][] = [[-34, 6, 18], [-14, -4, 24], [12, -8, 26], [36, 2, 20], [54, 10, 14], [-50, 12, 12], [0, 12, 22]];
    for (const [dx, dy, r0] of puffs) {
      const r = r0 * k, px = cx + dx * k, py = cy + dy * k;
      for (let y = Math.floor(py - r); y < py + r; y++) for (let x = Math.floor(px - r); x < px + r; x++) {
        if (x < 0 || x >= ART_W || y < 0) continue;
        const d = Math.hypot(x - px, (y - py) * 1.15) / r;
        if (d > 1 - hn(x, y, 3) * 0.05) continue;
        const belly = y > cy + 8 * k;
        P(c, x, y, belly ? (y > cy + 16 * k ? '#c9d9e6' : '#e1ecf3') : d < 0.6 && y < py ? '#ffffff' : '#f2f7fa');
      }
    }
  }
  // power line + a lattice mast behind the trailer on the right (like the photo)
  for (let x = 560; x < ART_W; x++) P(c, x, Math.round((x - 560) * 0.24 + Math.sin((x - 560) / 120) * 4), '#2a2d30');
  const mx = 742;
  for (let y = 150; y < 268; y++) { P(c, mx, y, '#6a6f74'); P(c, mx + 8 - Math.round((y - 150) / 60), y, '#6a6f74'); if (y % 6 === 0) for (let k = 0; k < 8; k++) P(c, mx + k, y + (k >> 1), '#7f8489'); }
  // far trees behind the trailer (their trunks are hidden by it)
  blobTree(c, [[380, 120, 50], [450, 90, 56], [520, 115, 46], [600, 140, 40], [330, 150, 34]]);
  // yard: tall grass everywhere, a dirt path with ruts from the front toward the back right
  for (let y = HZ; y < ART_H; y++) for (let x = 0; x < ART_W; x++) {
    const n = hn(x, y, 5);
    let col = GRASS[Math.floor(n * GRASS.length)];
    if (hn(x, y >> 2, 6) < 0.18) col = shade(col, 0.82);               // blades
    if (y < 300) col = mix(col, '#9fc0a8', (300 - y) / 160);            // a little haze toward the back
    // the dirt path: x range narrows from the bottom (front) to the back right
    const k = Math.max(0, Math.min(1, (y - 300) / (ART_H - 300)));
    const pc = 610 - k * 150, pw = 22 + k * 110;
    const dx = Math.abs(x - pc);
    if (y > 296 && dx < pw) {
      const rut = Math.abs(dx - pw * 0.55) < 2 + k * 3;
      const mid = dx < pw * 0.18;
      col = mid && hn(x, y, 7) < 0.55 ? GRASS[Math.floor(hn(x, y, 8) * 3)] : rut ? '#7c6448' : hn(x >> 1, y >> 1, 9) < 0.15 ? '#8e7458' : '#a5896a';
    }
    P(c, x, y, col);
  }
  // more trailers further back on the right (the lot keeps going), then trees with real trunks, the neighbour's house
  farTrailer(c, 736, 884, 210, 262, '#e4e4dc', '#7fa6c8', 41);
  farTrailer(c, 872, 1000, 222, 268, '#d8ccb0', '#b88a5a', 42);
  farTrailer(c, 600, 700, 236, 270, '#dfe2d8', '#9ab89a', 43, false); // mostly behind ours: its windows would glow through
  tree(c, 128, 272, 96, 7, [[40, 70, 70], [110, 40, 50], [10, 150, 46], [160, 112, 40], [80, 120, 44]]);
  tree(c, 716, 300, 150, 5, [[716, 128, 46], [676, 154, 32], [756, 146, 36], [730, 96, 34]]);
  tree(c, 902, 320, 140, 9, [[862, 72, 78], [944, 130, 64], [806, 112, 52], [958, 34, 56], [900, 30, 50]]);
  // the neighbour's house on the left: white siding, a shingle roof with a loose edge, a window with a green awning
  for (let y = 186; y < 300; y++) for (let x = 0; x < 150; x++) {
    let col = (y - 186) % 5 === 4 ? '#b9bcb6' : hn(x >> 3, y, 3) < 0.08 ? '#d4d6d0' : '#e3e5df';
    if (x > 140) col = shade(col, 0.85);
    P(c, x, y, col);
  }
  for (let y = 168; y < 190; y++) for (let x = 0; x < 160 - (y - 168) * 0.2; x++) P(c, x, y, (y + (x >> 2)) % 4 === 0 ? '#5a4636' : hn(x >> 2, y, 4) < 0.2 ? '#7a6250' : '#6c5444');
  R(c, 120, 166, 30, 3, '#8a7058'); // the curled-up shingles
  glow(16, 216, 56, 42, '#5a78c0', true); // a TV on next door
  R(c, 14, 214, 60, 46, '#3d5a58'); R(c, 16, 216, 56, 42, '#6f8d8a'); for (let k = 0; k < 42; k += 4) R(c, 16, 216 + k, 56, 1, '#8aa6a2');
  for (let x = 10; x < 80; x++) R(c, x, 206 + ((x - 10) % 8 < 4 ? 0 : 1), 1, 9, (x >> 2) % 2 ? '#2f7a56' : '#3f9a6a'); // awning
  // left chain-link fence in front of the neighbour's house, sagging
  for (const fx of [24, 102, 176]) { R(c, fx, 232, 3, 76, '#7d8288'); R(c, fx, 232, 1, 76, '#b5bbc0'); }
  R(c, 0, 234, 180, 2, '#8d9298');
  c.fillStyle = 'rgba(70,76,84,0.42)';
  for (let x = -60; x < 200; x += 6) for (let d = 0; d < 70; d++) { c.fillRect(x + d, 236 + d, 1, 1); c.fillRect(x + 70 - d, 236 + d, 1, 1); }
  // right chain-link fence, seen down its length on the right edge
  for (let y = 210; y < 470; y++) for (let x = 930; x < ART_W; x++) if ((x + y) % 6 === 0 || (x - y + 600) % 6 === 0) P(c, x, y, '#8a9096');
  R(c, 928, 205, 4, 270, '#6a7076');
  // wild scrub along the left fence, an old mattress dumped against it
  for (let y = 252; y < 300; y++) for (let x = 58; x < 112; x++) { const k = (x - 58 + (y - 252) * 0.3) % 9; P(c, x - Math.round((y - 252) * 0.3), y, k < 1 ? '#bfb8a0' : hn(x >> 2, y >> 2, 110) < 0.15 ? '#a89c7a' : '#d8d2bc'); }
  for (let x = 58; x < 112; x += 3) P(c, x - 14, 300, '#8a8268');
  blobTree(c, [[20, 300, 26], [-4, 292, 22], [150, 306, 18], [190, 302, 14]]);
  // vines and weeds climbing both fences
  for (let i = 0; i < 90; i++) { const x = Math.round(hn(i, 1, 91) * 200), y = 236 + Math.round(hn(i, 2, 92) * 70); R(c, x, y, 2, 2, hn(i, 3, 93) < 0.5 ? '#4f8a2f' : '#6aa83e'); }
  for (let i = 0; i < 110; i++) { const x = 928 + Math.round(hn(i, 4, 94) * 32), y = 214 + Math.round(hn(i, 5, 95) * 250); R(c, x, y, 2, 3, hn(i, 6, 96) < 0.5 ? '#3a6524' : '#5f9a3a'); }
  drawTrailer(c);
  drawWeeds(c);
  drawSteps(c);
  drawJunk(c);
  if (night) gradeNight(c, ART_W, ART_H, true);
  NIGHT = false;
  return cv;
}

/** The camper: rounded ends, white horizontal siding over a mint band, rusty pink roof cap, windows with curtains. */
function drawTrailer(c: C) {
  const W = T_X1 - T_X0, H = T_BOT - T_TOP, bandY = T_TOP + Math.round(H * 0.6);
  const inside = (x: number, y: number) => {
    // rounded profile: big radius at the front-left top, smaller at the right, small at the bottom
    const rTL = 34, rTR = 20, rB = 6;
    const corner = (cx: number, cy: number, r: number) => Math.hypot(x - cx, y - cy) <= r;
    if (x < T_X0 + rTL && y < T_TOP + rTL) return corner(T_X0 + rTL, T_TOP + rTL, rTL);
    if (x > T_X1 - rTR && y < T_TOP + rTR) return corner(T_X1 - rTR, T_TOP + rTR, rTR);
    if (x < T_X0 + rB && y > T_BOT - rB) return corner(T_X0 + rB, T_BOT - rB, rB);
    if (x > T_X1 - rB && y > T_BOT - rB) return corner(T_X1 - rB, T_BOT - rB, rB);
    return true;
  };
  // shadow + chassis under the body, weeds will hide most of it
  R(c, T_X0 + 6, T_BOT, W - 12, FACE - T_BOT, '#2a2b24'); R(c, T_X0 + 6, T_BOT, W - 12, 3, '#1c1d18');
  for (let y = T_TOP - 1; y < T_BOT + 1; y++) for (let x = T_X0 - 1; x < T_X1 + 1; x++) {
    if (!inside(x, y)) { if (inside(x + 1, y) || inside(x - 1, y) || inside(x, y + 1) || inside(x, y - 1)) P(c, x, y, '#5e605c'); continue; }
    const groove = (y - T_TOP) % 4 === 3;
    let col = y < bandY ? (groove ? '#c3c6bf' : '#e7e9e3') : (groove ? '#83b8a6' : '#a3d6c4');
    if (y === bandY || y === bandY - 1) col = '#b9bdb6';                                 // trim strip
    // rusty pink roof cap over the front half (the photo's faded, rust-spotted cap)
    const capH = 26 - Math.round((x - T_X0) / W * 10), capEnd = T_X0 + W * 0.5 + (hn(y >> 1, 0, 36) - 0.5) * 30;
    if (y < T_TOP + capH && x < capEnd) {
      const pink = hn(x >> 1, y >> 1, 31) < 0.3 ? '#a8604e' : hn(x, y, 32) < 0.5 ? '#c79289' : '#d8a8a0';
      col = mix(pink, col, Math.max(0, Math.min(1, (x - (capEnd - 40)) / 40)) * 0.8); // fades out raggedly into the white
    }
    // grime, rust blooms (patches, mostly near the trim and the bottom) and faint drip streaks
    const bloom = hn(x >> 3, y >> 3, 33) * (y > bandY ? 1 : 1.6) + Math.abs(y - bandY) / 400;
    if (bloom < 0.035 && hn(x, y, 37) < 0.7) col = mix(col, hn(x, y, 38) < 0.5 ? '#9a5a32' : '#b8743e', 0.65);
    if (hn(x >> 1, 0, 34) < 0.03 && y > T_TOP + 30 && hn(x, y >> 4, 35) < 0.6) col = mix(col, '#a5683e', 0.3);
    if (x < T_X0 + 10) col = shade(col, 0.88);                                          // the rounded front turns away
    if (x > T_X1 - 6) col = shade(col, 0.9);
    if (y > T_BOT - 4) col = shade(col, 0.82);                                          // grime along the bottom
    P(c, x, y, col);
  }
  R(c, T_X0 + 20, T_TOP - 3, W - 40, 3, '#cfd2cc'); R(c, T_X0 + 20, T_TOP - 3, W - 40, 1, '#eef0ec'); // a sliver of roof
  // windows: the big curtained pair at the front, curtained side window, a louvred one, the back window
  const win = (x0: number, x1: number, y0: number, y1: number, kind: 'curtain' | 'louver' | 'plain') => {
    R(c, x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4, '#8f8b7c'); R(c, x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2, '#c9c5b4');
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      let col: string;
      if (kind === 'curtain') col = (x - x0) % 5 === 0 ? '#9fbcb8' : (x - x0) % 5 === 1 ? '#d6e8e4' : '#bcd4d0';
      else if (kind === 'louver') col = (y - y0) % 4 === 0 ? '#8a8f86' : (y - y0) % 4 === 1 ? '#d0d4cc' : '#5f6d70';
      else col = (x - x0) + (y - y0) * 0.6 < 10 ? '#a9c0c8' : '#64777e';
      P(c, x, y, col);
    }
    R(c, x0, y0 + Math.round((y1 - y0) * 0.5), x1 - x0, 1, '#b5b1a0');
    if (kind === 'curtain') glow(x0, y0, x1 - x0, y1 - y0, '#f6c46a', true);   // the generator keeps the lamps on
    else if (kind === 'plain') glow(x0, y0, x1 - x0, y1 - y0, '#d89a48');
  };
  const wy0 = T_TOP + 34, wy1 = T_TOP + 74;
  win(T_X0 + 14, T_X0 + 64, wy0, wy1, 'curtain'); win(T_X0 + 68, T_X0 + 128, wy0, wy1, 'curtain');
  win(Xa(13.2), Xa(16.6), wy0 + 4, wy1 - 4, 'curtain');
  win(Xa(23.4), Xa(26.0), wy0 + 8, wy1 - 12, 'louver');
  win(Xa(28.2), Xa(31.4), wy0 + 4, wy1 - 6, 'plain');
  win(Xa(32.8), Xa(33.6), wy0 + 6, wy1 - 10, 'plain');
  // orange marker light, the power inlet the generator cord plugs into, little rust patches
  const pl = { x: Xa(DOOR_X[0]) - 9, y: FACE - up(8.0) };
  R(c, pl.x, pl.y, 6, 4, '#6a6e72'); R(c, pl.x + 1, pl.y + 4, 4, 4, '#e8e4d0'); glow(pl.x + 1, pl.y + 4, 4, 4, '#fff6c8');
  R(c, Xa(17.4), bandY + 8, 5, 6, '#7a3a10'); R(c, Xa(17.4) + 1, bandY + 9, 3, 4, '#f08a2a'); P(c, Xa(17.4) + 1, bandY + 9, '#ffd09a');
  R(c, Xa(29.6), bandY + 6, 6, 7, '#9a9d98'); R(c, Xa(29.6) + 1, bandY + 7, 4, 5, '#4a4d4a');
}

/** Wooden steps up to the door (three boxes, the top one against the trailer). */
function drawSteps(c: C) {
  const x0 = Xa(STEPS.x0), x1 = Xa(STEPS.x1);
  // a little landing post on each side
  for (const [y0, y1, h] of STEPS.rows) {
    box(c, x0, x1, Gy(y0), Gy(y1), up(h), '#8a6a48', { top: '#a9875f' });
    const fy = Gy(y1) - up(h);
    for (let x = x0; x < x1; x += 2) if (hn(x, fy, 41) < 0.3) P(c, x, fy + 1, '#6e5236'); // worn grain
  }
}

/** Overgrown: weed clumps along the trailer's bottom and the hitch, tufts across the yard, a few wildflowers. */
function drawWeeds(c: C) {
  const tuft = (x: number, y: number, h: number, seed: number) => {
    for (let i = 0; i < 9; i++) {
      const bx = x + Math.round((hn(i, seed, 81) - 0.5) * 14), bh = Math.round(h * (0.5 + hn(i, seed, 82) * 0.6)), lean = (hn(i, seed, 83) - 0.5) * 0.5;
      for (let k = 0; k < bh; k++) P(c, bx + Math.round(lean * k), y - k, k > bh - 3 ? '#9cc860' : k < 3 ? '#3f6828' : GRASS[(i + k) % GRASS.length]);
    }
  };
  for (let x = T_X0 - 50; x < T_X1 + 30; x += 4) if (x < Xa(STEPS.x0) - 4 || x > Xa(STEPS.x1) + 4) tuft(x, FACE + 4 + Math.round(hn(x, 1, 84) * 8), 26 + Math.round(hn(x, 2, 85) * 30), x);
  for (let i = 0; i < 190; i++) { const x = Math.round(hn(i, 3, 86) * ART_W), y = 300 + Math.round(hn(i, 4, 87) * 235); if (Math.abs(x - (610 - (y - 300) / 240 * 150)) > 50) tuft(x, y, 12 + Math.round(hn(i, 5, 88) * 22), i + 99); }
  // a strip of weeds right down the middle of the path, tall grass along its edges
  for (let y = 310; y < ART_H; y += 9) { const k = (y - 300) / 240, pc = 610 - k * 150, pw = 22 + k * 110; tuft(Math.round(pc), y, 8 + Math.round(hn(y, 1, 97) * 6), y); tuft(Math.round(pc - pw - 4), y, 16, y + 7); tuft(Math.round(pc + pw + 4), y, 16, y + 11); }
  // gone-to-seed stalks (foxtail / dock) and purple thistles poking out of the grass
  for (let i = 0; i < 60; i++) {
    const x = Math.round(hn(i, 8, 98) * ART_W), y = 300 + Math.round(hn(i, 9, 99) * 230), h = 18 + Math.round(hn(i, 10, 100) * 24);
    if (Math.abs(x - (610 - (y - 300) / 240 * 150)) < 40) continue;
    R(c, x, y - h, 1, h, '#6a7a3a');
    if (i % 3) { R(c, x - 1, y - h - 6, 3, 7, '#b8a060'); P(c, x, y - h - 7, '#d8c080'); }
    else { R(c, x - 2, y - h - 3, 5, 3, '#4f7a2a'); R(c, x - 1, y - h - 6, 3, 3, '#a05ac0'); }
  }
  for (let i = 0; i < 26; i++) { const x = Math.round(hn(i, 6, 89) * ART_W), y = 300 + Math.round(hn(i, 7, 90) * 230); R(c, x, y - 7, 1, 7, '#4f8a2f'); R(c, x - 1, y - 9, 3, 2, i % 3 ? '#f4e46a' : '#ffffff'); }
}

function drawJunk(c: C) {
  // planks and a bent sheet of metal around the steps (the photo's junk pile)
  const plank = (x: number, y: number, w: number, slope: number, col: string) => { for (let i = 0; i < w; i++) { R(c, x + i, y + Math.round(i * slope), 1, 4, i === 0 || i === w - 1 ? shade(col, 0.6) : col); P(c, x + i, y + Math.round(i * slope), tint(col, 0.2)); } };
  plank(Xa(22.8), Gy(3.6), 46, 0.12, '#8a6a48'); plank(Xa(23.5), Gy(4.4), 38, -0.08, '#7a5a3a'); plank(Xa(16.4), Gy(4.8), 30, 0.2, '#93714c');
  // bent sheet (white paint over rust), front left of centre
  for (let y = 0; y < 16; y++) for (let x = 0; x < 70; x++) { const sx = Xa(8) + x + Math.round(y * 0.6), sy = Gy(11) + y - Math.round(x * 0.08); P(c, sx, sy, hn(x >> 1, y, 42) < 0.35 ? '#8a4a2a' : y < 2 ? '#f2f2ee' : '#d6dde0'); }
  // deflated ball, a bucket, bottles in the grass
  for (let y = -10; y <= 10; y++) for (let x = -14; x <= 14; x++) { const d = Math.hypot(x / 14, y / 10); if (d < 1) P(c, Xa(-3.2) + x, Gy(12.6) + y - 8, d > 0.85 ? '#9aa0a4' : x + y < -6 ? '#ffffff' : '#dfe3e6'); }
  R(c, Xa(4.5), Gy(14) - 16, 14, 16, '#c9cdd0'); R(c, Xa(4.5), Gy(14) - 16, 14, 2, '#eef0f2'); R(c, Xa(4.5) + 12, Gy(14) - 15, 2, 15, '#9da2a6');
  for (const [bx, by] of [[Xa(12.5), Gy(15.5)], [Xa(26), Gy(9)], [Xa(31.5), Gy(13)], [Xa(1), Gy(7)], [Xa(9.5), Gy(19)], [Xa(38), Gy(11)]]) { R(c, bx, by - 3, 9, 3, '#3a7a4a'); R(c, bx + 9, by - 2, 3, 1, '#3a7a4a'); P(c, bx + 2, by - 3, '#8ac89a'); }
  // round 57b: the yard is a dump, tyres, trash bags, soggy boxes, cans, paper, a broken lawn chair, a bike frame
  const tyre = (x: number, y: number, rx: number, ry: number) => { for (let a = 0; a < 64; a++) for (let t = 0; t < 4; t++) { const ang = a / 64 * Math.PI * 2, rr = 1 - t * 0.12; P(c, Math.round(x + Math.cos(ang) * rx * rr), Math.round(y + Math.sin(ang) * ry * rr), t === 0 ? '#3a3a3a' : '#161616'); } };
  tyre(Xa(-1.8), Gy(4.6) - 4, 16, 6); tyre(Xa(-1.6), Gy(4.6) - 10, 16, 6); tyre(Xa(6.5), Gy(6.2) - 12, 7, 13);
  const bag = (x: number, y: number, col: string) => { for (let yy = -12; yy <= 0; yy++) for (let xx = -10; xx <= 10; xx++) { const d = Math.hypot(xx / 10, (yy + 6) / 7); if (d < 1 - hn(xx, yy, 105) * 0.1) P(c, x + xx, y + yy, xx + yy < -8 ? tint(col, 0.35) : d > 0.8 ? shade(col, 0.6) : col); } R(c, x - 2, y - 15, 4, 4, shade(col, 0.7)); };
  bag(Xa(33.4), Gy(6.4), '#2a2a30'); bag(Xa(35.0), Gy(6.8), '#e6e6e0'); bag(Xa(2.5), Gy(9.5), '#2a2a30');
  for (const [bx, by, w, h] of [[Xa(-5.2), Gy(8.5), 22, 16], [Xa(-3.6), Gy(9.2), 16, 11]] as [number, number, number, number][]) { R(c, bx, by - h, w, h, '#a8865a'); R(c, bx, by - h, w, 3, '#c4a274'); R(c, bx + w / 2 - 1, by - h, 2, h, '#8a6a44'); R(c, bx + 2, by - 4, w - 4, 3, '#7a5a38'); }
  for (let i = 0; i < 54; i++) { const x = Math.round(hn(i, 20, 106) * ART_W), y = 305 + Math.round(hn(i, 21, 107) * 225); if (i % 2) { R(c, x, y - 3, 5, 3, ['#c0c4c8', '#b03030', '#3070b0'][i % 3]); P(c, x, y - 3, '#ffffff'); } else { R(c, x, y - 2, 6, 3, '#f2f0e6'); P(c, x + 2, y - 2, '#cfcdc2'); } }
  // a scrap heap between the barrel and the hitch: boards at angles, a sheet of corrugated tin, a paint bucket
  const sh = { x: Xa(7.6), y: Gy(2.6) };
  for (const [dx, dy, len, sl, col] of [[0, 0, 44, -0.2, '#7a5a3a'], [6, -4, 38, 0.15, '#93714c'], [-4, -8, 30, -0.35, '#6a4a2e'], [14, -10, 26, 0.3, '#8a6a48']] as [number, number, number, number, string][]) for (let i = 0; i < len; i++) R(c, sh.x + dx + i, sh.y + dy + Math.round(i * sl), 1, 4, i === 0 || i === len - 1 ? '#4a321e' : col);
  for (let i = 0; i < 40; i++) R(c, sh.x + 4 + i, sh.y - 18 + Math.round(i * 0.12), 1, 9, i % 4 < 2 ? '#9aa0a4' : '#6a7074');
  R(c, sh.x + 40, sh.y - 12, 10, 12, '#c9cdd0'); R(c, sh.x + 40, sh.y - 12, 10, 2, '#e6e8ea'); R(c, sh.x + 42, sh.y - 8, 6, 5, '#3070b0');
  // round 57c: a dented mailbox on a leaning post at the end of the path (where you leave)
  const mb = { x: Xa(PATH_END.x) - 70, y: Gy(PATH_END.y) };
  for (let i = 0; i < 44; i++) R(c, mb.x + Math.round(i * 0.12), mb.y - i, 4, 1, i % 7 === 0 ? '#5a3e26' : '#7a5838');
  R(c, mb.x - 4, mb.y - 58, 22, 13, '#4a4e52'); R(c, mb.x - 4, mb.y - 58, 22, 3, '#6a7074'); R(c, mb.x - 5, mb.y - 52, 1, 6, '#2a2c2e');
  R(c, mb.x + 4, mb.y - 50, 6, 2, '#2a2c2e'); R(c, mb.x + 19, mb.y - 66, 2, 12, '#b03030'); R(c, mb.x + 19, mb.y - 66, 6, 4, '#b03030'); // the flag's up
  for (let x = mb.x - 4; x < mb.x + 18; x++) if (hn(x, 1, 125) < 0.4) P(c, x, mb.y - 46, '#9a5a32');
  // a broken white plastic lawn chair on its side, and a rusty bike frame in the weeds
  const ch = { x: Xa(3), y: Gy(16) }; R(c, ch.x, ch.y - 14, 20, 4, '#e8e8e2'); R(c, ch.x + 16, ch.y - 26, 4, 16, '#e8e8e2'); R(c, ch.x + 2, ch.y - 10, 2, 10, '#d0d0ca'); R(c, ch.x + 12, ch.y - 10, 2, 8, '#d0d0ca');
  const bk = { x: Xa(36.5), y: Gy(14) };
  for (const wx of [0, 26]) for (let a = 0; a < 32; a++) P(c, bk.x + wx + Math.round(Math.cos(a / 32 * Math.PI * 2) * 9), bk.y - 6 + Math.round(Math.sin(a / 32 * Math.PI * 2) * 4), '#5a2c18');
  for (let i = 0; i < 26; i++) P(c, bk.x + i, bk.y - 6 - Math.round(Math.sin(i / 26 * Math.PI) * 6), '#8a3a22');
}

// ---------------------------------------------------------------- pieces
/** The trailer door: closed (frame 0) or open with the dark inside and a dim warm light (frame 1). */
function drawDoor(c: C, _p: Piece, f: number) {
  const x0 = Xa(DOOR_X[0]), x1 = Xa(DOOR_X[1]), y1 = FACE - up(TRAILER.floorFt), y0 = FACE - up(8.3);
  R(c, x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 2, '#8f8b7c');
  if (f === 0) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) P(c, x, y, hn(x >> 1, y >> 2, 51) < 0.06 ? '#c9b99a' : x === x0 ? '#f4efdc' : x >= x1 - 2 ? '#bdb59e' : '#e6dfc8');
    R(c, x0 + 4, y0 + 6, x1 - x0 - 8, 32, '#6f6252'); R(c, x0 + 5, y0 + 7, x1 - x0 - 10, 30, '#4e5a5c'); R(c, x0 + 6, y0 + 8, 6, 20, '#7f9296'); // the little window
    glow(x0 + 5, y0 + 7, x1 - x0 - 10, 30, '#e8b058', true);
    R(c, x0 + 4, y0 + 50, x1 - x0 - 8, 1, '#c8bfa6'); R(c, x0 + 4, y0 + 74, x1 - x0 - 8, 1, '#c8bfa6');
    R(c, x1 - 8, y0 + 56, 4, 6, '#9da1a3'); R(c, x1 - 8, y0 + 56, 4, 1, '#e2e6e8');               // handle
    for (let x = x0; x < x1; x++) if (hn(x, 0, 52) < 0.5) R(c, x, y1 - 5 - Math.round(hn(x, 1, 53) * 6), 1, 6, '#a5683e'); // rusty bottom
  } else {
    // open: the inside is dark with a warm light deep in, the door swung out to the right (seen edge-on)
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const k = Math.max(0, 1 - Math.hypot((x - (x0 + x1) / 2) / 26, (y - (y1 - 30)) / 50));
      P(c, x, y, mix('#15110d', '#6a4a26', k * 0.75));
    }
    glow(x0 + 2, y1 - 44, x1 - x0 - 4, 44, '#a86a30');                                           // lamplight inside
    R(c, x0 + 3, y1 - 26, 10, 8, '#2a2018'); R(c, x0 + 3, y1 - 26, 10, 1, '#4a3a2a');            // a counter inside
    R(c, x1, y0 - 1, 8, y1 - y0 + 1, '#bdb59e'); R(c, x1, y0 - 1, 2, y1 - y0 + 1, '#e6dfc8'); R(c, x1 + 2, y0 + 8, 5, 24, '#4e5a5c');
  }
}

/** The rusty A-frame hitch pointing left, with its jack stand. */
function drawHitch(c: C) {
  const tipX = Xa(-4.2), tipY = Gy(0.9) - up(1.6), bx = T_X0 + 6, by = T_BOT - 2;
  const rail = (x0: number, y0: number, x1: number, y1: number) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= n; i++) { const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n); R(c, x, y - 2, 1, 5, '#5a2416'); R(c, x, y - 1, 1, 3, hn(x, y, 61) < 0.4 ? '#8a3a22' : '#a8482a'); } };
  rail(tipX, tipY, bx, by - 4); rail(tipX, tipY, bx + 14, by + 6);
  R(c, tipX - 6, tipY - 4, 10, 7, '#5a2416'); R(c, tipX - 5, tipY - 3, 8, 5, '#9a4228');         // coupler
  R(c, tipX + 16, tipY - 24, 5, 50, '#5a2416'); R(c, tipX + 17, tipY - 24, 3, 50, '#a8482a');  // jack post
  R(c, tipX + 13, tipY - 28, 11, 5, '#8a3a22'); R(c, tipX + 11, tipY + 25, 15, 3, '#5a2416');
}

function drawBarrel(c: C, p: Piece) {
  const cx = Xa(p.x + p.w / 2), cy = Gy(p.y + p.d) - up(1.2), r = up(1.25);
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = Math.hypot(x / r, y / (r * 0.95));
    if (d > 1) continue;
    let col = hn(cx + x >> 1, cy + y >> 1, 62) < 0.35 ? '#6a3418' : '#8a4a24';
    if (d > 0.88) col = '#4a2412'; else if (x + y < -r * 0.6) col = tint(col, 0.15);
    if (Math.abs(d - 0.55) < 0.05) col = '#5a2c14';
    P(c, cx + x, cy + y, col);
  }
}

/** The generator (the owner's sketch): a black box on a tube frame with wheels, the yellow lightning logo, and the
 * grey power cord zig-zagging up from it and drooping across to the trailer's inlet. Frame 1: shaken a pixel, run light on. */
function drawGenerator(c: C, p: Piece, f: number) {
  const x0 = Xa(p.x), x1 = Xa(p.x + p.w), yb = Gy(p.y), yf = Gy(p.y + p.d), H = up(2.5), j = f;
  // round 57c: run down, an oil stain under it, a bent rusty frame, a flat mismatched wheel, rust and dents,
  // the side panel gone (engine showing), duct tape, a peeling logo, a red fuel can beside it
  for (let y = -5; y <= 5; y++) for (let x = -26; x <= 26; x++) if ((x / 26) ** 2 + (y / 5) ** 2 < 1 - hn(x, y, 126) * 0.2) P(c, Math.round((x0 + x1) / 2) + x, yf + 2 + y, (x + y) % 5 === 0 ? '#2a2a2e' : '#1a1a1e');
  const b = box(c, x0, x1, yb - j, yf - j, H, '#1e1f22', { top: '#34363a' });
  for (let y = b.faceTop; y < b.yf; y++) for (let x = b.x0; x < b.x1; x++) {
    const n = hn(x >> 1, y >> 1, 127);
    if (n < 0.07) P(c, x, y - j, n < 0.03 ? '#7a3a1a' : '#5a2a14');                      // rust blooms
    else if (hn(x, y, 128) < 0.02) P(c, x, y - j, '#4a4c50');                             // scratches
  }
  R(c, x0 + 2, b.faceTop + 2 - j, 9, 1, '#0c0c0e'); R(c, x0 + 3, b.faceTop + 3 - j, 6, 2, '#2a2b2e'); // a dent in the corner
  // the missing side panel on the left: the engine block and a red spark-plug boot inside
  R(c, x0 + 1, b.faceTop + 22 - j, 14, b.yf - b.faceTop - 26, '#0e0e10');
  R(c, x0 + 3, b.faceTop + 25 - j, 10, 9, '#6a6e72'); R(c, x0 + 3, b.faceTop + 25 - j, 10, 2, '#8a8e92'); R(c, x0 + 11, b.faceTop + 22 - j, 3, 4, '#c03030');
  for (let k = 0; k < 4; k++) R(c, x0 + 4 + k * 2, b.faceTop + 36 - j, 1, 4, '#4a4c50');
  // duct tape patching a crack (an X), soot from the exhaust on the right
  for (let k = 0; k < 12; k++) { R(c, x1 - 26 + k, b.faceTop + 22 + Math.round(k * 0.6) - j, 2, 2, '#b8bcc0'); R(c, x1 - 26 + k, b.faceTop + 29 - Math.round(k * 0.6) - j, 2, 2, '#a4a8ac'); }
  for (let y = 0; y < 18; y++) for (let x = 0; x < 6; x++) if (hn(x, y, 129) < 0.6 - y * 0.03) P(c, x1 - 4 + x, b.faceTop - 14 + y - j, '#0a0a0a');
  R(c, x1 - 3, b.faceTop - 2 - j, 4, 4, '#3a3c40'); R(c, x1 - 2, b.faceTop - 3 - j, 2, 2, '#1a1a1a');                  // exhaust stub
  // bent, rusty tube frame
  R(c, x0 - 3, yf - H - 4 - j, 3, H + 4, '#7a5040'); R(c, x1, yf - H - 2 - j, 3, H + 2, '#6a6e72'); R(c, x0 - 3, yf - H - 6 - j, x1 - x0 + 6, 3, '#8a7060');
  for (let x = x0 - 3; x < x1 + 3; x++) if (hn(x, 2, 130) < 0.35) P(c, x, yf - H - 6 - j, '#9a5a32');
  // wheels: one fine, one flat (a different tyre)
  for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (x * x + y * y <= 25) P(c, x0 + 9 + x, yf + y - 3, x * x + y * y > 12 ? '#111' : '#555');
  for (let y = -3; y <= 3; y++) for (let x = -6; x <= 6; x++) if ((x / 6) ** 2 + (y / 3) ** 2 <= 1) P(c, x1 - 9 + x, yf + y - 1, (x / 6) ** 2 + (y / 3) ** 2 > 0.5 ? '#1a1a1a' : '#6a5a4a');
  // the logo: a yellow triangle (point down) with a lightning bolt, like the sketch, faded and peeling
  const lx = Math.round((x0 + x1) / 2) + 4, ly = b.faceTop + 8 - j, LOGO = '#e8cc48';
  for (let y = 0; y < 18; y++) { const hw = Math.round(11 - y * 0.62); for (let x = -hw; x <= hw; x++) { const edge = Math.abs(x) >= hw - 1 || y < 2; if (edge && hn(x, y, 131) > 0.12 && !(x > 4 && y < 5)) P(c, lx + x, ly + y, LOGO); } }
  const bolt: [number, number][] = [[2, 3], [1, 4], [0, 5], [-1, 6], [0, 7], [1, 7], [2, 7], [1, 8], [0, 9], [-1, 10], [-2, 11]];
  for (const [bx, by] of bolt) { P(c, lx + bx, ly + by, LOGO); if (hn(bx, by, 132) > 0.2) P(c, lx + bx + 1, ly + by, LOGO); }
  R(c, lx + 6, ly - 1, 5, 3, '#c8b040'); P(c, lx + 9, ly + 2, '#c8b040');                              // the peeled corner curling off
  // a red jerry can leaning on its right side
  const jx = x1 + 6, jy = yf; // round 60e: on the ground, so it doesn't shake with the generator
  R(c, jx - 1, jy - 19, 13, 19, '#5a1010'); R(c, jx, jy - 18, 11, 18, '#b02020'); R(c, jx + 1, jy - 17, 3, 15, '#d04040');
  R(c, jx + 3, jy - 23, 5, 5, '#5a1010'); R(c, jx + 4, jy - 22, 3, 3, '#e8c040'); R(c, jx, jy - 9, 11, 1, '#7a1818');
  // control panel: outlets + a run light (on in frame 1)
  R(c, x1 - 14, b.faceTop + 6 - j, 10, 12, '#2c2e32'); R(c, x1 - 12, b.faceTop + 8 - j, 2, 3, '#d8d8d8'); R(c, x1 - 8, b.faceTop + 8 - j, 2, 3, '#d8d8d8');
  P(c, x1 - 11, b.faceTop + 14 - j, f ? '#6aff6a' : '#2a5a2a'); P(c, x1 - 10, b.faceTop + 14 - j, f ? '#6aff6a' : '#2a5a2a');
  if (f) glow(x1 - 11, b.faceTop + 14 - j, 2, 1, '#6aff6a');
  // the cord: out of the top, zig-zag up, then a droop over to the trailer's inlet
  const cx = x1 - 6, top = b.top - j;
  const pts: [number, number][] = [[cx, top], [cx, top - 6], [cx - 8, top - 14], [cx + 4, top - 22], [cx - 6, top - 32], [cx + 2, top - 40]];
  const inlet: [number, number] = [Xa(29.6) + 3, T_TOP + Math.round((T_BOT - T_TOP) * 0.6) + 9];
  for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push([Math.round(cx + 2 + (inlet[0] - cx - 2) * t), Math.round(top - 40 + (inlet[1] - top + 40) * t + Math.sin(t * Math.PI) * 10)]); }
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx2, by2] = pts[i], n = Math.max(Math.abs(bx2 - ax), Math.abs(by2 - ay), 1);
    for (let k = 0; k <= n; k++) { const x = Math.round(ax + (bx2 - ax) * k / n), y = Math.round(ay + (by2 - ay) * k / n); P(c, x, y, '#5a5e62'); P(c, x + 1, y, '#9aa0a4'); }
  }
}

/** The old chest cooler / freezer in the front right (the photo). */
function drawCooler(c: C, p: Piece) {
  const b = box(c, Xa(p.x), Xa(p.x + p.w), Gy(p.y), Gy(p.y + p.d), up(2.3), '#b9bdbc', { top: '#e9eceb' });
  R(c, b.x0, b.faceTop, b.x1 - b.x0, 4, '#d6dad9'); R(c, b.x0 + 4, b.faceTop + 6, b.x1 - b.x0 - 8, 1, '#9da2a2');
  for (let x = b.x0; x < b.x1; x++) if (hn(x, 0, 71) < 0.4) R(c, x, b.yf - 4 - Math.round(hn(x, 2, 72) * 8), 1, 4, '#9a5a32');
  R(c, b.x0 + 8, b.faceTop + 10, 10, 3, '#6a6e70');
}

function drawBush(c: C, p: Piece) {
  const cx = Xa(p.x + p.w / 2), base = Gy(p.y + p.d);
  const blobs: [number, number, number][] = [[cx, base - 40, 46], [cx - 50, base - 24, 34], [cx + 40, base - 60, 40], [cx + 12, base - 80, 30], [cx - 34, base - 56, 28], [cx + 70, base - 30, 30]];
  blobTree(c, blobs, Xa(p.x) - 70, ART_W);
  // overgrown: stray shoots and long grass sticking out of it
  for (let i = 0; i < 40; i++) {
    const a = -Math.PI * (0.1 + hn(i, 1, 108) * 0.8), [bx, by, r] = blobs[i % blobs.length];
    const x0 = bx + Math.cos(a) * r * 0.8, y0 = by + Math.sin(a) * r * 0.8, len = 6 + Math.round(hn(i, 2, 109) * 14);
    for (let k = 0; k < len; k++) P(c, Math.round(x0 + Math.cos(a) * k), Math.round(y0 + Math.sin(a) * k), k > len - 3 ? '#8ac850' : '#4f8a2f');
  }
}

const DRAW: Record<string, (c: C, p: Piece, f: number) => void> = {
  trailerDoor: drawDoor, hitch: (c) => drawHitch(c), barrel: (c, p) => drawBarrel(c, p), generator: drawGenerator,
  cooler: (c, p) => drawCooler(c, p), bush: (c, p) => drawBush(c, p),
};
const FRAMES: Record<string, number> = { trailerDoor: 2, generator: 2 };
const CACHE = new Map<string, Omit<ArtPiece, 'depthFt'>>();

/** Round 57c: `night` = the night version (darkened, moon and stars, the trailer's lamps lit by the generator). */
export function buildTrailerArt(tm: Phaser.Textures.TextureManager, night = false): { bg: string; pieces: ArtPiece[] } {
  const sfx = night ? '_n' : '';
  const bg = `trailer_bg${sfx}_v2`;
  if (!tm.exists(bg)) tm.addCanvas(bg, drawBackground(night));
  const pieces: ArtPiece[] = [];
  for (const p of TRAILER_FURNITURE) {
    const draw = DRAW[p.kind]; if (!draw) continue;
    const key = `trailer_${p.id}${sfx}_v3`;
    const art = (tm.exists(key) && CACHE.get(key)) || bake(tm, key, FRAMES[p.kind] ?? 1, (c, f) => {
      NIGHT = night; EMIT = [];
      draw(c, p, f);
      if (night) gradeNight(c, ART_W, ART_H);
      NIGHT = false;
    });
    CACHE.set(key, art);
    pieces.push({ ...art, depthFt: p.y + p.d, piece: p });
  }
  return { bg, pieces };
}
