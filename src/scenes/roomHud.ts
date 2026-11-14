import Phaser from 'phaser';
import { app } from '../state';
import { CORE_STATS, CoreStat } from '../sim/data';
import { xpToNext, nextKeyGame, skillXpToNext } from '../career/career';
import { nextEvent, eventLine } from '../career/draft';
import { dateLabel } from '../career/calendar';
import type { Task } from '../career/tasks';
import { AS } from '../render/roomArt';
import { FONT } from './ui';

const ART = 1 / AS;

/** Skill card colours (round 41), shared by the orbs flying to each card (round 43). */
export const SKILL_COL: Record<CoreStat, { tag: string; base: number; edge: number; dark: number; fill: number; track: number }> = {
  shooting: { tag: 'SHT', base: 0x5a8a2a, edge: 0xa6d65a, dark: 0x3d6420, fill: 0x9ae04a, track: 0x2c4a16 },
  finishing: { tag: 'FIN', base: 0x2f5f8f, edge: 0x7ab8ee, dark: 0x22476c, fill: 0x6ab8f0, track: 0x18324e },
  strength: { tag: 'STR', base: 0x8e1c30, edge: 0xe06a86, dark: 0x6a1424, fill: 0xf05a80, track: 0x4a0e1a },
  mobility: { tag: 'MOB', base: 0x3aa0c0, edge: 0xa8eaff, dark: 0x2a7a94, fill: 0x9ff2ff, track: 0x1e5a6e },
  playmaking: { tag: 'PLY', base: 0xb8901c, edge: 0xffe07a, dark: 0x8a6a12, fill: 0xffd84a, track: 0x5e4810 },
};
/** A row on the to-do list: the task, its progress, and whether it was just paid out (shown with its ✓). */
export interface TodoRow { task: Task; n: number; paid: boolean }
export type Box = { x: number; y: number; w: number; h: number };

/**
 * The top bar of the rooms (round 41 / 84 / 91), shared with the city map (round 92): energy / food, the level and
 * the five skill cards, the date and the next event, money, and the to-do list on the right. Needs `buildIcons`.
 */
export function drawTopHud(scene: Phaser.Scene, rows: TodoRow[]): { g: Phaser.GameObjects.Graphics; objs: Phaser.GameObjects.GameObject[]; skillCards: Map<CoreStat, Box>; energyBox: Box } {
  const skillCards = new Map<CoreStat, Box>();
  const g = scene.add.graphics().setDepth(9000);
  const objs: Phaser.GameObjects.GameObject[] = [g];
  const T = (x: number, y: number, s: string, size = 18, col = '#ffffff', stroke = 4) => {
    const t = scene.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color: col, fontStyle: 'bold', stroke: '#2a1a10', strokeThickness: stroke }).setDepth(9001);
    objs.push(t); return t;
  };
  const icon = (x: number, y: number, name: string, s = 3) => {
    const im = scene.add.image(x, y, `icon_${name}`).setOrigin(0, 0.5).setScale(s * ART * 0.75).setDepth(9001);
    objs.push(im); return im;
  };
  const c = app.career, L = c.life;
  const panel = (x: number, y: number, w: number, h: number, fill: number, edge: number) => {
    g.fillStyle(0x2a1a10, 1).fillRoundedRect(x - 3, y - 3, w + 6, h + 6, 7);
    g.fillStyle(edge, 1).fillRoundedRect(x - 1, y - 1, w + 2, h + 2, 6);
    g.fillStyle(fill, 1).fillRoundedRect(x + 1, y + 1, w - 2, h - 2, 5);
    g.fillStyle(0xffffff, 0.12).fillRect(x + 4, y + 3, w - 8, 2);
  };
  const bar = (x: number, y: number, w: number, v: number, col: number) => {
    g.fillStyle(0x1d140d, 1).fillRect(x, y, w, 10);
    g.fillStyle(col, 1).fillRect(x + 1, y + 1, Math.round((w - 2) * Math.max(0, Math.min(1, v))), 8);
    g.fillStyle(0xffffff, 0.3).fillRect(x + 1, y + 1, Math.round((w - 2) * Math.max(0, Math.min(1, v))), 2);
  };
  /** A rounded pill bar (the reference's style): dark track, light fill, a highlight line along the top. */
  const pill = (x: number, y: number, w: number, h: number, v: number, track: number, fill: number) => {
    const r = h / 2, fw = Math.max(0, Math.min(1, v)) * w;
    g.fillStyle(0x1e1410, 0.9).fillRoundedRect(x - 1, y - 1, w + 2, h + 2, r + 1);
    g.fillStyle(track, 1).fillRoundedRect(x, y, w, h, r);
    if (fw >= 1) {
      const ww = Math.max(h, fw);
      g.fillStyle(fill, 1).fillRoundedRect(x, y, ww, h, r);
      g.fillStyle(0xffffff, 0.35).fillRect(x + r * 0.6, y + 1, Math.max(0, ww - r * 1.2), Math.max(1, h * 0.22));
    }
  };
  // the wooden board on the roof (a soft shadow under it)
  g.fillStyle(0x000000, 0.22).fillRoundedRect(250, 18, 788, 86, 9);
  panel(246, 12, 788, 86, 0x7a5a3e, 0xb08a5c);
  // energy / food
  panel(258, 22, 168, 66, 0x6b4c34, 0x9b7a55);
  icon(266, 40, 'energy', 2); T(284, 31, 'ENERGY', 11, '#ffe9a8'); bar(346, 35, 72, L.energy / 100, 0x6fd24a);
  const energyBox = { x: 346, y: 35, w: 72, h: 10 };
  icon(266, 70, 'food', 2); T(284, 61, 'FOOD', 11, '#ffe9a8'); bar(346, 65, 72, L.food / 100, 0x6fd24a);
  // level block (round 41, the owner's reference): LVL + a long XP bar, then the five skill cards
  panel(436, 22, 248, 66, 0x5a3f2a, 0x9b7a55);
  icon(442, 31, 'star', 2);
  T(458, 23, `LVL ${c.level}`, 14, '#ffffff', 3);
  pill(526, 27, 150, 8, c.xp / xpToNext(c.level), 0x8a3e1a, 0xe8743a);
  const SK = SKILL_COL;
  // the olive-brown strip the cards sit in (like the gaps between the reference's cards)
  g.fillStyle(0x1e1410, 1).fillRoundedRect(440, 42, 240, 43, 4);
  g.fillStyle(0x6e5c3e, 1).fillRoundedRect(441, 43, 238, 41, 4);
  const cw = 44, ch = 37, gap = 3, top = 24;
  CORE_STATS.forEach((st, i) => {
    const k = SK[st], sk = c.skills[st], x = 444 + i * (cw + gap), y = 45;
    skillCards.set(st, { x, y, w: cw, h: ch });
    g.fillStyle(0x1e1410, 1).fillRoundedRect(x - 1, y - 1, cw + 2, ch + 2, 5);
    g.fillStyle(k.edge, 1).fillRoundedRect(x, y, cw, ch, 4);
    g.fillStyle(k.base, 1).fillRoundedRect(x + 1.5, y + 1.5, cw - 3, top - 1.5, { tl: 3, tr: 3, bl: 0, br: 0 });
    g.fillStyle(0xffffff, 0.14).fillRect(x + 3, y + 2.5, cw - 6, 1.5);
    g.fillStyle(k.edge, 1).fillRect(x + 1.5, y + top, cw - 3, 1.5); // divider
    g.fillStyle(k.dark, 1).fillRoundedRect(x + 1.5, y + top + 1.5, cw - 3, ch - top - 3, { tl: 0, tr: 0, bl: 3, br: 3 });
    icon(x + 3, y + 1.5 + top / 2, `sk_${st}`, 1.45);
    T(x + cw - 2, y + top / 2 + 1, String(sk.level), 13, '#ffffff', 3).setOrigin(1, 0.5);
    T(x + 3, y + top + 2.5, k.tag, 7, '#ffffff', 0).setAlpha(0.55);
    pill(x + 20, y + top + 4, cw - 24, 5, sk.xp / skillXpToNext(sk.level), k.track, k.fill);
  });
  // round 84 (owner): the date card: today ("Spring 2") and the days to the next big event under it
  panel(694, 22, 168, 66, 0x1f6f9a, 0x58a8d8);
  icon(702, 46, 'ball', 3);
  T(730, 26, dateLabel(L.day), 20);
  T(730, 58, eventLine(nextEvent(c, nextKeyGame(c))), 11, '#d8f0ff');
  // money (round 84: money only; the salary goes under it later)
  panel(872, 22, 150, 66, 0x6b4c34, 0x9b7a55);
  icon(882, 48, 'coin', 2); T(902, 38, L.money < 0 ? `-$${(-L.money).toLocaleString('en-US')}` : `$${L.money.toLocaleString('en-US')}`, 18, L.money < 0 ? '#ff8a7a' : '#bfe86a'); // round 81: debt shows red
  // round 91 (owner): the to-do list, top right (a task you just finished stays up a moment with its ✓)
      if (rows.length) {
    const tx = 1044, th = 28 + rows.length * 34; // (left of the fullscreen button)
    g.fillStyle(0x000000, 0.22).fillRoundedRect(tx + 4, 18, 188, th, 9);
    panel(tx, 12, 188, th, 0x7a5a3e, 0xb08a5c);
    T(tx + 12, 16, 'TO DO', 13, '#ffe9a8', 3);
    rows.forEach((r, i) => {
      const y = 40 + i * 34, done = r.paid || r.n >= r.task.goal;
      g.fillStyle(0x1e1410, 1).fillRoundedRect(tx + 10, y + 1, 16, 16, 3);
      g.fillStyle(done ? 0x6fd24a : 0xe8d6b0, 1).fillRoundedRect(tx + 12, y + 3, 12, 12, 2);
      if (done) T(tx + 13, y - 3, '✓', 15, '#ffffff', 3);
      T(tx + 34, y - 1, `${r.task.text}  ${Math.min(r.n, r.task.goal)}/${r.task.goal}`, 14, r.paid ? '#bfe86a' : '#ffffff', 3);
      T(tx + 34, y + 16, r.task.reward, 10, '#ffe9a8', 2);
    });
  }
  return { g, objs, skillCards, energyBox };
}
