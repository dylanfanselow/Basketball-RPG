import Phaser from 'phaser';
import { buildRoomArt, buildCatTexture, buildGlow, CAT_W, LAMP_ART } from '../render/roomArt';
import { RS, V, Piece, RoomDef, APARTMENT, actorDepthFt, PLAYER_R, sxOf, syOf, Poly, FURNITURE, Cat, newCat, catStep, CAT_R, SPOTS } from '../world/apartment';
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
    this.tank = null; this.fan = null; this.catPolyKey = '';
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
  sleep() {
    if (this.busy) return;
    this.busy = true;
    this.player.setVisible(false); this.shadow.clear();
    const c = app.career, couch = { x: sxOf(25.4), y: syOf(1.6) - 70 };
    const night = this.add.rectangle(0, 0, 1280, 720, 0x0a1030, 1).setOrigin(0, 0).setDepth(8900).setAlpha(0);
    this.tweens.add({ targets: night, alpha: 0.86, duration: 800, ease: 'Sine.easeInOut' });
    const zs = [0, 1, 2].map((i) => {
      const z = this.add.text(couch.x + i * 14, couch.y, 'Z', { fontFamily: FONT, fontSize: `${16 + i * 6}px`, color: '#cfe0ff', fontStyle: 'bold', stroke: '#0a1030', strokeThickness: 4 }).setOrigin(0.5).setDepth(8950).setAlpha(0);
      this.tweens.add({ targets: z, y: couch.y - 46 - i * 10, x: couch.x + 18 + i * 16, alpha: { from: 0, to: 1 }, duration: 900, delay: 500 + i * 380, yoyo: false, onComplete: () => this.tweens.add({ targets: z, alpha: 0, duration: 400 }) });
      return z;
    });
    sfx.blip(true);
    this.time.delayedCall(1700, () => {
      advanceDay(c); app.changed();
      const banner = this.add.text(640, 330, `DAY ${c.life.day}`, { fontFamily: FONT, fontSize: '54px', color: '#ffe9a8', fontStyle: 'bold', stroke: '#2a1a10', strokeThickness: 8 }).setOrigin(0.5).setDepth(8960).setAlpha(0).setScale(0.8);
      this.tweens.add({ targets: banner, alpha: 1, scale: 1, duration: 450, ease: 'Back.easeOut', hold: 700, yoyo: true, onComplete: () => banner.destroy() });
      sfx.greenChime();
    });
    this.time.delayedCall(2700, () => {
      this.tweens.add({ targets: night, alpha: 0, duration: 700, ease: 'Sine.easeInOut', onComplete: () => night.destroy() });
      for (const z of zs) z.destroy();
      this.pos = { ...SPOTS.couch }; this.face = { x: 0, y: 1 }; this.view = undefined; this.vel = { x: 0, y: 0 };
    });
    this.time.delayedCall(3300, () => {
      this.busy = false;
      this.sendEnergyOrbs(sleepPlan(c), ENERGY_ORB, { x: sxOf(SPOTS.couch.x), y: syOf(SPOTS.couch.y) - 110 });
    });
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
