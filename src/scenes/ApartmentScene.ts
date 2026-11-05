import Phaser from 'phaser';
import { buildRoomArt, buildCatTexture, buildGlow, CAT_W, LAMP_ART } from '../render/roomArt';
import { RS, V, Piece, RoomDef, APARTMENT, actorDepthFt, PLAYER_R, sxOf, syOf, Poly, FURNITURE, Cat, newCat, catStep, CAT_R } from '../world/apartment';
import { RoomScene, ART, circlePoly } from './RoomScene';

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
