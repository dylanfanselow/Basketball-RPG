import Phaser from 'phaser';
import { GameSim, GameEvent } from '../sim/game';
import { Player } from '../sim/player';
import { InputMapper } from '../input/input';
import { app } from '../state';
import { createSim, Mode } from './setup';
import { S, D, sx, sy, drawCourt, drawHoops, WORLD_W, VIEW_W, VIEW_H } from '../render/view';
import { buildSheet, Sheet, Kit, shade, FRAME_W, FRAME_H, CX, FOOT_Y, PIXEL, frameRect } from '../render/sprites';
import { CLIP, SHOT_CLIP, frameAt, shotU } from '../render/anim';
import { sfx } from '../audio/sfx';
import { rimPos } from '../sim/court';
import { CONE_HALF, contestReach } from '../sim/shooting';
import { Crowd } from '../render/crowd';
import { randomAppearance } from '../render/appearance';
import { Rng } from '../sim/math';
import { norm, sub, dist, len, segDist } from '../sim/math';
import { ULTIMATES } from '../sim/data';
import { ultLevelName } from '../sim/ultimates';

const FONT = '"Courier New", monospace';
const SHEET_CACHE = new Map<string, Sheet>();

export class GameScene extends Phaser.Scene {
  sim!: GameSim;
  mode: Mode = 'practice';
  input2!: InputMapper;
  sprites = new Map<string, Phaser.GameObjects.Sprite>();
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
  helpText!: Phaser.GameObjects.Text;
  bigText!: Phaser.GameObjects.Text;
  labelTexts: Phaser.GameObjects.Text[] = [];
  feed: { text: string; t: number; color: string }[] = [];
  acc = 0;
  runDist = new Map<string, number>();
  sheets = new Map<string, { key: string; sheet: Sheet }>();
  animMem = new Map<string, { clip: string; u: number }>();
  lastVel = new Map<string, { x: number; y: number; squeakAt: number }>();
  heldBall: { x: number; y: number } | null = null;
  crowd!: Crowd;
  shotClockTexts: Phaser.GameObjects.Text[] = [];
  tableText!: Phaser.GameObjects.Text;
  coaches: { team: 0 | 1; sprite: Phaser.GameObjects.Sprite; sheet: Sheet; home: number; x: number; act: string; actUntil: number }[] = [];
  benchCheerUntil: [number, number] = [0, 0];
  paused = false;
  pauseText!: Phaser.GameObjects.Text;
  pauseIdx = 0;
  ended = false;

  constructor() { super('Game'); }

  init(data: { mode: Mode }) {
    this.mode = data.mode ?? 'practice'; this.ended = false; this.paused = false; this.feed = [];
    // the scene object is reused between games: drop per-game caches (textures themselves are kept in SHEET_CACHE)
    this.sprites.clear(); this.sheets.clear(); this.animMem.clear(); this.lastVel.clear(); this.runDist.clear();
  }

  create() {
    this.sim = createSim(this.mode);
    app.sim = this.sim;
    this.input2 = new InputMapper(this);
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
    this.cameras.main.setBounds(0, 0, WORLD_W, VIEW_H);
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

  ensureSprite(p: Player) {
    const kit = this.kitFor(p);
    const key = `pl_${p.id}_${hashStr(JSON.stringify([p.appearance, p.height.toFixed(2), kit]))}`;
    const cur = this.sheets.get(p.id);
    if (cur?.key === key) return;
    // textures outlive scenes, so keep the frame/ball data alongside them
    let sheet = SHEET_CACHE.get(key);
    if (!sheet || !this.textures.exists(key)) {
      sheet = buildSheet(p.height, p.appearance, kit);
      if (this.textures.exists(key)) this.textures.remove(key);
      const tex = this.textures.addCanvas(key, sheet.canvas)!;
      for (let i = 0; i < sheet.total; i++) { const r = frameRect(i); tex.add(i, 0, r.x, r.y, FRAME_W, FRAME_H); }
      SHEET_CACHE.set(key, sheet);
    }
    this.sheets.set(p.id, { key, sheet });
    let s = this.sprites.get(p.id);
    if (!s) { s = this.add.sprite(0, 0, key, 0).setOrigin(CX / FRAME_W, FOOT_Y / FRAME_H).setScale(PIXEL); this.sprites.set(p.id, s); }
    else s.setTexture(key, 0);
  }

  makeHud() {
    const fixed = <T extends Phaser.GameObjects.Components.ScrollFactor>(o: T) => { o.setScrollFactor(0); return o; };
    this.hud = fixed(this.add.graphics().setDepth(9000));
    this.eqText = fixed(this.add.text(12, 8, '', { fontFamily: FONT, fontSize: '15px', color: '#ffffff', wordWrap: { width: VIEW_W - 24 }, lineSpacing: 2 }).setDepth(9001));
    this.scoreText = fixed(this.add.text(12, 66, '', { fontFamily: FONT, fontSize: '18px', color: '#ffffff', fontStyle: 'bold' }).setDepth(9001));
    this.playText = fixed(this.add.text(VIEW_W / 2, VIEW_H - 40, '', { fontFamily: FONT, fontSize: '16px', color: '#ffe680', align: 'center' }).setOrigin(0.5, 0).setDepth(9001));
    this.ultText = fixed(this.add.text(VIEW_W - 16, VIEW_H - 78, '', { fontFamily: FONT, fontSize: '14px', color: '#ffffff', align: 'right' }).setOrigin(1, 0).setDepth(9001));
    this.trustText = fixed(this.add.text(16, VIEW_H - 74, '', { fontFamily: FONT, fontSize: '13px', color: '#cfe8ff' }).setDepth(9001));
    this.feedText = fixed(this.add.text(VIEW_W - 16, 100, '', { fontFamily: FONT, fontSize: '14px', color: '#ffffff', align: 'right', lineSpacing: 3 }).setOrigin(1, 0).setDepth(9001));
    this.benchText = fixed(this.add.text(VIEW_W / 2, 260, '', { fontFamily: FONT, fontSize: '22px', color: '#ffffff', align: 'center', backgroundColor: '#000000aa', padding: { x: 16, y: 10 } }).setOrigin(0.5).setDepth(9002));
    this.helpText = fixed(this.add.text(VIEW_W / 2, VIEW_H - 18, '', { fontFamily: FONT, fontSize: '12px', color: '#9aa4bf' }).setOrigin(0.5, 0).setDepth(9001));
    this.bigText = fixed(this.add.text(VIEW_W / 2, 200, '', { fontFamily: FONT, fontSize: '40px', color: '#ffdd33', fontStyle: 'bold', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5).setDepth(9003).setAlpha(0));
    this.pauseText = fixed(this.add.text(VIEW_W / 2, VIEW_H / 2, '', { fontFamily: FONT, fontSize: '24px', color: '#ffffff', align: 'center', backgroundColor: '#000000dd', padding: { x: 30, y: 20 } }).setOrigin(0.5).setDepth(9500).setVisible(false));
  }

  update(_t: number, deltaMs: number) {
    this.input2.poll();
    if (this.input2.pressed('dev')) (window as any).__toggleDev?.();
    if (this.input2.pressed('mute')) this.feed.unshift({ text: sfx.toggleMute() ? 'Sound off (M)' : 'Sound on (M)', t: this.time.now, color: '#ffffff' });
    if (this.ended) return;
    if (this.input2.pressed('start') && !this.input2.held('back')) { this.paused = !this.paused; this.pauseIdx = 0; }
    if (this.paused) { this.updatePause(); return; }

    const sim = this.sim;
    const speed = app.settings.timeScale * (sim.userOnCourt || sim.cfg.mode === 'practice' ? 1 : app.settings.benchSpeed);
    const step = 1 / 60;
    this.acc += Math.min(0.1, deltaMs / 1000) * speed;
    let first = true;
    while (this.acc >= step) {
      sim.update(step, first ? this.input2.gameInput() : { ...this.input2.gameInput(), a: false, b: false, x: false, y: false });
      first = false;
      this.acc -= step;
    }
    for (const e of sim.drainEvents()) this.onEvent(e);
    this.render();
    if (sim.over && !this.ended) {
      this.ended = true;
      this.time.delayedCall(1800, () => this.scene.start('PostGame', { mode: this.mode, sim: this.sim }));
    }
  }

  updatePause() {
    const opts = ['Resume', 'Restart', this.mode === 'career' ? 'Forfeit to Hub' : 'Quit to Menu'];
    if (this.input2.pressed('down')) this.pauseIdx = (this.pauseIdx + 1) % opts.length;
    if (this.input2.pressed('up')) this.pauseIdx = (this.pauseIdx + opts.length - 1) % opts.length;
    this.pauseText.setVisible(true).setText('PAUSED\n\n' + opts.map((o, i) => (i === this.pauseIdx ? '> ' : '  ') + o).join('\n'));
    if (this.input2.confirm()) {
      this.pauseText.setVisible(false);
      if (this.pauseIdx === 0) this.paused = false;
      else if (this.pauseIdx === 1) this.scene.restart({ mode: this.mode });
      else this.scene.start(this.mode === 'career' ? 'Hub' : 'Menu');
    }
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
      case 'gather': if (['layup', 'dunk', 'euro', 'stepThrough'].includes(d.type)) sfx.squeak(pan, 0.7); break;
      case 'pass': sfx.pass(pan, !!d.lob); break;
      case 'catch': sfx.catch(pan); break;
      case 'release': sfx.release(pan); break;
      case 'net':
        if (d.type === 'dunk') { sfx.dunk(pan); sfx.cheer(d.team === 0 ? 0.9 : 0.45); }
        else { d.swish ? sfx.swish(pan) : sfx.rimIn(pan); if (d.pts === 3) sfx.cheer(d.team === 0 ? 0.75 : 0.3); }
        break;
      case 'rim': sfx.clank(pan, !!d.board); break;
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
    const mine = e.pid === 'USER';
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
  clipFor(p: Player): { clip: string; u: number } {
    const sim = this.sim, now = sim.time, a = p.anim;
    const hasBall = sim.holder() === p;
    const dist = this.runDist.get(p.id) ?? 0;
    const phase = (p.number * 0.137) % 1; // so players don't dribble in lockstep
    if (p.state === 'fallen') return { clip: a?.name === 'ankleFall' ? 'ankleFall' : 'fall', u: a ? (now - a.start) / 0.65 : 1 };
    if (sim.inb?.inbounder === p && sim.inb.hasBall && len(p.vel) < 2) return { clip: 'inbound', u: now };
    if (hasBall && p.deadDribble && p.state !== 'shoot') return { clip: 'hold', u: now * 1.5 };
    if (a && a.name.startsWith('shot_')) {
      const clip = SHOT_CLIP[a.name.slice(5)] ?? 'shot_jumper';
      const c = CLIP[clip];
      const inPost = a.release !== undefined && now >= a.release && (now - a.release < (c.post ?? 0.5) || p.z > 0.05);
      if (p.state === 'shoot' || inPost) return { clip, u: shotU(c, now, a.start, p.state === 'shoot' ? a.release : a.release) };
    }
    if (p.state === 'dribbleMove' && a?.name.startsWith('move_')) return { clip: CLIP[a.name] ? a.name : 'move_lateral', u: (now - a.start) / (a.dur ?? 0.35) };
    if (p.state === 'stagger' || now < p.staggerUntil) return { clip: 'stagger', u: now * 2 };
    if (p.state === 'screen') return { clip: 'screen', u: p.stateT / 0.25 };
    if (p.state === 'charge') return { clip: 'charge', u: p.stateT / 0.2 };
    if (p.z > 0.3) return { clip: 'block', u: p.vz > 0 ? 0.4 * (1 - p.vz / p.jumpVel) : 0.4 + 0.6 * Math.min(1, -p.vz / p.jumpVel) };
    if (now < p.swipingUntil) return { clip: 'swipe', u: 1 - (p.swipingUntil - now) / 0.3 };
    if (sim.lastPasser === p && now - sim.lastPassAt < 0.3) return { clip: 'pass', u: (now - sim.lastPassAt) / 0.3 };
    if (hasBall && now - p.receivedAt < 0.18) return { clip: 'catch', u: (now - p.receivedAt) / 0.18 };
    const sp = len(p.vel);
    if (sp > 2.5) {
      if (hasBall) return { clip: 'dribbleRun', u: dist / 8 + phase };
      const man = p.guarding ? sim.players.find((q) => q.id === p.guarding) : null;
      if (p.team !== sim.possession && man && sp < p.walkSpeed * 1.05 && Math.hypot(man.p.x - p.p.x, man.p.y - p.p.y) < 8) return { clip: 'slide', u: dist / 5 };
      return sp > p.walkSpeed * 1.1 ? { clip: 'sprint', u: dist / 9.5 } : { clip: 'jog', u: dist / 7 };
    }
    if (hasBall) return { clip: 'dribble', u: now * 1.7 + phase };
    if (p.team !== sim.possession && sim.live) return { clip: 'defend', u: now * 1.2 + phase };
    return { clip: 'idle', u: now * 0.5 + phase };
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
    this.heldBall = null;
    const holder = sim.holder();
    for (const p of sim.players) {
      this.ensureSprite(p);
      const s = this.sprites.get(p.id);
      const sh = this.sheets.get(p.id);
      if (!s || !sh) continue;
      this.runDist.set(p.id, (this.runDist.get(p.id) ?? 0) + len(p.vel) / 60);
      const { clip, u } = this.clipFor(p);
      const c = CLIP[clip];
      const idx = sh.sheet.index[clip].start + frameAt(c, u);
      this.dribbleSound(p, clip, u);
      this.cutSound(p);
      s.setFrame(idx);
      s.setPosition(sx(p.p.x), sy(p.p.y, p.z));
      const flip = p.face.x < 0;
      s.setFlipX(flip);
      const bo = sh.sheet.ball[idx];
      if (bo && (holder === p || p.state === 'shoot' || (sim.inb?.inbounder === p && sim.inb.hasBall))) this.heldBall = { x: s.x + (flip ? -bo[0] : bo[0]) * PIXEL, y: s.y - bo[1] * PIXEL };
      s.setDepth(sy(p.p.y));
      const ghost = sim.time < p.screenedUntil;
      s.setTint(ghost ? 0xb0b0ff : 0xffffff);
      this.shadows.fillStyle(0x000000, 0.28);
      this.shadows.fillEllipse(sx(p.p.x), sy(p.p.y), 32 - p.z * 2, 9);
    }

    // ball
    const b = sim.ball;
    this.ballG.clear().setDepth(sy(b.p.y) + 1);
    const inHand = !!this.heldBall && (b.st.kind === 'held' || (b.st.kind === 'dead' && !!sim.inb?.hasBall));
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
    // bench chairs
    for (const [a, b] of [[20, 40], [54, 74]]) for (let x = a; x <= b; x += 2.2) { g.fillStyle(0x3a3f4d, 1); g.fillRect(sx(x) - 9, sy(-3.9) - 30, 18, 4); g.fillRect(sx(x) - 9, sy(-3.9) - 30, 3, 30); }
    // coaches in suits
    this.coaches = [];
    ([0, 1] as const).forEach((team) => {
      const def = sim.teams[team].def;
      const rng = new Rng(def.seed * 31 + 7);
      const look = randomAppearance(() => rng.next());
      Object.assign(look, { armSleeve: 'both', sleeveColor: '#1d1f2a', wristband: null, legSleeve: 'none', kneePad: false, goggles: false, mask: false, headband: null, shoe: '#111111', shoeAccent: '#111111', socks: 'low', sockColor: '#111111', hair: rng.pick(['bald', 'buzz', 'fade', 'waves']) });
      const kit: Kit = { jersey: '#1d1f2a', jerseyShade: '#14161e', trim: def.colors[0], shorts: '#22242e', number: -1, pants: true };
      const key = `coach_${def.id}`;
      let sheet = SHEET_CACHE.get(key);
      if (!sheet || !this.textures.exists(key)) {
        sheet = buildSheet(6.2, look, kit);
        if (this.textures.exists(key)) this.textures.remove(key);
        const tex = this.textures.addCanvas(key, sheet.canvas)!;
        for (let i = 0; i < sheet.total; i++) { const r = frameRect(i); tex.add(i, 0, r.x, r.y, FRAME_W, FRAME_H); }
        SHEET_CACHE.set(key, sheet);
      }
      const home = team === 0 ? 39 : 55;
      const sprite = this.add.sprite(sx(home), sy(-1.6), key, 0).setOrigin(CX / FRAME_W, FOOT_Y / FRAME_H).setScale(PIXEL).setDepth(sy(-1.6));
      this.coaches.push({ team, sprite, sheet, home, x: home, act: 'idle', actUntil: 0 });
    });
  }

  renderSideline() {
    const sim = this.sim, now = this.time.now;
    const [a, b] = sim.teams;
    const clock = sim.cfg.mode === 'practice' ? '--:--' : `${Math.floor(Math.max(0, sim.clock) / 60)}:${String(Math.floor(Math.max(0, sim.clock) % 60)).padStart(2, '0')}`;
    this.tableText.setText(`${a.def.id} ${a.score}  ${clock}  ${b.score} ${b.def.id}`);
    // benches: everyone on the roster who isn't on the floor sits; they jump up on their team's big plays
    const onCourt = new Set(sim.players.map((p) => p.id));
    ([0, 1] as const).forEach((team) => {
      const bench = sim.teams[team].roster.filter((p) => !onCourt.has(p.id));
      const start = team === 0 ? 20 : 54;
      bench.forEach((p, i) => {
        this.ensureSprite(p);
        const s = this.sprites.get(p.id), sh = this.sheets.get(p.id);
        if (!s || !sh) return;
        const cheering = now < this.benchCheerUntil[team];
        const clip = cheering ? 'cheer' : 'sit';
        const c = CLIP[clip];
        s.setVisible(true).setPosition(sx(start + i * 2.2), sy(-3.9)).setDepth(sy(-3.9)).setFlipX(team === 1).setTint(0xffffff);
        s.setFrame(sh.sheet.index[clip].start + frameAt(c, now / 1000 * (cheering ? 2.5 : 0.4) + i * 0.37));
      });
    });
    // coaches pace the sideline, point when calling a play, celebrate big plays
    for (const c of this.coaches) {
      let clip = 'idle', u = now / 2000;
      if (now < c.actUntil) { clip = c.act; u = c.act === 'cheer' ? now / 400 : 1 - (c.actUntil - now) / 1100; }
      else {
        const target = c.home + Math.sin(now / 2600 + c.team * 2) * 2.5;
        const dx = target - c.x;
        if (Math.abs(dx) > 0.15) { c.x += Math.sign(dx) * Math.min(Math.abs(dx), 0.05); clip = 'jog'; u = c.x / 3; c.sprite.setFlipX(dx < 0); }
      }
      c.sprite.setPosition(sx(c.x), sy(-1.6)).setFrame(c.sheet.index[clip].start + frameAt(CLIP[clip], u));
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
    if (dbg.aiTargets) for (const p of sim.players) { g.lineStyle(1, p.team === 0 ? 0x66aaff : 0xff6666, 0.5); g.lineBetween(sx(p.p.x), sy(p.p.y), sx(p.target.x), sy(p.target.y)); }
    if (dbg.hitboxes) for (const p of sim.players) { g.lineStyle(1, 0xffffff, 0.6); g.strokeEllipse(sx(p.p.x), sy(p.p.y), 2.2 * S, 2.2 * D); }
    if (!u || !sim.userOnCourt) return;

    // user ring + arrow
    g.lineStyle(3, 0x33ff99, 0.95); g.strokeEllipse(sx(u.p.x), sy(u.p.y), 2.6 * S, 2.6 * D);
    gt.fillStyle(0x33ff99, 1);
    const ax = sx(u.p.x), ay = sy(u.p.y, u.z + u.height + 1.0);
    gt.fillTriangle(ax - 7, ay - 10, ax + 7, ay - 10, ax, ay);
    if (u.callForBallUntil > sim.time) this.label(ax, ay - 30, '!', '#ffee00', 22);

    const hasBall = sim.holder() === u;
    const onO = u.team === sim.possession;
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
    else eq = sim.userOnCourt ? (sim.user!.team === sim.possession ? 'Get open. Run your assignment. △ = call for the ball (teammates decide based on trust).' : 'Defense: ✕ = block/contest  △ = swipe/deflect  ○ = take a charge') : '';
    this.eqText.setText(eq);

    const [a, b] = sim.teams;
    const clock = sim.cfg.mode === 'practice' ? 'PRACTICE' : `${sim.quarter <= 4 ? 'Q' + sim.quarter : 'OT'} ${Math.floor(Math.max(0, sim.clock) / 60)}:${String(Math.floor(Math.max(0, sim.clock) % 60)).padStart(2, '0')}`;
    this.scoreText.setText(`${a.def.id} ${a.score}  –  ${b.score} ${b.def.id}    ${clock}    SHOT ${Math.max(0, Math.ceil(sim.shotClock))}`);
    h.fillStyle(0x000000, 0.55); h.fillRect(0, 60, 560, 32);

    const asg = sim.userAssignment();
    const playName = sim.runner.play ? sim.runner.play.name : '';
    const forYou = sim.runner.focusPid && sim.runner.focusPid === sim.user?.id;
    this.playText.setText(playName ? `PLAY: ${playName}${forYou ? ' — for YOU' : ''}${asg ? `   —   YOU: ${asg.act.toUpperCase()}` : ''}` : '');

    // trust bars
    const tr = sim.trust;
    this.trustText.setText(`TEAM TRUST  ${tr.team.toFixed(0)}\nCOACH TRUST ${tr.coach.toFixed(0)}`);
    h.fillStyle(0x000000, 0.5); h.fillRect(10, VIEW_H - 80, 250, 48);
    h.fillStyle(0x223344, 1); h.fillRect(150, VIEW_H - 72, 100, 10); h.fillRect(150, VIEW_H - 56, 100, 10);
    h.fillStyle(0x4fc3ff, 1); h.fillRect(150, VIEW_H - 72, tr.team, 10);
    h.fillStyle(0xffc34f, 1); h.fillRect(150, VIEW_H - 56, tr.coach, 10);

    // sprint burst pip
    const u = sim.user;
    if (u) {
      const ready = sim.time >= u.burstCdUntil;
      const active = sim.time < u.burstUntil;
      const frac = active ? 1 - (sim.time - u.burstStartAt) / Math.max(0.1, u.burstUntil - u.burstStartAt) : ready ? 1 : 1 - (u.burstCdUntil - sim.time) / Math.max(0.1, u.burstCdUntil - u.burstUntil);
      h.fillStyle(0x000000, 0.5); h.fillCircle(285, VIEW_H - 56, 20);
      h.lineStyle(4, 0x2a3350, 1); h.strokeCircle(285, VIEW_H - 56, 15);
      h.lineStyle(4, active ? 0x7df9ff : ready ? 0x66ff99 : 0xffb030, 1);
      h.beginPath(); h.arc(285, VIEW_H - 56, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, Math.min(1, frac))); h.strokePath();
    }
    // ultimate meter
    const st = sim.ult.state;
    h.fillStyle(0x000000, 0.5); h.fillRect(VIEW_W - 270, VIEW_H - 84, 260, 54);
    if (!st.unlocked) {
      this.ultText.setText('[□] ULTIMATE\n???  — LOCKED').setColor('#888888');
      h.fillStyle(0x333333, 1); h.fillRect(VIEW_W - 260, VIEW_H - 40, 240, 6);
    } else if (u) {
      const c = u.ultCharge;
      this.ultText.setText(`[□] ${st.id ? ULTIMATES[st.id].name : 'No ultimate'}\n${ultLevelName(st)}  ${c >= 100 ? 'READY!' : c.toFixed(0) + '%'}`).setColor(c >= 100 ? '#ffdd33' : '#ffffff');
      h.fillStyle(0x332200, 1); h.fillRect(VIEW_W - 260, VIEW_H - 40, 240, 6);
      h.fillStyle(c >= 100 ? 0xffdd33 : 0xff8a00, 1); h.fillRect(VIEW_W - 260, VIEW_H - 40, 2.4 * c, 6);
    }

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

    const u2 = sim.user;
    const tail = '□ Ultimate   R2 Sprint   Options Pause   F1 Dev';
    this.helpText.setText(!u2 ? '' : sim.holder() === u2 ? (u2.deadDribble ? '✕ Shoot   △ Pass to ●   (dribble picked up — no moving)   ' + tail : '✕ Shoot (hold back=floater, side=hook/euro)   △ Pass to ●   ○ Dribble move + stick   ' + tail)
      : u2.team === sim.possession ? '△ Call for ball   ○ Set screen   ' + tail
      : '✕ Block/Contest   △ Swipe steal   ○ Take charge   ' + tail);
  }
}

function fmtEq(e: import('../sim/shooting').ShotEval): string {
  return e.terms.map((t) => (t.kind === 'base' ? `${(t.value * 100).toFixed(0)}% ${t.label}` : `× ${t.value.toFixed(2)} ${t.label}`)).join('  ') + `  =  ${(e.pct * 100).toFixed(1)}%  (${e.pts}PT)`;
}
void D;

function hashStr(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
