import Phaser from 'phaser';
import { COURT_L, COURT_W, RIM_OFFSET, THREE_R, THREE_CORNER, CORNER_Y } from '../sim/court';

export const S = 26;          // px per foot (x and height)
export const D = 7.4;         // px per foot of depth (court y)
export const FLOOR_TOP = 318;
export const WORLD_W = COURT_L * S;
export const VIEW_W = 1280, VIEW_H = 720;

export const sx = (x: number) => x * S;
export const sy = (y: number, z = 0) => FLOOR_TOP + y * D - z * S;

function poly(g: Phaser.GameObjects.Graphics, pts: [number, number][], close = false) {
  g.beginPath();
  g.moveTo(sx(pts[0][0]), sy(pts[0][1]));
  for (let i = 1; i < pts.length; i++) g.lineTo(sx(pts[i][0]), sy(pts[i][1]));
  if (close) g.closePath();
  g.strokePath();
}

function ellipsePts(cx: number, cy: number, r: number, a0 = 0, a1 = Math.PI * 2, n = 48): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
}

/** Arena + floor + court lines, drawn once. */
export function drawCourt(scene: Phaser.Scene, paintColors: [string, string]) {
  const g = scene.add.graphics().setDepth(-1000);
  const W = WORLD_W + 400;
  // arena backdrop
  g.fillGradientStyle(0x0d0f1a, 0x0d0f1a, 0x1c2033, 0x1c2033, 1); g.fillRect(-200, 0, W, FLOOR_TOP);
  // crowd: rows of pixel heads
  const rng = new Phaser.Math.RandomDataGenerator(['crowd']);
  const crowdCols = [0x3b4a6b, 0x6b3b3b, 0x4b6b3b, 0x8a7a5a, 0x5a5a8a, 0x2f2f3f, 0xb07040, 0x705030];
  for (let row = 0; row < 9; row++) {
    const y = 112 + row * 20;
    g.fillStyle(0x151826, 1); g.fillRect(-200, y + 12, W, 8);
    for (let x = -200 + (row % 2) * 9; x < W; x += 18) {
      if (rng.frac() < 0.12) continue;
      g.fillStyle(crowdCols[rng.between(0, crowdCols.length - 1)], 1); g.fillRect(x, y + 4, 12, 9);
      g.fillStyle([0xf3c9a2, 0xd9a066, 0xa86b3c, 0x7a4a26, 0x4e2f1a][rng.between(0, 4)], 1); g.fillRect(x + 3, y - 3, 6, 7);
    }
  }
  // scorer's table / ad boards
  g.fillStyle(0x10131f, 1); g.fillRect(-200, FLOOR_TOP - 40, W, 40);
  for (let x = 0; x < W; x += 260) { g.fillStyle(x % 520 === 0 ? 0x24335a : 0x5a2433, 1); g.fillRect(x + 10, FLOOR_TOP - 34, 240, 26); }
  // apron + floor
  g.fillStyle(0x7a4f2d, 1); g.fillRect(-200, FLOOR_TOP - 6, W, COURT_W * D + 60);
  g.fillStyle(0xc89458, 1); g.fillRect(0, FLOOR_TOP, sx(COURT_L), COURT_W * D);
  for (let i = 0; i < COURT_W; i += 1.25) { g.fillStyle(i % 2.5 === 0 ? 0xbf8a50 : 0xcf9c62, 1); g.fillRect(0, sy(i), sx(COURT_L), 2); }
  for (let x = 0; x < COURT_L; x += 6) { g.fillStyle(0xb98450, 1); g.fillRect(sx(x + ((x / 6) % 2) * 3), sy(0), 1, COURT_W * D); }

  // painted keys
  const paint = (left: boolean, col: string) => {
    const c = Phaser.Display.Color.HexStringToColor(col).color;
    g.fillStyle(c, 0.85);
    const x0 = left ? 0 : COURT_L - 19;
    g.fillRect(sx(x0), sy(17), 19 * S, 16 * D);
  };
  paint(true, paintColors[1]); paint(false, paintColors[0]);
  // center logo circle
  g.fillStyle(Phaser.Display.Color.HexStringToColor(paintColors[0]).color, 0.6);
  g.fillEllipse(sx(47), sy(25), 12 * S, 12 * D);

  g.lineStyle(3, 0xf7f3ea, 1);
  poly(g, [[0, 0], [COURT_L, 0], [COURT_L, COURT_W], [0, COURT_W]], true);
  poly(g, [[47, 0], [47, COURT_W]]);
  poly(g, ellipsePts(47, 25, 6));
  for (const left of [true, false]) {
    const bx = left ? 0 : COURT_L, dir = left ? 1 : -1, rimX = left ? RIM_OFFSET : COURT_L - RIM_OFFSET;
    poly(g, [[bx, 17], [bx + dir * 19, 17], [bx + dir * 19, 33], [bx, 33]]);
    poly(g, ellipsePts(bx + dir * 19, 25, 6, -Math.PI / 2, Math.PI / 2).map(([x, y]) => [bx + dir * 19 + (x - (bx + dir * 19)) * dir, y] as [number, number]));
    // 3pt line: corners then arc
    const cy0 = 25 - THREE_CORNER, cy1 = 25 + THREE_CORNER;
    poly(g, [[bx, cy0], [bx + dir * CORNER_Y, cy0]]);
    poly(g, [[bx, cy1], [bx + dir * CORNER_Y, cy1]]);
    const a = Math.asin(THREE_CORNER / THREE_R);
    const arc = ellipsePts(rimX, 25, THREE_R, -a, a).map(([x, y]) => [rimX + (x - rimX) * dir, y] as [number, number]);
    poly(g, arc);
    // restricted area
    poly(g, ellipsePts(rimX, 25, 4, -Math.PI / 2, Math.PI / 2).map(([x, y]) => [rimX + (x - rimX) * dir, y] as [number, number]));
  }
  return g;
}

/** Stanchion + backboard (behind players) and the rim/net (sorted with players by depth). */
export function drawHoops(scene: Phaser.Scene) {
  const back = scene.add.graphics().setDepth(sy(23.5));
  const rimG = scene.add.graphics().setDepth(sy(25.4));
  for (const left of [true, false]) {
    const dir = left ? 1 : -1;
    const bx = left ? 0 : COURT_L;
    const boardX = bx + dir * 4, rimX = bx + dir * RIM_OFFSET;
    // stanchion
    back.fillStyle(0x2b2f3a, 1);
    back.fillRect(sx(bx - dir * 3) - 10, sy(25, 0) - 6, 20, 12);
    back.fillStyle(0x3a3f4d, 1);
    back.fillRect(sx(bx - dir * 3) - 4, sy(25, 12), 8, 12 * S);
    back.fillRect(Math.min(sx(bx - dir * 3), sx(boardX)), sy(25, 11.5), Math.abs(sx(boardX) - sx(bx - dir * 3)), 7);
    // backboard (slightly angled so it reads as a pane)
    back.fillStyle(0xe8f0ff, 0.95);
    const tilt = 0.9 * dir;
    back.beginPath();
    back.moveTo(sx(boardX - tilt), sy(22, 13.5)); back.lineTo(sx(boardX + tilt), sy(28, 13.5));
    back.lineTo(sx(boardX + tilt), sy(28, 9.5)); back.lineTo(sx(boardX - tilt), sy(22, 9.5)); back.closePath(); back.fillPath();
    back.lineStyle(2, 0xd04040, 1);
    back.strokeRect(sx(boardX) - 6, sy(25, 11.4), 12, 30);
    // rim + net
    rimG.lineStyle(2, 0xffffff, 0.9);
    const ry = sy(25, 10);
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const x0 = sx(rimX) - 0.75 * S + t * 1.5 * S;
      const x1 = sx(rimX) - 0.45 * S + t * 0.9 * S;
      rimG.lineBetween(x0, ry, x1, ry + 30);
    }
    rimG.lineStyle(4, 0xff6a1a, 1);
    rimG.strokeEllipse(sx(rimX), ry, 1.5 * S, 1.5 * D * 1.4);
    rimG.lineBetween(sx(rimX - dir * 0.75), ry, sx(boardX), ry);
  }
  return { back, rimG };
}
