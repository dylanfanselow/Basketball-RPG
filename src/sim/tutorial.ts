/**
 * Round 60: the prologue tutorial (rainy school court, 2v2). Phaser-free: a `Director` that runs every possession.
 * Each lesson: blocking lines (✕ to continue), Kingston demos the move on his ball (scripted), then your ball with a
 * prompt in the box until the sim shows you did it (✓). The narrator is a nameless text box; Kingston talks in his
 * own named box (the big game tomorrow, the scouts, getting out, and his game-day coffee, which matters later).
 */
import type { GameSim, GameEvent, Director } from './game';
import type { Player } from './player';
import { hc, spot } from './court';
import { add, dist, norm, scale, sub, v, Vec } from './math';
import { selectShotType, STEP_THROUGH_WINDOW } from './shooting';
import { postIntent } from './post';
import { RIVAL_ID } from './story';

export type Speaker = 'narrator' | 'kingston' | 'coach' | 'you';
export interface Line { who: Speaker; text: string; /** show an example shot chance top right while this line is up */ example?: 'shot' }
type Demo = 'pullup' | 'cross' | 'post' | 'stepThrough';
type Holder = 'me' | 'mate' | 'kingston';
interface Ctx { sim: GameSim; me: Player; mate: Player; king: Player; other: Player; d: TutorialDirector }
interface Step {
  prompt: string; check: (c: Ctx, e: GameEvent | null) => boolean;
  /** round 60c: you blew this step (e.g. a plain jumper after the fake), back to the lesson's first step */
  fail?: (c: Ctx, e: GameEvent | null) => boolean;
}
export interface Lesson {
  id: string; title: string;
  /** blocking lines when the lesson starts */
  before?: Line[];
  /** Kingston's possession first (scripted), with a line from him while he plays */
  demo?: Demo; demoTalk?: Line;
  /** blocking lines after the demo, before your try */
  after?: Line[];
  /** who has the ball on your try (kingston = a defensive rep: he runs `kingScript`) */
  ball: Holder; kingScript?: Demo;
  steps: Step[];
  outro?: Line[];
  /** run the tutorial play (follow the circles) during the try */
  play?: boolean;
  /** round 60c: a new possession mid-lesson starts the steps over (multi-step moves: fake → step-through, post → score) */
  restartOnNewBall?: boolean;
}

const mine = (c: Ctx, e: GameEvent | null, kind: string) => !!e && e.kind === kind && e.pid === c.me.id;
const madeShot = (c: Ctx, e: GameEvent | null) => mine(c, e, 'score');

/** Fill {you}, {mate}, {other} with first names. */
const fill = (t: string, n: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k) => n[k] ?? k);

export function buildLessons(): Lesson[] {
  const K = (text: string): Line => ({ who: 'kingston', text });
  const N = (text: string): Line => ({ who: 'narrator', text });
  const X = (text: string): Line => ({ who: 'narrator', text, example: 'shot' }); // with the example number top right
  return [
    {
      id: 'move', title: 'MOVE',
      before: [
        K('Rain or shine, we run it. Big game tomorrow, {you}. Scouts in the stands.'),
        K('Real scouts. This is my shot to get out of this shithole, and I ain\'t missing it.'),
        N('You control only your player.'),
      ],
      ball: 'me',
      steps: [
        { prompt: 'Move with the left stick', check: (c) => c.d.moved >= 12 },
        { prompt: 'Hold R2 to sprint', check: (c) => c.d.sprintT >= 0.35 },
      ],
    },
    {
      id: 'shoot', title: 'SHOOT',
      before: [K('Watch. Square up, rise, release. Every time.')],
      demo: 'pullup', demoTalk: K('Same jumper I\'m hitting tomorrow.'),
      after: [
        N('Hold ✕ to shoot. A quick tap is a pump fake.'),
        X('There\'s no shot meter. The number in the top right is your chance to make the shot you\'re lined up for.'),
        X('It starts from that shot\'s base % and moves with your rating, how open you are and how tired you are.'),
        X('The cone in front of you is where a defender has to be to contest it. Keep defenders out of it to keep that number up.'),
      ],
      ball: 'me',
      steps: [{ prompt: 'Hold ✕ to shoot', check: madeShot }],
    },
    {
      id: 'pass', title: 'PASS',
      before: [
        K('Ball don\'t stick. Find your guy.'),
        N('△ passes to the teammate your stick points at (the dot shows who). A tap passes, a hold throws a lob.'),
      ],
      ball: 'me',
      steps: [
        { prompt: 'Point the stick at {mate} and tap △', check: (c, e) => mine(c, e, 'pass') },
        { prompt: 'Get open and call for it: △ without the ball', check: (c, e) => mine(c, e, 'call') },
        { prompt: 'Here it comes: catch it', check: (c, e) => mine(c, e, 'catch') },
      ],
      outro: [N('Teammates pass on trust and openness, never just because you asked. Get open, run the plays, make good decisions, and the ball finds you.')],
    },
    {
      id: 'dribble', title: 'DRIBBLE MOVES',
      before: [K('Now try to stay in front of me.')],
      demo: 'cross', demoTalk: K('Too slow!'),
      after: [N('○ + the stick = a dribble move. The direction picks the move: toward him, away, side to side. You can unlock more later.')],
      ball: 'me',
      steps: [
        { prompt: 'Push the stick and press ○ for a dribble move', check: (c, e) => mine(c, e, 'move') && !e!.data?.clip && !/step-through/i.test(e!.text) },
        { prompt: 'Now attack the rim and finish (hold ✕)', check: madeShot },
      ],
    },
    {
      id: 'post', title: 'POST UP',
      before: [K('Got somebody small on you? Put him in the basement.')],
      demo: 'post', demoTalk: K('Back him down, turn, done.'),
      after: [N('Hold L2 to post up (inside ~20 ft). Push the stick to back him down, then ✕ shoots out of the post (the stick picks hook, fade or drop).')],
      ball: 'me',
      steps: [
        { prompt: 'Hold L2 to post up', check: (c, e) => mine(c, e, 'post') && /^POST UP/.test(e!.text) },
        { prompt: 'Score out of the post: ✕', check: madeShot,
          // shot without being in the post (or the post window): start over
          fail: (c, e) => mine(c, e, 'gather') && c.sim.time - c.d.lastPostAt > 0.25 && c.sim.time >= c.me.postWindowUntil },
      ],
      restartOnNewBall: true,
    },
    {
      id: 'step', title: 'STEP-THROUGH',
      before: [
        K('Man, I can\'t wait to fry those losers tomorrow. When I get a pregame coffee, no one\'s stopping me.'),
        K('Don\'t laugh. It\'s a ritual. Now the move that\'s getting me a scholarship.'),
      ],
      demo: 'stepThrough', demoTalk: K('He jumps, I go right under him.'),
      after: [N('Tap ✕ to pump fake. If he bites: push the stick at the rim and hold ✕ for a Step-Through.')],
      ball: 'me',
      steps: [
        { prompt: 'Tap ✕ to pump fake', check: (c, e) => mine(c, e, 'move') && !!e!.data?.clip },
        { prompt: 'Stick to the rim + hold ✕: Step-Through', check: (c, e) => mine(c, e, 'move') && /step-through/i.test(e!.text),
          // a plain shot after the fake, or the fake's window ran out: start over from the fake
          fail: (c, e) => (mine(c, e, 'gather') && !String(e!.data?.type ?? '').startsWith('stepThrough'))
            || (!e && c.me.state !== 'shoot' && c.sim.time - c.me.pumpFakeAt > STEP_THROUGH_WINDOW + 0.25) },
      ],
      restartOnNewBall: true,
    },
    {
      id: 'icon', title: 'ICON PASS',
      before: [N('Hold R1 to icon pass.')],
      ball: 'me',
      steps: [{ prompt: 'Hold R1, then press {mate}\'s button', check: (c, e) => mine(c, e, 'iconPass') }],
    },
    {
      id: 'screen', title: 'SCREENS',
      before: [
        K('Set me screens like that tomorrow and I\'ll shout you out in my interview.'),
        N('Without the ball, ○ sets a screen: walk into the man guarding the ball and press ○ (hold it to stay set).'),
      ],
      ball: 'mate',
      steps: [{ prompt: 'Screen {other}: walk into him and press ○', check: (c, e) => mine(c, e, 'screen') && !!e!.good }],
      outro: [K('That\'s how you hold him. Coach would love that.')],
    },
    {
      id: 'play', title: 'PLAYS',
      before: [
        N('In games the coach calls sets. When one\'s on, a yellow circle and a dashed line show where your job is, and the bar at the bottom says what it is.'),
        N('Do your part and you\'ll see ✓. Running plays earns trust: teammates give you the ball, the coach gives you minutes.'),
      ],
      ball: 'mate', play: true,
      steps: [
        { prompt: 'Follow the circle: set the screen', check: (c, e) => mine(c, e, 'grade') && !!e!.good },
        { prompt: 'Roll to the rim: follow the circle', check: (c, e) => (mine(c, e, 'grade') && !!e!.good) || madeShot(c, e) },
      ],
    },
    {
      id: 'defense', title: 'DEFENSE',
      before: [
        K('My ball. Guard me.'),
        N('On defense the red ring is your man. Stay between him and the rim: △ swipes at the ball, ✕ jumps to contest or block. Your cone shrinks his odds.'),
      ],
      ball: 'kingston', kingScript: 'cross',
      steps: [{ prompt: 'Guard Kingston', check: (c, e) => (!!e && e.kind === 'score' && e.pid === c.king.id) || mine(c, e, 'steal') }],
      outro: [K('Gotta move your feet, {you}. Scouts would\'ve seen that.')],
    },
  ];
}

/** What the box shows: a blocking line (✕ to continue) or the current prompt. */
export interface BoxView { who: Speaker; text: string; blocking: boolean; example?: 'shot'; title?: string; step?: number; steps?: number; doneAt?: number; /** round 60c: when you last blew a step */ failAt?: number }

type Phase = 'demoWait' | 'demo' | 'tryWait' | 'try' | 'done' | 'finished';

export class TutorialDirector implements Director {
  lessons = buildLessons();
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
  private demoT = 0; private demoMoved = false; private demoFaked = -1; private postT = 0;
  private doneAt = 0;
  private lastPos: Vec | null = null;
  names: Record<string, string>;
  /** end-of-tutorial lines; `finished` once they've been read */
  ending: Line[];

  constructor(private sim: GameSim) {
    const first = (p: Player) => p.name.split(' ')[0];
    const c = this.ctx();
    this.names = { you: first(c.me), mate: first(c.mate), other: first(c.other), king: first(c.king) };
    this.ending = [
      { who: 'kingston', text: '{mate}, {other}, y\'all can head home. Me and {you} gon\' finish with some 1s.' },
      { who: 'narrator', text: '1s: make it take it. Inside the arc is 1, a three is 2. First to 11, win by 2.' },
    ];
    this.startLesson(0);
  }

  private ctx(): Ctx {
    const s = this.sim, me = s.user!;
    const mate = s.teams[0].onCourt.find((p) => p !== me)!;
    const king = s.teams[1].onCourt.find((p) => p.id === RIVAL_ID) ?? s.teams[1].onCourt[0];
    const other = s.teams[1].onCourt.find((p) => p !== king)!;
    return { sim: s, me, mate, king, other, d: this };
  }

  get lesson(): Lesson | null { return this.lessons[this.i] ?? null; }
  /** GameScene: don't step the sim while a line is up. */
  get blocking() { return !!this.line; }
  get finished() { return this.phase === 'finished' && !this.line; }

  private say(lines: Line[] | undefined) {
    for (const l of lines ?? []) this.queue.push({ ...l, text: fill(l.text, this.names) });
    if (!this.line) this.line = this.queue.shift() ?? null;
  }
  /** ✕ on a blocking line: the next one (or back to play). */
  nextLine() { this.line = this.queue.shift() ?? null; }

  view(): BoxView | null {
    if (this.line) return { ...this.line, blocking: true };
    const L = this.lesson;
    if (!L || this.phase === 'finished') return null;
    if (this.phase === 'demo' && L.demoTalk) return { who: 'kingston', text: fill(L.demoTalk.text, this.names), blocking: false, title: L.title };
    if (this.phase === 'try' || this.phase === 'done') {
      const st = L.steps[Math.min(this.step, L.steps.length - 1)];
      const missed = this.sim.time - this.failAt < 2 && this.step === 0;
      return { who: 'narrator', text: (missed ? 'Missed it: ' : '') + fill(st.prompt, this.names), blocking: false, title: L.title, step: Math.min(this.step + 1, L.steps.length), steps: L.steps.length, doneAt: this.checkAt, failAt: this.failAt };
    }
    return null;
  }

  private startLesson(i: number) {
    this.i = i; this.step = 0; this.moved = 0; this.sprintT = 0;
    const L = this.lesson;
    if (!L) { this.phase = 'finished'; this.say(this.ending); return; }
    this.say(L.before);
    this.phase = L.demo ? 'demoWait' : 'tryWait';
  }
  /** Dev / pause menu: jump to the next lesson. */
  skipLesson() { this.queue = []; this.line = null; this.stopPlay(); this.startLesson(this.i + 1); }
  skipAll() { this.queue = []; this.line = null; this.stopPlay(); this.i = this.lessons.length; this.phase = 'finished'; }

  // ---------- possessions ----------
  private setup(holder: Holder) {
    const s = this.sim, c = this.ctx();
    const team = holder === 'kingston' ? 1 : 0;
    s.checkBall(team);
    const h = holder === 'me' ? c.me : holder === 'mate' ? c.mate : c.king;
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
    this.demoT = 0; this.demoMoved = false; this.demoFaked = -1; this.postT = 0; this.lastPos = null;
  }
  /** Same-position matchups: Kingston on you, the other two on each other. */
  private pinMatchups() {
    const c = this.ctx();
    c.king.guarding = c.me.id; c.me.guarding = c.king.id; c.other.guarding = c.mate.id; c.mate.guarding = c.other.id;
  }
  private startPlay() {
    const s = this.sim, c = this.ctx();
    s.cfg.allowedPlays = ['tut_pnr'];
    if (s.cfg.practice) s.cfg.practice.runPlays = true;
    // you're the screener / roller (role 5); your teammate handles (role 1)
    const swap: [string, string] | null = c.me.role === '5' ? null : [c.me.role, c.mate.role];
    s.runner.call('tut_pnr', swap, c.me.id);
    s.phaseStartedAt = s.time;
    s.emit({ kind: 'play', text: 'PLAY: Two-Man Game', team: 0 });
  }
  private stopPlay() {
    const s = this.sim;
    s.cfg.allowedPlays = undefined;
    if (s.cfg.practice) s.cfg.practice.runPlays = false;
    s.runner.reset();
  }

  onReset(): boolean {
    const L = this.lesson;
    if (L && this.phase === 'demo') this.setup('kingston');            // the demo got broken up: run it again
    else if (L && this.phase === 'try') { this.setup(L.ball); if (L.play) this.startPlay(); if (L.restartOnNewBall && this.step > 0) this.miss(); }
    // otherwise wait (lines up, or between lessons): tick() sets up the next possession
    return true;
  }

  tick(sim: GameSim, dt: number) {
    const c = this.ctx(), L = this.lesson;
    sim.shotClock = Math.max(sim.shotClock, 30);
    this.pinMatchups();
    if (this.line) return;
    if (this.phase === 'demo') this.demoT += dt;
    if (this.phase === 'demoWait') { this.setup('kingston'); this.phase = 'demo'; return; }
    if (this.phase === 'tryWait' && L) { this.setup(L.ball); if (L.play) this.startPlay(); this.phase = 'try'; this.step = 0; return; }
    if (this.phase === 'demo' && this.demoT > 12) { this.phase = 'tryWait'; this.say(L?.after); return; } // safety
    if (this.phase === 'try' && L) {
      // tick-based progress (movement, sprint)
      if (this.lastPos) this.moved += dist(this.lastPos, c.me.p);
      this.lastPos = { ...c.me.p };
      if (c.me.sprinting) this.sprintT += dt;
      if (c.me.post) this.lastPostAt = sim.time;
      this.check(null);
      // the set ran out: call it again (you stay the screener)
      if (L.play && sim.runner.done && sim.holder()?.team === 0) this.startPlay();
    }
    if (this.phase === 'done' && sim.time >= this.doneAt && sim.ball.st.kind !== 'shot') {
      if (L?.play) this.stopPlay();
      this.say(L?.outro);
      sim.live = false; // everyone stops while the next lesson starts
      this.startLesson(this.i + 1);
    }
  }

  onEvent(sim: GameSim, e: GameEvent) {
    if (this.phase === 'demo' && e.kind === 'score' && e.pid === RIVAL_ID) {
      this.phase = 'tryWait'; this.say(this.lesson?.after); return;
    }
    if (this.phase === 'try') this.check(e);
  }

  private check(e: GameEvent | null) {
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
  private miss() {
    this.step = 0; this.failAt = this.sim.time;
    this.sim.quiet('tutorialMiss', { lesson: this.lesson?.id });
  }

  // ---------- scripted players ----------
  think(sim: GameSim, p: Player, dt: number): boolean {
    const c = this.ctx(), L = this.lesson;
    if (!L || !sim.live) return false;
    const hasBall = sim.holder() === p;
    // Kingston's demo (and his drive in the defense lesson)
    if (p === c.king && hasBall) {
      const script = this.phase === 'demo' ? L.demo : this.phase === 'try' ? L.kingScript : undefined;
      if (script) { if (this.phase === 'try') this.demoT += dt; this.runDemo(sim, p, script, dt); return true; }
    }
    // your teammate's part on your tries
    if (p === c.mate && hasBall && this.phase === 'try') {
      const rim = sim.rim(0), side = sim.side(0);
      if (L.id === 'pass') {
        sim.steer(p, p.p, false);
        if (this.step >= 2 && c.me.callForBallUntil > sim.time) sim.pass(p, c.me, true);
        return true;
      }
      if (L.id === 'screen') {
        if (this.step < 1) { sim.steer(p, p.p, false); return true; }
        return false; // screened: let him go to work
      }
      if (L.id === 'play') {
        const a = sim.runner.roleAssignment(sim.playRole(p));
        const to = a && !a.to.startsWith('screen:') ? spot(side, a.to) : p.p;
        sim.steer(p, to, false);
        const late = sim.runner.done || (sim.runner.phase >= 1 && sim.runner.t > 1.2);
        if (late && dist(c.me.p, rim) < 9) sim.pass(p, c.me, true);
        else if (sim.runner.done && sim.runner.t > 0) sim.pass(p, c.me, true);
        return true;
      }
      if (L.id !== 'defense') { sim.pass(p, c.me, true); return true; } // other lessons: give it back to you
    }
    return false;
  }

  private runDemo(sim: GameSim, p: Player, demo: Demo, dt: number) {
    const side = sim.side(p.team), rim = sim.rim(p.team);
    const toRim = norm(sub(rim, p.p));
    const lat = { x: -toRim.y, y: toRim.x };
    if (p.busy || p.state === 'dribbleMove') return;
    if (demo === 'pullup') {
      const at = hc(side, 17, 6);
      sim.steer(p, at, false);
      if (dist(p.p, at) < 1.4 || this.demoT > 3.5) sim.startShot(p, selectShotType(p, side, v(), sim.time));
    } else if (demo === 'cross') {
      const nd = sim.nearestDefender(p);
      if (!this.demoMoved && (this.demoT > 1.2 && (nd.dist < 6.5 || this.demoT > 2.6))) {
        this.demoMoved = true; sim.dribbleMove(p, lat); return;
      }
      sim.steer(p, add(rim, scale(toRim, -2)), this.demoMoved);
      if (this.demoMoved && dist(p.p, rim) < 6) sim.startShot(p, selectShotType(p, side, toRim, sim.time));
    } else if (demo === 'post') {
      const at = hc(side, 12, 8);
      if (!p.post && this.postT === 0) {
        sim.steer(p, at, false);
        if (dist(p.p, at) < 1.6 || this.demoT > 3) { postIntent(p, true, toRim); this.postT = 0.001; }
        return;
      }
      this.postT += dt;
      if (this.postT < 2.0 && this.demoT < 8) { postIntent(p, true, toRim); return; }
      postIntent(p, false, v());
      sim.startShot(p, selectShotType(p, side, lat, sim.time));
    } else if (demo === 'stepThrough') {
      const at = hc(side, 15, 3);
      if (this.demoFaked < 0) {
        sim.steer(p, at, false);
        if (dist(p.p, at) < 1.6 || this.demoT > 3) { sim.pumpFake(p, v()); this.demoFaked = this.demoT; }
        return;
      }
      if (this.demoT - this.demoFaked > 0.1) sim.startShot(p, 'stepThrough');
    }
  }
}

