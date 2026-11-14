import Phaser from 'phaser';
import { ROOM, wallL, wallR } from '../world/apartment';
import { CITY_GYM_FURNITURE } from '../world/cityGym';
import { shade, tint } from './sprites';
import { C, ArtPiece, ART_W, ART_H, AX, AY, yOfRow, BEAM_TOP, WALL_TOP, FLOOR_ROW, POST_L, POST_R, R, P, hn, mix, drawPost, canvas, text3, textW } from './roomArt';
import { buildGarageArt } from './garageArt';

/**
 * Round 93 (owner): Iron Works, the big gym downtown, on the rooms' cutaway frame: black rubber floor tiles, a mirror
 * wall at the back with the red IRON WORKS band, a dumbbell rack under it, strip lights in a black ceiling, the glass
 * door out to the street, and the towers outside the left post. The machines are the garage's.
 */
function bigText(c: C, x: number, y: number, s: string, col: string) {
  const w = textW(s), t = canvas(w + 1, 6), tc = t.getContext('2d')!;
  text3(tc, 0, 0, s, col);
  c.imageSmoothingEnabled = false;
  c.drawImage(t, 0, 0, w + 1, 6, x, y, (w + 1) * 2, 12);
}

export function drawCityGymBackground(): HTMLCanvasElement {
  const cv = canvas(ART_W, ART_H), c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  // outside the left post: dusk sky, the towers, their windows
  for (let y = 0; y < ART_H; y++) for (let x = 0; x < ART_W; x++) if (x < POST_L[0] || x >= POST_R[1]) P(c, x, y, mix('#f0a868', '#5a6a9a', Math.min(1, y / 240)));
  const rx = POST_R[1];
  for (const [x0, w, top] of [[0, 34, 120], [30, 40, 70], [66, 30, 150], [92, 20, 100], [rx, 30, 90], [rx + 26, 40, 140], [rx + 62, 40, 60]] as const) {
    R(c, x0, top, w, ART_H - top, '#2e3440'); R(c, x0, top, 1, ART_H - top, '#4a5262');
    for (let y = top + 6; y < ART_H; y += 8) for (let x = x0 + 4; x < x0 + w - 3; x += 6) if (hn(x, y, 91) < 0.55) R(c, x, y, 3, 4, hn(x, y, 92) < 0.6 ? '#f6e08a' : '#5a6478');
  }
  // the ceiling: black, strip lights
  for (let y = 0; y < BEAM_TOP; y++) for (let x = POST_L[1]; x < POST_R[0]; x++) P(c, x, y, hn(x >> 2, y >> 2, 93) < 0.1 ? '#24262a' : '#1c1e22');
  for (let x = POST_L[1] + 30; x < POST_R[0] - 40; x += 96) for (const y of [24, 54]) { R(c, x - 1, y - 1, 38, 5, '#3a3d42'); R(c, x, y, 36, 3, '#f4f8ff'); }
  // the steel beam
  for (let y = BEAM_TOP; y < WALL_TOP; y++) for (let x = POST_L[0] - 4; x < POST_R[1] + 4; x++) P(c, x, y, y === BEAM_TOP ? '#6a6e74' : y >= WALL_TOP - 2 ? '#24262a' : '#45484e');
  // the back wall: mirrors between black pillars, a red band with the name across the top
  const bx0 = Math.round(AX(ROOM.backL)), bx1 = Math.round(AX(ROOM.backR));
  for (let y = WALL_TOP; y < FLOOR_ROW; y++) for (let x = bx0; x < bx1; x++) {
    const seg = (x - bx0) % 92, pillar = seg < 6;
    let col: string;
    if (y < WALL_TOP + 22) col = y === WALL_TOP + 21 ? '#5a1410' : '#b8322a';
    else if (y > FLOOR_ROW - 12) col = y === FLOOR_ROW - 12 ? '#5a5e64' : '#2a2c30';
    else if (pillar) col = seg === 0 ? '#3a3d42' : '#1e2024';
    else {
      const streak = ((x - bx0) * 0.7 + (y - WALL_TOP)) % 60 < 6;
      col = mix('#9fb4c4', '#c8d6e0', (y - WALL_TOP) / (FLOOR_ROW - WALL_TOP));
      if (streak) col = tint(col, 0.35); else if (hn(x, y, 94) < 0.03) col = shade(col, 0.92);
    }
    P(c, x, y, col);
  }
  const name = 'IRON WORKS', nx = Math.round((bx0 + bx1) / 2 - textW(name));
  bigText(c, nx + 1, WALL_TOP + 6, name, '#5a1410'); bigText(c, nx, WALL_TOP + 5, name, '#ffffff');
  // the glass door to the street (back wall, right)
  const d0 = Math.round(AX(30.4)), d1 = Math.round(AX(33.2));
  R(c, d0 - 2, WALL_TOP + 26, d1 - d0 + 4, FLOOR_ROW - WALL_TOP - 26, '#141618');
  R(c, d0, WALL_TOP + 28, d1 - d0, FLOOR_ROW - WALL_TOP - 28, '#5a7a9a'); R(c, d0 + 3, WALL_TOP + 30, 3, FLOOR_ROW - WALL_TOP - 34, '#9ec4e0');
  R(c, Math.round((d0 + d1) / 2), WALL_TOP + 28, 1, FLOOR_ROW - WALL_TOP - 28, '#141618');
  // side walls: dark painted block
  for (let y = WALL_TOP; y < ART_H; y++) {
    const yf = y < FLOOR_ROW ? 0 : yOfRow(y);
    const lx = y < FLOOR_ROW ? bx0 : AX(wallL(yf)), rx = y < FLOOR_ROW ? bx1 : AX(wallR(yf));
    for (let x = Math.round(rx); x < POST_R[0]; x++) P(c, x, y, x <= Math.round(rx) + 1 ? '#202226' : (y - WALL_TOP) % 10 === 0 ? '#2e3136' : '#383b40');
    for (let x = POST_L[1]; x < Math.round(lx); x++) P(c, x, y, x >= Math.round(lx) - 2 ? '#1c1e22' : (y - WALL_TOP) % 10 === 0 ? '#2a2d32' : '#34373c');
  }
  // the rubber floor: square tiles, flecks, a red lane line, lit in the middle
  for (let y = FLOOR_ROW; y < ART_H; y++) {
    const yf = yOfRow(y), lx = Math.round(AX(wallL(yf))), rx = Math.round(AX(wallR(yf)));
    for (let x = lx; x < rx; x++) {
      let col = (x - lx) % 28 === 0 || (y - FLOOR_ROW) % 14 === 0 ? '#16171a' : hn(x, y, 95) < 0.05 ? '#4a4d52' : hn(x >> 1, y >> 1, 96) < 0.5 ? '#26282c' : '#2a2c30';
      if (Math.abs(yf - 9.2) < 0.18) col = '#b8322a';
      const lamp = Math.max(0, 1 - Math.hypot((x - 520) / 320, (y - 320) / 110));
      P(c, x, y, mix(col, '#7a7e86', lamp * 0.22));
    }
  }
  // a dumbbell rack under the mirrors (left of the bench)
  const ry = FLOOR_ROW - 4, rx0 = bx0 + 18;
  R(c, rx0, ry - 10, 120, 3, '#5a5e64'); R(c, rx0, ry - 2, 120, 3, '#5a5e64'); R(c, rx0, ry - 10, 2, 11, '#3a3d42'); R(c, rx0 + 118, ry - 10, 2, 11, '#3a3d42');
  for (let k = 0; k < 9; k++) for (const yy of [ry - 13, ry - 5]) { const x = rx0 + 6 + k * 12; R(c, x, yy, 3, 4, '#1a1b1e'); R(c, x + 3, yy + 1, 4, 2, '#9aa0a6'); R(c, x + 7, yy, 3, 4, '#1a1b1e'); }
  R(c, bx0, FLOOR_ROW, bx1 - bx0, 2, '#0e0f11');
  drawPost(c, POST_L[0], POST_L[1]); drawPost(c, POST_R[0], POST_R[1]);
  return cv;
}

/** The gym's background + the garage's machines (only the ones in here). */
export function buildCityGymArt(tm: Phaser.Textures.TextureManager): { bg: string; pieces: ArtPiece[] } {
  const bg = 'city_gym_bg_v1';
  if (!tm.exists(bg)) tm.addCanvas(bg, drawCityGymBackground());
  const keep = new Set(CITY_GYM_FURNITURE.map((p) => p.id));
  return { bg, pieces: buildGarageArt(tm).pieces.filter((p) => p.piece && keep.has(p.piece.id)) };
}
