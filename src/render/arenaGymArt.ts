import Phaser from 'phaser';
import { ROOM, wallL, wallR } from '../world/apartment';
import { SHOT_MARK } from '../world/garage';
import { ARENA_FURNITURE, VERTEC } from '../world/arenaGym';
import { buildGarageArt } from './garageArt';
import { shade, tint } from './sprites';
import { C, ArtPiece, ART_W, ART_H, AX, AY, HF, yOfRow, BEAM_TOP, WALL_TOP, FLOOR_ROW, POST_L, POST_R, R, P, hn, mix, canvas } from './roomArt';

/**
 * Round 85 (owner): the arena gym's background, on the rooms' pixel grid: the arena with nobody in it. Rows of empty
 * seats rising up the back (and the sides), the rafters and the light rigs above, an LED board along the bottom of
 * the stands, a hardwood court floor with the key, the free-throw circle and the three-point arc in front of the hoop
 * (the hoop is on the left wall facing right, like the garage's), a measuring pole for the vertical jump, the shooting
 * mark, a mat for the pressure drill, and the scouts' bench along the right side. `color` is the home team's (the
 * paint, the seats' trim, the LED stripe); the combine is navy.
 */
const WOOD = ['#d9a35e', '#cf9852', '#e2ae6a', '#d49d58'];

function drawCeiling(c: C, col: string) {
  for (let y = 0; y < WALL_TOP; y++) for (let x = 0; x < ART_W; x++) P(c, x, y, y < BEAM_TOP ? (hn(x >> 4, y >> 3, 3) < 0.15 ? '#141a2c' : '#0e1322') : '#1a2136');
  // trusses
  for (let x = 30; x < ART_W; x += 120) { R(c, x, 0, 4, BEAM_TOP, '#252d46'); for (let y = 0; y < BEAM_TOP; y += 12) R(c, x - 8, y, 20, 1, '#252d46'); }
  R(c, 0, 20, ART_W, 3, '#252d46'); R(c, 0, 52, ART_W, 3, '#252d46');
  // light rigs: bright panels with a soft halo
  for (let x = 120; x < ART_W - 60; x += 180) {
    for (let k = 0; k < 6; k++) R(c, x - 26 - k, 32 + k, 52 + k * 2, 1, mix('#0e1322', '#fff6d8', 0.12 * (6 - k) / 6));
    R(c, x - 22, 30, 44, 7, '#3a3f52'); R(c, x - 20, 31, 40, 4, '#fff6d8'); R(c, x - 18, 32, 8, 2, '#ffffff');
  }
  // the banner rail at the top of the stands (the team's color)
  R(c, 0, BEAM_TOP + 4, ART_W, 6, shade(col, 0.6)); R(c, 0, BEAM_TOP + 4, ART_W, 1, tint(col, 0.3));
}

/** Rows of empty seats between x0 and x1, from y0 down to y1 (the front rows lower and lighter). */
function stands(c: C, x0: number, x1: number, y0: number, y1: number, col: string, aisles: number[]) {
  const seat = shade(mix(col, '#2a3550', 0.55), 0.95);
  for (let y = y0; y < y1; y++) {
    const row = Math.floor((y - y0) / 9), ry = (y - y0) % 9, k = (y - y0) / Math.max(1, y1 - y0);
    for (let x = x0; x < x1; x++) {
      let p: string;
      const aisle = aisles.some((a) => Math.abs(x - a) < 5);
      if (aisle) p = ry === 8 || ry === 4 ? '#3a3f4c' : '#565b66';                           // stairs
      else if (ry >= 7) p = '#151a26';                                                          // the riser
      else if ((x + row * 3) % 8 >= 6) p = '#1c2230';                                          // gap between seats
      else p = ry < 2 ? tint(seat, 0.18) : ry < 4 ? seat : shade(seat, 0.8);                    // seat back, then the seat
      P(c, x, y, shade(p, 0.55 + 0.45 * k));
    }
  }
}

function drawStandsAndWalls(c: C, col: string) {
  const bx0 = Math.round(AX(ROOM.backL)), bx1 = Math.round(AX(ROOM.backR));
  stands(c, bx0, bx1, WALL_TOP, FLOOR_ROW - 18, col, [bx0 + 70, Math.round((bx0 + bx1) / 2), bx1 - 70]);
  // the LED board along the bottom of the stands: dark, the team's stripe, a few lit blocks
  for (let y = FLOOR_ROW - 18; y < FLOOR_ROW; y++) for (let x = bx0; x < bx1; x++) P(c, x, y, y < FLOOR_ROW - 15 ? '#2a2f3a' : '#0c0f16');
  R(c, bx0, FLOOR_ROW - 12, bx1 - bx0, 3, col); R(c, bx0, FLOOR_ROW - 12, bx1 - bx0, 1, tint(col, 0.4));
  for (let x = bx0 + 20; x < bx1 - 30; x += 90) R(c, x, FLOOR_ROW - 7, 40, 3, tint(col, 0.55));
  // the side walls: more empty seats, seen at an angle (darker)
  for (let y = WALL_TOP; y < ART_H; y++) {
    const yf = y < FLOOR_ROW ? 0 : yOfRow(y);
    const lx = y < FLOOR_ROW ? bx0 : AX(wallL(yf)), rx = y < FLOOR_ROW ? bx1 : AX(wallR(yf));
    for (let x = Math.round(rx); x < POST_R[1] + 4; x++) { const row = Math.floor((y - WALL_TOP) / 7); P(c, x, y, shade((y + x * 0.4) % 7 > 5 ? '#151a26' : (x + row * 2) % 9 > 6 ? '#1c2230' : mix(col, '#2a3550', 0.6), 0.5)); }
    for (let x = 0; x < Math.round(lx); x++) { const row = Math.floor((y - WALL_TOP) / 7); P(c, x, y, shade((y - x * 0.4) % 7 > 5 ? '#151a26' : (x + row * 2) % 9 > 6 ? '#1c2230' : mix(col, '#2a3550', 0.6), 0.45)); }
  }
}

function drawFloor(c: C, col: string) {
  for (let y = FLOOR_ROW; y < ART_H; y++) {
    const yf = yOfRow(y), lx = Math.round(AX(wallL(yf))), rx = Math.round(AX(wallR(yf)));
    const strip = Math.floor(yf * 2.2);
    for (let x = lx; x < rx; x++) {
      let p = WOOD[(strip * 3 + Math.floor((x + strip * 37) / 46)) % WOOD.length];
      if ((x + strip * 37) % 46 === 0) p = shade(p, 0.85);                                     // plank ends
      if (hn(x, y, 31) < 0.04) p = shade(p, 0.94);
      const glow = Math.max(0, 1 - Math.hypot((x - 500) / 380, (y - 400) / 140));
      p = mix(p, '#fff1d0', glow * 0.22);                                                      // the lights' sheen
      p = shade(p, 0.82 + 0.18 * Math.min(1, (x - lx) / 50, (rx - x) / 50));
      P(c, x, y, p);
    }
  }
  // the court, in feet: the rim's floor point, the paint, the free-throw circle, the arc (only where the floor is)
  const rim = { x: 4.6, y: SHOT_MARK.y }, inFloor = (fx: number, fy: number) => fy > 0.2 && fy < ROOM.depth - 0.1 && fx > wallL(fy) + 0.1 && fx < wallR(fy) - 0.1;
  const dot = (fx: number, fy: number, p: string) => { if (inFloor(fx, fy)) R(c, Math.round(AX(fx)), Math.round(AY(fy)), 2, 2, p); };
  const paintY0 = rim.y - 6, paintY1 = rim.y + 6, ftX = 18.6;
  for (let y = Math.round(AY(paintY0)); y <= Math.round(AY(paintY1)); y++) {
    const yf = yOfRow(y), lx = Math.round(AX(Math.max(wallL(yf), 0))), x1 = Math.round(AX(ftX));
    for (let x = lx; x < x1; x++) P(c, x, y, mix(WOOD[(Math.floor(yf * 2.2) * 3 + Math.floor(x / 46)) % WOOD.length], col, 0.7)); // the paint: the team's color on the wood
  }
  const W = '#f4f1e8';
  for (let fx = wallL(paintY0); fx <= ftX; fx += 0.1) { dot(fx, paintY0, W); dot(fx, paintY1, W); }
  for (let fy = paintY0; fy <= paintY1; fy += 0.08) dot(ftX, fy, W);
  for (let a = 0; a < Math.PI * 2; a += 0.012) { const fx = ftX + Math.cos(a) * 6, fy = rim.y + Math.sin(a) * 6; if (Math.cos(a) > 0 || Math.floor(a * 30) % 2 === 0) dot(fx, fy, W); }
  for (let a = -Math.PI / 2; a <= Math.PI / 2; a += 0.004) dot(rim.x + Math.cos(a) * 22, rim.y + Math.sin(a) * 22, W);
  // the restricted-area arc under the rim
  for (let a = -Math.PI / 2; a <= Math.PI / 2; a += 0.02) dot(rim.x + Math.cos(a) * 4, rim.y + Math.sin(a) * 4, W);
  // the shooting mark (tape) and the pressure-drill mat
  { const qx = Math.round(AX(SHOT_MARK.x)), qy = Math.round(AY(SHOT_MARK.y)); R(c, qx - 12, qy - 8, 24, 16, '#7a1a14'); R(c, qx - 11, qy - 7, 22, 14, '#d63a2a'); R(c, qx - 11, qy - 7, 22, 1, '#ef6a52'); }
  { const mx0 = Math.round(AX(15.6)), mx1 = Math.round(AX(23.2)), my0 = Math.round(AY(8.6)), my1 = Math.round(AY(11.8));
    R(c, mx0, my0, mx1 - mx0, my1 - my0, '#1c1d20'); R(c, mx0 + 2, my0 + 2, mx1 - mx0 - 4, my1 - my0 - 4, '#2a2c30');
    R(c, mx0 + 4, my0 + 3, mx1 - mx0 - 8, 1, '#e8eaec'); R(c, mx0 + 4, my1 - 4, mx1 - mx0 - 8, 1, '#e8eaec'); R(c, mx0, my1, mx1 - mx0, 1, '#121315'); }
}

/** The vertical-jump measuring pole: a black pole on a heavy base, the vanes stacked near the top reaching left. */
function drawVertec(c: C) {
  const x = Math.round(AX(VERTEC.x)), fy = Math.round(AY(VERTEC.y)), top = fy - Math.round(11 * HF);
  R(c, x - 9, fy - 3, 18, 5, '#1c1d20'); R(c, x - 8, fy - 3, 16, 1, '#4a4f58');               // the base
  R(c, x - 1, top, 3, fy - top, '#2a2d33'); R(c, x - 1, top, 1, fy - top, '#5a6068');            // the pole
  for (let i = 0; i < 18; i++) {
    const vy = top + 4 + i * 3, len = 22 - (i % 3) * 2;
    R(c, x - len, vy, len, 2, ['#d63a2a', '#f4f1e8', '#2a5ab0'][i % 3]); R(c, x - len, vy + 1, len, 1, shade(['#d63a2a', '#f4f1e8', '#2a5ab0'][i % 3], 0.75));
  }
}

export function drawArenaGymBackground(col: string): HTMLCanvasElement {
  const cv = canvas(ART_W, ART_H), c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  drawCeiling(c, col); drawStandsAndWalls(c, col); drawFloor(c, col); drawVertec(c); // round 87: the scouts bring their own chairs (ScoutRow)
  // dark edges where the room's posts would be
  R(c, POST_L[0] - 4, WALL_TOP, POST_L[1] - POST_L[0] + 4, ART_H - WALL_TOP, '#0b0e18');
  return cv;
}

/** The arena gym's art: the background for `color`, and the garage's hoop, squat rack and bench press. */
export function buildArenaGymArt(tm: Phaser.Textures.TextureManager, color: string): { bg: string; pieces: ArtPiece[] } {
  const bg = `arena_gym_bg_${color}`;
  if (!tm.exists(bg)) tm.addCanvas(bg, drawArenaGymBackground(color));
  const keep = new Set(ARENA_FURNITURE.map((p) => p.id));
  return { bg, pieces: buildGarageArt(tm).pieces.filter((p) => p.piece && keep.has(p.piece.id)) };
}
