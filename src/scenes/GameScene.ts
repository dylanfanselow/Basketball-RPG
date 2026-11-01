import Phaser from 'phaser';
import { hiRes } from './ui';
import { GameSim, GameEvent, UserInput } from '../sim/game';
import { Player } from '../sim/player';
import { InputMapper } from '../input/input';
import { app } from '../state';
import { createSim, Mode, MatchSetup, OneOnOneSetup, GameInit } from './setup';
import { S, D, sx, sy, drawCourt, drawHoops, WORLD_W, VIEW_W, VIEW_H } from '../render/view';
import { requestSheet } from '../render/sheetPool';
import { buildCelebSheet, randomCeleb, CELEB_W, CELEB_H, CELEB_FRAMES } from '../render/celebs';
import type { Appearance } from '../render/appearance';
import { Sheet, Kit, shade, FRAME_W, FRAME_H, CX, FOOT_Y, SPRITE_SCALE, frameRect, buildFrontSheet, FRONT_W, FRONT_H, drawAngled, crispenRect, figureHeight } from '../render/sprites';
import { FrameCache, yawFor } from '../render/frameCache';
import { CLIP, SHOT_CLIP, frameAt, shotU, sampleClip, frameTime, shuffleState } from '../render/anim';
import { sfx } from '../audio/sfx';
import { rimPos } from '../sim/court';
import { CONE_HALF, contestReach, computeContest, selectShotType } from '../sim/shooting';
import { Crowd } from '../render/crowd';
import { ControllerHud } from '../render/hud';
import { randomAppearance } from '../render/appearance';
import { Rng } from '../sim/math';
import { norm, sub, dist, len, segDist } from '../sim/math';
import { ULTIMATES } from '../sim/data';
import { ultLevelName } from '../sim/ultimates';

/** Sideline people are a little farther from the camera than the court: bench players slightly smaller than on-court
 * players, courtside celebs (regular-height people) smaller again. */
const BENCH_SCALE = SPRITE_SCALE * 0.92;
const CELEB_SCALE = SPRITE_SCALE * 0.82;

const FONT = '"Courier New", monospace';
const SHEET_CACHE = new Map<string, Sheet>();
const SHEETS_LOADING = new Set<string>();
const MAX_SHEETS = 16;
/**
 * Multi-angle players: clips that turn with the player (locomotion, stances, dribbles). Everything else (shots,
 * moves, passes, box-outs...) stays in side view toward the rim so ball offsets and timing match the sim.
 */
const ANGLED = new Set(['idle', 'jog', 'sprint', 'burst', 'defend', 'slide', 'dribble', 'dribbleRun', 'dribbleBurst', 'hold']);
/** Angled frames are drawn on demand into pages of 8 x 6 slots, per sheet (look) key; freed with the sheet. */
const ANG_COLS = 8, ANG_ROWS = 6, ANG_PAGES = 6, ANG_BUDGET = 4, ANG_PREWARM = 2;
const ANGLE_CACHE = new Map<string, { cache: FrameCache; prewarm: string[] }>();
const PREWARM_CLIPS = ['defend', 'slide', 'idle', 'jog', 'dribble'];
const angPage = (key: string, n: number) => `${key}_ang${n}`;
/** Sideline layout (court feet): benches toward each baseline, courtside celebrity rows between them and the table. */
const BENCH_X: [number, number][] = [[4, 22], [72, 90]];
const CELEB_X: [number, number][] = [[29, 39], [55, 65]];

export class GameScene extends Phaser.Scene {
  sim!: GameSim;
  mode: Mode = 'practice';
  input2!: InputMapper;
  sprites = new Map<string, Phaser.GameObjects.Sprite>();
  reflections = new Map<string, Phaser.GameObjects.Sprite>();
  shadows!: Phaser.GameObjects.Graphics;
  overlay!: Phaser.GameObjects.Graphics;
  overlayTop!: Phaser.GameObjects.Graphics;
  ballG!: Phaser.GameObjects.Graphics;
  hud!: Phaser.GameObjects.Graphics;
  eqText!: Phaser.GameObjects.Text;
  scoreText!: Phaser.GameObjects.Text;
  playText!: Phaser.GameObjects.Text;
  ultText!: Phaser.GameObjects.Text;
  trustText!: Phaser.GameObjects.Text;
  feedText!: Phaser.GameObjects.Text;
  benchText!: Phaser.GameObjects.Text;
  ctrl!: ControllerHud;
  bigText!: Phaser.GameObjects.Text;
  labelTexts: Phaser.GameObjects.Text[] = [];
  feed: { text: string; t: number; color: string }[] = [];
  acc = 0;
  runDist = new Map<string, number>();
  /** defensive shuffle phase (cycles) and drawn facing (true = facing -x) per defender, see defStance */
  slidePhase = new Map<string, number>();
  /** drawn view per player (multi-angle), kept for hysteresis */
  yawMem = new Map<string, { yaw: number; flip: boolean; at?: number }>();
  /** defender is mid-shuffle (stance hysteresis, see shuffleState) */
  shuffling = new Map<string, boolean>();
  defFlip = new Map<string, boolean>();
  sheets = new Map<string, { key: string; sheet: Sheet }>();
  animMem = new Map<string, { clip: string; u: number }>();
  lastVel = new Map<string, { x: number; y: number; squeakAt: number }>();
  heldBall: { x: number; y: number; behind?: number } | null = null;
  crowd!: Crowd;
  shotClockTexts: Phaser.GameObjects.Text[] = [];
  tableText!: Phaser.GameObjects.Text;
  coaches: { team: 0 | 1; key: string; look: Appearance; kit: Kit; sprite: Phaser.GameObjects.Sprite | null; sheet: Sheet | null; home: number; x: number; act: string; actUntil: number }[] = [];
  benchCheerUntil: [number, number] = [0, 0];
  paused = false;
  ready = false;
  loadText!: Phaser.GameObjects.Text;
  pauseText!: Phaser.GameObjects.Text;
  pauseIdx = 0;
  ended = false;

  constructor() { super('Game'); }

  matchSetup?: MatchSetup;
  oneOnOne?: OneOnOneSetup;
  initData!: GameInit;
  inputP2: InputMapper | null = null;
  latched: [UserInput | null, UserInput | null] = [null, null];
  init(data: GameInit) {
    this.initData = data;
    this.mode = data.mode ?? 'practice';
    this.matchSetup = data.setup; this.oneOnOne = data.oneOnOne; this.latched = [null, null]; this.ready = false; this.ended = false; this.paused = false; this.feed = [];
    // the scene object is reused between games: drop per-game caches (textures themselves are kept in SHEET_CACHE)
    this.sprites.clear(); this.reflections.clear(); this.sheets.clear(); this.frontSprites.clear(); this.animMem.clear(); this.lastVel.clear(); this.runDist.clear(); this.slidePhase.clear(); this.defFlip.clear(); this.yawMem.clear(); this.shuffling.clear();
  }

  create() {
    hiRes(this);
    this.sim = createSim(this.mode, this.matchSetup, this.oneOnOne);
    app.sim = this.sim;
    const twoHumans = !!this.sim.user2;
    this.input2 = new InputMapper(this, twoHumans ? 1 : undefined);
    this.inputP2 = twoHumans ? new InputMapper(this, 2) : null;
    const [t0, t1] = this.sim.teams;
    drawCourt(this, [t0.def.colors[0], t1.def.colors[0]]);
    const hoops = drawHoops(this);
    this.shotClockTexts = hoops.shotClocks.map((c) => this.add.text(c.x, c.y, '24', { fontFamily: FONT, fontSize: '16px', color: '#ff3b2f', fontStyle: 'bold' }).setOrigin(0.5).setDepth(sy(23.6)));
    this.crowd = new Crowd(this, t0.def.colors[0], t1.def.colors[0]);
    this.buildSideline();
    this.shadows = this.add.graphics().setDepth(-500);
    this.overlay = this.add.graphics().setDepth(-400);
    this.overlayTop = this.add.graphics().setDepth(5000);
    this.ballG = this.add.graphics();
    this.buildSprites();
    this.cameras.main.setBackgroundColor('#0d0f1a');
    this.makeHud();
    this.events.on('shutdown', () => { app.sim = null; });
    app.listeners.add(this.onAppChanged);
    this.events.once('shutdown', () => app.listeners.delete(this.onAppChanged));
  }

  private onAppChanged = () => { this.buildSprites(); };

  /** Team uniform for a player (home = team colors, away = white with team trim). */
  kitFor(p: Player): Kit {
    const t = this.sim.teams[p.team].def;
    return p.team === 0
      ? { jersey: t.colors[0], jerseyShade: shade(t.colors[0], 0.75), trim: t.colors[1], shorts: shade(t.colors[0], 0.9), number: p.number }
      : { jersey: '#f2f2f2', jerseyShade: '#cfcfcf', trim: t.colors[0], shorts: '#e6e6e6', number: p.number };
  }

  /** Build (or rebuild after a dev-panel change) the sprite sheets for players on the court. */
  buildSprites() {
    for (const p of this.sim.players) this.ensureSprite(p);
  }

  /**
   * A cached sprite sheet (+ texture), or null while it's being drawn in the background (sheet workers).
   * Textures outlive scenes, so the frame/ball data is cached alongside them. Least-recently-used sheets of
   * players who aren't on the floor are dropped to keep memory in check (~28 MB each).
   */
  sheetFor(key: string, heightFt: number, look: Appearance, kit: Kit): Sheet | null {
    const cached = SHEET_CACHE.get(key);
    if (cached && this.textures.exists(key)) { SHEET_CACHE.delete(key); SHEET_CACHE.set(key, cached); return cached; }
    if (!SHEETS_LOADING.has(key)) {
      SHEETS_LOADING.add(key);
      requestSheet(heightFt, look, kit).then((sheet) => {
        SHEETS_LOADING.delete(key);
        const tm = this.sys.game.textures;
        if (tm.exists(key)) tm.remove(key);
        const tex = tm.addCanvas(key, sheet.canvas)!;
        for (let i = 0; i < sheet.total; i++) { const r = frameRect(i); tex.add(i, 0, r.x, r.y, FRAME_W, FRAME_H); }
        SHEET_CACHE.set(key, sheet);
        this.evictSheets();
      });
    }
    return null;
  }

  evictSheets() {
    if (SHEET_CACHE.size <= MAX_SHEETS) return;
    const inUse = new Set<string>();
    if (this.sys.isActive()) {
      for (const p of this.sim.players) { const e = this.sheets.get(p.id); if (e) inUse.add(e.key); }
      for (const c of this.coaches) inUse.add(c.key);
    }
    for (const key of [...SHEET_CACHE.keys()]) {
      if (SHEET_CACHE.size <= MAX_SHEETS) break;
      if (inUse.has(key)) continue;
      SHEET_CACHE.delete(key);
      for (const [id, e] of this.sheets) if (e.key === key) { this.sheets.delete(id); this.sprites.get(id)?.destroy(); this.sprites.delete(id); this.reflections.get(id)?.destroy(); this.reflections.delete(id); }
      if (this.textures.exists(key)) this.textures.remove(key);
      const ang = ANGLE_CACHE.get(key);
      if (ang) { for (let n = 0; n < ang.cache.pages; n++) if (this.textures.exists(angPage(key, n))) this.textures.remove(angPage(key, n)); ANGLE_CACHE.delete(key); }
    }
  }

  /**
   * The angled-frame cache for a sheet key (created on first use). Frames are drawn on the main thread into canvas
   * texture pages; `pumpAngles` refreshes dirty pages once per frame. Prewarm queues the common stance/run angles.
   */
  angleCache(key: string, heightFt: number, look: Appearance, kit: Kit): FrameCache {
    let e = ANGLE_CACHE.get(key);
    if (e) return e.cache;
    const tm = this.sys.game.textures, H = figureHeight(heightFt);
    const cache = new FrameCache({
      newPage: (n) => { if (tm.exists(angPage(key, n))) tm.remove(angPage(key, n)); tm.createCanvas(angPage(key, n), ANG_COLS * FRAME_W, ANG_ROWS * FRAME_H); },
      draw: (ck, page, index) => {
        const [clip, frame, yaw] = ck.split('|');
        const tex = tm.get(angPage(key, page)) as Phaser.Textures.CanvasTexture;
        const ctx = tex.getContext();
        const x = (index % ANG_COLS) * FRAME_W, y = Math.floor(index / ANG_COLS) * FRAME_H;
        ctx.clearRect(x, y, FRAME_W, FRAME_H);
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, FRAME_W, FRAME_H); ctx.clip();
        const c = CLIP[clip];
        const r = drawAngled(ctx, x, y, sampleClip(c, frameTime(c, +frame)), H, look, kit, c.keys.some((k) => !!k.pose.ball), +yaw);
        ctx.restore();
        crispenRect(ctx, x, y, FRAME_W, FRAME_H);
        if (!tex.has(`s${index}`)) tex.add(`s${index}`, 0, x, y, FRAME_W, FRAME_H);
        return r;
      },
    }, ANG_COLS * ANG_ROWS, ANG_PAGES);
    const prewarm: string[] = [];
    for (const yaw of [45, 90, -45, -90]) for (const clip of PREWARM_CLIPS) for (let f = 0; f < CLIP[clip].frames; f++) prewarm.push(`${clip}|${f}|${yaw}`);
    e = { cache, prewarm };
    ANGLE_CACHE.set(key, e);
    return cache;
  }

  /** Draw queued angled frames within the per-frame budget (your player first), prewarm when idle, refresh pages. */
  pumpAngles() {
    const order = [...this.sim.players].sort((a, b) => (b === this.sim.user ? 1 : 0) - (a === this.sim.user ? 1 : 0));
    let budget = ANG_BUDGET, warm = ANG_PREWARM, slots = 0, drawn = 0;
    const t0 = performance.now();
    for (const p of order) {
      if (performance.now() - t0 > 4) break; // never spend more than ~4 ms a frame drawing new angles
      const sh = this.sheets.get(p.id); if (!sh) continue;
      const e = ANGLE_CACHE.get(sh.key); if (!e) continue;
      if (budget > 0 && !e.cache.pending && warm > 0 && e.prewarm.length) { e.cache.request(e.prewarm.shift()!); warm--; }
      const before = e.cache.drawn;
      const dirty = e.cache.drain(Math.min(budget, 2));
      budget -= e.cache.drawn - before; drawn += e.cache.drawn - before;
      for (const n of dirty) (this.textures.get(angPage(sh.key, n)) as Phaser.Textures.CanvasTexture).refresh();
      slots += e.cache.size;
    }
    if (drawn) this.angMs = this.angMs * 0.8 + ((performance.now() - t0) / drawn) * 0.2;
    app.settings.angles.readout = `cached frames ${slots}  ·  ~${this.angMs.toFixed(2)} ms per new frame`;
  }
  angMs = 0;

  /** Which drawn view (yaw + mirror) a player in an angled clip shows. Defenders face their man, turned a bit to us. */
  viewFor(p: Player, clip: string): { yaw: number; flip: boolean } {
    const force = app.settings.angles.force;
    if (force !== null) return { yaw: force, flip: app.settings.angles.flip };
    let dx = p.face.x, dy = p.face.y, bias = 0;
    if (clip === 'defend' || clip === 'slide') {
      const man = p.guarding ? this.sim.players.find((q) => q.id === p.guarding) : null;
      if (man) { dx = man.p.x - p.p.x; dy = man.p.y - p.p.y; bias = 35; }
    }
    let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (bias) { // turn toward the camera (+90) on whichever side he faces, so the open stance shows
      const left = Math.abs(ang) > 90;
      const a = Math.min(90, (left ? Math.sign(ang || 1) * (180 - Math.abs(ang)) : ang) + bias);
      ang = left ? (a >= 0 ? 180 - a : -180 - a) : a;
    }
    // defenders track a moving man: wider hysteresis, and at most one view change per 0.25 s, so they don't jitter
    const prev = this.yawMem.get(p.id), now = this.sim.time;
    const v = yawFor(ang, prev, bias ? 20 : 10);
    if (prev && (v.yaw !== prev.yaw || v.flip !== prev.flip) && bias && now - (prev.at ?? -9) < 0.25) return prev;
    const out = prev && v.yaw === prev.yaw && v.flip === prev.flip ? prev : { ...v, at: now };
    this.yawMem.set(p.id, out);
    return out;
  }

  /** Every on-court player and coach has a sheet (the game waits for this at tip-off). */
  sheetsReady(): boolean {
    let ok = true;
    for (const p of this.sim.players) { this.ensureSprite(p); if (!this.sheets.has(p.id)) ok = false; }
    for (const c of this.coaches) if (!c.sheet) ok = false;
    return ok;
  }

  ensureSprite(p: Player) {
    const kit = this.kitFor(p);
    const key = `pl_${p.id}_${hashStr(JSON.stringify([p.appearance, p.height.toFixed(2), kit]))}`;
    const cur = this.sheets.get(p.id);
    if (cur?.key === key && this.textures.exists(key)) return;
    const sheet = this.sheetFor(key, p.height, p.appearance, kit);
    if (!sheet) return;
    this.sheets.set(p.id, { key, sheet });
    let s = this.sprites.get(p.id);
    if (!s) { s = this.add.sprite(0, 0, key, 0).setOrigin(CX / FRAME_W, FOOT_Y / FRAME_H).setScale(SPRITE_SCALE); this.sprites.set(p.id, s); }
    else s.setTexture(key, 0);
  }

  makeHud() {
    const fixed = <T extends Phaser.GameObjects.Components.ScrollFactor>(o: T) => { o.setScrollFactor(0); return o; };
    this.hud = fixed(this.add.graphics().setDepth(9000));
    this.eqText = fixed(this.add.text(12, 8, '', { fontFamily: FONT, fontSize: '15px', color: '#ffffff', wordWrap: { width: VIEW_W - 24 }, lineSpacing: 2 }).setDepth(9001));
    this.scoreText = fixed(this.add.text(12, 66, '', { fontFamily: FONT, fontSize: '18px', color: '#ffffff', fontStyle: 'bold' }).setDepth(9001));
    this.playText = fixed(this.add.text(VIEW_W / 2, VIEW_H - 30, '', { fontFamily: FONT, fontSize: '16px', color: '#ffe680', align: 'center' }).setOrigin(0.5, 0).setDepth(9001));
    this.ultText = fixed(this.add.text(VIEW_W - 16, VIEW_H - 252, '', { fontFamily: FONT, fontSize: '13px', color: '#ffffff', align: 'right' }).setOrigin(1, 0).setDepth(9001));
    this.trustText = fixed(this.add.text(8, 97, '', { fontFamily: FONT, fontSize: '12px', color: '#cfe8ff', lineSpacing: 2 }).setDepth(9001));
    this.ctrl = new ControllerHud(this, VIEW_W, VIEW_H);
    this.feedText = fixed(this.add.text(VIEW_W - 16, 100, '', { fontFamily: FONT, fontSize: '14px', color: '#ffffff', align: 'right', lineSpacing: 3 }).setOrigin(1, 0).setDepth(9001));
    this.benchText = fixed(this.add.text(VIEW_W / 2, 260, '', { fontFamily: FONT, fontSize: '22px', color: '#ffffff', align: 'center', backgroundColor: '#000000aa', padding: { x: 16, y: 10 } }).setOrigin(0.5).setDepth(9002));
    this.bigText = fixed(this.add.text(VIEW_W / 2, 200, '', { fontFamily: FONT, fontSize: '40px', color: '#ffdd33', fontStyle: 'bold', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5).setDepth(9003).setAlpha(0));
    this.loadText = fixed(this.add.text(VIEW_W / 2, VIEW_H / 2 - 40, 'Lacing up…', { fontFamily: FONT, fontSize: '26px', color: '#ffe680', fontStyle: 'bold', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5).setDepth(9600));
    this.pauseText = fixed(this.add.text(VIEW_W / 2, VIEW_H / 2, '', { fontFamily: FONT, fontSize: '24px', color: '#ffffff', align: 'center', backgroundColor: '#000000dd', padding: { x: 30, y: 20 } }).setOrigin(0.5).setDepth(9500).setVisible(false));
  }

  update(_t: number, deltaMs: number) {
    this.input2.poll(); this.inputP2?.poll();
    if (this.input2.pressed('dev')) (window as any).__toggleDev?.();
    if (this.input2.pressed('mute')) this.feed.unshift({ text: sfx.toggleMute() ? 'Sound off (M)' : 'Sound on (M)', t: this.time.now, color: '#ffffff' });
    if (this.ended) return;
    if (this.paused) { this.updatePause(); return; }
    // tip-off waits until every player's sprite sheet has been drawn (built in parallel in the background)
    if (!this.ready) {
      this.ready = this.sheetsReady();
      this.loadText.setVisible(!this.ready).setText(`Lacing up…  ${this.sim.players.filter((p) => this.sheets.has(p.id)).length}/${this.sim.players.length}`);
      if (!this.ready) { this.render(); return; }
    }
    // Options/Enter = pause menu; L1/Esc = pause menu with "Quit" highlighted (press L1 again to leave)
    for (const inp of this.inputs()) {
      if (inp.pressed('start') && !inp.held('back')) { this.openPause(0); return; }
      if (inp.pressed('escape')) { this.openPause(3); return; }
    }

    const sim = this.sim;
    const speed = app.settings.timeScale * (sim.userOnCourt || sim.cfg.mode === 'practice' ? 1 : app.settings.benchSpeed);
    const step = 1 / 60;
    this.acc += Math.min(0.1, deltaMs / 1000) * speed;
    // button presses are latched until a sim step consumes them (in slow motion a frame can pass without a step)
    this.latched = [latch(this.latched[0], this.input2.gameInput()), this.inputP2 ? latch(this.latched[1], this.inputP2.gameInput()) : null];
    while (this.acc >= step) {
      const [i1, i2] = this.latched;
      sim.update(step, i1!, i2 ?? undefined);
      this.latched = [clearEdges(i1!), i2 ? clearEdges(i2) : null];
      this.acc -= step;
    }
    for (const e of sim.drainEvents()) this.onEvent(e);
    this.render();
    if (sim.over && !this.ended) {
      this.ended = true;
      this.time.delayedCall(1800, () => this.scene.start('PostGame', { mode: this.mode, sim: this.sim, replay: this.initData }));
    }
  }

  /** Every human's input mapper (P1, plus P2 in two-player 1v1). */
  inputs(): InputMapper[] { return this.inputP2 ? [this.input2, this.inputP2] : [this.input2]; }

  openPause(idx: number) { this.paused = true; this.pauseIdx = idx; this.drawPause(); }

  pauseOptions() { return ['Resume', this.mode === 'oneOnOne' ? 'Restart (0-0)' : 'Restart', 'Fullscreen (F)', this.mode === 'career' ? 'Forfeit to Hub' : this.mode === 'oneOnOne' ? 'Quit to 1v1 Select' : 'Quit to Menu']; }

  drawPause() {
    const opts = this.pauseOptions();
    this.pauseText.setVisible(true).setText('PAUSED\n\n' + opts.map((o, i) => (i === this.pauseIdx ? '> ' : '  ') + o).join('\n') + '\n\n✕ select · ○ / Options resume · L1 quit');
  }

  leaveGame() {
    this.paused = false; this.pauseText.setVisible(false);
    this.scene.start(this.mode === 'career' ? 'Hub' : this.mode === 'oneOnOne' ? 'OneOnOneSetup' : 'Menu');
  }

  updatePause() {
    const opts = this.pauseOptions();
    for (const inp of this.inputs()) {
      if (inp.pressed('down')) this.pauseIdx = (this.pauseIdx + 1) % opts.length;
      if (inp.pressed('up')) this.pauseIdx = (this.pauseIdx + opts.length - 1) % opts.length;
      if (inp.pressed('escape')) { this.leaveGame(); return; }
      if (inp.pressed('b') || inp.pressed('start')) { this.paused = false; this.pauseText.setVisible(false); return; }
      if (inp.pressed('a')) {
        this.pauseText.setVisible(false);
        if (this.pauseIdx === 0) this.paused = false;
        else if (this.pauseIdx === 1) this.scene.restart(this.initData);
        else if (this.pauseIdx === 2) { (window as any).__toggleFullscreen?.(); this.pauseText.setVisible(true); }
        else this.leaveGame();
        return;
      }
    }
    this.drawPause();
  }

  /** Stereo pan for a world x position relative to the camera. */
  panAt(x: number) { return Phaser.Math.Clamp((sx(x) - this.cameras.main.scrollX - VIEW_W / 2) / (VIEW_W / 2), -1, 1) * 0.7; }

  playSound(e: GameEvent) {
    const sim = this.sim;
    const who = e.pid ? sim.players.find((p) => p.id === e.pid) : null;
    const pan = this.panAt(who ? who.p.x : sim.ball.p.x);
    const d = e.data ?? {};
    const home = e.team === 0 || (who?.team === 0);
    switch (e.kind) {
      case 'plant': if (d.move !== 'jab') sfx.squeak(pan); break;
      case 'gather': if (['layup', 'dunk', 'euro', 'stepThrough', 'stepThroughJumper'].includes(d.type)) sfx.squeak(pan, 0.7); break;
      case 'pass': sfx.pass(pan, !!d.lob); break;
      case 'catch': sfx.catch(pan); break;
      case 'release': sfx.release(pan); break;
      case 'net':
        if (d.type === 'dunk') { sfx.dunk(pan); sfx.cheer(d.team === 0 ? 0.9 : 0.45); }
        else { d.swish ? sfx.swish(pan, true) : sfx.swish(pan, false); if (d.pts === 3) sfx.cheer(d.team === 0 ? 0.75 : 0.3); }
        break;
      case 'rim': if (!d.seq) sfx.clank(pan, !!d.board); break; // live-rim misses already played their contacts
      case 'rimHit': d.kind === 'tick' ? sfx.rimTick(pan) : sfx.clank(pan, d.kind === 'board'); break;
      case 'airball': sfx.airball(pan); break;
      case 'boxout': break;
      case 'bounce': sfx.bounce(d.v ?? 6, pan); break;
      case 'screenHit': sfx.thud(pan, false); break;
      case 'contact': sfx.thud(pan, !!d.hard); break;
      case 'block': sfx.block(pan); sfx.cheer(home ? 0.8 : 0.35); break;
      case 'steal': sfx.steal(pan); if (home) sfx.cheer(0.55); else sfx.groan(); break;
      case 'ankles': sfx.squeak(pan, 1.2); sfx.cheer(1); break;
      case 'poster': sfx.cheer(1); break;
      case 'ult': if (e.big) sfx.cheer(0.9); break;
      case 'foul': case 'oob': sfx.whistle(false); break;
      case 'charge': sfx.whistle(true); if (home) sfx.cheer(0.6); break;
      case 'violation': sfx.buzzer(); break;
      case 'period': case 'final': sfx.buzzer(); break;
    }
  }

  /** Crowd + bench + coach reactions. power 0..1; team = whose good moment it is. */
  reactAll(team: 0 | 1 | undefined, power: number, worldX: number) {
    if (team === undefined) return;
    this.crowd.react(worldX, power, team === 0);
    if (team === 1 && power > 0.5) this.crowd.react(worldX, power * 0.6, true, true); // home fans boo the visitors' big play
    this.benchCheerUntil[team] = this.time.now + 1800;
    for (const c of this.coaches) if (c.team === team && power > 0.5) { c.act = 'cheer'; c.actUntil = this.time.now + 1300; }
    // the famous front row reacts too: big plays bring them out of their seats, the rest film or gasp
    if (power >= 0.5) for (const c of this.celebs) {
      const r = (c.phase * 7.3 + this.time.now / 997) % 1;
      c.frame = team === 0 ? (r < 0.6 ? 1 : r < 0.85 ? 2 : 3) : r < 0.5 ? 3 : 2;
      c.until = this.time.now + 1400 + r * 900;
    }
  }

  onEvent(e: GameEvent) {
    {
      const sim = this.sim;
      const who = e.pid ? sim.players.find((p) => p.id === e.pid) : null;
      const wx = sx(who ? who.p.x : sim.ball.p.x);
      const d = e.data ?? {};
      const team = (e.team ?? who?.team) as 0 | 1 | undefined;
      if (e.kind === 'net') this.reactAll(d.team, d.type === 'dunk' ? 1 : d.pts === 3 ? 0.75 : 0.25, wx);
      else if (['block', 'steal', 'ankles', 'poster', 'charge'].includes(e.kind)) this.reactAll(team, e.kind === 'steal' ? 0.6 : 0.9, wx);
      else if (e.kind === 'ult' && e.big) this.reactAll(team, 1, wx);
      if (e.kind === 'play') for (const c of this.coaches) if (c.team === e.team) { c.act = 'point'; c.actUntil = this.time.now + 1100; }
    }
    this.playSound(e);
    if (e.quiet) return;
    const mine = !!e.pid && (e.pid === this.sim.user?.id || e.pid === this.sim.user2?.id);
    const color = e.good === false ? '#ff8080' : e.good ? '#9dff9d' : e.team === 1 ? '#ffd0d0' : e.team === 0 ? '#d0e4ff' : '#ffffff';
    if (e.kind === 'move' && !mine) return;
    this.feed.unshift({ text: e.text, t: this.time.now, color });
    this.feed = this.feed.slice(0, 7);
    if (e.big) {
      this.bigText.setText(e.text).setAlpha(1).setScale(0.6);
      this.tweens.add({ targets: this.bigText, scale: 1, duration: 180, ease: 'Back.Out' });
      this.tweens.add({ targets: this.bigText, alpha: 0, delay: 900, duration: 500 });
      if (['ankles', 'block', 'poster', 'ult', 'charge'].includes(e.kind) || /Dunk/.test(e.text)) this.cameras.main.shake(160, 0.006);
    }
  }

  /** Which animation clip a player is in right now, and how far through it (u). */
  clipFor(p: Player): { clip: string; u: number; flip?: boolean } {
    const sim = this.sim, now = sim.time, a = p.anim;
    const hasBall = sim.holder() === p;
    const dist = this.runDist.get(p.id) ?? 0;
    const phase = (p.number * 0.137) % 1; // so players don't dribble in lockstep
    if (p.state === 'fallen') return { clip: a?.name === 'ankleFall' ? 'ankleFall' : 'fall', u: a ? (now - a.start) / 0.65 : 1 };
    if (now < p.stunnedUntil && a && (a.name === 'stripped' || a.name === 'blockedLand')) return { clip: a.name, u: (now - a.start) / (a.dur ?? 1) };
    if (sim.inb?.inbounder === p && sim.inb.hasBall && len(p.vel) < 2) return { clip: 'inbound', u: now };
    // the fake picks up the dribble, so it must be checked before the dead-dribble hold
    if (p.state === 'dribbleMove' && a?.name === 'pumpfake') return { clip: 'pumpfake', u: (now - a.start) / (a.dur ?? 0.42) };
    if (hasBall && p.deadDribble && p.state !== 'shoot') return { clip: 'hold', u: now * 1.5 };
    if (a && a.name.startsWith('shot_')) {
      const clip = SHOT_CLIP[a.name.slice(5)] ?? 'shot_jumper';
      const c = CLIP[clip];
      const inPost = a.release !== undefined && now >= a.release && (now - a.release < (c.post ?? 0.5) || p.z > 0.05);
      if (p.state === 'shoot' || inPost) return { clip, u: shotU(c, now, a.start, p.state === 'shoot' ? a.release : a.release) };
    }
    if (p.state === 'dribbleMove' && a?.name.startsWith('move_')) return { clip: CLIP[a.name] ? a.name : 'move_lateral', u: (now - a.start) / (a.dur ?? 0.35) };
    if (now < p.bumpedUntil) return { clip: 'bumped', u: a?.name === 'bumped' ? (now - a.start) / Math.max(0.2, a.dur ?? 0.5) : 0.5 };
    if (a?.name === 'rebound' && now - a.start < 0.7) return { clip: 'rebound', u: (now - a.start) / 0.7 };
    if (p.boxingOut) return { clip: now < p.leanedUntil ? 'boxoutPush' : 'boxout', u: now * 1.6 };
    if (p.state === 'stagger' || now < p.staggerUntil) return { clip: 'stagger', u: now * 2 };
    if (p.state === 'screen') return { clip: 'screen', u: p.stateT / 0.25 };
    if (p.state === 'charge') return { clip: 'charge', u: p.stateT / 0.2 };
    if (p.z > 0.3) return { clip: 'block', u: p.vz > 0 ? 0.4 * (1 - p.vz / p.jumpVel) : 0.4 + 0.6 * Math.min(1, -p.vz / p.jumpVel) };
    if (now < p.swipingUntil) return { clip: 'swipe', u: 1 - (p.swipingUntil - now) / 0.3 };
    if (sim.lastPasser === p && now - sim.lastPassAt < 0.3) return { clip: 'pass', u: (now - sim.lastPassAt) / 0.3 };
    if (hasBall && now - p.receivedAt < 0.18) return { clip: 'catch', u: (now - p.receivedAt) / 0.18 };
    const sp = len(p.vel);
    if (hasBall && p.bHolding && p.state !== 'dribbleMove') return { clip: 'dribbleReady', u: now * 1.3 };
    // sprint burst (R2): its own forward-leaning, long-stride run
    if (sp > 2.5 && now < p.burstUntil) return hasBall ? { clip: 'dribbleBurst', u: dist / 12 + phase } : { clip: 'burst', u: dist / 12 };
    const stance = hasBall ? null : this.defStance(p, sp);
    if (stance) return stance;
    if (sp > 2.5) {
      if (hasBall) return { clip: 'dribbleRun', u: dist / 8 + phase };
      return sp > p.walkSpeed * 1.1 ? { clip: 'sprint', u: dist / 9.5 } : { clip: 'jog', u: dist / 7 };
    }
    if (hasBall) return { clip: 'dribble', u: now * 1.7 + phase };
    if (p.team !== sim.possession && sim.live) return { clip: 'defend', u: now * 1.2 + phase };
    return { clip: 'idle', u: now * 0.5 + phase };
  }

  /**
   * On-ball style defense near your man: face him (drawn facing only, with hysteresis) and shuffle with planted feet.
   * The shuffle phase advances with distance travelled (one cycle = 16 figure units = 0.16 x height), capped at
   * 3 cycles/s; moving away from the facing plays it in reverse (retreat shuffle). Faster than a walk -> null (run).
   */
  defStance(p: Player, sp: number): { clip: string; u: number; flip: boolean } | null {
    const sim = this.sim;
    if (p.team === sim.possession || !sim.live || !p.guarding) return null;
    const man = sim.players.find((q) => q.id === p.guarding);
    if (!man || Math.hypot(man.p.x - p.p.x, man.p.y - p.p.y) > 8 || sp > p.walkSpeed * 1.05) return null;
    const dx = man.p.x - p.p.x;
    let flip = this.defFlip.get(p.id) ?? dx < 0;
    if (dx > 0.5) flip = false; else if (dx < -0.5) flip = true;
    this.defFlip.set(p.id, flip);
    const shuffle = shuffleState(sp, this.shuffling.get(p.id) ?? false);
    this.shuffling.set(p.id, shuffle);
    if (!shuffle) return { clip: 'defend', u: sim.time * 0.7 + (p.number * 0.137) % 1, flip };
    const ph = (this.slidePhase.get(p.id) ?? 0) + Math.min(sp / (0.16 * p.height), 3) / 60;
    this.slidePhase.set(p.id, ph);
    const along = p.vel.x * (flip ? -1 : 1);
    return { clip: 'slide', u: along < -0.3 * sp ? -ph : ph, flip };
  }

  /** Dribble bounce sounds synced to the animation: fire when the clip passes a bounce point. */
  dribbleSound(p: Player, clip: string, u: number) {
    const prev = this.animMem.get(p.id);
    this.animMem.set(p.id, { clip, u });
    const c = CLIP[clip];
    if (!c.bounce || !prev || prev.clip !== clip || this.sim.holder() !== p) return;
    const wrap = (x: number) => (c.loop ? ((x % 1) + 1) % 1 : Math.max(0, Math.min(1, x)));
    const a = wrap(prev.u), b = wrap(u);
    for (const t of c.bounce) {
      const crossed = a <= b ? a < t && t <= b : a < t || t <= b;
      if (crossed && u !== prev.u) sfx.dribble(0.45 + Math.min(0.5, len(p.vel) / 30), this.panAt(p.p.x));
    }
  }

  /** Sneaker squeaks on hard cuts at speed. */
  cutSound(p: Player) {
    const lv = this.lastVel.get(p.id) ?? { x: p.vel.x, y: p.vel.y, squeakAt: 0 };
    const sp = len(p.vel), lsp = Math.hypot(lv.x, lv.y);
    if (sp > 9 && lsp > 9) {
      const cos = (p.vel.x * lv.x + p.vel.y * lv.y) / (sp * lsp);
      if (cos < 0.6 && this.sim.time - lv.squeakAt > 0.5) { sfx.squeak(this.panAt(p.p.x), 0.6); lv.squeakAt = this.sim.time; }
    }
    this.lastVel.set(p.id, { x: p.vel.x, y: p.vel.y, squeakAt: lv.squeakAt });
  }

  render() {
    const sim = this.sim;
    const cam = this.cameras.main;
    const u = sim.user;
    // frame the action between the ball and the rim being attacked
    const rimX = sim.rim(sim.possession).x;
    const bx0 = u && sim.userOnCourt ? sim.ball.p.x * 0.7 + u.p.x * 0.3 : sim.ball.p.x;
    const focusX = sx(bx0 + (rimX - bx0) * 0.42);
    let tx = focusX - VIEW_W / 2;
    // never lose your own player
    if (u && sim.userOnCourt) tx = Phaser.Math.Clamp(tx, sx(u.p.x) - VIEW_W + 140, sx(u.p.x) - 140);
    tx = Phaser.Math.Clamp(tx, 0, WORLD_W - VIEW_W);
    cam.scrollX += (tx - cam.scrollX) * 0.12;

    // players
    const onCourt = new Set(sim.players.map((p) => p.id));
    this.shadows.clear();
    for (const [id, s] of this.sprites) s.setVisible(onCourt.has(id));
    for (const [id, r] of this.reflections) r.setVisible(onCourt.has(id));
    this.heldBall = null;
    const holder = sim.holder();
    for (const p of sim.players) {
      this.ensureSprite(p);
      const s = this.sprites.get(p.id);
      const sh = this.sheets.get(p.id);
      if (!s || !sh) continue;
      this.runDist.set(p.id, (this.runDist.get(p.id) ?? 0) + len(p.vel) / 60);
      const { clip, u, flip: flipTo } = this.clipFor(p);
      const c = CLIP[clip];
      const fi = frameAt(c, u), idx = sh.sheet.index[clip].start + fi;
      this.dribbleSound(p, clip, u);
      this.cutSound(p);
      // multi-angle: turning clips use a cached angled frame when it's drawn, the side view (same mirror) until then
      let texKey = sh.key, frame: string | number = idx, bo = sh.sheet.ball[idx], behind = false;
      let flip = flipTo ?? p.face.x < 0;
      if (ANGLED.has(clip)) {
        const v = this.viewFor(p, clip);
        flip = v.flip;
        if (v.yaw !== 0) {
          const cache = this.angleCache(sh.key, p.height, p.appearance, this.kitFor(p));
          const ck = `${clip}|${fi}|${v.yaw}`, slot = cache.get(ck);
          if (slot) { texKey = angPage(sh.key, slot.page); frame = `s${slot.index}`; bo = slot.ball; behind = slot.ballBehind; }
          else cache.request(ck, p === sim.user);
        }
      }
      if (s.texture.key !== texKey) s.setTexture(texKey, frame); else s.setFrame(frame);
      s.setPosition(sx(p.p.x), sy(p.p.y, p.z));
      s.setFlipX(flip);
      if (bo && (holder === p || p.state === 'shoot' || (sim.inb?.inbounder === p && sim.inb.hasBall))) this.heldBall = { x: s.x + (flip ? -bo[0] : bo[0]) * SPRITE_SCALE, y: s.y - bo[1] * SPRITE_SCALE, behind: behind ? sy(p.p.y) - 0.5 : undefined };
      s.setDepth(sy(p.p.y));
      // glossy hardwood: a faint, squashed, upside-down reflection under each player
      let r = this.reflections.get(p.id);
      if (!r) { r = this.add.sprite(0, 0, texKey, frame).setOrigin(CX / FRAME_W, (FRAME_H - FOOT_Y) / FRAME_H).setFlipY(true).setAlpha(0.1).setTint(0x6a4a2a).setDepth(-450); this.reflections.set(p.id, r); }
      if (r.texture.key !== texKey) r.setTexture(texKey, frame); else r.setFrame(frame);
      r.setScale(SPRITE_SCALE, SPRITE_SCALE * 0.5).setFlipX(flip).setPosition(s.x, sy(p.p.y) + p.z * S * 0.5)
        .setVisible(p.p.x > 0 && p.p.x < 94 && p.p.y > 0.5);
      const ghost = sim.time < p.screenedUntil;
      s.setTint(ghost ? 0xb0b0ff : 0xffffff);
      this.shadows.fillStyle(0x000000, 0.28);
      this.shadows.fillEllipse(sx(p.p.x), sy(p.p.y), 32 - p.z * 2, 9);
    }

    this.pumpAngles();

    // ball (behind the holder when an angled frame has it on the far side of the body)
    const b = sim.ball;
    const inHand = !!this.heldBall && (b.st.kind === 'held' || (b.st.kind === 'dead' && !!sim.inb?.hasBall));
    this.ballG.clear().setDepth(inHand && this.heldBall!.behind !== undefined ? this.heldBall!.behind : sy(b.p.y) + 1);
    const bx = inHand ? this.heldBall!.x : sx(b.p.x), by = inHand ? this.heldBall!.y : sy(b.p.y, b.z);
    this.shadows.fillStyle(0x000000, 0.3); this.shadows.fillEllipse(sx(b.p.x), sy(b.p.y), 16, 5);
    this.ballG.fillStyle(0xe86a1c, 1); this.ballG.fillCircle(bx, by, 8);
    this.ballG.fillStyle(0xff9a4a, 1); this.ballG.fillRect(bx - 5, by - 6, 4, 3);
    this.ballG.lineStyle(1.5, 0x5a2a0a, 1); this.ballG.lineBetween(bx - 8, by, bx + 8, by); this.ballG.lineBetween(bx, by - 8, bx, by + 8);

    this.crowd.clutch = sim.clutch;
    this.crowd.update(cam.scrollX, VIEW_W);
    this.renderSideline();
    for (const t of this.shotClockTexts) t.setText(String(Math.max(0, Math.ceil(sim.shotClock))));
    this.drawOverlays();
    this.drawHud();
  }

  /** Scorer's table, officials, coaches and team benches along the far sideline. */
  buildSideline() {
    const sim = this.sim;
    const [t0, t1] = sim.teams;
    const g = this.add.graphics().setDepth(sy(-4.6));
    const x0 = sx(41), x1 = sx(53), yF = sy(-3.4), h = 2.6 * S;
    // officials behind the table
    for (const ox of [44.5, 49.5]) {
      g.fillStyle(0x111111, 1); g.fillRect(sx(ox) - 7, yF - h - 22, 14, 24);
      g.fillStyle(0xd9a066, 1); g.fillRect(sx(ox) - 4, yF - h - 32, 8, 9);
      g.fillStyle(0xffffff, 1); for (let i = 0; i < 4; i++) g.fillRect(sx(ox) - 7 + i * 4, yF - h - 20, 2, 18);
    }
    // table: top, draped front in both teams' colors, LED ribbon
    g.fillStyle(0x2a2f3c, 1); g.fillRect(x0 - 6, yF - h - 6, x1 - x0 + 12, 8);
    g.fillStyle(0x10131c, 1); g.fillRect(x0, yF - h, x1 - x0, h);
    g.fillStyle(Phaser.Display.Color.HexStringToColor(t0.def.colors[0]).color, 1); g.fillRect(x0, yF - h, (x1 - x0) / 2, 6);
    g.fillStyle(Phaser.Display.Color.HexStringToColor(t1.def.colors[0]).color, 1); g.fillRect((x0 + x1) / 2, yF - h, (x1 - x0) / 2, 6);
    g.fillStyle(0x05060a, 1); g.fillRect(x0 + 6, yF - h + 14, x1 - x0 - 12, 22);
    this.tableText = this.add.text((x0 + x1) / 2, yF - h + 25, '', { fontFamily: FONT, fontSize: '14px', color: '#ffb02e', fontStyle: 'bold' }).setOrigin(0.5).setDepth(sy(-4.5));
    // bench chairs toward each baseline
    // (the chairs themselves are drawn into the seated bench / celebrity sprites)
    // courtside seats between each bench and the scorer's table: plush red chairs for the famous faces
    this.celebs = [];
    const crng = new Rng(sim.teams[0].def.seed * 97 + 13);
    for (const [a, b] of CELEB_X) for (let x = a; x <= b + 0.01; x += 1.65) {
      const look = randomCeleb(() => crng.next());
      const key = `celeb_${hashStr(JSON.stringify(look))}`;
      if (!this.textures.exists(key)) {
        const tex = this.textures.addCanvas(key, buildCelebSheet(look))!;
        for (let f = 0; f < CELEB_FRAMES; f++) tex.add(f, 0, f * CELEB_W, 0, CELEB_W, CELEB_H);
      }
      const sprite = this.add.sprite(sx(x), sy(-3.9), key, 0).setOrigin(0.5, 1).setScale(CELEB_SCALE).setDepth(sy(-3.9));
      this.celebs.push({ sprite, phase: crng.next() * 10, x, frame: 0, until: 0 });
    }
    // coaches in suits
    this.coaches = [];
    ([0, 1] as const).forEach((team) => {
      const def = sim.teams[team].def;
      const rng = new Rng(def.seed * 31 + 7);
      const look = randomAppearance(() => rng.next());
      Object.assign(look, { armSleeve: 'both', sleeveColor: '#1d1f2a', wristband: null, legSleeve: 'none', kneePad: false, goggles: false, mask: false, headband: null, shoe: '#111111', shoeAccent: '#111111', socks: 'low', sockColor: '#111111', hair: rng.pick(['bald', 'buzz', 'fade', 'waves']) });
      const kit: Kit = { jersey: '#1d1f2a', jerseyShade: '#14161e', trim: def.colors[0], shorts: '#22242e', number: -1, pants: true };
      const key = `coach_${def.id}_${hashStr(JSON.stringify(look))}`;
      const home = team === 0 ? 26.5 : 67.5;
      this.coaches.push({ team, key, look, kit, sprite: null, sheet: this.sheetFor(key, 6.2, look, kit), home, x: home, act: 'idle', actUntil: 0 });
    });
  }

  frontSprites = new Map<string, Phaser.GameObjects.Sprite>();
  celebs: { sprite: Phaser.GameObjects.Sprite; phase: number; x: number; frame: number; until: number }[] = [];
  /** Front-facing sprite for a bench player (looks at the court). */
  frontSprite(p: Player): Phaser.GameObjects.Sprite {
    const kit = this.kitFor(p);
    const key = `front_${p.id}_${hashStr(JSON.stringify([p.appearance, p.height.toFixed(2), kit]))}`;
    if (!this.textures.exists(key)) {
      const tex = this.textures.addCanvas(key, buildFrontSheet(p.height, p.appearance, kit))!;
      tex.add(0, 0, 0, 0, FRONT_W, FRONT_H); tex.add(1, 0, FRONT_W, 0, FRONT_W, FRONT_H);
    }
    let fs = this.frontSprites.get(p.id);
    if (!fs) { fs = this.add.sprite(0, 0, key, 0).setOrigin(0.5, 1).setScale(BENCH_SCALE); this.frontSprites.set(p.id, fs); }
    else if (fs.texture.key !== key) fs.setTexture(key, 0);
    return fs;
  }

  renderSideline() {
    for (const fs of this.frontSprites.values()) fs.setVisible(false);
    const sim = this.sim, now = this.time.now;
    const [a, b] = sim.teams;
    const clock = sim.cfg.mode === 'practice' ? '--:--' : `${Math.floor(Math.max(0, sim.clock) / 60)}:${String(Math.floor(Math.max(0, sim.clock) % 60)).padStart(2, '0')}`;
    this.tableText.setText(`${a.def.id} ${a.score}  ${clock}  ${b.score} ${b.def.id}`);
    // benches: everyone on the roster who isn't on the floor sits; they jump up on their team's big plays
    const onCourt = new Set(sim.players.map((p) => p.id));
    ([0, 1] as const).forEach((team) => {
      const bench = sim.teams[team].roster.filter((p) => !onCourt.has(p.id));
      const start = BENCH_X[team][0];
      bench.forEach((p, i) => {
        const fs = this.frontSprite(p);
        const cheering = now < this.benchCheerUntil[team];
        const bob = cheering ? -Math.abs(Math.sin(now / 140 + i)) * 4 : Math.sin(now / 900 + i) * 0.6;
        fs.setVisible(true).setPosition(sx(start + i * 2.2), sy(-3.9) + bob).setDepth(sy(-3.9)).setFrame(cheering ? 1 : 0);
      });
    });
    for (const [id, fs] of this.frontSprites) fs.setVisible(fs.visible && !onCourt.has(id));
    for (const c of this.celebs) {
      if (now > c.until) {
        // idle: mostly seated, now and then someone films the action or checks the jumbotron
        const t = Math.sin(now / 1700 + c.phase * 3);
        c.frame = t > 0.93 ? 2 : 0;
      }
      const bob = c.frame === 1 ? -Math.abs(Math.sin(now / 150 + c.phase)) * 3 : 0;
      c.sprite.setFrame(c.frame).setPosition(sx(c.x), sy(-3.9) + bob);
    }
    // coaches pace the sideline, point when calling a play, celebrate big plays
    for (const c of this.coaches) {
      if (!c.sheet) { c.sheet = this.sheetFor(c.key, 6.2, c.look, c.kit); if (!c.sheet) continue; }
      if (!c.sprite) c.sprite = this.add.sprite(sx(c.x), sy(-1.6), c.key, 0).setOrigin(CX / FRAME_W, FOOT_Y / FRAME_H).setScale(SPRITE_SCALE).setDepth(sy(-1.6));
      let clip = 'idle', u = now / 2000;
      if (now < c.actUntil) { clip = c.act; u = c.act === 'cheer' ? now / 400 : 1 - (c.actUntil - now) / 1100; }
      else {
        const target = c.home + Math.sin(now / 2600 + c.team * 2) * 2.5;
        const dx = target - c.x;
        if (Math.abs(dx) > 0.15) { c.x += Math.sign(dx) * Math.min(Math.abs(dx), 0.05); clip = 'jog'; u = c.x / 3; c.sprite!.setFlipX(dx < 0); }
      }
      c.sprite!.setPosition(sx(c.x), sy(-1.6)).setFrame(c.sheet.index[clip].start + frameAt(CLIP[clip], u));
    }
  }

  drawOverlays() {
    const sim = this.sim, g = this.overlay, gt = this.overlayTop;
    g.clear(); gt.clear();
    for (const t of this.labelTexts) t.destroy();
    this.labelTexts = [];
    const u = sim.user;
    const dbg = app.settings.debug;
    // sprint bursts: speed lines streaming behind the runner, dust puff on start
    for (const p of sim.players) {
      if (sim.time >= p.burstUntil) continue;
      const sp = len(p.vel);
      if (sp < 4) continue;
      const bx = -p.vel.x / sp, by = -p.vel.y / sp * (D / S);
      const px0 = sx(p.p.x), feet = sy(p.p.y, p.z);
      const fade = Math.min(1, (p.burstUntil - sim.time) / 0.4);
      for (let i = 0; i < 5; i++) {
        const hgt = (0.15 + i * 0.17) * p.height * S;
        const wob = Math.sin(sim.time * 30 + i * 2.1) * 6;
        const lenPx = 26 + ((i * 37 + Math.floor(sim.time * 20)) % 3) * 9;
        const x0 = px0 + bx * (14 + wob), y0 = feet - hgt + by * 14;
        gt.lineStyle(2, 0xffffff, 0.55 * fade);
        gt.lineBetween(x0, y0, x0 + bx * lenPx, y0 + by * lenPx);
      }
      if (sim.time - p.burstStartAt < 0.25) { g.fillStyle(0xe8d6b0, 0.5 * (1 - (sim.time - p.burstStartAt) / 0.25)); for (let i = 0; i < 4; i++) g.fillCircle(px0 + bx * (8 + i * 7), feet - 2 - i, 4 + i); }
    }
    // L2 icon pass: each teammate wears the button that passes to him
    if (sim.iconTargets) {
      const GL: Record<string, [string, number]> = { a: ['✕', 0x7fb4ff], b: ['○', 0xff7f8f], x: ['□', 0xff9ce8], y: ['△', 0x7fffc8] };
      for (const t of sim.iconTargets) {
        const m = sim.players.find((q) => q.id === t.pid); if (!m) continue;
        const x = sx(m.p.x), y = sy(m.p.y, m.z + m.height + 1.6);
        gt.fillStyle(0x000000, 0.75); gt.fillCircle(x, y, 15);
        gt.lineStyle(3, GL[t.btn][1], 1); gt.strokeCircle(x, y, 15);
        this.label(x, y, GL[t.btn][0], '#' + GL[t.btn][1].toString(16).padStart(6, '0'), 18);
      }
    }
    // rocked by a block / strip: little stars circling the head
    for (const p of sim.players) {
      if (sim.time >= p.stunnedUntil) continue;
      const hx = sx(p.p.x), hy = sy(p.p.y, p.z + p.height + 0.5);
      const fade = Math.min(1, (p.stunnedUntil - sim.time) / 0.3);
      for (let i = 0; i < 3; i++) {
        const a = sim.time * 7 + (i * Math.PI * 2) / 3;
        const x = hx + Math.cos(a) * 13, y = hy + Math.sin(a) * 4;
        gt.fillStyle(0xffe14d, fade * (Math.sin(a) > 0 ? 1 : 0.55));
        gt.fillTriangle(x - 4, y, x + 4, y, x, y - 5); gt.fillTriangle(x - 4, y - 3, x + 4, y - 3, x, y + 2);
      }
    }
    if (dbg.aiTargets) for (const p of sim.players) { g.lineStyle(1, p.team === 0 ? 0x66aaff : 0xff6666, 0.5); g.lineBetween(sx(p.p.x), sy(p.p.y), sx(p.target.x), sy(p.target.y)); }
    if (dbg.hitboxes) for (const p of sim.players) { g.lineStyle(1, 0xffffff, 0.6); g.strokeEllipse(sx(p.p.x), sy(p.p.y), 2.2 * S, 2.2 * D); }
    // 1v1: P2 (or CPU) ring + tag; P1 gets a tag too
    if (sim.cfg.oneOnOne) {
      const p2 = sim.teams[1].onCourt[0];
      if (p2) {
        g.lineStyle(3, 0xff8a3d, 0.95); g.strokeEllipse(sx(p2.p.x), sy(p2.p.y), 2.6 * S, 2.6 * D);
        this.label(sx(p2.p.x), sy(p2.p.y, p2.z + p2.height + 1.0) - 14, sim.user2 ? 'P2' : 'CPU', '#ff9f6a', 14);
      }
      if (u) this.label(sx(u.p.x), sy(u.p.y, u.z + u.height + 1.0) - 22, 'P1', '#7dffb8', 14);
    }
    if (!u || !sim.userOnCourt) return;

    // user ring + arrow
    g.lineStyle(3, 0x33ff99, 0.95); g.strokeEllipse(sx(u.p.x), sy(u.p.y), 2.6 * S, 2.6 * D);
    gt.fillStyle(0x33ff99, 1);
    const ax = sx(u.p.x), ay = sy(u.p.y, u.z + u.height + 1.0);
    gt.fillTriangle(ax - 7, ay - 10, ax + 7, ay - 10, ax, ay);
    if (u.callForBallUntil > sim.time) this.label(ax, ay - 30, '!', '#ffee00', 22);

    const hasBall = sim.holder() === u;
    const onO = u.team === sim.possession;
    // your matchup's contest cone (solid when he has the ball): colored by how much you'd bother his shot
    if (!onO && u.guarding && dbg.cone) {
      const m = sim.players.find((p) => p.id === u.guarding);
      if (m) {
        const mside = sim.side(m.team);
        const type = selectShotType(m, mside, { x: 0, y: 0 }, sim.time);
        const L = contestReach(type);
        const dir = norm(sub(rimPos(mside), m.p));
        const rot = (ang: number) => ({ x: dir.x * Math.cos(ang) - dir.y * Math.sin(ang), y: dir.x * Math.sin(ang) + dir.y * Math.cos(ang) });
        const l = rot(-CONE_HALF), r = rot(CONE_HALF);
        const c = computeContest(m, [u], mside, type, sim.time).raw;
        const col = c > 0.3 ? 0x40ff70 : c > 0.1 ? 0xffb030 : 0xff4040;
        const alpha = sim.holder() === m ? 1 : 0.25;
        const pts = [new Phaser.Math.Vector2(sx(m.p.x), sy(m.p.y)), new Phaser.Math.Vector2(sx(m.p.x + l.x * L), sy(m.p.y + l.y * L)), new Phaser.Math.Vector2(sx(m.p.x + r.x * L), sy(m.p.y + r.y * L))];
        g.fillStyle(col, 0.2 * alpha); g.lineStyle(1, col, 0.65 * alpha);
        g.fillPoints(pts, true); g.strokePoints(pts, true);
      }
    }
    // defensive assignment
    if (!onO && u.guarding) {
      const m = sim.players.find((p) => p.id === u.guarding);
      if (m) { g.lineStyle(2, 0xff5050, 0.9); g.strokeEllipse(sx(m.p.x), sy(m.p.y), 2.6 * S, 2.6 * D); if (dist(m.p, u.p) > 8) { g.lineStyle(1, 0xff5050, 0.4); g.lineBetween(sx(u.p.x), sy(u.p.y), sx(m.p.x), sy(m.p.y)); } }
    }
    // play assignment ghost path
    const asg = sim.userAssignment();
    if (asg && !hasBall && dbg.paths) {
      g.lineStyle(2, 0xffe680, 0.55);
      const steps = 10;
      for (let i = 0; i < steps; i += 2) {
        const a = i / steps, c = (i + 1) / steps;
        g.lineBetween(sx(u.p.x + (asg.pos.x - u.p.x) * a), sy(u.p.y + (asg.pos.y - u.p.y) * a), sx(u.p.x + (asg.pos.x - u.p.x) * c), sy(u.p.y + (asg.pos.y - u.p.y) * c));
      }
      g.lineStyle(2, 0xffe680, 0.9); g.strokeEllipse(sx(asg.pos.x), sy(asg.pos.y), 3 * S, 3 * D);
      this.label(sx(asg.pos.x), sy(asg.pos.y) + 14, asg.act.toUpperCase(), '#ffe680', 12);
    }
    if (hasBall) {
      const side = sim.side(u.team);
      const rim = rimPos(side);
      // contest cone
      if (dbg.cone) {
        const dir = norm(sub(rim, u.p));
        const L = contestReach(sim.preview?.type ?? 'three');
        const rot = (a: number) => ({ x: dir.x * Math.cos(a) - dir.y * Math.sin(a), y: dir.x * Math.sin(a) + dir.y * Math.cos(a) });
        const l = rot(-CONE_HALF), r = rot(CONE_HALF);
        const c = sim.preview?.contest ?? 0;
        const col = c > 0.35 ? 0xff4040 : c > 0.15 ? 0xffb030 : 0x40ff70;
        g.fillStyle(col, 0.18); g.lineStyle(1, col, 0.6);
        const pts = [new Phaser.Math.Vector2(sx(u.p.x), sy(u.p.y)), new Phaser.Math.Vector2(sx(u.p.x + l.x * L), sy(u.p.y + l.y * L)), new Phaser.Math.Vector2(sx(u.p.x + r.x * L), sy(u.p.y + r.y * L))];
        g.fillPoints(pts, true); g.strokePoints(pts, true);
      }
      // dime vision lanes (perk) or debug lanes
      if (u.mods.pAdd('laneVision') > 0 || dbg.lanes) {
        for (const m of sim.mates(u)) {
          let risk = 0;
          for (const d of sim.opp(u.team)) { const s = segDist(d.p, u.p, m.p); if (s.t > 0.08 && s.t < 0.97 && s.d < 3.2) risk += 1 - s.d / 3.2; }
          const col = risk > 0.6 ? 0xff4040 : risk > 0.2 ? 0xffb030 : 0x40ff70;
          g.lineStyle(2, col, 0.6); g.lineBetween(sx(u.p.x), sy(u.p.y), sx(m.p.x), sy(m.p.y));
        }
      }
      // pass target dot
      const t = sim.passTarget;
      if (t) {
        const px = sx(t.p.x), py = sy(t.p.y, t.z + t.height + 1.3);
        gt.fillStyle(0x000000, 0.6); gt.fillCircle(px, py, 9);
        gt.fillStyle(0xffe600, 1); gt.fillCircle(px, py, 6);
      }
    }
    // chase-down lock-on reticle
    const ua = sim.ult.active;
    if (ua?.id === 'chaseDown' && ua.targetId) {
      const t = sim.players.find((p) => p.id === ua.targetId);
      if (t) { gt.lineStyle(3, 0xff3366, 1); const cx = sx(t.p.x), cy = sy(t.p.y, t.height * 0.6); gt.strokeCircle(cx, cy, 30); gt.lineBetween(cx - 40, cy, cx - 20, cy); gt.lineBetween(cx + 20, cy, cx + 40, cy); gt.lineBetween(cx, cy - 40, cx, cy - 20); gt.lineBetween(cx, cy + 20, cx, cy + 40); }
    }
  }

  label(x: number, y: number, s: string, color: string, size: number) {
    this.labelTexts.push(this.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(6000));
  }

  drawHud() {
    const sim = this.sim, h = this.hud;
    h.clear();
    h.fillStyle(0x000000, 0.72); h.fillRect(0, 0, VIEW_W, 60);
    // equation: live preview while you have the ball, else the last shot
    const prev = sim.preview;
    const ls = sim.lastShot;
    let eq = '';
    if (prev) eq = `SHOT CHANCE  ${fmtEq(prev)}`;
    else if (ls && sim.time - ls.at < 4) eq = `${ls.user ? 'YOUR SHOT' : ls.name}: ${fmtEq(ls.ev)}  →  ${ls.blocked ? 'BLOCKED' : ls.made ? 'MADE' : 'MISSED'}`;
    else if (sim.cfg.oneOnOne) eq = 'MAKE IT, TAKE IT — score and you keep it; stops and defensive boards check it back up top.  Pump fake = tap ✕';
    else eq = sim.userOnCourt ? (sim.user!.team === sim.possession ? 'Get open. Run your assignment. △ = call for the ball (teammates decide based on trust).' : 'Defense: ✕ = block/contest  △ = swipe/deflect  ○ = take a charge') : '';
    this.eqText.setText(eq);

    const [a, b] = sim.teams;
    const clock = sim.cfg.mode === 'practice' ? 'PRACTICE' : `${sim.quarter <= 4 ? 'Q' + sim.quarter : 'OT'} ${Math.floor(Math.max(0, sim.clock) / 60)}:${String(Math.floor(Math.max(0, sim.clock) % 60)).padStart(2, '0')}`;
    const o = sim.cfg.oneOnOne;
    if (o) {
      const n0 = a.onCourt[0]?.name ?? a.def.id, n1 = b.onCourt[0]?.name ?? b.def.id;
      const ball = sim.possession === 0 ? '● ' : '  ', ball1 = sim.possession === 1 ? ' ●' : '  ';
      this.scoreText.setText(`${ball}${n0} ${a.score}  –  ${b.score} ${n1}${ball1}    to ${o.target}${o.winBy2 ? ' (win by 2)' : ''} · ${o.scoring === '1s2s' ? '1s & 2s' : '2s & 3s'}    SHOT ${Math.max(0, Math.ceil(sim.shotClock))}`);
    } else this.scoreText.setText(`${a.def.id} ${a.score}  –  ${b.score} ${b.def.id}    ${clock}    SHOT ${Math.max(0, Math.ceil(sim.shotClock))}`);
    h.fillStyle(0x000000, 0.55); h.fillRect(0, 60, Math.max(560, this.scoreText.width + 24), 32);

    const asg = sim.userAssignment();
    const playName = sim.runner.play ? sim.runner.play.name : '';
    const forYou = sim.runner.focusPid && sim.runner.focusPid === sim.user?.id;
    this.playText.setText(playName ? `PLAY: ${playName}${forYou ? ' — for YOU' : ''}${asg ? `   —   YOU: ${asg.act.toUpperCase()}` : ''}` : '');

    // trust bars (top left, under the score)
    const tr = sim.trust;
    this.trustText.setText(o ? '' : `TEAM  ${tr.team.toFixed(0)}\nCOACH ${tr.coach.toFixed(0)}`);
    if (!o) {
      h.fillStyle(0x000000, 0.5); h.fillRect(0, 92, 200, 38);
      h.fillStyle(0x223344, 1); h.fillRect(92, 98, 100, 9); h.fillRect(92, 114, 100, 9);
      h.fillStyle(0x4fc3ff, 1); h.fillRect(92, 98, tr.team, 9);
      h.fillStyle(0xffc34f, 1); h.fillRect(92, 114, tr.coach, 9);
    }
    // ultimate name (the charge ring lives on the □ button)
    const st = sim.ult.state;
    const uu = sim.user;
    this.ultText.setText(st.unlocked && st.id && uu ? `${ULTIMATES[st.id].name} · ${ultLevelName(st)}${uu.ultCharge >= 100 ? '  READY!' : ''}` : '').setColor(uu && uu.ultCharge >= 100 ? '#ffdd33' : '#ffffff');
    this.ctrl.update(sim, this.input2, sim.user ? (this.sheets.get(sim.user.id) ?? null) : null);

    // feed
    const now = this.time.now;
    this.feedText.setText(this.feed.filter((f) => now - f.t < 6000).map((f) => f.text).join('\n'));

    // bench
    if (!sim.userOnCourt && sim.cfg.mode === 'game' && !sim.over) {
      const plan = sim.cfg.rotation;
      const next = plan?.stints.find(([s]) => s > sim.elapsed);
      const q = next ? Math.floor(next[0] / sim.cfg.quarterLen) + 1 : null;
      this.benchText.setVisible(true).setText(`ON THE BENCH  (${plan?.role ?? ''})\nCoach trust ${sim.trust.coach.toFixed(0)} — earn minutes with good basketball\n${q ? `Coach plans to sub you in during Q${Math.min(4, q)}` : 'No more minutes planned tonight'}\n\nSimulating at ${app.settings.benchSpeed}x`);
    } else this.benchText.setVisible(false);

  }
}

/** Merge this frame's input with presses not yet consumed by a sim step. */
function latch(prev: UserInput | null, cur: UserInput): UserInput {
  if (!prev) return cur;
  return { ...cur, sprint: cur.sprint || prev.sprint, a: cur.a || prev.a, b: cur.b || prev.b, x: cur.x || prev.x, y: cur.y || prev.y };
}
const clearEdges = (i: UserInput): UserInput => ({ ...i, sprint: false, a: false, b: false, x: false, y: false });

function fmtEq(e: import('../sim/shooting').ShotEval): string {
  return e.terms.map((t) => (t.kind === 'base' ? `${(t.value * 100).toFixed(0)}% ${t.label}` : `× ${t.value.toFixed(2)} ${t.label}`)).join('  ') + `  =  ${(e.pct * 100).toFixed(1)}%  (${e.pts}PT)`;
}
void D;

function hashStr(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
