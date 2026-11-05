import Phaser from 'phaser';
import { Piece, ROOM, wallL, wallR, footprint } from '../world/apartment';
import { GARAGE_FURNITURE, GARAGE_DOORS, CAR, SHOT_MARK } from '../world/garage';
import { shade, tint } from './sprites';
import {
  C, ArtPiece, ART_W, ART_H, AS, HF, AX, AY, yOfRow, BEAM_TOP, WALL_TOP, FLOOR_ROW, POST_L, POST_R,
  R, P, hn, mix, OL, block, onWall, drawPost, canvas, text3, textW, figure, hang, posterFrame, bake,
} from './roomArt';

/**
 * The garage gym (round 37), drawn on the same pixel grid and with the same shading recipe as the apartment.
 * Orientation follows the owner's reference for every object (see DECISIONS / CLAUDE.md): bench long axis left→right
 * with the bar running into the room (plates face-on), squat rack facing us, treadmill console at the back, dip
 * station + speed bag on the wall, the hoop with its back to the left wall facing right, the van along the right wall
 * nose toward us.
 */
const FLOOR = ['#8e9095', '#878a8f', '#93959a', '#8a8c90'];
const STEEL = '#3a3d42', STEEL_L = '#6a6f76', CHROME = '#c9cfd4';

// ---------------------------------------------------------------- background
function drawYardLeft(c: C) {
  const x1 = POST_L[0];
  R(c, 0, 0, x1, 300, '#bfe0ee');
  // fence
  for (let x = 0; x < x1; x++) { const k = x % 9; if (k < 6) { const tip = k === 2 || k === 3 ? 232 : k === 1 || k === 4 ? 233 : 235; R(c, x, tip, 1, 310 - tip, k === 0 ? '#c9c4b9' : k === 5 ? '#d6d1c6' : '#ece8df'); } }
  R(c, 0, 250, x1, 3, '#d6d1c6'); R(c, 0, 286, x1, 3, '#d6d1c6');
  // grass + a dirt patch under the bars
  for (let y = 300; y < ART_H; y++) for (let x = 0; x < x1; x++) {
    let col = ['#5f9a3a', '#6fae44', '#558c33', '#4f8530'][Math.floor(hn(x, y, 7) * 4)];
    if (Math.hypot((x - 52) / 40, (y - 430) / 12) < 1) col = hn(x, y, 8) < 0.2 ? '#b8935a' : '#caa66b';
    P(c, x, y, col);
  }
  // tree
  R(c, 54, 120, 18, 200, '#6a4a2e'); R(c, 54, 120, 4, 200, '#82603e'); R(c, 68, 120, 4, 200, '#523720');
  const blobs: [number, number, number][] = [[60, 60, 46], [25, 95, 32], [92, 100, 30], [40, 30, 32], [80, 35, 30], [60, 130, 28]];
  for (const [bx, by, r] of blobs) for (let y = Math.max(0, by - r); y < by + r; y++) for (let x = Math.max(0, bx - r); x < Math.min(x1, bx + r); x++) {
    const d = Math.hypot(x - bx, (y - by) * 1.1) / r;
    if (d > 1 - hn(x, y, 9) * 0.12) continue;
    const lit = (x - bx) + (y - by) < -r * 0.3, dark = (x - bx) + (y - by) > r * 0.5, n = hn(x >> 2, y >> 2, 11);
    P(c, x, y, dark ? '#3d6e25' : lit ? (n < 0.4 ? '#77b847' : '#66a63a') : n < 0.25 ? '#66a63a' : '#4f8a2f');
  }
  // outdoor pull-up bars: two wooden posts, a steel bar
  for (const px of [18, 86]) { R(c, px - 1, 340, 8, 112, '#3a2616'); R(c, px, 340, 6, 110, '#7a5232'); R(c, px, 340, 2, 110, '#9a6c44'); }
  R(c, 18, 346, 74, 4, '#2e3134'); R(c, 18, 346, 74, 1, '#9aa2a6');
}

function drawShell(c: C) {
  // roof tiles above the beam (the garage has a pitched roof)
  for (let y = 0; y < BEAM_TOP; y++) for (let x = POST_L[1]; x < POST_R[0]; x++) {
    const row = Math.floor(y / 8), off = (row % 2) * 7, tx = (x + off) % 14, ty = y % 8;
    let col = ['#4b535b', '#555e66', '#434a51'][(Math.floor((x + off) / 14) + row) % 3];
    if (ty === 7) col = '#2c3136'; else if (tx === 0) col = '#353b41'; else if (ty < 2) col = tint(col, 0.12);
    P(c, x, y, col);
  }
  for (let y = BEAM_TOP; y < WALL_TOP; y++) for (let x = POST_L[0] - 4; x < POST_R[1] + 4; x++) {
    let col = '#86593a';
    if (y === BEAM_TOP) col = '#a8784f'; else if (y >= WALL_TOP - 3) col = '#5c3b25'; else if (hn(x >> 3, y, 4) < 0.18) col = '#76502f';
    P(c, x, y, col);
  }
  // back wall: tan brick panels between plaster pillars, a concrete plinth at the bottom
  const bx0 = Math.round(AX(ROOM.backL)), bx1 = Math.round(AX(ROOM.backR));
  const pillars: [number, number][] = [[bx0, bx0 + 12], [426, 438], [604, 616], [bx1 - 12, bx1]];
  for (let y = WALL_TOP; y < FLOOR_ROW; y++) for (let x = bx0; x < bx1; x++) {
    const pil = pillars.find(([a, b]) => x >= a && x < b);
    let col: string;
    if (y > FLOOR_ROW - 16) col = y === FLOOR_ROW - 16 ? '#c4b8a0' : hn(x, y, 3) < 0.08 ? '#9a917e' : '#a89f8a';
    else if (pil) col = x === pil[0] ? '#d2c6ad' : x === pil[1] - 1 ? '#9e927a' : hn(x, y, 5) < 0.05 ? '#b0a48b' : '#beb298';
    else {
      const row = Math.floor((y - WALL_TOP) / 5), off = (row % 2) * 5, bxp = (x - bx0 + off) % 10, byp = (y - WALL_TOP) % 5;
      col = ['#c9a77a', '#bf9c6e', '#d2b285', '#b8956a'][(Math.floor((x - bx0 + off) / 10) * 7 + row * 3) % 4];
      if (byp === 4 || bxp === 9) col = '#8e7656'; else if (byp === 0) col = tint(col, 0.1);
    }
    if (y < WALL_TOP + 8) col = shade(col, 0.8 + (y - WALL_TOP) * 0.025);
    P(c, x, y, col);
  }
  // side walls: plaster
  for (let y = WALL_TOP; y < ART_H; y++) {
    const yf = y < FLOOR_ROW ? 0 : yOfRow(y);
    const lx = y < FLOOR_ROW ? bx0 : AX(wallL(yf)), rx = y < FLOOR_ROW ? bx1 : AX(wallR(yf));
    for (let x = Math.round(rx); x < POST_R[0]; x++) P(c, x, y, x <= Math.round(rx) + 1 ? '#a08f70' : hn(x, y, 13) < 0.05 ? '#a99878' : y < WALL_TOP + 8 ? '#a49374' : '#b5a383');
    for (let x = POST_L[1]; x < Math.round(lx); x++) P(c, x, y, x >= Math.round(lx) - 2 ? '#857761' : hn(x, y, 12) < 0.05 ? '#8f8169' : y < WALL_TOP + 8 ? '#867862' : '#9b8d74');
  }
  // concrete floor: mottled, darker toward the walls, a few cracks and an oil stain by the van
  for (let y = FLOOR_ROW; y < ART_H; y++) {
    const yf = yOfRow(y), lx = Math.round(AX(wallL(yf))), rx = Math.round(AX(wallR(yf)));
    for (let x = lx; x < rx; x++) {
      let col = FLOOR[Math.floor(hn(x >> 1, y >> 1, 21) * FLOOR.length)];
      if (hn(x >> 3, y >> 2, 22) < 0.12) col = shade(col, 0.95);
      if (hn(x, y, 23) < 0.03) col = tint(col, 0.12);
      const lamp = Math.max(0, 1 - Math.hypot((x - 520) / 300, (y - 300) / 90));
      col = mix(col, '#d8cfb8', lamp * 0.18);
      const edge = Math.min(1, (x - lx) / 40, (rx - x) / 40);
      col = shade(col, 0.8 + 0.2 * Math.max(0, edge));
      if (Math.hypot((x - AX(34.6)) / 30, (y - AY(19.0)) / 9) < 1) col = mix(col, '#2a2b2e', 0.55 + 0.2 * hn(x, y, 24)); // oil stain
      P(c, x, y, col);
    }
  }
  const crack = (pts: [number, number][]) => { for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let k = 0; k <= n; k++) P(c, Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), '#5f6166'); } };
  crack([[300, 380], [312, 386], [318, 384], [330, 392]]); crack([[560, 470], [566, 462], [578, 458], [584, 450]]); crack([[420, 330], [428, 336], [440, 335]]);
  // expansion joints
  for (let x = Math.round(AX(wallL(14))); x < Math.round(AX(wallR(14))); x++) if (hn(x, 0, 25) > 0.1) P(c, x, Math.round(AY(14)), '#727479');
  // baseboard shadow along the back wall
  R(c, bx0, FLOOR_ROW, bx1 - bx0, 2, '#5a5c60');
}

function drawWallStuff(c: C) {
  const bx0 = Math.round(AX(ROOM.backL)), bx1 = Math.round(AX(ROOM.backR));
  drawPosters(c); // posters go up first: the duct and the hanging lamps are in front of them
  // galvanised duct along the top of the back wall with hangers, and three hanging lamps
  R(c, bx0, 112, bx1 - bx0, 13, '#5f676b'); R(c, bx0, 113, bx1 - bx0, 11, '#a3abaf'); R(c, bx0, 113, bx1 - bx0, 3, '#c6cdd0'); R(c, bx0, 121, bx1 - bx0, 3, '#7d8589');
  for (let x = bx0 + 30; x < bx1; x += 64) { R(c, x, 113, 2, 11, '#7d8589'); R(c, x, WALL_TOP, 2, 19, '#55595c'); }
  R(c, 340, 115, 10, 7, '#5f676b'); R(c, 341, 116, 8, 5, '#3a3f42'); // vent grilles
  R(c, 560, 115, 10, 7, '#5f676b'); R(c, 561, 116, 8, 5, '#3a3f42');
  for (const lx of [387, 571, 609]) {
    R(c, lx - 1, 124, 3, 8, '#3a3f42');
    for (let y = 0; y < 10; y++) { const hw = 4 + Math.round(y * 0.9); R(c, lx - hw - 1, 132 + y, hw * 2 + 3, 1, '#2f3437'); R(c, lx - hw, 132 + y, hw * 2 + 1, 1, y < 2 ? '#8e979c' : '#5f686d'); }
    R(c, lx - 4, 142, 9, 3, '#fff3c0'); R(c, lx - 2, 145, 5, 1, '#ffe08a');
  }
  // cobweb in the top-left corner
  const cw = { x: POST_L[1] + 2, y: WALL_TOP + 2 };
  for (let k = 0; k < 6; k++) { const a = (k / 5) * (Math.PI / 2); for (let r = 0; r < 34; r++) if (r % 2 === 0) P(c, cw.x + Math.round(Math.cos(a) * r), cw.y + Math.round(Math.sin(a) * r), 'rgba(235,235,235,0.6)'); }
  for (const r of [10, 18, 26]) for (let k = 0; k <= 12; k++) { const a = (k / 12) * (Math.PI / 2); P(c, cw.x + Math.round(Math.cos(a) * r), cw.y + Math.round(Math.sin(a) * r), 'rgba(235,235,235,0.55)'); }
  // conduit down the left wall + a switch box, cable to the beam
  onWall(c, 'L', 1.0, 1.25, 0, 11.6, () => '#8e969a');
  onWall(c, 'L', 1.25, 1.35, 0, 11.6, () => '#5f676b');
  onWall(c, 'L', 0.7, 1.7, 4.0, 4.9, (_x, _y, u, v) => (u < 0.1 || u > 0.9 || v < 0.1 || v > 0.9 ? '#3a3f42' : '#6f777b'));
  // two shelves on the left with clutter, one on the right with orange towels
  const shelf = (x0: number, x1: number, y: number) => {
    R(c, x0, y, x1 - x0, 4, '#9a6a3e'); R(c, x0, y, x1 - x0, 1, '#c08a58'); R(c, x0, y + 4, x1 - x0, 1, '#5e3e22');
    for (const bx of [x0 + 6, x1 - 8]) { R(c, bx, y + 4, 2, 8, '#3a3f42'); R(c, bx, y + 10, 6, 2, '#3a3f42'); }
    R(c, x0 + 2, y + 5, x1 - x0, 2, 'rgba(60,40,20,0.25)');
  };
  shelf(278, 352, 190); shelf(278, 352, 226); shelf(636, 674, 158);
  // clutter: paint cans, a toolbox, spray bottles, a trophy, folded towels
  R(c, 284, 178, 10, 12, '#33373b'); R(c, 285, 179, 8, 10, '#c9c2b0'); R(c, 285, 183, 8, 3, '#3f7fb3');
  R(c, 298, 180, 12, 10, '#33373b'); R(c, 299, 181, 10, 8, '#c9c2b0'); R(c, 299, 184, 10, 3, '#c84d3c');
  R(c, 316, 182, 22, 8, '#5a1d14'); R(c, 317, 183, 20, 6, '#c8433a'); R(c, 324, 180, 6, 2, '#2a2a2a');
  R(c, 342, 180, 4, 10, '#2f6fb5'); R(c, 343, 177, 2, 3, '#e8e8e8');
  R(c, 284, 216, 18, 10, '#6e4a1e'); R(c, 285, 217, 16, 8, '#b8864a'); R(c, 304, 214, 8, 12, '#3a3a3a'); R(c, 316, 219, 14, 7, '#a9b0b4'); R(c, 334, 212, 6, 14, '#e2b84a'); R(c, 333, 210, 8, 3, '#f0c44c');
  for (let k = 0; k < 3; k++) { R(c, 640, 152 - k * 4, 18, 4, '#5a2a0e'); R(c, 641, 152 - k * 4, 16, 3, k % 2 ? '#e07a2c' : '#f09040'); }
  R(c, 662, 148, 10, 10, '#2f3f5a'); R(c, 663, 149, 8, 8, '#4f6f9a');
  // wall-mounted dip station (two handles out from a bracket) and a speed bag under its platform
  const dx = Math.round(AX(25.1));
  R(c, dx - 9, 196, 18, 26, STEEL); R(c, dx - 8, 197, 16, 24, STEEL_L);
  for (const hx of [dx - 7, dx + 5]) { R(c, hx, 182, 3, 18, '#2a2d31'); R(c, hx, 182, 1, 18, '#8a9096'); R(c, hx - 1, 180, 5, 3, '#b0b6bb'); }
  R(c, dx - 12, 236, 24, 4, '#7a5232'); R(c, dx - 12, 236, 24, 1, '#a8784f'); R(c, dx - 4, 240, 8, 2, '#3a3f42');
  for (let y = 0; y < 13; y++) { const hw = Math.round(Math.sin(((y + 1) / 14) * Math.PI) * 5); R(c, dx - hw, 243 + y, hw * 2 + 1, 1, y < 4 ? '#e06a54' : y < 9 ? '#c8432e' : '#8a2a1c'); }
  R(c, dx, 242, 1, 2, '#2a2a2a');
  // power strip beside the door
  R(c, 622, 200, 6, 32, '#d8d4c8'); R(c, 622, 200, 6, 1, '#f2efe6'); for (let k = 0; k < 4; k++) R(c, 624, 204 + k * 7, 2, 3, '#5a5a5a');

}

function drawPosters(c: C) {
  // tribute posters: STONEY (the training-montage boxer, arms up), KG, THE ADMIRAL
  hang(c, 372, 148, 30, 46, -0.035, (pc) => { const x = 1, y = 1, w = 30, h = 46;
    posterFrame(pc, x, y, w, h, (u, v) => (v < 0.2 ? '#efe4c8' : mix('#cbb48a', '#8a6a44', (v - 0.2) / 0.8)));
    for (let k = 0; k < 7; k++) R(pc, x + 4 + k * 3, y + 30 - (k % 3) * 2, 2, 8 + (k % 3) * 2, '#6e5236'); // the steps / city
    figure(pc, x + 15, y + 30, '#2a1a10', '#2a1a10', { head: [0, -14], hands: [[-8, -24], [8, -24]], feet: [[-4, 8], [4, 8]] });
    text3(pc, x + Math.round((w - textW('STONEY')) / 2), y + 2, 'STONEY', '#3a2a1a'); });
  hang(c, 554, 157, 30, 46, 0.05, (pc) => { const x = 1, y = 1, w = 30, h = 46;
    posterFrame(pc, x, y, w, h, (u, v) => mix('#1f5a3a', '#0e2e1d', v));
    figure(pc, x + 15, y + 34, '#0a1a10', '#f4f1e8', { head: [0, -14], hands: [[-10, -12], [10, -12]], feet: [[-4, 8], [4, 8]] });
    R(pc, x + 13, y + 15, 4, 2, '#c8433a'); // the scream
    text3(pc, x + Math.round((w - textW('KG')) / 2), y + 2, 'KG', '#f4f1e8');
    text3(pc, x + Math.round((w - textW('21')) / 2), y + 39, '21', '#8fd0a8'); });
  hang(c, 594, 148, 30, 40, -0.02, (pc) => { const x = 1, y = 1, w = 30, h = 40;
    posterFrame(pc, x, y, w, h, (u, v) => (v > 0.84 ? '#101010' : mix('#c9ccd0', '#6f757b', v / 0.84)));
    for (let k = 0; k < 6; k++) P(pc, x + 4 + Math.round(hn(k, 31) * 28), y + 10 + Math.round(hn(k, 32) * 14), ['#00a0a8', '#f2a03a', '#e2466a'][k % 3]); // fiesta confetti
    figure(pc, x + 15, y + 28, '#101010', '#f4f1e8', { head: [2, -13], hands: [[9, -20], [7, -18]], feet: [[-4, 5], [-1, 6]] });
    text3(pc, x + Math.round((w - textW('ADMIRAL')) / 2), y + 2, 'ADMIRAL', '#101010');
    text3(pc, x + Math.round((w - textW('50')) / 2), y + 34, '50', '#f4f1e8'); });
}

function drawHouseDoor(c: C) {
  // left wall: the door to the apartment (frame, two panels, brass knob), a doormat in front
  const L = GARAGE_DOORS.find((g) => g.side === 'L')!;
  onWall(c, 'L', L.span[0] - 0.25, L.span[1] + 0.25, 0, 7.4, (_x, _y, u, v) => (u < 0.06 || u > 0.94 || v > 0.965 ? '#d9cfb8' : null));
  onWall(c, 'L', L.span[0], L.span[1], 0, 7.0, (_x, _y, u, v) => {
    const wood = '#7b5235', pu = 1 - u;
    let col = wood;
    if (u < 0.04 || u > 0.96 || v > 0.985) col = shade(wood, 0.6);
    else if (pu > 0.16 && pu < 0.84 && ((v > 0.56 && v < 0.92) || (v > 0.08 && v < 0.48))) col = shade(wood, 0.88);
    if (pu > 0.84 && pu < 0.92 && v > 0.47 && v < 0.53) col = '#e2b84a';
    return col;
  });
  { const sx = AX(L.spot.x), sy = AY(L.spot.y);
    for (let y = -8; y < 8; y++) for (let x = -14; x < 14; x++) P(c, Math.round(sx + x + 0.55 * y - 4), Math.round(sy + y * 0.9), Math.abs(x) > 12 || Math.abs(y) > 6 ? '#5a4632' : (x + y) % 3 === 0 ? '#7a5e3c' : '#8a6a44'); }
  const d = GARAGE_DOORS.find((g) => g.side === 'B')!;
  const x0 = Math.round(AX(d.span[0])), x1 = Math.round(AX(d.span[1])), top = Math.round(AY(0) - 7 * HF);
  R(c, x0 - 4, top - 4, x1 - x0 + 8, FLOOR_ROW - top + 4, '#5a4632'); R(c, x0 - 3, top - 3, x1 - x0 + 6, 2, '#8a6e50');
  R(c, x0, top, x1 - x0, FLOOR_ROW - top, '#7a3f2e');
  R(c, x0, top, 2, FLOOR_ROW - top, '#9a5440'); R(c, x1 - 2, top, 2, FLOOR_ROW - top, '#5a2c1f');
  R(c, x0 + 6, top + 8, x1 - x0 - 12, 40, '#6e3829'); R(c, x0 + 6, top + 56, x1 - x0 - 12, 48, '#6e3829');
  R(c, x1 - 10, top + 58, 6, 2, '#c9cfd2'); R(c, x1 - 9, top + 60, 2, 3, '#9aa2a6');
  // doormat
  R(c, x0 - 2, FLOOR_ROW + 4, x1 - x0 + 4, 9, '#5a4632'); R(c, x0 - 1, FLOOR_ROW + 5, x1 - x0 + 2, 7, '#8a6a44');
}

function drawFloorStuff(c: C) {
  // dark rubber dribbling mat (round 40): speckled black rubber, a painted white border, a ball logo off to the left
  // and two worn foot marks where you stand (wide stance, facing us)
  const mx0 = Math.round(AX(15.6)), mx1 = Math.round(AX(23.2)), my0 = Math.round(AY(8.6)), my1 = Math.round(AY(11.8));
  const lx = AX(16.9), ly = AY(10.2), lrx = 10, lry = 6;                       // the logo (an ellipse: it lies on the floor)
  const feet = [AX(18.6), AX(20.2)], fy = AY(10.45);
  for (let y = my0; y < my1; y++) for (let x = mx0; x < mx1; x++) {
    let col = hn(x, y, 41) < 0.12 ? '#3a3d42' : hn(x, y, 42) < 0.05 ? '#1a1b1e' : '#2a2c30';
    const edge = x < mx0 + 2 || x > mx1 - 3 || y < my0 + 2 || y > my1 - 3;
    const line = !edge && (x === mx0 + 4 || x === mx1 - 5 || y === my0 + 3 || y === my1 - 4);
    if (edge) col = '#1c1d20';
    else if (line) col = hn(x, y, 43) < 0.1 ? '#b8bcc0' : '#e8eaec';                     // painted border, a little worn
    else {
      const ex = (x - lx) / lrx, ey = (y - ly) / lry, e = ex * ex + ey * ey;
      if (e < 1) {
        col = e > 0.72 ? '#7a3412' : '#d9692a';
        if (Math.abs(ex) < 0.09 || Math.abs(ey) < 0.12) col = '#1d1d1d';                 // seams
        else if (Math.abs(Math.abs(ex) - 0.55 + ey * ey * 0.25) < 0.09) col = '#1d1d1d';
        else if (e < 0.72 && ex < -0.2 && ey < -0.2) col = '#f0904e';
      }
      for (const f of feet) { const fx = (x - f) / 5, fz = (y - fy) / 3; if (fx * fx + fz * fz < 1 && hn(x, y, 44) < 0.7) col = '#3e4147'; }
    }
    if (y === my0) col = '#121315';
    P(c, x, y, col);
  }
  // the mat's front lip (a little thickness)
  R(c, mx0, my1, mx1 - mx0, 1, '#121315');
  // the red square you shoot from (tape on the concrete), straight out from the rim
  { const qx = Math.round(AX(SHOT_MARK.x)), qy = Math.round(AY(SHOT_MARK.y)), hw = 11, hh = 7;
    R(c, qx - hw - 1, qy - hh - 1, hw * 2 + 2, hh * 2 + 2, '#7a1a14'); R(c, qx - hw, qy - hh, hw * 2, hh * 2, '#d63a2a'); R(c, qx - hw, qy - hh, hw * 2, 1, '#ef6a52');
    for (let k = 0; k < 10; k++) P(c, qx - hw + Math.round(hn(k, 71) * hw * 2), qy - hh + Math.round(hn(k, 72) * hh * 2), '#b83224'); }
  // a pair of trainers by the boxes, black kettlebell shadows are on the piece
  const SNEAKER = ['...ooooo.........', '..oCCCCUoo.......', '..oUUUUULLoo.....', '.oUHUUUUULLUoo...', '.oUUAAAAAUUUUUoo.', 'oSSSSSSSSSSSSSSSo', '.ooooooooooooooo.'];
  const pal: Record<string, string> = { o: '#1d1d1d', U: '#e8e4da', H: '#ffffff', C: '#2a2a2a', L: '#c8433a', A: '#c8433a', S: '#3a3a3a' };
  const shoe = (x: number, y: number) => SNEAKER.forEach((row, ry) => [...row].forEach((ch, rx) => { if (pal[ch]) P(c, x + rx, y + ry - SNEAKER.length, pal[ch]); }));
  shoe(Math.round(AX(6.6)), Math.round(AY(19.8))); shoe(Math.round(AX(6.6)) + 4, Math.round(AY(19.8)) + 5);
}

function drawContactShadows(c: C) {
  c.save(); c.fillStyle = 'rgba(30, 30, 34, 0.3)';
  for (const p of GARAGE_FURNITURE) {
    c.beginPath(); footprint(p).forEach((q, i) => { const x = AX(q.x) + 1, y = AY(q.y) + 2; if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.closePath(); c.fill();
  }
  c.restore();
}

export function drawGarageBackground(): HTMLCanvasElement {
  const cv = canvas(ART_W, ART_H), c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  // nothing is drawn past the right brick post: that's where the picture ends
  drawYardLeft(c); drawShell(c); drawWallStuff(c); drawHouseDoor(c); drawFloorStuff(c); drawContactShadows(c);
  drawPost(c, POST_L[0], POST_L[1]); drawPost(c, POST_R[0], POST_R[1]);
  return cv;
}

// ---------------------------------------------------------------- equipment
const plateFace = (c: C, cx: number, cy: number, r: number) => {
  for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) {
    const d = Math.hypot(x, y); if (d > r + 0.5) continue;
    let col = d > r - 0.7 ? '#141618' : d < 2.2 ? '#c9cfd4' : d < 3.2 ? '#2a2d31' : x + y < -r * 0.6 ? '#5a6068' : '#3a3f45';
    if (Math.abs(d - r * 0.7) < 0.5) col = '#24272b';
    P(c, cx + x, cy + y, col);
  }
};

/** Bench press: pad long axis left→right, uprights at the left end, the bar running into the room (plates face-on). */
function drawBench(c: C, p: Piece, frame = 0) {
  const padX0 = p.x + 1.7, padX1 = p.x + p.w - 0.2, py0 = p.y + 0.9, py1 = p.y + 2.1;
  // frame legs + pad
  for (const lx of [padX0 + 0.3, padX1 - 0.5]) block(c, lx, lx + 0.25, py0 + 0.2, py1 - 0.2, 1.25, STEEL);
  const pad = block(c, padX0, padX1, py0, py1, 1.55, '#7a1e22', { top: '#a8323a' });
  R(c, pad.x0 + 2, pad.top + 2, pad.x1 - pad.x0 - 4, 2, '#c84a52');
  R(c, pad.x0, pad.faceTop + 3, pad.x1 - pad.x0, pad.H - 3, '#1e2023'); R(c, pad.x0, pad.faceTop, pad.x1 - pad.x0, 3, '#5a1418');
  // uprights at the left end (one behind, one in front) with hooks; the bar runs between them into the room
  const ux = p.x + 0.7, barH = 3.5;
  const back = block(c, ux, ux + 0.3, p.y + 0.2, p.y + 0.5, 3.9, STEEL);
  const plateR = 11, bx = Math.round(AX(ux + 0.15));
  const by0 = Math.round(AY(p.y) - barH * HF), by1 = Math.round(AY(p.y + p.d) - barH * HF);
  if (frame === 0) { plateFace(c, bx, by0, plateR); R(c, bx - 1, by0, 3, by1 - by0, '#8e969a'); R(c, bx - 1, by0, 1, by1 - by0, CHROME); } // far plate + the bar
  const front = block(c, ux, ux + 0.3, p.y + p.d - 0.5, p.y + p.d - 0.2, 3.9, STEEL);
  for (const u of [back, front]) R(c, u.x0 - 2, u.faceTop + 6, u.x1 - u.x0 + 4, 2, STEEL_L);
  if (frame === 0) plateFace(c, bx, by1, plateR);                       // near plate
  void footprint;
}

/** Squat rack against the back wall, facing us: four uprights, J-hooks, a loaded bar left→right (plates edge-on). */
function drawSquatRack(c: C, p: Piece, frame = 0) {
  const x0 = p.x + 0.3, x1 = p.x + p.w - 0.3, yb = p.y + 0.2, yf = p.y + p.d - 0.3, H = 7.6;
  R(c, Math.round(AX(x0)) - 2, Math.round(AY(yf)) - 3, Math.round(AX(x1) - AX(x0)) + 6, 4, '#24272b'); // floor frame
  for (const ux of [x0, x1 - 0.3]) block(c, ux, ux + 0.3, yb, yb + 0.3, H, '#2c2f34');                // back uprights
  block(c, x0, x1, yb, yb + 0.3, 0.3, '#2c2f34'); // back base
  const top = block(c, x0, x1, yb, yf, 0.25, '#3a3d42', { noTop: false });
  R(c, top.x0, Math.round(AY(yb) - H * HF), top.x1 - top.x0, 4, '#2c2f34');                            // top crossmember (back)
  R(c, top.x0, Math.round(AY(yf) - H * HF), top.x1 - top.x0, 4, '#3a3d42');                            // top crossmember (front)
  // safety arms along the depth at knee height
  for (const ux of [x0 + 0.05, x1 - 0.25]) R(c, Math.round(AX(ux)), Math.round(AY(yb) - 2.3 * HF), 3, Math.round(AY(yf) - AY(yb)) + 1, '#9aa2a6');
  // the loaded bar on the J-hooks (in front of the back uprights, behind the front ones)
  const barY = Math.round(AY(yf - 0.2) - 4.6 * HF), bL = Math.round(AX(p.x - 0.8)), bR = Math.round(AX(p.x + p.w + 0.8));
  if (frame === 0) R(c, bL, barY - 1, bR - bL, 3, '#6e767a'); if (frame === 0) R(c, bL, barY - 1, bR - bL, 1, CHROME);
  if (frame === 0) for (const [px, dir] of [[Math.round(AX(p.x - 0.1)), -1], [Math.round(AX(p.x + p.w + 0.1)), 1]] as const) {
    for (let k = 0; k < 2; k++) {
      const ex = px + dir * k * 4, r = 13 - k * 3;
      R(c, ex - 2, barY - r - 1, 4, r * 2 + 2, '#141618'); R(c, ex - 1, barY - r, 2, r * 2, k ? '#3a6fb5' : '#2a2d31'); R(c, ex - 1, barY - r, 1, r * 2, k ? '#6a9ad8' : '#55595c');
    }
  }
  // front uprights with hole rows + J-hooks
  for (const ux of [x0, x1 - 0.3]) {
    const u = block(c, ux, ux + 0.3, yf - 0.3, yf, H, '#3a3d42');
    for (let y = u.faceTop + 6; y < u.yf - 6; y += 6) P(c, Math.round((u.x0 + u.x1) / 2), y, '#15171a');
    R(c, u.x0 - 1, barY - 3, u.x1 - u.x0 + 2, 5, '#c8433a');
  }
  // plate pegs on the side with spare plates
  plateFace(c, Math.round(AX(x1)) + 8, Math.round(AY(yf) - 1.0 * HF), 9);
}

/** Treadmill: belt along the depth, console + uprights at the back (you'd run facing the wall), side rails. */
function drawTreadmill(c: C, p: Piece) {
  const x0 = p.x, x1 = p.x + p.w;
  block(c, x0 + 0.1, x1 - 0.1, p.y, p.y + 1.0, 0.95, '#2c2f34', { top: '#4a4f55' });                  // motor hood
  // uprights + console at the back
  for (const ux of [x0 + 0.15, x1 - 0.4]) block(c, ux, ux + 0.25, p.y + 0.9, p.y + 1.15, 4.5, '#5a6068');
  const con = block(c, x0, x1, p.y + 0.7, p.y + 1.3, 0.6, '#2a2d31', { top: '#3a3f45' });
  const cy = Math.round(AY(p.y + 1.3) - 4.5 * HF);
  R(c, con.x0 + 2, cy - 6, con.x1 - con.x0 - 4, 8, '#1a1c1f'); R(c, con.x0 + 6, cy - 4, 16, 4, '#2f6f5a'); R(c, con.x0 + 7, cy - 3, 6, 1, '#7ee0b0'); P(c, con.x1 - 8, cy - 3, '#e85b4a');
  // deck + belt running toward us, side rails, handrails
  const deck = block(c, x0, x1, p.y + 1.0, p.y + p.d, 0.65, '#3a3d42', { top: '#1e2023' });
  for (let y = deck.top + 3; y < deck.faceTop - 1; y += 4) R(c, deck.x0 + 5, y, deck.x1 - deck.x0 - 10, 1, '#2b2e32');
  R(c, deck.x0, deck.top, 4, deck.faceTop - deck.top, '#8e969a'); R(c, deck.x1 - 4, deck.top, 4, deck.faceTop - deck.top, '#8e969a');
  for (const hx of [deck.x0 + 1, deck.x1 - 3]) R(c, hx, Math.round(AY(p.y + 1.2) - 3.4 * HF), 2, Math.round(AY(p.y + 3.2) - AY(p.y + 1.2)) + 4, '#c3cacd');
  R(c, deck.x0 + 2, deck.faceTop + 2, 4, 2, '#e85b4a');
}

/** The rim's centre and the floor right under it, in scene units (for the shooting station's ball). */
export function garageRim(): { x: number; y: number; floorY: number; depthFt: number } {
  const p = GARAGE_FURNITURE.find((f) => f.kind === 'hoop')!, yc = p.y + p.d / 2;
  const boardX = wallL(yc) + 0.2 + 1.2 + 3.1, rw = 0.75 * HF;
  const ax = Math.round(AX(boardX)) + 4 + rw, ay = Math.round(AY(yc) - 10 * HF);
  return { x: ax / AS, y: ay / AS, floorY: AY(yc) / AS, depthFt: p.y + p.d };
}

/** Portable hoop like the arena's: padded base against the left wall, pole, arm, glass board facing right, rim + net. */
function drawHoop(c: C, p: Piece) {
  const yc = p.y + p.d / 2, baseX0 = wallL(yc) + 0.2, baseX1 = baseX0 + 2.9;
  const base = block(c, baseX0, baseX1, p.y + 0.2, p.y + p.d - 0.2, 1.5, '#1f2a44', { top: '#2c3a5e' });
  R(c, base.x0 + 2, base.top + 2, base.x1 - base.x0 - 4, 2, '#3b4c78');
  const postX = baseX0 + 1.2, boardX = postX + 3.1, ps = Math.round(AX(postX)), pf = Math.round(AY(yc));
  // pole with pad wrap
  const poleTop = Math.round(pf - 12.6 * HF), poleBot = Math.round(pf - 1.5 * HF);
  R(c, ps - 4, poleTop, 9, poleBot - poleTop, '#2a2f3e'); R(c, ps - 3, poleTop, 7, poleBot - poleTop, '#4a5068'); R(c, ps - 3, poleTop, 2, poleBot - poleTop, '#6a7290');
  R(c, ps - 5, Math.round(pf - 6.5 * HF), 11, Math.round(3.3 * HF), '#1f2a44'); R(c, ps - 5, Math.round(pf - 6.5 * HF), 11, 2, '#3b4c78');
  // arm out to the board + brace
  const bxs = Math.round(AX(boardX)), armY = Math.round(pf - 12.75 * HF);
  R(c, ps, armY - 1, bxs - ps, 6, '#2a2f3e'); R(c, ps, armY, bxs - ps, 4, '#3e4359'); R(c, ps, armY, bxs - ps, 1, '#5a6280');
  for (let k = 0; k <= 30; k++) { const t = k / 30; R(c, Math.round(ps + (bxs - 10 - ps) * t), Math.round(pf - (9.6 + 2.6 * t) * HF), 3, 3, '#3e4359'); }
  // the backboard in pure side view (no perspective): it faces straight right, so we see only its edge — a thin
  // vertical slab — with the rim sticking straight out to the right and the net hanging under it
  const bx = Math.round(AX(boardX)), bTop = Math.round(AY(yc) - 13.1 * HF), bBot = Math.round(AY(yc) - 9.6 * HF);
  R(c, bx - 3, bTop - 1, 7, bBot - bTop + 2, '#3a4660');                 // outline
  R(c, bx - 2, bTop, 5, bBot - bTop, '#dfeaf7'); R(c, bx - 2, bTop, 1, bBot - bTop, '#ffffff'); R(c, bx + 2, bTop, 1, bBot - bTop, '#a9bdd6'); // glass edge
  R(c, bx - 3, bBot - 3, 7, 5, '#1f2a44');                              // padded bottom edge
  R(c, bx - 6, Math.round(AY(yc) - 12.0 * HF), 4, 10, '#3e4359');        // arm mount behind the board
  // rim: a flat ring seen side-on, on a bracket from the board; net below (a tapered mesh)
  const rimY = Math.round(AY(yc) - 10 * HF), rw = 0.75 * HF, rimX = bx + 4 + rw, rh = 2.2;
  R(c, bx + 2, rimY - 1, 5, 4, '#8a2e0a');
  const netH = Math.round(1.4 * HF);
  for (let y = 0; y <= netH; y++) {
    const t = y / netH, hw = rw * (1 - 0.42 * t), x0 = rimX - hw, x1 = rimX + hw;
    for (let x = Math.round(x0); x <= Math.round(x1); x++) {
      const dpos = ((x - rimX) + y * 0.9) % 6, dneg = ((x - rimX) - y * 0.9) % 6;
      if (Math.abs(dpos) < 0.7 || Math.abs(dneg) < 0.7 || x === Math.round(x0) || x === Math.round(x1)) P(c, x, rimY + 2 + y, y % 2 ? '#f4f4f4' : '#d8d8d8');
    }
  }
  for (let k = 0; k <= 40; k++) { const a = (k / 40) * Math.PI * 2; R(c, Math.round(rimX + Math.cos(a) * rw), Math.round(rimY + Math.sin(a) * rh), 2, 2, Math.sin(a) < 0 ? '#b8430e' : '#e05a14'); }
}

/**
 * A super broken classic fastback (our own drawing, no badges): faded red with grey primer and rust, the front-left
 * wheel gone (brake drum on cinder blocks), a flat rear tyre, a cracked windshield, one headlight missing, the bumper
 * hanging. Parked along the right wall, nose toward us (as the reference's van).
 */
function drawCar(c: C, p: Piece) {
  const { y0, y1, width: W } = CAR, cut = POST_R[0];
  const side = (y: number) => AX(CAR.sideAt(y));
  const yAt = (x: number, off: number) => { // depth where the line (side + off) crosses column x
    let lo = y0 - 2, hi = y1 + 2;
    for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (AX(CAR.sideAt(m) + off) < x) lo = m; else hi = m; }
    return (lo + hi) / 2;
  };
  // profile: height of the body top along the car (u = 0 tail .. 1 nose): trunk, fastback slope, roof, windshield, hood
  const topH = (u: number) => u < 0.12 ? 3.0 + u * 2 : u < 0.42 ? 3.25 + (u - 0.12) / 0.3 * 1.05 : u < 0.58 ? 4.3 : u < 0.66 ? 4.3 - (u - 0.58) / 0.08 * 1.3 : 3.0 - (u - 0.66) * 0.9;
  const RED = '#a33a2a', RED_D = '#7e2a1e', PRIMER = '#8a8d8f', RUST = ['#7a3e1a', '#9a5020', '#5e2c12'];
  const rearW = 0.2, frontW = 0.8;
  const xa = Math.round(side(y0)), xb = Math.min(cut - 1, Math.round(side(y1)));
  // long left side
  for (let x = xa; x <= xb; x++) {
    const y = Math.min(y1, Math.max(y0, yAt(x, 0))), u = (y - y0) / (y1 - y0), floor = Math.round(AY(y)), top = topH(u);
    for (let r = Math.round(floor - top * HF); r < floor; r++) {
      const h = (floor - r) / HF;
      let col = h > top - 0.12 ? tint(RED, 0.25) : RED;
      if (h > 3.0 && u > 0.36 && u < 0.62) col = h > top - 0.15 ? '#5a2018' : (u > 0.45 && u < 0.47) ? RED_D : '#22303a'; // side glass + B pillar
      if (Math.abs(h - 2.3) < 0.07) col = RED_D;                                                 // body crease
      if (h > 1.0 && h < 2.0 && u > 0.47 && u < 0.53) col = '#33100a';                            // side scoop
      if (u > 0.55 && u < 0.78 && h > 0.6 && h < 2.3) col = PRIMER;                               // primer door
      if (u > 0.55 && u < 0.78 && h > 0.6 && h < 2.3 && hn(x, r, 61) < 0.08) col = '#7a7d7f';
      const rust = hn(Math.floor(x / 2), Math.floor(r / 2), 62);
      if (h < 1.3 && hn(x >> 2, r >> 1, 67) < 0.4) col = RUST[Math.floor(hn(x, r, 68) * 3)];     // rotten sills
      if (u > 0.85 && h > 1.6 && h < 2.6 && rust < 0.3) col = RUST[1];                            // dented fender rust
      if (u > 0.86 && u < 0.9 && h > 1.4 && h < 2.2) col = shade(col, 0.7);                       // the dent
      if (h < 0.45) col = '#2a1a14';
      // rear wheel: flat tyre (squashed), front wheel: gone — drum on cinder blocks
      const dR = Math.hypot((u - rearW) / 0.085, (h - 0.95) / 0.95);
      if (dR < 1 && h < 1.85) col = dR < 0.38 ? '#9aa2a6' : dR < 0.5 ? '#55595c' : h < 0.35 ? '#141414' : '#1a1a1a';
      const dF = Math.hypot((u - frontW) / 0.085, (h - 1.2) / 1.0);
      if (dF < 1 && h > 0.25) col = dF < 0.45 ? '#6e5a4a' : dF < 1 ? '#18100c' : col;              // empty wheel well
      if (dF < 0.45) col = hn(x, r, 63) < 0.4 ? '#7a3e1a' : '#5a5c5e';                            // rusty brake drum
      P(c, x, r, col);
    }
  }
  // cinder blocks under the front axle
  { const bx = Math.round(side(y0 + (y1 - y0) * frontW)), by = Math.round(AY(y0 + (y1 - y0) * frontW));
    for (const [ox, oy] of [[-10, -2], [0, -2], [-5, -12]] as const) { R(c, bx + ox - 1, by + oy - 11, 12, 12, '#5a5c5e'); R(c, bx + ox, by + oy - 10, 10, 10, '#9a9c9a'); R(c, bx + ox + 2, by + oy - 8, 2, 6, '#5f6163'); R(c, bx + ox + 6, by + oy - 8, 2, 6, '#5f6163'); } }
  // top surfaces: trunk, fastback glass, roof, windshield (cracked), long hood
  for (let x = xa; x <= Math.min(cut - 1, Math.round(AX(CAR.sideAt(y1) + W))); x++) {
    const yF = Math.min(y1, Math.max(y0, yAt(x, 0))), yB = Math.min(y1, Math.max(y0, yAt(x, W)));
    const uF = (yF - y0) / (y1 - y0), uB = (yB - y0) / (y1 - y0);
    const rF = Math.round(AY(yF) - topH(uF) * HF), rB = Math.round(AY(yB) - topH(uB) * HF);
    for (let r = Math.min(rF, rB); r <= Math.max(rF, rB); r++) {
      const t = (r - Math.min(rF, rB)) / Math.max(1, Math.abs(rF - rB)), u = uB + (uF - uB) * t;
      let col = mix(RED, tint(RED, 0.35), 0.5 + 0.5 * Math.sin(t * Math.PI));
      if (u > 0.36 && u < 0.45) col = '#2a3a46';                                                 // fastback glass
      if (u > 0.58 && u < 0.66) { col = '#3a5262'; if ((x * 3 + r * 7) % 23 === 0 || Math.abs((x - r * 0.6) % 17) < 0.6) col = '#c8d8e0'; } // cracked windshield
      if (u > 0.68 && Math.abs(t - 0.5) < 0.06) col = '#22100a';                                  // hood scoop seam
      if (u > 0.45 && u < 0.58) col = mix('#5e2018', '#7e2e22', 0.5 + 0.5 * Math.sin(t * Math.PI));   // faded vinyl roof
      if (u > 0.74 && u < 0.92 && t > 0.15 && t < 0.62) col = hn(x >> 2, r >> 2, 64) < 0.15 ? '#7a7d7f' : PRIMER; // primer patch on the hood
      if (hn(x >> 3, r >> 2, 65) < 0.07) col = RUST[hn(x, r, 66) < 0.5 ? 0 : 2];                      // rust patches
      if (r === Math.min(rF, rB)) col = '#3a120a';
      P(c, x, r, col);
    }
  }
  // nose toward us: grille, one headlight left (the other is a dark hole), bumper hanging off one side
  const fx0 = Math.round(side(y1)), fx1 = Math.min(cut - 1, Math.round(AX(CAR.sideAt(y1) + W))), fb = Math.round(AY(y1)), ft = Math.round(fb - topH(1) * HF);
  R(c, fx0 - 1, ft, fx1 - fx0 + 2, fb - ft, '#3a120a');
  R(c, fx0, ft + 1, fx1 - fx0, fb - ft - 2, RED_D); R(c, fx0, ft + 1, fx1 - fx0, 2, tint(RED, 0.2));
  R(c, fx0 + 10, ft + 8, Math.min(70, fx1 - fx0 - 12), 14, '#141414'); for (let k = 0; k < 3; k++) R(c, fx0 + 12, ft + 10 + k * 4, Math.min(66, fx1 - fx0 - 16), 1, '#3a3a3a');
  const hl = (hx: number, ok: boolean) => { for (let yy = -5; yy <= 5; yy++) for (let xx = -5; xx <= 5; xx++) { const d = Math.hypot(xx, yy); if (d <= 5 && hx + xx < cut) P(c, hx + xx, ft + 15 + yy, d > 4 ? '#55595c' : ok ? (d < 2 ? '#ffffff' : '#e8e2c4') : '#0a0a0a'); } };
  hl(fx0 + 6, true); hl(fx0 + 86, false);
  for (let k = 0; k < Math.min(96, fx1 - fx0); k++) { const sag = k < 40 ? 0 : Math.round((k - 40) * 0.2); R(c, fx0 - 2 + k, fb - 10 + sag, 1, 4, k % 9 === 0 ? '#7a3e1a' : '#a9b0b4'); P(c, fx0 - 2 + k, fb - 10 + sag, '#d6dcdf'); }
  if (fx0 + 90 < cut) R(c, fx0 + 78, fb - 5, 12, 6, '#1a1a1a');                                  // the far front tyre (the near one is gone)
}

function drawBoxes(c: C, p: Piece) {
  const a = block(c, p.x, p.x + p.w * 0.55, p.y + 0.3, p.y + p.d, 1.8, '#bb8b55', { top: '#d2a56b' });
  const b = block(c, p.x + p.w * 0.45, p.x + p.w, p.y, p.y + p.d * 0.7, 2.2, '#b07f4a', { top: '#c99a60' });
  const top = block(c, p.x + 0.2, p.x + p.w * 0.5, p.y + 0.6, p.y + p.d - 0.3, 3.3, '#c49464', { top: '#dcae74' });
  for (const k of [a, b, top]) {
    R(c, Math.round((k.x0 + k.x1) / 2) - 1, k.faceTop, 3, k.H, '#c9b48a'); R(c, k.x0, k.top + Math.round((k.yf - k.yb) / 2) - 1, k.x1 - k.x0, 2, '#c9b48a');
    R(c, k.x0 + 4, k.faceTop + 6, 10, 2, '#3a2a1a'); R(c, k.x0 + 4, k.faceTop + 10, 6, 2, '#3a2a1a');
  }
}

/** The jump rope lying coiled on the floor, yellow handles. */
function drawJumpRope(c: C, p: Piece) {
  const jx = Math.round(AX(p.x + 1.0)), jy = Math.round(AY(p.y + 0.4));
  for (let k = 0; k < 120; k++) { const a = k * 0.16, r = 6 + (k % 40) * 0.25; P(c, jx + Math.round(Math.cos(a) * r * 1.6), jy + Math.round(Math.sin(a) * r * 0.6), '#d8c048'); }
  R(c, jx + 14, jy - 2, 7, 3, '#e2a83a'); R(c, jx - 22, jy + 3, 7, 3, '#e2a83a');
}

function drawKettlebells(c: C, p: Piece) {
  for (const [dx, dy, r] of [[0.3, 0.6, 5], [1.0, 0.4, 6], [1.5, 0.9, 4]] as const) {
    const cx = Math.round(AX(p.x + dx)), cy = Math.round(AY(p.y + dy)) - r;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = Math.hypot(x, y * 1.1); if (d <= r) P(c, cx + x, cy + y, d > r - 0.8 ? '#0a0b0c' : x + y < -r * 0.5 ? '#4a4f55' : '#1e2023'); }
    for (let k = 0; k <= 10; k++) { const a = Math.PI + (k / 10) * Math.PI; P(c, cx + Math.round(Math.cos(a) * (r - 1)), cy - r + 1 + Math.round(Math.sin(a) * (r - 1) * 0.9), '#2a2d31'); }
  }
}

const DRAW: Record<string, (c: C, p: Piece, frame: number) => void> = {
  jumpRope: drawJumpRope,
  bench: drawBench, squatRack: drawSquatRack, treadmill: drawTreadmill, hoop: drawHoop, car: drawCar, boxes: drawBoxes, kettlebells: drawKettlebells,
};

const CACHE = new Map<string, Omit<ArtPiece, 'depthFt'>>();
/** Garage background + one cropped texture per piece (textures persist across scene visits). */
export function buildGarageArt(tm: Phaser.Textures.TextureManager): { bg: string; pieces: ArtPiece[] } {
  const bg = 'garage_bg';
  if (!tm.exists(bg)) tm.addCanvas(bg, drawGarageBackground());
  const pieces: ArtPiece[] = [];
  for (const p of GARAGE_FURNITURE) {
    const draw = DRAW[p.kind]; if (!draw) continue;
    const key = `garage_${p.id}`;
    const frames = p.kind === 'bench' || p.kind === 'squatRack' ? 2 : 1;
    const art = CACHE.get(key) ?? bake(tm, key, frames, (c, f) => draw(c, p, f));
    CACHE.set(key, art);
    pieces.push({ ...art, depthFt: p.y + p.d, piece: p });
  }
  return { bg, pieces };
}
