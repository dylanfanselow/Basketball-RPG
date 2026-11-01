import Phaser from 'phaser';
import { COURT_L, COURT_W, RIM_OFFSET, THREE_R, THREE_CORNER, CORNER_Y } from '../sim/court';

export const S = 22;          // px per foot (x and height)
export const D = 6.4;         // px per foot of depth (court y)
export const FLOOR_TOP = 360;
/** World spans this many feet beyond each baseline so the out-of-bounds area (inbounds) is on screen. */
export const OOB_FT = 10;
export const WORLD_W = (COURT_L + OOB_FT * 2) * S;
export const VIEW_W = 1280, VIEW_H = 720;

export const sx = (x: number) => (x + OOB_FT) * S;
export const fromSx = (px: number) => px / S - OOB_FT;
export const CROWD_TOP = 96, CROWD_ROWS = 8, CROWD_ROW_H = 24;
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
  // deep purple-navy arena: dark up top, a little warmer near the floor where the lights spill
  g.fillGradientStyle(0x0a0818, 0x0a0818, 0x231b46, 0x231b46, 1); g.fillRect(-200, 0, W, FLOOR_TOP);
  // stands: risers (the fans themselves are an animated layer, see crowd.ts); back rows sit in shadow
  for (let row = 0; row < CROWD_ROWS; row++) {
    const y = CROWD_TOP + row * CROWD_ROW_H;
    const lit = row / (CROWD_ROWS - 1);
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(0x120e26), Phaser.Display.Color.ValueToColor(0x2a2150), 100, lit * 100);
    g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1); g.fillRect(-200, y, W, CROWD_ROW_H);
    g.fillStyle(0x0b0919, 0.9); g.fillRect(-200, y + CROWD_ROW_H - 3, W, 3);
  }
  // LED ad ribbon along the front of the stands
  g.fillStyle(0x0a0c14, 1); g.fillRect(-200, FLOOR_TOP - 66, W, 26);
  for (let x = 0; x < W; x += 300) { g.fillStyle(x % 600 === 0 ? 0x24335a : 0x5a2433, 1); g.fillRect(x + 8, FLOOR_TOP - 62, 284, 18); }
  // apron (floor around the court, incl. behind the baselines and the far sideline where the table and benches sit)
  // apron in a deep team-neutral navy (like a painted out-of-bounds border), court in warm glossy maple
  g.fillStyle(0x23204a, 1); g.fillRect(-200, FLOOR_TOP - 40, W, COURT_W * D + 110);
  g.fillGradientStyle(0x2c2858, 0x2c2858, 0x1a1838, 0x1a1838, 1); g.fillRect(-200, FLOOR_TOP - 40, W, 40);
  g.fillGradientStyle(0xd9a064, 0xd9a064, 0xc0803f, 0xc0803f, 1); g.fillRect(sx(0), FLOOR_TOP, COURT_L * S, COURT_W * D);
  for (let i = 0; i < COURT_W; i += 1.25) { g.fillStyle(i % 2.5 === 0 ? 0x000000 : 0xffffff, i % 2.5 === 0 ? 0.05 : 0.04); g.fillRect(sx(0), sy(i), COURT_L * S, 2); }
  for (let x = 0; x < COURT_L; x += 6) { g.fillStyle(0x8a5a2a, 0.35); g.fillRect(sx(x + ((x / 6) % 2) * 3), sy(0), 1, COURT_W * D); }
  // gloss: soft light pools under the arena lights and a bright sheen band near the far sideline
  for (const lx of [14, 47, 80]) { g.fillStyle(0xfff2d8, 0.07); g.fillEllipse(sx(lx), sy(20), 40 * S, 30 * D); g.fillStyle(0xfff2d8, 0.06); g.fillEllipse(sx(lx), sy(18), 22 * S, 16 * D); }
  g.fillStyle(0xffffff, 0.06); g.fillRect(sx(0), sy(0.6), COURT_L * S, 1.6 * D);

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
  const shotClocks: { x: number; y: number }[] = [];
  for (const left of [true, false]) {
    const dir = left ? 1 : -1;
    const bx = left ? 0 : COURT_L;
    const boardX = bx + dir * 4, rimX = bx + dir * RIM_OFFSET;
    const postX = bx - dir * 4.2;            // stanchion post stands behind the baseline
    const baseX0 = bx - dir * 7.5, baseX1 = bx - dir * 1.6;
    // shadow + padded base sitting on the floor
    back.fillStyle(0x000000, 0.28); back.fillEllipse((sx(baseX0) + sx(baseX1)) / 2, sy(25, 0) + 6, Math.abs(sx(baseX1) - sx(baseX0)) + 16, 22);
    const bxL = Math.min(sx(baseX0), sx(baseX1)), bw = Math.abs(sx(baseX1) - sx(baseX0));
    back.fillStyle(0x1f2a44, 1); back.fillRect(bxL, sy(25, 3.2), bw, 3.2 * S);                 // base front face
    back.fillStyle(0x2c3a5e, 1); back.fillRect(bxL, sy(22, 3.2), bw, sy(25, 3.2) - sy(22, 3.2)); // base top (depth)
    back.fillStyle(0x3b4c78, 1); back.fillRect(bxL, sy(25, 3.2), bw, 3);
    // post rising from the base, with pad wrap
    const pw = 0.9 * S;
    back.fillStyle(0x4a5068, 1); back.fillRect(sx(postX) - pw / 2, sy(25, 12.6), pw, (12.6 - 3.2) * S);
    back.fillStyle(0x1f2a44, 1); back.fillRect(sx(postX) - pw / 2 - 2, sy(25, 6.5), pw + 4, 3.3 * S);
    // support arm out to the backboard (top + angled brace)
    back.lineStyle(7, 0x4a5068, 1); back.lineBetween(sx(postX), sy(25, 12.4), sx(boardX), sy(25, 12.2));
    back.lineStyle(5, 0x3e4359, 1); back.lineBetween(sx(postX), sy(25, 9.4), sx(boardX - dir * 0.3), sy(25, 11.8));
    // backboard (slightly angled so it reads as a pane) + padding + shot clock on top
    back.fillStyle(0xe8f0ff, 0.95);
    const tilt = 0.9 * dir;
    back.beginPath();
    back.moveTo(sx(boardX - tilt), sy(22, 13.5)); back.lineTo(sx(boardX + tilt), sy(28, 13.5));
    back.lineTo(sx(boardX + tilt), sy(28, 9.5)); back.lineTo(sx(boardX - tilt), sy(22, 9.5)); back.closePath(); back.fillPath();
    back.fillStyle(0x1f2a44, 1); back.fillRect(sx(boardX) - 6, sy(25, 9.5), 12, 6);
    back.lineStyle(2, 0xd04040, 1);
    back.strokeRect(sx(boardX) - 5, sy(25, 11.4), 10, 26);
    back.fillStyle(0x111111, 1); back.fillRect(sx(boardX) - 15, sy(25, 15.1), 30, 1.4 * S);
    shotClocks.push({ x: sx(boardX), y: sy(25, 14.4) });
    // rim + net
    rimG.lineStyle(2, 0xffffff, 0.9);
    const ry = sy(25, 10);
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const x0 = sx(rimX) - 0.75 * S + t * 1.5 * S;
      const x1 = sx(rimX) - 0.45 * S + t * 0.9 * S;
      rimG.lineBetween(x0, ry, x1, ry + 26);
    }
    rimG.lineStyle(4, 0xff6a1a, 1);
    rimG.strokeEllipse(sx(rimX), ry, 1.5 * S, 1.5 * D * 1.4);
    rimG.lineBetween(sx(rimX - dir * 0.75), ry, sx(boardX), ry);
  }
  return { back, rimG, shotClocks };
}
