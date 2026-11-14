import Phaser from 'phaser';
import { buildLandline, buildRoomArt, buildCatTexture, buildGlow, buildSleepBlanket, drawCalendarPage, CAT_W, LAMP_ART, CAL, calRowH, CalCell } from '../render/roomArt';
import { pieceDepthFt, RS, V, Piece, RoomDef, Station, APARTMENT, actorDepthFt, PLAYER_R, sxOf, syOf, Poly, FURNITURE, Cat, newCat, catStep, CAT_R, SPOTS } from '../world/apartment';
import { RoomScene, ART, circlePoly } from './RoomScene';
import { FONT } from './ui';
import { app } from '../state';
import { sfx } from '../audio/sfx';
import { advanceDay, sleepPlan, ENERGY_ORB, draftWeek, storyEventsByDay } from '../career/career';
import { planWorkouts, callLines, mysteryCallDue, todaysEvents, eventName, markMissed, runDraft, topTwoLine, draftBoard, GoEvent, momLine, garciaLines, pickOne } from '../career/draft';
import { buildSeason, ROOKIE_SEASON_START } from '../career/schedule';
import { goTo } from './draftRoad';
import { momTexture, mateTexture } from './castSprites';
import { lincolnSquad, academySquad, squadCaptain } from '../sim/story';
import { SPRITE_SCALE } from '../render/sprites';
import { BoxSpeaker } from '../render/storyBox';
import { AgentTalk, AgentStep } from './agentTalk';
import { DRAFT_TALK } from '../career/draftTalk';
import { AGENT_PATHS } from '../world/agentPaths';
import { setStage, storyScene } from './setup';
import { seasonGrid, keyGamesByDay, simGamesByDay, seasonPages, pageRange, pageOf, storyDay, dateLabel, SEASONS, WEEKDAYS } from '../career/calendar';
import { figureHeight } from '../render/sprites';
import { TEAMS } from '../sim/data';
import { FILM, FILM_COURSES, OPEN_COURSES, filmDone, filmUnlocked, lockText } from '../sim/film';
import { filmInit, PRACTICE_COURT } from './filmRun';
import type { GameInit } from './setup';

/**
 * The starter apartment (round 36): your base of operations. The left door leads to the garage gym, the front door
 * leaves. The cat lives on the couch. The calendar by the fridge opens the season calendar (round 46).
 */
export class ApartmentScene extends RoomScene {
  tank: Phaser.GameObjects.Sprite | null = null;
  couch: Phaser.GameObjects.Sprite | null = null;
  fan: Phaser.GameObjects.Sprite | null = null;
  glow!: Phaser.GameObjects.Image;
  cat!: Cat;
  catSprite!: Phaser.GameObjects.Sprite;
  catPolyKey = ''; catPolyCache: Poly[] = [];

  constructor() { super('Apartment'); }
  room(): RoomDef { return APARTMENT; }
  music() { return 'home' as const; }
  buildArt(tm: Phaser.Textures.TextureManager) { return buildRoomArt(tm); }

  /** Round 81: the agent's first meeting here; round 84: draft night. */
  story: 'agent' | 'draftNight' | null = null;
  agent: AgentTalk | null = null;
  /** Round 91: back from film study / the practice court: you're at the TV (`film`: the course list is open). */
  backAtTv: 'film' | 'tv' | null = null;
  init(data?: { at?: string; story?: 'agent' | 'draftNight'; film?: boolean; tv?: boolean }) {
    super.init(data);
    this.story = data?.story ?? null; this.agent = null;
    this.tank = null; this.fan = null; this.couch = null; this.catPolyKey = ''; this.cal = null; this.board = null; this.films = null;
    this.backAtTv = data?.film ? 'film' : data?.tv ? 'tv' : null;
    if (this.backAtTv) { this.pos = { ...SPOTS.tv }; this.face = { x: 0, y: -1 }; }
  }

  onCreate() {
    for (const { art, img } of this.pieces) {
      if (art.key === 'room_tank') this.tank = img as Phaser.GameObjects.Sprite;
      if (art.key === 'room_fan') this.fan = img as Phaser.GameObjects.Sprite;
      if (art.key === 'room_couch') this.couch = img as Phaser.GameObjects.Sprite;
    }
    const sb = buildSleepBlanket(this.textures);
    this.blanket = this.add.image(0, 0, sb.key).setOrigin(0, 0).setVisible(false);
    this.blanketOff = { x: sb.dx, y: sb.dy };
    this.glow = this.add.image(LAMP_ART.x * ART, LAMP_ART.y * ART, buildGlow(this.textures)).setScale(ART * 2).setBlendMode(Phaser.BlendModes.ADD).setDepth(5000).setAlpha(0.8);
    this.cat = newCat();
    this.catSprite = this.add.sprite(0, 0, buildCatTexture(this.textures), 0).setOrigin(0.5, 1).setScale(ART);
    // round 89b: the landline is its own sprite on the island (it shakes when a call rings)
    const island = APARTMENT.furniture.find((f) => f.id === 'island')!, ll = buildLandline(this.textures, island);
    this.phone = this.add.sprite(ll.x * ART, ll.y * ART, ll.key, 0).setOrigin(0, 0).setScale(ART).setDepth(syOf(pieceDepthFt(island)) + 0.01);
    this.phoneX = ll.x * ART; this.ringing = null;
    if (this.story === 'agent') this.startAgent();
    else if (this.story === 'draftNight') this.startDraftNight();
    else if (this.backAtTv === 'film') this.openFilms(); // round 91: back from a course, the list is still up
    else this.checkCalls(); // a call that's due (the mystery call, Mom's first night, a morning the agent hasn't called yet)
  }

  // ------------------------------------------------------------ round 89b: incoming calls on the landline
  phone!: Phaser.GameObjects.Sprite; phoneX = 0;
  /** A call ringing on the landline: who it shows as, its lines, what answering it settles. */
  ringing: { from: string; steps: AgentStep[]; onAnswer?: () => void; at: number; nextRing: number } | null = null;
  private ring(from: string, steps: AgentStep[], onAnswer?: () => void) {
    if (this.ringing) return;
    this.ringing = { from, steps, onAnswer, at: this.t, nextRing: this.t + 0.4 };
  }
  /** Walk over and pick it up. */
  private answer() {
    const r = this.ringing; if (!r || this.busy) return;
    this.ringing = null; this.phone.setFrame(0).setX(this.phoneX);
    r.onAnswer?.(); app.changed();
    this.agent = new AgentTalk(this, { x: -20, y: 0 }, [{ say: { who: 'narrator' as const, text: `You pick up.  (${r.from})` } }, ...r.steps], { phone: true });
  }
  /** The phone rings in bursts (the sound and a shake, the handset hopping); quiet once it's answered. */
  private stepRing() {
    const r = this.ringing;
    if (!r) return;
    if (this.t >= r.nextRing) { r.nextRing = this.t + 1.6; sfx.phoneRing(); }
    const inBurst = (this.t - (r.nextRing - 1.6)) < 0.85;
    const hop = inBurst && Math.floor(this.t / 0.06) % 2 === 0;
    this.phone.setFrame(hop ? 1 : 0).setX(this.phoneX + (inBurst ? (Math.floor(this.t / 0.045) % 2 ? 1.4 : -1.4) : 0));
  }
  /** Whatever call is due now (one at a time): the mystery call, then Mom's first night, then Garcia's morning call. */
  checkCalls() {
    if (this.ringing || this.agent) return;
    const c = app.career, st = c.story;
    if (!st || st.stage !== 'draftWeek' || !st.draft) return;
    if (mysteryCallDue(c)) {
      const you = c.firstName || c.name.split(' ')[0];
      this.ring('UNKNOWN NUMBER', DRAFT_TALK.mysteryCall.map((l) => ({ say: l.who === 'voice' ? { who: 'phone' as const, name: '???', text: l.text ?? '' } : l.who === 'you' ? { who: 'me' as const, name: you, text: l.text ?? '' } : { who: 'narrator' as const, text: l.text ?? '' } })), () => { st.anonCall = true; });
      return;
    }
    if (!st.momCall2) { this.momCall(); return; }
    this.maybeCall();
  }

  /** Round 82: a big date card (the DAY banner's style), up and gone. */
  private dateBanner(text: string, hold = 800) {
    const banner = this.add.text(640, 330, text, { fontFamily: FONT, fontSize: '54px', color: '#ffe9a8', fontStyle: 'bold', stroke: '#2a1a10', strokeThickness: 8 }).setOrigin(0.5).setDepth(8960).setAlpha(0).setScale(0.8);
    this.tweens.add({ targets: banner, alpha: 1, scale: 1, duration: 450, ease: 'Back.easeOut', hold, yoyo: true, onComplete: () => banner.destroy() });
    sfx.greenChime();
  }

  /**
   * Round 84 (owner): after the week of work, Donovan Garcia calls three mornings in a row, once for a team from each
   * tier; each call puts that team's workout on the calendar (a random day, maybe the same day as another).
   */
  private maybeCall() {
    const c = app.career, st = c.story;
    if (!st || st.stage !== 'draftWeek' || !st.draft || !st.montage || this.agent || this.ringing) return;
    const day = c.life.day, have = st.workouts ?? [];
    const next = planWorkouts(c).find((w) => w.callDay <= day && !have.some((x) => x.team === w.team));
    if (!next || st.callDay === day || day >= st.draft.draft) return;
    const first = have.length === 0;
    const you = c.firstName || c.name.split(' ')[0];
    // round 89b: it rings on the landline; answering it puts the workout on the calendar
    this.ring('DONOVAN GARCIA', callLines(c, next, first).map((l) => ({ say: l.who === 'agent' ? { who: 'agent' as const, name: 'DONOVAN GARCIA (PHONE)', text: l.text } : { who: 'me' as const, name: you, text: l.text } })),
      () => { st.workouts = [...(st.workouts ?? []), next]; st.callDay = day; });
  }

  /** Round 84 (owner): the first night here you call Mom: the agent, this place, the combine. Spring's here. */
  private momCall() {
    const c = app.career, you = c.firstName || c.name.split(' ')[0], st = c.story!;
    const me = (text: string) => ({ say: { who: 'me' as const, name: you, text } });
    const mom = (text: string) => ({ say: { who: 'phone' as const, text } });
    // round 89b: she calls you (it rings on the landline)
    this.ring('MOM', [
      mom('Baby? You okay? Where are you?'),
      me('I\'m okay, Ma. Better than okay. That letter was from an agent. Donovan Garcia.'),
      me('He\'s putting me up in an apartment. Rent free. There\'s a whole gym in the garage.'),
      me('The combine\'s in a week. Then a scrimmage. Then the draft, Ma.'),
      mom('An agent... The draft. Lord.'),
      mom('Don\'t you worry about me. We can hold out for a bit now. Spring\'s here. The snow\'ll start to melt.'),
      mom('You go do what you were born to do. I love you, baby.'),
      me('Love you too, Ma.'),
    ], () => { st.momCall2 = true; });
  }

  /**
   * Round 81: the agent's first meeting, here (round 84: Donovan Garcia): who he is, your situation, "you can't fail",
   * the draft week on the calendar, then off to the garage.
   */
  private startAgent() {
    const c = app.career, you = c.firstName || c.name.split(' ')[0];
    const st = c.story!;
    const me = (text: string) => ({ say: { who: 'me' as const, name: you, text } });
    const ag = (text: string) => ({ say: { who: 'agent' as const, text } }); // Donovan Garcia
    const P = AGENT_PATHS.apartment;
    this.dateBanner(dateLabel(c.life.day).toUpperCase(), 700); // round 82: your first day here (round 83: SPRING 2)
    this.agent = new AgentTalk(this, P.haleStart, [
      { wait: 1.8 },
      ag(`You came. Good. ${st.agent ?? 'Donovan Garcia'}.`),
      ag('I represent players in the NBA. I was at the national final. I\'ve done this a long time, and I know what I saw.'),
      ag('Natural talent. And the drive to go with it. That combination doesn\'t come around often.'),
      me('I appreciate it, Mr. Garcia. I really do. But I can\'t think about the NBA right now.'),
      me('Our generator blew up. Took half the trailer with it. We\'re fifteen thousand in debt, and my mom...'),
      ag('I heard. Rough luck.'),
      ag('So here\'s what we\'ll do. This place? It\'s yours.'),
      // round 81b (owner): free until you make it, then about your whole first contract plus the generator
      ag('Rent free until you make it.'),
      ag('When you do, it\'ll run you about your whole first contract. Plus what that generator costs.'),
      ag('One condition.'),
      ag('You can\'t fail.'),
      // round 85 (owner): the TV (film) and the landline (updates)
      ag('That TV? Watch film on it. Study the greats and you\'ll pick up moves you don\'t have yet.'),
      ag('And there\'s a phone on the counter. Call me any time. I\'ll tell you where you stand.'),
      ag('Come here. Let me show you something.'),
      // round 81b: around the kitchen island, not through it
      { agentTo: P.haleToCalendar },
      { youTo: P.youToCalendar },
      { run: () => { st.draft = draftWeek(c.life.day, storyDay('draft')); app.changed(); this.busy = false; this.openCalendar(); } }, // (it only opens outside a cutscene)
      ag('This is your week. Seven days from today: the combine.'),
      ag('Two days of it. Skill tests, drills, measurements. Then a scrimmage in front of every scout in the league.'),
      ag('Then the draft. Last day of spring, the night the playoffs end.'), // round 83
      ag(topTwoLine(c)), // round 86: the projected top two
      ag('Do what I tell you, and somebody calls your name on draft night. Late, maybe. But they\'ll call it.'),
      { run: () => this.closeCalendar() },
      ag('Now. The garage.'),
      { agentTo: P.haleToGarage },
      { youTo: P.youToGarage },
      { run: () => { sfx.doorOpen(); setStage('agentGarage'); this.cameras.main.fadeOut(600, 0, 0, 0); this.time.delayedCall(650, () => { const [scene, data] = storyScene('agentGarage'); this.scene.start(scene, data); }); } },
      { wait: 2 },
    ]);
  }

  /**
   * Round 84 (owner): draft night at the apartment. Mom and your old teammates (Lincoln and Ridgemont) around the TV;
   * Garcia isn't there. Round 86: the real draft goes by on the TV (the projected top two, the picks right before
   * yours, a team that passed on you), then a bottom-tier team takes you.
   */
  private startDraftNight() {
    const c = app.career, st = c.story!, you = c.firstName || c.name.split(' ')[0], full = c.name;
    this.add.rectangle(0, 0, 1280, 720, 0x0c1640, 0.42).setOrigin(0, 0).setDepth(8800); // night, the lamp on
    const lin = lincolnSquad(c), cap = squadCaptain(c, lin), lin2 = lin.filter((p) => p !== cap).slice(0, 2), ram = academySquad(c).slice(0, 2);
    const stand = (key: string, x: number, y: number, flip = false) => this.add.sprite(sxOf(x), syOf(y), key, 0).setOrigin(0.5, 1).setScale(SPRITE_SCALE * 0.95).setDepth(syOf(y)).setFlipX(flip);
    stand(momTexture(this), 23.4, 4.6);
    [cap, ...lin2].forEach((p, i) => stand(mateTexture(this, p.id, p.appearance, '#7a1f2b', '#e0b33a'), [31.6, 33.4, 21.0][i], [4.6, 6.6, 6.8][i], i === 1));
    ram.forEach((p, i) => stand(mateTexture(this, p.id, p.appearance, '#1f5a3a', '#e8e2d0'), [19.6, 35.0][i], [4.8, 8.6][i], i === 1));
    this.pos = { x: 27.2, y: 4.3 }; this.face = { x: 0, y: 1 }; this.view = undefined;
    // the TV: the broadcast
    // (the TV faces the couch, its back to us: the broadcast shows as an inset in the corner, over the wall)
    const tvX = 1070, tvY = 230;
    const tv = this.add.graphics().setDepth(8850);
    tv.fillStyle(0x0a0d18, 1).fillRoundedRect(tvX - 150, tvY - 70, 300, 140, 8).lineStyle(3, 0x2c3350, 1).strokeRoundedRect(tvX - 150, tvY - 70, 300, 140, 8);
    tv.fillStyle(0x1d2b5a, 1).fillRect(tvX - 140, tvY - 60, 280, 30);
    const draft = runDraft(c), res = draft.you;
    this.add.text(tvX, tvY - 45, `THE DRAFT  ·  ROUND ${res.pick > 30 ? 2 : 1}`, { fontFamily: FONT, fontSize: '15px', color: '#ffe9a8', fontStyle: 'bold' }).setOrigin(0.5).setDepth(8851);
    const tvText = this.add.text(tvX, tvY + 18, 'Coming up next...', { fontFamily: FONT, fontSize: '14px', color: '#ffffff', align: 'center', wordWrap: { width: 270 } }).setOrigin(0.5).setDepth(8851);
    const team = TEAMS.find((t) => t.id === res.team)!, teamName = `${team.city} ${team.name}`;
    const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
    const pickLine = (n: number) => { const p = draft.picks[n - 1], t = TEAMS.find((x) => x.id === p.team); return `Pick ${n}: ${t ? `${t.city} ${t.name}` : p.team}\n${p.who}`; };
    const passed = draft.passedBy.map((id) => TEAMS.find((t) => t.id === id)).filter((t) => !!t);
    const mate = (p: { name: string }, school: string, text: string) => ({ say: { who: 'mate' as BoxSpeaker, name: `${p.name.split(' ')[0]} (${school})`, text } });
    const mom = (text: string) => ({ say: { who: 'mom' as BoxSpeaker, text } });
    const me = (text: string) => ({ say: { who: 'me' as BoxSpeaker, name: you, text } });
    const tvSay = (text: string) => ({ say: { who: 'coach' as BoxSpeaker, name: 'ON TV', text } });
    const show = (t: string) => ({ run: () => tvText.setText(t) });
    this.dateBanner('DRAFT NIGHT', 900);
    this.agent = new AgentTalk(this, { x: -20, y: 0 }, [
      { wait: 1.6 },
      { say: { who: 'narrator' as BoxSpeaker, text: 'Spring 28. Draft night. Everybody came.' } },
      mom('Turn it up! I can\'t hear a thing with all y\'all in here.'),
      mate(cap, 'Lincoln', `Look at this. ${you} on draft night. From the rain court to this.`),
      mate(ram[0], 'Ridgemont', 'Your agent not coming?'),
      me('Said he\'d call. Doesn\'t matter. Everybody I need is right here.'),
      show('The commissioner steps up to the podium.'),
      tvSay('Welcome to the draft. The first round is now underway.'),
      // round 86: the real picks before yours (the projected top two first)
      ...[1, 2, 3].filter((n) => n < res.pick).flatMap((n) => [show(pickLine(n)), { wait: 0.9 }]),
      ...(res.pick > 4 ? [mate(lin2[0] ?? cap, 'Lincoln', 'Relax, man. You\'re squeezing the remote to death.')] : []),
      ...(res.pick > 6 ? [show(`...  Pick ${res.pick - 2}  ...`), { wait: 0.8 }] : []),
      ...(res.pick > 4 ? [show(pickLine(res.pick - 1)), { wait: 1.0 }] : []),
      ...(passed.length ? [mate(ram[0] ?? cap, 'Ridgemont', `${passed[passed.length - 1]!.name} passed on you? Their loss.`)] : []),
      mom('Come on... come on...'),
      show(`With the ${ord(res.pick)} pick in the draft, the ${teamName} select...`),
      tvSay(`With the ${ord(res.pick)} pick in the draft, the ${teamName} select...`),
      { run: () => { tvText.setText(`${full.toUpperCase()}\n${teamName}`); sfx.greenChime(); this.dateBanner('YOU\'RE IN THE NBA', 1400); } },
      tvSay(`...${full}.`),
      mom('That\'s my baby! THAT\'S MY BABY!'),
      mate(cap, 'Lincoln', 'LET\'S GOOO!'),
      mate(ram[1] ?? ram[0], 'Ridgemont', `${team.city}! You\'re going to ${team.city}!`),
      me('Ma... we did it.'),
      mom('No, baby. You did it.'),
      { run: () => {
        st.drafted = { team: res.team, pick: res.pick };
        c.teamId = res.team; c.season = buildSeason(res.team, ROOKIE_SEASON_START, c.name.length * 7919 + res.pick);
        st.home = 'apartment'; setStage('done'); app.changed();
        this.cameras.main.fadeOut(900, 0, 0, 0);
        this.time.delayedCall(950, () => this.scene.restart({}));
      } },
      { wait: 2 },
    ], { phone: true });
  }

  actions() {
    const c = app.career, st = c.story, out: { label: string; spot: V; reach?: number; run: () => void }[] = [
      { label: 'Sleep', spot: SPOTS.couch, run: () => this.sleep() },
      { label: 'Calendar', spot: SPOTS.calendar, run: () => this.openCalendar() },
      // round 85: the landline (Mom, Garcia) and the TV (film study, later)
      // round 89b: a ringing call is answered here (the rest of the time you call out)
      this.ringing ? { label: 'Answer the phone', spot: SPOTS.phone, run: () => this.answer() } : { label: 'Phone', spot: SPOTS.phone, run: () => this.landline() },
      { label: 'Watch TV', spot: SPOTS.tv, run: () => this.tv() }, // round 88: the draft board; round 91: film study, the practice court
    ];
    // round 84: on an event day the front door goes there (two workouts the same day: you pick one)
    const evs = todaysEvents(c), front = APARTMENT.doors.find((d) => d.id === 'front')!.spot;
    const busyPhone = () => this.thinkLine('I should get that.'); // round 89b: not with the phone ringing
    // round 92: the front door opens the city map (on an event day the arena is picked and the trip is free)
    const label = evs.length === 1 ? `Leave (${eventName(c, evs[0]).replace(/^the /, '')} today)` : evs.length > 1 ? 'Leave (a workout today)' : 'Leave';
    out.push({ label, spot: front, reach: 1.6, run: () => (this.ringing ? busyPhone() : this.toCity(evs.length > 0)) });
    // round 84: draft night, on the couch in front of the TV
    if (st?.stage === 'draftWeek' && st.draft && c.life.day >= st.draft.draft && !st.drafted) out.unshift({ label: 'Watch the draft', spot: SPOTS.couch, run: () => this.scene.restart({ story: 'draftNight' }) });
    return out;
  }
  /** Your thought in the box (the room waits until ✕). */
  private thinkLine(text: string) {
    if (this.busy) return;
    this.agent = new AgentTalk(this, { x: -20, y: 0 }, [{ say: { who: 'you' as const, text } }], { phone: true });
  }
  /**
   * Round 85 (owner): the landline. Call Mom (she keeps you going) or Donovan Garcia (where he thinks you'll go in the
   * draft right now; it moves with the combine and the scrimmage).
   */
  private landline() {
    if (this.busy) return;
    const c = app.career, st = c.story, you = c.firstName || c.name.split(' ')[0];
    const garcia = !!st?.agent && (st.stage === 'draftWeek' || st.stage === 'done');
    const options = ['Call Mom', ...(garcia ? ['Call Donovan Garcia'] : []), 'Hang up'];
    const mom = (text: string) => ({ say: { who: 'phone' as BoxSpeaker, text } });
    const me = (text: string) => ({ say: { who: 'me' as BoxSpeaker, name: you, text } });
    const ag = (text: string) => ({ say: { who: 'agent' as BoxSpeaker, name: 'DONOVAN GARCIA (PHONE)', text } });
    const call = (i: number) => {
      const pick = options[i];
      if (pick === 'Hang up') { this.agent = null; this.busy = false; return; }
      const steps = pick === 'Call Mom'
        ? [{ run: () => sfx.phoneRing() }, mom(momLine(c)), me(pickOne(['Love you, Ma.', 'I hear you, Ma.', 'I won\'t let you down.']))]
        : [{ run: () => sfx.phoneRing() }, ag(`${you}. Garcia.`), ...garciaLines(c).map(ag), me('Got it.')];
      this.agent = new AgentTalk(this, { x: -20, y: 0 }, steps, { phone: true });
    };
    this.agent = new AgentTalk(this, { x: -20, y: 0 }, [{ choose: { who: 'you' as BoxSpeaker, text: 'Who do I call?', options, pick: call } }], { phone: true });
  }

  /** Round 88 (owner): the TV: film study (round 91: the courses), the practice court, the draft board (who owns each pick). */
  private tv() {
    if (this.busy) return;
    const st = app.career.story, board = !!st?.draft && !st.drafted, report = !!st?.scoutReport && !st.drafted;
    const options = ['Film study', 'Practice court', ...(board ? ['Draft board'] : []), ...(report ? ['What they\'re saying'] : []), 'Turn it off'];
    const pick = (i: number) => {
      this.agent = null; this.busy = false;
      if (options[i] === 'Film study') this.openFilms();
      else if (options[i] === 'Practice court') this.leaveFor(PRACTICE_COURT);
      else if (options[i] === 'Draft board') this.openBoard();
      else if (options[i] === 'What they\'re saying') this.openReport(); // round 90
    };
    this.agent = new AgentTalk(this, { x: -20, y: 0 }, [{ choose: { who: 'you' as BoxSpeaker, text: 'What\'s on?', options, pick } }], { phone: true });
  }
  board: Phaser.GameObjects.GameObject[] | null = null; boardAt = 0;
  /** The draft board over the room: picks 1-60 in four columns (two per round), traded picks marked, your workouts starred. */
  private openBoard() {
    if (this.busy) return;
    this.busy = true; sfx.blip(true);
    const c = app.career, rows = draftBoard(c), worked = new Set((c.story?.workouts ?? []).map((w) => w.team));
    const objs: Phaser.GameObjects.GameObject[] = [];
    const T = (x: number, y: number, s: string, size = 13, col = '#e8eefc', bold = false) => { const t = this.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color: col, fontStyle: bold ? 'bold' : 'normal' }).setDepth(9701); objs.push(t); return t; };
    objs.push(this.add.rectangle(640, 380, 1180, 600, 0x0b1020, 0.96).setStrokeStyle(3, 0xffcc33).setDepth(9700));
    T(640, 96, 'THE DRAFT BOARD', 24, '#ffe9a8', true).setOrigin(0.5, 0);
    T(365, 132, 'ROUND 1', 15, '#9fb0e0', true).setOrigin(0.5, 0); T(955, 132, 'ROUND 2', 15, '#9fb0e0', true).setOrigin(0.5, 0);
    rows.forEach((r, i) => {
      const col = Math.floor(i / 15), row = i % 15, x = 70 + col * 295, y = 160 + row * 31;
      const t = TEAMS.find((tm) => tm.id === r.team), via = r.via ? ` (via ${r.via})` : '';
      T(x, y, `${String(r.pick).padStart(2, ' ')}. ${t ? `${t.city} ${t.name}` : r.team}`.slice(0, 30), 13, worked.has(r.team) ? '#7dff9a' : '#e8eefc', worked.has(r.team));
      if (via) T(x + 30, y + 14, via, 10, '#ffb37a');
    });
    T(640, 650, 'Green = a team that called you in   ·   ✕ / L1 close', 12, '#9fb0e0').setOrigin(0.5, 0);
    this.board = objs; this.boardAt = this.t;
  }
  /** Round 90 (owner): the draft show's breakdown of you: three strengths, three weaknesses (biggest first). */
  private openReport() {
    const c = app.career, r = c.story?.scoutReport;
    if (this.busy || !r) return;
    this.busy = true; sfx.blip(true);
    const objs: Phaser.GameObjects.GameObject[] = [];
    const T = (x: number, y: number, s: string, size = 15, col = '#e8eefc', bold = false, wrap = 0) => { const t = this.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color: col, fontStyle: bold ? 'bold' : 'normal', wordWrap: wrap ? { width: wrap } : undefined }).setDepth(9701); objs.push(t); return t; };
    objs.push(this.add.rectangle(640, 380, 1040, 540, 0x0b1020, 0.96).setStrokeStyle(3, 0xffcc33).setDepth(9700));
    objs.push(this.add.rectangle(640, 140, 1036, 56, 0x1d2b5a, 1).setDepth(9700));
    T(640, 124, `THE DRAFT SHOW  ·  SCOUTING REPORT: ${c.name.toUpperCase()}`, 20, '#ffe9a8', true).setOrigin(0.5, 0);
    T(170, 190, 'STRENGTHS', 18, '#7dff9a', true); T(670, 190, 'WEAKNESSES', 18, '#ff8a80', true);
    const list = (x: number, items: typeof r.strengths, col: string) => items.forEach((it, i) => {
      T(x, 232 + i * 110, `${i + 1}. ${it.title}`, 17, col, true, 430);
      T(x + 26, 262 + i * 110, `(${it.why})`, 14, '#c8d2e8', false, 400);
    });
    list(170, r.strengths, '#e8fff0'); list(670, r.weaknesses, '#fff0ee');
    T(640, 615, '✕ / L1 close', 12, '#9fb0e0').setOrigin(0.5, 0);
    this.board = objs; this.boardAt = this.t;
  }
  private closeBoard() { for (const o of this.board ?? []) o.destroy(); this.board = null; this.busy = false; sfx.blip(false); }

  // ------------------------------------------------------------ round 91: film study
  /** The course list over the room (the highlighted row, its objects). */
  films: { idx: number; objs: Phaser.GameObjects.GameObject[]; at: number } | null = null;
  /** Open courses first, then the locked ones (a locked course you've unlocked moves up with the open ones). */
  private filmOrder(): string[] {
    const c = app.career;
    return [...FILM_COURSES.filter((f) => filmUnlocked(c, f.id)), ...FILM_COURSES.filter((f) => !filmUnlocked(c, f.id))].map((f) => f.id);
  }
  private openFilms(idx = 0) {
    this.busy = true;
    if (!this.films) sfx.blip(true);
    for (const o of this.films?.objs ?? []) o.destroy();
    const c = app.career, order = this.filmOrder(), done = filmDone(c);
    idx = Math.max(0, Math.min(order.length - 1, idx));
    const objs: Phaser.GameObjects.GameObject[] = [];
    const T = (x: number, y: number, s: string, size = 15, col = '#e8eefc', bold = false, wrap = 0) => { const t = this.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color: col, fontStyle: bold ? 'bold' : 'normal', wordWrap: wrap ? { width: wrap } : undefined }).setDepth(9701); objs.push(t); return t; };
    objs.push(this.add.rectangle(640, 380, 1060, 580, 0x0b1020, 0.96).setStrokeStyle(3, 0xffcc33).setDepth(9700));
    objs.push(this.add.rectangle(640, 122, 1056, 56, 0x1d2b5a, 1).setDepth(9700));
    T(640, 106, 'FILM STUDY', 24, '#ffe9a8', true).setOrigin(0.5, 0);
    const open = OPEN_COURSES.filter((id) => done.includes(id)).length;
    T(640, 160, `Watch the tape, then run it yourself.   Starter courses: ${open}/${OPEN_COURSES.length}`, 14, '#9fb0e0').setOrigin(0.5, 0);
    let y = 196, lockedHead = false;
    order.forEach((id, i) => {
      const f = FILM[id], unlocked = filmUnlocked(c, id);
      if (!unlocked && !lockedHead) { lockedHead = true; y += 8; T(150, y, 'LOCKED: UNLOCK THE SKILL', 12, '#ff9a7a', true); y += 22; }
      const sel = i === idx, col = !unlocked ? '#6c7590' : sel ? '#ffe680' : '#e8eefc';
      if (sel) objs.push(this.add.rectangle(330, y + 10, 400, 30, 0x2a3a6e, 1).setDepth(9700));
      T(150, y, `${sel ? '▶' : ' '} ${f.title}`, 16, col, sel);
      if (done.includes(id)) T(508, y, '✓', 18, '#7dff9a', true);
      y += 34;
    });
    // the highlighted course
    const f = FILM[order[idx]], unlocked = filmUnlocked(c, f.id), x = 590;
    T(x, 200, f.title, 22, unlocked ? '#ffe9a8' : '#9aa3bb', true);
    T(x, 236, f.blurb, 16, '#e8eefc', false, 470);
    T(x, 300, `On the tape: ${f.tape}`, 15, '#9fb0e0');
    T(x, 326, `${f.lessons().length} lesson${f.lessons().length > 1 ? 's' : ''}`, 15, '#9fb0e0');
    if (!unlocked) T(x, 370, lockText(f.id), 16, '#ff9a7a', true, 470);
    else if (done.includes(f.id)) T(x, 370, '✓ Watched. Run it again any time.', 16, '#7dff9a', true);
    else if (!f.perk) T(x, 370, 'A starter course: watch all five for the to-do list.', 15, '#c8d2e8', false, 470);
    T(640, 630, `↑↓ choose   ·   ✕ ${unlocked ? 'watch' : 'locked'}   ·   L1 close`, 13, '#9fb0e0').setOrigin(0.5, 0);
    this.films = { idx, objs, at: this.films?.at ?? this.t };
  }
  private closeFilms() { for (const o of this.films?.objs ?? []) o.destroy(); this.films = null; this.busy = false; sfx.blip(false); }
  private filmInput() {
    const fl = this.films!, inp = this.inp, order = this.filmOrder();
    if (this.t < fl.at + 0.25) return; // not on the ✕ that opened it
    if (inp.cancel()) { this.closeFilms(); return; }
    const d = inp.pressed('down') ? 1 : inp.pressed('up') ? -1 : 0;
    if (d) { this.openFilms((fl.idx + d + order.length) % order.length); sfx.blip(true); return; }
    if (inp.pressed('a')) {
      const id = order[fl.idx];
      if (!filmUnlocked(app.career, id)) { sfx.blip(false); return; }
      this.leaveFor(filmInit(id));
    }
  }
  /** Off to the court (a course, the practice court): fade out, start the game. */
  private leaveFor(init: GameInit) {
    this.busy = true; sfx.blip(true);
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.time.delayedCall(430, () => this.scene.start('Game', init));
  }

  /** Round 92: out the front door to the city map. */
  private toCity(event: boolean) {
    if (this.busy) return;
    this.busy = true; sfx.doorOpen();
    this.cameras.main.fadeOut(350, 0, 0, 0);
    this.time.delayedCall(380, () => this.scene.start('City', { at: 'home', select: event ? 'arena' : undefined }));
  }
  private go(e: GoEvent) { if (this.busy) return; this.busy = true; goTo(this, e); }
  /** Two workouts on one day: choose; the other one is missed. */
  private pickWorkout(evs: GoEvent[]) {
    if (this.busy) return;
    const c = app.career;
    this.agent = new AgentTalk(this, { x: -20, y: 0 }, [
      { say: { who: 'you' as const, text: 'Two workouts on the same day. I can only make one of them.' } },
      { choose: { who: 'you' as const, text: 'Which one?', options: evs.map((e) => eventName(c, e).replace(/^the /, '')), pick: (i: number) => {
        evs.forEach((e, k) => { if (k !== i && e.kind === 'workout') c.story!.workouts![e.index].result = 'missed'; });
        app.changed(); this.agent = null; this.busy = false; this.go(evs[i]);
      } } },
    ], { phone: true });
  }

  /**
   * Sleep on the couch (round 43): the room goes dark, Zzz float off the couch, the next day starts ("DAY n"), the
   * lights come back and green energy orbs rise from the couch into the energy bar until it's full.
   */
  /** Where he lies while sleeping (the sprite's floor point: head on the pillow end, feet toward the blanket). */
  static SLEEP_AT = { x: 25.8, y: 2.6 };
  /** The couch blanket, pulled off the couch and over him while he sleeps (in front of him, under the cat). */
  blanket!: Phaser.GameObjects.Image;
  blanketOff = { x: 0, y: 0 };

  sleep() {
    if (this.busy) return;
    const c = app.career, st = c.story;
    // round 84: the first night here you call Mom first; on draft day the TV's on
    if (this.ringing) { this.thinkLine('I should get that.'); return; } // round 89b: the phone's ringing
    if (st?.stage === 'draftWeek' && st.draft && c.life.day >= st.draft.draft && !st.drafted) { this.thinkLine('Not tonight. The draft\'s on.'); return; }
    this.busy = true;
    const night = this.add.rectangle(0, 0, 1280, 720, 0x0c1640, 1).setOrigin(0, 0).setDepth(8900).setAlpha(0);
    this.tweens.add({ targets: night, alpha: 0.58, duration: 700, ease: 'Sine.easeInOut' });
    // lie down on the couch: a station with no mini-game, so the room draws him in the `sleep` clip
    this.time.delayedCall(350, () => {
      const st: Station = { id: 'sleep', label: 'Sleep', spot: SPOTS.couch, at: ApartmentScene.SLEEP_AT, clip: 'sleep', period: 3.2, yaw: 0, flip: false, lift: 0, depthFt: 3.27 };
      this.startActivity(st);
      this.drawPlayer(0);
    });
    // Zzz rise from his head (the pillow end)
    const head = { x: sxOf(ApartmentScene.SLEEP_AT.x - 1.6), y: syOf(ApartmentScene.SLEEP_AT.y) - 70 };
    const zs = [0, 1, 2].map((i) => {
      const z = this.add.text(head.x + i * 12, head.y, 'Z', { fontFamily: FONT, fontSize: `${15 + i * 6}px`, color: '#e4eeff', fontStyle: 'bold', stroke: '#0a1030', strokeThickness: 4 }).setOrigin(0.5).setDepth(8950).setAlpha(0);
      this.tweens.add({ targets: z, y: head.y - 44 - i * 12, x: head.x + 14 + i * 16, alpha: { from: 0, to: 1 }, duration: 900, delay: 600 + i * 380, onComplete: () => this.tweens.add({ targets: z, alpha: 0, duration: 400 }) });
      return z;
    });
    sfx.blip(true);
    this.time.delayedCall(1900, () => {
      advanceDay(c); markMissed(c); app.changed();
      // round 84: the night after the scrimmage the week of work starts (the generator, the register, the gym)
      const s = c.story;
      if (s?.stage === 'draftWeek' && s.draft && !s.montage && c.life.day > s.draft.scrimmage) {
        this.cameras.main.fadeOut(700, 0, 0, 0);
        this.time.delayedCall(750, () => { setStage('montage'); const [scene, data] = storyScene('montage'); this.scene.start(scene, data); });
        return;
      }
      this.dateBanner(dateLabel(c.life.day).toUpperCase(), 700); // round 83: the date, e.g. SPRING 3
    });
    this.time.delayedCall(3000, () => {
      this.tweens.add({ targets: night, alpha: 0, duration: 700, ease: 'Sine.easeInOut', onComplete: () => night.destroy() });
      for (const z of zs) z.destroy();
    });
    this.time.delayedCall(3500, () => {
      // up off the couch
      this.stopActivity();
      this.pos = { ...SPOTS.couch }; this.face = { x: 0, y: 1 }; this.view = undefined; this.vel = { x: 0, y: 0 };
      this.busy = false;
      this.sendEnergyOrbs(sleepPlan(c), ENERGY_ORB, { x: sxOf(SPOTS.couch.x), y: syOf(SPOTS.couch.y) - 110 });
      this.time.delayedCall(900, () => this.checkCalls()); // round 82 / 89b: a morning call rings on the landline
    });
  }

  /** While sleeping the couch is bare (frame 1): its blanket is over him. */
  onActivity(st: Station | null) { this.couch?.setFrame(st?.id === 'sleep' ? 1 : 0); }

  /** The blanket follows his body: same floor point, scaled with his figure height (1 art px = 1 pose unit at 6'6"). */
  drawBlanket() {
    const on = this.activity?.id === 'sleep' && this.player.visible;
    this.blanket.setVisible(on);
    if (!on) return;
    const s = ART * (figureHeight(app.career.height) / 100);
    const breathe = Math.sin(this.t * 2) * 0.4;
    this.blanket.setScale(s).setPosition(sxOf(ApartmentScene.SLEEP_AT.x) + this.blanketOff.x * s, syOf(ApartmentScene.SLEEP_AT.y) + this.blanketOff.y * s + breathe).setDepth(this.player.depth + 0.1);
  }

  // ------------------------------------------------------------ season calendar (round 46; round 83: seasons)
  /** The calendar screen: which page (season) is showing, the pages, and its objects. */
  cal: { i: number; pages: [number, number][]; objs: Phaser.GameObjects.GameObject[]; stickX: number } | null = null;

  /** ✕ at the calendar: the season you're in, with the key games flying pennants. ◀ ▶ = season, L1 / ○ = close. */
  openCalendar() {
    if (this.busy) return;
    this.busy = true;
    const c = app.career, now = pageOf(c.life.day), inLeague = !c.story || c.story.stage === 'done';
    // today's season, the draft's (round 81), and the NBA season once you're in the league; no gaps between them
    const pages = pageRange([now, ...(c.story?.draft ? [pageOf(c.story.draft.draft)] : []), ...(inLeague ? seasonPages(c) : [])]);
    this.cal = { i: pages.findIndex(([y, s]) => y === now[0] && s === now[1]), pages, objs: [], stickX: 0 };
    this.drawCalendar();
    sfx.blip(true);
  }

  closeCalendar() {
    if (!this.cal) return;
    for (const o of this.cal.objs) o.destroy();
    this.cal = null; this.busy = false;
    sfx.blip(false);
  }

  drawCalendar() {
    const cal = this.cal!; for (const o of cal.objs) o.destroy(); cal.objs = [];
    // round 81: no NBA schedule on the calendar until you're in the league (the story's draft week instead)
    const c = app.career, [yr, se] = cal.pages[cal.i], weeks = seasonGrid(yr, se), storyEv = storyEventsByDay(c);
    const inLeague = !c.story || c.story.stage === 'done';
    const keys = inLeague ? keyGamesByDay(c) : new Map<number, ReturnType<typeof keyGamesByDay> extends Map<number, infer V> ? V : never>();
    const sims = inLeague ? simGamesByDay(c) : new Map<number, ReturnType<typeof simGamesByDay> extends Map<number, infer V> ? V : never>();
    const cells: (CalCell | null)[][] = weeks.map((w) => w.map((d) => {
      const kg = keys.get(d.day), team = kg ? TEAMS.find((t) => t.id === kg.opponent) : undefined;
      return { past: d.day >= 1 && d.day < c.life.day, today: d.day === c.life.day, pennant: kg ? [team?.colors[0] ?? '#6a3fa0', team?.colors[1] ?? '#f0f0f0'] : undefined };
    }));
    const tm = this.textures;
    if (tm.exists('cal_page')) tm.remove('cal_page');
    tm.addCanvas('cal_page', drawCalendarPage(cells));
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => { cal.objs.push(o); return o; };
    const pw = CAL.W * ART, ph = CAL.H * ART, ox = Math.round(640 - pw / 2), oy = Math.round(352 - ph / 2);
    const X = (ax: number) => ox + ax * ART, Y = (ay: number) => oy + ay * ART;
    add(this.add.rectangle(0, 0, 1280, 720, 0x0a0806, 0.6).setOrigin(0, 0).setDepth(9600));
    add(this.add.image(ox + 8, oy + 10, 'cal_page').setOrigin(0, 0).setScale(ART).setDepth(9600).setTint(0x000000).setAlpha(0.35)); // shadow
    add(this.add.image(ox, oy, 'cal_page').setOrigin(0, 0).setScale(ART).setDepth(9601));
    const T = (x: number, y: number, str: string, size: number, col = '#2d2218', o: Phaser.Types.GameObjects.Text.TextStyle = {}) =>
      add(this.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color: col, fontStyle: 'bold', ...o }).setDepth(9602));
    // the season at the top (where the owner's reference has it), the year beside it
    T(X(CAL.W / 2), Y(CAL.titleH / 2 + 2), SEASONS[se], 40).setOrigin(0.5);
    T(X(CAL.W - 70), Y(CAL.titleH / 2 + 6), `Year ${yr}`, 18, '#6e5a40').setOrigin(0.5);
    WEEKDAYS.forEach((d, k) => T(X(CAL.gx0 + CAL.colW * (k + 0.5)), Y(CAL.titleH + CAL.headH / 2 + 1), d, 26).setOrigin(0.5));
    const rh = calRowH(weeks.length), WHY: Record<string, string> = { Opener: 'OPENER', Finale: 'FINALE', Rivalry: 'RIVAL', 'National TV': 'NAT TV', Contender: 'CONTENDER', Playoff: 'PLAYOFF', Lottery: 'LOTTERY' };
    weeks.forEach((w, r) => w.forEach((d, k) => {
      const x0 = CAL.gx0 + CAL.colW * k + 2, y0 = CAL.titleH + CAL.headH + rh * r + 2, cw = CAL.colW - 2, ch = rh - 2;
      T(X(x0 + 3), Y(y0 + 1), String(d.d), 22, d.day < c.life.day ? '#6e5e4a' : '#2d2218');
      // round 81: the draft week (combine days, the scrimmage, the draft) as coloured tags
      const ev = storyEv.get(d.day);
      if (ev) T(X(x0 + cw / 2), Y(y0 + ch * 0.62), ev.label, ev.label.length > 7 ? 12 : 15, '#ffffff', { backgroundColor: ev.color, padding: { x: 4, y: 2 } }).setOrigin(0.5);
      // round 83: an off-screen game (you don't play it): the opponent small and grey, then the result
      const sg = sims.get(d.day);
      if (sg) {
        T(X(x0 + cw / 2), Y(y0 + ch * 0.5), `vs ${sg.opponent}`, 12, '#7a6a54').setOrigin(0.5);
        if (sg.result) T(X(x0 + cw / 2), Y(y0 + ch * 0.76), `${sg.result.won ? 'W' : 'L'} ${sg.result.us}-${sg.result.them}`, 11, sg.result.won ? '#2f6a3a' : '#8a2a14').setOrigin(0.5);
      }
      const kg = keys.get(d.day); if (!kg) return;
      const team = TEAMS.find((t) => t.id === kg.opponent), main = team?.colors[0] ?? '#6a3fa0';
      const lum = parseInt(main.slice(1, 3), 16) * 0.3 + parseInt(main.slice(3, 5), 16) * 0.59 + parseInt(main.slice(5, 7), 16) * 0.11;
      const px = x0 + Math.round(cw * 0.3), py = y0 + Math.round(ch * 0.34);
      T(X(px + 4), Y(py + 8), kg.opponent, 13, lum > 150 ? '#1a1410' : '#ffffff', { stroke: lum > 150 ? '#ffffff' : '#1a1410', strokeThickness: 3 }).setOrigin(0, 0.5);
      T(X(px + 3), Y(py + 18), WHY[kg.why] ?? kg.why.toUpperCase(), 11, '#8a2a14').setOrigin(0, 0);
      add(this.add.image(X(x0 + cw - 4), Y(y0 + 4), 'icon_ball').setOrigin(1, 0).setScale(ART * 0.75 * 2).setDepth(9602));
    }));
    const prev = cal.i > 0, next = cal.i < cal.pages.length - 1;
    T(640, oy + ph + 22, `${prev ? '◀' : ' '}  ${next ? '▶' : ' '} season   ·   L1 close`, 16, '#ffffff', { stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5);
  }

  /** Calendar input (the room is `busy` while it's open, so it doesn't walk). */
  calendarInput() {
    const cal = this.cal!, inp = this.inp;
    if (inp.cancel()) { this.closeCalendar(); return; }
    const sx = inp.move.x, flick = Math.abs(sx) > 0.6 && Math.abs(cal.stickX) <= 0.6 ? Math.sign(sx) : 0;
    cal.stickX = sx;
    const dir = inp.pressed('left') || inp.pressed('tabPrev') || flick < 0 ? -1 : inp.pressed('right') || inp.pressed('tabNext') || flick > 0 ? 1 : 0;
    const i = Math.max(0, Math.min(cal.pages.length - 1, cal.i + dir));
    if (i !== cal.i) { cal.i = i; this.drawCalendar(); sfx.blip(true); }
  }

  extraObstacles(): Poly[] { return this.cat.perch || this.cat.hop ? [] : [circlePoly(this.cat.p, CAT_R)]; }

  onUpdate(dt: number) {
    this.stepRing(); // round 89b
    // round 81; round 85: a script can start the next one as it ends (the phone menu → the call): keep the new one
    const ag = this.agent;
    if (ag) { if (!ag.update(dt)) { if (this.agent === ag) this.agent = null; } else this.busy = true; }
    if (this.agent && this.agent !== ag) this.busy = true;
    else if (this.cal) this.calendarInput();
    else if (this.films) this.filmInput(); // round 91
    else if (this.board && this.t > this.boardAt + 0.25 && (this.inp.cancel() || this.inp.pressed('a'))) this.closeBoard(); // (not on the ✕ that opened it)
    const cat = this.cat;
    catStep(cat, this.t, dt, this.catPolys(), Math.random);
    const f = cat.hop ? 2 : cat.state === 'walk' ? 2 + (Math.floor(this.t / 0.16) % 2) : cat.state === 'loaf' ? 1 : 0;
    const x = sxOf(cat.p.x), y = syOf(cat.p.y), lift = cat.z * RS;
    this.catSprite.setFrame(f).setFlipX(cat.state !== 'sit' && cat.face < 0).setPosition(x, y + 2 - lift);
    if (!cat.perch) this.shadow.fillStyle(0x2a1a0e, 0.28).fillEllipse(x, y + 1, CAT_W * ART * 0.8 * (1 - Math.min(0.5, cat.z / 4)), 6);
    if (this.tank) this.tank.setFrame(Math.floor(this.t / 0.6) % 2);
    if (this.fan) this.fan.setFrame(Math.floor(this.t / 0.11) % 3);
    this.glow.setAlpha(0.76 + Math.sin(this.t * 2.1) * 0.04);
    this.drawBlanket();
  }

  /** What the cat avoids: the room + you (rebuilt only when you move, so its path cache stays warm). */
  catPolys(): Poly[] {
    const k = `${this.pos.x.toFixed(1)},${this.pos.y.toFixed(1)}`;
    if (k !== this.catPolyKey) { this.catPolyKey = k; this.catPolyCache = [...this.polys, circlePoly(this.pos, PLAYER_R + 0.1)]; }
    return this.catPolyCache;
  }

  sortExtras(overlapsAt: (pos: V, w: number, h: number) => (p: Piece) => boolean) {
    // on (or hopping off) the couch the cat sits in front of it
    const couch = FURNITURE.find((f) => f.id === 'couch')!;
    this.catSprite.setDepth(this.cat.perch || this.cat.z > 0.05 ? Math.max(syOf(this.cat.p.y), syOf(couch.y + couch.d) + 0.5) : syOf(actorDepthFt(this.cat.p, FURNITURE, overlapsAt(this.cat.p, 22, 40))));
  }
}
