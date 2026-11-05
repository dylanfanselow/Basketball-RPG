import Phaser from 'phaser';
import { buildGarageArt } from '../render/garageArt';
import { RoomDef, Station, RS } from '../world/apartment';
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

  constructor() { super('Garage'); }
  room(): RoomDef { return GARAGE; }
  buildArt(tm: Phaser.Textures.TextureManager) { return buildGarageArt(tm); }

  onCreate() {
    this.gear = this.add.graphics();
    this.gearBack = this.add.graphics();
  }

  private piece(id: string) { return this.pieces.find((p) => p.art.piece?.id === id)?.img; }

  onActivity(st: Station | null) {
    (this.piece('squatRack') as Phaser.GameObjects.Sprite | undefined)?.setFrame(st?.id === 'squat' ? 1 : 0);
    (this.piece('bench') as Phaser.GameObjects.Sprite | undefined)?.setFrame(st?.id === 'bench' ? 1 : 0);
    this.piece('jumpRope')?.setVisible(st?.id !== 'rope');
    this.gear.clear(); this.gearBack.clear();
  }

  onUpdate() {
    const g = this.gear.clear(), gb = this.gearBack.clear();
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
      const sh = this.jointToScreen(fr.pose.sF);
      const y = sh.y + 2, x = this.player.x, half = 3.1 * RS;
      g.fillStyle(0x6e767a, 1).fillRect(x - half, y - 2, half * 2, 4); g.fillStyle(0xc9cfd4, 1).fillRect(x - half, y - 2, half * 2, 1);
      for (const s of [-1, 1]) { plateEdge(x + s * (half - 14), y, 34, 0x2a2d31); plateEdge(x + s * (half - 7), y, 26, 0x3a6fb5); }
    } else if (st.id === 'bench') {
      // side view: the bar runs into the room through the hands; far plate behind you, near plate in front
      const h = this.jointToScreen([(fr.pose.hF[0] + fr.pose.hB[0]) / 2, (fr.pose.hF[1] + fr.pose.hB[1]) / 2]);
      const off = 1.5 * 14; // the bar reaches 1.5 ft either side in depth (scene px)
      plateFace(gb, h.x, h.y - off, 12);
      g.fillStyle(0x8e969a, 1).fillRect(h.x - 2, h.y - off, 4, off * 2); g.fillStyle(0xc9cfd4, 1).fillRect(h.x - 2, h.y - off, 1, off * 2);
      plateFace(g, h.x, h.y + off, 12);
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
}
