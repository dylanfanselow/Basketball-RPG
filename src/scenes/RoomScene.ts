import Phaser from 'phaser';
import { InputMapper } from '../input/input';
import { hiRes, FONT } from './ui';
import { app } from '../state';
import { TEAMS, CORE_STATS, CoreStat } from '../sim/data';
import { xpToNext, nextKeyGame, storyKeyGame, skillXpToNext, addSkillXp, takeOrbEnergy, ORB_XP, addEnergy } from '../career/career';
import { sfx } from '../audio/sfx';
import { Kit, FRAME_W, FRAME_H, CX, FOOT_Y, SPRITE_SCALE, shade, figureHeight } from '../render/sprites';
import { CLIP, MAT_CLIPS, frameAt, frameTime, sampleClip, rigArms, Pose, J } from '../render/anim';
import { yawFor } from '../render/frameCache';
import { sheetFor, angleCache, angPage, pumpSheet, playerSheetKey } from '../render/playerBank';
import type { Appearance } from '../render/appearance';
import { buildIcons, ArtPiece, AS } from '../render/roomArt';
import { MiniGame, MiniInput, makeMiniGame } from '../world/minigames';
import { V, Piece, RoomDef, Station, stationU, actorDepthFt, pieceDepthFt, PLAYER_R, RS, solids, moveWithCollision, doorNear, stationNear, sxOf, syOf, Poly, footprint } from '../world/apartment';

export const WALK = 6.2, JOG = 10.5; // ft/s
export const ART = 1 / AS;           // scene units per art px (4/3)
const ROOM_TINT = 0xfff0dc;

/** Skill card colours (round 41), shared by the orbs flying to each card (round 43). */
export const SKILL_COL: Record<CoreStat, { tag: string; base: number; edge: number; dark: number; fill: number; track: number }> = {
  shooting: { tag: 'SHT', base: 0x5a8a2a, edge: 0xa6d65a, dark: 0x3d6420, fill: 0x9ae04a, track: 0x2c4a16 },
  finishing: { tag: 'FIN', base: 0x2f5f8f, edge: 0x7ab8ee, dark: 0x22476c, fill: 0x6ab8f0, track: 0x18324e },
  strength: { tag: 'STR', base: 0x8e1c30, edge: 0xe06a86, dark: 0x6a1424, fill: 0xf05a80, track: 0x4a0e1a },
  mobility: { tag: 'MOB', base: 0x3aa0c0, edge: 0xa8eaff, dark: 0x2a7a94, fill: 0x9ff2ff, track: 0x1e5a6e },
  playmaking: { tag: 'PLY', base: 0xb8901c, edge: 0xffe07a, dark: 0x8a6a12, fill: 0xffd84a, track: 0x5e4810 },
};
/** Where an orb goes: a skill card, or the energy bar (sleep). */
export type OrbTo = CoreStat | 'energy';
/** Orb colours per target: dark rim, body, lighter top / glow, shine. Energy orbs are the owner's lime green. */
export const ORB_COL: Record<OrbTo, { rim: number; body: number; light: number; shine: number }> = {
  shooting: { rim: 0x2c4a16, body: 0x5a9a28, light: 0x8fd23a, shine: 0xd0f5a0 },
  finishing: { rim: 0x18324e, body: 0x2f6fb0, light: 0x6ab8f0, shine: 0xd0ecff },
  strength: { rim: 0x4a0e1a, body: 0xc0284a, light: 0xf05a80, shine: 0xffc8d6 },
  mobility: { rim: 0x1e5a6e, body: 0x3ab8d8, light: 0x9ff2ff, shine: 0xeaffff },
  playmaking: { rim: 0x5e4810, body: 0xd8a818, light: 0xffd84a, shine: 0xfff4c0 },
  energy: { rim: 0x245a10, body: 0x6cc81e, light: 0x9be63a, shine: 0xd8ff9a },
};          // warm room light on the player, so he sits in the same lighting as the furniture

/**
 * A walkable cutaway room (apartment, garage, …): you walk around (stick / WASD, R2 / Shift to hurry), walls and
 * furniture are solid, ✕ at a door goes through it, L1 leaves to the menu. Subclasses supply the room and its art.
 */
/** Round 60c: you in the rooms — a plain tee and your team-colour shorts (shared with the preloader). */
export function roomPlayerKit(c: { teamId: string }): Kit {
  const team = TEAMS.find((t) => t.id === c.teamId) ?? TEAMS[0];
  return { jersey: '#ebe7de', jerseyShade: '#c9c4b8', trim: '#d8d3c8', shorts: shade(team.colors[0], 0.9), number: -1 };
}
export const roomSheetKey = (c: { teamId: string; appearance: Appearance; height: number }) => playerSheetKey('HOME', c.appearance, c.height, roomPlayerKit(c));

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
  hud!: { g: Phaser.GameObjects.Graphics; objs: Phaser.GameObjects.GameObject[]; sig: string };
  /** Skill cards' screen boxes (for the level-up flash) and the levels last shown. */
  skillCards = new Map<CoreStat, { x: number; y: number; w: number; h: number }>();
  private shownLevels: Partial<Record<CoreStat, number>> = {};
  private flashes: { stat: CoreStat; at: number; text: Phaser.GameObjects.Text }[] = [];
  private hudFx: Phaser.GameObjects.Graphics | null = null;
  /** Workout XP orbs in flight (round 42): from where you trained to a skill card; the XP lands when the orb does. */
  private orbs: { to: OrbTo; amount: number; from: V; at: number; side: number }[] = [];
  /** The energy bar's box on the HUD (energy orbs fly into it). */
  energyBox = { x: 346, y: 35, w: 72, h: 10 };
  private orbG: Phaser.GameObjects.Graphics | null = null;
  private pops: { to: OrbTo; at: number }[] = [];
  private tiredAt = -9;
  private tiredText: Phaser.GameObjects.Text | null = null;
  sheetKey = '';
  artOf = new Map<string, ArtPiece>();
  kit!: Kit;
  /** The workout in progress (round 38), and how long it's been going. */
  activity: Station | null = null;
  actT = 0;
  /** The workout's mini-game (round 39), if it has one. */
  mini: MiniGame | null = null;

  abstract room(): RoomDef;
  /** Bake (or reuse) the background + piece textures. */
  abstract buildArt(tm: Phaser.Textures.TextureManager): { bg: string; pieces: ArtPiece[] };
  /** Extra things you can't walk through this frame (e.g. the cat). */
  extraObstacles(): Poly[] { return []; }
  /** Things you can do at a spot that aren't workouts (round 43: sleep on the couch). Checked before stations. */
  actions(): { label: string; spot: V; reach?: number; run: () => void }[] { return []; }
  /** A cutscene is playing (sleeping): no walking or prompts; the room keeps animating. */
  busy = false;
  /** Room-specific objects after the art is placed. */
  onCreate(): void { /* optional */ }
  /** What your feet land on (round 57): concrete (true), wood (false) or grass. */
  footSurface(): boolean | 'grass' { return this.room().id === 'garage'; }
  /** Room-specific per-frame work (animations, pets…), after you've moved. */
  onUpdate(_dt: number): void { /* optional */ }
  /** Room-specific draw order for other walkers. */
  sortExtras(_overlapsAt: (pos: V, w: number, h: number) => (p: Piece) => boolean): void { /* optional */ }
  /** A workout started (station) or stopped (null): swap equipment pictures etc. */
  onActivity(_st: Station | null): void { /* optional */ }

  /** `at` = the id of the door you come in through (you appear in front of it). */
  /** Footsteps (round 52): distance at the last step, and which foot. */
  stepAt = 0; stepFoot = 0;
  /** Came in through a door (round 47: it closes behind you with a sound). */
  enteredByDoor = false;

  init(data?: { at?: string }) {
    const r = this.room(), door = data?.at ? r.doors.find((d) => d.id === data.at) : undefined;
    this.enteredByDoor = !!door;
    this.pos = { ...(door ? door.spot : r.spawn) };
    this.vel = { x: 0, y: 0 }; this.face = door ? { x: 0, y: 1 } : { x: 0, y: 1 }; this.view = undefined;
    this.dist = 0; this.t = 0; this.stepAt = 0; this.stepFoot = 0; this.pieces = []; this.artOf = new Map(); this.activity = null; this.actT = 0; this.mini = null; this.busy = false;
  }

  create() {
    hiRes(this);
    this.cameras.main.setBackgroundColor('#1a120c');
    // orbs still flying land when you leave; their graphics go with the scene
    this.orbs = []; this.pops = []; this.orbG = null; this.hudFx = null; this.tiredText = null; this.flashes = [];
    this.events.once('shutdown', () => this.flushOrbs());
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
    const c = app.career;
    this.kit = roomPlayerKit(c);
    this.sheetKey = roomSheetKey(c);
    this.shadow = this.add.graphics().setDepth(-500);
    this.player = this.add.sprite(0, 0, '__DEFAULT').setOrigin(CX / FRAME_W, FOOT_Y / FRAME_H).setScale(SPRITE_SCALE).setTint(ROOM_TINT).setVisible(false);
    this.prompt = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '15px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5, 1).setDepth(9500).setVisible(false);
    this.debug = this.add.graphics().setDepth(9400);
    buildIcons(tm);
    this.onCreate();
    this.makeHud();
    if (this.enteredByDoor) this.time.delayedCall(260, () => sfx.doorClose()); // the door swings shut behind you
  }

  // ------------------------------------------------------------ HUD (on the roof, styled like the reference's boxes)
  /** Everything the HUD shows, so it rebuilds only when something changes. */
  private hudSig(): string {
    const c = app.career;
    return JSON.stringify([c.level, c.xp, c.skills, c.life, c.season.gameNo, c.story?.stage]);
  }

  makeHud() {
    if (this.hud) for (const o of this.hud.objs) o.destroy();
    const g = this.add.graphics().setDepth(9000);
    const objs: Phaser.GameObjects.GameObject[] = [g];
    const T = (x: number, y: number, s: string, size = 18, col = '#ffffff', stroke = 4) => {
      const t = this.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color: col, fontStyle: 'bold', stroke: '#2a1a10', strokeThickness: stroke }).setDepth(9001);
      objs.push(t); return t;
    };
    const icon = (x: number, y: number, name: string, s = 3) => {
      const im = this.add.image(x, y, `icon_${name}`).setOrigin(0, 0.5).setScale(s * ART * 0.75).setDepth(9001);
      objs.push(im); return im;
    };
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
    /** A rounded pill bar (the reference's style): dark track, light fill, a highlight line along the top. */
    const pill = (x: number, y: number, w: number, h: number, v: number, track: number, fill: number) => {
      const r = h / 2, fw = Math.max(0, Math.min(1, v)) * w;
      g.fillStyle(0x1e1410, 0.9).fillRoundedRect(x - 1, y - 1, w + 2, h + 2, r + 1);
      g.fillStyle(track, 1).fillRoundedRect(x, y, w, h, r);
      if (fw >= 1) {
        const ww = Math.max(h, fw);
        g.fillStyle(fill, 1).fillRoundedRect(x, y, ww, h, r);
        g.fillStyle(0xffffff, 0.35).fillRect(x + r * 0.6, y + 1, Math.max(0, ww - r * 1.2), Math.max(1, h * 0.22));
      }
    };
    // the wooden board on the roof (a soft shadow under it)
    g.fillStyle(0x000000, 0.22).fillRoundedRect(250, 18, 788, 86, 9);
    panel(246, 12, 788, 86, 0x7a5a3e, 0xb08a5c);
    // energy / food
    panel(258, 22, 168, 66, 0x6b4c34, 0x9b7a55);
    icon(266, 40, 'energy', 2); T(284, 31, 'ENERGY', 11, '#ffe9a8'); bar(346, 35, 72, L.energy / 100, 0x6fd24a);
    this.energyBox = { x: 346, y: 35, w: 72, h: 10 };
    icon(266, 70, 'food', 2); T(284, 61, 'FOOD', 11, '#ffe9a8'); bar(346, 65, 72, L.food / 100, 0x6fd24a);
    // level block (round 41, the owner's reference): LVL + a long XP bar, then the five skill cards
    panel(436, 22, 248, 66, 0x5a3f2a, 0x9b7a55);
    icon(442, 31, 'star', 2);
    T(458, 23, `LVL ${c.level}`, 14, '#ffffff', 3);
    pill(526, 27, 150, 8, c.xp / xpToNext(c.level), 0x8a3e1a, 0xe8743a);
    const SK = SKILL_COL;
    // the olive-brown strip the cards sit in (like the gaps between the reference's cards)
    g.fillStyle(0x1e1410, 1).fillRoundedRect(440, 42, 240, 43, 4);
    g.fillStyle(0x6e5c3e, 1).fillRoundedRect(441, 43, 238, 41, 4);
    const cw = 44, ch = 37, gap = 3, top = 24;
    CORE_STATS.forEach((st, i) => {
      const k = SK[st], sk = c.skills[st], x = 444 + i * (cw + gap), y = 45;
      this.skillCards.set(st, { x, y, w: cw, h: ch });
      g.fillStyle(0x1e1410, 1).fillRoundedRect(x - 1, y - 1, cw + 2, ch + 2, 5);
      g.fillStyle(k.edge, 1).fillRoundedRect(x, y, cw, ch, 4);
      g.fillStyle(k.base, 1).fillRoundedRect(x + 1.5, y + 1.5, cw - 3, top - 1.5, { tl: 3, tr: 3, bl: 0, br: 0 });
      g.fillStyle(0xffffff, 0.14).fillRect(x + 3, y + 2.5, cw - 6, 1.5);
      g.fillStyle(k.edge, 1).fillRect(x + 1.5, y + top, cw - 3, 1.5); // divider
      g.fillStyle(k.dark, 1).fillRoundedRect(x + 1.5, y + top + 1.5, cw - 3, ch - top - 3, { tl: 0, tr: 0, bl: 3, br: 3 });
      icon(x + 3, y + 1.5 + top / 2, `sk_${st}`, 1.45);
      T(x + cw - 2, y + top / 2 + 1, String(sk.level), 13, '#ffffff', 3).setOrigin(1, 0.5);
      T(x + 3, y + top + 2.5, k.tag, 7, '#ffffff', 0).setAlpha(0.55);
      pill(x + 20, y + top + 4, cw - 24, 5, sk.xp / skillXpToNext(sk.level), k.track, k.fill);
    });
    // key game
    panel(694, 22, 168, 66, 0x1f6f9a, 0x58a8d8);
    const kg = nextKeyGame(c), hs = storyKeyGame(c); // round 60b: in high school it's the big game
    const opp = kg ? TEAMS.find((t) => t.id === kg.opponent) : null;
    icon(702, 46, 'ball', 3);
    T(730, 28, hs ? hs.when : !kg ? 'SEASON DONE' : kg.daysAway === 0 ? 'TODAY' : `${kg.daysAway} DAY${kg.daysAway === 1 ? '' : 'S'}`, 20);
    T(730, 58, hs ? hs.what : kg && opp ? `${kg.why} vs ${opp.id}` : '', 12, '#d8f0ff');
    // money / day
    panel(872, 22, 150, 66, 0x6b4c34, 0x9b7a55);
    icon(882, 40, 'coin', 2); T(902, 30, `$${L.money}`, 18, '#bfe86a');
    T(882, 58, `DAY ${L.day}`, 15, '#ffe9a8');
    this.hud = { g, objs, sig: this.hudSig() };
    // a skill that went up since it was last shown flashes and pops a "+n"
    for (const st of CORE_STATS) {
      const was = this.shownLevels[st], now = c.skills[st].level;
      if (was !== undefined && now > was) {
        const b = this.skillCards.get(st)!;
        const text = this.add.text(b.x + b.w / 2, b.y + 4, `+${now - was}`, { fontFamily: FONT, fontSize: '16px', color: '#ffffff', fontStyle: 'bold', stroke: '#2a1a10', strokeThickness: 4 }).setOrigin(0.5, 1).setDepth(9003);
        this.flashes.push({ stat: st, at: this.t, text });
      }
      this.shownLevels[st] = now;
    }
  }

  // ------------------------------------------------------------ workout orbs (round 42)
  static ORB_FLIGHT = 0.75;
  /**
   * Send one XP orb per stat from `from` (screen) to its skill card. Each orb costs energy when it's sent; out of
   * energy, nothing is sent and "TOO TIRED" pops over you.
   */
  sendOrbs(stats: CoreStat[], from: V) {
    let sent = 0;
    for (const stat of stats) {
      if (!takeOrbEnergy(app.career)) { this.showTired(from); break; }
      this.orbs.push({ to: stat, amount: ORB_XP, from: { ...from }, at: this.t + sent * 0.16, side: sent % 2 ? 1 : -1 });
      sent++;
    }
    if (sent) { app.changed(); sfx.orbSend(); }
  }
  /** Sleep (round 43): `n` energy orbs (each worth `each`) rise from `from` into the energy bar, free of charge. */
  sendEnergyOrbs(n: number, each: number, from: V) {
    for (let i = 0; i < n; i++) this.orbs.push({ to: 'energy', amount: each, from: { x: from.x + (i % 3 - 1) * 14, y: from.y }, at: this.t + i * 0.14, side: i % 2 ? 1 : -1 });
    if (n) sfx.orbSend();
  }
  private targetBox(to: OrbTo) { return to === 'energy' ? this.energyBox : this.skillCards.get(to); }
  private showTired(from: V) {
    if (this.t - this.tiredAt < 1.5) return;
    this.tiredAt = this.t;
    if (!this.tiredText) this.tiredText = this.add.text(0, 0, 'TOO TIRED · REST TO TRAIN', { fontFamily: FONT, fontSize: '15px', color: '#ff9a7a', fontStyle: 'bold', stroke: '#2a1a10', strokeThickness: 4 }).setOrigin(0.5, 1).setDepth(9401);
    this.tiredText.setPosition(from.x, from.y - 20);
    sfx.blip(false);
  }
  /** Where an orb is k (0..1) along its flight: a lazy arc up off you, then it speeds into the card. */
  private orbAt(o: { to: OrbTo; from: V; side: number }, k: number): V | null {
    const b = this.targetBox(o.to); if (!b) return null;
    const to = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const c = { x: o.from.x + o.side * 70, y: Math.min(o.from.y, to.y) + (o.from.y - to.y) * 0.15 - 40 };
    const e = k * k * (1.6 - 0.6 * k); // slow start, fast finish
    const u = 1 - e;
    return { x: u * u * o.from.x + 2 * u * e * c.x + e * e * to.x, y: u * u * o.from.y + 2 * u * e * c.y + e * e * to.y };
  }
  private updateOrbs() {
    if (!this.orbG) this.orbG = this.add.graphics().setDepth(9400);
    const g = this.orbG.clear();
    const R = 6.5;
    // each orb wears the colours of where it's going (round 43)
    const ball = (to: OrbTo, p: V, a = 1, r = R) => {
      const c = ORB_COL[to];
      g.fillStyle(c.light, 0.22 * a).fillCircle(p.x, p.y, r * 1.9);          // glow
      g.fillStyle(c.rim, a).fillCircle(p.x, p.y, r + 1.2);                   // dark rim
      g.fillStyle(c.body, a).fillCircle(p.x, p.y, r);
      g.fillStyle(c.light, a).fillCircle(p.x - r * 0.18, p.y - r * 0.18, r * 0.72);
      g.fillStyle(c.shine, a).fillCircle(p.x - r * 0.38, p.y - r * 0.4, r * 0.28); // shine
    };
    this.orbs = this.orbs.filter((o) => {
      const k = (this.t - o.at) / RoomScene.ORB_FLIGHT;
      if (k < 0) return true;
      if (k >= 1) { this.landOrb(o.to, o.amount); return false; }
      for (const [dk, a] of [[0.09, 0.45], [0.05, 0.7]] as const) { const q = this.orbAt(o, Math.max(0, k - dk)); if (q) ball(o.to, q, a * (1 - k * 0.3), R * (1 - dk * 3)); }
      const p = this.orbAt(o, k); if (p) ball(o.to, p, Math.min(1, k * 8), R * (k < 0.12 ? 0.4 + k * 5 : 1));
      return true;
    });
    // the card (or the energy bar) takes the orb: a ring in the orb's colour pops out of it
    this.pops = this.pops.filter((p) => {
      const k = (this.t - p.at) / 0.4; if (k >= 1) return false;
      const b = this.targetBox(p.to); if (!b) return false;
      const c = ORB_COL[p.to];
      g.lineStyle(3 * (1 - k), c.light, 1 - k).strokeRoundedRect(b.x - k * 6, b.y - k * 6, b.w + k * 12, b.h + k * 12, Math.min(5 + k * 3, (b.h + k * 12) / 2));
      g.fillStyle(c.shine, 0.35 * (1 - k)).fillRoundedRect(b.x, b.y, b.w, b.h, Math.min(4, b.h / 2));
      return true;
    });
    if (this.tiredText) { const k = (this.t - this.tiredAt) / 1.4; this.tiredText.setVisible(k < 1).setAlpha(1 - k * k).setY(this.tiredText.y - 0.4); }
  }
  private landOrb(to: OrbTo, amount: number) {
    this.pops.push({ to, at: this.t });
    if (to === 'energy') { addEnergy(app.career, amount); sfx.orbPop(); }
    else { const up = addSkillXp(app.career, to, amount); if (up) sfx.greenChime(); else sfx.orbPop(); }
    app.changed();
  }
  /** Orbs still flying when the room closes land at once (their XP is never lost). */
  flushOrbs() {
    for (const o of this.orbs) { if (o.to === 'energy') addEnergy(app.career, o.amount); else addSkillXp(app.career, o.to, o.amount); }
    if (this.orbs.length) app.changed();
    this.orbs = []; this.pops = []; this.orbG = null; this.hudFx = null; this.tiredText = null; this.flashes = [];
  }

  /** Rebuild the HUD when career values change (dev tools, rewards), and play the skill level-up flashes. */
  updateHud() {
    if (this.hud.sig !== this.hudSig()) this.makeHud();
    if (!this.hudFx) this.hudFx = this.add.graphics().setDepth(9002);
    const fx = this.hudFx.clear();
    this.flashes = this.flashes.filter((f) => {
      const k = (this.t - f.at) / 1.1;
      if (k >= 1) { f.text.destroy(); return false; }
      const b = this.skillCards.get(f.stat)!;
      fx.fillStyle(0xffffff, 0.75 * (1 - k) * (0.6 + 0.4 * Math.cos(k * 18))).fillRoundedRect(b.x, b.y, b.w, b.h, 4);
      fx.lineStyle(2, 0xffe27a, 1 - k).strokeRoundedRect(b.x - 2 - k * 4, b.y - 2 - k * 4, b.w + 4 + k * 8, b.h + 4 + k * 8, 6);
      f.text.setY(b.y + 4 - k * 18).setAlpha(1 - k * k);
      return true;
    });
  }

  // ------------------------------------------------------------ frame
  update(_t: number, dms: number) {
    const dt = Math.min(0.05, dms / 1000);
    this.t += dt;
    this.inp.poll();
    this.updateHud();
    this.updateOrbs();
    if (this.inp.pressed('dev')) (window as any).__toggleDev?.();
    if (this.busy) { this.prompt.setVisible(false); if (this.activity) { this.actT += dt; this.drawPlayer(0); } this.onUpdate(dt); this.sortDepths(); this.drawDebug(); return; }
    if (this.activity) {
      // working out: stay on the equipment and play its mini-game; only L1 (Esc) stops (✕ / ○ are game buttons)
      this.actT += dt;
      if (this.inp.pressed('escape') || this.inp.pressed('back')) { this.stopActivity(); this.drawPlayer(0); return; }
      {
        this.mini?.update(dt, this.miniInput());
        this.prompt.setVisible(!this.mini).setText(`${this.activity.label}  ·  L1 stop`).setPosition(sxOf(this.pos.x), syOf(this.pos.y) - 175);
        this.drawPlayer(0); this.onUpdate(dt); this.sortDepths(); this.drawDebug();
        return;
      }
    }
    if (this.inp.pressed('escape') || this.inp.pressed('back')) { this.scene.start('Title'); return; } // round 58: back to the main menu

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
    // round 52: footsteps — one per stride while walking (concrete in the garage, wood in the apartment)
    if (moved > 0.001) {
      const run = Math.hypot(this.vel.x, this.vel.y) > WALK * 1.15, stride = run ? 3.1 : 2.4;
      if (this.dist - this.stepAt >= stride) { this.stepAt = this.dist; this.stepFoot ^= 1; sfx.footstep(this.footSurface(), this.stepFoot, run); }
    } else this.stepAt = this.dist - 1.6; // the first step comes quickly after you start moving

    // things to do (sleep) first, then equipment, then doors
    const act = this.actions().find((a) => Math.hypot(this.pos.x - a.spot.x, this.pos.y - a.spot.y) <= (a.reach ?? 1.5));
    if (act) {
      this.prompt.setVisible(true).setText(`✕ ${act.label}`).setPosition(sxOf(act.spot.x), syOf(act.spot.y) - 165);
      this.drawPlayer(0);
      if (this.inp.pressed('a')) { act.run(); return; }
    }
    const st = act ? null : stationNear(this.pos, this.room());
    const door = st || act ? null : doorNear(this.pos, 1.6, this.room());
    if (!act) this.prompt.setVisible(!!door || !!st);
    if (st) {
      this.prompt.setText(`✕ ${st.label}`).setPosition(sxOf(st.spot.x), syOf(st.spot.y) - 165);
      if (this.inp.pressed('a')) this.startActivity(st);
    }
    if (door) {
      this.prompt.setText(`✕ ${door.label}`).setPosition(sxOf(door.spot.x), syOf(door.spot.y) - 160);
      if (this.inp.pressed('a')) {
        if (door.to) { sfx.doorOpen(); this.scene.start(door.to.scene, door.to.at ? { at: door.to.at } : undefined); return; }
        sfx.doorLocked();
        (window as any).__toast?.(door.soon ?? 'Coming soon');
      }
    }

    this.drawPlayer(moved / Math.max(dt, 1e-3));
    this.onUpdate(dt);
    this.sortDepths();
    this.drawDebug();
  }

  /** This frame's controller state for the mini-games. */
  miniInput(): MiniInput {
    const p = (k: string) => this.inp.pressed(k);
    return { stick: this.inp.move, a: p('a'), b: p('b'), x: p('x'), y: p('y'), l2: p('post'), r2: p('sprint'), aHeld: this.inp.held('a') };
  }
  /** Where in its clip the player is during a workout: the mini-game drives it (or a plain loop without one). */
  activityU(st: Station): number {
    return this.mini ? this.mini.animU() : stationU(st, this.actT, !!CLIP[st.clip].loop);
  }

  startActivity(st: Station) {
    this.activity = st; this.actT = 0; this.pos = { ...st.at }; this.vel = { x: 0, y: 0 };
    this.mini = makeMiniGame(st.id);
    this.lastAngled = null;
    // the dribbling mat's clips are drawn facing us: queue all their frames now
    if (st.id === 'dribble') {
      const c = app.career, cache = angleCache(this, this.sheetKey, c.height, c.appearance, this.kit, ['idle', 'jog']);
      for (const name of MAT_CLIPS) for (let f = 0; f < CLIP[name].frames; f++) cache.request(`${name}|${f}|${st.yaw}`, true);
    }
    this.onActivity(st);
  }
  stopActivity() {
    const st = this.activity; if (!st) return;
    this.activity = null; this.mini = null; this.pos = { ...st.spot }; this.face = { x: 0, y: 1 }; this.view = undefined;
    this.onActivity(null);
  }
  /** The clip, frame and pose (as drawn: arms rigged) the player shows right now in a workout. */
  activityFrame(): { clip: string; fi: number; pose: Pose } | null {
    const st = this.activity; if (!st) return null;
    const own = this.mini?.clip(), name = own?.clip ?? st.clip;
    const cl = CLIP[name], fi = frameAt(cl, own ? own.u : this.activityU(st));
    return { clip: name, fi, pose: rigArms(sampleClip(cl, frameTime(cl, fi)), false) };
  }
  /** Screen position of a pose joint for the player as drawn now (side view; mirrored if flipped). */
  jointToScreen(j: J): V {
    const k = (figureHeight(app.career.height) / 100) * SPRITE_SCALE, st = this.activity;
    const flip = this.view?.flip ?? false;
    void st;
    return { x: this.player.x + (flip ? -j[0] : j[0]) * k, y: this.player.y - j[1] * k };
  }

  /** The ball in the player's hands as drawn this frame (screen px; `behind` = on the far side of the body), or null. */
  playerBall: { x: number; y: number; behind: boolean } | null = null;
  /** The clip + spot in it the player shows this frame. */
  playerClip: { clip: string; u: number } | null = null;
  private lastAngled: { tex: string; frame: string | number; bo: J | null; behind: boolean } | null = null;

  /**
   * Round 60b: walk the player toward a spot on his own (story cutscenes, while `busy`): collision, facing, footsteps
   * and the walk cycle like stick walking. True once he's there (or stuck).
   */
  walkTowards(target: V, dt: number, speed = WALK): boolean {
    const dx = target.x - this.pos.x, dy = target.y - this.pos.y, d = Math.hypot(dx, dy);
    if (d < 0.15) { this.vel = { x: 0, y: 0 }; this.drawPlayer(0); return true; }
    const step = Math.min(d, speed * dt), extra = this.extraObstacles(), before = this.pos;
    this.pos = moveWithCollision(this.pos, { x: dx / d * step, y: dy / d * step }, PLAYER_R, extra.length ? [...this.polys, ...extra] : this.polys);
    const moved = Math.hypot(this.pos.x - before.x, this.pos.y - before.y);
    this.vel = { x: dx / d * speed, y: dy / d * speed };
    this.face = { x: dx / d, y: dy / d };
    this.dist += moved;
    if (this.dist - this.stepAt >= 2.4) { this.stepAt = this.dist; this.stepFoot ^= 1; sfx.footstep(this.footSurface(), this.stepFoot, false); }
    this.drawPlayer(moved / Math.max(dt, 1e-3));
    return moved < step * 0.05; // blocked: call it arrived rather than walking in place forever
  }

  /** Round 60c: is your sprite sheet drawn yet (cutscenes wait for it so you never see an empty room)? */
  playerReady(): boolean {
    const c = app.career;
    return !!sheetFor(this, this.sheetKey, c.height, c.appearance, this.kit);
  }

  drawPlayer(speed: number) {
    this.playerBall = null;
    const c = app.career;
    const sheet = sheetFor(this, this.sheetKey, c.height, c.appearance, this.kit);
    const st = this.activity;
    // standing on something (the treadmill deck) + off the floor in a jump shot; the shadow stays on the floor
    const jump = this.mini?.jumpFt() ?? 0;
    // round 57: outdoors you can be standing on steps (the room's liftAt)
    const lift = st ? st.lift : this.room().liftAt?.(this.pos) ?? 0;
    const sx = sxOf(this.pos.x), floorY = syOf(this.pos.y) - lift * RS, sy = floorY - jump * RS;
    this.shadow.clear();
    if (!st || st.clip === 'jog' || st.clip === 'jumpRope' || st.clip === 'squat' || st.clip === 'shot_jumper' || st.clip === 'mat_pound') this.shadow.fillStyle(0x2a1a0e, 0.32 - jump * 0.06).fillEllipse(sx, floorY, 34 - jump * 5, 10 - jump);
    if (!sheet) return;
    let clip = speed > WALK * 1.15 ? 'sprint' : speed > 0.6 ? 'jog' : 'idle';
    let u = clip === 'sprint' ? this.dist / 9.5 : clip === 'jog' ? this.dist / 7 : this.t * 0.5;
    if (st) { const own = this.mini?.clip(); clip = own?.clip ?? st.clip; u = own ? own.u : this.activityU(st); }
    this.playerClip = { clip, u };
    const cl = CLIP[clip], fi = frameAt(cl, u);
    // multi-angle: facing toward the camera = +90 (room y grows toward us, like court y)
    const ang = (Math.atan2(this.face.y, this.face.x) * 180) / Math.PI;
    this.view = st ? { yaw: st.yaw, flip: st.flip } : yawFor(ang, this.view, 10);
    let tex = this.sheetKey, frame: string | number = sheet.index[clip].start + fi;
    let bo = sheet.ball[sheet.index[clip].start + fi], behind = false;
    if (this.view.yaw !== 0) {
      const cache = angleCache(this, this.sheetKey, c.height, c.appearance, this.kit, ['idle', 'jog']);
      const ck = `${clip}|${fi}|${this.view.yaw}`, slot = cache.get(ck);
      if (slot) { tex = angPage(this.sheetKey, slot.page); frame = `s${slot.index}`; bo = slot.ball; behind = slot.ballBehind; this.lastAngled = { tex, frame, bo, behind }; }
      else {
        cache.request(ck, true);
        // in a workout, hold the last angled frame while this one draws (never flash the side view)
        if (st && this.lastAngled) ({ tex, frame, bo, behind } = this.lastAngled);
      }
    }
    pumpSheet(this, this.sheetKey, 3, true);
    if (this.player.texture.key !== tex) this.player.setTexture(tex, frame); else this.player.setFrame(frame);
    this.player.setVisible(true).setPosition(sx, sy).setFlipX(this.view.flip);
    if (bo) this.playerBall = { x: sx + (this.view.flip ? -bo[0] : bo[0]) * SPRITE_SCALE, y: sy - bo[1] * SPRITE_SCALE, behind };
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
    const st = this.activity;
    this.player.setDepth(st?.depthFt !== undefined ? syOf(st.depthFt) + 0.5 : syOf(actorDepthFt(this.pos, this.room().furniture, overlapsAt(this.pos, 24, 155))));
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
