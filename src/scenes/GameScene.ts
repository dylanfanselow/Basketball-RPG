import Phaser from 'phaser';
import { hiRes } from './ui';
import { randomTip } from './tips';
import { GameSim, GameEvent, UserInput, GRAVITY } from '../sim/game';
import { Player } from '../sim/player';
import { InputMapper } from '../input/input';
import { app } from '../state';
import { createSim, Mode, MatchSetup, OneOnOneSetup, GameInit } from './setup';
import { S, D, sx, sy, drawCourt, drawHoops, drawNet, NetHoop, WORLD_W, VIEW_W, VIEW_H, FLOOR_TOP } from '../render/view';
import { SHEET_CACHE, MAX_SHEETS, ANGLE_CACHE, angPage, hashStr, playerSheetKey, dropSheet, sheetFor as bankSheetFor, angleCache as bankAngleCache } from '../render/playerBank';
import { CELEB_W, CELEB_H, CELEB_FRAMES } from '../render/celebs';
import { CELEB_CAST, FEATURED_CELEBS, GLAM_CELEBS, RETIRED_CELEBS, CANE_CELEBS, castSheet } from '../render/celebArt';

/** Texture key of celeb cast member i (the pixel editor drops it so the next game picks up new art). */
export const celebTexKey = (i: number) => `celebcast_${i}`;
import type { Appearance } from '../render/appearance';
import { Sheet, Kit, shade, FRAME_W, FRAME_H, CX, FOOT_Y, SPRITE_SCALE, frameRect, buildFrontSheet, buildEmptyChair, buildCoachSheet, buildAnnouncerSheet, COACH_FRAMES, FRONT_W, FRONT_H, drawAngled, crispenRect, figureHeight } from '../render/sprites';
import { FrameCache, yawFor, shotView } from '../render/frameCache';
import { CLIP, SHOT_CLIP, frameAt, shotU, sampleClip, frameTime, shuffleState, J } from '../render/anim';
import { sfx } from '../audio/sfx';
import { rimPos } from '../sim/court';
import { coneHalf, contestReach, computeContest, selectShotType } from '../sim/shooting';
import { Crowd } from '../render/crowd';
import { ControllerHud } from '../render/hud';
import { randomAppearance } from '../render/appearance';
import { Rng } from '../sim/math';
import { norm, sub, dist, len, segDist } from '../sim/math';
import { ULTIMATES } from '../sim/data';
import { ultLevelName } from '../sim/ultimates';
import { topStats } from '../sim/boxScore';
import { partsVersion } from '../render/faceParts';
import { buildIcons } from '../render/roomArt';
import { UltFx, LIFT_DEPTH } from '../render/aura';
import { addSchoolCourt, FENCE_Y, BLEACHER, SCHOOL_COLORS, SchoolVariant } from '../render/schoolArt';
import { SchoolKids, CrowdLike } from '../render/crowd';
import { CINE_SPEED } from '../sim/ultimates';
import { StoryRun, storyBenchSeats } from './storyRun';
import { FilmRun } from './filmRun';
import { FilmDirector } from '../sim/film';
import { scoutTexture } from './castSprites';
import { playerKit, takeStory } from './preload';

/** Sideline people are a little farther from the camera than the court: bench players slightly smaller than on-court
 * players, courtside celebs (regular-height people) smaller again. */
const BENCH_SCALE = SPRITE_SCALE * 0.92;
const CELEB_SCALE = SPRITE_SCALE * 0.82;

const FONT = '"Courier New", monospace';
/** Post-up clips: both players face away from the rim (back to the basket), turned a little toward the camera. */
const POST_CLIPS = ['postUp', 'postBump', 'postBumpedBack', 'postDefend', 'postBumped'];
/**
 * Multi-angle players: clips that turn with the player (locomotion, stances, dribbles). Everything else (shots,
 * moves, passes, box-outs...) stays in side view toward the rim so ball offsets and timing match the sim.
 */
/**
 * Jump shots drawn at the shooter's angle to the basket (round 45): from the near baseline you see his back, from the far
 * side his front, three-quarter from the wings. Rim-contact finishes (layups, dunks, oops, jelly) stay side-on so the
 * hand still meets the rim on screen.
 */
export const ANGLED_SHOTS = new Set(['shot_jumper', 'shot_fade', 'shot_push', 'shot_floater', 'shot_hook', 'shot_stepThroughJumper']);
const ANGLED = new Set(['idle', 'jog', 'sprint', 'burst', 'defend', 'slide', 'dribble', 'dribbleRun', 'dribbleBurst', 'hold', ...POST_CLIPS]);
/** Angled frames: per-frame draw budget + prewarm (the caches themselves live in render/playerBank.ts). */
const ANG_BUDGET = 4, ANG_PREWARM = 2;
const PREWARM_CLIPS = ['defend', 'slide', 'idle', 'jog', 'dribble'];
/** Sideline layout (court feet): benches toward each baseline, courtside celebrity rows between them and the table. */
const BENCH_X: [number, number][] = [[4, 22], [72, 90]];
const CELEB_X: [number, number][] = [[29, 39], [55, 65]];

const BOX_X = 4, BOX_TILE = 66;
/** Courtside glam-celeb sequences (celeb sheet frames 4-7). */
const WAVE = { frames: [4, 5, 4, 5, 4, 5], ms: [190, 190, 190, 190, 190, 260], start: 0 };
const KISS = { frames: [6, 7], ms: [450, 800], start: 0 };

/** Knock-back clip progress: short hits play straight through; long ones stumble, stay off balance, then recover. */
function bumpedU(e: number, dur: number): number {
  if (dur <= 0.6) return e / Math.max(0.2, dur);
  if (e < 0.33) return (e / 0.33) * 0.6;
  if (e > dur - 0.28) return 0.6 + 0.4 * Math.min(1, (e - (dur - 0.28)) / 0.28);
  return 0.6 - 0.08 * Math.abs(Math.sin(e * 7)); // wobbling, trying to get his feet back
}

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
  /** Round 51: the rhythm meter's label, and its gain / loss pops and notch flash (round 53: a purple skill card with
   * an icon, the big number and an RHY tag). */
  rhythmText!: Phaser.GameObjects.Text;
  rhythmNum!: Phaser.GameObjects.Text;
  rhythmTag!: Phaser.GameObjects.Text;
  rhythmIcon!: Phaser.GameObjects.Image;
  /** Round 55: ult flame auras, cinematic shade and banner. */
  ultFx!: UltFx;
  private cineWas = false;
  /** Round 53: the short shot chance, top right. */
  shotText!: Phaser.GameObjects.Text;
  /** Round 53: your assignment just switched (circle flash + label). */
  switchFlash = { at: -9999, name: '' };
  rhythmFlash = { at: -9, color: 0xffffff };
  iqText!: Phaser.GameObjects.Text;
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
  /** the user's shot cone, eased toward the size for the shot he'd take now */
  coneL = 5.5; coneHalfNow = 0.7;
  /** defender is mid-shuffle (stance hysteresis, see shuffleState) */
  shuffling = new Map<string, boolean>();
  defFlip = new Map<string, boolean>();
  sheets = new Map<string, { key: string; sheet: Sheet }>();
  animMem = new Map<string, { clip: string; u: number }>();
  lastVel = new Map<string, { x: number; y: number; squeakAt: number }>();
  heldBall: { x: number; y: number; behind?: number } | null = null;
  crowd!: CrowdLike;
  /** round 56: the school court venue (day / rainy night), or null in the arena */
  school: SchoolVariant | null = null;
  flag: Phaser.GameObjects.Sprite | null = null;
  rainG: Phaser.GameObjects.Graphics | null = null;
  splashG: Phaser.GameObjects.Graphics | null = null;
  flashRect: Phaser.GameObjects.Rectangle | null = null;
  drops: { x: number; y: number; len: number; sp: number }[] = [];
  splashes: { x: number; y: number; t: number }[] = [];
  nextLightning = 0;
  shotClockTexts: Phaser.GameObjects.Text[] = [];
  tableText!: Phaser.GameObjects.Text;
  announcers: { sprite: Phaser.GameObjects.Sprite; phase: number }[] = [];
  assistants: { sprite: Phaser.GameObjects.Sprite; team: 0 | 1; x: number; phase: number }[] = [];
  coaches: { team: 0 | 1; sprite: Phaser.GameObjects.Sprite; bubble: Phaser.GameObjects.Graphics; bubbleText: Phaser.GameObjects.Text; home: number; x: number; callUntil: number; cheerUntil: number; phase: number }[] = [];
  benchCheerUntil: [number, number] = [0, 0];
  paused = false;
  ready = false;
  loadText!: Phaser.GameObjects.Text;
  loadTip!: Phaser.GameObjects.Text; loadBg!: Phaser.GameObjects.Rectangle; loadBar!: Phaser.GameObjects.Graphics;
  /** Round 88: the loading screen (the title, a bar for the players drawn so far, the tip), or hide it. */
  drawLoading(on: boolean) {
    for (const o of [this.loadBg, this.loadBar, this.loadText, this.loadTip]) o.setVisible(on);
    if (!on) return;
    const n = this.sim.players.filter((p) => this.sheets.has(p.id)).length, N = Math.max(1, this.sim.players.length);
    const w = 520, x = VIEW_W / 2 - w / 2, y = VIEW_H / 2 - 10, k = n / N;
    this.loadBar.clear().fillStyle(0x1c2238, 1).fillRoundedRect(x, y, w, 18, 6).fillStyle(0xffcc33, 1).fillRoundedRect(x + 2, y + 2, Math.max(4, (w - 4) * k), 14, 5).lineStyle(2, 0x3c4876, 1).strokeRoundedRect(x, y, w, 18, 6);
    const dots = '.'.repeat(1 + (Math.floor(this.time.now / 400) % 3));
    this.loadText.setText(`LOADING${dots}`);
  }
  pauseText!: Phaser.GameObjects.Text;
  pauseIdx = 0;
  /** Round 60: the prologue running in this game, if any. */
  story: StoryRun | null = null;
  /** Round 91: a film study course running in this game, if any. */
  film: FilmRun | null = null;
  /** Round 80f: a story game in the arena (the national final) is a neutral site: half the crowd per school. */
  get splitCrowd() { return this.mode === 'story' && !this.school; }
  ended = false;

  constructor() { super('Game'); }

  matchSetup?: MatchSetup;
  oneOnOne?: OneOnOneSetup;
  three?: GameInit['three'];
  initData!: GameInit;
  inputP2: InputMapper | null = null;
  latched: [UserInput | null, UserInput | null] = [null, null];
  init(data: GameInit) {
    this.initData = data;
    this.mode = data.mode ?? 'practice';
    this.matchSetup = data.setup; this.oneOnOne = data.oneOnOne; this.three = data.three; this.latched = [null, null]; this.ready = false; this.ended = false; this.paused = false; this.feed = []; this.popEnds = []; this.cineWas = false; sfx.duck(false);
    // the scene object is reused between games: drop per-game caches (textures themselves are kept in SHEET_CACHE)
    this.sprites.clear(); this.reflections.clear(); this.sheets.clear(); this.frontSprites.clear(); this.animMem.clear(); this.lastVel.clear(); this.runDist.clear(); this.slidePhase.clear(); this.defFlip.clear(); this.yawMem.clear(); this.shuffling.clear();
  }

  create() {
    hiRes(this);
    // round 60c: a story game built (and its sheets drawn) ahead of time skips most of "Lacing up…"
    this.sim = this.initData?.reuse ?? (this.mode === 'story' ? takeStory(this.initData?.story ?? 'tutorial') : null) ?? createSim(this.mode, this.matchSetup, this.oneOnOne, this.three, this.initData?.story, this.initData?.film);
    if (this.initData?.empty) this.sim.cfg.scoutsOnly = true; // round 91: an empty arena (the scouts stay home too, see buildSideline)
    app.sim = this.sim;
    const twoHumans = !!this.sim.user2;
    this.input2 = new InputMapper(this, twoHumans ? 1 : undefined);
    this.inputP2 = twoHumans ? new InputMapper(this, 2) : null;
    const [t0, t1] = this.sim.teams;
    // round 56: the venue, the arena, or the school court (day / rainy night) for story events
    const venue = this.initData?.venue ?? app.settings.venue ?? 'arena';
    this.sim.cfg.venue = venue;
    this.school = venue === 'arena' ? null : venue === 'schoolRain' ? 'rain' : 'day';
    this.flag = null; this.rainG = null; this.splashG = null; this.flashRect = null; this.drops = []; this.splashes = [];
    if (this.school) this.flag = addSchoolCourt(this, this.school).flag;
    else drawCourt(this, this.sim.cfg.courtColors ?? [t0.def.colors[0], t1.def.colors[0]]); // round 85: a tryout is on the team's court
    const hoops = drawHoops(this, this.school ? 'school' : 'arena');
    this.nets = hoops.nets; this.netHits = [{ at: -9999, amp: 0 }, { at: -9999, amp: 0 }];
    this.shotClockTexts = hoops.shotClocks.map((c) => this.add.text(c.x, c.y, '24', { fontFamily: FONT, fontSize: '16px', color: '#ff3b2f', fontStyle: 'bold' }).setOrigin(0.5).setDepth(sy(23.6)));
    if (!this.school) {
      this.crowd = new Crowd(this, t0.def.colors, t1.def.colors, !!this.sim.cfg.bigGame, t0.def.seed, this.splitCrowd, !!this.sim.cfg.scoutsOnly);
      this.buildSideline();
    } else {
      // no stands, table, benches, coaches or celebs out here: a few kids by the fence (not on the rainy night)
      this.crowd = new SchoolKids(this, t0.def.seed, { enabled: this.school === 'day', colors: SCHOOL_COLORS, fenceY: FENCE_Y, bleacher: BLEACHER });
      this.celebs = []; this.coaches = []; this.announcers = [];
      if (this.school === 'rain') this.buildRain();
    }
    this.shadows = this.add.graphics().setDepth(-500);
    this.overlay = this.add.graphics().setDepth(-400);
    this.overlayTop = this.add.graphics().setDepth(5000);
    this.ballG = this.add.graphics();
    this.buildSprites();
    this.cameras.main.setBackgroundColor(this.school === 'day' ? '#cfe6f4' : this.school === 'rain' ? '#0a0e1a' : '#0d0f1a');
    this.makeHud();
    // round 60: a prologue game (the tutorial box, the 1s, the big game's coach + scout)
    this.story = this.mode === 'story' ? new StoryRun(this, this.initData.story ?? 'tutorial') : null;
    this.film = this.mode === 'film' && this.sim.director instanceof FilmDirector ? new FilmRun(this, this.sim.director.course) : null; // round 91
    this.events.on('shutdown', () => { app.sim = null; sfx.hush(false); sfx.setArena(false); sfx.duck(false); sfx.rain(false); sfx.crowdSize = 1; sfx.music(null); });
    sfx.music(this.story?.cutscene ? null : 'game'); // round 60c: the retro arcade loop in every basketball game (round 80: not in a cutscene)
    sfx.setArena(!this.school); // crowd murmur only while an arena game is on
    sfx.rain(this.school === 'rain');
    sfx.crowdSize = this.school === 'rain' ? 0 : this.school === 'day' ? 0.35 : 1;
    app.listeners.add(this.onAppChanged);
    this.events.once('shutdown', () => app.listeners.delete(this.onAppChanged));
  }

  private onAppChanged = () => { this.buildSprites(); };

  /** Team uniform for a player (home = team colors, away = white with team trim). */
  kitFor(p: Player): Kit { return playerKit(this.sim, p); }

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
    return bankSheetFor(this, key, heightFt, look, kit, () => this.evictSheets());
  }

  evictSheets() {
    if (SHEET_CACHE.size <= MAX_SHEETS) return;
    const inUse = new Set<string>();
    if (this.sys.isActive()) {
      for (const p of this.sim.players) { const e = this.sheets.get(p.id); if (e) inUse.add(e.key); }
    }
    for (const key of [...SHEET_CACHE.keys()]) {
      if (SHEET_CACHE.size <= MAX_SHEETS) break;
      if (inUse.has(key)) continue;
      for (const [id, e] of this.sheets) if (e.key === key) { this.sheets.delete(id); this.sprites.get(id)?.destroy(); this.sprites.delete(id); this.reflections.get(id)?.destroy(); this.reflections.delete(id); }
      dropSheet(this, key);
    }
  }

  /**
   * The angled-frame cache for a sheet key (created on first use). Frames are drawn on the main thread into canvas
   * texture pages; `pumpAngles` refreshes dirty pages once per frame. Prewarm queues the common stance/run angles.
   */
  angleCache(key: string, heightFt: number, look: Appearance, kit: Kit): FrameCache {
    return bankAngleCache(this, key, heightFt, look, kit, PREWARM_CLIPS);
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

  /** Per shooter: the view his current shot is locked to (by the shot's start time) and his last drawn shot frame. */
  shotViews = new Map<string, { start: number; v: { yaw: number; flip: boolean } }>();
  lastShotFrame = new Map<string, { clip: string; yaw: number; texKey: string; frame: string | number; bo: J | null; behind: boolean }>();
  /**
   * A jump shot's view: from his angle to the basket at the start of the shot, held for the whole shot (no flips
   * mid-shot). On a new shot, all of the user's frames for that view are queued at once so they're ready by the release.
   */
  shotViewFor(p: Player, clip: string): { yaw: number; flip: boolean } {
    const force = app.settings.angles.force;
    if (force !== null) return { yaw: force, flip: app.settings.angles.flip };
    const start = p.anim?.start ?? 0, mem = this.shotViews.get(p.id);
    if (mem && mem.start === start) return mem.v;
    const rim = this.sim.rim(p.team);
    const v = shotView(rim.x - p.p.x, rim.y - p.p.y);
    this.shotViews.set(p.id, { start, v });
    if (v.yaw !== 0) {
      const sh = this.sheets.get(p.id);
      if (sh) { const cache = this.angleCache(sh.key, p.height, p.appearance, this.kitFor(p)); for (let f = 0; f < CLIP[clip].frames; f++) cache.request(`${clip}|${f}|${v.yaw}`, p === this.sim.user); }
    }
    return v;
  }

  /** Which drawn view (yaw + mirror) a player in an angled clip shows. Defenders face their man, turned a bit to us. */
  viewFor(p: Player, clip: string): { yaw: number; flip: boolean } {
    const force = app.settings.angles.force;
    if (force !== null) return { yaw: force, flip: app.settings.angles.flip };
    let dx = p.face.x, dy = p.face.y, bias = 0;
    if (clip === 'defend' || clip === 'slide') {
      const man = p.guarding ? this.sim.players.find((q) => q.id === p.guarding) : null;
      if (man) { dx = man.p.x - p.p.x; dy = man.p.y - p.p.y; bias = 35; }
    } else if (POST_CLIPS.includes(clip)) {
      // post up: facing away from the rim (the sim keeps p.face there), turned toward us so the back-down reads
      const rim = this.sim.rim(this.sim.possession);
      dx = p.p.x - rim.x; dy = p.p.y - rim.y; bias = 25;
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
    return ok;
  }

  ensureSprite(p: Player) {
    const kit = this.kitFor(p);
    const key = playerSheetKey(p.id, p.appearance, p.height, kit);
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
    buildIcons(this.textures);
    this.rhythmText = fixed(this.add.text(VIEW_W / 2, 9, '', { fontFamily: FONT, fontSize: '13px', color: '#ecdcff', fontStyle: 'bold', stroke: '#140a22', strokeThickness: 3 }).setOrigin(1, 0.5).setDepth(9002));
    this.rhythmNum = fixed(this.add.text(VIEW_W / 2, 9, '', { fontFamily: FONT, fontSize: '26px', color: '#ffffff', fontStyle: 'bold', stroke: '#140a22', strokeThickness: 4 }).setOrigin(0, 0.5).setDepth(9002));
    this.rhythmTag = fixed(this.add.text(VIEW_W / 2, 9, 'RHY', { fontFamily: FONT, fontSize: '10px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0, 0.5).setAlpha(0.55).setDepth(9002));
    this.rhythmIcon = fixed(this.add.image(VIEW_W / 2, 9, 'icon_sk_rhythm').setOrigin(0, 0.5).setScale(2).setDepth(9002).setVisible(false));
    this.shotText = fixed(this.add.text(VIEW_W - 58, 30, '', { fontFamily: FONT, fontSize: '20px', color: '#ffffff', fontStyle: 'bold', stroke: '#000', strokeThickness: 4 }).setOrigin(1, 0.5).setDepth(9002));
    this.iqText = fixed(this.add.text(VIEW_W / 2, 92, '', { fontFamily: FONT, fontSize: '16px', color: '#ff9f9f', fontStyle: 'bold', stroke: '#000', strokeThickness: 4, align: 'center' }).setOrigin(0.5, 0).setDepth(9001));
    this.scoreText = fixed(this.add.text(12, 66, '', { fontFamily: FONT, fontSize: '18px', color: '#ffffff', fontStyle: 'bold' }).setDepth(9001));
    this.playText = fixed(this.add.text(VIEW_W / 2, VIEW_H - 30, '', { fontFamily: FONT, fontSize: '16px', color: '#ffe680', align: 'center' }).setOrigin(0.5, 0).setDepth(9001));
    this.ultText = fixed(this.add.text(VIEW_W - 16, VIEW_H - 252, '', { fontFamily: FONT, fontSize: '13px', color: '#ffffff', align: 'right' }).setOrigin(1, 0).setDepth(9001));
    this.trustText = fixed(this.add.text(8, 97, '', { fontFamily: FONT, fontSize: '12px', color: '#cfe8ff', lineSpacing: 2 }).setDepth(9001));
    this.ctrl = new ControllerHud(this, VIEW_W, VIEW_H);
    this.ultFx = new UltFx(this, VIEW_W, VIEW_H);
    this.feedText = fixed(this.add.text(VIEW_W - 16, 100, '', { fontFamily: FONT, fontSize: '14px', color: '#ffffff', align: 'right', lineSpacing: 3 }).setOrigin(1, 0).setDepth(9001));
    this.benchText = fixed(this.add.text(VIEW_W / 2, 260, '', { fontFamily: FONT, fontSize: '22px', color: '#ffffff', align: 'center', backgroundColor: '#000000aa', padding: { x: 16, y: 10 } }).setOrigin(0.5).setDepth(9002));
    this.bigText = fixed(this.add.text(VIEW_W / 2, 200, '', { fontFamily: FONT, fontSize: '40px', color: '#ffdd33', fontStyle: 'bold', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5).setDepth(9003).setAlpha(0));
    // round 88 (owner): a loading screen with a tip at the bottom (it was "Lacing up…")
    this.loadBg = fixed(this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x070912, 1).setOrigin(0, 0).setDepth(9600)).setVisible(false);
    this.loadBar = fixed(this.add.graphics().setDepth(9601)).setVisible(false);
    this.loadText = fixed(this.add.text(VIEW_W / 2, VIEW_H / 2 - 70, 'LOADING', { fontFamily: FONT, fontSize: '34px', color: '#ffe680', fontStyle: 'bold', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5).setDepth(9601)).setVisible(false);
    this.loadTip = fixed(this.add.text(VIEW_W / 2, VIEW_H - 90, `TIP: ${randomTip()}`, { fontFamily: FONT, fontSize: '17px', color: '#cfd8f0', align: 'center', wordWrap: { width: VIEW_W - 200 }, lineSpacing: 4 }).setOrigin(0.5).setDepth(9601)).setVisible(false);
    this.makeBoxScore();
    this.pauseText = fixed(this.add.text(VIEW_W / 2, VIEW_H / 2, '', { fontFamily: FONT, fontSize: '24px', color: '#ffffff', align: 'center', backgroundColor: '#000000dd', padding: { x: 30, y: 20 } }).setOrigin(0.5).setDepth(9500).setVisible(false));
  }

  update(_t: number, deltaMs: number) {
    this.input2.poll(); this.inputP2?.poll();
    if (this.input2.pressed('dev')) (window as any).__toggleDev?.();
    if (this.input2.pressed('mute')) this.feed.unshift({ text: sfx.toggleMute() ? 'Sound off (M)' : 'Sound on (M)', t: this.time.now, color: '#ffffff' });
    if (this.ended) { this.sim.settle(Math.min(0.05, deltaMs / 1000)); this.render(); return; } // round 60e: they land and stand until PostGame
    if (this.paused) { this.updatePause(); return; }
    // tip-off waits until every player's sprite sheet has been drawn (built in parallel in the background)
    if (!this.ready) {
      this.ready = this.sheetsReady();
      this.drawLoading(!this.ready);
      if (!this.ready) { this.render(); return; }
    }
    // Options/Enter = pause menu; L1/Esc = pause menu with "Quit" highlighted (press L1 again to leave)
    for (const inp of this.inputs()) {
      if (inp.pressed('start') && !inp.held('back')) { this.openPause(0); return; }
      if (inp.pressed('escape')) { this.openPause(3); return; }
    }

    const sim = this.sim;
    // round 75: a crunch-time hush never outlives its shot (a make pops, a miss / block / airball lifts it at once)
    if (sfx.hushed && sim.ball.st.kind !== 'shot' && this.time.now - this.hushAt > 1500) sfx.hush(false);
    if (sim.over) sim.settle(Math.min(0.05, deltaMs / 1000)); // round 60e: land and stand after the final whistle
    // round 60: story lines hold the game (✕ reads on); the tutorial box follows the director
    if (this.story?.update()) { for (const e of sim.drainEvents()) this.onEvent(e); this.render(); if (sim.over) this.story.onOver(); return; }
    if (this.film?.update()) { for (const e of sim.drainEvents()) this.onEvent(e); this.render(); return; } // round 91
    // round 55: an ult's cinematic slows the whole game (clock included)
    const speed = app.settings.timeScale * (sim.userOnCourt || sim.cfg.mode === 'practice' ? 1 : app.settings.benchSpeed) * UltFx.speed(sim, CINE_SPEED);
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
    if (sim.over && !this.ended && this.story?.onOver()) return; // the story takes it from here
    if (sim.over && !this.ended) {
      this.ended = true;
      this.time.delayedCall(1800, () => this.scene.start('PostGame', { mode: this.mode, sim: this.sim, replay: this.initData }));
    }
  }

  /** Every human's input mapper (P1, plus P2 in two-player 1v1). */
  inputs(): InputMapper[] { return this.inputP2 ? [this.input2, this.inputP2] : [this.input2]; }

  openPause(idx: number) { this.paused = true; this.pauseIdx = idx; this.drawPause(); }

  pauseOptions() { return [...this.basePause(), ...(this.story?.pauseOptions() ?? []), ...(this.film?.pauseOptions() ?? [])]; }
  basePause() { return ['Resume', this.mode === 'oneOnOne' ? 'Restart (0-0)' : 'Restart', 'Fullscreen (F)', this.mode === 'career' ? 'Forfeit to Hub' : this.mode === 'oneOnOne' ? 'Quit to 1v1 Select' : this.mode === 'quick3' ? 'Quit to 3v3 Select' : this.initData?.returnTo ? 'Back to the apartment' : this.mode === 'story' ? 'Quit to Title' : 'Quit to Menu']; }

  drawPause() {
    const opts = this.pauseOptions();
    this.pauseText.setVisible(true).setText('PAUSED\n\n' + opts.map((o, i) => (i === this.pauseIdx ? '> ' : '  ') + o).join('\n') + '\n\n✕ select · ○ / Options resume · L1 quit');
  }

  leaveGame() {
    this.paused = false; this.pauseText.setVisible(false);
    const back = this.initData?.returnTo;
    if (back) { this.scene.start(back.scene, back.data); return; } // round 91: film study, the practice court
    if (this.mode === 'story') { this.scene.start('Title'); return; } // round 60: the prologue saves its stage; Load Save resumes it
    this.scene.start(this.mode === 'career' ? 'Hub' : this.mode === 'oneOnOne' ? 'OneOnOneSetup' : this.mode === 'quick3' ? 'ThreeSetup' : 'Menu');
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
        else if (this.pauseIdx >= 4 && this.story) { this.paused = false; this.story.pauseAction(this.pauseIdx - 4); }
        else if (this.pauseIdx >= 4 && this.film) { this.paused = false; this.film.pauseAction(this.pauseIdx - 4); }
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
      case 'dive': sfx.squeak(pan, 1.2); sfx.thud(pan, false); break;
      case 'jelly': sfx.squeak(pan, 0.9); break;
      case 'gather': if (['layup', 'dunk', 'euro', 'stepThrough', 'stepThroughJumper'].includes(d.type)) sfx.squeak(pan, 0.7); break;
      case 'pass': sfx.pass(pan, !!d.lob); break;
      case 'catch': sfx.catch(pan); break;
      case 'rebound': sfx.ding(!!d.off); this.popText(who, d.off ? 'OFF. REBOUND +1' : 'REBOUND +1', '#ffd84a'); break;
      case 'release': sfx.release(pan); if (d.crunch) { sfx.hush(true); this.hushAt = this.time.now; } break; // round 75: crunch time, the arena holds its breath
      case 'net':
        this.netHits[sim.ball.p.x < 47 ? 0 : 1] = { at: this.time.now, amp: d.type === 'dunk' ? 1.1 : d.swish ? 1 : 0.75 };
        if (d.type === 'dunk' || d.type === 'alleyOop') { sfx.dunk(pan); sfx.cheer(d.team === 0 || this.splitCrowd ? 0.9 : 0.45); }
        else { d.swish ? sfx.swish(pan, true) : sfx.swish(pan, false); if (d.pts === 3) sfx.cheer(d.team === 0 || this.splitCrowd ? 0.75 : 0.3); }
        if (sfx.hushed) sfx.pop(d.team === 0 ? 1 : 0.7); // round 75: it went in: the house comes down
        break;
      case 'rim': if (!d.seq) sfx.clank(pan, !!d.board); if (sfx.hushed) sfx.hush(false); break; // live-rim misses already played their contacts
      case 'rimHit': d.kind === 'tick' ? sfx.rimTick(pan) : sfx.clank(pan, d.kind === 'board'); break;
      case 'airball': sfx.airball(pan); if (sfx.hushed) sfx.hush(false); break;
      case 'attention': sfx.cheer(d.tier >= 2 ? 0.55 : 0.35); break; // the crowd notices the defense loading up (round 47)
      case 'boxout': break;
      case 'bounce': sfx.bounce(d.v ?? 6, pan); break;
      case 'screenHit': sfx.thud(pan, false); break;
      case 'contact': sfx.thud(pan, !!d.hard); break;
      case 'block': if (sfx.hushed) sfx.hush(false); sfx.block(pan); sfx.cheer(home || this.splitCrowd ? 0.8 : 0.35); break;
      case 'steal': sfx.steal(pan); if (home || this.splitCrowd) sfx.cheer(0.55); else sfx.groan(); break;
      case 'ankles': sfx.squeak(pan, 1.2); sfx.cheer(1); break;
      case 'poster': sfx.cheer(1); break;
      case 'ult':
        if (e.big && d.id) {
          // round 55: every ult gets a banner; yours (and ones against you) go cinematic: slow, dark, quiet
          const who = this.sim.players.find((q) => q.id === e.pid);
          this.ultFx.showBanner(d.name ?? 'Ultimate', who ? `${who.name}${who === this.sim.user ? ' (you)' : ''}` : '', d.pos ?? 'PG', FONT);
          if (d.cinematic) sfx.duck(true); else sfx.cheer(0.9);
        }
        break;
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
    if (team === 0 && power > 0.5 && this.splitCrowd) this.crowd.react(worldX, power * 0.6, false, true); // round 80f: and the other half boos ours
    this.benchCheerUntil[team] = this.time.now + 1800;
    for (const c of this.coaches) if (c.team === team && power > 0.5) c.cheerUntil = this.time.now + 1300;
    // the famous front row reacts too: big plays bring them out of their seats, the rest film or gasp
    if (power >= 0.5) for (const c of this.celebs) {
      if (c.cane) continue; // he doesn't react, he just keeps tapping
      const r = (c.phase * 7.3 + this.time.now / 997) % 1;
      // the glam celebs blow your team a kiss (or wave) after its big plays
      if (c.glam && team === 0 && r < 0.6) { c.seq = r < 0.35 ? KISS : WAVE; c.seq = { ...c.seq, start: this.time.now + r * 500 }; continue; }
      c.frame = team === 0 ? (r < 0.6 ? 1 : r < 0.85 ? 2 : 3) : r < 0.5 ? 3 : 2;
      c.until = this.time.now + 1400 + r * 900;
    }
  }

  onEvent(e: GameEvent) {
    this.story?.onEvent(e);
    {
      const sim = this.sim;
      const who = e.pid ? sim.players.find((p) => p.id === e.pid) : null;
      const wx = sx(who ? who.p.x : sim.ball.p.x);
      const d = e.data ?? {};
      const team = (e.team ?? who?.team) as 0 | 1 | undefined;
      if (e.kind === 'net') { this.reactAll(d.team, d.type === 'dunk' || d.type === 'alleyOop' || d.type === 'alleyOopLayup' ? 1 : d.pts === 3 ? 0.75 : 0.25, wx); if (d.flash) { this.cameras.main.shake(220, 0.008); sfx.cheer(1); } } // flashy dunks bring the house down
      else if (['block', 'steal', 'ankles', 'poster', 'charge'].includes(e.kind)) this.reactAll(team, e.kind === 'steal' ? 0.6 : 0.9, wx);
      else if (e.kind === 'ult' && e.big) this.reactAll(team, 1, wx);
      if (e.kind === 'play') for (const c of this.coaches) if (c.team === e.team) this.coachCall(c, (e.text.match(/"(.+)"/)?.[1] ?? e.text) + '!');
    }
    if (e.kind === 'rhythmDelta' && e.pid === this.sim.user?.id) this.rhythmPop(e.data?.amount ?? 0, e.data?.why ?? '', e.data ?? {});
    if (e.kind === 'switch' && e.pid === this.sim.user?.id) this.switchFlash = { at: this.time.now, name: e.data?.to ?? '' };
    if (e.kind === 'rhythm' && e.pid === this.sim.user?.id) this.rhythmFlash = { at: this.time.now, color: 0xffe680 };
    this.playSound(e);
    if (e.quiet) return;
    const mine = !!e.pid && (e.pid === this.sim.user?.id || e.pid === this.sim.user2?.id);
    const color = e.good === false ? '#ff8080' : e.good ? '#9dff9d' : e.team === 1 ? '#ffd0d0' : e.team === 0 ? '#d0e4ff' : '#ffffff';
    if (e.kind === 'move' && !mine) return;
    this.feed.unshift({ text: e.text, t: this.time.now, color });
    this.feed = this.feed.slice(0, 7);
    if (e.big && !(e.kind === 'ult' && e.data?.id)) {
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
    if (p.state === 'dive') return { clip: 'dive', u: p.stateT / Math.max(0.1, p.stateDur) }; // loose-ball dive
    if (now < p.stunnedUntil && a && (a.name === 'stripped' || a.name === 'blockedLand')) return { clip: a.name, u: (now - a.start) / (a.dur ?? 1) };
    if (sim.inb?.inbounder === p && sim.inb.hasBall && len(p.vel) < 2) return { clip: 'inbound', u: now };
    // the fake picks up the dribble, so it must be checked before the dead-dribble hold
    if (p.state === 'dribbleMove' && a && (a.name === 'pumpfake' || a.name.startsWith('fake_'))) return { clip: CLIP[a.name] ? a.name : 'pumpfake', u: (now - a.start) / (a.dur ?? 0.42) }; // Dreamer fakes: their own clip
    if (hasBall && p.deadDribble && p.state !== 'shoot') return { clip: 'hold', u: now * 1.5 };
    if (a && a.name.startsWith('shot_')) {
      const clip = CLIP[a.name] ? a.name : SHOT_CLIP[a.name.slice(5)] ?? 'shot_jumper'; // dunk styles / windmill gathers by name
      const c = CLIP[clip];
      const inPost = a.release !== undefined && now >= a.release && (now - a.release < (c.post ?? 0.5) || p.z > 0.05);
      if (p.state === 'shoot' || inPost) return { clip, u: shotU(c, now, a.start, p.state === 'shoot' ? a.release : a.release) };
    }
    if (p.state === 'dribbleMove' && a?.name.startsWith('move_')) return { clip: CLIP[a.name] ? a.name : 'move_lateral', u: (now - a.start) / (a.dur ?? 0.35) };
    const post = this.postClip(p, hasBall);
    if (post) return post;
    if (now < p.bumpedUntil) return { clip: 'bumped', u: a?.name === 'bumped' ? bumpedU(now - a.start, a.dur ?? 0.5) : 0.5 };
    if (p.z <= 0.3 && now - p.fingerWagAt < 1.5 && now - p.fingerWagAt > 0.35) return { clip: 'fingerWag', u: (now - p.fingerWagAt - 0.35) / 1.15 }; // round 65
    if (a?.name === 'rebound' && now - a.start < 0.7) return { clip: 'rebound', u: (now - a.start) / 0.7 };
    if (a?.name === 'scoop' && now - a.start < (a.dur ?? 0.55)) return { clip: 'scoop', u: (now - a.start) / (a.dur ?? 0.55) };
    if (a?.name === 'reboundChest' && now - a.start < (a.dur ?? 0.35)) return { clip: 'catch', u: (now - a.start) / (a.dur ?? 0.35) };
    if (p.boxingOut) return { clip: now < p.leanedUntil ? 'boxoutPush' : 'boxout', u: now * 1.6 };
    if (p.state === 'stagger' || now < p.staggerUntil) return { clip: 'stagger', u: now * 2 };
    if (p.state === 'screen') return { clip: 'screen', u: p.stateT / 0.25 };
    if (p.state === 'charge') return { clip: 'charge', u: p.stateT / 0.2 };
    { const bsl = sim.ball.st; if (p.z > 0.3 && bsl.kind === 'pass' && bsl.oop && bsl.to === p) return { clip: 'oopReach', u: now * 2 }; } // up for the lob
    if (p.z > 0.3) return { clip: 'block', u: p.vz > 0 ? 0.4 * (1 - p.vz / p.jumpVel) : 0.4 + 0.6 * Math.min(1, -p.vz / p.jumpVel) };
    if (now < p.swipingUntil) return { clip: 'swipe', u: 1 - (p.swipingUntil - now) / 0.3 };
    // kicked out of the post: overhead outlet (picks up from the wind-up, the ball is already on its way)
    if (sim.lastPasser === p && sim.lastPostPassAt === sim.lastPassAt && now - sim.lastPassAt < 0.42) return { clip: 'postPass', u: 0.25 + 0.75 * (now - sim.lastPassAt) / 0.42 };
    if (sim.lastPasser === p && sim.lastLobAt === sim.lastPassAt && now - sim.lastPassAt < 0.4) return { clip: 'passLob', u: (now - sim.lastPassAt) / 0.4 }; // lob
    if (sim.lastPasser === p && now - sim.lastPassAt < 0.3) return { clip: sim.lastPassStyle === 'behindBack' || sim.lastPassStyle === 'wrap' ? 'passBehind' : 'pass', u: (now - sim.lastPassAt) / 0.3 };
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

  /** High IQ (Perimeter D perk): you're on defense and they're running a set -> the play and its target. */
  highIQ(): { play: string; target: Player | null } | null {
    const u = this.sim.user;
    if (!u || !this.sim.userOnCourt || u.team === this.sim.possession || u.mods.pAdd('highIQ') <= 0) return null;
    return this.sim.playTarget();
  }

  /**
   * Post up: the attacker backs down (bump / bumped back), his defender leans on him or is rocked back and held there
   * while stun-locked / sealed.
   */
  postClip(p: Player, hasBall: boolean): { clip: string; u: number } | null {
    const now = this.sim.time, a = p.anim;
    if (now < p.stunnedUntil && a?.name === 'postBumpedBack') return { clip: 'postBumpedBack', u: Math.min(1, (now - a.start) / 0.7) };
    if (now < p.postLockUntil || now < p.postSealUntil) {
      const e = a?.name === 'postBumped' ? now - a.start : 1;
      // rocked back fast, then held off balance (a little wobble) while locked
      return { clip: 'postBumped', u: e < 0.3 ? e / 0.3 * 0.85 : 0.85 + 0.15 * Math.abs(Math.sin(e * 6)) };
    }
    if (p.postedBy) return { clip: 'postDefend', u: now * 1.2 + (p.number * 0.137) % 1 };
    if (hasBall && (p.post || now < p.postWindowUntil)) {
      if (now - p.postBumpAt < 0.3) return { clip: 'postBump', u: (now - p.postBumpAt) / 0.3 };
      if (p.post) return { clip: 'postUp', u: now * 1.6 };
    }
    return null;
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
      const shotClip = ANGLED_SHOTS.has(clip);
      if (ANGLED.has(clip) || shotClip) {
        const v = shotClip ? this.shotViewFor(p, clip) : this.viewFor(p, clip);
        flip = v.flip;
        if (v.yaw !== 0) {
          const cache = this.angleCache(sh.key, p.height, p.appearance, this.kitFor(p));
          const ck = `${clip}|${fi}|${v.yaw}`, slot = cache.get(ck);
          if (slot) {
            texKey = angPage(sh.key, slot.page); frame = `s${slot.index}`; bo = slot.ball; behind = slot.ballBehind;
            if (shotClip) this.lastShotFrame.set(p.id, { clip, yaw: v.yaw, texKey, frame, bo, behind });
          } else {
            cache.request(ck, p === sim.user);
            // a shot frame that isn't drawn yet: hold his last drawn frame of this shot instead of flashing the side view
            const last = shotClip ? this.lastShotFrame.get(p.id) : undefined;
            if (last && last.clip === clip && last.yaw === v.yaw) ({ texKey, frame, bo, behind } = last);
          }
        }
      }
      if (s.texture.key !== texKey) s.setTexture(texKey, frame); else s.setFrame(frame);
      s.setPosition(sx(p.p.x), sy(p.p.y, p.z));
      s.setFlipX(flip);
      if (bo && (holder === p || p.state === 'shoot' || (sim.inb?.inbounder === p && sim.inb.hasBall))) this.heldBall = { x: s.x + (flip ? -bo[0] : bo[0]) * SPRITE_SCALE, y: s.y - bo[1] * SPRITE_SCALE, behind: behind ? sy(p.p.y) - 0.5 : undefined };
      s.setDepth(sy(p.p.y));
      // glossy hardwood: a faint, squashed, upside-down reflection under each player
      let r = this.reflections.get(p.id);
      if (!r) {
        r = this.add.sprite(0, 0, texKey, frame).setOrigin(CX / FRAME_W, (FRAME_H - FOOT_Y) / FRAME_H).setFlipY(true).setAlpha(0.1).setTint(0x6a4a2a).setDepth(-450);
        if (this.school === 'rain') r.setAlpha(0.2).setTint(0x9ab0d0); // wet asphalt: a cool, longer reflection
        this.reflections.set(p.id, r);
      }
      if (r.texture.key !== texKey) r.setTexture(texKey, frame); else r.setFrame(frame);
      r.setScale(SPRITE_SCALE, SPRITE_SCALE * (this.school === 'rain' ? 0.75 : 0.5)).setFlipX(flip).setPosition(s.x, sy(p.p.y) + p.z * S * (this.school === 'rain' ? 0.75 : 0.5))
        .setVisible(this.school !== 'day' && p.p.x > 0 && p.p.x < 94 && p.p.y > 0.5); // dry asphalt doesn't shine
      const ghost = sim.time < p.screenedUntil;
      s.setTint(ghost ? 0xb0b0ff : 0xffffff);
      this.shadows.fillStyle(0x000000, 0.28);
      this.shadows.fillEllipse(sx(p.p.x), sy(p.p.y), 32 - p.z * 2, 9);
    }

    this.pumpAngles();
    // round 55: ult aura + cinematic shade (lifts the ult player above it); the sound comes back when it ends
    this.ultFx.update(sim, this.sprites, this.time.now);
    if (this.cineWas && !this.ultFx.cineOn) sfx.duck(false);
    this.cineWas = this.ultFx.cineOn;

    // ball (behind the holder when an angled frame has it on the far side of the body)
    const b = sim.ball;
    const inHand = !!this.heldBall && (b.st.kind === 'held' || (b.st.kind === 'dead' && !!sim.inb?.hasBall));
    this.ballG.clear().setDepth(inHand && this.heldBall!.behind !== undefined ? this.heldBall!.behind : sy(b.p.y) + 1);
    if (this.ultFx.lifted.length) this.ballG.setDepth(LIFT_DEPTH + 3); // the ball stays lit in an ult cinematic
    const bx = inHand ? this.heldBall!.x : sx(b.p.x), by = inHand ? this.heldBall!.y : sy(b.p.y, b.z);
    this.shadows.fillStyle(0x000000, 0.3); this.shadows.fillEllipse(sx(b.p.x), sy(b.p.y), 16, 5);
    // round 64 Foresight: a ghost shadow where a missed shot / loose ball will come down
    const fu = sim.user;
    if (fu && (fu.mods.pAdd('foresight') > 0 || app.settings.debug.foresight)) {
      const fs = sim.foresightSpot();
      if (fs) {
        const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 140);
        this.shadows.fillStyle(0x000000, 0.22 + 0.12 * pulse); this.shadows.fillEllipse(sx(fs.x), sy(fs.y), 22 + pulse * 4, 7 + pulse);
        this.shadows.lineStyle(2, 0x9fe8ff, 0.55 + 0.35 * pulse); this.shadows.strokeEllipse(sx(fs.x), sy(fs.y), 30 + pulse * 4, 10 + pulse);
      }
    }
    // round 73 Gravity: a screen that pulls: rings on the floor closing in on the screener, and a tug line with
    // chevrons running in from each defender being pulled
    for (const p of sim.players) {
      if (p.state !== 'screen' || p.mods.pAdd('gravity') <= 0) continue;
      const cx = sx(p.p.x), cy = sy(p.p.y), rx = sx(p.p.x + GRAVITY.r) - cx, ry = sy(p.p.y + GRAVITY.r) - cy;
      const ph = (this.time.now / 900) % 1;
      this.shadows.fillStyle(0x7a3cff, 0.12); this.shadows.fillEllipse(cx, cy, rx * 2, ry * 2);
      for (let k = 0; k < 3; k++) {
        const f = 1 - ((ph + k / 3) % 1); // each ring shrinks from the edge to the screener
        this.shadows.lineStyle(3, 0xa070ff, 0.25 + 0.65 * (1 - f)); this.shadows.strokeEllipse(cx, cy, rx * 2 * f + 10, ry * 2 * f + 4);
      }
      this.shadows.lineStyle(2, 0xa070ff, 0.55); this.shadows.strokeEllipse(cx, cy, rx * 2, ry * 2);
      for (const d of sim.opp(p.team)) {
        const r = Math.hypot(d.p.x - p.p.x, d.p.y - p.p.y);
        if (r > GRAVITY.r || r <= GRAVITY.minD || d.z > 0) continue;
        const ax = sx(d.p.x), ay = sy(d.p.y);
        this.shadows.lineStyle(3, 0xa070ff, 0.7); this.shadows.lineBetween(ax, ay, cx, cy);
        const len = Math.hypot(cx - ax, cy - ay) || 1, ux = (cx - ax) / len, uy = (cy - ay) / len;
        for (let k = 0; k < 3; k++) {
          const t = ((ph * 2 + k / 3) % 1) * 0.85, mx = ax + (cx - ax) * t, my = ay + (cy - ay) * t;
          this.shadows.lineBetween(mx, my, mx - ux * 9 - uy * 7, my - uy * 9 + ux * 7);
          this.shadows.lineBetween(mx, my, mx - ux * 9 + uy * 7, my - uy * 9 - ux * 7);
        }
      }
    }
    this.ballG.fillStyle(0xe86a1c, 1); this.ballG.fillCircle(bx, by, 8);
    this.ballG.fillStyle(0xff9a4a, 1); this.ballG.fillRect(bx - 5, by - 6, 4, 3);
    this.ballG.lineStyle(1.5, 0x5a2a0a, 1); this.ballG.lineBetween(bx - 8, by, bx + 8, by); this.ballG.lineBetween(bx, by - 8, bx, by + 8);

    this.updateNets();
    this.crowd.clutch = sim.clutch;
    this.crowd.update(cam.scrollX, VIEW_W);
    if (!this.school) this.renderSideline();
    else this.renderSchool();
    for (const t of this.shotClockTexts) t.setText(String(Math.max(0, Math.ceil(sim.shotClock))));
    this.drawOverlays();
    this.drawHud();
    if (this.story?.cutscene) this.hideHud();
  }

  /** Round 80: a story cutscene on the court (Kingston at the school): no scoreboard, meter, shot line or buttons. */
  hideHud() {
    // no rings under the players, no P1 tag
    this.overlay.clear(); this.overlayTop.clear();
    for (const t of this.labelTexts) t.setVisible(false);
    for (const o of this.children.list as (Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Depth & Phaser.GameObjects.Components.Visible & { scrollFactorX?: number })[]) {
      if (o.scrollFactorX === 0 && o.depth >= 9000 && o.depth < 9200 && o.visible) o.setVisible(false);
    }
  }

  /** Round 56: the rainy night's live layers (made in create, never lazily): streaks over everything, splashes on the
   * asphalt, a lightning flash now and then. */
  buildRain() {
    this.rainG = this.add.graphics().setScrollFactor(0).setDepth(4450);
    this.splashG = this.add.graphics().setDepth(-380);
    this.flashRect = this.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W * 2, VIEW_H * 2, 0xdfe8ff, 1).setScrollFactor(0).setDepth(4440).setAlpha(0);
    this.drops = Array.from({ length: 150 }, () => ({ x: Math.random() * (VIEW_W + 200), y: Math.random() * VIEW_H, len: 10 + Math.random() * 14, sp: 900 + Math.random() * 500 }));
    this.nextLightning = this.time.now + 6000 + Math.random() * 8000;
  }
  /** Round 56: per frame at the school court, the flag waves (day), the rain falls (night). */
  renderSchool() {
    const now = this.time.now;
    if (this.flag) this.flag.setFrame(this.school === 'day' ? Math.floor(now / 160) % 4 : 0);
    if (!this.rainG || !this.splashG) return;
    const dt = Math.min(0.05, this.game.loop.delta / 1000), cam = this.cameras.main, g = this.rainG, sg = this.splashG;
    g.clear(); g.lineStyle(1.2, 0xb8c8e0, 0.45);
    for (const d of this.drops) {
      d.y += d.sp * dt; d.x -= d.sp * 0.22 * dt;
      if (d.y > VIEW_H || d.x < -20) {
        if (Math.random() < 0.6) this.splashes.push({ x: cam.scrollX + Math.random() * VIEW_W, y: FLOOR_TOP - 34 + Math.random() * 390, t: now });
        d.y = -d.len - Math.random() * 60; d.x = Math.random() * (VIEW_W + 200);
      }
      g.lineBetween(d.x, d.y, d.x + d.len * 0.22, d.y - d.len);
    }
    this.splashes = this.splashes.filter((p) => now - p.t < 180);
    sg.clear();
    for (const p of this.splashes) {
      const k = (now - p.t) / 180, w = 2 + k * 5;
      sg.lineStyle(1, 0xc8d6ec, 0.6 * (1 - k)); sg.lineBetween(p.x - w, p.y - 1 - k * 3, p.x - 1, p.y); sg.lineBetween(p.x + w, p.y - 1 - k * 3, p.x + 1, p.y);
    }
    if (this.flashRect && now >= this.nextLightning) {
      this.nextLightning = now + 9000 + Math.random() * 14000;
      this.tweens.killTweensOf(this.flashRect);
      this.flashRect.setAlpha(0.32);
      this.tweens.add({ targets: this.flashRect, alpha: 0, duration: 90, yoyo: true, repeat: 1, onComplete: () => { this.flashRect?.setAlpha(0.18); this.tweens.add({ targets: this.flashRect, alpha: 0, duration: 400 }); } });
    }
  }

  nets: NetHoop[] = [];
  netHits: { at: number; amp: number }[] = [];
  /** round 75: when the crunch-time hush started (ms, scene time) */
  hushAt = 0;
  /** Nets: bulge around the ball while it goes through, then stretch, snap back and sway. */
  updateNets() {
    const b = this.sim.ball, now = this.time.now;
    this.nets.forEach((n, i) => {
      let stretch = 0, sway = 0, bulge = 0, bulgeAt = 0.5;
      const inside = (b.st.kind === 'shot' || b.st.kind === 'dead') && Math.abs(sx(b.p.x) - n.rx) < n.rw * 1.3 && Math.abs(b.p.y - 25) < 1.4 && b.z > 7.9 && b.z < 10.1;
      if (inside) { bulge = 1; bulgeAt = Math.min(1, Math.max(0, (10 - b.z) / 1.5)); stretch = 0.25 + 0.5 * bulgeAt; }
      const h = this.netHits[i], e = (now - h.at) / 1000;
      if (e >= 0 && e < 1.6) {
        stretch = Math.max(stretch, h.amp * Math.exp(-e / 0.16) * (e < 0.06 ? e / 0.06 : 1));
        sway = h.amp * Math.sin(e * 17) * Math.exp(-e / 0.35);
      }
      drawNet(n, stretch, sway, bulge, bulgeAt);
    });
  }

  /** Scorer's table, officials, coaches and team benches along the far sideline. */
  buildSideline() {
    const sim = this.sim;
    const [t0, t1] = sim.teams;
    const g = this.add.graphics().setDepth(sy(-4.6));
    const x0 = sx(41), x1 = sx(53), yF = sy(-3.4), h = 2.6 * S;
    // broadcasters behind the table: suits and headsets, talking among themselves, not reacting to the game
    this.announcers = [];
    const arng = new Rng(sim.teams[0].def.seed * 53 + 11);
    const scouts = !!sim.cfg.scoutsOnly; // round 85: no broadcast, no coaches: scouts on both benches
    (scouts ? [] : [42.9, 47, 51.1]).forEach((ax, i) => {
      const look = randomAppearance(() => arng.next());
      Object.assign(look, { headband: null, goggles: false, mask: false, armSleeve: 'both', sleeveColor: '#22242e', wristband: null, hair: arng.pick(['buzz', 'fade', 'waves', 'bald', 'curly']) });
      const suitCol = ['#22242e', '#2d3140', '#3a2f2a'][i];
      const kit: Kit = { jersey: suitCol, jerseyShade: suitCol, trim: ['#8a1c2a', '#1d428a', '#2a5a3a'][i], shorts: suitCol, number: -1, pants: true };
      const key = `announcer_${hashStr(JSON.stringify([look, kit]))}_v${partsVersion()}`;
      if (!this.textures.exists(key)) { const tex = this.textures.addCanvas(key, buildAnnouncerSheet(6.3, look, kit))!; tex.add(0, 0, 0, 0, FRONT_W, FRONT_H); tex.add(1, 0, FRONT_W, 0, FRONT_W, FRONT_H); }
      const sprite = this.add.sprite(sx(ax), yF - 4, key, 0).setOrigin(0.5, 1).setScale(BENCH_SCALE * 0.98).setDepth(sy(-4.6) - 0.5);
      this.announcers.push({ sprite, phase: arng.next() * 10 });
    });
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
    // round 80: a high-school final in the arena has no NBA celebrities courtside
    const crng = new Rng(sim.teams[0].def.seed * 97 + 13);
    // a fixed cast (hand-editable in the pixel editor), seated in a different order each home arena
    const order = Array.from({ length: CELEB_CAST }, (_, i) => i).filter((i) => !RETIRED_CELEBS.includes(i)).sort(() => crng.next() - 0.5);
    // featured celebs always get a seat, a few seats in from the table
    for (const f of FEATURED_CELEBS) { order.splice(order.indexOf(f), 1); order.splice(Math.min(order.length, 3 + (crng.next() * 6 | 0)), 0, f); }
    let seat = 0;
    if (this.mode !== 'story' && !this.initData?.empty) for (const [a, b] of CELEB_X) for (let x = a; x <= b + 0.01; x += 1.65) {
      const ci = order[seat++ % order.length];
      const key = celebTexKey(ci);
      if (!this.textures.exists(key)) {
        let tex: Phaser.Textures.CanvasTexture | null = null;
        tex = this.textures.addCanvas(key, castSheet(ci, () => tex?.refresh()))!;
        for (let f = 0; f < CELEB_FRAMES; f++) tex.add(f, 0, f * CELEB_W, 0, CELEB_W, CELEB_H);
      }
      const sprite = this.add.sprite(sx(x), sy(-3.9), key, 0).setOrigin(0.5, 1).setScale(CELEB_SCALE).setDepth(sy(-3.9));
      this.celebs.push({ sprite, phase: crng.next() * 10, x, frame: 0, until: 0, glam: GLAM_CELEBS.includes(ci), cane: CANE_CELEBS.includes(ci), seq: null, nextSeqAt: this.time.now + 3000 + crng.next() * 9000 });
    }
    // round 85: the scouts, seated along both benches, in the home team's color
    if (scouts && !this.initData?.empty) {
      const col = sim.cfg.courtColors?.[0] ?? t0.def.colors[0];
      BENCH_X.forEach(([a, b], team) => { let i = team * 7; for (let x = a + 1; x <= b - 1; x += 2.4) this.add.sprite(sx(x), sy(-3.9), scoutTexture(this, i++ % 9, col, true), 0).setOrigin(0.5, 1).setScale(CELEB_SCALE).setDepth(sy(-3.9)); });
    }
    // round 80e: in the story final the starters' seats stay empty on the bench (the reserves sit by the assistants)
    if (this.mode === 'story' && !scouts) {
      if (!this.textures.exists('empty_chair_v1')) this.textures.addCanvas('empty_chair_v1', buildEmptyChair());
      for (const t of [0, 1] as const) for (const x of storyBenchSeats(t).empty) this.add.image(sx(x), sy(-3.9), 'empty_chair_v1').setOrigin(0.5, 1).setScale(BENCH_SCALE).setDepth(sy(-3.9) - 0.5);
    }
    // assistant coaches: two in suits at the end of each bench (toward midcourt)
    this.assistants = [];
    (scouts ? [] : [0, 1] as const).forEach((team) => {
      const def = sim.teams[team].def, rng = new Rng(def.seed * 17 + 3);
      (team === 0 ? [25.4, 27.6] : [67.4, 69.6]).forEach((ax) => {
        const look = randomAppearance(() => rng.next());
        Object.assign(look, { headband: null, goggles: false, mask: false, armSleeve: 'both', sleeveColor: '#1d1f2a', wristband: null, legSleeve: 'none', kneePad: false, hair: rng.pick(['bald', 'buzz', 'fade', 'waves', 'curly']) });
        const kit: Kit = { jersey: '#1d1f2a', jerseyShade: '#14161e', trim: def.colors[0], shorts: '#22242e', number: -1, pants: true };
        const key = `asst_${def.id}_${hashStr(JSON.stringify(look))}_v${partsVersion()}`;
        if (!this.textures.exists(key)) { const tex = this.textures.addCanvas(key, buildFrontSheet(6.25, look, kit))!; tex.add(0, 0, 0, 0, FRONT_W, FRONT_H); tex.add(1, 0, FRONT_W, 0, FRONT_W, FRONT_H); }
        const sprite = this.add.sprite(sx(ax), sy(-3.9), key, 0).setOrigin(0.5, 1).setScale(BENCH_SCALE).setDepth(sy(-3.9));
        this.assistants.push({ sprite, team, x: ax, phase: rng.next() * 10 });
      });
    });
    // coaches in suits
    this.coaches = [];
    (scouts ? [] : [0, 1] as const).forEach((team) => {
      const def = sim.teams[team].def;
      const rng = new Rng(def.seed * 31 + 7);
      const look = randomAppearance(() => rng.next());
      Object.assign(look, { armSleeve: 'both', sleeveColor: '#1d1f2a', wristband: null, legSleeve: 'none', kneePad: false, goggles: false, mask: false, headband: null, shoe: '#111111', shoeAccent: '#111111', socks: 'low', sockColor: '#111111', hair: rng.pick(['bald', 'buzz', 'fade', 'waves']) });
      const kit: Kit = { jersey: '#1d1f2a', jerseyShade: '#14161e', trim: def.colors[0], shorts: '#22242e', number: -1, pants: true };
      // facing the camera (front sheet built right here, like the bench), so they never flip around
      const key = `coachf_${def.id}_${hashStr(JSON.stringify(look))}_v${partsVersion()}`;
      if (!this.textures.exists(key)) {
        const tex = this.textures.addCanvas(key, buildCoachSheet(6.2, look, kit))!;
        for (let f = 0; f < COACH_FRAMES; f++) tex.add(f, 0, f * FRONT_W, 0, FRONT_W, FRONT_H);
      }
      const home = team === 0 ? 26.5 : 67.5;
      const sprite = this.add.sprite(sx(home), sy(-1.6), key, 0).setOrigin(0.5, 1).setScale(SPRITE_SCALE * 0.96).setDepth(sy(-1.6));
      const bubble = this.add.graphics().setDepth(5500).setVisible(false);
      const bubbleText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '15px', color: '#14121e', fontStyle: 'bold', align: 'center' }).setOrigin(0.5).setDepth(5501).setVisible(false);
      this.coaches.push({ team, sprite, bubble, bubbleText, home, x: home, callUntil: 0, cheerUntil: 0, phase: team * 2 });
    });
  }

  frontSprites = new Map<string, Phaser.GameObjects.Sprite>();
  celebs: { sprite: Phaser.GameObjects.Sprite; phase: number; x: number; frame: number; until: number; glam: boolean; cane: boolean; seq: { frames: number[]; ms: number[]; start: number } | null; nextSeqAt: number }[] = [];
  /** Front-facing sprite for a bench player (looks at the court). */
  frontSprite(p: Player): Phaser.GameObjects.Sprite {
    const kit = this.kitFor(p);
    const key = `front_${p.id}_${hashStr(JSON.stringify([p.appearance, p.height.toFixed(2), kit]))}_v${partsVersion()}`;
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
      const story = this.mode === 'story' ? storyBenchSeats(team).reserves : null; // round 80e
      bench.forEach((p, i) => {
        const fs = this.frontSprite(p);
        const cheering = now < this.benchCheerUntil[team];
        const bob = cheering ? -Math.abs(Math.sin(now / 140 + i)) * 4 : Math.sin(now / 900 + i) * 0.6;
        fs.setVisible(true).setPosition(sx(story?.[i] ?? start + i * 2.2), sy(-3.9) + bob).setDepth(sy(-3.9)).setFrame(cheering ? 1 : 0);
      });
    });
    for (const [id, fs] of this.frontSprites) fs.setVisible(fs.visible && !onCourt.has(id));
    for (const c of this.celebs) {
      // the cane man: one steady tap cycle (about one tap a second), whatever happens on the court
      if (c.cane) { const f = [0, 1, 2, 1][Math.floor((now + c.phase * 300) / 260) % 4]; c.frame = f; c.sprite.setFrame(f).setPosition(sx(c.x), sy(-3.9)); continue; }
      // wave / kiss sequences (glam celebs): play them out, then back to the usual idle
      if (c.glam && !c.seq && now > c.nextSeqAt && now > c.until) { c.seq = { ...(Math.sin(c.phase * 5 + now / 7000) > 0 ? WAVE : KISS), start: now }; c.nextSeqAt = now + 7000 + ((c.phase * 997 + now) % 8000); }
      if (c.seq) {
        let t = now - c.seq.start, f = -1;
        if (t >= 0) for (let i = 0; i < c.seq.frames.length; i++) { if (t < c.seq.ms[i]) { f = c.seq.frames[i]; break; } t -= c.seq.ms[i]; }
        if (f >= 0) { c.frame = f; c.sprite.setFrame(f).setPosition(sx(c.x), sy(-3.9)); continue; }
        if (now - c.seq.start > 0) c.seq = null;
      }
      if (now > c.until) {
        // idle: mostly seated, now and then someone films the action or checks the jumbotron
        const t = Math.sin(now / 1700 + c.phase * 3);
        c.frame = t > 0.93 ? 2 : 0;
      }
      const bob = c.frame === 1 ? -Math.abs(Math.sin(now / 150 + c.phase)) * 3 : 0;
      c.sprite.setFrame(c.frame).setPosition(sx(c.x), sy(-3.9) + bob);
    }
    // broadcasters chat in turns (never about the game: no reactions)
    for (const a of this.announcers) a.sprite.setFrame(Math.sin(now / 900 + a.phase * 2.3) > 0.35 && Math.sin(now / 130 + a.phase) > 0 ? 1 : 0);
    // assistant coaches sit with the bench and get up with it on big plays
    for (const a of this.assistants) {
      const cheering = now < this.benchCheerUntil[a.team];
      a.sprite.setFrame(cheering ? 1 : 0).setY(sy(-3.9) + (cheering ? -Math.abs(Math.sin(now / 150 + a.phase)) * 4 : Math.sin(now / 1100 + a.phase) * 0.5));
    }
    // coaches face the court: drift along their box, raise an arm and shout the play, celebrate big plays
    for (const c of this.coaches) {
      let frame = 0, bob = 0;
      if (now < c.callUntil) frame = 1;
      else if (now < c.cheerUntil) { frame = 2; bob = -Math.abs(Math.sin(now / 140)) * 4; }
      else {
        const target = c.home + Math.sin(now / 4200 + c.phase) * 2.5;
        const dx = target - c.x;
        const step = Math.min(Math.abs(dx), 0.6 / 60);
        if (Math.abs(dx) > 0.05) { c.x += Math.sign(dx) * step; bob = -Math.abs(Math.sin(now / 160)) * 1.5; }
      }
      c.sprite.setFrame(frame).setPosition(sx(c.x), sy(-1.6) + bob);
      // speech bubble with the play, fading out at the end
      const left = c.callUntil - now;
      const show = left > 0;
      c.bubble.setVisible(show); c.bubbleText.setVisible(show);
      if (show) {
        const a = Math.min(1, left / 400);
        const bx = sx(c.x), by = c.sprite.y - c.sprite.displayHeight - 14;
        c.bubbleText.setPosition(bx, by).setAlpha(a);
        c.bubble.setPosition(bx, by).setAlpha(a);
      }
    }
  }

  /** A coach calls a play: arm up and a speech bubble with its name for a couple of seconds. */
  coachCall(c: GameScene['coaches'][number], text: string) {
    c.callUntil = this.time.now + 2200;
    c.bubbleText.setText(text);
    const w = c.bubbleText.width + 20, h = c.bubbleText.height + 12;
    const g = c.bubble.clear();
    g.fillStyle(0x000000, 0.35); g.fillRoundedRect(-w / 2 + 2, -h / 2 + 3, w, h, 8);
    g.fillStyle(0xffffff, 1); g.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    g.fillTriangle(-6, h / 2 - 1, 6, h / 2 - 1, 0, h / 2 + 10); // tail down to the coach
    g.lineStyle(2, 0x14121e, 1); g.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    g.lineBetween(-6, h / 2, 0, h / 2 + 10); g.lineBetween(6, h / 2, 0, h / 2 + 10);
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
        // beyond your safe passing range: the badge flashes red
        const unsafe = !!u && !sim.passSafety(u, m).ok, flash = unsafe && Math.floor(this.time.now / 160) % 2 === 0;
        gt.fillStyle(flash ? 0x7a0000 : 0x000000, 0.75); gt.fillCircle(x, y, 15);
        gt.lineStyle(3, unsafe ? 0xff2a2a : GL[t.btn][1], 1); gt.strokeCircle(x, y, 15);
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
        // owner: no CPU level tag over his head, only a human P2 gets a tag
        if (sim.user2) this.label(sx(p2.p.x), sy(p2.p.y, p2.z + p2.height + 1.0) - 14, 'P2', '#ff9f6a', 14);
      }
      if (u) this.label(sx(u.p.x), sy(u.p.y, u.z + u.height + 1.0) - 22, 'P1', '#7dffb8', 14);
      // round 61 dev: what each CPU is reading and why he shot
      if (dbg.aiThoughts) for (const p of sim.players) {
        if (!sim.cpuLevel(p) || !p.aiNote || sim.time - p.aiNoteAt > 3) continue;
        this.label(sx(p.p.x), sy(p.p.y, p.z + p.height + 1.0) - 36, p.aiNote, '#ffe9a8', 12);
        const t = this.labelTexts[this.labelTexts.length - 1], vw = this.cameras.main.worldView;
        t.x = Phaser.Math.Clamp(t.x, vw.x + t.width / 2 + 6, vw.right - t.width / 2 - 6); // keep the whole line on screen
      }
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
        const l = rot(-coneHalf(type)), r = rot(coneHalf(type));
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
      // round 53: a switch (fast-break cross-match, screen switch, scramble) flashes the circle and names your new man
      const sw = Math.max(0, 1 - (this.time.now - this.switchFlash.at) / 1400);
      if (m) {
        g.lineStyle(2 + 3 * sw, sw > 0 ? 0xffe060 : 0xff5050, 0.9); g.strokeEllipse(sx(m.p.x), sy(m.p.y), (2.6 + sw) * S, (2.6 + sw) * D);
        if (dist(m.p, u.p) > 8 || sw > 0) { g.lineStyle(1 + sw * 2, sw > 0 ? 0xffe060 : 0xff5050, 0.4 + 0.5 * sw); g.lineBetween(sx(u.p.x), sy(u.p.y), sx(m.p.x), sy(m.p.y)); }
        if (sw > 0) this.label(sx(m.p.x), sy(m.p.y, m.height + 2.4), `SWITCH → ${this.switchFlash.name}`, '#ffe060', 16);
      }
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
        const ptype = sim.preview?.type ?? 'three';
        // ease the cone toward its new size (it visibly shrinks when you pull back for a Fade Away, ~0.2 s)
        const k = Math.min(1, (this.game.loop.delta / 1000) * 12);
        this.coneL += (contestReach(ptype) - this.coneL) * k; this.coneHalfNow += (coneHalf(ptype) - this.coneHalfNow) * k;
        const L = this.coneL;
        const rot = (a: number) => ({ x: dir.x * Math.cos(a) - dir.y * Math.sin(a), y: dir.x * Math.sin(a) + dir.y * Math.cos(a) });
        const l = rot(-this.coneHalfNow), r = rot(this.coneHalfNow);
        const c = sim.preview?.contest ?? 0;
        const col = c > 0.35 ? 0xff4040 : c > 0.15 ? 0xffb030 : 0x40ff70;
        g.fillStyle(col, 0.18); g.lineStyle(1, col, 0.6);
        const pts = [new Phaser.Math.Vector2(sx(u.p.x), sy(u.p.y)), new Phaser.Math.Vector2(sx(u.p.x + l.x * L), sy(u.p.y + l.y * L)), new Phaser.Math.Vector2(sx(u.p.x + r.x * L), sy(u.p.y + r.y * L))];
        g.fillPoints(pts, true); g.strokePoints(pts, true);
      }
      // Floor General lanes (perk) or debug lanes
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
        // out of your safe passing range: the dot flashes red
        const unsafe = !sim.passSafety(u, t).ok, flash = unsafe && Math.floor(this.time.now / 160) % 2 === 0;
        gt.fillStyle(0x000000, 0.6); gt.fillCircle(px, py, unsafe ? 11 : 9);
        gt.fillStyle(unsafe ? (flash ? 0xff1a1a : 0x8a0000) : 0xffe600, 1); gt.fillCircle(px, py, unsafe ? 8 : 6);
        // a good alley-oop target: hold △ to lob it
        if (sim.lobTarget(u, t)) this.label(px, py - 20, 'LOB', '#ffe14d', 13);
      }
    }
    // post up: your battle over your head (mode + post vs post D), "SHOOT" in the window; post debug: everyone's
    const pnow = sim.time;
    for (const p of sim.players) {
      const mine = p === u;
      if (!mine && !dbg.post) continue;
      const y = sy(p.p.y, p.z + p.height + 1.0) - (mine ? 34 : 18);
      if (p.post) {
        const md = p.post.mode, def = sim.players.find((q) => q.id === p.post!.defId);
        const col = md === 'stronger' ? '#7dff9a' : md === 'even' ? '#ffe680' : '#ff8a8a';
        this.label(sx(p.p.x), y, def ? `POST · ${md.toUpperCase()} ${p.sub.post.toFixed(0)} vs ${def.sub.postD.toFixed(0)}` : 'POST', col, mine ? 15 : 12);
      } else if (pnow < p.postWindowUntil && sim.holder() === p) this.label(sx(p.p.x), y, 'SHOOT!', '#ffe14d', mine ? 16 : 12);
      if (dbg.post && (pnow < p.postLockUntil || pnow < p.postSealUntil || p.postedBy)) {
        const txt = pnow < p.postLockUntil ? `LOCKED ${(p.postLockUntil - pnow).toFixed(1)}s` : pnow < p.postSealUntil ? 'SEALED' : 'LEANED ON';
        this.label(sx(p.p.x), sy(p.p.y) + 16, txt, '#ff9f6a', 12); // at his feet (clear of the post label above)
      }
    }
    // alley-oop: a ring where the lob comes down, closing in as it drops (bright when it's to you: ✕ to go up)
    { const bl = sim.ball.st;
      if (bl.kind === 'pass' && bl.oop) {
        const k = Math.min(1, bl.t / bl.dur), mine = bl.to === u;
        const rx = sx(bl.b.x), ry = sy(bl.b.y), rr = 1 + 2.2 * (1 - k);
        gt.lineStyle(mine ? 3 : 2, mine ? 0xffe14d : 0xffffff, mine ? 0.95 : 0.5); gt.strokeEllipse(rx, ry, 2.4 * S * rr, 2.4 * D * rr);
        gt.lineStyle(1, mine ? 0xffe14d : 0xffffff, 0.6); gt.strokeEllipse(rx, ry, 2.4 * S, 2.4 * D);
        if (mine && u!.z === 0) this.label(rx, ry + 18, '✕ GO UP', '#ffe14d', 14);
      } }
    // High IQ: a pulsing marker over the player their set is for
    const iqr = this.highIQ();
    if (iqr?.target) {
      const t = iqr.target, cx = sx(t.p.x), cy = sy(t.p.y, t.z + t.height + 2.2) - 10, pulse = 1 + 0.15 * Math.sin(this.time.now / 140);
      gt.fillStyle(0xff3355, 0.9); gt.lineStyle(2, 0x000000, 0.8);
      const r = 14 * pulse;
      gt.fillTriangle(cx - r, cy - r * 1.2, cx + r, cy - r * 1.2, cx, cy + r * 0.4); gt.strokeTriangle(cx - r, cy - r * 1.2, cx + r, cy - r * 1.2, cx, cy + r * 0.4);
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

  /** Floating reward text that rises and fades above a player (your rebounds). */
  popText(p: Player | null | undefined, text: string, color: string) {
    if (!p) return;
    const t = this.add.text(sx(p.p.x), sy(p.p.y, p.z + p.height + 1.4), text, { fontFamily: FONT, fontSize: '22px', color, fontStyle: 'bold', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5).setDepth(6500);
    this.tweens.add({ targets: t, y: t.y - 46, duration: 1100, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, delay: 650, duration: 450, onComplete: () => t.destroy() });
    this.tweens.add({ targets: t, scale: { from: 0.6, to: 1 }, duration: 180, ease: 'Back.easeOut' });
  }

  /** Top-left box score: your name and your three most valuable stats. */
  boxTiles: { val: Phaser.GameObjects.Text; lbl: Phaser.GameObjects.Text }[] = [];
  boxName!: Phaser.GameObjects.Text;
  boxFg!: Phaser.GameObjects.Text;
  boxLast = new Map<string, number>();
  boxFlash = new Map<string, number>();
  makeBoxScore() {
    const fixed = <T extends Phaser.GameObjects.Components.ScrollFactor>(o: T) => { o.setScrollFactor(0); return o; };
    // header: name on the left, FG on its own right-aligned text, both centered on the gold stripe
    this.boxName = fixed(this.add.text(BOX_X + 7, 144, '', { fontFamily: FONT, fontSize: '12px', color: '#14121e', fontStyle: 'bold' }).setOrigin(0, 0.5).setDepth(9001));
    this.boxFg = fixed(this.add.text(0, 144, '', { fontFamily: FONT, fontSize: '12px', color: '#14121e', fontStyle: 'bold' }).setOrigin(1, 0.5).setDepth(9001));
    this.boxTiles = [0, 1, 2].map((i) => ({
      val: fixed(this.add.text(BOX_X + 33 + i * BOX_TILE, 178, '', { fontFamily: FONT, fontSize: '26px', color: '#ffffff', fontStyle: 'bold', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(9001)),
      lbl: fixed(this.add.text(BOX_X + 33 + i * BOX_TILE, 200, '', { fontFamily: FONT, fontSize: '11px', color: '#9fb0e0', fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(9001)),
    }));
  }
  drawBoxScore() {
    const sim = this.sim, u = sim.user, h = this.hud, now = this.time.now;
    const show = !!u && (sim.userOnCourt || sim.cfg.mode === 'practice');
    this.boxName.setVisible(show); this.boxFg.setVisible(show); for (const t of this.boxTiles) { t.val.setVisible(show); t.lbl.setVisible(show); }
    if (!show || !u) return;
    const top = topStats(u.box);
    for (const s of top) {
      const prev = this.boxLast.get(s.key);
      if (prev !== undefined && s.value > prev) this.boxFlash.set(s.key, now);
      this.boxLast.set(s.key, s.value);
    }
    // panel: gold header stripe with your name and FG, three tiles; it widens if the FG needs the room
    this.boxFg.setText(`${u.box.fgm}/${u.box.fga} FG`);
    const y0 = 134, w = Math.max(BOX_TILE * 3 + 6, this.boxFg.width + 70);
    this.boxFg.setX(BOX_X + w - 7);
    const room = w - 14 - this.boxFg.width - 10;
    const full = u.name.toUpperCase(), parts = full.split(' ');
    let name = full;
    this.boxName.setText(name);
    if (this.boxName.width > room && parts.length > 1) { name = `${parts[0][0]}. ${parts.slice(1).join(' ')}`; this.boxName.setText(name); }
    while (this.boxName.width > room && name.length > 3) { name = name.slice(0, -2) + '…'; this.boxName.setText(name); }
    h.fillStyle(0x000000, 0.45); h.fillRoundedRect(BOX_X + 2, y0 + 3, w, 86, 6);
    h.fillStyle(0x121633, 0.95); h.fillRoundedRect(BOX_X, y0, w, 86, 6);
    h.fillStyle(0xffcc33, 1); h.fillRoundedRect(BOX_X, y0, w, 20, { tl: 6, tr: 6, bl: 0, br: 0 });
    top.forEach((s, i) => {
      const x = BOX_X + 4 + i * BOX_TILE, flash = Math.max(0, 1 - (now - (this.boxFlash.get(s.key) ?? -9999)) / 600);
      h.fillStyle(i === 0 ? 0x22305e : 0x1a2246, 1); h.fillRoundedRect(x, y0 + 24, BOX_TILE - 4, 58, 5);
      if (flash > 0) { h.fillStyle(0xffd84a, 0.55 * flash); h.fillRoundedRect(x, y0 + 24, BOX_TILE - 4, 58, 5); }
      this.boxTiles[i].val.setText(String(s.value)).setScale(1 + 0.25 * flash).setColor(flash > 0.3 ? '#ffe680' : '#ffffff');
      this.boxTiles[i].lbl.setText(s.label);
    });
  }

  /** Round 53: the deep purple rhythm skill card (like the garage skill cards): icon + big number on top, RHY + pill bar. */
  static RHY = { base: 0x4a1d7a, edge: 0x9a6ae0, dark: 0x2e1050, fill: 0xb88aff, fill2: 0xe2ccff, track: 0x1c0a33, outline: 0x140a22 };
  static RHY_CARD = { x: VIEW_W / 2 - 150, y: 4, w: 300, h: 54, top: 31 };
  drawRhythm(u: Player) {
    const h = this.hud, sim = this.sim, r = u.rhythm / 100, K = GameScene.RHY, { x: x0, y: y0, w, h: ht, top } = GameScene.RHY_CARD;
    const used = (sim.ultsUsed[u.id] ?? 0) >= 1, hasUlt = !!sim.ultOf(u);
    const ready = r >= 1 && hasUlt && !used;
    const flash = Math.max(0, 1 - (this.time.now - this.rhythmFlash.at) / 500);
    const pulse = ready ? 0.5 + 0.5 * Math.sin(this.time.now / 140) : 0;
    const gold = (c: number) => { if (!ready) return c; const m = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(c), Phaser.Display.Color.ValueToColor(0xffd84a), 100, Math.round(pulse * 100)); return Phaser.Display.Color.GetColor(m.r, m.g, m.b); };
    // card: dark outline, coloured edge, base top with a highlight, divider, darker bottom strip
    h.fillStyle(K.outline, 1).fillRoundedRect(x0 - 2, y0 - 2, w + 4, ht + 4, 8);
    h.fillStyle(gold(K.edge), 1).fillRoundedRect(x0, y0, w, ht, 7);
    h.fillStyle(K.base, 1).fillRoundedRect(x0 + 2, y0 + 2, w - 4, top - 2, { tl: 6, tr: 6, bl: 0, br: 0 });
    h.fillStyle(0xffffff, 0.14).fillRect(x0 + 5, y0 + 3.5, w - 10, 2);
    h.fillStyle(gold(K.edge), 1).fillRect(x0 + 2, y0 + top, w - 4, 2);
    h.fillStyle(K.dark, 1).fillRoundedRect(x0 + 2, y0 + top + 2, w - 4, ht - top - 4, { tl: 0, tr: 0, bl: 6, br: 6 });
    if (flash > 0) h.fillStyle(this.rhythmFlash.color, 0.45 * flash).fillRoundedRect(x0 + 2, y0 + 2, w - 4, ht - 4, 6);
    // top: icon, the big number, notch diamonds + status on the right
    const midT = y0 + 1 + top / 2;
    this.rhythmIcon.setVisible(true).setPosition(x0 + 8, midT);
    this.rhythmNum.setVisible(true).setPosition(x0 + 36, midT + 1).setText(String(Math.floor(u.rhythm))).setColor(ready ? '#ffe680' : '#ffffff');
    const notch = [0.25, 0.5, 0.75].filter((n) => r >= n).length;
    this.rhythmText.setVisible(true).setPosition(x0 + w - 10, midT + 1).setText(`${'◆'.repeat(notch)}${'◇'.repeat(3 - notch)}  ${ready ? 'ULT READY · □' : used ? 'ult used' : 'RHYTHM'}`)
      .setColor(ready ? '#ffe680' : used ? '#a89ac0' : '#ecdcff');
    // bottom: RHY tag + pill bar (dark track, lilac fill, highlight line) with notch ticks
    const midB = y0 + top + 2 + (ht - top - 4) / 2;
    this.rhythmTag.setVisible(true).setPosition(x0 + 9, midB);
    const bx = x0 + 38, bh = 9, by = midB - bh / 2, bw = w - 50;
    h.fillStyle(K.outline, 1).fillRoundedRect(bx - 1.5, by - 1.5, bw + 3, bh + 3, bh / 2 + 1.5);
    h.fillStyle(K.track, 1).fillRoundedRect(bx, by, bw, bh, bh / 2);
    if (r > 0.005) {
      const col = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(K.fill), Phaser.Display.Color.ValueToColor(K.fill2), 100, Math.round(r * 100));
      h.fillStyle(gold(Phaser.Display.Color.GetColor(col.r, col.g, col.b)), 1).fillRoundedRect(bx, by, Math.max(bh, bw * r), bh, bh / 2);
      h.fillStyle(0xffffff, 0.4).fillRect(bx + 4, by + 1.5, Math.max(0, bw * r - 8), 1.5);
    }
    [0.25, 0.5, 0.75].forEach((n) => { h.fillStyle(r >= n ? 0xf0e0ff : 0x6a4a9a, 1).fillRect(bx + bw * n - 1, by - 3, 2, bh + 6); });
  }
  hideRhythm() { for (const o of [this.rhythmText, this.rhythmNum, this.rhythmTag, this.rhythmIcon]) o.setVisible(false); }
  /** When each on-screen rhythm pop ends (stacks new pops below live ones). */
  popEnds: number[] = [];
  /**
   * A rhythm change for you, below the top bars (round 54: held ~3.5 s). Scoring pops are two lines: the gain and the
   * method, then the math with the move's status in its own colour, `FRESH MOVE ×1.00` (green) or
   * `×0.36 STALE, 3rd time tonight` (orange). Flat gains / losses are one line ("+4 assist", "−6 turnover").
   */
  rhythmPop(amount: number, why: string, d: { base?: string; times?: number; decay?: number } = {}) {
    const u = this.sim.user; if (!u || app.settings.debug.equation || Math.abs(amount) < 0.5) return;
    const good = amount > 0, now = this.time.now, HOLD = 2000, FADE = 1500;
    this.popEnds = this.popEnds.filter((t) => t > now);
    const y = (this.iqText.text ? 118 : 96) + this.popEnds.length * 46;
    this.popEnds.push(now + HOLD + FADE);
    const st = (size: number, color: string) => ({ fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold', stroke: '#000', strokeThickness: 4 });
    const amt = `${good ? '+' : '−'}${Math.abs(amount).toFixed(0)}`;
    const parts: Phaser.GameObjects.Text[] = [];
    const head = this.add.text(0, 0, d.base ? `${amt} RHYTHM · ${why}` : `${amt}${why ? ` ${why}` : ''}`, st(16, good ? '#bff58a' : '#ff8a7a')).setOrigin(0.5, 0);
    parts.push(head);
    if (d.base) {
      const times = d.times ?? 0, ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
      const base = this.add.text(0, 21, `${d.base}  `, st(14, '#ffffff')).setOrigin(0, 0);
      const tag = times > 0
        ? this.add.text(0, 21, `×${(d.decay ?? 1).toFixed(2)} STALE, ${ord(times + 1)} time tonight`, st(14, '#ffa040')).setOrigin(0, 0)
        : this.add.text(0, 21, 'FRESH MOVE ×1.00', st(14, '#7dff9a')).setOrigin(0, 0);
      const w = base.width + tag.width;
      base.setX(-w / 2); tag.setX(-w / 2 + base.width);
      parts.push(base, tag);
    }
    const c = this.add.container(VIEW_W / 2, y, parts).setScrollFactor(0).setDepth(9003);
    this.tweens.add({ targets: c, y: y + 14, alpha: { from: 1, to: 0 }, delay: HOLD, duration: FADE, ease: 'Sine.easeIn', onComplete: () => c.destroy() });
    if (!good) this.rhythmFlash = { at: now, color: 0xff4a3a };
  }

  drawHud() {
    const sim = this.sim, h = this.hud;
    h.clear();
    h.fillStyle(0x000000, 0.72); h.fillRect(0, 0, VIEW_W, 60);
    // equation: live preview while you have the ball, else the last shot
    const prev = sim.preview;
    const ls = sim.lastShot;
    const showEq = !!app.settings.debug.equation;
    let eq = '';
    if (prev && showEq) eq = `SHOT CHANCE  ${fmtEq(prev)}`;
    else if (ls && sim.time - ls.at < 4 && showEq) eq = `${ls.user ? 'YOUR SHOT' : ls.name}: ${fmtEq(ls.ev)}  →  ${ls.blocked ? 'BLOCKED' : ls.made ? 'MADE' : 'MISSED'}`;
    else if (sim.cfg.oneOnOne) eq = 'MAKE IT, TAKE IT: score and you keep it; stops and defensive boards check it back up top.  Pump fake = tap ✕';
    else if (sim.cfg.halfCourt && !sim.live) eq = 'HALF COURT 3v3: after every score, stop or dead ball the team with the ball checks it up top.';
    else eq = sim.userOnCourt ? (sim.user!.team === sim.possession ? 'Get open. Run your assignment. △ = call for the ball (teammates decide based on trust).' : 'Defense: ✕ = block/contest  △ = swipe/deflect  ○ = take a charge') : '';
    // round 51: without the dev equation the top bar is the rhythm meter, with the short hints on the left
    this.eqText.setWordWrapWidth(showEq || !sim.user ? VIEW_W - 24 : VIEW_W / 2 - 236).setFontSize(showEq || !sim.user ? 15 : 12).setText(eq);
    if (!showEq && sim.user) this.drawRhythm(sim.user); else this.hideRhythm();
    // round 53: the short shot chance, top right (always on; the full equation is the dev toggle)
    const lsU = ls && ls.user && sim.time - ls.at < 3 ? ls : null;
    const short = showEq ? null : prev ? { ev: prev, tail: '' } : lsU ? { ev: lsU.ev, tail: lsU.blocked ? '  ✗ BLK' : lsU.made ? '  ✓' : '  ✗' } : null;
    if (this.story?.shotExample) this.shotText.setText('3PT 37 ×.85 ×.67 = 21%').setColor('#ff8a7a'); // tutorial: what the number looks like
    else if (short) { const f = fmtShort(short.ev); this.shotText.setText(f.text + short.tail).setColor(f.color); } else this.shotText.setText('');
    // High IQ (Perimeter D): on defense, read their set and who it's for
    const iq = this.highIQ();
    this.iqText.setText(iq ? `HIGH IQ · ${iq.play}${iq.target ? `  →  for ${iq.target.name}` : ''}` : '');

    const [a, b] = sim.teams;
    const clock = sim.cfg.mode === 'practice' ? 'PRACTICE' : `${sim.periodLabel()} ${Math.floor(Math.max(0, sim.clock) / 60)}:${String(Math.floor(Math.max(0, sim.clock) % 60)).padStart(2, '0')}`;
    const o = sim.cfg.oneOnOne;
    if (o) {
      const n0 = a.onCourt[0]?.name ?? a.def.id, n1 = b.onCourt[0]?.name ?? b.def.id;
      const ball = sim.possession === 0 ? '● ' : '  ', ball1 = sim.possession === 1 ? ' ●' : '  ';
      this.scoreText.setText(`${ball}${n0} ${a.score}  –  ${b.score} ${n1}${ball1}    to ${o.target}${o.winBy2 ? ' (win by 2)' : ''} · ${o.scoring === '1s2s' ? '1s & 2s' : '2s & 3s'}    SHOT ${Math.max(0, Math.ceil(sim.shotClock))}`);
    } else {
      // 8-second count in its last 3 seconds; PRESS while a team is pressing full court
      const eight = sim.fullCourt && sim.live && !sim.crossed && sim.backcourtT > 5 ? `    8 SEC ${Math.max(0, Math.ceil(8 - sim.backcourtT))}` : '';
      const press = sim.pressing[0] || sim.pressing[1] ? `    ${sim.pressing[0] ? a.def.id : b.def.id} PRESS` : '';
      this.scoreText.setText(`${a.def.id} ${a.score}  –  ${b.score} ${b.def.id}    ${clock}    SHOT ${Math.max(0, Math.ceil(sim.shotClock))}${eight}${press}`);
    }
    h.fillStyle(0x000000, 0.55); h.fillRect(0, 60, Math.max(560, this.scoreText.width + 24), 32);

    const asg = sim.userAssignment();
    const playName = sim.runner.play ? sim.runner.play.name : '';
    const forYou = sim.runner.focusPid && sim.runner.focusPid === sim.user?.id;
    // lob sets: when you have the ball in the lob phase, the hint names the lob man
    const lobRole = sim.runner.cur?.lob, lobMan = lobRole && sim.user && sim.holder() === sim.user ? sim.byPlayRole(sim.possession, lobRole) : null;
    const lobHint = lobMan && lobMan !== sim.user ? `   ·   hold △ = LOB to ${lobMan.name}` : '';
    this.playText.setText(playName ? `PLAY: ${playName}${forYou ? ' (for YOU)' : ''}${asg ? `  ·  YOU: ${asg.act.toUpperCase()}` : ''}${lobHint}` : '');

    // trust bars (top left, under the score)
    const tr = sim.trust;
    this.trustText.setText(o ? '' : `TEAM  ${tr.team.toFixed(0)}\nCOACH ${tr.coach.toFixed(0)}`);
    if (!o) {
      h.fillStyle(0x000000, 0.5); h.fillRect(0, 92, 200, 38);
      h.fillStyle(0x223344, 1); h.fillRect(92, 98, 100, 9); h.fillRect(92, 114, 100, 9);
      h.fillStyle(0x4fc3ff, 1); h.fillRect(92, 98, tr.team, 9);
      h.fillStyle(0xffc34f, 1); h.fillRect(92, 114, tr.coach, 9);
    }
    this.drawBoxScore();
    // ultimate name (the charge ring lives on the □ button)
    const st = sim.ult.state;
    const uu = sim.user;
    const ultUsed = !!uu && (sim.ultsUsed[uu.id] ?? 0) >= 1, ultReady = !!uu && !ultUsed && uu.rhythm >= 100;
    this.ultText.setText(st.unlocked && st.id && uu ? `${ULTIMATES[st.id].name} · ${ultLevelName(st)}${ultUsed ? '  (used)' : ultReady ? '  READY!' : ''}` : '').setColor(ultReady ? '#ffdd33' : ultUsed ? '#9aa0b0' : '#ffffff');
    this.ctrl.update(sim, this.input2, sim.user ? (this.sheets.get(sim.user.id) ?? null) : null);

    // feed
    const now = this.time.now;
    this.feedText.setText(this.feed.filter((f) => now - f.t < 6000).map((f) => f.text).join('\n'));

    // bench
    if (!sim.userOnCourt && sim.cfg.mode === 'game' && !sim.over) {
      const plan = sim.cfg.rotation;
      const next = plan?.stints.find(([s]) => s > sim.elapsed);
      const q = next ? Math.floor(next[0] / sim.cfg.quarterLen) + 1 : null;
      this.benchText.setVisible(true).setText(`ON THE BENCH  (${plan?.role ?? ''})\nCoach trust ${sim.trust.coach.toFixed(0)}. Earn minutes with good basketball\n${q ? `Coach plans to sub you in during Q${Math.min(4, q)}` : 'No more minutes planned tonight'}\n\nSimulating at ${app.settings.benchSpeed}x`);
    } else this.benchText.setVisible(false);

  }
}

/** Merge this frame's input with presses not yet consumed by a sim step. */
function latch(prev: UserInput | null, cur: UserInput): UserInput {
  if (!prev) return cur;
  return { ...cur, sprint: cur.sprint || prev.sprint, a: cur.a || prev.a, b: cur.b || prev.b, x: cur.x || prev.x, y: cur.y || prev.y };
}
const clearEdges = (i: UserInput): UserInput => ({ ...i, sprint: false, a: false, b: false, x: false, y: false });

/** Round 53: the shot chance in few characters, `3PT 38 ×1.1 ×.62 = 26%` (multipliers ≈1 dropped, perks folded). */
const SHORT_TYPE: Record<string, string> = { mid: 'MID', three: '3PT', deep3: 'DEEP', fade: 'FADE', floater: 'FLT', hook: 'HOOK', layup: 'LAY', dunk: 'DUNK', euro: 'EURO', push: 'PUSH', alleyOop: 'OOP', alleyOopLayup: 'OOP', stepThrough: 'STEP', stepThroughJumper: 'STEP', jelly: 'JELLY' };
export function fmtShort(e: import('../sim/shooting').ShotEval): { text: string; color: string } {
  const base = e.terms.find((t) => t.kind === 'base');
  const m = (x: number) => (x >= 1 ? x.toFixed(2).replace(/0$/, '') : x.toFixed(2).replace(/^0/, '').replace(/0$/, ''));
  let perk = 1; const parts: string[] = [];
  for (const t of e.terms) {
    if (t.kind === 'base') continue;
    if (t.kind === 'perk' || t.kind === 'ult') { perk *= t.value; continue; }
    if (Math.abs(t.value - 1) > 0.02) parts.push(`×${m(t.value)}`);
  }
  if (Math.abs(perk - 1) > 0.02) parts.push(`×${m(perk)}`);
  const pct = Math.round(e.pct * 100);
  return { text: `${SHORT_TYPE[e.type] ?? e.type.toUpperCase()} ${base ? Math.round(base.value * 100) : ''} ${parts.join(' ')} = ${pct}%`.replace(/  +/g, ' '), color: pct >= 45 ? '#8aff8a' : pct >= 30 ? '#ffe680' : '#ff8a7a' };
}

function fmtEq(e: import('../sim/shooting').ShotEval): string {
  return e.terms.map((t) => (t.kind === 'base' ? `${(t.value * 100).toFixed(0)}% ${t.label}` : `× ${t.value.toFixed(2)} ${t.label}`)).join('  ') + `  =  ${(e.pct * 100).toFixed(1)}%  (${e.pts}PT)`;
}
void D;


