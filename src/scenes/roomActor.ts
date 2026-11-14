import Phaser from 'phaser';
import { sheetFor, angleCache, angPage, pumpSheet, playerSheetKey } from '../render/playerBank';
import { Kit, CX, FOOT_Y, FRAME_W, FRAME_H, SPRITE_SCALE, figureHeight } from '../render/sprites';
import { CLIP, frameAt, frameTime, sampleClip, rigArms, Pose, J } from '../render/anim';
import type { Appearance } from '../render/appearance';
import type { Sheet } from '../render/sprites';
import { RS, sxOf, syOf, V } from '../world/apartment';

/**
 * Round 87: somebody else in a room drawn like you (a real player sheet from the workers, angled frames from the
 * frame cache): the combine's prospects at the stations and the scouts in their chairs. Hidden until the sheet is
 * ready; an angled frame that isn't drawn yet holds the last one (or the side view).
 */
export class RoomActor {
  spr: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Graphics;
  key: string;
  private last: { tex: string; frame: string | number } | null = null;
  /** Where it was drawn this frame (sprite position, after any jump), its pose and flip (for the gear). */
  x = 0; y = 0; floorY = 0; flip = false; pose: Pose | null = null; clip = 'idle'; fi = 0;
  ball: { x: number; y: number; behind: boolean } | null = null;
  constructor(public scene: Phaser.Scene, id: string, public look: Appearance, public heightFt: number, public kit: Kit, tint = 0xfff0dc) {
    this.key = playerSheetKey(id, look, heightFt, kit);
    this.shadow = scene.add.graphics();
    this.spr = scene.add.sprite(0, 0, '__DEFAULT').setOrigin(CX / FRAME_W, FOOT_Y / FRAME_H).setScale(SPRITE_SCALE).setTint(tint).setVisible(false);
  }
  get sheet(): Sheet | null { return sheetFor(this.scene, this.key, this.heightFt, this.look, this.kit); }
  /** Scene px per pose unit for this body. */
  get k() { return (figureHeight(this.heightFt) / 100) * SPRITE_SCALE; }
  /** A pose joint on screen (as drawn this frame). */
  joint(j: J): V { return { x: this.x + (this.flip ? -j[0] : j[0]) * this.k, y: this.y - j[1] * this.k }; }

  /** Draw `clip` at `u` standing at room point `at` (feet), turned `yaw` (0 = side view), `jumpFt` off the floor. */
  show(clip: string, u: number, at: V, o: { yaw?: number; flip?: boolean; jumpFt?: number; lift?: number; depth?: number; shadow?: boolean } = {}): boolean {
    const sheet = this.sheet;
    const floorY = syOf(at.y) - (o.lift ?? 0) * RS, x = sxOf(at.x), y = floorY - (o.jumpFt ?? 0) * RS;
    this.shadow.clear();
    if (!sheet || !sheet.index[clip]) { this.hide(); return false; }
    const cl = CLIP[clip], fi = frameAt(cl, u), yaw = o.yaw ?? 0;
    let tex = this.key, frame: string | number = sheet.index[clip].start + fi;
    let bo = sheet.ball[sheet.index[clip].start + fi], behind = false;
    if (yaw !== 0) {
      const cache = angleCache(this.scene, this.key, this.heightFt, this.look, this.kit, ['idle', 'jog']);
      const ck = `${clip}|${fi}|${yaw}`, slot = cache.get(ck);
      if (slot) { tex = angPage(this.key, slot.page); frame = `s${slot.index}`; bo = slot.ball; behind = slot.ballBehind; this.last = { tex, frame }; }
      else { cache.request(ck, true); if (this.last) ({ tex, frame } = this.last); }
      pumpSheet(this.scene, this.key, 1, false);
    }
    if (this.spr.texture.key !== tex) this.spr.setTexture(tex, frame); else this.spr.setFrame(frame);
    const depth = o.depth ?? floorY;
    this.spr.setVisible(true).setPosition(x, y).setFlipX(!!o.flip).setDepth(depth);
    if (o.shadow !== false) this.shadow.setDepth(depth - 0.5).fillStyle(0x2a1a0e, 0.3).fillEllipse(x, floorY, 32, 9);
    this.x = x; this.y = y; this.floorY = floorY; this.flip = !!o.flip; this.clip = clip; this.fi = fi;
    this.pose = rigArms(sampleClip(cl, frameTime(cl, fi)), false);
    this.ball = bo ? { x: x + (o.flip ? -bo[0] : bo[0]) * SPRITE_SCALE, y: y - bo[1] * SPRITE_SCALE, behind } : null;
    return true;
  }
  hide() { this.spr.setVisible(false); this.shadow.clear(); this.pose = null; this.ball = null; }
  destroy() { this.spr.destroy(); this.shadow.destroy(); }
}
