import Phaser from 'phaser';
import { buildRoomArt, buildCatTexture, buildGlow, CAT_W, LAMP_ART } from '../render/roomArt';
import { RS, V, Piece, RoomDef, Station, APARTMENT, actorDepthFt, PLAYER_R, sxOf, syOf, Poly, FURNITURE, Cat, newCat, catStep, CAT_R, SPOTS } from '../world/apartment';
import { RoomScene, ART, circlePoly } from './RoomScene';
import { FONT } from './ui';
import { app } from '../state';
import { sfx } from '../audio/sfx';
import { advanceDay, sleepPlan, ENERGY_ORB } from '../career/career';

/**
 * The starter apartment (round 36): your base of operations. The left door leads to the garage gym, the front door
 * leaves. The cat lives on the couch.
 */
export class ApartmentScene extends RoomScene {
  tank: Phaser.GameObjects.Sprite | null = null;
  fan: Phaser.GameObjects.Sprite | null = null;
  glow!: Phaser.GameObjects.Image;
  cat!: Cat;
  catSprite!: Phaser.GameObjects.Sprite;
  catPolyKey = ''; catPolyCache: Poly[] = [];

  constructor() { super('Apartment'); }
  room(): RoomDef { return APARTMENT; }
  buildArt(tm: Phaser.Textures.TextureManager) { return buildRoomArt(tm); }

  init(data?: { at?: string }) {
    super.init(data);
    this.tank = null; this.fan = null; this.catPolyKey = ''; this.blanketG = null;
  }

  onCreate() {
    for (const { art, img } of this.pieces) {
      if (art.key === 'room_tank') this.tank = img as Phaser.GameObjects.Sprite;
      if (art.key === 'room_fan') this.fan = img as Phaser.GameObjects.Sprite;
    }
    this.glow = this.add.image(LAMP_ART.x * ART, LAMP_ART.y * ART, buildGlow(this.textures)).setScale(ART * 2).setBlendMode(Phaser.BlendModes.ADD).setDepth(5000).setAlpha(0.8);
    this.cat = newCat();
    this.catSprite = this.add.sprite(0, 0, buildCatTexture(this.textures), 0).setOrigin(0.5, 1).setScale(ART);
  }

  actions() { return [{ label: 'Sleep', spot: SPOTS.couch, run: () => this.sleep() }]; }

  /**
   * Sleep on the couch (round 43): the room goes dark, Zzz float off the couch, the next day starts ("DAY n"), the
   * lights come back and green energy orbs rise from the couch into the energy bar until it's full.
   */
  /** Where he lies while sleeping (the sprite's floor point: head on the pillow end, feet toward the blanket). */
  static SLEEP_AT = { x: 26.9, y: 2.6 };
  /** The blanket pulled over him while he sleeps (drawn just in front of him, under the cat). */
  blanketG: Phaser.GameObjects.Graphics | null = null;

  sleep() {
    if (this.busy) return;
    this.busy = true;
    const c = app.career;
    const night = this.add.rectangle(0, 0, 1280, 720, 0x0c1640, 1).setOrigin(0, 0).setDepth(8900).setAlpha(0);
    this.tweens.add({ targets: night, alpha: 0.58, duration: 700, ease: 'Sine.easeInOut' });
    // lie down on the couch: a station with no mini-game, so the room draws him in the `sleep` clip
    this.time.delayedCall(350, () => {
      const st: Station = { id: 'sleep', label: 'Sleep', spot: SPOTS.couch, at: ApartmentScene.SLEEP_AT, clip: 'sleep', period: 3.2, yaw: 0, flip: false, lift: 0, depthFt: 3.27 };
      this.startActivity(st);
      this.drawPlayer(0);
    });
    // Zzz rise from his head (the pillow end)
    const head = { x: sxOf(ApartmentScene.SLEEP_AT.x - 1.6), y: syOf(ApartmentScene.SLEEP_AT.y) - 70 };
    const zs = [0, 1, 2].map((i) => {
      const z = this.add.text(head.x + i * 12, head.y, 'Z', { fontFamily: FONT, fontSize: `${15 + i * 6}px`, color: '#e4eeff', fontStyle: 'bold', stroke: '#0a1030', strokeThickness: 4 }).setOrigin(0.5).setDepth(8950).setAlpha(0);
      this.tweens.add({ targets: z, y: head.y - 44 - i * 12, x: head.x + 14 + i * 16, alpha: { from: 0, to: 1 }, duration: 900, delay: 600 + i * 380, onComplete: () => this.tweens.add({ targets: z, alpha: 0, duration: 400 }) });
      return z;
    });
    sfx.blip(true);
    this.time.delayedCall(1900, () => {
      advanceDay(c); app.changed();
      const banner = this.add.text(640, 330, `DAY ${c.life.day}`, { fontFamily: FONT, fontSize: '54px', color: '#ffe9a8', fontStyle: 'bold', stroke: '#2a1a10', strokeThickness: 8 }).setOrigin(0.5).setDepth(8960).setAlpha(0).setScale(0.8);
      this.tweens.add({ targets: banner, alpha: 1, scale: 1, duration: 450, ease: 'Back.easeOut', hold: 700, yoyo: true, onComplete: () => banner.destroy() });
      sfx.greenChime();
    });
    this.time.delayedCall(3000, () => {
      this.tweens.add({ targets: night, alpha: 0, duration: 700, ease: 'Sine.easeInOut', onComplete: () => night.destroy() });
      for (const z of zs) z.destroy();
    });
    this.time.delayedCall(3500, () => {
      // up off the couch
      this.stopActivity();
      this.pos = { ...SPOTS.couch }; this.face = { x: 0, y: 1 }; this.view = undefined; this.vel = { x: 0, y: 0 };
      this.blanketG?.clear();
      this.busy = false;
      this.sendEnergyOrbs(sleepPlan(c), ENERGY_ORB, { x: sxOf(SPOTS.couch.x), y: syOf(SPOTS.couch.y) - 110 });
    });
  }

  /** The couch blanket pulled up over his legs and hips while he sleeps (a soft draped sheet, the couch blanket's colours). */
  drawBlanket() {
    const g = (this.blanketG ??= this.add.graphics());
    g.clear();
    if (this.activity?.id !== 'sleep' || !this.player.visible) return;
    g.setDepth(this.player.depth + 0.1);
    const x0 = sxOf(ApartmentScene.SLEEP_AT.x + 0.15), x1 = sxOf(ApartmentScene.SLEEP_AT.x + 3.6), floor = syOf(ApartmentScene.SLEEP_AT.y);
    const top = floor - 44, low = floor - 24, breathe = Math.sin(this.t * 2) * 0.8;
    const pts = [
      { x: x0, y: top + 2 + breathe }, { x: x0 + (x1 - x0) * 0.35, y: top - 2 + breathe * 0.6 }, { x: x0 + (x1 - x0) * 0.7, y: top + 1 },
      { x: x1, y: top + 4 }, { x: x1 + 6, y: low + 2 }, { x: x1 + 2, y: low + 9 }, { x: x0 + (x1 - x0) * 0.6, y: low + 6 },
      { x: x0 + (x1 - x0) * 0.3, y: low + 10 }, { x: x0 - 4, y: low + 5 },
    ];
    g.fillStyle(0x7a3412, 1).fillPoints(pts.map((p) => new Phaser.Math.Vector2(p.x, p.y + 1.5)), true);
    g.fillStyle(0xd9692a, 1).fillPoints(pts.map((p) => new Phaser.Math.Vector2(p.x, p.y)), true);
    g.fillStyle(0xf09050, 1).fillRect(x0 + 6, top + 3 + breathe * 0.6, (x1 - x0) * 0.75, 2);           // light on the top fold
    g.fillStyle(0xa8481e, 1).fillRect(x0 + (x1 - x0) * 0.45, top + 8, 2, low - top - 4).fillRect(x0 + (x1 - x0) * 0.75, top + 9, 2, low - top - 2); // folds
  }

  extraObstacles(): Poly[] { return this.cat.perch || this.cat.hop ? [] : [circlePoly(this.cat.p, CAT_R)]; }

  onUpdate(dt: number) {
    const cat = this.cat;
    catStep(cat, this.t, dt, this.catPolys(), Math.random);
    const f = cat.hop ? 2 : cat.state === 'walk' ? 2 + (Math.floor(this.t / 0.16) % 2) : cat.state === 'loaf' ? 1 : 0;
    const x = sxOf(cat.p.x), y = syOf(cat.p.y), lift = cat.z * RS;
    this.catSprite.setFrame(f).setFlipX(cat.state !== 'sit' && cat.face < 0).setPosition(x, y + 2 - lift);
    if (!cat.perch) this.shadow.fillStyle(0x2a1a0e, 0.28).fillEllipse(x, y + 1, CAT_W * ART * 0.8 * (1 - Math.min(0.5, cat.z / 4)), 6);
    if (this.tank) this.tank.setFrame(Math.floor(this.t / 0.6) % 2);
    if (this.fan) this.fan.setFrame(Math.floor(this.t / 0.11) % 3);
    this.glow.setAlpha(0.76 + Math.sin(this.t * 2.1) * 0.04);
    this.drawBlanket();
  }

  /** What the cat avoids: the room + you (rebuilt only when you move, so its path cache stays warm). */
  catPolys(): Poly[] {
    const k = `${this.pos.x.toFixed(1)},${this.pos.y.toFixed(1)}`;
    if (k !== this.catPolyKey) { this.catPolyKey = k; this.catPolyCache = [...this.polys, circlePoly(this.pos, PLAYER_R + 0.1)]; }
    return this.catPolyCache;
  }

  sortExtras(overlapsAt: (pos: V, w: number, h: number) => (p: Piece) => boolean) {
    // on (or hopping off) the couch the cat sits in front of it
    const couch = FURNITURE.find((f) => f.id === 'couch')!;
    this.catSprite.setDepth(this.cat.perch || this.cat.z > 0.05 ? Math.max(syOf(this.cat.p.y), syOf(couch.y + couch.d) + 0.5) : syOf(actorDepthFt(this.cat.p, FURNITURE, overlapsAt(this.cat.p, 22, 40))));
  }
}
