import Phaser from 'phaser';
import { GarageScene } from './GarageScene';
import { RoomDef, Station } from '../world/apartment';
import { ARENA_GYM, lapPoint, LAP_LEN, LAPS } from '../world/arenaGym';
import { buildArenaGymArt } from '../render/arenaGymArt';
import { TreadmillGame, JumpGame, ShootGame, GauntletGame, makeMiniGame } from '../world/minigames';
import { drainEnergy } from '../career/career';
import { AgentTalk } from './agentTalk';
import { storyScene } from './setup';
import { app } from '../state';
import { FONT } from './ui';
import { TEAMS } from '../sim/data';
import { BoxSpeaker } from '../render/storyBox';
import { combinePlan, TIER_PITCH, classOf } from '../career/draft';
import { fmtHeight } from '../career/career';
import { CombineCrew, ScoutRow, COMBINE_SHIRT, COMBINE_SHORTS } from './combineCrew';
import { casualKit } from './RoomScene';
import { playerSheetKey } from '../render/playerBank';
import { sfx } from '../audio/sfx';
import { JUMP_SPOT } from '../world/arenaGym';
import type { CombineTest } from '../career/career';
import { MusicTrack } from '../audio/sfx';

type GymTest = CombineTest | 'gauntlet';
/** Round 85: shots in a shooting test. */
export const SHOOT_TEST_SHOTS = 15;
/** Seconds for the timed tests (round 86: the squat is 20). */
const TIMED: Partial<Record<GymTest, number>> = { sprint: 30, squat: 20, bench: 30 };
const LABEL: Record<GymTest, string> = { sprint: 'Sprint (laps)', squat: 'Squat', bench: 'Bench press', jump: 'Vertical jump', shoot: 'Shooting', gauntlet: 'Pressure drill' };
const UNIT: Record<GymTest, string> = { sprint: 'laps', squat: 'reps', bench: 'reps', jump: 'inches', shoot: 'pts', gauntlet: 'reps' };
const HOW: Record<GymTest, string> = {
  sprint: 'Laps around the court. Hit ○ in the square to keep your speed up. Thirty seconds.',
  squat: 'The squat rack. Alternate L2 and R2. Twenty seconds, and it gets heavier every rep.',
  bench: 'The bench. Hold ✕ and keep the bar level. Thirty seconds, and it gets heavier every rep.',
  jump: 'Vertical. Mash ✕ for two and a half seconds to load it, then explode. Three tries, best one counts.',
  shoot: `Shooting. ${SHOOT_TEST_SHOTS} shots from the mark. A make is a point, a perfect is two, and the window gets tighter every make.`,
  gauntlet: 'Pressure drill. Hit the button we call before the bar runs out. It speeds up every rep. Three strikes.',
};

/**
 * Round 85 (owner): the arena gym: the combine's days and the teams' shooting / pressure-drill tryouts, on an arena
 * floor with the stands empty and the scouts on the bench (the home team's colors at a tryout, navy at the combine).
 * The garage's machines and mini-games, a lap course for the sprint, a measuring pole for the vertical jump. No orbs
 * here (it's a test, not training). Scores are saved, then home to the apartment.
 */
export class ArenaGymScene extends GarageScene {
  constructor() { super('ArenaGym'); }
  kind: 'combine' | 'gauntlet' | 'shooting' = 'combine';
  day: 1 | 2 = 1;
  private run: { tests: GymTest[]; i: number; endsAt: number; on: boolean; scores: number[]; lapD: number; timer: Phaser.GameObjects.Text } | null = null;

  init(data?: { at?: string; story?: 'agent' | 'montage'; test?: 'combine' | 'gauntlet' | 'shooting'; day?: 1 | 2 }) {
    super.init({});
    this.kind = data?.test ?? 'combine'; this.day = data?.day ?? 1; this.run = null; this.beat = null; this.gasped = false; this.crew = null; this.scouts = null;
  }
  room(): RoomDef { return ARENA_GYM; }
  music(): MusicTrack | null { return null; }
  orbsOn() { return false; }
  private get workout() { const st = app.career.story; return this.kind === 'combine' ? undefined : st?.workouts?.[st.going ?? -1]; }
  private get team() { const w = this.workout; return w ? TEAMS.find((t) => t.id === w.team) : undefined; }
  buildArt(tm: Phaser.Textures.TextureManager) { return buildArenaGymArt(tm, this.team?.colors[0] ?? '#1d2b5a'); }

  onCreate() {
    // round 88 (owner): you wear the combine kit too (the grey tee and navy shorts every prospect has on)
    const c0 = app.career, kitLook = { ...c0.appearance, shirt: COMBINE_SHIRT, pants: COMBINE_SHORTS, longPants: false };
    this.kit = casualKit(kitLook, COMBINE_SHORTS);
    this.sheetKey = playerSheetKey('HOME_COMBINE', c0.appearance, c0.height, this.kit);
    super.onCreate();
    const team = this.team, col = team?.colors[0] ?? '#1d2b5a';
    // the banner over the stands and the scouts on the bench (the right side), a couple standing with clipboards
    const g = this.add.graphics().setDepth(40);
    g.fillStyle(Phaser.Display.Color.HexStringToColor(col).color, 0.95).fillRect(360, 112, 560, 46).lineStyle(3, 0xffffff, 0.9).strokeRect(360, 112, 560, 46);
    this.add.text(640, 135, team ? `${team.city.toUpperCase()} ${team.name.toUpperCase()}  ·  TRYOUT` : `PRO PROSPECT COMBINE  ·  DAY ${this.day}`, { fontFamily: FONT, fontSize: '20px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(41);
    // round 87 (owner): the scouts side-on in chairs facing the court, drawn like players (they stand up for #2's jump)
    this.scouts = new ScoutRow(this, team ? col : '#3a3f52');
    this.crew = null;
    this.startRun();
  }

  private scout(text: string) { const t = this.team; return { say: { who: 'coach' as BoxSpeaker, name: t ? `${t.city.toUpperCase()} SCOUT` : 'COMBINE SCOUT', text } }; }

  private startRun() {
    const c = app.career, w = this.workout;
    const plan = combinePlan(c);
    const tests: GymTest[] = this.kind === 'combine' ? (this.day === 1 ? plan.day1 : plan.day2) : this.kind === 'gauntlet' ? ['gauntlet'] : ['shoot'];
    const timer = this.add.text(640, 190, '', { fontFamily: FONT, fontSize: '24px', color: '#ffe9a8', fontStyle: 'bold', stroke: '#000000', strokeThickness: 5 }).setOrigin(0.5).setDepth(9400);
    this.run = { tests, i: 0, endsAt: 0, on: false, scores: [], lapD: 0, timer };
    // round 87 (owner): the other prospects (the projected top two and two more) on the tests you aren't doing
    if (this.kind === 'combine') { const k = classOf(c); this.crew = new CombineCrew(this, [k[0], k[1], k[7], k[15]], ['sprint', 'squat', 'bench', 'jump', 'shoot'], tests[0] as CombineTest); }
    const intro = this.kind === 'combine'
      ? [this.scout(this.day === 1 ? `Welcome to the combine. Height ${Math.floor(c.height)}'${Math.round((c.height % 1) * 12)}". Wingspan checks out.` : 'Day two. Same deal: give us everything.'),
         this.scout(`Today: ${tests.map((t) => LABEL[t].toLowerCase()).join(', ')}.`)]
      : [this.scout(TIER_PITCH[w!.tier])];
    this.busy = true;
    this.pos = { x: 24, y: 12.6 };
    this.agent = new AgentTalk(this, { x: -20, y: 0 }, [{ wait: 0.8 }, ...intro, { run: () => this.nextTest() }], { phone: true });
  }

  /** The next test: the scout says how it works, then it starts. */
  private nextTest() {
    const r = this.run!, test = r.tests[r.i];
    this.agent = new AgentTalk(this, { x: -20, y: 0 }, [this.scout(HOW[test]), { run: () => this.beginTest(test) }], { phone: true });
  }
  private beginTest(test: GymTest) {
    const r = this.run!;
    if (test !== 'gauntlet') this.crew?.userOn(test, r.i > 0 ? r.tests[r.i - 1] as CombineTest : null);
    this.agent = null; this.busy = false;
    const station = (id: string) => ({ ...ARENA_GYM.stations!.find((s) => s.id === id)! });
    if (test === 'sprint') {
      r.lapD = 0;
      const st: Station = station('laps');
      this.startActivity(st);
      this.mini = new TreadmillGame();
    } else {
      this.startActivity(station(test === 'gauntlet' ? 'dribble' : test));
      if (test === 'gauntlet') this.mini = new GauntletGame();
      else this.mini = makeMiniGame(test, Math.random, { test: true }); // round 86: the tests' harder rules
    }
    r.endsAt = this.t + (TIMED[test] ?? 999);
    r.on = true;
  }

  scouts: ScoutRow | null = null;
  crew: CombineCrew | null = null;
  onUpdate(dt = 1 / 60) {
    super.onUpdate(dt);
    this.stepRun(dt);
    this.scouts?.update(this.t);
    if (this.crew) {
      this.crew.update(dt, this.t);
      // the rack and the bench show their bar off the hooks while anyone's on them; a prospect's shot moves the net too
      (this.piece('squatRack') as Phaser.GameObjects.Sprite | undefined)?.setFrame(this.activity?.id === 'squat' || this.crew.using('squat') ? 1 : 0);
      (this.piece('bench') as Phaser.GameObjects.Sprite | undefined)?.setFrame(this.activity?.id === 'bench' || this.crew.using('bench') ? 1 : 0);
      this.drawNet();
    }
    this.stepBeat(dt);
  }

  /**
   * Round 87 (owner): the end of combine day 1, after your tests: #2 (the athletic freak) goes up at the jump pole
   * higher than anybody's ever seen, lands and flexes; the scouts gasp and stand up. You walk over to #1 and ask what's
   * going on; he tells you who that is (projected second), and who he is (first overall).
   */
  private beat: { phase: 'walk' | 'load' | 'air' | 'flex' | 'talk'; t: number } | null = null;
  private startBeat() {
    const crew = this.crew!, two = crew.mateOf('P2')!, one = crew.mateOf('P1')!;
    this.busy = true;
    // whoever's at the jump pole moves off; #2 walks over to it; #1 stops what he's doing
    const atJump = crew.mates.find((m) => m !== two && (m.test === 'jump' || m.to === 'jump'));
    if (atJump) crew.sendTo(atJump, two.test ?? two.to);
    if (two.test !== 'jump') crew.sendTo(two, 'jump');
    crew.sendTo(one, null); one.face = { ...JUMP_SPOT };
    this.beat = { phase: 'walk', t: 0 };
  }
  private stepBeat(dt: number) {
    const b = this.beat; if (!b) return;
    const crew = this.crew!, two = crew.mateOf('P2')!, one = crew.mateOf('P1')!;
    b.t += dt;
    const go = (phase: typeof b.phase) => { b.phase = phase; b.t = 0; };
    if (b.phase === 'walk') { if (two.test === 'jump' || b.t > 6) { crew.sendTo(two, null); two.pos = { ...JUMP_SPOT }; go('load'); } return; }
    if (b.phase === 'load') { two.pose = { clip: 'squat', u: 0.25 + 0.2 * Math.min(1, b.t / 1.1), jumpFt: 0, yaw: 90, flip: false }; if (b.t >= 1.2) { sfx.effort(); go('air'); } return; }
    if (b.phase === 'air') {
      const AIR = 1.5, H = 6.2; // way past anybody's vertical
      const k = Math.min(1, b.t / AIR);
      two.pose = { clip: 'shot_jumper', u: 0.62, jumpFt: H * Math.sin(Math.PI * k), yaw: 90, flip: false };
      if (k > 0.45 && !this.gasped) { this.gasped = true; sfx.gasp(); this.scouts?.standUp(true); }
      if (k >= 1) { sfx.bounce(14); go('flex'); }
      return;
    }
    if (b.phase === 'flex') {
      two.pose = { clip: 'flex', u: (b.t * 0.8) % 1, jumpFt: 0, yaw: 90, flip: false };
      if (b.t >= 1.6) { go('talk'); this.beatTalk(one, two); }
    }
  }
  private gasped = false;
  private beatTalk(one: NonNullable<ReturnType<CombineCrew['mateOf']>>, two: NonNullable<ReturnType<CombineCrew['mateOf']>>) {
    const c = app.career, you = c.firstName || c.name.split(' ')[0];
    const n1 = one.p.name, n2 = two.p.name, first1 = n1.split(' ')[0];
    const me = (text: string) => ({ say: { who: 'me' as BoxSpeaker, name: you, text } });
    const him = (text: string) => ({ say: { who: 'mate' as BoxSpeaker, name: first1, text } });
    const big = two.p.pos === 'C' ? 'a center' : 'a four';
    this.agent = new AgentTalk(this, { x: -20, y: 0 }, [
      this.scout('Did... somebody check the vanes? He cleared the top one.'),
      { run: () => { two.pose = { clip: 'idle', u: 0, jumpFt: 0, yaw: 0, flip: true }; } },
      { say: { who: 'you' as BoxSpeaker, text: 'What was THAT?' } },
      { youTo: { x: one.pos.x + (one.pos.x > 24 ? -1.6 : 1.6), y: one.pos.y + 0.4 } },
      { run: () => { one.face = { ...this.pos }; } },
      me('Yo. What\'s going on? Who is that?'),
      him(`That's ${n2}. ${fmtHeight(two.p.heightIn)}, ${big}, and he moves like a guard. Athletic freak.`),
      him('Projected second overall. Every time he does that, the scouts lose their minds.'),
      me('Second? Then who\'s number one?'),
      him('You haven\'t heard about me?'),
      him(`${n1}. First overall.`),
      him(`Relax, ${you}. I'm messing with you. Kind of. Good luck at the scrimmage, man. Hope we're on the same team.`),
      { run: () => { this.scouts?.standUp(false); two.pose = null; one.face = null; } },
      this.scout('All right, settle down. That\'s it for today. We\'ll be in touch.'),
      { run: () => this.finish() },
    ], { phone: true });
  }

  /** Per frame while a test is on: the laps, the timer, the end of the test. */
  private stepRun(dt: number) {
    const r = this.run; if (!r || !r.on) return;
    const test = r.tests[r.i], m = this.mini, left = Math.max(0, r.endsAt - this.t);
    if (test === 'sprint' && m instanceof TreadmillGame && this.activity) {
      // round 85: the treadmill's game sets your speed; you run the course around the court
      r.lapD += 5.6 * (m.speed / TreadmillGame.BASE) * dt;
      const { p, dir } = lapPoint(r.lapD);
      this.pos = p; this.activity.at = p;
      this.activity.yaw = Math.abs(dir.x) > 0.5 ? 0 : dir.y > 0 ? 90 : -90; this.activity.flip = dir.x < -0.5;
    }
    const score = this.scoreOf(test);
    const time = TIMED[test] ? `  ·  0:${String(Math.ceil(left)).padStart(2, '0')}` : '';
    r.timer.setText(`${LABEL[test].toUpperCase()}${time}  ·  ${score} ${UNIT[test]}`);
    const done = !this.activity || left <= 0
      || (m instanceof GauntletGame && m.over && !m.missing)
      || (m instanceof JumpGame && m.over)
      || (m instanceof ShootGame && m.attempts >= SHOOT_TEST_SHOTS && m.state === 'idle');
    if (!done) return;
    r.on = false; r.scores.push(score);
    this.stopActivity();
    this.drawPlayer(0); // round 87: off the machine and standing (the room doesn't redraw you while a scout talks)
    const perf = m instanceof ShootGame ? m.perfects : 0;
    if (test === 'sprint') this.pos = { ...LAPS[0] };
    r.timer.setText('');
    r.i++;
    const more = r.i < r.tests.length;
    this.busy = true;
    this.crew?.userOn(null, test as CombineTest); // a prospect can take the station you just left
    const beat = !more && this.kind === 'combine' && this.day === 1 && !!this.crew; // round 87: #2's jump
    this.agent = new AgentTalk(this, { x: -20, y: 0 }, [
      this.scout(`${LABEL[test]}: ${score} ${UNIT[test]}${test === 'shoot' ? ` (${perf} perfect${perf === 1 ? '' : 's'})` : ''}. ${more ? 'Next.' : beat ? 'Good work today.' : 'That\'s it for today. We\'ll be in touch.'}`),
      { run: () => (more ? this.nextTest() : beat ? this.startBeat() : this.finish()) },
    ], { phone: true });
  }
  /** The score so far: laps to a tenth, reps, inches (best jump), makes. */
  private scoreOf(test: GymTest): number {
    const m = this.mini, r = this.run!;
    if (test === 'sprint') return Math.round((r.lapD / LAP_LEN) * 10) / 10;
    if (m instanceof JumpGame) return m.best;
    if (m instanceof ShootGame) return m.points; // round 86: a make 1, a perfect 2
    return m?.reps ?? 0;
  }

  private finish() {
    const c = app.career, st = c.story!, r = this.run!;
    if (this.kind === 'combine') {
      const cb = (st.combine ??= {});
      cb.scores ??= {};
      r.tests.forEach((t, i) => { if (t !== 'gauntlet') cb.scores![t] = r.scores[i] ?? 0; });
      if (this.day === 1) cb.day1 = true; else cb.day2 = true;
    } else if (st.going !== undefined && st.workouts?.[st.going]) {
      const s = r.scores[0] ?? 0;
      st.workouts[st.going].result = { score: s, text: this.kind === 'gauntlet' ? `${s} reps in the pressure drill` : `${s} pts in the shooting drill` };
      st.going = undefined;
    }
    drainEnergy(c); // round 86 (owner): a big day leaves you with nothing
    app.changed();
    this.cameras.main.fadeOut(700, 0, 0, 0);
    this.time.delayedCall(750, () => { const [scene, data] = storyScene('draftWeek'); this.scene.start(scene, data); });
  }
}
