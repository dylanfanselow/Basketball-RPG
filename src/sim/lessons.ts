/**
 * Round 91: the lesson engine shared by the prologue tutorial (`tutorial.ts`) and film study (`film.ts`).
 * Phaser-free. A `LessonDirector` runs every possession of a half-court 2v2 (you + a teammate vs the demo player + one
 * more). Each lesson: blocking lines (✕ to continue), the demo player shows the move on a possession of his own
 * (scripted), then your try with a prompt in the box until the sim shows you did it (✓).
 */
import type { GameSim, GameEvent, Director } from './game';
import { UNCLE_DREW_MIN } from './game';
import type { Player } from './player';
import { hc } from './court';
import { add, dist, norm, scale, sub, v, Vec } from './math';
import { selectShotType } from './shooting';
import { postIntent } from './post';

export type Speaker = 'narrator' | 'kingston' | 'coach' | 'you';
export interface Line { who: Speaker; text: string; /** the speaker's tag (round 91: the player on the tape) */ name?: string; /** show an example shot chance top right while this line is up */ example?: 'shot' }
/** A scripted possession (the demo, or the CPU ball handler on your try). */
export type Demo = 'pullup' | 'cross' | 'post' | 'stepThrough'
  // round 91: film study
  | 'floater' | 'hook' | 'push' | 'combo' | 'comboShot' | 'postKick' | 'drive' | 'help' | 'dreamer' | 'pointGod' | 'euro' | 'fade' | 'jelly' | 'uncleDrew';
/** Who has the ball: you, your teammate, the demo player (Kingston, the player on the tape) or his teammate. */
export type Holder = 'me' | 'mate' | 'demo' | 'other';
export interface LessonCtx { sim: GameSim; me: Player; mate: Player; demo: Player; other: Player; d: LessonDirector<any> }
export interface Step<C extends LessonCtx = LessonCtx> {
  prompt: string; check: (c: C, e: GameEvent | null) => boolean;
  /** round 60c: you blew this step (e.g. a plain jumper after the fake), back to the lesson's first step */
  fail?: (c: C, e: GameEvent | null) => boolean;
}
export interface Lesson<C extends LessonCtx = LessonCtx> {
  id: string; title: string;
  /** blocking lines when the lesson starts */
  before?: Line[];
  /** the demo player's script on his possession first (scripted), with a line while he plays */
  demo?: Demo; demoTalk?: Line;
  /** round 91: who has the ball during the demo (default the demo player); `demoDrive` is that holder's script */
  demoBall?: Holder; demoDrive?: Demo;
  /** blocking lines after the demo, before your try */
  after?: Line[];
  /** who has the ball on your try; `script` = what that CPU holder runs (a defensive rep) */
  ball: Holder; script?: Demo;
  steps: Step<C>[];
  outro?: Line[];
  /** run the tutorial play (follow the circles) during the try */
  play?: boolean;
  /** round 60c: a new possession mid-lesson starts the steps over (multi-step moves: fake → step-through, post → score) */
  restartOnNewBall?: boolean;
}

/** What the box shows: a blocking line (✕ to continue) or the current prompt. */
export interface BoxView { who: Speaker; text: string; name?: string; blocking: boolean; example?: 'shot'; title?: string; step?: number; steps?: number; doneAt?: number; /** round 60c: when you last blew a step */ failAt?: number }

export type Phase = 'demoWait' | 'demo' | 'tryWait' | 'try' | 'done' | 'finished';

/** Fill {you}, {mate}, {other}, {demo} with first names. */
export const fill = (t: string, n: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k) => n[k] ?? k);
/** An event by you of this kind. */
export const mine = (c: LessonCtx, e: GameEvent | null, kind: string) => !!e && e.kind === kind && e.pid === c.me.id;
export const madeShot = (c: LessonCtx, e: GameEvent | null) => mine(c, e, 'score');

export abstract class LessonDirector<C extends LessonCtx = LessonCtx> implements Director {
  i = 0;
  step = 0;
  phase: Phase = 'tryWait';
  queue: Line[] = [];
  /** the line currently up (blocking) */
  line: Line | null = null;
  /** sim time of the last ✓ (UI flash) */
  checkAt = -9;
  /** sim time of the last miss (back to step 1; UI: red flash, "Missed it") */
  failAt = -9;
  /** progress counters for tick-based checks */
  moved = 0; sprintT = 0;
  /** last sim time you were in the post (a post shot ends the post just before its gather event) */
  lastPostAt = -9;
  protected demoT = 0; protected demoMoves = 0; protected demoFaked = -1; protected postT = 0; protected demoShotAt = -1;
  private doneAt = 0;
  private lastPos: Vec | null = null;
  names: Record<string, string> = {};

  /** `ending`: lines once every lesson is done; `finished` once they've been read. */
  constructor(protected sim: GameSim, public lessons: Lesson<C>[], public ending: Line[] = []) {}

  /** Subclasses call this at the end of their constructor (their fields are set by then). */
  protected begin() {
    const first = (p: Player) => p.name.split(' ')[0];
    const c = this.ctx();
    this.names = { you: first(c.me), mate: first(c.mate), other: first(c.other), demo: first(c.demo), ...this.extraNames(c) };
    this.startLesson(0);
  }
  protected extraNames(_c: C): Record<string, string> { return {}; }

  /** The cast this tick. */
  abstract ctx(): C;

  get lesson(): Lesson<C> | null { return this.lessons[this.i] ?? null; }
  /** GameScene: don't step the sim while a line is up. */
  get blocking() { return !!this.line; }
  get finished() { return this.phase === 'finished' && !this.line; }

  protected say(lines: Line[] | undefined) {
    for (const l of lines ?? []) this.queue.push({ ...l, text: fill(l.text, this.names) });
    if (!this.line) this.line = this.queue.shift() ?? null;
  }
  /** ✕ on a blocking line: the next one (or back to play). */
  nextLine() { this.line = this.queue.shift() ?? null; }

  view(): BoxView | null {
    if (this.line) return { ...this.line, blocking: true };
    const L = this.lesson;
    if (!L || this.phase === 'finished') return null;
    if (this.phase === 'demo' && L.demoTalk) return { who: L.demoTalk.who, name: L.demoTalk.name, text: fill(L.demoTalk.text, this.names), blocking: false, title: L.title };
    if (this.phase === 'try' || this.phase === 'done') {
      const st = L.steps[Math.min(this.step, L.steps.length - 1)];
      const missed = this.sim.time - this.failAt < 2 && this.step === 0;
      return { who: 'narrator', text: (missed ? 'Missed it: ' : '') + fill(st.prompt, this.names), blocking: false, title: L.title, step: Math.min(this.step + 1, L.steps.length), steps: L.steps.length, doneAt: this.checkAt, failAt: this.failAt };
    }
    return null;
  }

  protected startLesson(i: number) {
    this.i = i; this.step = 0; this.moved = 0; this.sprintT = 0;
    const L = this.lesson;
    if (!L) { this.phase = 'finished'; this.say(this.ending); return; }
    this.say(L.before);
    this.phase = L.demo ? 'demoWait' : 'tryWait';
  }
  /** Dev / pause menu: jump to the next lesson. */
  skipLesson() { this.queue = []; this.line = null; this.onLessonEnd(this.lesson); this.startLesson(this.i + 1); }
  skipAll() { this.queue = []; this.line = null; this.onLessonEnd(this.lesson); this.i = this.lessons.length; this.phase = 'finished'; }

  // ---------- hooks ----------
  /** Your try starts (a fresh possession of it). */
  protected onTryStart(_L: Lesson<C>) {}
  /** A lesson ends (done or skipped). */
  protected onLessonEnd(_L: Lesson<C> | null) {}
  /** Every tick of your try. */
  protected tryTick(_L: Lesson<C>, _sim: GameSim) {}
  /** A cast member's part on your try; true = handled, false = the AI plays him, undefined = not handled here. */
  protected thinkTry(_c: C, _p: Player, _L: Lesson<C>, _dt: number): boolean | undefined { return undefined; }

  // ---------- possessions ----------
  protected holderOf(c: C, h: Holder): Player { return h === 'me' ? c.me : h === 'mate' ? c.mate : h === 'demo' ? c.demo : c.other; }
  protected setup(holder: Holder) {
    const s = this.sim, c = this.ctx();
    const h = this.holderOf(c, holder);
    const team = h.team;
    s.checkBall(team);
    const top = s.holder();
    if (top && top !== h) { const t = top.p; top.p = h.p; h.p = t; s.giveBall(h); }
    this.pinMatchups();
    const rim = s.rim(team);
    for (const d of s.teams[1 - team].onCourt) {
      const m = s.players.find((q) => q.id === d.guarding) ?? h;
      d.p = add(m.p, scale(norm(sub(rim, m.p)), m === h ? 4.5 : 4));
      d.face = norm(sub(m.p, d.p)); d.vel = v();
    }
    h.face = norm(sub(rim, h.p));
    s.shotClock = 99;
    this.demoT = 0; this.demoMoves = 0; this.demoFaked = -1; this.postT = 0; this.demoShotAt = -1; this.lastPos = null;
  }
  /** Same-position matchups: the demo player on you, the other two on each other. */
  protected pinMatchups() {
    const c = this.ctx();
    c.demo.guarding = c.me.id; c.me.guarding = c.demo.id; c.other.guarding = c.mate.id; c.mate.guarding = c.other.id;
  }

  onReset(): boolean {
    const L = this.lesson;
    if (L && this.phase === 'demo') this.setup(L.demoBall ?? 'demo');   // the demo got broken up: run it again
    else if (L && this.phase === 'try') { this.setup(L.ball); this.onTryStart(L); if (L.restartOnNewBall && this.step > 0) this.miss(); }
    // otherwise wait (lines up, or between lessons): tick() sets up the next possession
    return true;
  }

  tick(sim: GameSim, dt: number) {
    const c = this.ctx(), L = this.lesson;
    sim.shotClock = Math.max(sim.shotClock, 30);
    this.pinMatchups();
    if (this.line) return;
    if (this.phase === 'demo') this.demoT += dt;
    if (this.phase === 'demoWait') { this.setup(L?.demoBall ?? 'demo'); this.phase = 'demo'; return; }
    if (this.phase === 'tryWait' && L) { this.setup(L.ball); this.onTryStart(L); this.phase = 'try'; this.step = 0; return; }
    if (this.phase === 'demo' && this.demoT > 12) { this.endDemo(); return; } // safety
    if (this.phase === 'try' && L) {
      // tick-based progress (movement, sprint)
      if (this.lastPos) this.moved += dist(this.lastPos, c.me.p);
      this.lastPos = { ...c.me.p };
      if (c.me.sprinting) this.sprintT += dt;
      if (c.me.post) this.lastPostAt = sim.time;
      this.check(null);
      this.tryTick(L, sim);
    }
    if (this.phase === 'done' && sim.time >= this.doneAt && sim.ball.st.kind !== 'shot') {
      this.onLessonEnd(L);
      this.say(L?.outro);
      sim.live = false; // everyone stops while the next lesson starts
      this.startLesson(this.i + 1);
    }
  }

  protected endDemo() { this.phase = 'tryWait'; this.say(this.lesson?.after); }

  onEvent(sim: GameSim, e: GameEvent) {
    // the demo is over when its shot comes down (a make, a miss, a block)
    if (this.phase === 'demo' && (e.kind === 'score' || e.kind === 'miss' || e.kind === 'block')) { this.endDemo(); return; }
    if (this.phase === 'try') this.check(e);
  }

  protected check(e: GameEvent | null) {
    const L = this.lesson;
    if (!L) return;
    const st = L.steps[this.step];
    if (st && this.step > 0 && st.fail?.(this.ctx(), e)) { this.miss(); return; }
    if (st && st.check(this.ctx(), e)) {
      this.step++; this.checkAt = this.sim.time;
      this.sim.quiet('tutorialCheck', { lesson: L.id, step: this.step });
      if (this.step >= L.steps.length) { this.phase = 'done'; this.doneAt = this.sim.time + 1.3; }
    }
  }

  /** You blew a step: back to the lesson's first step. */
  protected miss() {
    this.step = 0; this.failAt = this.sim.time;
    this.sim.quiet('tutorialMiss', { lesson: this.lesson?.id });
  }

  // ---------- scripted players ----------
  think(sim: GameSim, p: Player, dt: number): boolean {
    const c = this.ctx(), L = this.lesson;
    if (!L || !sim.live) return false;
    const hasBall = sim.holder() === p;
    if (this.phase === 'demo') {
      if (p === c.demo && L.demo) { this.runDemo(sim, p, L.demo, dt); return true; }
      if (hasBall && L.demoDrive) { this.runDemo(sim, p, L.demoDrive, dt); return true; }
      return false;
    }
    if (this.phase === 'try') {
      const own = this.thinkTry(c, p, L, dt);
      if (own !== undefined) return own;
      if (hasBall && p !== c.me && L.script) { this.demoT += dt; this.runDemo(sim, p, L.script, dt); return true; }
    }
    return false;
  }

  /** A scripted possession for `p` (the demo, or the CPU ball handler on your try). */
  protected runDemo(sim: GameSim, p: Player, demo: Demo, dt: number) {
    const side = sim.side(p.team), rim = sim.rim(p.team);
    const toRim = norm(sub(rim, p.p));
    const lat = { x: -toRim.y, y: toRim.x };
    const d = dist(p.p, rim);
    const mate = sim.mates(p)[0];
    if (demo === 'help') { this.runHelp(sim, p); return; }
    // the pass out of a shot / a post: wait for the shot to be under way
    if (demo === 'pointGod' && this.demoShotAt >= 0 && p.state === 'shoot') {
      if (this.demoT - this.demoShotAt > 0.18 && mate) sim.pass(p, mate);
      return;
    }
    if (demo === 'jelly' && this.demoShotAt >= 0 && p.state === 'shoot') {
      if (this.demoT - this.demoShotAt > 0.2) sim.jellyFake(p);
      return;
    }
    if (demo === 'uncleDrew' && p.state === 'dribbleMove' && this.demoMoves > 0 && this.demoMoves < 3 && p.stateT >= UNCLE_DREW_MIN + 0.1) {
      this.demoMoves++; sim.dribbleMove(p, scale(lat, this.demoMoves % 2 ? -1 : 1)); return; // cancel straight into the next one
    }
    if (p.busy || p.state === 'dribbleMove') return;
    if (demo === 'pullup') {
      const at = hc(side, 17, 6);
      sim.steer(p, at, false);
      if (dist(p.p, at) < 1.4 || this.demoT > 3.5) sim.startShot(p, selectShotType(p, side, v(), sim.time));
    } else if (demo === 'cross' || demo === 'drive') {
      const nd = sim.nearestDefender(p);
      if (!this.demoMoves && (this.demoT > 1.2 && (nd.dist < 6.5 || this.demoT > 2.6))) {
        this.demoMoves = 1; sim.dribbleMove(p, lat); return;
      }
      sim.steer(p, add(rim, scale(toRim, -2)), this.demoMoves > 0);
      if (this.demoMoves && d < 6) sim.startShot(p, selectShotType(p, side, toRim, sim.time));
    } else if (demo === 'post' || demo === 'postKick') {
      const at = hc(side, 12, 8);
      if (!p.post && this.postT === 0) {
        sim.steer(p, at, false);
        if (dist(p.p, at) < 1.6 || this.demoT > 3) { postIntent(p, true, toRim); this.postT = 0.001; }
        return;
      }
      this.postT += dt;
      if (demo === 'postKick') {
        // hold the post until the double comes, then kick it to the man he left
        const helped = !!p.post?.helpCalled;
        if (!helped && this.postT < 4 && this.demoT < 9) { postIntent(p, true, scale(toRim, 0.4)); return; }
        if (mate && sim.holder() === p) sim.pass(p, mate);
        return;
      }
      if (this.postT < 2.0 && this.demoT < 8) { postIntent(p, true, toRim); return; }
      postIntent(p, false, v());
      sim.startShot(p, selectShotType(p, side, lat, sim.time));
    } else if (demo === 'stepThrough' || demo === 'dreamer') {
      const at = demo === 'dreamer' ? add(rim, scale(norm(sub(hc(side, 9, 5), rim)), 8)) : hc(side, 15, 3);
      if (this.demoFaked < 0) {
        sim.steer(p, at, false);
        // Dreamer: the stick sideways sells the hook
        if (dist(p.p, at) < 1.6 || this.demoT > 3) { sim.pumpFake(p, demo === 'dreamer' ? lat : v()); this.demoFaked = this.demoT; }
        return;
      }
      if (this.demoT - this.demoFaked > 0.1) sim.startShot(p, 'stepThrough');
    } else if (demo === 'floater' || demo === 'hook' || demo === 'push' || demo === 'fade' || demo === 'euro') {
      // drive to the spot for that shot, then let it go
      const spotD = demo === 'floater' ? 9 : demo === 'hook' ? 6 : demo === 'push' ? 10 : demo === 'fade' ? 15 : 7.5;
      const wing = demo === 'fade' ? 6 : 3.5;
      const at = add(rim, scale(norm(sub(hc(side, spotD + 6, wing), rim)), spotD));
      sim.steer(p, demo === 'euro' ? rim : at, demo === 'euro' || demo === 'floater');
      if (dist(p.p, at) < 1.5 || (demo === 'euro' && d < 8) || this.demoT > 4) { this.demoShotAt = this.demoT; sim.startShot(p, demo); }
    } else if (demo === 'combo' || demo === 'comboShot' || demo === 'uncleDrew') {
      // dribble moves back to back, then the finish (combo), the jumper (comboShot)
      const want = demo === 'comboShot' ? 1 : 2;
      if (this.demoT < 0.9) { sim.steer(p, add(p.p, scale(toRim, 3)), false); return; }
      if (this.demoMoves < (demo === 'uncleDrew' ? 1 : want)) {
        this.demoMoves++;
        const stick = demo === 'comboShot' ? scale(toRim, -1) : this.demoMoves === 1 ? toRim : lat;
        sim.dribbleMove(p, stick);
        return;
      }
      if (demo === 'comboShot') { sim.startShot(p, selectShotType(p, side, v(), sim.time)); return; }
      sim.steer(p, add(rim, scale(toRim, -2)), true);
      if (d < 6) sim.startShot(p, selectShotType(p, side, toRim, sim.time));
    } else if (demo === 'pointGod' || demo === 'jelly') {
      // attack the rim, go up (a layup / a dunk), then the pass out of it or the jelly in the air
      sim.steer(p, rim, true);
      if (d < (demo === 'jelly' ? 3.5 : 6)) { this.demoShotAt = this.demoT; sim.startShot(p, demo === 'jelly' ? 'dunk' : 'layup'); }
    }
  }

  /** The help defender (round 91): sit in the gap, slide into the driver's path, rise with his shot. */
  protected runHelp(sim: GameSim, p: Player) {
    const h = sim.holder();
    const rim = sim.rim((1 - p.team) as 0 | 1);
    const man = sim.players.find((q) => q.id === p.guarding);
    if (!h || h.team === p.team) { if (man) sim.steer(p, add(man.p, scale(norm(sub(rim, man.p)), 4)), false); return; }
    const hd = dist(h.p, rim);
    if (hd < 17 && h !== man) {
      // between him and the rim, a step in front of him
      const at = add(h.p, scale(norm(sub(rim, h.p)), Math.min(3.2, hd * 0.45)));
      sim.steer(p, at, true);
      if (h.state === 'shoot' && dist(p.p, h.p) < 5) sim.jump(p, 0.9);
    } else if (man) sim.steer(p, add(man.p, scale(norm(sub(rim, man.p)), hd < 26 ? 7 : 4)), false); // sag off into the gap
  }
}
