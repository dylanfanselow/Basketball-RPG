import Phaser from 'phaser';
import { InputMapper } from '../input/input';
import { MenuList, title, FONT, COL, hiRes } from './ui';
import { app } from '../state';
import { sfx } from '../audio/sfx';
import { storyScene, setStage } from './setup';
import { draftWeek, takeOnDebt, type StoryStage } from '../career/career';
import { stageDay, storyDay } from '../career/calendar';
import { draftDays, planWorkouts, leagueTiers } from '../career/draft';
import { goTo } from './draftRoad';

export class MenuScene extends Phaser.Scene {
  inp!: InputMapper; menu!: MenuList;
  constructor() { super('Menu'); }
  create() {
    hiRes(this);
    this.cameras.main.setBackgroundColor(COL.bg);
    this.inp = new InputMapper(this);
    // the scene object is reused: texts from the last visit were destroyed with it, so make fresh ones
    this.padText = this.add.text(80, 640, '', { fontFamily: FONT, fontSize: '15px', color: COL.dim });
    this.soundText = this.add.text(80, 668, '', { fontFamily: FONT, fontSize: '15px', color: COL.dim });
    title(this, 'HOOP CAREER', 'dev menu  ·  test any mode  ·  L1 / Esc: back to the main menu');
    const c = app.career;
    this.menu = new MenuList(this, 80, 140, [
      { label: 'Apartment (career home)', action: () => this.scene.start('Apartment'), hint: 'Your first place: walk around (furniture is solid). ✕ at a door, L1 to leave.' },
      { label: 'Garage (gym)', action: () => this.scene.start('Garage'), hint: 'Behind the apartment\'s left door. Training comes later.' },
      { label: 'Trailer (backstory)', action: () => this.scene.start('Trailer'), hint: 'Lights on a generator: walk up the steps, ✕ at the door ends the day; ✕ at the end of the path leaves.' },
      { label: 'Trailer (night)', action: () => this.scene.start('Trailer', { night: true }), hint: 'The trailer yard at night: the generator keeps the lamps on.' },
      { label: 'Story: Tutorial (rain 2v2)', action: () => this.story('tutorial'), hint: 'Round 60 prologue: the rainy-night 2v2 with Kingston. Pause → Skip lesson; dev panel → Story.' },
      { label: 'Story: 1s vs Kingston', action: () => this.story('ones'), hint: 'To 11, 1s & 2s, win by 2. His offense is all 99s.' },
      { label: 'Story: Trailer (that night)', action: () => this.story('night'), hint: 'Home after the 1s; ✕ at the door → the next day.' },
      { label: 'Story: Big game (scout)', action: () => this.story('bigGame'), hint: 'Kingston is out sick: the coach starts you. Locked in: +10 all stats.' },
      { label: 'Story: After the game (great)', action: () => this.after(true), hint: 'Round 60d: Mom the day of the big game, after a great game (won + best stat sum).' },
      { label: 'Story: After the game (promise)', action: () => this.after(false), hint: 'Round 60d: Mom says the scout told her you have promise.' },
      { label: 'Story: Kingston at the court', action: () => this.story('kingston'), hint: 'Round 80: the day after, Kingston is confused about being sick, then jealous, then gone.' },
      { label: 'Story: Three months later', action: () => this.story('paper'), hint: 'Round 80: the newspaper (nationals, record cold, Crestview adds Kingston), then Mom wakes you.' },
      { label: 'Story: Snowy morning', action: () => this.story('snow'), hint: 'Round 80: the trailer yard in snow; ✕ at the end of the path catches the bus.' },
      { label: 'Story: Bus ride', action: () => this.story('bus'), hint: 'Round 80: jokes, Kingston, then Mom calls: the generator broke (your choice is saved).' },
      { label: 'Story: National final', action: () => this.story('final'), hint: 'Round 80: the arena, Lincoln vs Crestview Prep (Kingston).' },
      { label: 'Story: Home (won final)', action: () => this.home(true), hint: 'Round 81: the wrecked trailer at night, Mom, the debt.' },
      { label: 'Story: Home (lost final)', action: () => this.home(false), hint: 'Round 81: the same, after a loss (the next morning brings the Kingston paper too).' },
      { label: 'Story: The letter', action: () => this.story('letter'), hint: 'Round 81: the morning after: the mail carrier, the letter from the agent.' },
      { label: 'Story: The agent', action: () => this.story('agent'), hint: 'Round 81: Donovan Garcia at the apartment (1 April), the calendar, then the garage.' },
      { label: 'Story: Combine (day 1)', action: () => this.draftRoad('combine'), hint: 'Round 85: Spring 8 in the arena: three of sprint laps, squat, bench, vertical jump, shooting (random order). Sleep for day 2.' },
      { label: 'Story: Scrimmage', action: () => this.draftRoad('scrimmage'), hint: 'Round 84: Spring 11, you + four prospects vs five, every scout watching.' },
      { label: 'Story: The week of work', action: () => this.draftRoad('montage'), hint: 'Round 84: after the scrimmage: the new generator, the Burger Barn register, workouts.' },
      { label: 'Story: Garcia\'s calls', action: () => this.draftRoad('calls'), hint: 'Round 84: Spring 18: three calls (one team per tier), each a workout on the calendar.' },
      { label: 'Story: A workout (next kind)', action: () => this.draftRoad('workout'), hint: 'Round 85: each press tries the next kind (in that team\'s arena): shooting, pressure drill, 1-on-1, team scrimmage.' },
      { label: 'Story: Draft night', action: () => this.draftRoad('draft'), hint: 'Round 84: Spring 28 at the apartment with Mom and your old teammates.' },
      { label: 'Practice Court', action: () => this.scene.start('Game', { mode: 'practice' }), hint: 'Half court. Configure defenders/teammates in the dev panel (F1).' },
      { label: 'Quick 5v5 Game', action: () => this.scene.start('MatchSetup') },
      { label: 'Quick 3v3 Game', action: () => this.scene.start('ThreeSetup'), hint: 'Real rosters, Guard / Wing / Big, 3v3 sets + iso ball. Full or half court.' },
      { label: '1v1 · Make It, Take It', action: () => this.scene.start('OneOnOneSetup'), hint: 'Half court, pick any NBA player; P2 = second controller/keyboard or CPU.' },
      { label: 'Career Hub', action: () => this.scene.start('Hub') },
      { label: 'Perk Trees', action: () => this.scene.start('PerkTree', { back: 'Menu' }) },
      { label: 'Fullscreen  (F)', action: () => (window as any).__toggleFullscreen?.(), hint: 'Or click ⛶ in the top-right corner.' },
    ], 13, { rows: 16, w: 290 }); // round 80h: two columns (the list ran off the screen)
    this.add.text(680, 140, `Player: ${c.name}  ·  ${c.pos}  ·  Lv ${c.level}`, { fontFamily: FONT, fontSize: '16px', color: COL.dim });
    this.add.text(680, 168, [
      'CONTROLS (gamepad)                    KEYBOARD',
      'Left stick  move                      WASD',
      '✕  shoot  |  block                    K / Space',
      '△  pass ● | call for ball | steal     I',
      '○  dribble move | screen | charge     L',
      '□  ultimate                           J',
      'R2 sprint burst (tap)  Options pause  Shift / Enter',
      'L1  back / quit (in game: L1 twice)  Esc',
      'R1 (hold) icon pass: ✕○□△ = teammate  Q',
      'L2 (hold) post up: stick to/away rim  E',
      'Create+Options  dev tools             F1 or `',
      '                                      F fullscreen · M mute',
    ].join('\n'), { fontFamily: FONT, fontSize: '14px', color: COL.text, lineSpacing: 3 });
  }
  /** Round 60: jump to a story stage (sets it on the career, like Load Save would resume it). */
  private story(stage: StoryStage) {
    setStage(stage);
    const day = stageDay(stage); if (day !== null) app.career.life.day = day; // round 82: the stage's date
    if (stage === 'agent') Object.assign(app.career.story!, { draft: undefined, callDay: undefined });
    if (['snow', 'bus', 'final', 'letter', 'agent'].includes(stage)) { app.career.story!.winter = true; app.changed(); } // round 80
    if (stage === 'letter' || stage === 'agent') { const st = app.career.story!; st.trailerWrecked = true; if (stage === 'letter') st.agent = undefined; else st.agent ??= 'Donovan Garcia'; app.changed(); } // round 81
    const [scene, data] = storyScene(stage); this.scene.start(scene, data);
  }
  /** Round 84: jump into the road to the draft (the state as if you got there by playing). */
  private draftRoad(to: 'combine' | 'scrimmage' | 'montage' | 'calls' | 'workout' | 'draft') {
    const c = app.career;
    setStage('draftWeek');
    const st = c.story!, d = draftDays();
    Object.assign(st, { winter: true, trailerWrecked: true, home: 'apartment', callDay: undefined, momCall2: true, going: undefined, drafted: undefined, draft: draftWeek(storyDay('agent'), storyDay('draft')) });
    st.agent ??= 'Donovan Garcia';
    if (!st.debt) takeOnDebt(c);
    const after = to !== 'combine' && to !== 'scrimmage';
    st.combine = after || to === 'scrimmage' ? { scores: { sprint: 3.4, squat: 6, bench: 3, jump: 31, shoot: 8 }, day1: true, day2: true } : undefined;
    st.scrimmage = after ? { pts: 14, reb: 5, ast: 4, sum: 26, won: true } : undefined;
    st.montage = to === 'calls' || to === 'workout' || to === 'draft' ? true : undefined;
    st.workouts = to === 'workout' || to === 'draft' ? planWorkouts(c) : [];
    if (to === 'combine') { c.life.day = d.combine1; app.changed(); goTo(this, { kind: 'combine1' }); return; }
    if (to === 'scrimmage') { c.life.day = d.scrimmage; app.changed(); goTo(this, { kind: 'scrimmage' }); return; }
    if (to === 'montage') { c.life.day = d.scrimmage + 1; setStage('montage'); app.changed(); this.scene.start('Montage'); return; }
    if (to === 'calls') { c.life.day = d.back; app.changed(); this.scene.start('Apartment'); return; }
    if (to === 'draft') { c.life.day = d.draft; app.changed(); this.scene.start('Apartment', { story: 'draftNight' }); return; }
    // a workout: each press the next kind, with a team from a tier that can ask for it
    const kinds = ['shooting', 'gauntlet', 'oneOnOne', 'scrimmage'] as const, k = kinds[MenuScene.wk++ % kinds.length];
    const tier = k === 'oneOnOne' ? 'Lottery' : k === 'scrimmage' ? 'Contender' : 'Playoff';
    const team = leagueTiers()[tier][0];
    st.workouts = [{ team, tier, kind: k, callDay: d.back, day: d.back + 2 }];
    c.life.day = d.back + 2; app.changed();
    goTo(this, { kind: 'workout', index: 0 });
  }
  static wk = 0;
  /** Round 81: home after the final, with a made-up result. */
  private home(won: boolean) {
    setStage('homecoming');
    app.career.life.day = storyDay('final'); // round 83: the night of Winter 28
    const st = app.career.story!;
    Object.assign(st, { winter: true, final: { great: won, won, pts: 24, reb: 7, ast: 5 }, trailerWrecked: true, debt: undefined, agent: undefined, draft: undefined, callDay: undefined });
    app.changed();
    const [scene, data] = storyScene('homecoming'); this.scene.start(scene, data);
  }
  /** Round 60d: Mom's after-game scene with a made-up result. */
  private after(great: boolean) {
    setStage('after');
    app.career.story!.bigGame = great ? { great, won: true, pts: 31, reb: 9, ast: 6 } : { great, won: false, pts: 12, reb: 4, ast: 2 };
    app.changed();
    const [scene, data] = storyScene('after'); this.scene.start(scene, data);
  }
  padText!: Phaser.GameObjects.Text;
  soundText!: Phaser.GameObjects.Text;
  update() {
    const pad = this.inp.pad;
    this.soundText.setText(sfx.running ? `🔊 Sound on  (M to ${sfx.settings.muted ? 'unmute' : 'mute'})` : '🔇 Press any key or click to enable sound');
    if (this.inp.pressed('mute')) sfx.toggleMute();
    this.padText.setText(pad ? `🎮 Controller: ${pad.id.replace(/\(.*\)/, '').trim()}` : 'No controller detected. Plug one in and press any button on it.').setColor(pad ? COL.good : COL.dim);
    this.inp.poll(); if (this.inp.pressed('dev')) (window as any).__toggleDev?.();
    if (this.inp.pressed('escape') || this.inp.pressed('back')) { this.scene.start('Title'); return; } // round 58: the real main menu
    this.menu.update(this.inp); }
}
