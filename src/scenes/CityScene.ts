import Phaser from 'phaser';
import { hiRes, FONT } from './ui';
import { InputMapper } from '../input/input';
import { app } from '../state';
import { sfx } from '../audio/sfx';
import { buildIcons } from '../render/roomArt';
import { buildCityArt, CITY_BG } from '../render/cityArt';
import { PLACES, PLACE, PlaceId, Place, placeToward, travelCost, canTravel } from '../world/city';
import { drawTopHud } from './roomHud';
import { openTasks } from '../career/tasks';
import { todaysEvents, eventName, nextEvent, eventLine, GoEvent } from '../career/draft';
import { nextKeyGame, addEnergy } from '../career/career';
import { goTo } from './draftRoad';
import { ART, roomPlayerKit, roomSheetKey } from './RoomScene';
import { sheetFor } from '../render/playerBank';
import { SPRITE_SCALE } from '../render/sprites';
import type { GameInit } from './setup';

/** The Lincoln court from the map: a shootaround on the school court (L1 → back to the map). */
const LINCOLN_SHOOTAROUND: GameInit = { mode: 'practice', venue: 'school', empty: true, returnTo: { scene: 'City', data: { at: 'lincoln' } } };

/**
 * Round 92 (owner): the city map. The whole town on one screen under the rooms' stat bar: the stick hops between the
 * places, ✕ goes there (a trip costs a little energy, farther = more; home is free; an event trip is free), L1 goes
 * home. You stand on a little pedestal where you are; the place you've picked lifts, rings and shows its card.
 */
export class CityScene extends Phaser.Scene {
  constructor() { super('City'); }
  private inp!: InputMapper;
  /** where you are, and the place the cursor is on */
  private at: PlaceId = 'home';
  private sel: PlaceId = 'home';
  private sprites = new Map<PlaceId, { img: Phaser.GameObjects.Image; y: number }>();
  private ring!: Phaser.GameObjects.Graphics;
  private card!: Phaser.GameObjects.Graphics;
  private cardText: Phaser.GameObjects.Text[] = [];
  private tag!: Phaser.GameObjects.Text;
  private figure!: Phaser.GameObjects.Sprite;
  private pedestal!: Phaser.GameObjects.Graphics;
  private falls!: Phaser.GameObjects.Sprite;
  private hud: Phaser.GameObjects.GameObject[] = [];
  private stickWas = 0;
  private t = 0;
  private leaving = false;
  /** two workouts today: the arena's card asks which (the highlighted one) */
  private choosing: { evs: GoEvent[]; i: number } | null = null;
  private walk: { from: Place; to: Place; t: number; then: () => void } | null = null;

  init(data?: { at?: PlaceId; select?: PlaceId }) {
    this.at = data?.at && PLACE[data.at] ? data.at : 'home';
    this.sel = data?.select && PLACE[data.select] ? data.select : this.at;
    this.sprites = new Map(); this.cardText = []; this.hud = []; this.t = 0; this.leaving = false; this.choosing = null; this.walk = null; this.stickWas = 0;
  }

  create() {
    hiRes(this);
    this.cameras.main.setBackgroundColor('#2a3a2a');
    this.inp = new InputMapper(this);
    buildIcons(this.textures);
    const art = buildCityArt(this.textures);
    this.add.image(0, 0, CITY_BG).setOrigin(0, 0).setScale(ART).setDepth(0);
    this.falls = this.add.sprite(art.falls.x * ART, art.falls.y * ART, art.falls.key, 0).setOrigin(0, 0).setScale(ART).setDepth(1);
    this.ring = this.add.graphics().setDepth(19); // over the places' lots, under you
    for (const p of PLACES) {
      const a = art.places[p.id];
      const img = this.add.image(a.x * ART, a.y * ART, a.key).setOrigin(0, 0).setScale(ART).setDepth(10 + p.at.y / 1000);
      this.sprites.set(p.id, { img, y: a.y * ART });
    }
    this.pedestal = this.add.graphics().setDepth(20);
    this.figure = this.add.sprite(0, 0, '__DEFAULT').setOrigin(0.5, 1).setScale(SPRITE_SCALE * 0.42).setDepth(21).setVisible(false);
    this.tag = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '15px', color: '#ffe9a8', fontStyle: 'bold', stroke: '#1a120c', strokeThickness: 4 }).setOrigin(0.5, 1).setDepth(30);
    this.card = this.add.graphics().setDepth(40);
    this.drawHud();
    this.drawCard();
    sfx.music('home');
    this.events.once('shutdown', () => sfx.music(null));
    this.cameras.main.fadeIn(350, 0, 0, 0);
  }

  private drawHud() {
    for (const o of this.hud) o.destroy();
    const c = app.career;
    this.hud = drawTopHud(this, openTasks(c).map((task) => ({ task, n: task.progress(c), paid: false }))).objs;
  }

  // ------------------------------------------------------------ what a place offers right now
  private status(p: Place): { line: string; ok: boolean; cost: number } {
    const c = app.career;
    if (p.id === this.at && p.id !== 'home') return { line: 'You\'re here.', ok: false, cost: 0 };
    if (p.id === 'home') return { line: this.at === 'home' ? '✕ Go inside' : '✕ Go home', ok: true, cost: 0 };
    if (!p.open) return { line: 'Coming later', ok: false, cost: 0 };
    if (p.id === 'arena') {
      const evs = todaysEvents(c);
      if (!evs.length) return { line: `Doors are locked today. ${eventLine(nextEvent(c, nextKeyGame(c)))}`, ok: false, cost: 0 };
      return { line: evs.length > 1 ? '✕ Today: two workouts (pick one)' : `✕ Today: ${eventName(c, evs[0])}  ·  they send a car`, ok: true, cost: 0 };
    }
    const cost = travelCost(this.at, p.id);
    if (!canTravel(c, cost)) return { line: `Too tired to go that far (${cost} energy).`, ok: false, cost };
    return { line: `✕ Go  ·  -${cost} energy`, ok: true, cost };
  }

  private drawCard() {
    for (const t of this.cardText) t.destroy();
    this.cardText = [];
    const p = PLACE[this.sel], s = this.status(p);
    // the card sits at the bottom, or up under the stat bar when the place is low on the map
    const x = 330, w = 620, h = 96, y = p.at.y * ART > 470 ? 112 : 604, g = this.card.clear();
    g.fillStyle(0x1a120c, 0.92).fillRoundedRect(x - 3, y - 3, w + 6, h + 6, 9);
    g.fillStyle(0xb08a5c, 1).fillRoundedRect(x - 1, y - 1, w + 2, h + 2, 8);
    g.fillStyle(0x2a1e14, 0.96).fillRoundedRect(x + 1, y + 1, w - 2, h - 2, 7);
    const T = (tx: number, ty: number, str: string, size: number, col: string, bold = false, wrap = 0) => {
      const t = this.add.text(tx, ty, str, { fontFamily: FONT, fontSize: `${size}px`, color: col, fontStyle: bold ? 'bold' : 'normal', wordWrap: wrap ? { width: wrap } : undefined }).setDepth(41);
      this.cardText.push(t); return t;
    };
    T(x + 16, y + 10, p.name.toUpperCase(), 20, '#ffe9a8', true);
    if (p.id === this.at) T(x + w - 16, y + 14, 'YOU ARE HERE', 12, '#9fe07a', true).setOrigin(1, 0);
    T(x + 16, y + 38, p.blurb, 14, '#e8dcc8', false, w - 32);
    if (this.choosing) {
      const c = app.career;
      T(x + 16, y + 70, this.choosing.evs.map((e, i) => `${i === this.choosing!.i ? '▶' : ' '} ${eventName(c, e)}`).join('    '), 14, '#ffe680', true);
    } else T(x + 16, y + 70, s.line, 14, s.ok ? '#bfe86a' : '#c8a890', true, w - 140);
    T(x + w - 16, y + h - 22, 'L1 home', 12, '#9a8a72').setOrigin(1, 0);
  }

  // ------------------------------------------------------------ frame
  update(_t: number, dms: number) {
    const dt = Math.min(0.05, dms / 1000);
    this.t += dt;
    this.inp.poll();
    this.falls.setFrame(Math.floor(this.t / 0.12) % 3);
    this.drawSelection();
    this.drawYou(dt);
    if (this.leaving || this.walk) return;
    if (this.choosing) { this.chooseInput(); return; }
    // the stick (a flick) or the d-pad hops to the next place that way
    const m = this.inp.move, mag = Math.hypot(m.x, m.y);
    let dir: { x: number; y: number } | null = null;
    if (mag > 0.6 && this.stickWas <= 0.6) dir = m;
    this.stickWas = mag;
    if (this.inp.pressed('left')) dir = { x: -1, y: 0 }; else if (this.inp.pressed('right')) dir = { x: 1, y: 0 };
    else if (this.inp.pressed('up')) dir = { x: 0, y: -1 }; else if (this.inp.pressed('down')) dir = { x: 0, y: 1 };
    if (dir) { const next = placeToward(this.sel, dir); if (next) { this.sel = next; sfx.blip(true); this.drawCard(); } }
    if (this.inp.pressed('escape') || this.inp.pressed('b')) { this.goHome(); return; }
    if (this.inp.pressed('a')) this.go(PLACE[this.sel]);
  }

  /** The picked place: a pulsing ring on the ground, the building lifted a touch, its name over it. */
  private drawSelection() {
    const g = this.ring.clear();
    for (const [id, s] of this.sprites) s.img.setY(s.y - (id === this.sel ? 2 + Math.abs(Math.sin(this.t * 4)) * 3 : 0));
    const p = PLACE[this.sel], x = p.at.x * ART, y = p.at.y * ART, k = 0.5 + 0.5 * Math.sin(this.t * 5);
    g.lineStyle(3, 0xffe27a, 0.55 + 0.35 * k).strokeEllipse(x, y + 2, 70 + k * 6, 30 + k * 3);
    g.lineStyle(2, 0xffffff, 0.35 * k).strokeEllipse(x, y + 2, 84 + k * 8, 38 + k * 4);
    const top = this.sprites.get(this.sel)!.img;
    this.tag.setText(`▼ ${p.name}`).setPosition(x, top.y - 4 + Math.sin(this.t * 4) * 2);
    // the event place pulses even when it isn't picked
    if (todaysEvents(app.career).length && this.sel !== 'arena') {
      const a = PLACE.arena;
      g.lineStyle(2, 0x9fe07a, 0.4 + 0.4 * k).strokeEllipse(a.at.x * ART, a.at.y * ART + 2, 76, 32);
    }
  }

  /** You on a little round pedestal at the place you're at (or hopping to the next). */
  private drawYou(dt: number) {
    const c = app.career, kit = roomPlayerKit(c), key = roomSheetKey(c);
    const sheet = sheetFor(this, key, c.height, c.appearance, kit);
    let px = PLACE[this.at].at.x, py = PLACE[this.at].at.y, hop = 0;
    if (this.walk) {
      const w = this.walk; w.t = Math.min(1, w.t + dt / 0.7);
      px = w.from.at.x + (w.to.at.x - w.from.at.x) * w.t; py = w.from.at.y + (w.to.at.y - w.from.at.y) * w.t;
      hop = Math.abs(Math.sin(w.t * Math.PI * 3)) * 6;
      if (w.t >= 1) { this.walk = null; w.then(); }
    }
    const x = (px - 30) * ART, y = (py + 16) * ART;
    const g = this.pedestal.clear();
    g.fillStyle(0x000000, 0.3).fillEllipse(x + 3, y + 3, 34, 13);
    g.fillStyle(0x3a5a8a, 1).fillEllipse(x, y + 1, 32, 12);
    g.fillStyle(0x8ec0e8, 1).fillEllipse(x, y - 2, 30, 11);
    g.fillStyle(0xd8f0ff, 0.8).fillEllipse(x - 4, y - 4, 12, 3);
    if (!sheet) return;
    this.figure.setTexture(key, sheet.index.idle.start + (Math.floor(this.t * 2) % Math.max(1, sheet.index.idle.count ?? 1))).setPosition(x, y - 2 - hop).setVisible(true);
  }

  private chooseInput() {
    const ch = this.choosing!, n = ch.evs.length;
    if (this.inp.pressed('left') || this.inp.pressed('up')) { ch.i = (ch.i + n - 1) % n; sfx.blip(true); this.drawCard(); }
    if (this.inp.pressed('right') || this.inp.pressed('down')) { ch.i = (ch.i + 1) % n; sfx.blip(true); this.drawCard(); }
    if (this.inp.pressed('escape') || this.inp.pressed('b')) { this.choosing = null; sfx.blip(false); this.drawCard(); return; }
    if (this.inp.pressed('a')) {
      const c = app.career, pick = ch.evs[ch.i];
      ch.evs.forEach((e, k) => { if (k !== ch.i && e.kind === 'workout') c.story!.workouts![e.index].result = 'missed'; });
      app.changed(); this.choosing = null;
      this.travel(PLACE.arena, 0, () => goTo(this, pick));
    }
  }

  // ------------------------------------------------------------ going places
  private go(p: Place) {
    const s = this.status(p);
    if (!s.ok) { sfx.blip(false); return; }
    const c = app.career;
    if (p.id === 'home') { this.goHome(); return; }
    if (p.id === 'arena') {
      const evs = todaysEvents(c);
      if (evs.length > 1) { this.choosing = { evs, i: 0 }; sfx.blip(true); this.drawCard(); return; }
      this.travel(p, 0, () => goTo(this, evs[0]));
      return;
    }
    const next: [string, object | undefined] = p.id === 'trailer' ? ['Trailer', { visit: true }] : ['Game', LINCOLN_SHOOTAROUND];
    this.travel(p, s.cost, () => this.leave(next[0], next[1]));
  }
  /** Hop over (paying the energy as you set off), then go in. */
  private travel(p: Place, cost: number, then: () => void) {
    if (cost) { addEnergy(app.career, -cost); app.changed(); this.drawHud(); }
    sfx.blip(true);
    this.walk = { from: PLACE[this.at], to: p, t: 0, then };
  }
  private leave(scene: string, data?: object) {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.time.delayedCall(430, () => this.scene.start(scene, data));
  }
  private goHome() {
    if (this.at === 'home') { sfx.doorOpen(); this.leave('Apartment', { at: 'front' }); return; }
    this.travel(PLACE.home, 0, () => { sfx.doorOpen(); this.leave('Apartment', { at: 'front' }); });
  }
}
