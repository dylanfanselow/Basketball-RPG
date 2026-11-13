import { canvas, hn } from './roomArt';
import { buildCoachSheet, FRONT_W, FRONT_H, Kit } from './sprites';
import type { Appearance } from './appearance';

/**
 * Round 80: "three months later", the newspaper (the owner's reference: a stack of cream newsprint on a table,
 * tilted, black ink, grey line blocks for the body text, a dot-screened photo). Drawn on a small pixel canvas and
 * scaled up nearest, so the text has the same chunky pixel edges as everything else.
 */
export const PAPER_W = 330, PAPER_H = 430;
const PAPER = '#f4ecd2', PAPER_D = '#e6dcbc', INK = '#1d1b18', GREY = '#9a958a', GREY_L = '#bdb7a8';

/** Where the story bits are on the paper (art px), so the scene can point the camera at them. */
export const PAPER_SPOTS = {
  head: { x: 165, y: 70 },
  photo: { x: 248, y: 168 },
  cold: { x: 82, y: 262 },
  kingston: { x: 165, y: 368 },
};

export interface PaperInfo { name: string; number: number; heightFt: number; appearance: Appearance }

type C = CanvasRenderingContext2D;
const R = (c: C, x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

/** Round 80b: the page is drawn at K times the art resolution (the art pixels stay KxK blocks), so the type is real,
 *  smooth text, readable at every camera stop. */
export const K = 4;

/** Printed type (word wrapped to `maxW` art px). Returns the next line's y. */
function ink(c: C, text: string, x: number, y: number, font: string, col = INK, align: 'left' | 'center' = 'left', maxW = 999, lineH = 0): number {
  c.font = font; c.textBaseline = 'top'; c.textAlign = align; c.fillStyle = col;
  const words = text.split(' '), lines: string[] = [];
  let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  const size = parseInt(/(\d+)px/.exec(font)?.[1] ?? '10', 10), lh = lineH || Math.round(size * 1.18);
  for (const line of lines) { c.fillText(line, x, y); y += lh; }
  c.textAlign = 'left';
  return y;
}

/** Grey line blocks standing in for body text (ragged last lines, paragraph gaps). */
function bodyLines(c: C, x: number, y: number, w: number, rows: number, seed: number, step = 5) {
  for (let i = 0; i < rows; i++) {
    const para = hn(i, seed, 1) < 0.14;
    const len = para ? w * (0.35 + hn(i, seed, 2) * 0.4) : w - (hn(i, seed, 3) < 0.3 ? 2 : 0);
    R(c, x + (i > 0 && hn(i - 1, seed, 1) < 0.14 ? 6 : 0), y + i * step, len - (i > 0 && hn(i - 1, seed, 1) < 0.14 ? 6 : 0), 2, hn(i, seed, 4) < 0.5 ? GREY : GREY_L);
  }
}

/** 4x4 ordered dither: newsprint grey levels. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Your photo: the front-view figure in the Lincoln jersey (a team-photo pose), cropped to the chest, grey and
 *  dithered; the face is posterized without the dither so the eyes stay clean (W I . . I W). */
function photo(c: C, x: number, y: number, w: number, h: number, who: PaperInfo) {
  const kit: Kit = { jersey: '#1f5a3a', jerseyShade: '#16442b', trim: '#e8e2d0', shorts: '#1b5034', number: who.number }; // round 80i: Ridgemont green
  const sheet = buildCoachSheet(who.heightFt, who.appearance, kit);
  const sc = sheet.getContext('2d')!;
  const src = sc.getImageData(0, 0, FRONT_W, FRONT_H).data;
  // find the top of the head so the crop starts there
  let top = 0;
  find: for (let yy = 0; yy < FRONT_H; yy++) for (let xx = 0; xx < FRONT_W; xx++) if (src[(yy * FRONT_W + xx) * 4 + 3] > 0) { top = yy; break find; }
  const k = 2; // 2 art px per sprite px
  const ox = x + Math.round((w - FRONT_W * k) / 2), oy = y + 6 - top * k;
  const pcv = canvas(PAPER_W, PAPER_H), pc = pcv.getContext('2d')!;
  const out = pc.getImageData(0, 0, PAPER_W, PAPER_H), od = out.data;
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    const sx = Math.floor((xx - ox) / k), sy = Math.floor((yy - oy) / k);
    let lum: number;
    const inside = sx >= 0 && sy >= 0 && sx < FRONT_W && sy < FRONT_H && src[(sy * FRONT_W + sx) * 4 + 3] > 0;
    if (inside) { const i = (sy * FRONT_W + sx) * 4; lum = 0.3 * src[i] + 0.59 * src[i + 1] + 0.11 * src[i + 2]; lum = Math.min(255, lum * 1.15 + 10); }
    else lum = 150 + ((yy - y) / h) * 50 + (hn(xx >> 3, yy >> 3, 9) - 0.5) * 20; // a grey gym wall behind
    const face = inside && sy < top + 15; // the head: no dither
    const t = face ? 0.5 : BAYER[(yy & 3) * 4 + (xx & 3)] / 16;
    const level = Math.max(0, Math.min(3, Math.floor(lum / 64 + t - 0.5)));
    const col = [[29, 27, 24], [88, 84, 77], [170, 164, 150], [244, 236, 210]][level];
    const o = (yy * PAPER_W + xx) * 4; od[o] = col[0]; od[o + 1] = col[1]; od[o + 2] = col[2]; od[o + 3] = 255;
  }
  pc.putImageData(out, 0, 0);
  c.imageSmoothingEnabled = false;
  c.drawImage(pcv, x, y, w, h, x, y, w, h);
  R(c, x - 1, y - 1, w + 2, 1, INK); R(c, x - 1, y + h, w + 2, 1, INK); R(c, x - 1, y, 1, h, INK); R(c, x + w, y, 1, h, INK);
}

/** The front page. */
export function drawFrontPage(who: PaperInfo): HTMLCanvasElement {
  const cv = canvas(PAPER_W * K, PAPER_H * K), c = cv.getContext('2d')!;
  c.scale(K, K);
  // newsprint: cream, a fold down the middle (the right half a touch darker), faint fibre speckle
  R(c, 0, 0, PAPER_W, PAPER_H, PAPER);
  R(c, PAPER_W / 2, 0, PAPER_W / 2, PAPER_H, '#efe6ca');
  for (let i = 0; i < 900; i++) R(c, hn(i, 1, 30) * PAPER_W, hn(i, 2, 31) * PAPER_H, 1, 1, PAPER_D);
  R(c, PAPER_W / 2, 0, 1, PAPER_H, '#ddd2b2');
  // masthead
  R(c, 14, 10, PAPER_W - 28, 2, INK);
  ink(c, 'THE LINCOLN LEDGER', PAPER_W / 2, 15, 'bold 27px Georgia, "Times New Roman", serif', INK, 'center');
  R(c, 14, 46, PAPER_W - 28, 1, INK);
  ink(c, 'SATURDAY, FEBRUARY 21', 16, 49, 'bold 10px Arial, sans-serif');
  ink(c, 'WINTER EDITION  ·  50¢', PAPER_W - 16 - 118, 49, 'bold 10px Arial, sans-serif');
  R(c, 14, 61, PAPER_W - 28, 3, INK);
  // headline across the top
  let y = ink(c, 'RIDGEMONT HEADED TO NATIONALS', PAPER_W / 2, 69, 'bold 25px Impact, "Arial Black", "Arial Narrow", sans-serif', INK, 'center', PAPER_W - 24);
  y = ink(c, `Lincoln transfer ${who.name} leads Ridgemont Academy into the title game`, PAPER_W / 2, y + 3, 'italic bold 10px Georgia, serif', INK, 'center', PAPER_W - 40);
  const colTop = y + 6;
  R(c, 14, colTop - 3, PAPER_W - 28, 1, INK);
  // left column: the story, a couple of black sub-heads like the reference
  R(c, 16, colTop + 2, 120, 4, INK); R(c, 16, colTop + 8, 96, 4, INK);
  bodyLines(c, 16, colTop + 18, 132, 15, 11);
  // right: your photo + caption
  const px = 170, pw = 144, ph = 112;
  photo(c, px, colTop + 2, pw, ph, who);
  const cy = ink(c, `${who.name.toUpperCase()} (#${who.number}) joined Ridgemont after a scout saw him play at Lincoln.`, px, colTop + ph + 5, 'bold 10px Arial, sans-serif', INK, 'left', pw, 12);
  bodyLines(c, px, cy + 3, pw, Math.max(3, Math.floor((colTop + ph + 71 - cy - 3) / 5)), 12);
  // the weather box (left, lower)
  const by = colTop + 98;
  R(c, 14, by, 136, 1, INK); R(c, 14, by + 74, 136, 1, INK); R(c, 14, by, 1, 75, INK); R(c, 149, by, 1, 75, INK);
  R(c, 15, by + 1, 134, 18, INK);
  ink(c, 'RECORD LOW TEMPS', 82, by + 4, 'bold 12px Impact, "Arial Black", sans-serif', PAPER, 'center');
  let wy = ink(c, 'City braces for its coldest week on record. Shelters open, pipes freeze across town.', 20, by + 23, 'bold 10px Arial, sans-serif', INK, 'left', 124, 12);
  bodyLines(c, 20, wy + 2, 124, Math.max(1, Math.floor((by + 70 - wy) / 5)), 13);
  // bottom: Kingston
  const ky = 334;
  R(c, 14, ky, PAPER_W - 28, 2, INK);
  ink(c, 'CRESTVIEW PREP AWAITS', 16, ky + 6, 'bold 18px Impact, "Arial Black", sans-serif');
  const ny = ink(c, 'The unbeaten Falcons add transfer Kingston Williams, who left Lincoln in the fall. "I told y\'all I\'d find a way," Williams said.', 16, ky + 30, 'bold 10px Arial, sans-serif', INK, 'left', PAPER_W - 34, 12);
  bodyLines(c, 16, ny + 3, (PAPER_W - 40) / 2, Math.floor((PAPER_H - 10 - ny) / 5), 14);
  bodyLines(c, PAPER_W / 2 + 6, ny + 3, (PAPER_W - 40) / 2, Math.floor((PAPER_H - 10 - ny) / 5), 15);
  // a soft dark edge so the sheet reads on the table
  R(c, 0, 0, PAPER_W, 1, '#c9bf9f'); R(c, 0, PAPER_H - 1, PAPER_W, 1, '#b8ad8c'); R(c, 0, 0, 1, PAPER_H, '#d4caa9'); R(c, PAPER_W - 1, 0, 1, PAPER_H, '#b8ad8c');
  return cv;
}

/** An older paper under it: a black headline bar, grey columns, a photo block. */
export function drawUnderPage(seed: number): HTMLCanvasElement {
  const cv = canvas(PAPER_W, PAPER_H), c = cv.getContext('2d')!;
  R(c, 0, 0, PAPER_W, PAPER_H, '#efe5c8');
  for (let i = 0; i < 700; i++) R(c, hn(i, seed, 30) * PAPER_W, hn(i, seed, 31) * PAPER_H, 1, 1, PAPER_D);
  R(c, 14, 10, PAPER_W - 28, 2, INK); R(c, 30, 18, PAPER_W - 60, 22, INK); R(c, 14, 46, PAPER_W - 28, 3, INK);
  R(c, 16, 56, 160, 8, INK); R(c, 16, 68, 120, 8, INK);
  bodyLines(c, 16, 84, 140, 60, seed);
  R(c, 172, 84, 142, 96, '#7c776c');
  bodyLines(c, 172, 190, 142, 42, seed + 1);
  R(c, 0, PAPER_H - 1, PAPER_W, 1, '#b8ad8c'); R(c, PAPER_W - 1, 0, 1, PAPER_H, '#b8ad8c');
  return cv;
}
