import Phaser from 'phaser';
import { buildRoomArt, buildCatTexture, buildGlow, buildSleepBlanket, drawCalendarPage, CAT_W, LAMP_ART, CAL, calRowH, CalCell } from '../render/roomArt';
import { RS, V, Piece, RoomDef, Station, APARTMENT, actorDepthFt, PLAYER_R, sxOf, syOf, Poly, FURNITURE, Cat, newCat, catStep, CAT_R, SPOTS } from '../world/apartment';
import { RoomScene, ART, circlePoly } from './RoomScene';
import { FONT } from './ui';
import { app } from '../state';
import { sfx } from '../audio/sfx';
import { advanceDay, sleepPlan, ENERGY_ORB, draftWeek, storyEventsByDay, juneDue, haleCalls } from '../career/career';
import { AgentTalk } from './agentTalk';
import { AGENT_PATHS } from '../world/agentPaths';
import { setStage, storyScene } from './setup';
import { dateOfDay, monthGrid, keyGamesByDay, seasonMonths, monthRange, storyDay, skipTo, MONTHS, WEEKDAYS } from '../career/calendar';
import { figureHeight } from '../render/sprites';
import { TEAMS } from '../sim/data';

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

  /** Round 81: the agent's first meeting here. */
  story: 'agent' | null = null;
  agent: AgentTalk | null = null;
  init(data?: { at?: string; story?: 'agent' }) {
    super.init(data);
    this.story = data?.story ?? null; this.agent = null;
    this.tank = null; this.fan = null; this.couch = null; this.catPolyKey = ''; this.cal = null;
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
    if (this.story === 'agent') this.startAgent();
    else this.maybeCall(); // round 82: a June morning Hale hasn't called yet (Load Save, back from the garage)
  }

  /** Round 82: a big date card (the DAY banner's style), up and gone. */
  private dateBanner(text: string, hold = 800) {
    const banner = this.add.text(640, 330, text, { fontFamily: FONT, fontSize: '54px', color: '#ffe9a8', fontStyle: 'bold', stroke: '#2a1a10', strokeThickness: 8 }).setOrigin(0.5).setDepth(8960).setAlpha(0).setScale(0.8);
    this.tweens.add({ targets: banner, alpha: 1, scale: 1, duration: 450, ease: 'Back.easeOut', hold, yoyo: true, onComplete: () => banner.destroy() });
    sfx.greenChime();
  }

  /**
   * Round 82 (owner): the days before the draft, Hale calls every morning about a team thinking of picking you (one
   * call a day, Jun 20-23). The first morning back you think about the two months first: no time to train, work to
   * make the debt payments.
   */
  private maybeCall() {
    const c = app.career, st = c.story;
    if (!st || st.stage !== 'draftWeek' || !st.june || !st.draft || this.agent) return;
    const day = c.life.day, first = storyDay('june');
    if (day >= st.draft.draft || st.callDay === day || day < first) return;
    const calls = haleCalls(c), call = calls[Math.min(calls.length - 1, day - first)];
    st.callDay = day; app.changed();
    const you = c.firstName || c.name.split(' ')[0], left = st.draft.draft - day;
    const think = (text: string) => ({ say: { who: 'you' as const, text } });
    this.agent = new AgentTalk(this, { x: -20, y: 0 }, [
      { wait: 0.5 },
      ...(day === first ? [
        think('Two months of double shifts, just to keep up with the debt payments.'),
        think(`Haven't had time to touch a ball since the scrimmage. And the draft's in ${left === 1 ? 'one day' : `${['zero', 'one', 'two', 'three', 'four', 'five', 'six'][left] ?? left} days`}.`),
      ] : []),
      { run: () => sfx.phoneRing() },
      { say: { who: 'narrator' as const, text: 'Your phone buzzes. VICTOR HALE.' } },
      ...call.lines.map((l) => ({ say: l.who === 'agent' ? { who: 'agent' as const, name: 'VICTOR HALE (PHONE)', text: l.text } : { who: 'me' as const, name: you, text: l.text } })),
    ], { phone: true });
  }

  /**
   * Round 81: Victor Hale's first meeting, here: who he is, your situation, "you can't fail", the draft week on the
   * calendar, then off to the garage.
   */
  private startAgent() {
    const c = app.career, you = c.firstName || c.name.split(' ')[0];
    const st = c.story!;
    const me = (text: string) => ({ say: { who: 'me' as const, name: you, text } });
    const hale = (text: string) => ({ say: { who: 'agent' as const, text } });
    const P = AGENT_PATHS.apartment;
    this.dateBanner('THURSDAY, APRIL 1', 700); // round 82 (owner): your first day here
    this.agent = new AgentTalk(this, P.haleStart, [
      { wait: 1.8 },
      hale(`You came. Good. ${st.agent ?? 'Victor Hale'}.`),
      hale('I represent players in the NBA. I was at the national final. I\'ve done this a long time, and I know what I saw.'),
      hale('Natural talent. And the drive to go with it. That combination doesn\'t come around often.'),
      me('I appreciate it, Mr. Hale. I really do. But I can\'t think about the NBA right now.'),
      me('Our generator blew up. Took half the trailer with it. We\'re fifteen thousand in debt, and my mom...'),
      hale('I heard. Rough luck.'),
      hale('So here\'s what we\'ll do. This place? It\'s yours.'),
      // round 81b (owner): free until you make it, then about your whole first contract plus the generator
      hale('Rent free until you make it.'),
      me('Better not be an April Fools joke.'), // round 82 (owner): it's the first of April
      hale('When you do, it\'ll run you about your whole first contract. Plus what that generator costs.'),
      hale('One condition.'),
      hale('You can\'t fail.'),
      hale('Come here. Let me show you something.'),
      // round 81b: around the kitchen island, not through it
      { agentTo: P.haleToCalendar },
      { youTo: P.youToCalendar },
      { run: () => { st.draft = draftWeek(c.life.day, storyDay('draft')); app.changed(); this.busy = false; this.openCalendar(); } }, // (it only opens outside a cutscene)
      hale('This is your week. Seven days from today: the combine.'),
      hale('Two days of it. Skill tests, drills, measurements. Then a scrimmage in front of every scout in the league.'),
      hale('Then you wait. The draft\'s not till June. The twenty-fourth.'), // round 82
      hale('Do what I tell you, and somebody calls your name on draft night. Late, maybe. But they\'ll call it.'),
      { run: () => this.closeCalendar() },
      hale('Now. The garage.'),
      { agentTo: P.haleToGarage },
      { youTo: P.youToGarage },
      { run: () => { sfx.doorOpen(); setStage('agentGarage'); this.cameras.main.fadeOut(600, 0, 0, 0); this.time.delayedCall(650, () => { const [scene, data] = storyScene('agentGarage'); this.scene.start(scene, data); }); } },
      { wait: 2 },
    ]);
  }

  actions() {
    return [
      { label: 'Sleep', spot: SPOTS.couch, run: () => this.sleep() },
      { label: 'Calendar', spot: SPOTS.calendar, run: () => this.openCalendar() },
    ];
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
    this.busy = true;
    const c = app.career;
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
      // round 82 (owner): after the scrimmage the story jumps to June, a few days before the draft
      const june = juneDue(c);
      if (june) { c.story!.june = true; skipTo(c, 'june'); } else advanceDay(c);
      app.changed();
      this.dateBanner(june ? 'TWO MONTHS LATER' : `DAY ${c.life.day}`, june ? 1100 : 700);
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
      this.time.delayedCall(900, () => this.maybeCall()); // round 82: Hale's morning call (June)
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

  // ------------------------------------------------------------ season calendar (round 46)
  /** The calendar screen: which month is showing, the season's months, and its objects. */
  cal: { i: number; months: [number, number][]; objs: Phaser.GameObjects.GameObject[]; stickX: number } | null = null;

  /** ✕ at the calendar: the month you're in, with the key games flying pennants. ◀ ▶ = month, L1 / ○ = close. */
  openCalendar() {
    if (this.busy) return;
    this.busy = true;
    const c = app.career, now = dateOfDay(c.life.day);
    const want = [now, ...(c.story?.draft ? [dateOfDay(c.story.draft.draft)] : [])]; // round 81: the draft's month too
    // round 82: no gaps (April to the June draft goes through May)
    const months = monthRange([...seasonMonths(c), ...want.map((w): [number, number] => [w.y, w.m])]);
    this.cal = { i: months.findIndex(([y, m]) => y === now.y && m === now.m), months, objs: [], stickX: 0 };
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
    const c = app.career, [yr, mo] = cal.months[cal.i], weeks = monthGrid(yr, mo), storyEv = storyEventsByDay(c);
    const keys = !c.story || c.story.stage === 'done' ? keyGamesByDay(c) : new Map<number, ReturnType<typeof keyGamesByDay> extends Map<number, infer V> ? V : never>();
    const cells: (CalCell | null)[][] = weeks.map((w) => w.map((d) => {
      if (!d) return null;
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
    // the month at the top (where the reference has the season)
    T(X(CAL.W / 2), Y(CAL.titleH / 2 + 2), MONTHS[mo], 40).setOrigin(0.5);
    T(X(CAL.W - 70), Y(CAL.titleH / 2 + 6), String(yr), 18, '#6e5a40').setOrigin(0.5);
    WEEKDAYS.forEach((d, k) => T(X(CAL.gx0 + CAL.colW * (k + 0.5)), Y(CAL.titleH + CAL.headH / 2 + 1), d, 26).setOrigin(0.5));
    const rh = calRowH(weeks.length), WHY: Record<string, string> = { Opener: 'OPENER', Finale: 'FINALE', Rivalry: 'RIVAL', 'National TV': 'NAT TV' };
    weeks.forEach((w, r) => w.forEach((d, k) => {
      if (!d) return;
      const x0 = CAL.gx0 + CAL.colW * k + 2, y0 = CAL.titleH + CAL.headH + rh * r + 2, cw = CAL.colW - 2, ch = rh - 2;
      T(X(x0 + 3), Y(y0 + 1), String(d.d), 22, d.day < c.life.day ? '#6e5e4a' : '#2d2218');
      // round 81: the draft week (combine days, the scrimmage, the draft) as coloured tags
      const ev = storyEv.get(d.day);
      if (ev) T(X(x0 + cw / 2), Y(y0 + ch * 0.62), ev.label, ev.label.length > 7 ? 12 : 15, '#ffffff', { backgroundColor: ev.color, padding: { x: 4, y: 2 } }).setOrigin(0.5);
      const kg = keys.get(d.day); if (!kg) return;
      const team = TEAMS.find((t) => t.id === kg.opponent), main = team?.colors[0] ?? '#6a3fa0';
      const lum = parseInt(main.slice(1, 3), 16) * 0.3 + parseInt(main.slice(3, 5), 16) * 0.59 + parseInt(main.slice(5, 7), 16) * 0.11;
      const px = x0 + Math.round(cw * 0.3), py = y0 + Math.round(ch * 0.34);
      T(X(px + 4), Y(py + 8), kg.opponent, 13, lum > 150 ? '#1a1410' : '#ffffff', { stroke: lum > 150 ? '#ffffff' : '#1a1410', strokeThickness: 3 }).setOrigin(0, 0.5);
      T(X(px + 3), Y(py + 18), WHY[kg.why] ?? kg.why.toUpperCase(), 11, '#8a2a14').setOrigin(0, 0);
      add(this.add.image(X(x0 + cw - 4), Y(y0 + 4), 'icon_ball').setOrigin(1, 0).setScale(ART * 0.75 * 2).setDepth(9602));
    }));
    const prev = cal.i > 0, next = cal.i < cal.months.length - 1;
    T(640, oy + ph + 22, `${prev ? '◀' : ' '}  ${next ? '▶' : ' '} month   ·   L1 close`, 16, '#ffffff', { stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5);
  }

  /** Calendar input (the room is `busy` while it's open, so it doesn't walk). */
  calendarInput() {
    const cal = this.cal!, inp = this.inp;
    if (inp.cancel()) { this.closeCalendar(); return; }
    const sx = inp.move.x, flick = Math.abs(sx) > 0.6 && Math.abs(cal.stickX) <= 0.6 ? Math.sign(sx) : 0;
    cal.stickX = sx;
    const dir = inp.pressed('left') || inp.pressed('tabPrev') || flick < 0 ? -1 : inp.pressed('right') || inp.pressed('tabNext') || flick > 0 ? 1 : 0;
    const i = Math.max(0, Math.min(cal.months.length - 1, cal.i + dir));
    if (i !== cal.i) { cal.i = i; this.drawCalendar(); sfx.blip(true); }
  }

  extraObstacles(): Poly[] { return this.cat.perch || this.cat.hop ? [] : [circlePoly(this.cat.p, CAT_R)]; }

  onUpdate(dt: number) {
    if (this.agent) { if (!this.agent.update(dt)) this.agent = null; else this.busy = true; } // round 81
    else if (this.cal) this.calendarInput();
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
