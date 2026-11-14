import Phaser from 'phaser';
import { GarageScene } from './GarageScene';
import { RoomDef, Station, sxOf, syOf } from '../world/apartment';
import { ARENA_GYM, lapPoint, LAP_LEN, LAPS } from '../world/arenaGym';
import { buildArenaGymArt } from '../render/arenaGymArt';
import { TreadmillGame, JumpGame, ShootGame, GauntletGame, makeMiniGame } from '../world/minigames';
import { drainEnergy } from '../career/career';
import { AgentTalk } from './agentTalk';
import { scoutTexture } from './castSprites';
import { storyScene } from './setup';
import { app } from '../state';
import { FONT } from './ui';
import { TEAMS } from '../sim/data';
import { BoxSpeaker } from '../render/storyBox';
import { SPRITE_SCALE } from '../render/sprites';
import { combinePlan, TIER_PITCH, classOf } from '../career/draft';
import { randomAppearance, Appearance } from '../render/appearance';
import { casualKit } from './RoomScene';
import { sheetFor, playerSheetKey } from '../render/playerBank';
import { Kit, CX, FOOT_Y, FRAME_W, FRAME_H } from '../render/sprites';
import { CLIP, frameAt } from '../render/anim';
import type { V } from '../world/apartment';
/** Round 86: how far the scouts' heads turn toward the court (three-quarter). */
const SCOUT_TURN = 0.7;
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
    // round 86 (owner): the scouts watch the court, not the camera: the bench on the right looks left (flipped), the one
    // standing on the left looks right
    for (let i = 0; i < 6; i++) {
      const fy = 10 + i * 2.1, fx = 34.2 + 0.39 * fy + 0.6; // on the bench along the right side
      this.add.sprite(sxOf(fx), syOf(fy), scoutTexture(this, i, scoutCol, true, SCOUT_TURN), 0).setOrigin(0.5, 1).setScale(SPRITE_SCALE * 0.9).setDepth(syOf(fy)).setFlipX(true);
    }
    this.add.sprite(sxOf(12.5), syOf(1.6), scoutTexture(this, 7, scoutCol, false, SCOUT_TURN), 0).setOrigin(0.5, 1).setScale(SPRITE_SCALE * 0.95).setDepth(syOf(1.6));
    this.addProspects();
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
      else this.mini = makeMiniGame(test, Math.random, { test: true }); // round 86: the tests' harder rules
    }
    r.endsAt = this.t + (TIMED[test] ?? 999);
    r.on = true;
  }

  onUpdate(dt = 1 / 60) {
    super.onUpdate(dt);
    this.stepRun(dt);
    this.stepProspects();
  }

  /**
   * Round 86 (owner): other prospects in the room at the combine, working on their own stuff while you test: the
   * projected top two and two more from the class. Real player sheets (drawn in the workers, hidden until ready), side
   * view loops: laps, a pound dribble on the mat, bodyweight squats, waiting by the vertical-jump pole. Cosmetic only.
   */
  private crew: { spr: Phaser.GameObjects.Sprite; tag: Phaser.GameObjects.Text; key: string; look: Appearance; heightFt: number; kit: Kit; clip: string; period: number; at: V | null; lap: number; flip: boolean }[] = [];
  private crewBall: Phaser.GameObjects.Graphics | null = null;
  private addProspects() {
    this.crew = [];
    if (this.kind !== 'combine') return;
    const cls = classOf(app.career), who = [cls[0], cls[1], cls[7], cls[15]];
    const jobs: { clip: string; period: number; at: V | null; lap: number; flip: boolean }[] = [
      { clip: 'jog', period: 0.62, at: null, lap: LAP_LEN * 0.55, flip: false },
      { clip: 'dribble', period: 0.5, at: { x: 14.6, y: 10.0 }, lap: 0, flip: false },
      { clip: 'squat', period: 2.2, at: { x: 26.2, y: 10.8 }, lap: 0, flip: true },
      { clip: 'idle', period: 2.4, at: { x: 32.4, y: 15.2 }, lap: 0, flip: true },
    ];
    this.crewBall = this.add.graphics();
    who.forEach((p, i) => {
      let seed = p.look || 1;
      const look = randomAppearance(() => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; });
      Object.assign(look, { shirt: '#8d939e', pants: '#1d2b5a', longPants: false });
      const kit = casualKit(look, '#1d2b5a'), heightFt = p.heightIn / 12, key = playerSheetKey(`prospect_${p.id}_${p.look}`, look, heightFt, kit);
      const spr = this.add.sprite(0, 0, '__DEFAULT').setOrigin(CX / FRAME_W, FOOT_Y / FRAME_H).setScale(SPRITE_SCALE).setTint(0xfff0dc).setVisible(false);
      const [first, ...rest] = p.name.split(' ');
      const tag = this.add.text(0, 0, `${first[0]}. ${rest.join(' ')}${p.proj <= 2 ? `  ·  #${p.proj} proj.` : ''}`, { fontFamily: FONT, fontSize: '10px', color: p.proj <= 2 ? '#ffe9a8' : '#d8e0ee', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5, 0).setVisible(false);
      this.crew.push({ spr, tag, key, look, heightFt, kit, ...jobs[i] });
    });
  }
  private stepProspects() {
    const b = this.crewBall?.clear();
    for (const m of this.crew) {
      const sheet = sheetFor(this, m.key, m.heightFt, m.look, m.kit);
      if (!sheet || !sheet.index[m.clip]) { m.spr.setVisible(false); m.tag.setVisible(false); continue; }
      let at = m.at, flip = m.flip;
      if (!at) { const { p, dir } = lapPoint(m.lap + this.t * 4.6); at = p; flip = Math.abs(dir.x) > 0.5 ? dir.x < 0 : flip; if (Math.abs(dir.x) > 0.5) m.flip = flip; }
      const cl = CLIP[m.clip], u = (this.t / m.period) % 1, fi = sheet.index[m.clip].start + frameAt(cl, u);
      const x = sxOf(at.x), y = syOf(at.y);
      if (m.spr.texture.key !== m.key) m.spr.setTexture(m.key, fi); else m.spr.setFrame(fi);
      m.spr.setPosition(x, y).setFlipX(flip).setDepth(y).setVisible(true);
      m.tag.setPosition(x, y + 4).setDepth(9000).setVisible(true); // readable over the floor's mats
      // the dribbler's ball (where the sheet says it is this frame)
      const bo = m.clip === 'dribble' ? sheet.ball[fi] : null;
      if (b && bo) { const bx = x + (flip ? -bo[0] : bo[0]) * SPRITE_SCALE, by = Math.min(y - 6, y - bo[1] * SPRITE_SCALE); b.setDepth(y + 0.2); b.fillStyle(0x5a2410, 1).fillCircle(bx, by, 7); b.fillStyle(0xe0702e, 1).fillCircle(bx, by, 6); }
    }
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
    const perf = m instanceof ShootGame ? m.perfects : 0;
    if (test === 'sprint') this.pos = { ...LAPS[0] };
    r.timer.setText('');
    r.i++;
    const more = r.i < r.tests.length;
    this.busy = true;
    this.agent = new AgentTalk(this, { x: -20, y: 0 }, [
      this.scout(`${LABEL[test]}: ${score} ${UNIT[test]}${test === 'shoot' ? ` (${perf} perfect${perf === 1 ? '' : 's'})` : ''}. ${more ? 'Next.' : 'That\'s it for today. We\'ll be in touch.'}`),
      { run: () => (more ? this.nextTest() : this.finish()) },
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
