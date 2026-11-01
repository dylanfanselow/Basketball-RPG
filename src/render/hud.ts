import Phaser from 'phaser';
import type { GameSim } from '../sim/game';
import type { InputMapper } from '../input/input';
import { availableMoves } from '../sim/moves';
import { MOVES } from '../sim/data';
import { norm, sub, len } from '../sim/math';
import { Sheet, FRAME_W, FRAME_H, frameRect } from './sprites';
import { CLIP, frameAt } from './anim';

const FONT = '"Courier New", monospace';
const R = 26;            // button radius (px)
const ICON = 64;         // icon canvas size

type BtnKey = 'a' | 'b' | 'x' | 'y';
const GLYPH: Record<BtnKey, string> = { a: '✕', b: '○', x: '□', y: '△' };
const GLYPH_COLOR: Record<BtnKey, string> = { a: '#7fb4ff', b: '#ff7f8f', x: '#ff9ce8', y: '#7fffc8' };

/** Which sprite frame (clip + normalized time) illustrates each action. */
const ACTION_POSE: Record<string, [string, number]> = {
  Shoot: ['shot_jumper', 0.58], 'Shoot / Fake': ['pumpfake', 0.5], Pass: ['pass', 0.6], Dribble: ['move_crossover', 0.4],
  Ultimate: ['shot_dunk', 0.6], Block: ['block', 0.6], Steal: ['swipe', 0.5], Charge: ['charge', 1], Screen: ['screen', 1],
  Call: ['cheer', 0], 'Box Out': ['boxout', 0], Rebound: ['block', 0.5],
};

interface Btn { key: BtnKey; x: number; y: number; c: Phaser.GameObjects.Container; disc: Phaser.GameObjects.Graphics; icon: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; glyph: Phaser.GameObjects.Text; action: string; pressedAt: number }

/**
 * On-screen controller: the PlayStation diamond (bottom right) with an action picture of *your*
 * player in each button, and the left stick (bottom left) which shows the moves you can do while ○ is held.
 */
export class ControllerHud {
  btns: Btn[] = [];
  stickG: Phaser.GameObjects.Graphics;
  arcLabels: Phaser.GameObjects.Text[] = [];
  ultRing: Phaser.GameObjects.Graphics;
  sprintPill: Phaser.GameObjects.Graphics;
  sprintText: Phaser.GameObjects.Text;
  private iconKeys = new Map<string, string>();
  readonly cx: number; readonly cy: number;
  readonly sx0 = 112; readonly sy0: number;

  constructor(private scene: Phaser.Scene, private viewW: number, private viewH: number) {
    this.cx = viewW - 112; this.cy = viewH - 118; this.sy0 = viewH - 112;
    const pos: Record<BtnKey, [number, number]> = { y: [0, -62], b: [62, 0], a: [0, 62], x: [-62, 0] };
    for (const key of ['y', 'b', 'a', 'x'] as BtnKey[]) {
      const [dx, dy] = pos[key];
      const x = this.cx + dx, y = this.cy + dy;
      const disc = scene.add.graphics();
      const icon = scene.add.image(0, 0, '__WHITE').setDisplaySize(R * 2 - 4, R * 2 - 4);
      const glyph = scene.add.text(R - 8, -R + 2, GLYPH[key], { fontFamily: FONT, fontSize: '13px', color: GLYPH_COLOR[key], fontStyle: 'bold', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
      const label = scene.add.text(0, R + 9, '', { fontFamily: 'Arial, sans-serif', fontSize: '14px', color: '#ffffff', fontStyle: 'bold italic', stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5);
      const c = scene.add.container(x, y, [disc, icon, glyph, label]).setScrollFactor(0).setDepth(9100);
      this.btns.push({ key, x, y, c, disc, icon, label, glyph, action: '', pressedAt: -1 });
    }
    this.ultRing = scene.add.graphics().setScrollFactor(0).setDepth(9101);
    this.sprintPill = scene.add.graphics().setScrollFactor(0).setDepth(9100);
    this.sprintText = scene.add.text(this.cx, this.cy - 112, 'R2  SPRINT', { fontFamily: FONT, fontSize: '12px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(9101);
    this.stickG = scene.add.graphics().setScrollFactor(0).setDepth(9100);
    for (let i = 0; i < 4; i++) this.arcLabels.push(scene.add.text(0, 0, '', { fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#ffffff', fontStyle: 'bold', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setScrollFactor(0).setDepth(9101));
  }

  /** Circle badge (like the "Backboard" card): burst streaks + the user's sprite frame doing the action. */
  private iconFor(action: string, sheet: Sheet | null, sheetKey: string, locked: boolean): string {
    const key = `icon_${action}_${sheetKey}_${locked ? 'L' : ''}`;
    if (this.scene.textures.exists(key)) return key;
    const c = document.createElement('canvas'); c.width = ICON; c.height = ICON;
    const ctx = c.getContext('2d')!;
    ctx.save();
    ctx.beginPath(); ctx.arc(ICON / 2, ICON / 2, ICON / 2 - 1, 0, Math.PI * 2); ctx.clip();
    const grad = ctx.createLinearGradient(0, 0, ICON, ICON); grad.addColorStop(0, '#3a3f52'); grad.addColorStop(1, '#14161f');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, ICON, ICON);
    // speed-burst streaks from the top right
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    for (let i = 0; i < 9; i++) {
      const a0 = Math.PI * 0.55 + i * 0.13, a1 = a0 + 0.05;
      ctx.beginPath(); ctx.moveTo(ICON * 0.82, ICON * 0.15);
      ctx.lineTo(ICON * 0.82 + Math.cos(a0) * 90, ICON * 0.15 + Math.sin(a0) * 90); ctx.lineTo(ICON * 0.82 + Math.cos(a1) * 90, ICON * 0.15 + Math.sin(a1) * 90); ctx.closePath(); ctx.fill();
    }
    ctx.imageSmoothingEnabled = false;
    if (locked) {
      ctx.fillStyle = '#c9ced8'; ctx.fillRect(22, 30, 20, 16);
      ctx.strokeStyle = '#c9ced8'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(32, 30, 7, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = '#14161f'; ctx.fillRect(31, 35, 2, 6);
    } else if (sheet) {
      const [clip, u] = ACTION_POSE[action] ?? ['idle', 0];
      const cl = CLIP[clip] ?? CLIP.idle;
      const idx = sheet.index[cl.name].start + frameAt(cl, u);
      const r = frameRect(idx);
      // zoom on the upper body + arms (the part that shows the action); legs fall off the bottom of the circle
      const crop = { x: 8, y: 22, w: 48, h: 72 };
      ctx.drawImage(sheet.canvas, r.x + crop.x, r.y + crop.y, crop.w, crop.h, 0, -2, ICON, ICON * (crop.h / crop.w));
    }
    ctx.restore();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(230,236,255,0.9)';
    ctx.beginPath(); ctx.arc(ICON / 2, ICON / 2, ICON / 2 - 1.5, 0, Math.PI * 2); ctx.stroke();
    this.scene.textures.addCanvas(key, c);
    return key;
  }

  update(sim: GameSim, inp: InputMapper, userSheet: { key: string; sheet: Sheet } | null) {
    const u = sim.user;
    const now = this.scene.time.now;
    const onCourt = !!u && sim.userOnCourt;
    const hasBall = onCourt && sim.holder() === u;
    const onO = onCourt && u!.team === sim.possession;
    const shotUp = sim.ball.st.kind === 'shot';
    const ult = sim.ult.state;
    const actions: Record<BtnKey, string> = hasBall
      ? { a: u!.deadDribble ? 'Shoot / Fake' : 'Shoot', y: 'Pass', b: 'Dribble', x: 'Ultimate' }
      : shotUp ? { a: 'Rebound', y: onO ? 'Call' : 'Steal', b: 'Box Out', x: 'Ultimate' }
      : onO ? { a: 'Rebound', y: 'Call', b: 'Screen', x: 'Ultimate' }
      : { a: 'Block', y: 'Steal', b: 'Charge', x: 'Ultimate' };
    for (const b of this.btns) {
      b.c.setVisible(onCourt);
      if (!onCourt) continue;
      const action = actions[b.key];
      const locked = b.key === 'x' && !ult.unlocked;
      const iconKey = this.iconFor(action, userSheet?.sheet ?? null, userSheet?.key ?? 'none', locked);
      if (b.icon.texture.key !== iconKey) b.icon.setTexture(iconKey).setDisplaySize(R * 2 - 4, R * 2 - 4);
      b.label.setText(locked ? '???' : action);
      const greyed = b.key === 'b' && hasBall && u!.deadDribble;
      const held = inp.held(b.key);
      if (inp.pressed(b.key)) b.pressedAt = now;
      const flash = Math.max(0, 1 - (now - b.pressedAt) / 140);
      b.c.setPosition(b.x, b.y + (held ? 3 : 0)).setScale(held ? 0.92 : 1).setAlpha(greyed ? 0.45 : 1);
      b.disc.clear();
      b.disc.fillStyle(0x000000, 0.45); b.disc.fillCircle(2, held ? 1 : 4, R + 1);           // drop shadow (shrinks when pressed)
      b.disc.lineStyle(3, held ? 0x7a8299 : 0xe6ecff, 1); b.disc.strokeCircle(0, 0, R);
      b.icon.setTint(held ? 0xb8bccb : 0xffffff);
      if (flash > 0) { b.disc.fillStyle(0xffffff, 0.35 * flash); b.disc.fillCircle(0, 0, R - 2); }
    }
    // ultimate charge ring around □
    this.ultRing.clear();
    const ub = this.btns.find((b) => b.key === 'x')!;
    if (onCourt && ult.unlocked && u) {
      const c = u.ultCharge / 100;
      this.ultRing.lineStyle(4, c >= 1 ? 0xffdd33 : 0xff8a00, 1);
      this.ultRing.beginPath(); this.ultRing.arc(ub.c.x, ub.c.y, R + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, c)); this.ultRing.strokePath();
    }
    // R2 sprint pill above the diamond
    this.sprintPill.clear(); this.sprintText.setVisible(onCourt);
    if (onCourt && u) {
      const ready = sim.time >= u.burstCdUntil, active = sim.time < u.burstUntil;
      const frac = active ? 1 - (sim.time - u.burstStartAt) / Math.max(0.1, u.burstUntil - u.burstStartAt) : ready ? 1 : 1 - (u.burstCdUntil - sim.time) / Math.max(0.1, u.burstCdUntil - u.burstUntil);
      const w = 104, x0 = this.cx - w / 2, y0 = this.cy - 122;
      this.sprintPill.fillStyle(0x000000, 0.55); this.sprintPill.fillRoundedRect(x0, y0, w, 20, 10);
      this.sprintPill.fillStyle(active ? 0x7df9ff : ready ? 0x3ddc84 : 0xffb030, 0.85); this.sprintPill.fillRoundedRect(x0 + 2, y0 + 2, Math.max(8, (w - 4) * Math.min(1, frac)), 16, 8);
      if (inp.held('sprint')) { this.sprintPill.lineStyle(2, 0xffffff, 1); this.sprintPill.strokeRoundedRect(x0, y0, w, 20, 10); }
    }
    this.drawStick(sim, inp, hasBall);
  }

  private drawStick(sim: GameSim, inp: InputMapper, hasBall: boolean) {
    const g = this.stickG, x0 = this.sx0, y0 = this.sy0, u = sim.user;
    g.clear();
    for (const t of this.arcLabels) t.setVisible(false);
    if (!u || !sim.userOnCourt) return;
    g.fillStyle(0x000000, 0.4); g.fillCircle(x0, y0, 52);
    g.lineStyle(3, 0xe6ecff, 0.7); g.strokeCircle(x0, y0, 52);
    // move arcs while ○ is held (only when you can dribble)
    if (hasBall && inp.held('b') && !u.deadDribble) {
      const toRim = norm(sub(sim.rim(u.team), u.p));
      const nd = sim.nearestDefender(u).dist;
      const moves = availableMoves(u, toRim, sim.time, nd);
      moves.forEach((m, i) => {
        const ang = Math.atan2(m.dir.y, m.dir.x);
        const flick = u.flickDir && sim.time < u.flickUntil && m.dir.y * u.flickDir < 0;
        const col = flick ? 0x5ff4ff : m.chain ? 0xffcc33 : 0xffffff;
        g.lineStyle(9, col, m.chain || flick ? 1 : 0.8);
        g.beginPath(); g.arc(x0, y0, 59, ang - 0.55, ang + 0.55); g.strokePath();
        const lbl = this.arcLabels[i];
        const lx = x0 + Math.cos(ang) * 82, ly = y0 + Math.sin(ang) * 74;
        lbl.setVisible(true).setText(MOVES[m.id]?.name ?? m.id).setPosition(Phaser.Math.Clamp(lx, 44, this.viewW / 2), ly).setColor(m.chain ? '#ffd24d' : flick ? '#7ff6ff' : '#ffffff');
      });
    }
    // flash the direction of the move you just did (even on a tap)
    const lm = sim.lastUserMove;
    const age = lm ? sim.time - lm.at : 99;
    if (lm && age < 0.45) {
      const ang = Math.atan2(lm.dir.y, lm.dir.x);
      const k = age / 0.45;
      g.lineStyle(14 - 8 * k, 0xfff6a0, 1 - k);
      g.beginPath(); g.arc(x0, y0, 59 + 10 * k, ang - 0.6, ang + 0.6); g.strokePath();
      g.lineStyle(4, 0xffffff, 0.9 * (1 - k));
      g.beginPath(); g.arc(x0, y0, 52, ang - 0.6, ang + 0.6); g.strokePath();
    }
    // knob
    const mv = inp.move;
    const k = Math.min(1, len(mv));
    const kx = x0 + (k > 0 ? mv.x / Math.max(1, len(mv)) : 0) * 34, ky = y0 + (k > 0 ? mv.y / Math.max(1, len(mv)) : 0) * 34;
    g.fillStyle(0x000000, 0.35); g.fillCircle(kx + 2, ky + 3, 20);
    g.fillStyle(inp.held('b') && hasBall ? 0xff7f8f : 0xdfe5f5, 1); g.fillCircle(kx, ky, 20);
    g.fillStyle(0xffffff, 0.5); g.fillCircle(kx - 6, ky - 6, 6);
  }
}
