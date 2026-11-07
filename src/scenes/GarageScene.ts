import Phaser from 'phaser';
import { buildGarageArt, garageRim } from '../render/garageArt';
import { AS } from '../render/roomArt';
import { sheetFor } from '../render/playerBank';
import { SPRITE_SCALE } from '../render/sprites';
import { CLIP, frameAt } from '../render/anim';
import { app } from '../state';
import { sfx } from '../audio/sfx';
import { FONT } from './ui';
import { SquatGame, TreadmillGame, DribbleGame, ShootGame, BenchGame, FaceBtn, ORBS } from '../world/minigames';
import { RoomDef, Station, RS, syOf } from '../world/apartment';
import { GARAGE } from '../world/garage';
import { RoomScene } from './RoomScene';

/**
 * The garage gym behind the apartment's left door (round 37): hoop, squat rack, bench press, treadmill, dip station +
 * speed bag, the van. The left door leads back into the apartment.
 * Round 38: workouts, ✕ at the squat rack, bench, push-up mat, jump rope or treadmill plays its animation; the bar
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
  netFront!: Phaser.GameObjects.Graphics;
  private played = false; // the controls card goes away once you start playing
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
    this.netFront = this.add.graphics();
  }

  private piece(id: string) { return this.pieces.find((p) => p.art.piece?.id === id)?.img; }

  onActivity(st: Station | null) {
    // stopped while a made shot was still in the air: its orbs still go
    if (this.shotOrbPending) { this.shotOrbPending = false; const rim = garageRim(); this.sendOrbs(ORBS.shoot, { x: rim.x, y: rim.y + 20 }); }
    sfx.beltHum(st?.id === 'treadmill');
    this.lastShotPhase = ''; this.played = false;
    (this.piece('squatRack') as Phaser.GameObjects.Sprite | undefined)?.setFrame(st?.id === 'squat' ? 1 : 0);
    (this.piece('bench') as Phaser.GameObjects.Sprite | undefined)?.setFrame(st?.id === 'bench' ? 1 : 0);
    this.gear.clear(); this.gearBack.clear(); this.ballG?.clear(); this.netFront?.clear();
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
    } else if (st.id === 'dribble') {
      this.drawDribble(st);
    }
  }

  /** The dribbled ball: in the hand / on the floor as the frame says, in front of you or behind (between the legs, behind the back). */
  drawDribble(st: Station) {
    const b = this.playerBall; if (!b) return;
    const floorY = syOf(st.at.y), r = 7, x = b.x, y = Math.min(b.y, floorY - r + 1);
    const lift = Math.max(0, floorY - y);
    this.gearBack.fillStyle(0x000000, 0.28 - Math.min(0.14, lift / 600)).fillEllipse(x, floorY + 2, 15 - Math.min(5, lift / 20), 5);
    const g = this.ballG.setDepth(b.behind ? this.player.depth - 0.3 : this.player.depth + 0.3);
    g.fillStyle(0x5a2410, 1).fillCircle(x, y, r + 1); g.fillStyle(0xe0702e, 1).fillCircle(x, y, r); g.fillStyle(0xf09050, 1).fillCircle(x - 2, y - 2, r * 0.45);
    g.lineStyle(1, 0x3a1a0a, 1).lineBetween(x - r, y, x + r, y).lineBetween(x, y - r, x, y + r);
  }

  /**
   * Jump shots from the red square (driven by the shooting mini-game): the ball sits in your hands while you load the
   * meter, then arcs at the rim, a make drops through the net and bounces back out to you, a miss clanks off the front
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
    const depth = front;
    // time since the release, on the mini-game's own clock (shotAt is a mini-game time, not the room's)
    const T = game.t - game.shotAt;
    const flight = (T: number): { x: number; y: number } => {
      if (game.made) {
        if (T < 0.85) return arc(Rl, { x: rim.x, y: rim.y - 8 }, T / 0.85, Math.max(0, Rl.y - rim.y) * 0.5 + 60);
        if (T < 1.13) { const s2 = (T - 0.85) / 0.28; return { x: rim.x, y: rim.y - 8 + 44 * s2 * s2 }; }   // down through the rim and the net
        if (T < 1.35) { const s2 = (T - 1.13) / 0.22; return { x: rim.x + 6 * s2, y: rim.y + 33 + (floor - rim.y - 33) * s2 * s2 }; }
        return arc({ x: rim.x + 6, y: floor }, H0, Math.min(1, (T - 1.35) / (ShootGame.FLIGHT - 1.35)), 60);
      }
      const front2 = { x: rim.x + 13, y: rim.y - 2 }; // the front of the rim (toward the shooter)
      if (T < 0.85) return arc(Rl, front2, T / 0.85, Math.max(0, Rl.y - rim.y) * 0.5 + 60);
      if (T < 1.45) return arc(front2, { x: rim.x + 110, y: floor }, (T - 0.85) / 0.6, 40);   // clank, kicks out
      return arc({ x: rim.x + 110, y: floor }, H0, Math.min(1, (T - 1.45) / (ShootGame.FLIGHT - 1.45)), 25);
    };
    const pos = game.state !== 'shot' ? ballAt(game.animU(rel)) : flight(T);
    void hoopDepth;
    const b = this.ballG.setDepth(depth), r = 7, { x, y } = pos;
    // floor shadow under the ball (on the line between you and the hoop)
    b.fillStyle(0x000000, 0.22).fillEllipse(x, syOf(st.at.y) + 1, 14, 5);
    // a short motion trail while it's in the air
    if (game.state === 'shot' && T > 0.04 && T < 1.13) for (const [dt2, a] of [[0.05, 0.35], [0.1, 0.18], [0.15, 0.08]] as const) {
      const q = flight(Math.max(0, T - dt2)); b.fillStyle(0xe0702e, a).fillCircle(q.x, q.y, r * (1 - dt2 * 2));
    }
    b.fillStyle(0x5a2410, 1).fillCircle(x, y, r + 1); b.fillStyle(0xe0702e, 1).fillCircle(x, y, r); b.fillStyle(0xf09050, 1).fillCircle(x - 2, y - 2, r * 0.45);
    b.lineStyle(1, 0x3a1a0a, 1).lineBetween(x - r, y, x + r, y).lineBetween(x, y - r, x, y + r);
    // the front of the rim and the net go over the ball while it's at the hoop (so it drops *through* them); the net
    // stretches and sways as it swishes, then settles
    const nf = this.netFront.clear().setDepth(depth + 0.1);
    if (game.state === 'shot' && T > 0.6 && T < 1.7) {
      const swish = game.made && T > 0.85 ? Math.max(0, 1 - (T - 0.95) / 0.6) : 0;
      const stretch = 9 * swish * Math.min(1, (T - 0.85) / 0.12), sway = 3 * swish * Math.sin(T * 26);
      const rw = 0.75 * 16.5 / AS, netH = 1.4 * 16.5 / AS + stretch, ry = rim.y;
      for (let yy = 0; yy <= netH; yy += 1) {
        const t2 = yy / netH, hw = rw * (1 - 0.42 * t2), x0 = rim.x - hw + sway * t2, x1 = rim.x + hw + sway * t2;
        for (let xx = Math.round(x0); xx <= Math.round(x1); xx += 1) {
          const dp = ((xx - rim.x) + yy * 0.9) % 8, dn = ((xx - rim.x) - yy * 0.9) % 8;
          if (Math.abs(dp) < 0.9 || Math.abs(dn) < 0.9 || xx === Math.round(x0) || xx === Math.round(x1)) nf.fillStyle(0xf4f4f4, 0.95).fillRect(xx, ry + 3 + yy, 1.4, 1.4);
        }
      }
      nf.lineStyle(3, 0xe05a14, 1).beginPath().arc(rim.x, ry, rw, 0, Math.PI, false).strokePath(); // front of the ring
    }
    // call it when it gets there
    this.shotText.setVisible(game.state === 'shot' && T > 0.85 && T < 1.9).setText(game.made ? 'BUCKET!' : 'MISS').setColor(game.made ? '#7dff9a' : '#ff7d7d').setPosition(rim.x + 10, rim.y - 26);
    void RS;
  }

  /**
   * 2K-style curved shot meter: a thick arc beside you (it rides up with your jump) that fills from the bottom along the
   * curve, with the green window near the top. On release it freezes where you let go, green flashes "GREEN!".
   */
  drawShotMeter(m: ShootGame) {
    const since = m.t - m.shotAt; // mini-game clock
    const show = m.state === 'meter' || (m.state === 'shot' && since < (m.perfect ? 1.0 : 0.9));
    this.greenText.setVisible(false);
    if (!show) return;
    const g = this.hudG, x = this.player.x + 26, y = this.player.y - 118, r = 46;
    const A0 = Math.PI * 0.42, A1 = -Math.PI * 0.42, at = (v: number) => A0 + (A1 - A0) * v; // bottom → top, up the curve
    const alpha = m.state === 'shot' ? Math.max(0, 1 - since / 0.9) : 1;
    const arc = (v0: number, v1: number, w: number, col: number, a = alpha) => { g.lineStyle(w, col, a).beginPath().arc(x, y, r, at(v0), at(v1), true).strokePath(); };
    arc(0, 1, 13, 0x0b0d14);                                   // outline
    arc(0, 1, 9, 0x2a2f3e);                                    // track
    arc(ShootGame.GREEN[0], ShootGame.GREEN[1], 9, 0x2f7a3a);  // the green window
    arc(ShootGame.PERFECT[0], ShootGame.PERFECT[1], 9, 0xd62a2a); // the tiny red slice: perfect
    const v = m.state === 'shot' ? m.releasedAt : m.meter;
    const col = m.state === 'shot' ? (m.perfect ? 0xff6a2a : m.made ? 0x7dff9a : 0xe0403a) : v >= ShootGame.GREEN[0] && v <= ShootGame.GREEN[1] ? 0x9dffb0 : 0xffd23a;
    if (v > 0.01) arc(0, v, 7, col);
    for (const e of [0, 1]) { const a = at(e); g.fillStyle(0xffffff, alpha).fillCircle(x + Math.cos(a) * r, y + Math.sin(a) * r, 2.5); } // end caps
    const a = at(v); g.fillStyle(0xffffff, alpha).fillRect(x + Math.cos(a) * (r - 8) - 2, y + Math.sin(a) * (r - 8) - 2, 4, 4); // the tip
    if (m.state === 'shot' && m.perfect && since < 1.0) {
      // the meter catches fire: flickering flame tongues along the filled arc, embers rising
      const flick = (k: number) => 0.6 + 0.4 * Math.sin(this.t * 31 + k * 2.3) * Math.sin(this.t * 17 + k);
      const fade = 1 - since;
      for (let k = 0; k <= 16; k++) {
        const vv = (k / 16) * v, aa = at(vv), cx2 = x + Math.cos(aa) * r, cy2 = y + Math.sin(aa) * r, h = (16 + 13 * flick(k)) * fade;
        const ox = Math.cos(aa), oy = Math.sin(aa); // outward from the arc, bent upward like fire
        const tip = { x: cx2 + ox * h * 0.6, y: cy2 + oy * h * 0.3 - h };
        g.fillStyle(0xff5a10, 0.18 * fade).fillCircle(cx2, cy2 - h * 0.35, h * 0.55);   // glow
        g.fillStyle(0xd62a10, 0.85 * fade).fillTriangle(cx2 - 7, cy2 + 3, cx2 + 7, cy2 + 3, tip.x, tip.y);
        g.fillStyle(0xff9a1a, 0.9 * fade).fillTriangle(cx2 - 4.5, cy2 + 2, cx2 + 4.5, cy2 + 2, tip.x, tip.y + h * 0.3);
        g.fillStyle(0xffe45a, 0.9 * fade).fillTriangle(cx2 - 1.5, cy2, cx2 + 1.5, cy2, tip.x, tip.y + h * 0.6);
      }
      for (let k = 0; k < 8; k++) { const ph = (since * 1.6 + k / 8) % 1, aa = at(v * ((k * 37) % 16) / 16); g.fillStyle(0xffc04a, (1 - ph) * fade).fillRect(x + Math.cos(aa) * r + Math.sin(k * 3) * 6, y + Math.sin(aa) * r - ph * 34, 2, 2); }
      this.greenText.setVisible(true).setAlpha(1).setColor('#ff9a3a').setText('PERFECT!').setPosition(x + r + 8, y + Math.sin(at(ShootGame.GREEN[1])) * r);
    } else if (m.state === 'shot' && m.made) { this.greenText.setVisible(true).setAlpha(alpha).setColor('#7dff9a').setText('GREEN!').setPosition(x + r + 8, y + Math.sin(at(ShootGame.GREEN[1])) * r); }
  }

  /** Sounds for whatever the mini-game did this frame, plus the timed ones (meter ticks, footfalls, the shot ball). */
  private lastDrib: { clip: string; u: number } | null = null;
  private shotOrbPending = false;
  playSounds() {
    const m = this.mini;
    if (!m) return;
    const evs = m.takeEvents();
    if (evs.length || (m instanceof ShootGame && m.state !== 'idle')) this.played = true;
    for (const e of evs) {
      if (e === 'miss') sfx.blip(false);
      else if (e === 'press') { if (m instanceof DribbleGame) { sfx.blip(true); sfx.squeak(0, 0.7); } else sfx.effort(); }
      else if (e === 'hit') sfx.blip(true);
      else if (e === 'rep') { sfx.ding(); if (m instanceof SquatGame || m instanceof BenchGame) sfx.plates(true); }
      else if (e === 'drop') sfx.barDrop();
      else if (e === 'creak') sfx.plates(false);
      else if (e === 'release') sfx.release();
      else if (e === 'green') sfx.greenChime();
      else if (e === 'perfect') sfx.perfect();
      else if (e === 'orb') {
        // a made shot sends its orbs once the ball is through the net (out of the rim); the rest from your chest
        if (m instanceof ShootGame) this.shotOrbPending = true;
        else if (this.activity) this.sendOrbs(ORBS[this.activity.id] ?? [], { x: this.player.x, y: this.player.y - 100 });
      }
    }
    if (m instanceof DribbleGame && this.playerClip) {
      const { clip, u } = this.playerClip, c = CLIP[clip], prev = this.lastDrib;
      this.lastDrib = { clip, u };
      if (c.bounce && prev && prev.clip === clip && u !== prev.u) {
        const wrap = (x: number) => (c.loop ? ((x % 1) + 1) % 1 : Math.max(0, Math.min(1, x)));
        const a = wrap(prev.u), b = wrap(u);
        for (const t of c.bounce) if (a <= b ? a < t && t <= b : a < t || t <= b) sfx.dribble(clip === 'mat_pound' ? 0.6 : 0.8, 0);
      }
    }
    if (m instanceof TreadmillGame) {
      sfx.beltHum(true, m.speed / TreadmillGame.BASE);
      const step = Math.floor(m.run * 2);           // two footfalls per stride
      if (step !== this.lastStep) { this.lastStep = step; sfx.footfall(m.speed / TreadmillGame.BASE); }
    }
    if (m instanceof ShootGame) {
      if (m.state === 'meter' && this.t - this.lastTick > 0.075) { this.lastTick = this.t; sfx.meterTick(m.meter); }
      // the ball: rim (swish / clank), then the floor, then a bounce on the way back out
      const T = m.t - m.shotAt, phase = m.state !== 'shot' ? '' : T < 0.85 ? 'fly' : T < (m.made ? 1.35 : 1.45) ? 'rim' : T < 1.75 ? 'floor' : 'back';
      if (phase !== this.lastShotPhase) {
        if (phase === 'rim') {
          if (m.made) sfx.swish(0, true); else sfx.clank(0);
          if (this.shotOrbPending && this.activity) { this.shotOrbPending = false; const rim = garageRim(); this.sendOrbs(ORBS[this.activity.id] ?? [], { x: rim.x, y: rim.y + 20 }); }
        }
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
    if (since < 3.2 && !this.played) {
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
    // the hint hangs under the panel on the side away from you (centred it ran across the player)
    const right = px > this.player.x;
    this.hudHint.setVisible(true).setOrigin(right ? 0 : 1, 0).setPosition(right ? px : px + W, py + H + 4).setText(`${m.controls[0].replace(/\s+\(.*\)$/, '')}   ·   L1 stop`);
    const vbar = (x: number, y: number, h: number, v: number, col: number) => {
      g.fillStyle(0x000000, 1).fillRect(x - 1, y - 1, 16, h + 2); g.fillStyle(0x2a2f3e, 1).fillRect(x, y, 14, h);
      g.fillStyle(col, 1).fillRect(x, y + h * (1 - v), 14, h * v); g.fillStyle(0xffffff, 0.25).fillRect(x, y + h * (1 - v), 4, h * v);
    };
    const y0 = py + 30;
    if (m instanceof SquatGame) {
      vbar(cx - 7, y0, 86, m.fill, 0x6fd24a);
      this.hudBig.setVisible(true).setFontSize(20).setPosition(cx + 44, y0 + 43).setText(m.last === 'l2' ? 'R2' : 'L2').setColor('#ffe9a8'); // next one to press
    } else if (m instanceof DribbleGame) {
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
    }
    // red ✗ after a mistake
    if (m.missing) {
      const k = 1 - Math.min(1, (m.missUntil - m.t)) * 0.2;
      g.lineStyle(9, 0xe0242a, 1).lineBetween(cx - 34 * k, y0 + 10, cx + 34 * k, y0 + 78).lineBetween(cx + 34 * k, y0 + 10, cx - 34 * k, y0 + 78);
    }
  }
}
