import Phaser from 'phaser';
import { COURT_L, COURT_W, RIM_OFFSET, THREE_R, THREE_CORNER, CORNER_Y } from '../sim/court';
import { WORLD_W, FLOOR_TOP, S, D, sx, sy } from './view';
import { C, R, P, hn, mix, canvas, text3, textW, FONT3 } from './roomArt';
import { shade, tint } from './sprites';

/**
 * Round 56: the school court (the owner's sketch + reference photo), a game venue for story events.
 * Side-on like the arena: the asphalt court in front, a chain-link fence along the back of the court, and behind it
 * the school — tan portable classrooms (long side to us, white AC units on the wall, barred windows, a ramp), the
 * main brick building further back, a flag pole and schoolyard stuff (lunch tables, bike rack, trash cans, tetherball,
 * a "GO EAGLES" banner). Drawn in the apartment / garage pixel style (art-pixel grid, hn noise shading, dark outlines)
 * at the room art's density (0.75 art px per scene unit), baked once per variant into one texture.
 * Variants: 'day' (blue sky, kids by the fence — see crowd.ts SchoolKids) and 'rain' (night, wet asphalt, light poles,
 * a few lit windows; the falling rain itself is a live layer in GameScene).
 */
export type SchoolVariant = 'day' | 'rain';
const K = 0.75;                       // art px per scene unit
const WX0 = -200, WX1 = WORLD_W + 200, WY1 = 760;
const ax = (wx: number) => Math.round((wx - WX0) * K);
const ay = (wy: number) => Math.round(wy * K);
const AW = ax(WX1), AH = ay(WY1);
/** Back edge of the asphalt (the fence line) in scene px. */
export const FENCE_Y = FLOOR_TOP - 42;
/** Flag pole (scene px): the waving flag sprite hangs here. */
export const FLAG_POLE = { x: 1215, top: 70, base: 252 };
/** School colours: maroon and gold (the Eagles). */
export const SCHOOL_COLORS = ['#7a1f2b', '#e0b33a'];

// missing glyphs for the 3-px font
Object.assign(FONT3, { U: '101101101101111', W: '101101111111101', V: '101101101101010', '-': '000000111000000', X: '101101010101101', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110' });

// ---------------------------------------------------------------- pixel buffer for the big noisy fills
class Buf {
  d: ImageData; private cache = new Map<string, [number, number, number]>();
  constructor(c: C, public w: number, public h: number) { this.d = c.createImageData(w, h); }
  rgb(col: string) { let v = this.cache.get(col); if (!v) { const n = parseInt(col.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; this.cache.set(col, v); } return v; }
  set(x: number, y: number, col: string) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const [r, g, b] = this.rgb(col), i = (y * this.w + x) * 4;
    this.d.data[i] = r; this.d.data[i + 1] = g; this.d.data[i + 2] = b; this.d.data[i + 3] = 255;
  }
}

/** Night grading: darker, bluer. */
const nightOf = (col: string) => mix(shade(col, 0.34), '#16203a', 0.35);

export interface SchoolArt { key: string; flagKey: string }

/** Bake (once) the school venue texture + the flag frames. */
export function buildSchoolArt(tm: Phaser.Textures.TextureManager, v: SchoolVariant): SchoolArt {
  const key = `school_${v}_v1`, flagKey = `school_flag_${v}_v1`;
  if (!tm.exists(key)) {
    const cv = canvas(AW, AH), c = cv.getContext('2d')!;
    const night = v === 'rain';
    const col = (s: string) => (night ? nightOf(s) : s);
    // 1) per-pixel layers: sky, distant trees, asphalt
    const b = new Buf(c, AW, AH);
    paintSky(b, night);
    paintGround(b, night);
    c.putImageData(b.d, 0, 0);
    // 2) the school, back to front
    drawMainBuilding(c, night, col);
    drawYard(c, night, col);
    drawPortable(c, 40, 590, 'P-3', night, col, 0);
    drawPortable(c, 1660, 2200, 'P-4', night, col, 1);
    drawPortable(c, 2245, 2700, 'P-5', night, col, 2);
    drawFlagPole(c, col);
    if (night) drawLightPoles(c);
    drawFence(c, night, col);
    drawBleacher(c, col);
    drawCourtLines(c, night);
    tm.addCanvas(key, cv);
  }
  if (!tm.exists(flagKey)) {
    const fw = 40, fh = 26, cv = canvas(fw * 4, fh), c = cv.getContext('2d')!;
    for (let f = 0; f < 4; f++) drawFlag(c, f * fw, f, v === 'rain');
    const tex = tm.addCanvas(flagKey, cv)!;
    for (let f = 0; f < 4; f++) tex.add(f, 0, f * fw, 0, fw, fh);
  }
  return { key, flagKey };
}

/** Place the baked venue in the scene (depth -1000, under everything) + the flag; returns the flag sprite. */
export function addSchoolCourt(scene: Phaser.Scene, v: SchoolVariant) {
  const art = buildSchoolArt(scene.textures, v);
  scene.add.image(WX0, 0, art.key).setOrigin(0, 0).setScale(1 / K).setDepth(-1000);
  const flag = scene.add.sprite(FLAG_POLE.x + 2, FLAG_POLE.top + 6, art.flagKey, 0).setOrigin(0, 0).setScale(1 / K).setDepth(-999);
  return { flag };
}

// ---------------------------------------------------------------- sky + ground
function paintSky(b: Buf, night: boolean) {
  const hz = ay(250);
  for (let y = 0; y < hz; y++) {
    const t = y / hz;
    const base = night ? mix('#070a16', '#1c2438', t) : mix('#5d9fe0', '#cfe6f4', t);
    for (let x = 0; x < AW; x++) {
      let c = base;
      // clouds: soft blobs (day: white puffs; night: heavy rain clouds)
      const n = hn(x >> 4, y >> 3, 31) * 0.5 + hn(x >> 3, y >> 2, 32) * 0.3 + hn(x >> 5, y >> 4, 33) * 0.6;
      const band = night ? 0.62 + Math.sin(x / 90 + y / 30) * 0.12 : 0.95 - (y < hz * 0.55 ? 0 : 0.2);
      if (n > band) c = night ? mix(base, '#2a3247', 0.6 + (n - band)) : mix(base, n - band > 0.12 ? '#ffffff' : '#eef6fb', 0.85);
      b.set(x, y, c);
    }
  }
  // distant tree line along the horizon
  for (let x = 0; x < AW; x++) {
    const top = ay(196) + Math.round(Math.sin(x / 23) * 4 + Math.sin(x / 7.3) * 2 + hn(x >> 2, 0, 34) * 5);
    for (let y = top; y < hz; y++) {
      const n = hn(x >> 1, y >> 1, 35);
      const c = n < 0.3 ? '#3f6e3a' : n < 0.7 ? '#4b7d43' : '#5a8d4c';
      b.set(x, y, night ? nightOf(c) : mix(c, '#a9c9d6', 0.35));
    }
  }
  // the strip behind the fence: grass with a concrete walkway
  for (let y = hz; y < ay(FENCE_Y); y++) for (let x = 0; x < AW; x++) {
    const walk = y > ay(286) && y < ay(302);
    let c = walk ? (hn(x >> 1, y, 36) < 0.1 ? '#a9a59b' : '#bdb8ac') : ['#5f9a3a', '#6fae44', '#558c33', '#4f8530'][Math.floor(hn(x, y, 37) * 4)];
    if (walk && (x % 40 === 0)) c = '#8e8a80';
    b.set(x, y, night ? nightOf(c) : c);
  }
}

/** Rainy-night puddles on the asphalt: [scene x, scene y, half-width px]. */
const PUDDLES: [number, number, number][] = [[sx(8), FLOOR_TOP + 40, 70], [sx(30), FLOOR_TOP + 230, 95], [sx(52), FLOOR_TOP + 110, 60], [sx(70), FLOOR_TOP + 280, 110], [sx(88), FLOOR_TOP + 70, 80], [sx(40), FLOOR_TOP - 20, 60], [sx(98), FLOOR_TOP + 200, 55], [sx(-5), FLOOR_TOP + 300, 70]];
function paintGround(b: Buf, night: boolean) {
  const y0 = ay(FENCE_Y);
  const lamps = night ? [[sx(-8), FLOOR_TOP + 30], [sx(102), FLOOR_TOP + 30], [sx(47), FLOOR_TOP + 120]] : [];
  for (let y = y0; y < AH; y++) {
    const wy = y / K;
    for (let x = 0; x < AW; x++) {
      const wx = x / K + WX0;
      const inCourt = wx >= sx(0) && wx <= sx(COURT_L) && wy >= FLOOR_TOP && wy <= sy(COURT_W);
      const n = hn(x, y, 41);
      // speckled asphalt: the court surface a touch smoother / darker than the apron
      let c = inCourt ? (n < 0.12 ? '#4b4f55' : n < 0.88 ? '#575b61' : '#686c72') : n < 0.15 ? '#4f5257' : n < 0.85 ? '#5d6066' : '#72757a';
      if (hn(x >> 3, y >> 2, 42) < 0.1) c = shade(c, 0.93); // patches
      if (night) {
        c = mix(shade(c, 0.42), '#121a2c', 0.25);
        // wet: light pools under the lamps and long glossy streaks
        let lit = 0;
        for (const [lx, ly] of lamps) lit = Math.max(lit, 1 - Math.hypot((wx - lx) / 520, (wy - ly) / 160));
        if (lit > 0) c = mix(c, '#9db2c8', lit * 0.32);
        if (hn(x, y, 43) < 0.02) c = tint(c, 0.1); // wet glints
        // puddles: soft flat ellipses that mirror the lights
        for (const p of PUDDLES) {
          const d = Math.hypot((wx - p[0]) / p[2], (wy - p[1]) / (p[2] * 0.22));
          if (d < 1 - hn(x >> 1, y, 44) * 0.08) { c = mix(c, lit > 0.15 ? '#7f94ae' : '#26324a', 0.55 + 0.25 * (1 - d)); if (d < 0.5 && hn(x, y >> 1, 45) < 0.06) c = tint(c, 0.3); break; }
        }
      }
      b.set(x, y, c);
    }
  }
}

// ---------------------------------------------------------------- the school
function drawMainBuilding(c: C, night: boolean, col: (s: string) => string) {
  const x0 = ax(820), x1 = ax(1640), top = ay(118), base = ay(252);
  // brick body
  for (let y = top; y < base; y++) for (let x = x0; x < x1; x++) {
    const row = Math.floor((y - top) / 4), off = (row % 2) * 4, bx = (x - x0 + off) % 8, by = (y - top) % 4;
    let k = ['#9a4a35', '#a5523b', '#8e4430', '#a95a42'][(Math.floor((x - x0 + off) / 8) * 7 + row * 3) % 4];
    if (by === 3 || bx === 7) k = '#6e3526';
    P(c, x, y, col(mix(k, '#b9c9d4', 0.18))); // a little haze: it's further back
  }
  // parapet + cap
  R(c, x0 - 2, top - 6, x1 - x0 + 4, 7, col('#b8b1a3')); R(c, x0 - 2, top - 6, x1 - x0 + 4, 1, col('#d6d0c4')); R(c, x0 - 2, top, x1 - x0 + 4, 1, col('#6f6a60'));
  // two floors of windows
  for (const wy of [top + 14, top + 52]) for (let x = x0 + 14; x < x1 - 30; x += 34) {
    const mid = x > (x0 + x1) / 2 - 50 && x < (x0 + x1) / 2 + 40 && wy > top + 40;
    if (mid) continue; // the entrance
    R(c, x - 1, wy - 1, 24, 22, col('#d8d2c4'));
    const lit = night && hn(x, wy, 51) < 0.22;
    R(c, x, wy, 22, 20, lit ? '#ffd27a' : col('#5a7f9c'));
    if (!lit) { R(c, x + 1, wy + 1, 6, 18, col('#7fa3bf')); R(c, x + 2, wy + 2, 2, 12, col('#a9c6da')); }
    R(c, x + 10, wy, 2, 20, col('#d8d2c4')); R(c, x, wy + 9, 22, 2, col('#d8d2c4'));
  }
  // entrance: overhang, double doors, the sign and the bell
  const cx = Math.round((x0 + x1) / 2);
  R(c, cx - 50, base - 50, 100, 6, col('#7a746a')); R(c, cx - 50, base - 50, 100, 1, col('#a6a094'));
  R(c, cx - 22, base - 42, 44, 42, col('#3b3f46'));
  R(c, cx - 20, base - 40, 19, 40, col('#4b6f8c')); R(c, cx + 1, base - 40, 19, 40, col('#4b6f8c'));
  R(c, cx - 3, base - 22, 2, 6, col('#c9c9c9')); R(c, cx + 2, base - 22, 2, 6, col('#c9c9c9'));
  const sign = 'LINCOLN HIGH SCHOOL', sw = textW(sign);
  R(c, cx - sw / 2 - 5, top + 32, sw + 10, 11, col('#e9e2d0')); R(c, cx - sw / 2 - 5, top + 32, sw + 10, 1, col('#ffffff'));
  text3(c, cx - sw / 2, top + 35, sign, col(SCHOOL_COLORS[0]));
  // bell
  R(c, x1 - 40, top + 30, 10, 3, col('#555')); R(c, x1 - 39, top + 33, 8, 8, col('#b8862a')); R(c, x1 - 37, top + 33, 2, 6, col('#e2b85a'));
}

function drawYard(c: C, night: boolean, col: (s: string) => string) {
  const g = ay(FENCE_Y);
  // lunch tables (side-on: bench, table, bench) under the trees near the flag
  for (const tx of [ax(980), ax(1390)]) {
    R(c, tx, g - 22, 46, 4, col('#2f6a3a')); R(c, tx, g - 22, 46, 1, col('#4f9a5a'));          // table top (green, like school tables)
    R(c, tx + 4, g - 18, 3, 12, col('#555b62')); R(c, tx + 39, g - 18, 3, 12, col('#555b62'));
    R(c, tx - 6, g - 13, 14, 3, col('#2f6a3a')); R(c, tx + 38, g - 13, 14, 3, col('#2f6a3a'));
    R(c, tx - 5, g - 10, 2, 6, col('#555b62')); R(c, tx + 49, g - 10, 2, 6, col('#555b62'));
  }
  // bike rack with two bikes
  const bx = ax(1500);
  for (let i = 0; i < 5; i++) { R(c, bx + i * 9, g - 20, 2, 14, col('#8a9096')); }
  R(c, bx, g - 20, 38, 2, col('#a4aab0'));
  for (const [ox, frame] of [[4, '#c0392b'], [22, '#2a6fb0']] as [number, string][]) {
    for (const wx of [ox, ox + 14]) { for (let a = 0; a < 16; a++) P(c, bx + wx + Math.round(Math.cos(a / 16 * Math.PI * 2) * 5), g - 11 + Math.round(Math.sin(a / 16 * Math.PI * 2) * 5), col('#22252a')); }
    R(c, bx + ox, g - 14, 14, 2, col(frame)); R(c, bx + ox + 6, g - 20, 2, 7, col(frame)); R(c, bx + ox + 4, g - 21, 6, 2, col('#22252a'));
  }
  // trash cans (green, with lids)
  for (const tx of [ax(640), ax(1585), ax(2210)]) {
    R(c, tx - 1, g - 23, 16, 24, col('#1f3a24')); R(c, tx, g - 22, 14, 22, col('#2f6a3a')); R(c, tx + 2, g - 20, 2, 18, col('#4f9a5a'));
    R(c, tx - 2, g - 25, 18, 4, col('#244a2c')); R(c, tx + 4, g - 27, 6, 2, col('#244a2c'));
  }
  // tetherball pole with the ball wrapped up
  const tp = ax(705);
  R(c, tp, g - 70, 3, 70, col('#9aa0a6')); R(c, tp, g - 70, 1, 70, col('#c9cfd4'));
  for (let a = 0; a < 7; a++) for (let d = 0; d < 7; d++) if (Math.hypot(a - 3, d - 3) < 3.6) P(c, tp - 4 + a, g - 60 + d, col(Math.hypot(a - 2, d - 2) < 1.5 ? '#ffe39a' : '#e0b33a'));
  // a banner on the main building's wall: GO EAGLES
  const by = ay(206), bx0 = ax(895);
  const t = 'GO EAGLES', tw = textW(t);
  R(c, bx0, by, tw + 14, 13, col(SCHOOL_COLORS[0])); R(c, bx0, by, tw + 14, 1, col(tint(SCHOOL_COLORS[0], 0.3)));
  text3(c, bx0 + 7, by + 4, t, col(SCHOOL_COLORS[1]));
  void night;
}

/** A portable classroom (the reference photo): long side to us, tan T1-11 siding, a dark flat roof fascia, barred
 * windows with blinds, white AC units on the wall, a downspout at the corner, a ramp + rail to the door, a skirt. */
function drawPortable(c: C, wx0: number, wx1: number, label: string, night: boolean, col: (s: string) => string, seed: number) {
  const x0 = ax(wx0), x1 = ax(wx1), base = ay(296), top = ay(136), roofH = 9;
  // body siding with vertical grooves
  for (let y = top + roofH; y < base - 6; y++) for (let x = x0; x < x1; x++) {
    let k = (x - x0) % 12 === 0 ? '#9c7b55' : hn(x >> 1, y >> 2, 61 + seed) < 0.1 ? '#b8935f' : '#c39f6c';
    if (y < top + roofH + 4) k = shade(k, 0.85);                 // under the eave
    if (x > x1 - 8) k = shade(k, 0.88);                          // corner shadow
    P(c, x, y, col(k));
  }
  R(c, x0 - 1, top + roofH, 1, base - top - roofH, col('#6e5638')); R(c, x1, top + roofH, 1, base - top - roofH, col('#6e5638'));
  // roof fascia: a dark flat band with a lighter drip edge
  R(c, x0 - 4, top, x1 - x0 + 8, roofH, col('#3b3d40')); R(c, x0 - 4, top, x1 - x0 + 8, 1, col('#6a6d70')); R(c, x0 - 4, top + roofH - 1, x1 - x0 + 8, 1, col('#232527'));
  // skirt (vented panel along the bottom)
  R(c, x0, base - 6, x1 - x0, 6, col('#8c7a62'));
  for (let x = x0 + 4; x < x1; x += 10) R(c, x, base - 4, 6, 1, col('#6e5f4b'));
  // windows (barred, blinds) with an AC unit above each pair, door near the left end
  const door = x0 + 30;
  R(c, door - 1, top + 30, 24, base - top - 36, col('#5a4632')); R(c, door, top + 31, 22, base - top - 38, col('#7a6a5a'));
  R(c, door + 17, top + 64, 3, 2, col('#d0d0d0'));
  text3(c, door + 4, top + 22, label, col('#2a2a2a'));
  // ramp + handrail down to the walkway
  for (let i = 0; i < 40; i++) R(c, door - 42 + i, base - 6 + Math.round(i * 0.15) - 6, 1, 6 - Math.round(i * 0.15) + 6, col(i % 6 === 0 ? '#7a5a3a' : '#9a7650'));
  R(c, door - 42, base - 26, 42, 2, col('#cfd3d6')); for (const px of [door - 40, door - 22, door - 2]) R(c, px, base - 26, 2, 16, col('#b8bcc0'));
  for (let wx = door + 60; wx < x1 - 50; wx += 92) {
    for (const ox of [0, 40]) {
      const x = wx + ox, y = top + 44;
      R(c, x - 1, y - 1, 30, 26, col('#e6e1d6'));
      const lit = night && hn(x, y, 62) < 0.25;
      R(c, x, y, 28, 24, lit ? '#ffd58a' : col('#6f8aa0'));
      for (let k = 2; k < 24; k += 3) R(c, x + 1, y + k, 26, 1, lit ? '#e8b860' : col('#a8b8c4')); // blinds
      for (let k = 4; k < 28; k += 6) R(c, x + k, y, 1, 24, col('#3a3c40'));                        // bars
    }
    // wall AC unit (white box with grille + vent fins), like the photo
    const ac = wx + 22, ay0 = top + 14;
    R(c, ac - 1, ay0 - 1, 26, 22, col('#9ea4a8')); R(c, ac, ay0, 24, 20, col('#eef0f0')); R(c, ac, ay0, 24, 1, col('#ffffff'));
    for (let k = 3; k < 18; k += 3) R(c, ac + 3, ay0 + k, 18, 1, col('#b9bfc3'));
    R(c, ac + 21, ay0 + 2, 2, 16, col('#c9cfd2'));
  }
  // downspout at the right corner
  R(c, x1 - 5, top + roofH, 3, base - top - roofH, col('#d9d6cf')); R(c, x1 - 9, base - 8, 7, 3, col('#d9d6cf'));
}

function drawFlagPole(c: C, col: (s: string) => string) {
  const x = ax(FLAG_POLE.x), t = ay(FLAG_POLE.top), bse = ay(FLAG_POLE.base);
  R(c, x - 6, bse - 3, 14, 4, col('#9a958a'));
  R(c, x, t, 3, bse - t, col('#b9c0c6')); R(c, x, t, 1, bse - t, col('#e6ebee')); R(c, x + 2, t, 1, bse - t, col('#7d858c'));
  R(c, x - 1, t - 4, 5, 4, col('#e0b33a')); P(c, x, t - 4, col('#ffe39a'));
  R(c, x + 3, t + 2, 1, bse - t - 30, col('#d8d8d8')); // rope
}

/** The flag: stripes + canton, rippling (day) or hanging limp and dark (rain). */
function drawFlag(c: C, ox: number, f: number, wet: boolean) {
  const W = 34, H = 20;
  for (let x = 0; x < W; x++) {
    const wave = wet ? 0 : Math.round(Math.sin(x / 5 - f * Math.PI / 2) * 2 * (x / W));
    const droop = wet ? Math.round((x / W) ** 2 * 10) : 0;
    const len = wet ? H - Math.round(x / W * 4) : H;
    for (let y = 0; y < len; y++) {
      const yy = y + wave + droop;
      let k = Math.floor(y / (H / 7)) % 2 === 0 ? '#b22234' : '#f2f2f2';
      if (x < 14 && y < 11) k = (x + y) % 4 === 0 ? '#ffffff' : '#3c3b6e';
      const lightK = wet ? 0.45 : 0.85 + 0.15 * Math.sin(x / 5 - f * Math.PI / 2);
      P(c, ox + x, 2 + yy, shade(k, lightK));
    }
  }
}

function drawLightPoles(c: C) {
  for (const wx of [sx(-7), sx(101)]) {
    const x = ax(wx), b = ay(FENCE_Y + 4), t = ay(20);
    R(c, x - 1, t, 5, b - t, '#2c3138'); R(c, x, t, 1, b - t, '#4a525b');
    R(c, x - 14, t - 2, 32, 4, '#2c3138');
    for (const lx of [x - 12, x + 6]) { R(c, lx, t + 2, 10, 5, '#3a4048'); R(c, lx + 1, t + 6, 8, 2, '#fff6d0'); }
  }
}

/** Chain-link fence across the whole width (the owner's sketch): posts every ~10 ft, a top rail, diamond mesh with a
 * knuckled top edge, a bottom tension wire, a gate near the left end, banners tied on. */
function drawFence(c: C, night: boolean, col: (s: string) => string) {
  const base = ay(FENCE_Y), top = ay(FENCE_Y - 11 * S), rail = top + 4;
  const mesh = night ? 'rgba(150,165,185,0.32)' : 'rgba(70,76,84,0.42)';
  c.fillStyle = mesh;
  const sp = 8;
  for (let x = -base; x < AW + base; x += sp) {
    // two diagonals per cell = diamonds; tiny sag between posts
    for (let y = rail; y < base; y++) {
      const d = y - rail;
      c.fillRect(x + d, y, 1, 1); c.fillRect(x - d + (base - rail), y, 1, 1);
    }
  }
  // knuckled zig-zag above the rail
  for (let x = 0; x < AW; x++) { const z = Math.abs(((x + 4) % 8) - 4); c.fillRect(x, top + z - 1, 1, 1); }
  // rails, posts, the gate
  R(c, 0, rail, AW, 3, col('#8a9096')); R(c, 0, rail, AW, 1, col('#c2c8cd'));
  R(c, 0, base - 3, AW, 1, col('#6a7076'));
  const postStep = Math.round(10 * S * K);
  for (let x = ax(sx(-9)); x < AW; x += postStep) {
    R(c, x - 2, top - 3, 6, base - top + 3, col('#55595f')); R(c, x - 1, top - 3, 2, base - top + 3, col('#9aa0a6'));
    R(c, x - 3, top - 5, 8, 3, col('#6a7076'));
    for (const by of [rail + 12, base - 18]) R(c, x - 4, by, 10, 2, col('#6a7076')); // band clamps
  }
  const gx = ax(sx(-2)) + 10;
  R(c, gx, rail + 2, 3, base - rail - 2, col('#7a8086')); R(c, gx + 44, rail + 2, 3, base - rail - 2, col('#7a8086'));
  R(c, gx, rail + 30, 47, 2, col('#7a8086')); R(c, gx + 40, rail + 34, 6, 3, col('#c0c4c8'));
  // banners zip-tied to the fence
  const banner = (bx: number, text: string, bg: string, fg: string) => {
    const w = textW(text) + 12, y = rail + 26;
    R(c, bx - 1, y - 1, w + 2, 15, col(shade(bg, 0.6))); R(c, bx, y, w, 13, col(bg)); R(c, bx, y, w, 1, col(tint(bg, 0.3)));
    text3(c, bx + 6, y + 4, text, col(fg));
    for (const tx of [bx + 1, bx + w - 2]) { R(c, tx, y + 1, 1, 2, '#111'); R(c, tx, y + 10, 1, 2, '#111'); }
  };
  banner(ax(sx(20)), 'EAGLES', SCHOOL_COLORS[0], SCHOOL_COLORS[1]);
  banner(ax(sx(66)), 'NO DUNKING ON RIMS', '#e9e4d6', '#2a2a2a');
}

/** A 3-row aluminium bleacher at midcourt in front of the fence (kids sit on it in the day). */
export const BLEACHER = { x0: sx(41), x1: sx(53), rows: [FENCE_Y + 2, FENCE_Y + 11, FENCE_Y + 20] as number[], rise: 13 };
function drawBleacher(c: C, col: (s: string) => string) {
  const x0 = ax(BLEACHER.x0), x1 = ax(BLEACHER.x1);
  BLEACHER.rows.forEach((wy, i) => {
    const y = ay(wy), h = Math.round((BLEACHER.rows.length - i) * BLEACHER.rise * K);
    R(c, x0, y - h - 1, x1 - x0, 4, col('#c9cfd4')); R(c, x0, y - h - 1, x1 - x0, 1, col('#eef2f4')); // seat plank
    R(c, x0, y - h + 3, x1 - x0, 2, col('#7d858c'));
    for (const lx of [x0 + 2, (x0 + x1) >> 1, x1 - 4]) R(c, lx, y - h + 3, 2, h - 3, col('#8a9096'));
  });
}

// ---------------------------------------------------------------- court lines (the arena's geometry, faded paint)
function drawCourtLines(c: C, night: boolean) {
  const line = night ? '#a8adb5' : '#e9e6dc';
  const plot = (wx: number, wy: number) => {
    const x = ax(wx), y = ay(wy);
    if (hn(x, y, 71) < 0.12) return; // chipped
    const k = hn(x >> 2, y, 72) < 0.25 ? shade(line, 0.85) : line;
    P(c, x, y, k); P(c, x + 1, y, k);
  };
  const seg = (x0: number, y0: number, x1: number, y1: number) => {
    const a = [sx(x0), sy(y0)], b = [sx(x1), sy(y1)];
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * K * 1.5 + 1;
    for (let i = 0; i <= n; i++) plot(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n);
  };
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number, flip = 1) => {
    const n = 140;
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; plot(sx(cx + Math.cos(a) * r * flip), sy(cy + Math.sin(a) * r)); }
  };
  // painted lanes (faded maroon) + a worn centre circle
  const lane = night ? nightOf('#6a2a30') : '#7a3a3a';
  for (const left of [true, false]) {
    const x0 = left ? 0 : COURT_L - 19;
    for (let y = ay(sy(17)); y < ay(sy(33)); y++) for (let x = ax(sx(x0)); x < ax(sx(x0 + 19)); x++) if (hn(x, y, 73) > 0.08) P(c, x, y, hn(x >> 2, y >> 1, 74) < 0.2 ? shade(lane, 0.9) : lane);
  }
  for (let y = ay(sy(19)); y < ay(sy(31)); y++) for (let x = ax(sx(41)); x < ax(sx(53)); x++) {
    const dx = (x / K + WX0 - sx(47)) / (6 * S), dy = (y / K - sy(25)) / (6 * D);
    if (dx * dx + dy * dy < 1 && hn(x, y, 75) > 0.15) P(c, x, y, night ? nightOf(SCHOOL_COLORS[0]) : mix(SCHOOL_COLORS[0], '#5d6066', 0.35));
  }
  const eh = 'E';
  text3(c, ax(sx(47)) - 1, ay(sy(25)) - 2, eh, night ? '#8a7a40' : SCHOOL_COLORS[1]);
  seg(0, 0, COURT_L, 0); seg(COURT_L, 0, COURT_L, COURT_W); seg(COURT_L, COURT_W, 0, COURT_W); seg(0, COURT_W, 0, 0);
  seg(47, 0, 47, COURT_W);
  arc(47, 25, 6, 0, Math.PI * 2);
  for (const left of [true, false]) {
    const bx = left ? 0 : COURT_L, dir = left ? 1 : -1, rimX = left ? RIM_OFFSET : COURT_L - RIM_OFFSET;
    seg(bx, 17, bx + dir * 19, 17); seg(bx + dir * 19, 17, bx + dir * 19, 33); seg(bx + dir * 19, 33, bx, 33);
    arc(bx + dir * 19, 25, 6, -Math.PI / 2, Math.PI / 2, dir);
    const cy0 = 25 - THREE_CORNER, cy1 = 25 + THREE_CORNER;
    seg(bx, cy0, bx + dir * CORNER_Y, cy0); seg(bx, cy1, bx + dir * CORNER_Y, cy1);
    const a = Math.asin(THREE_CORNER / THREE_R);
    const n = 220;
    for (let i = 0; i <= n; i++) { const t = -a + (2 * a * i) / n; plot(sx(rimX + Math.cos(t) * THREE_R * dir), sy(25 + Math.sin(t) * THREE_R)); }
  }
}
