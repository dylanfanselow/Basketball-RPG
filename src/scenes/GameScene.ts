import Phaser from 'phaser';
import { GameSim, GameEvent } from '../sim/game';
import { Player } from '../sim/player';
import { InputMapper } from '../input/input';
import { app } from '../state';
import { createSim, Mode } from './setup';
import { S, D, sx, sy, drawCourt, drawHoops, WORLD_W, VIEW_W, VIEW_H } from '../render/view';
import { buildSheet, teamPalette, FRAMES, FRAME_W, FRAME_H, PIXEL, FrameName } from '../render/sprites';
import { rimPos } from '../sim/court';
import { CONE_HALF } from '../sim/shooting';
import { norm, sub, dist, len, segDist } from '../sim/math';
import { ULTIMATES } from '../sim/data';
import { ultLevelName } from '../sim/ultimates';

const FI = Object.fromEntries(FRAMES.map((f, i) => [f, i])) as Record<FrameName, number>;
const FONT = '"Courier New", monospace';

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
  paused = false;
  pauseText!: Phaser.GameObjects.Text;
  pauseIdx = 0;
  ended = false;

  constructor() { super('Game'); }

  init(data: { mode: Mode }) { this.mode = data.mode ?? 'practice'; this.ended = false; this.paused = false; this.feed = []; this.sprites.clear(); }

  create() {
    this.sim = createSim(this.mode);
    app.sim = this.sim;
    this.input2 = new InputMapper(this);
    const [t0, t1] = this.sim.teams;
    drawCourt(this, [t0.def.colors[0], t1.def.colors[0]]);
    drawHoops(this);
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

  /** (Re)generate pixel sheets for everyone (dev tools call this after changes). */
  buildSprites() {
    const all = new Set<Player>([...this.sim.teams[0].roster, ...this.sim.teams[1].roster]);
    for (const p of all) {
      const key = `pl_${p.id}_${p.team}`;
      if (!this.textures.exists(key)) {
        const t = this.sim.teams[p.team];
        const pal = teamPalette(p.team === 0 ? t.def.colors : [t.def.colors[0], t.def.colors[1]], p.skin);
        if (p.team === 1) { pal.jersey = '#f2f2f2'; pal.jerseyShade = '#cfcfcf'; pal.trim = t.def.colors[0]; pal.shorts = '#e6e6e6'; }
        const canvas = buildSheet(p.height, pal, p.number);
        const tex = this.textures.addCanvas(key, canvas)!;
        FRAMES.forEach((_, i) => tex.add(i, 0, i * FRAME_W, 0, FRAME_W, FRAME_H));
      }
      if (!this.sprites.has(p.id)) {
        const s = this.add.sprite(0, 0, key, 0).setOrigin(0.44, 0.97).setScale(PIXEL);
        this.sprites.set(p.id, s);
      }
    }
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
      this.time.delayedCall(1800, () => this.scene.start('PostGame', { mode: this.mode }));
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

  onEvent(e: GameEvent) {
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

  frameFor(p: Player): FrameName {
    const sim = this.sim;
    const hasBall = sim.holder() === p;
    if (p.state === 'fallen') return 'fallen';
    if (p.state === 'stagger' || sim.time < p.staggerUntil) return 'stagger';
    if (p.state === 'screen') return 'screen';
    if (p.state === 'charge') return 'charge';
    if (p.state === 'shoot' && p.pendingShot) {
      const t = p.pendingShot.type;
      return t === 'dunk' ? 'dunk' : ['mid', 'three', 'deep3', 'push'].includes(t) ? 'shoot' : 'layup';
    }
    if (sim.ball.st.kind === 'shot' && sim.ball.st.shooter === p && p.z > 0.2) return sim.ball.st.ev.type === 'dunk' ? 'dunk' : 'shoot';
    if (p.z > 0.3) return 'block';
    if (p.state === 'dribbleMove') return 'cross';
    if (sim.time < p.swipingUntil) return 'swipe';
    if (sim.lastPasser === p && sim.time - sim.lastPassAt < 0.22) return 'pass';
    const sp = len(p.vel);
    if (sp > 2.5) {
      const dd = (this.runDist.get(p.id) ?? 0);
      const idx = Math.floor(dd / 2.3) % 4;
      return (['run0', 'run1', 'run2', 'run3'] as FrameName[])[idx];
    }
    if (hasBall) return Math.floor(sim.time * 4) % 2 ? 'dribble' : 'dribble2';
    if (p.team !== sim.possession && sim.live) return 'defend';
    return 'idle';
  }

  render() {
    const sim = this.sim;
    const cam = this.cameras.main;
    const u = sim.user;
    // frame the action between the ball and the rim being attacked
    const rimX = sim.rim(sim.possession).x;
    const bx0 = u && sim.userOnCourt ? sim.ball.p.x * 0.7 + u.p.x * 0.3 : sim.ball.p.x;
    const focusX = (bx0 + (rimX - bx0) * 0.42) * S;
    let tx = focusX - VIEW_W / 2;
    // never lose your own player
    if (u && sim.userOnCourt) tx = Phaser.Math.Clamp(tx, sx(u.p.x) - VIEW_W + 140, sx(u.p.x) - 140);
    tx = Phaser.Math.Clamp(tx, 0, WORLD_W - VIEW_W);
    cam.scrollX += (tx - cam.scrollX) * 0.12;

    // players
    const onCourt = new Set(sim.players.map((p) => p.id));
    this.shadows.clear();
    for (const [id, s] of this.sprites) s.setVisible(onCourt.has(id));
    for (const p of sim.players) {
      const s = this.sprites.get(p.id);
      if (!s) continue;
      this.runDist.set(p.id, (this.runDist.get(p.id) ?? 0) + len(p.vel) / 60);
      s.setFrame(FI[this.frameFor(p)]);
      s.setPosition(sx(p.p.x), sy(p.p.y, p.z));
      s.setFlipX(p.face.x < 0);
      s.setDepth(sy(p.p.y));
      const ghost = sim.time < p.screenedUntil;
      s.setTint(ghost ? 0xb0b0ff : 0xffffff);
      this.shadows.fillStyle(0x000000, 0.28);
      this.shadows.fillEllipse(sx(p.p.x), sy(p.p.y), 46 - p.z * 2, 12);
    }

    // ball
    const b = sim.ball;
    this.ballG.clear().setDepth(sy(b.p.y) + 1);
    const bx = sx(b.p.x), by = sy(b.p.y, b.z);
    this.shadows.fillStyle(0x000000, 0.3); this.shadows.fillEllipse(sx(b.p.x), sy(b.p.y), 16, 5);
    this.ballG.fillStyle(0xe86a1c, 1); this.ballG.fillCircle(bx, by, 9);
    this.ballG.fillStyle(0xff9a4a, 1); this.ballG.fillRect(bx - 5, by - 6, 4, 3);
    this.ballG.lineStyle(1.5, 0x5a2a0a, 1); this.ballG.lineBetween(bx - 9, by, bx + 9, by); this.ballG.lineBetween(bx, by - 9, bx, by + 9);

    this.drawOverlays();
    this.drawHud();
  }

  drawOverlays() {
    const sim = this.sim, g = this.overlay, gt = this.overlayTop;
    g.clear(); gt.clear();
    for (const t of this.labelTexts) t.destroy();
    this.labelTexts = [];
    const u = sim.user;
    const dbg = app.settings.debug;
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
        const L = 8;
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
    else eq = sim.userOnCourt ? (sim.user!.team === sim.possession ? 'Get open. Run your assignment. Y = call for the ball (teammates decide based on trust).' : 'Defense: A = block/contest  Y = swipe/deflect  B = take a charge') : '';
    this.eqText.setText(eq);

    const [a, b] = sim.teams;
    const clock = sim.cfg.mode === 'practice' ? 'PRACTICE' : `${sim.quarter <= 4 ? 'Q' + sim.quarter : 'OT'} ${Math.floor(Math.max(0, sim.clock) / 60)}:${String(Math.floor(Math.max(0, sim.clock) % 60)).padStart(2, '0')}`;
    this.scoreText.setText(`${a.def.id} ${a.score}  –  ${b.score} ${b.def.id}    ${clock}    SHOT ${Math.max(0, Math.ceil(sim.shotClock))}`);
    h.fillStyle(0x000000, 0.55); h.fillRect(0, 60, 560, 32);

    const asg = sim.userAssignment();
    const playName = sim.runner.play ? sim.runner.play.name : '';
    this.playText.setText(playName ? `PLAY: ${playName}${asg ? `   —   YOU: ${asg.act.toUpperCase()}` : ''}` : '');

    // trust bars
    const tr = sim.trust;
    this.trustText.setText(`TEAM TRUST  ${tr.team.toFixed(0)}\nCOACH TRUST ${tr.coach.toFixed(0)}`);
    h.fillStyle(0x000000, 0.5); h.fillRect(10, VIEW_H - 80, 250, 48);
    h.fillStyle(0x223344, 1); h.fillRect(150, VIEW_H - 72, 100, 10); h.fillRect(150, VIEW_H - 56, 100, 10);
    h.fillStyle(0x4fc3ff, 1); h.fillRect(150, VIEW_H - 72, tr.team, 10);
    h.fillStyle(0xffc34f, 1); h.fillRect(150, VIEW_H - 56, tr.coach, 10);

    // ultimate meter
    const u = sim.user;
    const st = sim.ult.state;
    h.fillStyle(0x000000, 0.5); h.fillRect(VIEW_W - 270, VIEW_H - 84, 260, 54);
    if (!st.unlocked) {
      this.ultText.setText('[X] ULTIMATE\n???  — LOCKED').setColor('#888888');
      h.fillStyle(0x333333, 1); h.fillRect(VIEW_W - 260, VIEW_H - 40, 240, 6);
    } else if (u) {
      const c = u.ultCharge;
      this.ultText.setText(`[X] ${st.id ? ULTIMATES[st.id].name : 'No ultimate'}\n${ultLevelName(st)}  ${c >= 100 ? 'READY!' : c.toFixed(0) + '%'}`).setColor(c >= 100 ? '#ffdd33' : '#ffffff');
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

    this.helpText.setText(sim.holder() === sim.user ? 'A Shoot (hold back=floater, side=hook/euro)   Y Pass to ●   B Dribble move + stick   X Ultimate   RT Sprint   Start Pause   F1 Dev'
      : sim.user && sim.user.team === sim.possession ? 'Y Call for ball   B Set screen   X Ultimate   RT Sprint   Start Pause   F1 Dev'
      : 'A Block/Contest   Y Swipe steal   B Take charge   X Ultimate   RT Sprint   Start Pause   F1 Dev');
  }
}

function fmtEq(e: import('../sim/shooting').ShotEval): string {
  return e.terms.map((t) => (t.kind === 'base' ? `${(t.value * 100).toFixed(0)}% ${t.label}` : `× ${t.value.toFixed(2)} ${t.label}`)).join('  ') + `  =  ${(e.pct * 100).toFixed(1)}%  (${e.pts}PT)`;
}
void D;
