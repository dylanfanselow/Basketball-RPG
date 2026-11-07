import Phaser from 'phaser';
import type { GameScene } from './GameScene';
import type { GameEvent } from '../sim/game';
import { StoryBox, BoxContent, BoxSpeaker } from '../render/storyBox';
import { TutorialDirector } from '../sim/tutorial';
import { RIVAL_ID, LOCKED_IN } from '../sim/story';
import { setStage, storyScene, StoryGame } from './setup';
import { prepareStory, prewarmRoom } from './preload';
import { app } from '../state';
import { sfx } from '../audio/sfx';
import { FONT } from './ui';
import { VIEW_W, sx, sy } from '../render/view';
import { buildCoachSheet, COACH_FRAMES, FRONT_W, FRONT_H, SPRITE_SCALE, Kit } from '../render/sprites';
import { randomAppearance } from '../render/appearance';
import { FENCE_Y, BLEACHER } from '../render/schoolArt';
import { Rng } from '../sim/math';

/** The Lincoln coach's spot on the far sideline (ft): by half court, so he's in the tip-off shot. */
const COACH_X = 41;

interface Say { who: BoxSpeaker; text: string; /** tag override (your name, a teammate's) */ name?: string; /** coach throws a fit during this line */ fit?: boolean; then?: () => void }

/**
 * Round 60: runs a prologue game inside GameScene, the tutorial's box (from the TutorialDirector), the 1s (intro,
 * Kingston's goodbye, your thought as he leaves), and the big game (the coach's fit about Kingston's stomach virus,
 * "you're starting", the scout on the bleachers, LOCKED IN). `update` returns true when the sim must not step (a
 * line is up). Stage changes are saved on the career so Load Save picks the story up here.
 */
export class StoryRun {
  box: StoryBox;
  dir: TutorialDirector | null;
  private queue: Say[] = [];
  private line: Say | null = null;
  private lastCheck = -9;
  private prepped = false;
  private leaving = false;
  private overHandled = false;
  private coach: { sprite: Phaser.GameObjects.Sprite; x: number; cheerUntil: number } | null = null;
  /** Round 60b: Kingston walking off after the 1s (court ft / s). */
  private walker: { dir: { x: number; y: number }; speed: number } | null = null;
  private scout: { sprite: Phaser.GameObjects.Sprite; board: Phaser.GameObjects.Graphics; x: number; y: number } | null = null;

  constructor(private gs: GameScene, public which: StoryGame) {
    this.box = new StoryBox(gs);
    this.dir = gs.sim.director instanceof TutorialDirector ? gs.sim.director : null;
    const c = app.career, k = c.story?.rival;
    const you = c.firstName || c.name.split(' ')[0];
    if (which === 'ones') {
      this.say([
        { who: 'kingston', text: `Just us now. Make it, take it. Don't cry when I cook you, ${you}.` },
      ]);
    } else if (which === 'bigGame') {
      this.buildCoach(); this.buildScout();
      const last = c.lastName || c.name.split(' ').slice(-1)[0];
      const kn = k ? k.last : 'Williams';
      // round 60b: a teammate notices you look wiped out (you didn't sleep much last night...)
      const mate = gs.sim.teams[0].roster.find((p) => p !== gs.sim.user);
      const mateName = mate ? mate.name.split(' ')[0] : 'Teammate';
      this.say([
        { who: 'narrator', text: 'The next day. Lincoln High, game day. A man with a clipboard sits on the bleachers.' },
        { who: 'mate', name: mateName, text: 'Yo, you good? You look dead tired.' },
        { who: 'me', name: you, text: 'Didn\'t get much sleep last night.' },
        { who: 'mate', name: mateName, text: 'Well wake up. Coach is looking for Kingston and he ain\'t here.' },
        { who: 'coach', text: `Where's ${kn}? WHERE IS ${kn.toUpperCase()}?!`, fit: true },
        { who: 'coach', text: 'A stomach virus?! TODAY?! The one day, the ONE day, a scout drives three hours to watch him!', fit: true },
        { who: 'coach', text: 'Unbelievable. Un-be-lievable.', fit: true },
        { who: 'coach', text: `...Fine. #${c.number}. ${last}. You're starting.` },
        { who: 'coach', text: 'Everybody locked in! Good fundamental ball: box out, talk on D, make the extra pass. There\'s a scout in the stands today.' },
        { who: 'narrator', text: `LOCKED IN: you're +${LOCKED_IN} on every stat this game. Show him.`, then: () => this.banner('LOCKED IN', `+${LOCKED_IN} ALL STATS  ·  THE SCOUT IS WATCHING`) },
      ]);
    }
  }

  private say(lines: Say[]) { this.queue.push(...lines); if (!this.line) this.next(); }
  private next() { this.line = this.queue.shift() ?? null; }

  /** Per frame, before the sim steps. True = hold the sim (a line is up, or we're leaving). */
  update(): boolean {
    const gs = this.gs, inp = gs.input2;
    // round 60c: this game's sheets are drawn, start on the next scene's (no "Lacing up" / no missing player later)
    if (!this.prepped) {
      this.prepped = true;
      if (this.which === 'tutorial') prepareStory(gs, 'ones');
      else if (this.which === 'ones') prewarmRoom(gs);
    }
    const ok = inp.pressed('a');
    let content: BoxContent | null = null;
    let hold = false;
    if (this.line) {
      content = { who: this.line.who, text: this.line.text, blocking: true, name: this.line.name };
      hold = true;
      if (ok) {
        if (this.box.typing) this.box.finishTyping();
        else { const then = this.line.then; this.next(); then?.(); sfx.blip(true); }
      }
    } else if (this.dir) {
      const v = this.dir.view();
      if (v) {
        content = { who: v.who, text: v.text, blocking: v.blocking, title: v.title ? `LESSON ${this.dir.i + 1}/${this.dir.lessons.length} · ${v.title}` : undefined, sub: v.steps && v.steps > 1 ? `${v.step}/${v.steps}` : undefined };
        if (v.blocking) {
          hold = true;
          if (ok) { if (this.box.typing) this.box.finishTyping(); else { this.dir.nextLine(); sfx.blip(true); } }
        }
      }
      if (this.dir.checkAt !== this.lastCheck) { this.lastCheck = this.dir.checkAt; this.box.flash(); sfx.greenChime(); }
      if (this.dir.finished && !this.leaving) this.goTo('ones');
    }
    if (content) this.box.show(content); else this.box.hide();
    this.box.draw();
    this.animate();
    return hold || this.leaving;
  }

  /** The sim says the game is over. True = the story handles what's next (no PostGame). */
  onOver(): boolean {
    if (this.which === 'bigGame') return false; // PostGame (story branch) → home
    if (this.overHandled) return true;
    this.overHandled = true;
    if (this.which === 'ones') {
      const sim = this.gs.sim, c = app.career;
      const youWon = sim.teams[0].score > sim.teams[1].score;
      const you = c.firstName || c.name.split(' ')[0];
      this.say([
        youWon
          ? { who: 'kingston', text: 'Rain got in my eyes. ...Nah, that was nice. Don\'t get used to it.' }
          : { who: 'kingston', text: `Good run, ${you}. You're gettin' there. Just not there.` },
        { who: 'kingston', text: 'Big day tomorrow. See you tomorrow. Don\'t be late.', then: () => { sfx.music(null); this.kingstonLeaves(); } }, // the game music fades as he goes
        { who: 'you', text: 'Everybody wants out of here. Me too.' },
        { who: 'you', text: 'But he\'s so much better than me... The scout\'s never even gonna notice me.', then: () => this.goTo('night') },
      ]);
      return true;
    }
    this.goTo('ones');
    return true;
  }

  /** Feed from GameScene.onEvent: the coach reacts in the big game. */
  onEvent(e: GameEvent) {
    if (!this.coach) return;
    if (e.kind === 'score' && e.team === 0) this.coach.cheerUntil = this.gs.time.now + 1600;
  }

  pauseOptions(): string[] { return this.dir ? ['Skip lesson', 'Skip to the 1s'] : this.which === 'ones' ? ['Skip to that night'] : []; }
  pauseAction(i: number) {
    if (this.dir && i === 0) this.dir.skipLesson();
    else if (this.dir && i === 1) this.goTo('ones');
    else if (this.which === 'ones') this.goTo('night');
  }

  // ---------- transitions ----------
  private goTo(stage: 'ones' | 'night') {
    if (this.leaving) return;
    this.leaving = true;
    setStage(stage);
    const [scene, data] = storyScene(stage);
    const cam = this.gs.cameras.main;
    cam.fadeOut(700, 0, 0, 0);
    this.gs.time.delayedCall(760, () => this.gs.scene.start(scene, data));
  }

  /**
   * "See you tomorrow": he turns and walks off into the rain, away from the hoop and out of the picture (round 60b;
   * GameScene animates him from his velocity, the same stride rooms use for walking). Your thoughts play meanwhile.
   */
  private kingstonLeaves() {
    const sim = this.gs.sim, king = sim.players.find((p) => p.id === RIVAL_ID);
    if (!king) return;
    sim.live = false; // nobody's defending anymore (no defensive shuffle)
    if (sim.user && sim.holder() !== sim.user) sim.giveBall(sim.user);
    const away = -sim.side(0); // the hoop is that way; he heads the other way, drifting toward the fence
    const dir = { x: away, y: -0.18 }, n = Math.hypot(dir.x, dir.y);
    this.walker = { dir: { x: dir.x / n, y: dir.y / n }, speed: 6.4 };
    king.face = { ...this.walker.dir };
    king.state = 'idle'; king.anim = null;
  }

  /** Kingston's walk, frame by frame; he leaves the court once he's out of the picture. */
  private walkOff() {
    const w = this.walker; if (!w) return;
    const sim = this.gs.sim, king = sim.players.find((p) => p.id === RIVAL_ID);
    if (!king) { this.walker = null; return; }
    const dt = Math.min(0.05, this.gs.game.loop.delta / 1000);
    king.vel = { x: w.dir.x * w.speed, y: w.dir.y * w.speed };
    king.p = { x: king.p.x + king.vel.x * dt, y: Math.max(-1.5, king.p.y + king.vel.y * dt) };
    king.face = { ...w.dir };
    const cam = this.gs.cameras.main, x = sx(king.p.x);
    if (x < cam.scrollX - 90 || x > cam.scrollX + VIEW_W + 90) {
      for (const t of sim.teams) t.onCourt = t.onCourt.filter((p) => p.id !== RIVAL_ID);
      sim.players = sim.players.filter((p) => p.id !== RIVAL_ID);
      this.walker = null;
    }
  }

  private banner(big: string, small: string) {
    const gs = this.gs;
    const a = gs.add.text(VIEW_W / 2, 230, big, { fontFamily: FONT, fontSize: '58px', color: '#ffe680', fontStyle: 'bold', stroke: '#2a0f14', strokeThickness: 9 }).setOrigin(0.5).setScrollFactor(0).setDepth(9300).setAlpha(0).setScale(0.7);
    const b = gs.add.text(VIEW_W / 2, 284, small, { fontFamily: FONT, fontSize: '18px', color: '#ffffff', fontStyle: 'bold', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5).setScrollFactor(0).setDepth(9300).setAlpha(0);
    gs.tweens.add({ targets: a, alpha: 1, scale: 1, duration: 420, ease: 'Back.easeOut', hold: 1700, yoyo: true, onComplete: () => a.destroy() });
    gs.tweens.add({ targets: b, alpha: 1, duration: 420, delay: 150, hold: 1600, yoyo: true, onComplete: () => b.destroy() });
    sfx.greenChime();
  }

  // ---------- the big game's sideline: the coach and the scout ----------
  private buildCoach() {
    const gs = this.gs, rng = new Rng(4242);
    const look = randomAppearance(() => rng.next());
    Object.assign(look, { hair: 'bald', facial: 'goatee', armSleeve: 'none', wristband: null, legSleeve: 'none', kneePad: false, goggles: false, mask: false, headband: null, shoe: '#111111', shoeAccent: '#111111', socks: 'low', sockColor: '#111111' });
    const kit: Kit = { jersey: '#7a1f2b', jerseyShade: '#5a1520', trim: '#e0b33a', shorts: '#2a2a33', number: -1, pants: true };
    const key = 'story_coach_v1';
    this.sheet(key, 6.1, look, kit);
    const x = COACH_X;
    const sprite = gs.add.sprite(sx(x), sy(-1.6), key, 0).setOrigin(0.5, 1).setScale(SPRITE_SCALE * 0.96).setDepth(sy(-1.6));
    this.coach = { sprite, x, cheerUntil: 0 };
  }

  private buildScout() {
    const gs = this.gs, rng = new Rng(777);
    const look = randomAppearance(() => rng.next());
    Object.assign(look, { hair: 'buzz', hairColor: '#8a8a8a', facial: 'none', armSleeve: 'none', wristband: null, legSleeve: 'none', kneePad: false, goggles: false, mask: false, headband: null, shoe: '#5a3a22', shoeAccent: '#5a3a22', socks: 'low', sockColor: '#333333' });
    const kit: Kit = { jersey: '#1f3550', jerseyShade: '#162638', trim: '#d8dde6', shorts: '#b8a27a', number: -1, pants: true };
    const key = 'story_scout_v1';
    this.sheet(key, 5.9, look, kit);
    const x = BLEACHER.x1 + 34, y = FENCE_Y + 30;
    const sprite = gs.add.sprite(x, y, key, 0).setOrigin(0.5, 1).setScale(SPRITE_SCALE * 0.8).setDepth(y);
    const board = gs.add.graphics().setDepth(y + 1);
    this.scout = { sprite, board, x, y };
  }

  private sheet(key: string, h: number, look: ReturnType<typeof randomAppearance>, kit: Kit) {
    const tm = this.gs.textures;
    if (tm.exists(key)) return;
    const tex = tm.addCanvas(key, buildCoachSheet(h, look, kit))!;
    for (let f = 0; f < COACH_FRAMES; f++) tex.add(f, 0, f * FRONT_W, 0, FRONT_W, FRONT_H);
  }

  private animate() {
    this.walkOff();
    const now = this.gs.time.now;
    if (this.coach) {
      const c = this.coach, fit = !!this.line?.fit;
      let frame = 0, dx = 0, bob = 0;
      if (fit) { frame = Math.floor(now / 170) % 2 ? 1 : 2; dx = Math.sin(now / 35) * 2.5; bob = -Math.abs(Math.sin(now / 110)) * 5; } // stomping, arms flying
      else if (this.line?.who === 'coach') frame = Math.floor(now / 420) % 3 === 0 ? 1 : 0; // pointing as he talks
      else if (now < c.cheerUntil) { frame = 2; bob = -Math.abs(Math.sin(now / 140)) * 4; }
      else c.x = COACH_X + Math.sin(now / 4200) * 2.5;
      c.sprite.setFrame(frame).setPosition(sx(c.x) + dx, sy(-1.6) + bob);
    }
    if (this.scout) {
      // clipboard held at the chest; now and then he writes something down
      const s = this.scout, writing = Math.sin(now / 1900) > 0.55;
      s.sprite.setFrame(0);
      const h = s.sprite.displayHeight, bx = s.x - 2, by = s.y - h * 0.52;
      const g = s.board.clear();
      g.fillStyle(0x6b4a2a, 1).fillRect(bx - 7, by - 9, 14, 18);
      g.fillStyle(0xf2efe6, 1).fillRect(bx - 5, by - 6, 10, 14);
      g.fillStyle(0xb9b9b9, 1).fillRect(bx - 3, by - 10, 6, 3);
      g.fillStyle(0x7a8090, 1);
      for (let i = 0; i < 4; i++) g.fillRect(bx - 4, by - 3 + i * 3, i === 3 && writing ? 3 + Math.floor(now / 160) % 5 : 7, 1);
      if (writing) { g.fillStyle(0x1a1a1a, 1).fillRect(bx + 1 + Math.floor(now / 160) % 4, by + 3, 2, 7); }
    }
  }
}
