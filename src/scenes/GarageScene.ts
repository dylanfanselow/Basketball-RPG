import Phaser from 'phaser';
import { buildGarageArt, garageRim } from '../render/garageArt';
import { sheetFor } from '../render/playerBank';
import { SPRITE_SCALE } from '../render/sprites';
import { CLIP, frameAt } from '../render/anim';
import { app } from '../state';
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

  constructor() { super('Garage'); }
  room(): RoomDef { return GARAGE; }
  buildArt(tm: Phaser.Textures.TextureManager) { return buildGarageArt(tm); }

  onCreate() {
    this.gear = this.add.graphics();
    this.gearBack = this.add.graphics();
    this.ballG = this.add.graphics();
  }

  private piece(id: string) { return this.pieces.find((p) => p.art.piece?.id === id)?.img; }

  onActivity(st: Station | null) {
    (this.piece('squatRack') as Phaser.GameObjects.Sprite | undefined)?.setFrame(st?.id === 'squat' ? 1 : 0);
    (this.piece('bench') as Phaser.GameObjects.Sprite | undefined)?.setFrame(st?.id === 'bench' ? 1 : 0);
    this.piece('jumpRope')?.setVisible(st?.id !== 'rope');
    this.gear.clear(); this.gearBack.clear(); this.ballG?.clear();
  }

  onUpdate() {
    const g = this.gear.clear(), gb = this.gearBack.clear();
    this.ballG.clear();
    const st = this.activity, fr = this.activityFrame();
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
      plateFace(gb, h.x, h.y - off, 12);
      g.fillStyle(0x8e969a, 1).fillRect(h.x - 2, h.y - off, 4, off * 2); g.fillStyle(0xc9cfd4, 1).fillRect(h.x - 2, h.y - off, 1, off * 2);
      plateFace(g, h.x, h.y + off, 12);
    } else if (st.id === 'shoot') {
      this.drawShot(st);
    } else if (st.id === 'rope') {
      // the rope turns around you (one turn per hop): from the hands out to a point circling the body
      const turn = (this.actT / st.period) * Math.PI * 2;
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
   * Jump shots from the red square: the ball is in your hands until the release, arcs into the rim, drops through the
   * net (behind it), hits the floor and bounces back into your hands for the next one.
   */
  drawShot(st: Station) {
    const c = app.career, sheet = sheetFor(this, this.sheetKey, c.height, c.appearance, this.kit);
    if (!sheet) return;
    const cl = CLIP[st.clip], shot = st.shotDur ?? 1, T = this.actT % st.period, rel = cl.release ?? 0.6, tr = rel * shot;
    const flip = this.view?.flip ?? false;
    const ballAt = (u: number) => {
      const fi = frameAt(cl, Math.min(1, u)), bo = sheet.ball[sheet.index[st.clip].start + fi] ?? [8, 60];
      return { x: this.player.x + (flip ? -bo[0] : bo[0]) * SPRITE_SCALE, y: this.player.y - bo[1] * SPRITE_SCALE };
    };
    const rim = garageRim(), Rl = ballAt(rel), H0 = ballAt(0);
    const tFly = 0.85, tDrop = 0.28, tFall = 0.22, tBack = st.period - tr - tFly - tDrop - tFall;
    const hoopDepth = syOf(rim.depthFt) - 0.3, front = this.player.depth + 0.3;
    let x: number, y: number, depth = front;
    if (T < tr) ({ x, y } = ballAt(T / shot));
    else if (T < tr + tFly) {
      const s2 = (T - tr) / tFly, apex = Math.max(0, Rl.y - rim.y) * 0.5 + 60;
      x = Rl.x + (rim.x - Rl.x) * s2; y = Rl.y + (rim.y - 3 - Rl.y) * s2 - 4 * apex * s2 * (1 - s2);
      if (s2 > 0.8) depth = hoopDepth;
    } else if (T < tr + tFly + tDrop) {
      const s2 = (T - tr - tFly) / tDrop; x = rim.x; y = rim.y - 3 + 36 * s2 * s2; depth = hoopDepth;
    } else if (T < tr + tFly + tDrop + tFall) {
      const s2 = (T - tr - tFly - tDrop) / tFall, y0 = rim.y + 33, y1 = rim.floorY - 8; x = rim.x + 6 * s2; y = y0 + (y1 - y0) * s2 * s2;
    } else {
      // bounce back out to the shooter
      const s2 = Math.min(1, (T - tr - tFly - tDrop - tFall) / Math.max(0.1, tBack)), x0 = rim.x + 6, y0 = rim.floorY - 8;
      x = x0 + (H0.x - x0) * s2; y = y0 + (H0.y - y0) * s2 - 70 * Math.sin(Math.PI * Math.min(1, s2 * 1.15)) * (1 - s2 * 0.4);
    }
    const b = this.ballG.setDepth(depth), r = 7;
    b.fillStyle(0x000000, 0.22).fillEllipse(x, syOf(st.at.y) + 1, 14, 5);
    b.fillStyle(0x5a2410, 1).fillCircle(x, y, r + 1); b.fillStyle(0xe0702e, 1).fillCircle(x, y, r); b.fillStyle(0xf09050, 1).fillCircle(x - 2, y - 2, r * 0.45);
    b.lineStyle(1, 0x3a1a0a, 1).lineBetween(x - r, y, x + r, y).lineBetween(x, y - r, x, y + r);
    void RS;
  }
}
