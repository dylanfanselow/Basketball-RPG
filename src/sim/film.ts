/**
 * Round 91 (owner): film study on the apartment TV. A list of courses; each is a short tutorial: watch the tape (a
 * pro does the move on an empty arena court), then do it yourself until ✓. Five courses are open from the start (the
 * to-do task counts them); the rest unlock with the skill they teach. Phaser-free: the courses, the director (built
 * on the tutorial's lesson engine) and the half-court 2v2 it runs in.
 */
import type { GameEvent } from './game';
import { GameSim } from './game';
import { Player } from './player';
import { MOVES, NODES, TEAMS, TreeNode, TeamDef } from './data';
import { hc } from './court';
import { Rng } from './math';
import { selectShotType, STEP_THROUGH_WINDOW } from './shooting';
import { extraPlayer } from './story';
import { careerPlayer } from '../career/career';
import type { CareerState } from '../career/career';
import { REAL_ROSTERS } from '../career/roster';
import { withDefaults } from '../render/appearance';
import { LessonDirector, Lesson, LessonCtx, Line, mine } from './lessons';

export interface FilmCourse {
  id: string; title: string;
  /** one line on the course list */
  blurb: string;
  /** the skill (perk id) that unlocks it; none = open from the start */
  perk?: string;
  /** the real player on the tape (looked up in the rosters) */
  tape: string;
  /** your perks the course leaves out (they change what the stick does: Fade Away replaces the floater) */
  without?: string[];
  /** blocks are on (help defense: you can block him) */
  blocks?: boolean;
  lessons: () => Lesson[];
}

/** The tape player's id in a film sim. */
export const PRO_ID = 'F-PRO';
/** Your practice squad (team 0) on the film court. */
export const FILM_TEAM: TeamDef = { id: 'FLM', city: 'Film', name: 'Room', colors: ['#3a4a6a', '#c8d2e8'], seed: 9101 };
/** Two dribble moves this close together (s, start to start) are one combo. */
export const COMBO_GAP = 1.3;

const N = (text: string): Line => ({ who: 'narrator', text });
/** The tape plays: the line in the box while the pro does it. */
const TAPE = (text: string): Line => ({ who: 'narrator', text: `▶ ${text}` });

/** You gathered one of these shots (the step counts the attempt, not the make: the odds are real). */
const shot = (types: string[]) => (c: LessonCtx, e: GameEvent | null) => mine(c, e, 'gather') && types.includes(String(e!.data?.type));
const JUMPERS = ['mid', 'three', 'deep3', 'fade', 'stepThroughJumper'];
const FINISHES = ['layup', 'dunk', 'euro', 'floater', 'hook', 'push', 'stepThrough', 'jelly'];
const MOVE_NAMES = new Set(Object.values(MOVES).map((m) => m.name));
/** Your dribble move (not a pump fake, not a perk call-out). */
export const isDribble = (c: LessonCtx, e: GameEvent | null) => mine(c, e, 'move') && MOVE_NAMES.has(e!.text) && !e!.data?.clip;
const fd = (c: LessonCtx) => c.d as FilmDirector;
/** A shot of these types right out of a dribble move (within `win` s of the move ending). */
const offMove = (types: string[], win: number) => (c: LessonCtx, e: GameEvent | null) =>
  shot(types)(c, e) && !!c.me.lastMove && c.sim.time - c.me.lastMove.endAt <= win;
/** You helped on the drive: you contested his shot, blocked it, took the charge or stole it. */
const helped = (c: LessonCtx, e: GameEvent | null) => !!e && (
  (e.kind === 'shotLog' && e.pid === c.other.id && (e.data?.by ?? []).includes(c.me.id))
  || ((e.kind === 'block' || e.kind === 'charge' || e.kind === 'steal') && e.pid === c.me.id));

export const FILM_COURSES: FilmCourse[] = [
  // ---------------- open from the start ----------------
  {
    id: 'finishing', title: 'FINISHING PACKAGE', tape: 'Jalen Brunson', without: ['sh_fade', 'fi_euro'],
    blurb: 'Floater, push shot and hook: close shots follow the stick.',
    lessons: () => [
      {
        id: 'floater', title: 'THE FLOATER',
        before: [N('Close to the rim, the stick picks the shot. Watch {demo}.')],
        demo: 'floater', demoTalk: TAPE('{demo}: the floater. Up and over the big man.'),
        after: [N('Floater: from 3 to 12 ft, hold the stick AWAY from the rim and shoot. It lofts over a shot blocker.')],
        ball: 'me',
        steps: [{ prompt: 'Drive in and float one: stick away from the rim + hold ✕', check: shot(['floater']) }],
      },
      {
        id: 'push', title: 'THE PUSH SHOT',
        demo: 'push', demoTalk: TAPE('{demo}: stop short, push it up one-handed.'),
        after: [N('Push shot: 7 to 12 ft out, stick neutral or toward the rim, without flying in at full speed. A one-hand push over the top.')],
        ball: 'me',
        steps: [{ prompt: 'From 7 to 12 ft, stick neutral or toward the rim + hold ✕', check: shot(['push']) }],
      },
      {
        id: 'hook', title: 'THE HOOK',
        demo: 'hook', demoTalk: TAPE('{demo}: shoulder to the defender, hook it in.'),
        after: [N('Hook: inside 12 ft, hold the stick SIDEWAYS (across your line to the rim) and shoot. Your body is between him and the ball.')],
        ball: 'me',
        steps: [{ prompt: 'Inside 12 ft, stick sideways + hold ✕', check: shot(['hook']) }],
      },
    ],
  },
  {
    id: 'combos', title: 'DRIBBLE COMBOS', tape: 'Kyrie Irving',
    blurb: 'Chain dribble moves: one gets him leaning, the next one beats him.',
    lessons: () => [
      {
        id: 'combo', title: 'CHAIN THEM',
        before: [N('One move gets a defender leaning. The second one beats him.')],
        demo: 'combo', demoTalk: TAPE('{demo}: move, move, gone.'),
        after: [N('Press ○ + the stick again as the first move ends and the next one comes right out of it. Each direction picks a move: toward him, away, side to side.')],
        ball: 'me',
        steps: [
          { prompt: 'Two dribble moves back to back: ○, then ○ again', check: (c) => fd(c).chain >= 2 },
          { prompt: 'Now a three-move chain', check: (c) => fd(c).chain >= 3 },
        ],
      },
    ],
  },
  {
    id: 'comboShots', title: 'COMBOS INTO SHOTS', tape: 'Donovan Mitchell',
    blurb: 'A move, then the shot right out of it, before he recovers.',
    lessons: () => [
      {
        id: 'moveJumper', title: 'MOVE INTO A JUMPER',
        before: [N('A move buys you a beat of space. Shoot in that beat.')],
        demo: 'comboShot', demoTalk: TAPE('{demo}: back him off, rise right away.'),
        after: [N('○ + the stick away from the rim backs you off him. Hold ✕ right as it ends: the space is still there.')],
        ball: 'me',
        steps: [{ prompt: 'A dribble move, then a jumper right out of it', check: offMove(JUMPERS, 1.2) }],
      },
      {
        id: 'moveFinish', title: 'MOVE INTO A FINISH',
        demo: 'drive', demoTalk: TAPE('{demo}: change direction, straight to the rim.'),
        after: [N('Cross him (○ + the stick across), then attack and finish at the rim before he gets back in front.')],
        ball: 'me',
        steps: [{ prompt: 'A dribble move, then finish at the rim', check: offMove(FINISHES, 2.6) }],
      },
    ],
  },
  {
    id: 'postPass', title: 'PASSING OUT OF THE POST', tape: 'Nikola Jokić',
    blurb: 'Win the post, draw the double team, find the man it left.',
    lessons: () => [
      {
        id: 'postKick', title: 'KICK IT OUT',
        before: [N('Win the post and the defense sends a second man. Somebody is open now.')],
        demo: 'postKick', demoTalk: TAPE('{demo}: draws two, finds the open man.'),
        after: [N('Hold L2 to post up. When the double comes ("DOUBLE TEAM"), point the stick at the man he left and tap △.')],
        ball: 'me', restartOnNewBall: true,
        steps: [
          { prompt: 'Hold L2 to post up', check: (c, e) => mine(c, e, 'post') && /^POST UP/.test(e!.text) },
          { prompt: 'The double is coming: stick at {mate} + △ to pass it out', check: (c, e) => mine(c, e, 'pass') && c.sim.lastPostPassAt === c.sim.time },
        ],
      },
    ],
  },
  {
    id: 'help', title: 'HELP DEFENSE', tape: 'Evan Mobley', blocks: true,
    blurb: 'Off the ball, you are the next wall when the drive gets by.',
    lessons: () => [
      {
        id: 'help', title: 'BE THE WALL',
        before: [N('Your man isn\'t the only man. When the ball gets past your teammate, you\'re the next wall.')],
        demoBall: 'mate', demoDrive: 'drive', demo: 'help', demoTalk: TAPE('{demo}: leaves his man, meets the drive at the rim.'),
        after: [
          N('Off the ball, sag into the gap. When the driver beats {mate}, get between him and the rim and rise with his shot (✕).'),
          N('Then get back to your man: a kick-out is coming if you stay.'),
        ],
        ball: 'other', script: 'drive',
        steps: [
          { prompt: 'Help on {other}\'s drive: get in his way, contest or block it', check: helped },
          { prompt: 'Again: stop the drive', check: helped },
        ],
      },
    ],
  },
  // ---------------- locked: unlock the skill ----------------
  {
    id: 'dreamer', title: 'DREAMER', perk: 'fi_dreamer', tape: 'Alperen Şengün',
    blurb: 'Fake the hook, the floater or the layup, then go right by.',
    lessons: () => [
      {
        id: 'dreamer', title: 'SELL THE SHOT',
        before: [N('Dreamer: your pump fake sells the exact shot you\'re lined up for.')],
        demo: 'dreamer', demoTalk: TAPE('{demo}: the hook fake, then right under him.'),
        after: [N('Inside 12 ft, the stick picks the fake: sideways = hook, away = floater, toward = layup. Tap ✕ to fake. He bites: stick to the rim + hold ✕.')],
        ball: 'me', restartOnNewBall: true,
        steps: [
          { prompt: 'Inside 12 ft: stick sideways + tap ✕ (hook fake)', check: (c, e) => mine(c, e, 'move') && ['fake_hook', 'fake_floater', 'fake_layup'].includes(e!.data?.clip) },
          { prompt: 'Now finish: stick to the rim + hold ✕', check: (c, e) => mine(c, e, 'gather') && c.sim.time - c.me.pumpFakeAt <= STEP_THROUGH_WINDOW + 0.3 },
        ],
      },
    ],
  },
  {
    id: 'pointGod', title: 'POINT GOD', perk: 'pa_pointgod', tape: 'Tyrese Haliburton',
    blurb: 'Go up for the shot, then give it up in the air.',
    lessons: () => [
      {
        id: 'pointGod', title: 'OUT OF THE SHOT',
        before: [N('Point God: every shot is also a pass.')],
        demo: 'pointGod', demoTalk: TAPE('{demo}: up for the layup, and it\'s a dime.'),
        after: [N('Go up for any shot (jumper, layup, dunk), then tap △ before you let it go: the ball goes to the man your stick points at.')],
        ball: 'me',
        steps: [{ prompt: 'Go up for a shot, then △ to pass out of it', check: (c, e) => mine(c, e, 'move') && /Point God/.test(e!.text) }],
      },
    ],
  },
  {
    id: 'euro', title: 'EURO STEP', perk: 'fi_euro', tape: 'Amen Thompson',
    blurb: 'Step one way, finish the other, around the shot blocker.',
    lessons: () => [
      {
        id: 'euro', title: 'AROUND HIM',
        demo: 'euro', demoTalk: TAPE('{demo}: one way, then the other.'),
        after: [N('Driving at the rim, hold the stick SIDEWAYS and shoot inside 9 ft: a Euro Step instead of the hook. It\'s harder to contest.')],
        ball: 'me',
        steps: [{ prompt: 'Drive at the rim, stick sideways + hold ✕', check: shot(['euro']) }],
      },
    ],
  },
  {
    id: 'fade', title: 'FADE AWAY', perk: 'sh_fade', tape: 'Jayson Tatum',
    blurb: 'Lean away from the contest, from anywhere.',
    lessons: () => [
      {
        id: 'fade', title: 'LEAN AWAY',
        demo: 'fade', demoTalk: TAPE('{demo}: falling away, the contest can\'t reach.'),
        after: [N('Hold the stick AWAY from the rim and shoot: a Fade Away from anywhere (it replaces the floater). Much smaller contest.')],
        ball: 'me',
        steps: [
          { prompt: 'Stick away from the rim + hold ✕', check: shot(['fade']) },
          { prompt: 'Out of the post: L2, then stick away + hold ✕', check: (c, e) => shot(['fade'])(c, e) && c.sim.time - c.d.lastPostAt < 1 },
        ],
      },
    ],
  },
  {
    id: 'jelly', title: 'JELLY FAKE', perk: 'fi_jelly', tape: 'Giannis Antetokounmpo',
    blurb: 'Go up for the dunk, pull it down, flick it in.',
    lessons: () => [
      {
        id: 'jelly', title: 'HANG AND FLICK',
        demo: 'jelly', demoTalk: TAPE('{demo}: the dunk that isn\'t.'),
        after: [N('Going up for a dunk, press ✕ again: you pull it back, hang, and flick a jelly layup. Shot blockers who jumped at the dunk come down first.')],
        ball: 'me', restartOnNewBall: true,
        steps: [
          { prompt: 'Attack the rim and go up for a dunk (hold ✕)', check: shot(['dunk']) },
          { prompt: 'In the air: ✕ again for the Jelly Fake', check: (c, e) => mine(c, e, 'jelly') },
        ],
      },
    ],
  },
  {
    id: 'uncleDrew', title: 'UNCLE DREW', perk: 'dr_uncledrew', tape: 'Kyrie Irving',
    blurb: 'Cancel any dribble move straight into the next one.',
    lessons: () => [
      {
        id: 'uncleDrew', title: 'CANCEL IT',
        before: [N('Uncle Drew: you don\'t have to finish a move to start the next one.')],
        demo: 'uncleDrew', demoTalk: TAPE('{demo}: three moves in the time of one.'),
        after: [N('Press ○ + the stick in the MIDDLE of a dribble move: it cancels and the next one starts right away.')],
        ball: 'me',
        steps: [
          { prompt: '○ in the middle of a move: cancel into the next one', check: (c, e) => isDribble(c, e) && !!e!.data?.cancel },
          { prompt: 'Cancel twice in a row', check: (c) => fd(c).cancels >= 2 },
        ],
      },
    ],
  },
];

export const FILM: Record<string, FilmCourse> = Object.fromEntries(FILM_COURSES.map((f) => [f.id, f]));
/** The courses everyone has from the start (the to-do task: watch them all). */
export const OPEN_COURSES = FILM_COURSES.filter((f) => !f.perk).map((f) => f.id);

/** Can you take this course yet? */
export function filmUnlocked(c: CareerState, id: string): boolean {
  const f = FILM[id];
  return !!f && (!f.perk || c.nodes.includes(f.perk));
}
export function filmDone(c: CareerState): string[] { return c.film?.done ?? []; }
/** Finished a course: remember it (once). True if it's new. */
export function markFilmDone(c: CareerState, id: string): boolean {
  c.film ??= { done: [] };
  if (c.film.done.includes(id)) return false;
  c.film.done.push(id);
  return true;
}
/** What the course list says about a locked course. */
export function lockText(id: string): string {
  const f = FILM[id], n: (TreeNode & { tree: string }) | undefined = f?.perk ? NODES[f.perk] : undefined;
  return n ? `Unlock ${n.name} (${n.tree[0].toUpperCase()}${n.tree.slice(1)} tree)` : '';
}

/** The film cast: you + a teammate vs the player on the tape + one more. */
export class FilmDirector extends LessonDirector {
  /** dribble moves in a row (each within COMBO_GAP of the last) */
  chain = 0;
  /** Uncle Drew cancels in a row */
  cancels = 0;
  private lastDribbleAt = -9;

  constructor(sim: GameSim, public course: FilmCourse) {
    super(sim, course.lessons(), [N('That\'s the tape. Take it into your games.')]);
    this.begin();
  }

  ctx(): LessonCtx {
    const s = this.sim, me = s.user!;
    const mate = s.teams[0].onCourt.find((p) => p !== me)!;
    const demo = s.teams[1].onCourt.find((p) => p.id === PRO_ID) ?? s.teams[1].onCourt[0];
    const other = s.teams[1].onCourt.find((p) => p !== demo)!;
    return { sim: s, me, mate, demo, other, d: this };
  }

  /** On the tape you watch: your player plays himself (the CPU). The tape's shots fall; yours are real. */
  private watching() { return this.phase === 'demo' || this.phase === 'demoWait'; }

  tick(sim: GameSim, dt: number) {
    const me = sim.user!;
    me.isUser = !this.watching();
    if (sim.cfg.story) sim.cfg.story.forceMake = this.watching();
    // passing out of the post: the double team always comes
    if (this.course.id === 'postPass') for (const p of sim.players) {
      if (!p.post || p.post.helpId) continue;
      const helper = sim.defenderOf(sim.mates(p)[0]);
      if (helper) { p.post.helpId = helper.id; p.post.helpAt = sim.time + 0.7; }
    }
    super.tick(sim, dt);
  }

  onEvent(sim: GameSim, e: GameEvent) {
    const c = this.ctx();
    if (isDribble(c, e)) {
      this.chain = e.t - this.lastDribbleAt <= COMBO_GAP ? this.chain + 1 : 1;
      this.cancels = e.data?.cancel ? this.cancels + 1 : 0;
      this.lastDribbleAt = e.t;
    } else if (mine(c, e, 'gather') || mine(c, e, 'pass') || (e.kind === 'score')) { this.chain = 0; this.cancels = 0; }
    super.onEvent(sim, e);
  }

  protected startLesson(i: number) { this.chain = 0; this.cancels = 0; super.startLesson(i); }

  think(sim: GameSim, p: Player, dt: number): boolean {
    const L = this.lesson, c = this.ctx();
    // on the tape, whoever the pro passes to shoots it
    if (L && sim.live && this.phase === 'demo' && sim.holder() === p && p !== c.demo && !L.demoDrive) {
      if (!p.busy) sim.startShot(p, selectShotType(p, sim.side(p.team), { x: 0, y: 0 }, sim.time));
      return true;
    }
    return super.think(sim, p, dt);
  }

  protected thinkTry(c: LessonCtx, p: Player, L: Lesson): boolean | undefined {
    const sim = this.sim, hasBall = sim.holder() === p, side = sim.side(p.team);
    // help defense: your man spots up on the wing (and shoots a kick-out)
    if (L.id === 'help' && p === c.demo) {
      if (hasBall) { if (!p.busy) sim.startShot(p, selectShotType(p, side, { x: 0, y: 0 }, sim.time)); return true; }
      sim.steer(p, hc(side, 21, 15), false);
      return true;
    }
    if (p === c.mate && hasBall) {
      // your teammate: shoots what you set up (a post kick-out, a Point God dime), else gives it back to you
      if (L.id === 'postKick' || L.id === 'pointGod') { if (!p.busy) sim.startShot(p, selectShotType(p, side, { x: 0, y: 0 }, sim.time)); }
      else sim.pass(p, c.me, true);
      return true;
    }
    return undefined;
  }
}

/** The player on the tape, from the real rosters (a generic pro if he's not in them). */
function tapePlayer(name: string, rng: Rng): { p: Player; team: TeamDef } {
  for (const [tid, list] of Object.entries(REAL_ROSTERS)) {
    const e = list.find((x) => x.name === name);
    if (!e) continue;
    const team = TEAMS.find((t) => t.id === tid) ?? FILM_TEAM;
    const p = new Player({
      id: PRO_ID, name: e.name, team: 1, pos: e.pos, core: { ...e.core }, nodes: e.perks,
      number: e.number, skin: e.appearance.skin ?? 2, height: e.heightFt, appearance: withDefaults(e.appearance),
    });
    return { p, team };
  }
  const p = extraPlayer(PRO_ID, 1, 'SG', rng, 80);
  return { p, team: TEAMS[0] };
}

/**
 * A film course's court: a half-court 2v2 in an empty arena. You (your real ratings and perks, minus the ones the
 * course leaves out) + a wing vs the player on the tape + a wing. No fouls, the CPU doesn't reach; the tape's shots
 * fall (the director), yours are real.
 */
export function buildFilm(c: CareerState, id: string, seed: number): GameSim {
  const f = FILM[id] ?? FILM_COURSES[0];
  const rng = new Rng(seed);
  const me = careerPlayer({ ...c, nodes: c.nodes.filter((n) => !f.without?.includes(n)) }, 0);
  const mate = extraPlayer('F-MATE', 0, 'SF', rng, 60);
  const { p: pro, team } = tapePlayer(f.tape, rng);
  const other = extraPlayer('F-OTHER', 1, 'SF', rng, 60);
  const sim = new GameSim({
    mode: 'practice', quarterLen: 180, seed,
    teams: [FILM_TEAM, team], rosters: [[me, mate], [pro, other]], userId: me.id,
    trust: { team: 80, coach: 60 }, ult: { unlocked: false, id: null, level: 0 },
    practice: { defenders: 2, teammates: 1, runPlays: false },
    halfCourt: true, featureUser: true, venue: 'arena', scoutsOnly: true,
    story: { forceMake: false, noBlocks: !f.blocks, noFouls: true, softD: true },
  });
  sim.director = new FilmDirector(sim, f);
  return sim;
}
