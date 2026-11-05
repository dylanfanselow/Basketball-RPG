import Phaser from 'phaser';
import { buildGarageArt, garageRim } from '../render/garageArt';
import { sheetFor } from '../render/playerBank';
import { SPRITE_SCALE } from '../render/sprites';
import { CLIP, frameAt } from '../render/anim';
import { app } from '../state';
import { sfx } from '../audio/sfx';
import { FONT } from './ui';
import { JumpRopeGame, SquatGame, TreadmillGame, PushupGame, ShootGame, BenchGame, FaceBtn } from '../world/minigames';
import { RoomDef, Station, RS, syOf } from '../world/apartment';
import { GARAGE } from '../world/garage';
import { RoomScene } from './RoomScene';

/**
 * The garage gym behind the apartment's left door (round 37): hoop, squat rack, bench press, treadmill, dip station +
 * speed bag, the van. The left door leads back into the apartment.
 * Round 38: workouts — ✕ at the squat rack, bench, push-up mat, jump rope or treadmill plays its animation; the bar
 * comes off the hooks / uprights and moves with you, the rope turns around you.
 */
export class GarageScene extends RoomScene {
  gear!: Phaser.GameObjects.Graphics;      // bar / rope in front of you
  gearBack!: Phaser.GameObjects.Graphics;  // the far plate of the bench bar (behind you)
  ballG!: Phaser.GameObjects.Graphics;     // the ball on the shooting spot
  // mini-game HUD (round 39): panel by the player, controls card when it starts, red ✗ after a mistake
  hudG!: Phaser.GameObjects.Graphics;
  hudTitle!: Phaser.GameObjects.Text;
  hudHint!: Phaser.GameObjects.Text;
  hudBig!: Phaser.GameObjects.Text;
  cardG!: Phaser.GameObjects.Graphics;
  cardText!: Phaser.GameObjects.Text;
  shotText!: Phaser.GameObjects.Text;
  startedAt = 0;
  greenText!: Phaser.GameObjects.Text;
  private lastTick = 0; private lastStep = 0; private lastShotPhase = '';

  constructor() { super('Garage'); }
  room(): RoomDef { return GARAGE; }
  buildArt(tm: Phaser.Textures.TextureManager) { return buildGarageArt(tm); }

  onCreate() {
    this.gear = this.add.graphics();
    this.gearBack = this.add.graphics();
    this.ballG = this.add.graphics();
    const T = (size: number, col = '#ffffff') => this.add.text(0, 0, '', { fontFamily: FONT, fontSize: `${size}px`, color: col, fontStyle: 'bold', stroke: '#000000', strokeThickness: 4, align: 'center' }).setDepth(9302).setVisible(false);
    this.hudG = this.add.graphics().setDepth(9300);
    this.hudTitle = T(14).setOrigin(0.5, 0);
    this.hudHint = T(12, '#ffe9a8').setOrigin(0.5, 0);
    this.hudBig = T(30).setOrigin(0.5, 0.5);
    this.cardG = this.add.graphics().setDepth(9310);
    this.cardText = this.add.text(640, 150, '', { fontFamily: FONT, fontSize: '18px', color: '#ffffff', fontStyle: 'bold', align: 'center', lineSpacing: 8 }).setOrigin(0.5, 0).setDepth(9311).setVisible(false);
    this.shotText = T(20).setOrigin(0.5, 1);
    this.greenText = T(16, '#7dff9a').setOrigin(0, 0.5);
  }

  private piece(id: string) { return this.pieces.find((p) => p.art.piece?.id === id)?.img; }

  onActivity(st: Station | null) {
    sfx.beltHum(st?.id === 'treadmill');
    this.lastShotPhase = '';
    (this.piece('squatRack') as Phaser.GameObjects.Sprite | undefined)?.setFrame(st?.id === 'squat' ? 1 : 0);
    (this.piece('bench') as Phaser.GameObjects.Sprite | undefined)?.setFrame(st?.id === 'bench' ? 1 : 0);
    this.piece('jumpRope')?.setVisible(st?.id !== 'rope');
    this.gear.clear(); this.gearBack.clear(); this.ballG?.clear();
    this.startedAt = this.t;
    if (!st) { for (const o of [this.hudTitle, this.hudHint, this.hudBig, this.cardText, this.shotText, this.greenText]) o.setVisible(false); this.hudG.clear(); this.cardG.clear(); }
  }

  onUpdate() {
    const g = this.gear.clear(), gb = this.gearBack.clear();
    this.ballG.clear();
    const st = this.activity, fr = this.activityFrame();
    this.drawMiniHud();
    this.playSounds();
    if (!st || !fr || !this.player.visible) return;
    const d = this.player.depth;
    g.setDepth(d + 0.2); gb.setDepth(d - 0.2);
    const plateEdge = (x: number, y: number, h: number, col: number) => { g.fillStyle(0x141618, 1).fillRect(x - 3, y - h / 2 - 1, 6, h + 2); g.fillStyle(col, 1).fillRect(x - 2, y - h / 2, 4, h); };
    const plateFace = (gg: Phaser.GameObjects.Graphics, x: number, y: number, r: number) => {
      gg.fillStyle(0x141618, 1).fillCircle(x, y, r + 1.3); gg.fillStyle(0x3a3f45, 1).fillCircle(x, y, r);
      gg.fillStyle(0x5a6068, 1).fillCircle(x - r * 0.2, y - r * 0.2, r * 0.6); gg.fillStyle(0x24272b, 1).fillCircle(x, y, r * 0.45);
      gg.fillStyle(0xc9cfd4, 1).fillCircle(x, y, r * 0.18);
    };
    if (st.id === 'squat') {
      // facing us: the bar lies across the shoulders, plates edge-on at both ends
      const hd = this.jointToScreen([(fr.pose.hF[0] + fr.pose.hB[0]) / 2, (fr.pose.hF[1] + fr.pose.hB[1]) / 2]);
      const y = hd.y, x = this.player.x, half = 3.1 * RS; // the bar runs through the hands
      g.fillStyle(0x6e767a, 1).fillRect(x - half, y - 2, half * 2, 4); g.fillStyle(0xc9cfd4, 1).fillRect(x - half, y - 2, half * 2, 1);
      for (const s of [-1, 1]) { plateEdge(x + s * (half - 14), y, 34, 0x2a2d31); plateEdge(x + s * (half - 7), y, 26, 0x3a6fb5); }
    } else if (st.id === 'bench') {
      // side view: the bar runs into the room through the hands; far plate behind you, near plate in front
      const h = this.jointToScreen([(fr.pose.hF[0] + fr.pose.hB[0]) / 2, (fr.pose.hF[1] + fr.pose.hB[1]) / 2]);
      const off = 1.5 * 14; // the bar reaches 1.5 ft either side in depth (scene px)
      const tilt = this.mini instanceof BenchGame ? this.mini.tilt * 9 : 0; // the bar tips: one end up, the other down
      plateFace(gb, h.x, h.y - off - tilt, 12);
      g.lineStyle(4, 0x8e969a, 1).lineBetween(h.x, h.y - off - tilt, h.x, h.y + off + tilt);
      g.lineStyle(1, 0xc9cfd4, 1).lineBetween(h.x - 1, h.y - off - tilt, h.x - 1, h.y + off + tilt);
      plateFace(g, h.x, h.y + off + tilt, 12);
    } else if (st.id === 'shoot') {
      this.drawShot(st);
    } else if (st.id === 'rope') {
      // the rope turns around you (one turn per hop): from the hands out to a point circling the body
      const turn = this.mini instanceof JumpRopeGame ? this.mini.theta : (this.actT / st.period) * Math.PI * 2;
      const c = { x: 2, y: 52 }, rx = 22, ry = 60;
      const tip: [number, number] = [c.x + rx * Math.sin(turn), c.y + ry * Math.cos(turn)];
      const hand = fr.pose.hF;
      const H = this.jointToScreen(hand), T = this.jointToScreen(tip);
      // two strands (one per hand, side by side in depth) bow out around the body: a thin loop from the hands to the tip
      const bow = (side: number) => {
        const nx = -(tip[1] - hand[1]), ny = tip[0] - hand[0], nl = Math.hypot(nx, ny) || 1; // normal to hand→tip
        const ctrl: [number, number] = [(hand[0] + tip[0]) / 2 + (tip[0] - c.x) * 0.35 + (nx / nl) * 9 * side, (hand[1] + tip[1]) / 2 + (tip[1] - c.y) * 0.35 + (ny / nl) * 9 * side];
        const M = this.jointToScreen(ctrl), pts: Phaser.Math.Vector2[] = [];
        for (let k = 0; k <= 14; k++) { const t = k / 14, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, cc = t * t; pts.push(new Phaser.Math.Vector2(a * H.x + b * M.x + cc * T.x, a * H.y + b * M.y + cc * T.y)); }
        return pts;
      };
      g.lineStyle(2, 0x2a2a2a, 1); g.strokePoints(bow(1), false); g.lineStyle(2, 0x3a3a3a, 1); g.strokePoints(bow(-1), false);
      g.fillStyle(0xe2a83a, 1).fillRect(H.x - 2, H.y - 4, 4, 8);
    }
  }

  /**
   * Jump shots from the red square (driven by the shooting mini-game): the ball sits in your hands while you load the
   * meter, then arcs at the rim — a make drops through the net and bounces back out to you, a miss clanks off the front
   * of the rim, kicks out and rolls back.
   */
  drawShot(st: Station) {
    const c = app.career, sheet = sheetFor(this, this.sheetKey, c.height, c.appearance, this.kit);
    const game = this.mini instanceof ShootGame ? this.mini : null;
    if (!sheet || !game) return;
    const cl = CLIP[st.clip], rel = cl.release ?? 0.6;
    const flip = this.view?.flip ?? false;
    const ballAt = (u: number) => {
      const fi = frameAt(cl, Math.min(1, u)), bo = sheet.ball[sheet.index[st.clip].start + fi] ?? [8, 60];
      return { x: this.player.x + (flip ? -bo[0] : bo[0]) * SPRITE_SCALE, y: this.player.y - bo[1] * SPRITE_SCALE };
    };
    const rim = garageRim(), Rl = ballAt(rel), H0 = ballAt(0), floor = rim.floorY - 8;
    const hoopDepth = syOf(rim.depthFt) - 0.3, front = this.player.depth + 0.3;
    const arc = (a: { x: number; y: number }, b: { x: number; y: number }, s2: number, h: number) => ({ x: a.x + (b.x - a.x) * s2, y: a.y + (b.y - a.y) * s2 - 4 * h * s2 * (1 - s2) });
    let pos: { x: number; y: number }, depth = front;
    const T = this.t - game.shotAt;
    if (game.state !== 'shot') pos = ballAt(game.animU(rel));
    else if (game.made) {
      if (T < 0.85) { pos = arc(Rl, { x: rim.x, y: rim.y - 3 }, T / 0.85, Math.max(0, Rl.y - rim.y) * 0.5 + 60); if (T > 0.68) depth = hoopDepth; }
      else if (T < 1.13) { const s2 = (T - 0.85) / 0.28; pos = { x: rim.x, y: rim.y - 3 + 36 * s2 * s2 }; depth = hoopDepth; }
      else if (T < 1.35) { const s2 = (T - 1.13) / 0.22; pos = { x: rim.x + 6 * s2, y: rim.y + 33 + (floor - rim.y - 33) * s2 * s2 }; }
      else pos = arc({ x: rim.x + 6, y: floor }, H0, Math.min(1, (T - 1.35) / (ShootGame.FLIGHT - 1.35)), 60);
    } else {
      const front2 = { x: rim.x + 13, y: rim.y - 2 }; // the front of the rim (toward the shooter)
      if (T < 0.85) pos = arc(Rl, front2, T / 0.85, Math.max(0, Rl.y - rim.y) * 0.5 + 60);
      else if (T < 1.45) pos = arc(front2, { x: rim.x + 110, y: floor }, (T - 0.85) / 0.6, 40);   // clank, kicks out
      else pos = arc({ x: rim.x + 110, y: floor }, H0, Math.min(1, (T - 1.45) / (ShootGame.FLIGHT - 1.45)), 25);
    }
    const b = this.ballG.setDepth(depth), r = 7, { x, y } = pos;
    b.fillStyle(0x000000, 0.22).fillEllipse(x, syOf(st.at.y) + 1, 14, 5);
    b.fillStyle(0x5a2410, 1).fillCircle(x, y, r + 1); b.fillStyle(0xe0702e, 1).fillCircle(x, y, r); b.fillStyle(0xf09050, 1).fillCircle(x - 2, y - 2, r * 0.45);
    b.lineStyle(1, 0x3a1a0a, 1).lineBetween(x - r, y, x + r, y).lineBetween(x, y - r, x, y + r);
    // call it when it gets there
    this.shotText.setVisible(game.state === 'shot' && T > 0.85 && T < 1.9).setText(game.made ? 'BUCKET!' : 'MISS').setColor(game.made ? '#7dff9a' : '#ff7d7d').setPosition(rim.x + 10, rim.y - 26);
    void RS;
  }

  /**
   * 2K-style curved shot meter: a thick arc beside you (it rides up with your jump) that fills from the bottom along the
   * curve, with the green window near the top. On release it freezes where you let go — green flashes "GREEN!".
   */
  drawShotMeter(m: ShootGame) {
    const since = this.t - m.shotAt;
    const show = m.state === 'meter' || (m.state === 'shot' && since < 0.9);
    this.greenText.setVisible(false);
    if (!show) return;
    const g = this.hudG, x = this.player.x + 26, y = this.player.y - 118, r = 46;
    const A0 = Math.PI * 0.42, A1 = -Math.PI * 0.42, at = (v: number) => A0 + (A1 - A0) * v; // bottom → top, up the curve
    const alpha = m.state === 'shot' ? Math.max(0, 1 - since / 0.9) : 1;
    const arc = (v0: number, v1: number, w: number, col: number, a = alpha) => { g.lineStyle(w, col, a).beginPath().arc(x, y, r, at(v0), at(v1), true).strokePath(); };
    arc(0, 1, 13, 0x0b0d14);                                   // outline
    arc(0, 1, 9, 0x2a2f3e);                                    // track
    arc(ShootGame.GREEN[0], ShootGame.GREEN[1], 9, 0x2f7a3a);  // the green window
    const v = m.state === 'shot' ? m.releasedAt : m.meter;
    const col = m.state === 'shot' ? (m.made ? 0x7dff9a : 0xe0403a) : v >= ShootGame.GREEN[0] && v <= ShootGame.GREEN[1] ? 0x9dffb0 : 0xffd23a;
    if (v > 0.01) arc(0, v, 7, col);
    for (const e of [0, 1]) { const a = at(e); g.fillStyle(0xffffff, alpha).fillCircle(x + Math.cos(a) * r, y + Math.sin(a) * r, 2.5); } // end caps
    const a = at(v); g.fillStyle(0xffffff, alpha).fillRect(x + Math.cos(a) * (r - 8) - 2, y + Math.sin(a) * (r - 8) - 2, 4, 4); // the tip
    if (m.state === 'shot' && m.made) { this.greenText.setVisible(true).setAlpha(alpha).setText('GREEN!').setPosition(x + r + 8, y + Math.sin(at(ShootGame.GREEN[1])) * r); }
  }

  /** Sounds for whatever the mini-game did this frame, plus the timed ones (meter ticks, footfalls, the shot ball). */
  playSounds() {
    const m = this.mini;
    if (!m) return;
    for (const e of m.takeEvents()) {
      if (e === 'miss') { if (m instanceof JumpRopeGame) sfx.ropeTrip(); sfx.blip(false); }
      else if (e === 'hop') sfx.ropeTap();
      else if (e === 'turn' && m instanceof JumpRopeGame) sfx.ropeWhoosh(Math.min(1.6, m.spin / 12));
      else if (e === 'press') { if (m instanceof PushupGame) sfx.blip(true); sfx.effort(); }
      else if (e === 'hit') sfx.blip(true);
      else if (e === 'rep') { sfx.ding(); if (m instanceof SquatGame || m instanceof BenchGame) sfx.plates(true); }
      else if (e === 'drop') sfx.barDrop();
      else if (e === 'creak') sfx.plates(false);
      else if (e === 'release') sfx.release();
      else if (e === 'green') sfx.greenChime();
    }
    if (m instanceof TreadmillGame) {
      sfx.beltHum(true, m.speed / TreadmillGame.BASE);
      const step = Math.floor(m.run * 2);           // two footfalls per stride
      if (step !== this.lastStep) { this.lastStep = step; sfx.footfall(m.speed / TreadmillGame.BASE); }
    }
    if (m instanceof ShootGame) {
      if (m.state === 'meter' && this.t - this.lastTick > 0.075) { this.lastTick = this.t; sfx.meterTick(m.meter); }
      // the ball: rim (swish / clank), then the floor, then a bounce on the way back out
      const T = this.t - m.shotAt, phase = m.state !== 'shot' ? '' : T < 0.85 ? 'fly' : T < (m.made ? 1.35 : 1.45) ? 'rim' : T < 1.75 ? 'floor' : 'back';
      if (phase !== this.lastShotPhase) {
        if (phase === 'rim') { if (m.made) sfx.swish(0, true); else sfx.clank(0); }
        else if (phase === 'floor') sfx.bounce(9);
        else if (phase === 'back') sfx.bounce(5);
        this.lastShotPhase = phase;
      }
    }
  }

  // ------------------------------------------------------------ mini-game HUD
  /** Panel by the player (reps + the game's widget), the controls card for the first seconds, a red ✗ after a miss. */
  drawMiniHud() {
    const m = this.mini, st = this.activity, g = this.hudG.clear(), cg = this.cardG.clear();
    for (const o of [this.hudTitle, this.hudHint, this.hudBig, this.greenText]) o.setVisible(false);
    if (!m || !st) { this.cardText.setVisible(false); this.shotText.setVisible(false); return; }
    // controls card while it starts
    const since = this.t - this.startedAt;
    if (since < 3.2) {
      const lines = [st.label.toUpperCase(), '', ...m.controls, '', 'L1  stop'];
      // on the half of the screen away from you, so it never covers the workout
      const top = this.player.y < 430 ? 470 : 135;
      this.cardText.setVisible(true).setAlpha(Math.min(1, (3.2 - since) / 0.4)).setText(lines.join('\n')).setPosition(640, top + 15);
      const bw = this.cardText.width + 48, bh = this.cardText.height + 30;
      cg.setAlpha(this.cardText.alpha).fillStyle(0x10131c, 0.88).fillRoundedRect(640 - bw / 2, top, bw, bh, 10).lineStyle(2, 0xffcc33, 1).strokeRoundedRect(640 - bw / 2, top, bw, bh, 10);
    } else this.cardText.setVisible(false);
    // the panel: beside the player, kept on screen
    const W = 150, H = 132;
    // the shot meter curves beside you, so the panel sits further out when shooting
    const gap = m instanceof ShootGame ? 92 : 58;
    let px = this.player.x + gap, py = this.player.y - 190;
    if (px + W > 1250) px = this.player.x - gap - W;
    py = Math.max(120, Math.min(720 - H - 10, py));
    g.fillStyle(0x10131c, 0.82).fillRoundedRect(px, py, W, H, 8).lineStyle(2, 0x3c4876, 1).strokeRoundedRect(px, py, W, H, 8);
    const cx = px + W / 2;
    const isShoot = m instanceof ShootGame;
    this.hudTitle.setVisible(true).setPosition(cx, py + 6).setText(isShoot ? `${st.label.toUpperCase()}  ${m.reps}/${(m as ShootGame).attempts}` : `${st.label.toUpperCase()}  ×${m.reps}`);
    this.hudHint.setVisible(true).setPosition(cx, py + H + 4).setText(`${m.controls[0].replace(/\s+\(.*\)$/, '')}   ·   L1 stop`);
    const vbar = (x: number, y: number, h: number, v: number, col: number) => {
      g.fillStyle(0x000000, 1).fillRect(x - 1, y - 1, 16, h + 2); g.fillStyle(0x2a2f3e, 1).fillRect(x, y, 14, h);
      g.fillStyle(col, 1).fillRect(x, y + h * (1 - v), 14, h * v); g.fillStyle(0xffffff, 0.25).fillRect(x, y + h * (1 - v), 4, h * v);
    };
    const y0 = py + 30;
    if (m instanceof SquatGame) {
      vbar(cx - 7, y0, 86, m.fill, 0x6fd24a);
      this.hudBig.setVisible(true).setFontSize(20).setPosition(cx + 44, y0 + 43).setText(m.last === 'l2' ? 'R2' : 'L2').setColor('#ffe9a8'); // next one to press
    } else if (m instanceof PushupGame) {
      vbar(px + 22, y0, 86, m.fill, 0x6fd24a);
      const GLYPH: Record<FaceBtn, [string, string]> = { a: ['✕', '#7ab8ff'], b: ['○', '#ff7d7d'], x: ['□', '#ff9ad5'], y: ['△', '#7dffb0'] };
      const [glyph, col] = GLYPH[m.want];
      g.fillStyle(0x1f2742, 1).fillCircle(cx + 22, y0 + 43, 28).lineStyle(2, Phaser.Display.Color.HexStringToColor(col).color, 1).strokeCircle(cx + 22, y0 + 43, 28);
      this.hudBig.setVisible(true).setFontSize(34).setPosition(cx + 22, y0 + 43).setText(glyph).setColor(col);
    } else if (m instanceof BenchGame) {
      vbar(px + 18, y0, 86, m.fill, 0x6fd24a);
      // level gauge: keep the marker in the middle zone
      const gx = px + 44, gw = 92, gy = y0 + 36;
      g.fillStyle(0x2a2f3e, 1).fillRect(gx, gy, gw, 12); g.fillStyle(0x3f7a4a, 1).fillRect(gx + gw / 2 - (gw / 2) * BenchGame.LEVEL, gy, gw * BenchGame.LEVEL, 12);
      g.fillStyle(0xc8433a, 1).fillRect(gx, gy, 4, 12).fillRect(gx + gw - 4, gy, 4, 12);
      const mx = gx + gw / 2 + (gw / 2) * Math.max(-1, Math.min(1, m.tilt));
      g.fillStyle(0xffffff, 1).fillRect(mx - 2, gy - 4, 4, 20);
      this.hudBig.setVisible(true).setFontSize(12).setPosition(gx + gw / 2, gy + 30).setText('LEVEL').setColor('#cfe8ff');
    } else if (m instanceof TreadmillGame) {
      const lx = px + 14, lw = W - 28, ly = y0 + 40, half = (lw / 2) * TreadmillGame.HALF;
      g.lineStyle(3, 0x8e96a6, 1).lineBetween(lx, ly, lx + lw, ly);
      g.lineStyle(2, 0xffcc33, 1).strokeRect(cx - half, ly - half, half * 2, half * 2);
      g.fillStyle(0xff7d7d, 1).fillCircle(cx + (lw / 2) * m.dot, ly, 5);
      this.hudBig.setVisible(true).setFontSize(13).setPosition(cx, ly + 32).setText(`speed ${(m.speed / TreadmillGame.BASE).toFixed(1)}×`).setColor('#cfe8ff');
    } else if (m instanceof ShootGame) {
      this.hudBig.setVisible(true).setFontSize(12).setPosition(cx, y0 + 44).setText('hold ✕\nrelease at the\ntop of the jump').setColor('#cfe8ff');
      this.drawShotMeter(m);
    } else if (m instanceof JumpRopeGame) {
      // the rope's turn around you: the zone at the bottom is "under your feet"
      const rx = cx, ry = y0 + 44, r = 32;
      g.lineStyle(3, 0x3c4876, 1).strokeCircle(rx, ry, r);
      g.lineStyle(5, 0x6fd24a, 1).beginPath().arc(rx, ry, r, Math.PI / 2 - JumpRopeGame.WINDOW, Math.PI / 2 + JumpRopeGame.WINDOW).strokePath();
      const a = m.theta - Math.PI / 2; // 0 = top
      g.fillStyle(0xffcc33, 1).fillCircle(rx + Math.cos(a) * r, ry + Math.sin(a) * r, 6);
      g.fillStyle(0xffffff, 1).fillCircle(rx, ry - 10, 4).fillRect(rx - 2, ry - 6, 4, 14); // you, in the middle
    }
    // red ✗ after a mistake
    if (m.missing) {
      const k = 1 - Math.min(1, (m.missUntil - this.t)) * 0.2;
      g.lineStyle(9, 0xe0242a, 1).lineBetween(cx - 34 * k, y0 + 10, cx + 34 * k, y0 + 78).lineBetween(cx + 34 * k, y0 + 10, cx - 34 * k, y0 + 78);
    }
  }
}
