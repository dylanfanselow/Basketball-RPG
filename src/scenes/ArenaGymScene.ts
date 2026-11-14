import Phaser from 'phaser';
import { GarageScene } from './GarageScene';
import { RoomDef, Station, sxOf, syOf } from '../world/apartment';
import { ARENA_GYM, lapPoint, LAP_LEN, LAPS } from '../world/arenaGym';
import { buildArenaGymArt } from '../render/arenaGymArt';
import { TreadmillGame, JumpGame, ShootGame, GauntletGame } from '../world/minigames';
import { AgentTalk } from './agentTalk';
import { scoutTexture } from './castSprites';
import { storyScene } from './setup';
import { app } from '../state';
import { FONT } from './ui';
import { TEAMS } from '../sim/data';
import { BoxSpeaker } from '../render/storyBox';
import { SPRITE_SCALE } from '../render/sprites';
import { combinePlan, TIER_PITCH } from '../career/draft';
import type { CombineTest } from '../career/career';
import { MusicTrack } from '../audio/sfx';

type GymTest = CombineTest | 'gauntlet';
/** Round 85: shots in a shooting test. */
export const SHOOT_TEST_SHOTS = 15;
/** Seconds for the timed tests (sprint, squat, bench). */
const TIMED = 30;
const LABEL: Record<GymTest, string> = { sprint: 'Sprint (laps)', squat: 'Squat', bench: 'Bench press', jump: 'Vertical jump', shoot: 'Shooting', gauntlet: 'Pressure drill' };
const UNIT: Record<GymTest, string> = { sprint: 'laps', squat: 'reps', bench: 'reps', jump: 'inches', shoot: `of ${SHOOT_TEST_SHOTS}`, gauntlet: 'reps' };
const HOW: Record<GymTest, string> = {
  sprint: 'Laps around the court. Hit ○ in the square to keep your speed up. Thirty seconds.',
  squat: 'The squat rack. Alternate L2 and R2. Thirty seconds.',
  bench: 'The bench. Hold ✕ and keep the bar level. Thirty seconds.',
  jump: 'Vertical. Mash ✕ to load it up, then explode. Three tries, best one counts.',
  shoot: `Shooting. ${SHOOT_TEST_SHOTS} shots from the mark. Hold ✕, let go at the top.`,
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
    this.kind = data?.test ?? 'combine'; this.day = data?.day ?? 1; this.run = null;
  }
  room(): RoomDef { return ARENA_GYM; }
  music(): MusicTrack | null { return null; }
  orbsOn() { return false; }
  private get workout() { const st = app.career.story; return this.kind === 'combine' ? undefined : st?.workouts?.[st.going ?? -1]; }
  private get team() { const w = this.workout; return w ? TEAMS.find((t) => t.id === w.team) : undefined; }
  buildArt(tm: Phaser.Textures.TextureManager) { return buildArenaGymArt(tm, this.team?.colors[0] ?? '#1d2b5a'); }

  onCreate() {
    super.onCreate();
    const team = this.team, col = team?.colors[0] ?? '#1d2b5a';
    // the banner over the stands and the scouts on the bench (the right side), a couple standing with clipboards
    const g = this.add.graphics().setDepth(40);
    g.fillStyle(Phaser.Display.Color.HexStringToColor(col).color, 0.95).fillRect(360, 112, 560, 46).lineStyle(3, 0xffffff, 0.9).strokeRect(360, 112, 560, 46);
    this.add.text(640, 135, team ? `${team.city.toUpperCase()} ${team.name.toUpperCase()}  ·  TRYOUT` : `PRO PROSPECT COMBINE  ·  DAY ${this.day}`, { fontFamily: FONT, fontSize: '20px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(41);
    const scoutCol = team ? col : '#3a3f52';
    for (let i = 0; i < 6; i++) {
      const fy = 10 + i * 2.1, fx = 34.2 + 0.39 * fy + 0.6; // on the bench along the right side
      this.add.sprite(sxOf(fx), syOf(fy), scoutTexture(this, i, scoutCol, true), 0).setOrigin(0.5, 1).setScale(SPRITE_SCALE * 0.9).setDepth(syOf(fy));
    }
    this.add.sprite(sxOf(12.5), syOf(1.6), scoutTexture(this, 7, scoutCol), 0).setOrigin(0.5, 1).setScale(SPRITE_SCALE * 0.95).setDepth(syOf(1.6));
    this.startRun();
  }

  private scout(text: string) { const t = this.team; return { say: { who: 'coach' as BoxSpeaker, name: t ? `${t.city.toUpperCase()} SCOUT` : 'COMBINE SCOUT', text } }; }

  private startRun() {
    const c = app.career, w = this.workout;
    const plan = combinePlan(c);
    const tests: GymTest[] = this.kind === 'combine' ? (this.day === 1 ? plan.day1 : plan.day2) : this.kind === 'gauntlet' ? ['gauntlet'] : ['shoot'];
    const timer = this.add.text(640, 190, '', { fontFamily: FONT, fontSize: '24px', color: '#ffe9a8', fontStyle: 'bold', stroke: '#000000', strokeThickness: 5 }).setOrigin(0.5).setDepth(9400);
    this.run = { tests, i: 0, endsAt: 0, on: false, scores: [], lapD: 0, timer };
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
    }
    r.endsAt = this.t + (test === 'sprint' || test === 'squat' || test === 'bench' ? TIMED : 999);
    r.on = true;
  }

  onUpdate(dt = 1 / 60) {
    super.onUpdate(dt);
    this.stepRun(dt);
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
    const time = test === 'sprint' || test === 'squat' || test === 'bench' ? `  ·  0:${String(Math.ceil(left)).padStart(2, '0')}` : '';
    r.timer.setText(`${LABEL[test].toUpperCase()}${time}  ·  ${score} ${UNIT[test]}`);
    const done = !this.activity || left <= 0
      || (m instanceof GauntletGame && m.over && !m.missing)
      || (m instanceof JumpGame && m.over)
      || (m instanceof ShootGame && m.attempts >= SHOOT_TEST_SHOTS && m.state === 'idle');
    if (!done) return;
    r.on = false; r.scores.push(score);
    this.stopActivity();
    if (test === 'sprint') this.pos = { ...LAPS[0] };
    r.timer.setText('');
    r.i++;
    const more = r.i < r.tests.length;
    this.busy = true;
    this.agent = new AgentTalk(this, { x: -20, y: 0 }, [
      this.scout(`${LABEL[test]}: ${score} ${UNIT[test]}. ${more ? 'Next.' : 'That\'s it for today. We\'ll be in touch.'}`),
      { run: () => (more ? this.nextTest() : this.finish()) },
    ], { phone: true });
  }
  /** The score so far: laps to a tenth, reps, inches (best jump), makes. */
  private scoreOf(test: GymTest): number {
    const m = this.mini, r = this.run!;
    if (test === 'sprint') return Math.round((r.lapD / LAP_LEN) * 10) / 10;
    if (m instanceof JumpGame) return m.best;
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
      st.workouts[st.going].result = { score: s, text: this.kind === 'gauntlet' ? `${s} reps in the pressure drill` : `${s}/${SHOOT_TEST_SHOTS} in the shooting drill` };
      st.going = undefined;
    }
    app.changed();
    this.cameras.main.fadeOut(700, 0, 0, 0);
    this.time.delayedCall(750, () => { const [scene, data] = storyScene('draftWeek'); this.scene.start(scene, data); });
  }
}
