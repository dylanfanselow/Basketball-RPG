import Phaser from 'phaser';
import { InputMapper } from '../input/input';
import { hiRes, FONT } from './ui';
import { app } from '../state';
import { TEAMS } from '../sim/data';
import { xpToNext, nextKeyGame } from '../career/career';
import { Kit, FRAME_W, FRAME_H, CX, FOOT_Y, SPRITE_SCALE, shade } from '../render/sprites';
import { CLIP, frameAt } from '../render/anim';
import { yawFor } from '../render/frameCache';
import { sheetFor, angleCache, angPage, pumpSheet, playerSheetKey } from '../render/playerBank';
import { buildIcons, ArtPiece, AS } from '../render/roomArt';
import { V, Piece, RoomDef, actorDepthFt, pieceDepthFt, PLAYER_R, solids, moveWithCollision, doorNear, sxOf, syOf, Poly, footprint } from '../world/apartment';

export const WALK = 6.2, JOG = 10.5; // ft/s
export const ART = 1 / AS;           // scene units per art px (4/3)
const ROOM_TINT = 0xfff0dc;          // warm room light on the player, so he sits in the same lighting as the furniture

/**
 * A walkable cutaway room (apartment, garage, …): you walk around (stick / WASD, R2 / Shift to hurry), walls and
 * furniture are solid, ✕ at a door goes through it, L1 leaves to the menu. Subclasses supply the room and its art.
 */
export abstract class RoomScene extends Phaser.Scene {
  inp!: InputMapper;
  pos: V = { x: 0, y: 0 };
  vel: V = { x: 0, y: 0 };
  face: V = { x: 0, y: 1 };
  view: { yaw: number; flip: boolean } | undefined;
  dist = 0; t = 0;
  polys: Poly[] = [];
  player!: Phaser.GameObjects.Sprite;
  shadow!: Phaser.GameObjects.Graphics;
  debug!: Phaser.GameObjects.Graphics;
  pieces: { art: ArtPiece; img: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite }[] = [];
  prompt!: Phaser.GameObjects.Text;
  hud!: { g: Phaser.GameObjects.Graphics; texts: Phaser.GameObjects.Text[] };
  sheetKey = '';
  artOf = new Map<string, ArtPiece>();
  kit!: Kit;

  abstract room(): RoomDef;
  /** Bake (or reuse) the background + piece textures. */
  abstract buildArt(tm: Phaser.Textures.TextureManager): { bg: string; pieces: ArtPiece[] };
  /** Extra things you can't walk through this frame (e.g. the cat). */
  extraObstacles(): Poly[] { return []; }
  /** Room-specific objects after the art is placed. */
  onCreate(): void { /* optional */ }
  /** Room-specific per-frame work (animations, pets…), after you've moved. */
  onUpdate(_dt: number): void { /* optional */ }
  /** Room-specific draw order for other walkers. */
  sortExtras(_overlapsAt: (pos: V, w: number, h: number) => (p: Piece) => boolean): void { /* optional */ }

  /** `at` = the id of the door you come in through (you appear in front of it). */
  init(data?: { at?: string }) {
    const r = this.room(), door = data?.at ? r.doors.find((d) => d.id === data.at) : undefined;
    this.pos = { ...(door ? door.spot : r.spawn) };
    this.vel = { x: 0, y: 0 }; this.face = door ? { x: 0, y: 1 } : { x: 0, y: 1 }; this.view = undefined;
    this.dist = 0; this.t = 0; this.pieces = []; this.artOf = new Map();
  }

  create() {
    hiRes(this);
    this.cameras.main.setBackgroundColor('#1a120c');
    this.inp = new InputMapper(this);
    this.polys = solids([], this.room());
    const tm = this.textures;
    const { bg, pieces } = this.buildArt(tm);
    this.add.image(0, 0, bg).setOrigin(0, 0).setScale(ART).setDepth(-1000);
    for (const art of pieces) {
      const img = art.frames > 1 ? this.add.sprite(art.x * ART, art.y * ART, art.key, 0) : this.add.image(art.x * ART, art.y * ART, art.key);
      img.setOrigin(0, 0).setScale(ART).setDepth(syOf(art.piece ? pieceDepthFt(art.piece) : art.depthFt));
      if (art.piece) this.artOf.set(art.piece.id, art);
      this.pieces.push({ art, img });
    }
    // you, in a plain tee and your team-colour shorts
    const c = app.career, team = TEAMS.find((t) => t.id === c.teamId) ?? TEAMS[0];
    this.kit = { jersey: '#ebe7de', jerseyShade: '#c9c4b8', trim: '#d8d3c8', shorts: shade(team.colors[0], 0.9), number: -1 };
    this.sheetKey = playerSheetKey('HOME', c.appearance, c.height, this.kit);
    this.shadow = this.add.graphics().setDepth(-500);
    this.player = this.add.sprite(0, 0, '__DEFAULT').setOrigin(CX / FRAME_W, FOOT_Y / FRAME_H).setScale(SPRITE_SCALE).setTint(ROOM_TINT).setVisible(false);
    this.prompt = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '15px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5, 1).setDepth(9500).setVisible(false);
    this.debug = this.add.graphics().setDepth(9400);
    buildIcons(tm);
    this.onCreate();
    this.makeHud();
  }

  // ------------------------------------------------------------ HUD (on the roof, styled like the reference's boxes)
  makeHud() {
    const g = this.add.graphics().setDepth(9000);
    const texts: Phaser.GameObjects.Text[] = [];
    const T = (x: number, y: number, s: string, size = 18, col = '#ffffff') => { const t = this.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color: col, fontStyle: 'bold', stroke: '#2a1a10', strokeThickness: 4 }).setDepth(9001); texts.push(t); return t; };
    const icon = (x: number, y: number, name: string, s = 3) => this.add.image(x, y, `icon_${name}`).setOrigin(0, 0.5).setScale(s * ART * 0.75).setDepth(9001);
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
    panel(300, 16, 680, 76, 0x7a5a3e, 0xb08a5c);
    panel(312, 26, 176, 56, 0x6b4c34, 0x9b7a55);
    icon(320, 42, 'energy', 2); T(338, 33, 'ENERGY', 11, '#ffe9a8'); bar(400, 37, 80, L.energy / 100, 0x6fd24a);
    icon(320, 66, 'food', 2); T(338, 57, 'FOOD', 11, '#ffe9a8'); bar(400, 61, 80, L.food / 100, 0x6fd24a);
    panel(500, 26, 136, 56, 0xb02a3c, 0xe0607a);
    icon(510, 46, 'star', 3); T(540, 30, `LV ${c.level}`, 24);
    T(512, 62, 'XP', 11, '#ffd6de'); bar(536, 66, 92, c.xp / xpToNext(c.level), 0xff8fa8);
    panel(648, 26, 176, 56, 0x1f6f9a, 0x58a8d8);
    const k = nextKeyGame(c);
    const opp = k ? TEAMS.find((t) => t.id === k.opponent) : null;
    icon(658, 46, 'ball', 3);
    T(686, 28, k ? `${k.daysAway} DAY${k.daysAway === 1 ? '' : 'S'}` : 'SEASON DONE', 20);
    T(686, 56, k && opp ? `${k.why} vs ${opp.id}` : '', 12, '#d8f0ff');
    panel(836, 26, 132, 56, 0x6b4c34, 0x9b7a55);
    icon(846, 42, 'coin', 2); T(866, 32, `$${L.money}`, 18, '#bfe86a');
    T(846, 58, `DAY ${L.day}`, 15, '#ffe9a8');
    this.hud = { g, texts };
  }

  // ------------------------------------------------------------ frame
  update(_t: number, dms: number) {
    const dt = Math.min(0.05, dms / 1000);
    this.t += dt;
    this.inp.poll();
    if (this.inp.pressed('dev')) (window as any).__toggleDev?.();
    if (this.inp.pressed('escape') || this.inp.pressed('back')) { this.scene.start('Menu'); return; }

    // movement: stick = feet across / into the room, R2 or Shift hurries
    const m = this.inp.move, mag = Math.hypot(m.x, m.y);
    const sp = (this.inp.sprint ? JOG : WALK) * Math.min(1, mag);
    const want = { x: m.x * (mag > 0 ? sp / mag : 0), y: m.y * (mag > 0 ? sp / mag : 0) };
    this.vel = { x: this.vel.x + (want.x - this.vel.x) * Math.min(1, dt * 14), y: this.vel.y + (want.y - this.vel.y) * Math.min(1, dt * 14) };
    const before = this.pos, extra = this.extraObstacles();
    this.pos = moveWithCollision(this.pos, { x: this.vel.x * dt, y: this.vel.y * dt }, PLAYER_R, extra.length ? [...this.polys, ...extra] : this.polys);
    const moved = Math.hypot(this.pos.x - before.x, this.pos.y - before.y);
    if (mag > 0.2) this.face = { x: m.x, y: m.y };
    this.dist += moved;

    // doors
    const door = doorNear(this.pos, 1.6, this.room());
    this.prompt.setVisible(!!door);
    if (door) {
      this.prompt.setText(`✕ ${door.label}`).setPosition(sxOf(door.spot.x), syOf(door.spot.y) - 160);
      if (this.inp.pressed('a')) {
        if (door.to) { this.scene.start(door.to.scene, door.to.at ? { at: door.to.at } : undefined); return; }
        (window as any).__toast?.(door.soon ?? 'Coming soon');
      }
    }

    this.drawPlayer(moved / Math.max(dt, 1e-3));
    this.onUpdate(dt);
    this.sortDepths();
    this.drawDebug();
  }

  drawPlayer(speed: number) {
    const c = app.career;
    const sheet = sheetFor(this, this.sheetKey, c.height, c.appearance, this.kit);
    const sx = sxOf(this.pos.x), sy = syOf(this.pos.y);
    this.shadow.clear().fillStyle(0x2a1a0e, 0.32).fillEllipse(sx, sy, 34, 10);
    if (!sheet) return;
    const clip = speed > WALK * 1.15 ? 'sprint' : speed > 0.6 ? 'jog' : 'idle';
    const u = clip === 'sprint' ? this.dist / 9.5 : clip === 'jog' ? this.dist / 7 : this.t * 0.5;
    const cl = CLIP[clip], fi = frameAt(cl, u);
    // multi-angle: facing toward the camera = +90 (room y grows toward us, like court y)
    const ang = (Math.atan2(this.face.y, this.face.x) * 180) / Math.PI;
    this.view = yawFor(ang, this.view, 10);
    let tex = this.sheetKey, frame: string | number = sheet.index[clip].start + fi;
    if (this.view.yaw !== 0) {
      const cache = angleCache(this, this.sheetKey, c.height, c.appearance, this.kit, ['idle', 'jog']);
      const ck = `${clip}|${fi}|${this.view.yaw}`, slot = cache.get(ck);
      if (slot) { tex = angPage(this.sheetKey, slot.page); frame = `s${slot.index}`; } else cache.request(ck, true);
    }
    pumpSheet(this, this.sheetKey, 3, true);
    if (this.player.texture.key !== tex) this.player.setTexture(tex, frame); else this.player.setFrame(frame);
    this.player.setVisible(true).setPosition(sx, sy).setFlipX(this.view.flip);
  }

  /** Furniture keeps a fixed depth; walkers are sorted against the pieces their picture overlaps (`actorDepthFt`). */
  sortDepths() {
    const overlapsAt = (pos: V, w: number, h: number) => {
      const x0 = sxOf(pos.x) - w, x1 = sxOf(pos.x) + w, y1 = syOf(pos.y), y0 = y1 - h;
      return (p: Piece) => {
        const a = this.artOf.get(p.id); if (!a) return true;
        const ax0 = a.x * ART, ay0 = a.y * ART, ax1 = ax0 + a.w * ART, ay1 = ay0 + a.h * ART;
        return ax0 < x1 && ax1 > x0 && ay0 < y1 && ay1 > y0;
      };
    };
    this.player.setDepth(syOf(actorDepthFt(this.pos, this.room().furniture, overlapsAt(this.pos, 24, 155))));
    this.sortExtras(overlapsAt);
  }

  drawDebug() {
    const g = this.debug.clear();
    if (!app.settings.debug.room) return;
    g.lineStyle(2, 0x00ffcc, 0.9);
    for (const p of this.room().furniture) g.strokePoints(footprint(p).map((q) => new Phaser.Math.Vector2(sxOf(q.x), syOf(q.y))), true);
    g.lineStyle(2, 0xff4060, 0.9);
    for (const d of this.room().doors) g.strokeCircle(sxOf(d.spot.x), syOf(d.spot.y), 10);
    g.lineStyle(2, 0xffff00, 1).strokeEllipse(sxOf(this.pos.x), syOf(this.pos.y), PLAYER_R * 2 * 22, PLAYER_R * 2 * 14);
  }
}

/** A circle as an obstacle polygon (octagon). */
export function circlePoly(c: V, r: number): Poly {
  return Array.from({ length: 8 }, (_, i) => ({ x: c.x + Math.cos((i / 8) * Math.PI * 2) * r, y: c.y + Math.sin((i / 8) * Math.PI * 2) * r }));
}
