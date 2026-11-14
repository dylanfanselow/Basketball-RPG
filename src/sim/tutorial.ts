/**
 * Round 60: the prologue tutorial (rainy school court, 2v2). Phaser-free: a `Director` that runs every possession.
 * Each lesson: blocking lines (✕ to continue), Kingston demos the move on his ball (scripted), then your ball with a
 * prompt in the box until the sim shows you did it (✓). The narrator is a nameless text box; Kingston talks in his
 * own named box (the big game tomorrow, the scouts, getting out, and his game-day coffee, which matters later).
 * Round 91: the engine (phases, steps, demos) lives in `lessons.ts`, shared with film study.
 */
import type { GameSim } from './game';
import type { Player } from './player';
import { spot } from './court';
import { dist } from './math';
import { STEP_THROUGH_WINDOW } from './shooting';
import { RIVAL_ID } from './story';
import { LessonDirector, Lesson, LessonCtx, Line, mine, madeShot } from './lessons';
export type { Speaker, Line, BoxView } from './lessons';
export type { Lesson } from './lessons';

/** The tutorial's cast: Kingston is the demo player. */
interface Ctx extends LessonCtx { king: Player; d: TutorialDirector }

export function buildLessons(): Lesson<Ctx>[] {
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
      ball: 'demo', script: 'cross',
      steps: [{ prompt: 'Guard Kingston', check: (c, e) => (!!e && e.kind === 'score' && e.pid === c.king.id) || mine(c, e, 'steal') }],
      outro: [K('Gotta move your feet, {you}. Scouts would\'ve seen that.')],
    },
  ];
}

export class TutorialDirector extends LessonDirector<Ctx> {
  constructor(sim: GameSim) {
    super(sim, buildLessons(), [
      { who: 'kingston', text: '{mate}, {other}, y\'all can head home. Me and {you} gon\' finish with some 1s.' },
      { who: 'narrator', text: '1s: make it take it. Inside the arc is 1, a three is 2. First to 11, win by 2.' },
    ]);
    this.begin();
  }
  protected extraNames(c: Ctx) { return { king: c.king.name.split(' ')[0] }; }

  ctx(): Ctx {
    const s = this.sim, me = s.user!;
    const mate = s.teams[0].onCourt.find((p) => p !== me)!;
    const king = s.teams[1].onCourt.find((p) => p.id === RIVAL_ID) ?? s.teams[1].onCourt[0];
    const other = s.teams[1].onCourt.find((p) => p !== king)!;
    return { sim: s, me, mate, king, demo: king, other, d: this };
  }

  // ---------- the play lesson ----------
  protected onTryStart(L: Lesson<Ctx>) { if (L.play) this.startPlay(); }
  protected onLessonEnd(L: Lesson<Ctx> | null) { if (L?.play || this.sim.cfg.allowedPlays) this.stopPlay(); }
  /** the set ran out: call it again (you stay the screener) */
  protected tryTick(L: Lesson<Ctx>, sim: GameSim) { if (L.play && sim.runner.done && sim.holder()?.team === 0) this.startPlay(); }
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

  /** your teammate's part on your tries */
  protected thinkTry(c: Ctx, p: Player, L: Lesson<Ctx>): boolean | undefined {
    const sim = this.sim;
    if (p !== c.mate || sim.holder() !== p) return undefined;
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
    return undefined;
  }
}
