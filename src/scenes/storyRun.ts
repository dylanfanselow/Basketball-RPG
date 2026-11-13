import Phaser from 'phaser';
import type { GameScene } from './GameScene';
import type { GameEvent } from '../sim/game';
import { StoryBox, BoxContent, BoxSpeaker } from '../render/storyBox';
import { TutorialDirector } from '../sim/tutorial';
import { RIVAL_ID, LOCKED_IN, squadCaptain } from '../sim/story';
import { CORE_STATS } from '../sim/data';
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

  /** Round 80c: Kingston's trash talk in the final (a speech bubble over his head). */
  private talkG: Phaser.GameObjects.Graphics | null = null;
  private talkT: Phaser.GameObjects.Text | null = null;
  private talkUntil = 0;
  private nextTalkAt = 0;
  private halfDone = false;
  /** Round 80g: how many times Kingston has said each line tonight. */
  private said = new Map<string, number>();
  /** Round 80e: halftime at the bench: walk over, the coach talks, walk back (court ft per player). */
  private half: { phase: 'toBench' | 'talk' | 'back'; t: number; home: Map<string, { x: number; y: number }>; bench: Map<string, { x: number; y: number }>; coach: Map<0 | 1, { x: number; y: number }> } | null = null;
  private wasLate = false;

  constructor(private gs: GameScene, public which: StoryGame) {
    this.box = new StoryBox(gs);
    this.dir = gs.sim.director instanceof TutorialDirector ? gs.sim.director : null;
    const c = app.career, k = c.story?.rival;
    const you = c.firstName || c.name.split(' ')[0];
    if (which === 'ones') {
      this.say([
        { who: 'kingston', text: `Just us now. Make it, take it. Don't cry when I cook you, ${you}.` },
      ]);
    } else if (which === 'kingston') {
      // round 80: the day after the big game, Kingston alone on the school court. Confused, then jealous, then gone.
      if (c.story) { c.story.checkKingston = false; app.changed(); }
      const great = !!c.story?.bigGame?.great;
      this.say([
        { who: 'kingston', text: 'Look who it is. Mr. Starter.' },
        { who: 'me', name: you, text: 'How you feeling? Ma said you were sick as a dog.' },
        { who: 'kingston', text: 'Man, I still don\'t get it. I was fine. Woke up, ate, had my coffee. Same as every game day.' },
        { who: 'kingston', text: 'Then outta nowhere my stomach\'s turning inside out. And by the time the game\'s over? Nothing. Like somebody flipped a switch.' },
        { who: 'kingston', text: 'Sick for one day. One. And it had to be THE day.' },
        { who: 'kingston', text: great ? 'Heard you went off. Whole street\'s talking.' : 'Heard the scout wrote your name down.' },
        { who: 'me', name: you, text: 'I just played, man. It should\'ve been you out there.' },
        { who: 'kingston', text: 'Yeah. It should\'ve.' },
        { who: 'kingston', text: 'I been out here every morning since I was eight. Rain, cold, whatever. All for that one day.' },
        { who: 'kingston', text: 'And a guy like you gets the chance? How? Why you? Why not me?' },
        { who: 'me', name: you, text: 'Kingston, come on. I didn\'t ask for any of this.' },
        { who: 'kingston', text: 'You didn\'t have to ask. That\'s the thing. It just fell in your lap.' },
        { who: 'kingston', text: 'Nah. I\'m done with this place. This court, this school, all of it.' },
        { who: 'kingston', text: 'I\'ll figure out a way. Watch me.', then: () => { sfx.music('mom'); this.kingstonLeaves(0.45); } },
        { who: 'you', text: 'He\'ll cool off. He always does.', then: () => this.goTo('paper') },
      ]);
    } else if (which === 'final') {
      // round 80: three months later, the national final in the arena; Kingston plays for Crestview now
      const line = c.story?.momCall === 'go' ? 'Play my heart out. For her.' : 'Just hold out, Ma. One more game.';
      this.talkG = gs.add.graphics().setDepth(9150).setVisible(false);
      this.talkT = gs.add.text(0, 0, '', { fontFamily: FONT, fontSize: '15px', color: '#14121e', fontStyle: 'bold', align: 'center', wordWrap: { width: 260 } }).setOrigin(0.5).setDepth(9151).setVisible(false);
      this.nextTalkAt = gs.time.now + 6000;
      this.say([
        { who: 'narrator', text: 'The national championship. Lincoln vs. Crestview Prep.' },
        { who: 'kingston', text: `Told you I'd figure out a way, ${you}.` },
        { who: 'you', text: line, then: () => this.banner('NATIONAL CHAMPIONSHIP', 'LINCOLN LIONS  vs  CRESTVIEW PREP FALCONS') },
      ]);
    } else if (which === 'bigGame') {
      this.buildCoach(); this.buildScout();
      const last = c.lastName || c.name.split(' ').slice(-1)[0];
      const kn = k ? k.last : 'Williams';
      // round 60b: a teammate notices you look wiped out (you didn't sleep much last night...)
      // round 80e: it's the captain who notices
      const mates = gs.sim.teams[0].roster.filter((p) => p !== gs.sim.user);
      const mate = mates.length ? squadCaptain(c, mates) : null;
      const mateName = mate ? `${mate.name.split(' ')[0]} (Captain)` : 'Teammate';
      this.say([
        { who: 'narrator', text: 'The next day. Lincoln High, game day. A man with a clipboard sits on the bleachers.' },
        { who: 'mate', name: mateName, text: 'Yo, you good? You look dead tired.' },
        { who: 'me', name: you, text: 'Didn\'t get much sleep last night.' },
        { who: 'mate', name: mateName, text: 'Well wake up. Coach is looking for Kingston and he ain\'t here.' },
        { who: 'coach', text: `Where's ${kn}? WHERE IS ${kn.toUpperCase()}?!`, fit: true },
        { who: 'coach', text: 'A stomach virus?! TODAY?! The one day, the ONE day, a scout drives three hours to watch him!', fit: true },
        { who: 'coach', text: 'Unbelievable. Un-be-lievable.', fit: true },
        { who: 'coach', text: `...Fine. #${c.number}. ${last}. You're starting.` },
        // owner: no narrator box for LOCKED IN, just the pop text when the coach's last line closes
        { who: 'coach', text: 'Everybody locked in! Good fundamental ball: box out, talk on D, make the extra pass. There\'s a scout in the stands today.', then: () => this.banner('LOCKED IN', `+${LOCKED_IN} ALL STATS  ·  THE SCOUT IS WATCHING`) },
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
    let hold = this.cutscene || !!this.half; // round 80: the court visit never plays; round 80e: halftime holds the game
    this.stepHalf();
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
    if (this.which === 'bigGame' || this.which === 'final') return false; // PostGame (story branch) → home
    if (this.overHandled) return true;
    this.overHandled = true;
    if (this.which === 'ones') {
      const sim = this.gs.sim, c = app.career;
      const youWon = sim.teams[0].score > sim.teams[1].score;
      const you = c.firstName || c.name.split(' ')[0];
      // round 60e: give them a moment to land and stand before he talks (GameScene settles the sim meanwhile)
      this.gs.time.delayedCall(1300, () => this.say([
        youWon
          ? { who: 'kingston', text: 'Rain got in my eyes. ...Nah, that was nice. Don\'t get used to it.' }
          : { who: 'kingston', text: `Good run, ${you}. You're gettin' there. Just not there.` },
        { who: 'kingston', text: 'Big day tomorrow. See you tomorrow. Don\'t be late.', then: () => { sfx.music(null); this.kingstonLeaves(); } }, // the game music fades as he goes
        { who: 'you', text: 'Everybody wants out of here. Me too.' },
        { who: 'you', text: 'But he\'s so much better than me... The scout\'s never even gonna notice me.', then: () => this.goTo('night') },
      ]));
      return true;
    }
    this.goTo('ones');
    return true;
  }

  /** Feed from GameScene.onEvent: the coach reacts in the big game. */
  onEvent(e: GameEvent) {
    if (this.coach && e.kind === 'score' && e.team === 0) this.coach.cheerUntil = this.gs.time.now + 1600;
    if (this.which !== 'final') return;
    // round 80c: Kingston talks trash; the coach talks to you at the half
    const me = this.gs.sim.user;
    if (e.kind === 'period' && e.text === 'End of H1' && !this.halfDone) { this.halfDone = true; this.startHalf(); return; }
    const his = e.pid === RIVAL_ID;
    // round 80e: his signature moments always get their line
    if (e.kind === 'ult' && his && e.data?.id === 'deepStepback') this.talk(['Let\'s dance.'], true);
    else if (e.kind === 'ult' && his && e.data?.id === 'ftTakeoff') this.talk(['Too small.'], true);
    else if (e.kind === 'play' && his && e.data?.iso && Math.random() < 0.4) this.talk(KINGSTON_TALK.iso);
    else if (e.kind === 'score' && his && e.data?.post) this.talk(['Too small.'], true);
    else if (e.kind === 'score' && his && e.data?.pts === 3 && Math.random() < 0.7) this.talk(['Splash.'], Math.random() < 0.5);
    else if (e.kind === 'score' && his && Math.random() < 0.75) this.talk(KINGSTON_TALK.scores);
    else if (e.kind === 'block' && his) this.talk(KINGSTON_TALK.blocks, true);
    else if (e.kind === 'steal' && his) this.talk(KINGSTON_TALK.steals, true);
    else if (e.kind === 'score' && me && e.pid === me.id && Math.random() < 0.5) this.talk(KINGSTON_TALK.youScore);
  }

  /** Round 80c: one of Kingston's lines in a bubble over his head (throttled; `force` skips the wait). */
  private talk(lines: string[], force = false) {
    const now = this.gs.time.now, g = this.talkG, t = this.talkT;
    if (!g || !t || (!force && now < this.nextTalkAt)) return;
    if (!this.gs.sim.players.some((p) => p.id === RIVAL_ID)) return;
    // round 80g (owner): lines wear out: weighted toward the fresh ones, and a line said n times only gets said WEAR^n
    // of the time (forced lines too: force only skips the wait)
    const fresh = lines.map((l) => TALK_WEAR ** (this.said.get(l) ?? 0));
    let r = Math.random() * fresh.reduce((a, b) => a + b, 0), pick = 0;
    for (; pick < lines.length - 1; pick++) { r -= fresh[pick]; if (r <= 0) break; }
    if (Math.random() >= fresh[pick]) return;
    const line = lines[pick];
    this.said.set(line, (this.said.get(line) ?? 0) + 1);
    this.talkUntil = now + 2600; this.nextTalkAt = now + 9000;
    t.setText(line);
    const w = t.width + 22, h = t.height + 14;
    g.clear();
    g.fillStyle(0x000000, 0.35); g.fillRoundedRect(-w / 2 + 2, -h / 2 + 3, w, h, 8);
    g.fillStyle(0xffffff, 1); g.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    g.fillTriangle(-6, h / 2 - 1, 6, h / 2 - 1, 0, h / 2 + 10);
    g.lineStyle(2, 0x1c2b4a, 1); g.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    g.lineBetween(-6, h / 2, 0, h / 2 + 10); g.lineBetween(6, h / 2, 0, h / 2 + 10);
    g.setData('h', h);
  }

  /** Keep the bubble over Kingston's head; hide it while a story line is up or once it's said. */
  private drawTalk() {
    const g = this.talkG, t = this.talkT; if (!g || !t) return;
    const sim = this.gs.sim;
    if (!this.wasLate && sim.lateWindow && !sim.over) { this.wasLate = true; this.talk(KINGSTON_TALK.clutch, true); }
    const spr = this.gs.sprites.get(RIVAL_ID);
    const show = !!spr && spr.visible && !this.line && this.gs.time.now < this.talkUntil;
    g.setVisible(show); t.setVisible(show);
    if (!show || !spr) return;
    const top = spr.getTopCenter(), h = (g.getData('h') as number) ?? 30;
    // on screen: inside the view's sides, below the top bar
    const cam = this.gs.cameras.main, w = t.width + 22;
    const x = Phaser.Math.Clamp(top.x ?? spr.x, cam.scrollX + w / 2 + 8, cam.scrollX + VIEW_W - w / 2 - 8);
    const y = Math.max(cam.scrollY + 70 + h / 2, (top.y ?? spr.y) - h / 2 - 4);
    g.setPosition(x, y); t.setPosition(x, y);
  }

  /**
   * Round 80e: the end of the first half. Everyone walks over to stand in front of his team's empty seats (the
   * reserves sit next to the assistant coaches); then the coach talks (`halftime`); then back out to the floor.
   */
  private startHalf() {
    const sim = this.gs.sim, home = new Map<string, { x: number; y: number }>(), bench = new Map<string, { x: number; y: number }>();
    // round 80f (owner): the starters huddle round their head coach (on the sideline at y -1.6) and face him; the ring
    // is open toward the camera so he stays in the picture
    const RING = [205, 155, 118, 25, 335].map((d) => (d * Math.PI) / 180);
    const coachOf = new Map<0 | 1, { x: number; y: number }>();
    for (const t of [0, 1] as const) {
      const c = this.gs.coaches.find((q) => q.team === t);
      const at = { x: c ? c.home : t === 0 ? 26.5 : 67.5, y: -1.6 };
      coachOf.set(t, at);
      sim.teams[t].onCourt.forEach((p, i) => {
        home.set(p.id, { ...p.p });
        const a = RING[i % RING.length];
        bench.set(p.id, { x: at.x + Math.cos(a) * 3.8, y: at.y + Math.sin(a) * 2.4 });
      });
    }
    this.half = { phase: 'toBench', t: 0, home, bench, coach: coachOf };
  }

  /** Round 80f: a player in the huddle looks at his coach. */
  private faceCoach(p: { team: 0 | 1; p: { x: number; y: number } }): { x: number; y: number } {
    const c = this.half?.coach.get(p.team); if (!c) return { x: 0, y: 1 };
    const dx = c.x - p.p.x, dy = c.y - p.p.y, d = Math.hypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d };
  }

  /** Walk everyone toward their spots for this phase (the same stride rooms use: GameScene animates from velocity). */
  private stepHalf() {
    const h = this.half; if (!h) return;
    const sim = this.gs.sim, dt = Math.min(0.05, this.gs.game.loop.delta / 1000);
    h.t += dt;
    if (h.phase === 'talk') {
      for (const p of sim.players) { p.vel = { x: 0, y: 0 }; p.face = this.faceCoach(p); }
      if (!this.line && !this.queue.length) { h.phase = 'back'; h.t = 0; }
      return;
    }
    const spots = h.phase === 'toBench' ? h.bench : h.home;
    let moving = false;
    for (const p of sim.players) {
      const to = spots.get(p.id); if (!to) continue;
      const dx = to.x - p.p.x, dy = to.y - p.p.y, d = Math.hypot(dx, dy);
      p.state = 'idle'; p.anim = null; p.z = 0; p.vz = 0;
      if (d < 0.25) { p.vel = { x: 0, y: 0 }; if (h.phase === 'toBench') p.face = this.faceCoach(p); continue; }
      moving = true;
      const sp = Math.min(h.phase === 'toBench' ? 9 : 12, d / dt);
      p.vel = { x: dx / d * sp, y: dy / d * sp };
      p.p = { x: p.p.x + p.vel.x * dt, y: p.p.y + p.vel.y * dt };
      p.face = { x: dx / d, y: dy / d };
    }
    const late = h.t > (h.phase === 'toBench' ? 6 : 6);
    if (moving && !late) return;
    if (late) for (const p of sim.players) { const to = spots.get(p.id); if (to) p.p = { ...to }; }
    for (const p of sim.players) p.vel = { x: 0, y: 0 };
    if (h.phase === 'toBench') { h.phase = 'talk'; h.t = 0; this.halftime(); return; }
    // back on the floor: play resumes, and Kingston has something to say about it
    this.half = null;
    const me = sim.user;
    if (me) {
      const crestview = sim.teams[1 - me.team].score, lincoln = sim.teams[me.team].score;
      this.nextTalkAt = 0;
      this.gs.time.delayedCall(900, () => this.talk(crestview > lincoln ? KINGSTON_TALK.mock : KINGSTON_TALK.gas, true));
    }
  }

  /**
   * Round 80c: the end of the first half. Down: the coach tells you to play the game, not the emotions, and you lock
   * back in ("I NEED TO WIN THIS": +6 on every stat). Up or tied: don't get complacent, Kingston still has tricks.
   */
  private halftime() {
    const sim = this.gs.sim, me = sim.user, c = app.career;
    if (!me) return;
    const you = c.firstName || c.name.split(' ')[0];
    const mine = sim.teams[me.team].score, theirs = sim.teams[1 - me.team].score;
    const cap = squadCaptain(c, sim.teams[me.team].roster.filter((p) => p !== me));
    const capName = `${cap.name.split(' ')[0]} (Captain)`;
    if (mine < theirs) {
      this.say([
        { who: 'narrator', text: `Halftime. Crestview ${theirs}, Lincoln ${mine}.` },
        { who: 'coach', text: `Bring it in. ${you}. Look at me.` },
        { who: 'coach', text: 'I know who\'s on the other side. We all know. But you\'re playing him, not the game.' },
        { who: 'coach', text: 'Every time he talks, you bite. Focus on the game, not your emotions.' },
        { who: 'coach', text: 'Run our stuff. Make the extra pass. Box out. The score takes care of itself.' },
        { who: 'you', text: 'I need to win this.', then: () => {
          for (const s of CORE_STATS) me.core[s] = Math.min(99, me.core[s] + NEED_TO_WIN);
          me.recompute();
          this.banner('I NEED TO WIN THIS', `+${NEED_TO_WIN} ALL STATS  ·  FOCUS ON THE GAME`);
        } },
      ]);
    } else {
      this.say([
        { who: 'narrator', text: `Halftime. Lincoln ${mine}, Crestview ${theirs}.` },
        { who: 'coach', text: 'Good half. Good half. But nobody in here gets comfortable. A lead at the half is just a number.' },
        { who: 'coach', text: `Kingston's still got a few tricks in his bag, ${you}. He's been waiting all year for this one.` },
        { who: 'coach', text: 'Be careful with the ball. Don\'t give him anything easy. Don\'t get complacent.' },
        { who: 'mate', name: capName, text: 'You heard him. One more half.' },
      ]);
    }
  }

  /** Round 80: a story scene on the court that isn't a game (Kingston at the school): no HUD, no game music. */
  get cutscene(): boolean { return this.which === 'kingston'; }

  /** The tutorial's shot-chance lines: GameScene shows an example number top right meanwhile. */
  get shotExample(): boolean { return !this.line && this.dir?.view()?.example === 'shot'; }

  pauseOptions(): string[] { return this.dir ? ['Skip lesson', 'Skip to the 1s'] : this.which === 'ones' ? ['Skip to that night'] : this.which === 'kingston' ? ['Skip to three months later'] : []; }
  pauseAction(i: number) {
    if (this.dir && i === 0) this.dir.skipLesson();
    else if (this.dir && i === 1) this.goTo('ones');
    else if (this.which === 'ones') this.goTo('night');
    else if (this.which === 'kingston') this.goTo('paper');
  }

  // ---------- transitions ----------
  private goTo(stage: 'ones' | 'night' | 'paper') {
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
  private kingstonLeaves(drift = -0.18) {
    const sim = this.gs.sim, king = sim.players.find((p) => p.id === RIVAL_ID);
    if (!king) return;
    sim.live = false; // nobody's defending anymore (no defensive shuffle)
    if (sim.user && sim.holder() !== sim.user) sim.giveBall(sim.user);
    const away = -sim.side(0); // the hoop is that way; he heads the other way, drifting toward the fence (round 80: or passing in front of you)
    const dir = { x: away, y: drift }, n = Math.hypot(dir.x, dir.y);
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
    this.drawTalk();
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

/** Round 80c: Kingston's trash talk in the national final. */
const KINGSTON_TALK = {
  scores: ['Too easy.', 'Remember the 1s? Same thing.', 'That\'s what the scout should\'ve seen.', 'You still can\'t guard me.', 'Crestview, baby!', 'This guy.'],
  // round 80e (owner): blocks and Chase-Downs, steals (the swear censored, the owner's pick)
  blocks: ['Get that **** outta here!', 'Get that **** outta here!', 'Not in my house.'],
  steals: ['Gimme that.', 'Gimme that.', 'You borrowed my spot. I\'m taking it back.'],
  youScore: ['Lucky.', 'Enjoy it. Won\'t happen again.', 'Oh, now you wanna hoop?', 'This guy.'],
  // coming out of halftime: down (or tied) / up
  gas: ['Time to turn on the gas.'],
  mock: ['What\'d your coach tell you in there? Pray?'],
  clutch: ['This is my moment, not yours.'],
  // round 80g: an iso called for him
  iso: ['Let\'s dance.', 'Guard up.'],
};
/** Round 80c: "I NEED TO WIN THIS" at the half when you're down: on top of locked in. */
const NEED_TO_WIN = 6;

/**
 * Round 80e: the story final's benches (court ft, the seats 2.2 ft apart along `BENCH_X`): the reserves sit next to
 * the assistant coaches (toward midcourt), the five empty seats toward the baseline are the starters'.
 */
export function storyBenchSeats(team: 0 | 1): { reserves: number[]; empty: number[] } {
  const start = team === 0 ? 4 : 72, seat = (i: number) => start + i * 2.2;
  return team === 0
    ? { empty: [0, 1, 2, 3, 4].map(seat), reserves: [5, 6, 7, 8].map(seat) }
    : { reserves: [0, 1, 2, 3].map(seat), empty: [4, 5, 6, 7, 8].map(seat) };
}
/** Round 80g: each time Kingston says a line it's this much less likely to come out again. */
const TALK_WEAR = 0.55;
