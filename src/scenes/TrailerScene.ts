import Phaser from 'phaser';
import { buildTrailerArt } from '../render/trailerArt';
import { buildGlow } from '../render/roomArt';
import { RoomDef, Poly, V, sxOf, syOf, RS } from '../world/apartment';
import { TRAILER_YARD, TRAILER_SOLID, DOOR_SPOT, PATH_END, DOOR_X, TRAILER, liftAt, MAILBOX_SPOT, GENERATOR_SPOT, MAILBOX } from '../world/trailer';
import { RoomScene, ART } from './RoomScene';
import { FONT } from './ui';
import { app } from '../state';
import { sfx } from '../audio/sfx';
import { advanceDay, sleepPlan, ENERGY_ORB, takeOnDebt, GENERATOR_DEBT } from '../career/career';
import { StoryBox, BoxSpeaker } from '../render/storyBox';
import { buildCelebSheet, CelebLook, CELEB_W, CELEB_H, CELEB_FRAMES } from '../render/celebs';
import { randomAppearance } from '../render/appearance';
import { SPRITE_SCALE } from '../render/sprites';
import { setStage, storyScene } from './setup';
import { prepareStory } from './preload';
import { drawBustPage, drawLetter, PAPER_W, PAPER_H, LETTER_W, LETTER_H } from '../render/paperArt';
import { kingstonLook } from '../sim/story';
import { skipTo } from '../career/calendar';

/**
 * Hooks for the story element at the trailer door (round 57: the owner will add one). Each runs when you go inside,
 * before the day ends. Empty for now.
 */
export const TRAILER_DOOR_STORY: ((at: 'trailerDoor') => void)[] = [];

/**
 * Round 57: the trailer yard, the "Lights on a generator" backstory place (the owner's photo + sketch). Walk the yard,
 * climb the steps, ✕ at the door: it opens, you go in and the day ends (night, "DAY n", morning on the top step,
 * energy orbs refill the bar). The generator chugs away beside the steps (louder as you get close).
 */
export class TrailerScene extends RoomScene {
  constructor() { super('Trailer'); }
  /** Round 57c: the night version (Menu → Trailer (night); story events can ask for it). */
  night = false;
  /** Round 60: 'night' = home after the 1s with Kingston (the next day is the big game). */
  story: 'night' | 'after' | 'snow' | 'homecoming' | 'letter' | null = null;
  /** Round 81: the generator blew up during the final and took part of the trailer with it (no power, smoke). */
  wreck = false;
  /** Round 80: winter (from the snowy morning on): snow on everything, flakes falling, your breath in the air. */
  snow = false;
  private flakes: { x: number; y: number; vy: number; ph: number; r: number }[] = [];
  private snowG: Phaser.GameObjects.Graphics | null = null;
  private puffs: { x: number; y: number; t: number }[] = [];
  private nextPuff = 0;
  private box: StoryBox | null = null;
  private lines: TLine[] = [];
  private choice = 0;
  /** Round 81: pages shown full screen (the newspaper, the letter), ✕ for the next. */
  private pages: { key: string; w: number; h: number; then?: () => void }[] = [];
  private pageObjs: Phaser.GameObjects.GameObject[] = [];
  private smoke: { x: number; y: number; t: number; r: number }[] = [];
  private smokeG: Phaser.GameObjects.Graphics | null = null;
  private nextSmoke = 0;
  /** Round 81: the mail carrier the morning after (walks to the mailbox, leaves a letter, walks off). */
  private mailman: { sprite: Phaser.GameObjects.Sprite; x: number; phase: 'in' | 'drop' | 'out'; t: number } | null = null;
  /**
   * Round 60b: the night after the 1s, you walk up the path, Mom comes out on the steps, you talk, she waves you in
   * and you follow her inside (→ the next day: the big game).
   */
  private cut: 'walkIn' | 'momOut' | 'talk' | 'usher' | 'walkUp' | null = null;
  private cutT = 0;
  private leg = 0;
  private shown = true;
  private mom: Phaser.GameObjects.Sprite | null = null;
  /** Round 71: a thought from looking at something in the yard is up (✕ closes it). */
  private thinking = false;
  init(data?: { at?: string; night?: boolean; story?: 'night' | 'after' | 'snow' | 'homecoming' | 'letter' }) {
    super.init(data); this.night = !!data?.night; this.story = data?.story ?? null;
    const st = app.career.story;
    if ((this.story === 'homecoming' || this.story === 'letter') && st && !st.trailerWrecked) { st.trailerWrecked = true; app.changed(); }
    this.wreck = !!st?.trailerWrecked;
    this.snow = this.story === 'snow' || this.story === 'homecoming' || this.story === 'letter' || (!this.story && !!st?.winter);
  }
  room(): RoomDef { return TRAILER_YARD; }
  buildArt(tm: Phaser.Textures.TextureManager) { return buildTrailerArt(tm, this.night, this.snow, this.wreck); }
  /** Round 80: after the final the generator has quit (Mom's call on the bus); round 81: blown up. */
  private get genDead() { return this.wreck || (this.snow && this.story !== 'snow'); }
  extraObstacles(): Poly[] { return [TRAILER_SOLID]; }
  /** Wood on the steps, grass and dirt everywhere else. */
  footSurface(): boolean | 'grass' { return liftAt(this.pos) > 0 ? false : 'grass'; }

  private piece(id: string) { return this.pieces.find((p) => p.art.piece?.id === id)?.img as Phaser.GameObjects.Sprite | undefined; }

  onCreate() {
    this.box = null; this.lines = []; this.cut = null; this.cutT = 0; this.leg = 0; this.mom = null; this.thinking = false;
    this.choice = 0; this.pages = []; this.pageObjs = []; this.smoke = []; this.smokeG = null; this.nextSmoke = 0; this.mailman = null;
    if (this.wreck) this.smokeG = this.add.graphics().setDepth(4800);
    if (this.story === 'letter') {
      // round 81: the next morning: out the door into the cold, the wreck in daylight; then the mail comes
      this.pos = { ...DOOR_SPOT }; this.face = { x: 0, y: 1 };
      this.cameras.main.fadeOut(0, 0, 0, 0);
      this.shown = false; this.busy = true;
    }
    this.flakes = []; this.snowG = null; this.puffs = []; this.nextPuff = 2;
    if (this.snow) this.buildSnow();
    if (this.story === 'snow') {
      // round 80: Mom woke you; you come out the door into the snow (the yard is yours, the bus is waiting)
      this.pos = { ...DOOR_SPOT }; this.face = { x: 0, y: 1 };
      this.cameras.main.fadeOut(0, 0, 0, 0);
      this.shown = false; this.busy = true;
    }
    if (app.career.story?.checkKingston) this.time.delayedCall(1500, () => prepareStory(this, 'kingston')); // round 80: the court visit is next (after your own sheet)
    if (this.story === 'night' || this.story === 'after' || this.story === 'homecoming') {
      this.box = new StoryBox(this, { y: 590 });
      this.mom = this.buildMom();
      this.cut = 'walkIn';
      sfx.music('mom'); // round 60c: "Sad Story" for the scene with Mom
      this.events.once('shutdown', () => sfx.music(null));
      this.cameras.main.fadeOut(0, 0, 0, 0); // dark until your sprite is drawn (round 60c)
      this.shown = false;
      this.busy = true; // a cutscene: the stick does nothing until you're inside
    }
    this.cameras.main.setBackgroundColor(this.night ? '#0b1020' : this.snow ? '#c3cad4' : '#4f97e2');
    if (this.snow) this.player.setTint(0xdfe6f2); // flat winter light
    this.events.once('shutdown', () => sfx.genHum(0));
    if (this.night) this.player.setTint(0x8a96c8);
    if (this.night && !this.wreck) { // round 81: no power after the blast, no lights
      // moonlit: you're cooler and darker; warm light pools from the porch bulb and the lit windows
      const key = buildGlow(this.textures);
      const face = syOf(TRAILER.front);
      const add = (x: number, y: number, s: number, a: number) => this.add.image(x, y, key).setScale(ART * s).setBlendMode(Phaser.BlendModes.ADD).setDepth(4990).setAlpha(a);
      add(sxOf(DOOR_X[0]) - 8, face - TRAILER.topFt * 22 + 30, 1.6, 0.55);          // the porch bulb
      for (const x of [4.4, 7.9, 14.9]) add(sxOf(x), face - 5.9 * 22, 1.3, 0.3); // the curtained windows
      add(sxOf(DOOR_X[0] + 1.4), face + 30, 2.6, 0.22);                               // light spilling on the steps
    }
  }

  actions() {
    const st = app.career.story;
    const morning = this.story === 'snow';
    if (this.story === 'letter') {
      // round 81: the morning after the final: Mom's asleep, the mail's come
      const read = !!st?.agent;
      return [
        { label: 'Go inside', spot: DOOR_SPOT, reach: 1.3, run: () => this.think('Ma\'s finally asleep. Let her rest.') },
        { label: 'Generator', spot: GENERATOR_SPOT, reach: 1.6, run: () => this.think('Nothing left of it but a burned-out shell.') },
        { label: read ? 'Mailbox' : 'Check the mail', spot: MAILBOX_SPOT, reach: 1.3, run: () => (read ? this.think('Nothing else in there.') : this.readMail()) },
        read
          ? { label: 'Go to the meeting', spot: PATH_END, reach: 1.8, run: () => this.storyExit('agent') }
          : { label: 'Leave', spot: PATH_END, reach: 1.8, run: () => this.think('The mailbox flag is up.') },
      ];
    }
    return [
      // round 71: after Mom's talk following the big game, the door waits until you've checked on Kingston
      { label: 'Go inside', spot: DOOR_SPOT, reach: 1.3, run: () => (morning ? this.think('I gotta catch the bus.') : st?.checkKingston ? this.think('I should check on Kingston.') : this.goInside()) },
      { label: 'Generator', spot: GENERATOR_SPOT, reach: 1.6, run: () => this.think(morning ? 'Come on, old man. Just hold on a little longer.' : this.genDead ? 'Still won\'t start.' : 'I\'m surprised this piece of junk still works, but I\'m glad it does.') },
      { label: 'Mailbox', spot: MAILBOX_SPOT, reach: 1.3, run: () => { sfx.blip(true); this.think('No mail.'); } },
      // round 57c: the end of the path (by the mailbox) leaves; round 80: in the story it leads on
      st?.checkKingston
        ? { label: 'Go see Kingston', spot: PATH_END, reach: 1.8, run: () => this.storyExit('kingston') }
        : morning
          ? { label: 'Catch the bus', spot: PATH_END, reach: 1.8, run: () => this.storyExit('bus') }
          : { label: 'Leave', spot: PATH_END, reach: 1.8, run: () => { sfx.footstep('grass', 0); this.scene.start('Title'); } },
    ];
  }

  /** Round 80: down the path to the next part of the story (Kingston at the court; the bus). */
  private storyExit(stage: 'kingston' | 'bus' | 'agent') {
    if (this.busy) return;
    this.busy = true;
    sfx.footstep('grass', 0);
    if (stage === 'agent') { skipTo(app.career, 'agent'); app.changed(); } // round 82: the next day, Thursday 1 April
    setStage(stage);
    this.cameras.main.fadeOut(650, 0, 0, 0);
    this.time.delayedCall(700, () => { const [scene, data] = storyScene(stage); this.scene.start(scene, data); });
  }

  // ---------- round 80: winter ----------
  private buildSnow() {
    for (let i = 0; i < 170; i++) this.flakes.push({ x: Math.random() * 1280, y: Math.random() * 720, vy: 26 + Math.random() * 46, ph: Math.random() * 6.3, r: Math.random() < 0.25 ? 2 : 1.3 });
    this.snowG = this.add.graphics().setScrollFactor(0).setDepth(8800);
  }
  private drawSnow(dt: number) {
    const g = this.snowG; if (!g) return;
    g.clear();
    for (const f of this.flakes) {
      f.y += f.vy * dt; f.x += Math.sin(this.t * 0.9 + f.ph) * 14 * dt - 6 * dt;
      if (f.y > 724) { f.y = -4; f.x = Math.random() * 1280; }
      if (f.x < -4) f.x = 1284;
      g.fillStyle(0xffffff, f.r > 1.5 ? 0.95 : 0.7).fillCircle(f.x, f.y, f.r);
    }
    // your breath now and then, a little cloud drifting up in front of your face
    if (this.player.visible && this.player.alpha > 0.5 && this.t > this.nextPuff) {
      this.nextPuff = this.t + 2.2 + Math.random() * 1.6;
      const cam = this.cameras.main, fx = this.face.x > 0.2 ? 1 : this.face.x < -0.2 ? -1 : 0;
      this.puffs.push({ x: this.player.x - cam.scrollX + fx * 14, y: this.player.y - cam.scrollY - this.player.displayHeight * 0.83, t: this.t });
    }
    this.puffs = this.puffs.filter((p) => this.t - p.t < 1.2);
    for (const p of this.puffs) {
      const k = (this.t - p.t) / 1.2;
      g.fillStyle(0xf4f7fb, 0.55 * (1 - k)).fillCircle(p.x + k * 8, p.y - k * 16, 4 + k * 9);
    }
  }

  /** Round 71: your thought in the story box (YOU, thinking); you stand still until ✕ closes it. */
  private think(text: string) {
    if (!this.box) this.box = new StoryBox(this, { y: 590 });
    this.lines = [{ who: 'you', text }];
    this.thinking = true; this.busy = true;
  }

  onUpdate(dt = 1 / 60) {
    // round 60: the story box (✕ reads on)
    if (this.box) {
      const l = this.lines[0];
      if (l?.choices) {
        // round 81: answer Mom (↑↓ + ✕)
        if (this.inp.pressed('down') || this.inp.pressed('up')) { this.choice = 1 - this.choice; sfx.blip(true); }
        this.box.show({ who: l.who, name: l.name, text: '', blocking: true, choices: l.choices.map((o) => o.text), choice: this.choice });
        if (this.inp.pressed('a')) { const pick = l.choices[this.choice]; this.lines.shift(); sfx.blip(true); pick.pick(); }
      } else if (l) {
        this.box.show({ who: l.who, text: l.text, blocking: true, name: l.name });
        if (this.inp.pressed('a')) { if (this.box.typing) this.box.finishTyping(); else { this.lines.shift(); sfx.blip(true); l.then?.(); } }
      } else this.box.hide();
      this.box.draw();
      // round 82: a line can put up a page (the letter after the bust paper): stay busy while it's up
      if (this.thinking && !this.lines.length) { this.thinking = false; this.busy = this.pages.length > 0; }
    }
    this.momScene(dt);
    this.drawSnow(dt);
    this.drawSmoke(dt);
    this.stepPages();
    this.stepMailman(dt);
    if (this.story === 'letter' && !this.shown && this.playerReady()) {
      // round 81: out the door, and here comes the mail
      this.shown = true; this.drawPlayer(0);
      const door = this.piece('door');
      door?.setFrame(1); sfx.doorOpen();
      this.cameras.main.fadeIn(700, 0, 0, 0);
      this.time.delayedCall(520, () => { door?.setFrame(0); sfx.doorClose(); });
      if (!app.career.story?.agent) this.time.delayedCall(1400, () => this.startMailman()); else this.busy = false;
    }
    if (this.story === 'snow' && !this.shown && this.playerReady()) {
      // round 80: fade in on the top step as the door shuts behind you
      this.shown = true; this.drawPlayer(0);
      prepareStory(this, 'final'); // tonight's game, drawn while you walk to the bus (after your own sheet)
      const door = this.piece('door');
      door?.setFrame(1); sfx.doorOpen();
      this.cameras.main.fadeIn(700, 0, 0, 0);
      this.time.delayedCall(520, () => { door?.setFrame(0); sfx.doorClose(); this.busy = false; });
    }
    // round 80: after the final the generator is dead (no shake, no hum)
    if (this.genDead) { this.piece('generator')?.setFrame(0); sfx.genHum(0); return; }
    // the generator runs: shakes a pixel and its light blinks; the hum grows as you walk up to it
    this.piece('generator')?.setFrame(Math.floor(this.t * 14) % 2);
    const g = TRAILER_YARD.furniture.find((p) => p.id === 'generator')!;
    const d = Math.hypot(this.pos.x - (g.x + g.w / 2), (this.pos.y - (g.y + g.d / 2)) * 1.4);
    sfx.genHum(Math.max(0.15, Math.min(1, 1.4 - d / 18)));
  }

  /**
   * ✕ at the door: it opens, you step in, night falls and the day ends (the owner: a story element goes here later:
   * TRAILER_DOOR_STORY). In the morning you're back on the top step with the door shut and your energy refilled.
   */
  /**
   * Round 60d: Mom the day of the big game. A great game (Lincoln won, your stat sum the best on the floor): she's so
   * proud you got your opportunity and made the most of it. Otherwise: she talked to the scout, and he said you have
   * promise. Either way: go check on Kingston.
   */
  private afterLines(you: string): { who: BoxSpeaker; text: string; name?: string }[] {
    const r = app.career.story?.bigGame ?? { great: false, won: false, pts: 0, reb: 0, ast: 0 };
    const kingston = { who: 'mom' as const, text: 'Now go check on Kingston. That poor boy was sick as a dog.' };
    if (r.great) return [
      { who: 'mom', text: 'There\'s my baby! The whole street\'s talking about you.' },
      { who: 'me', name: you, text: 'Ma...' },
      { who: 'mom', text: 'You got your opportunity and you made the most of it. I am so proud of you.' },
      { who: 'mom', text: 'That\'s what I told you. Be ready, and when it comes, you take it.' },
      kingston,
    ];
    return [
      { who: 'mom', text: 'Hey, come here. How you feeling?' },
      { who: 'me', name: you, text: r.won ? 'I blew it, Ma. First real chance and I blew it.' : 'We lost, Ma. First real chance and I blew it.' },
      { who: 'mom', text: 'Mm-mm. I talked to that scout after the game.' },
      { who: 'mom', text: 'He said you have promise. He wrote your name down, baby. Your name.' },
      { who: 'mom', text: 'So you keep working. This isn\'t the end. It\'s the start.' },
      kingston,
    ];
  }

  /** Round 60b: Mom, a standing front-view figure (the fans' drawing): your skin, long hair, a plain hoodie. */
  private buildMom(): Phaser.GameObjects.Sprite {
    const c = app.career, key = `story_mom_${c.appearance.skin}_v1`;
    if (!this.textures.exists(key)) {
      const a = randomAppearance(() => 0.37);
      Object.assign(a, { skin: c.appearance.skin, hair: 'curly', hairColor: '#2b1d14', facial: 'none', headband: null, goggles: false, mask: false, armSleeve: 'none', wristband: null, legSleeve: 'none', kneePad: false, mouth: 'smile' });
      const look: CelebLook = { a, outfit: 'hoodie', color: '#6b4a5e', accent: '#d9c7ae', hat: 'none', hatColor: '#000000', shades: null, chain: false, longHair: '#2b1d14', stand: true, side: 'neutral' };
      const tex = this.textures.addCanvas(key, buildCelebSheet(look))!;
      for (let f = 0; f < CELEB_FRAMES; f++) tex.add(f, 0, f * CELEB_W, 0, CELEB_W, CELEB_H);
    }
    const door = this.piece('door');
    return this.add.sprite(sxOf(DOOR_SPOT.x), syOf(DOOR_SPOT.y - 0.35) - liftAt(DOOR_SPOT) * RS, key, 0)
      .setOrigin(0.5, 1).setScale(SPRITE_SCALE * 0.95).setTint(this.night ? 0x9aa4d4 : 0xffffff).setAlpha(0).setDepth((door?.depth ?? 0) + 1);
  }

  /** Round 60b: the cutscene with Mom, step by step (busy the whole time). */
  private momScene(dt: number) {
    if (!this.cut) return;
    this.cutT += dt;
    const c = app.career, you = c.firstName || c.name.split(' ')[0];
    const door = this.piece('door'), mom = this.mom!;
    if (this.cut === 'walkIn') {
      // round 60c: wait for your sprite, then fade in and start walking; build tomorrow's big game meanwhile
      if (!this.shown) {
        if (!this.playerReady()) return;
        this.shown = true; this.drawPlayer(0);
        this.cameras.main.fadeIn(600, 0, 0, 0);
        if (this.story === 'night') prepareStory(this, 'bigGame');
        return;
      }
      // up the dirt path to the foot of the steps
      const legs: V[] = [{ x: 20.6, y: 9 }, { x: 20.6, y: 5.0 }];
      if (this.walkTowards(legs[this.leg], dt) && ++this.leg >= legs.length) {
        this.face = { x: 0, y: -1 }; this.drawPlayer(0);
        this.cut = 'momOut'; this.cutT = 0;
        sfx.doorOpen(); door?.setFrame(1);
        this.tweens.add({ targets: mom, alpha: 1, duration: 450 });
      }
    } else if (this.cut === 'momOut') {
      this.drawPlayer(0);
      if (this.cutT > 0.7) {
        this.cut = 'talk';
        this.lines = this.story === 'homecoming' ? this.homecomingLines(you) : this.story === 'after' ? this.afterLines(you) : [
          { who: 'mom', text: 'There you are. Look at you, you\'re soaked. How\'d it go?' },
          { who: 'me', name: you, text: 'He cooked me again, Ma. Kingston\'s just... better. Way better.' },
          { who: 'me', name: you, text: 'Scouts are coming for him tomorrow. Nobody\'s gonna be looking at me.' },
          { who: 'mom', text: 'Hey. Look at me. You keep putting in the work. Every day, rain or not.' },
          { who: 'mom', text: 'Chances don\'t come around twice, baby. When that golden opportunity shows up, you gotta be ready for it.' },
          { who: 'mom', text: 'Now get inside and get some sleep. Big game tomorrow.' },
        ];
      }
    } else if (this.cut === 'talk') {
      this.drawPlayer(0);
      // she talks with her hands now and then
      mom.setFrame(this.lines[0]?.who === 'mom' && Math.sin(this.t * 2.2) > 0.6 ? 4 : 0);
      if (!this.lines.length) { this.cut = 'usher'; this.cutT = 0; }
    } else if (this.cut === 'usher') {
      // waves you in (night) / waves, then heads back inside (after the game)
      this.drawPlayer(0);
      mom.setFrame(this.cutT < 1.3 ? (Math.floor(this.cutT / 0.22) % 2 ? 5 : 4) : 0);
      if (this.cutT > 1.3 && mom.alpha === 1) this.tweens.add({ targets: mom, alpha: 0, duration: 380 });
      if (this.cutT > 1.8) {
        if (this.story === 'after') {
          // round 60d: she goes back in; the yard is yours (the prologue is over)
          door?.setFrame(0); sfx.doorClose();
          this.cut = null; this.busy = false; this.box?.hide();
          setStage('done'); sfx.music(null);
          c.story!.checkKingston = true; app.changed(); // round 71: the door reminds you until you've seen him
          prepareStory(this, 'kingston'); // round 80: the path end leads to him now
          return;
        }
        this.cut = 'walkUp'; this.cutT = 0;
      }
    } else if (this.cut === 'walkUp') {
      if (this.walkTowards(DOOR_SPOT, dt) || this.cutT > 4) {
        this.cut = null; this.busy = false;
        this.goInside(); // night falls → DAY 2 → the big game (story 'night' branch)
      }
    }
  }

  /** Round 60: after the night of the 1s, the next morning is the big game on the school court. */
  private nextDay() {
    const c = app.career;
    advanceDay(c);
    setStage('bigGame');
    const banner = this.add.text(640, 330, `DAY ${c.life.day}`, { fontFamily: FONT, fontSize: '54px', color: '#ffe9a8', fontStyle: 'bold', stroke: '#2a1a10', strokeThickness: 8 }).setOrigin(0.5).setDepth(8960).setAlpha(0).setScale(0.8);
    this.tweens.add({ targets: banner, alpha: 1, scale: 1, duration: 450, ease: 'Back.easeOut', hold: 600 });
    sfx.greenChime();
    // (before goInside's morning callbacks at +1.7 s: this scene is gone by then)
    this.time.delayedCall(900, () => { this.cameras.main.fadeOut(450, 0, 0, 0); });
    this.time.delayedCall(1400, () => { const [scene, data] = storyScene('bigGame'); this.scene.start(scene, data); });
  }

  goInside() {
    if (this.busy) return;
    this.busy = true;
    const c = app.career, door = this.piece('door');
    sfx.doorOpen(); door?.setFrame(1);
    this.tweens.add({ targets: this.player, alpha: 0, duration: 380, delay: 220 });
    const night = this.add.rectangle(0, 0, 1280, 720, 0x070b1c, 1).setOrigin(0, 0).setDepth(8900).setAlpha(0);
    this.tweens.add({ targets: night, alpha: 0.88, duration: 800, delay: 300, ease: 'Sine.easeInOut' });
    this.time.delayedCall(750, () => { door?.setFrame(0); sfx.doorClose(); });
    this.time.delayedCall(1400, () => {
      for (const h of TRAILER_DOOR_STORY) h('trailerDoor');
      if (this.story === 'night') { this.nextDay(); return; }
      if (this.story === 'homecoming') { this.toLetterMorning(); return; }
      advanceDay(c); app.changed();
      const banner = this.add.text(640, 330, `DAY ${c.life.day}`, { fontFamily: FONT, fontSize: '54px', color: '#ffe9a8', fontStyle: 'bold', stroke: '#2a1a10', strokeThickness: 8 }).setOrigin(0.5).setDepth(8960).setAlpha(0).setScale(0.8);
      this.tweens.add({ targets: banner, alpha: 1, scale: 1, duration: 450, ease: 'Back.easeOut', hold: 800, yoyo: true, onComplete: () => banner.destroy() });
      sfx.greenChime();
    });
    this.time.delayedCall(3100, () => {
      // morning: out on the top step, the door shut behind you
      this.pos = { ...DOOR_SPOT }; this.face = { x: 0, y: 1 }; this.view = undefined; this.vel = { x: 0, y: 0 };
      sfx.doorOpen(); door?.setFrame(1);
      this.time.delayedCall(420, () => { door?.setFrame(0); sfx.doorClose(); });
      this.player.setAlpha(1); this.drawPlayer(0);
      this.tweens.add({ targets: night, alpha: 0, duration: 800, ease: 'Sine.easeInOut', onComplete: () => night.destroy() });
    });
    this.time.delayedCall(3700, () => {
      this.busy = false;
      const from: V = { x: sxOf(DOOR_SPOT.x), y: syOf(DOOR_SPOT.y) - 120 };
      this.sendEnergyOrbs(sleepPlan(c), ENERGY_ORB, from);
    });
  }

  // ---------- round 81: home after the final, the letter ----------
  /** Mom at the door: did you win? (your answer), then the generator, the repairs, the debt. */
  private homecomingLines(you: string): TLine[] {
    const won = !!app.career.story?.final?.won;
    const after: TLine[] = [
      { who: 'mom', text: 'Baby, I have to tell you something. The generator went up while you were gone.' },
      { who: 'mom', text: 'Caught fire and took the side of the trailer with it. I got out. I\'m fine. I\'m fine.' },
      { who: 'me', name: you, text: 'Ma...' },
      { who: 'mom', text: 'I called around about fixing it. A new generator, the wiring, that whole wall... It\'s more than we have. A lot more.' },
      { who: 'mom', text: 'We\'d have to borrow it. Real debt, baby. The kind that follows you.' },
      { who: 'me', name: you, text: 'Then we\'ll probably have to.', then: () => this.debtPop() },
      { who: 'mom', text: '...Okay. Come inside, it\'s freezing out here.' },
    ];
    const answer = (mine: string, hers: string) => () => { this.lines.unshift({ who: 'me', name: you, text: mine }, { who: 'mom', text: hers }); };
    return [
      { who: 'mom', text: 'There you are. You made it home.' },
      { who: 'mom', text: 'Well? Don\'t keep me waiting. Did you win?' },
      {
        who: 'me', name: you, text: '', choices: [
          { text: 'I played well.', pick: answer('I played well.', 'That\'s all I ever ask of you, baby.') },
          won
            ? { text: 'We won, Ma. We\'re national champions.', pick: answer('We won, Ma. We\'re national champions.', 'Champions! My baby is a national champion!') }
            : { text: 'We lost. Crestview won it.', pick: answer('We lost. Crestview won it.', 'Oh, baby. Come here. I\'m proud of you anyway. You hear me?') },
        ],
      },
      ...after,
    ];
  }

  /** The debt goes on the books once; a red "-$15,000" rises off you. */
  private debtPop() {
    const c = app.career, had = c.story?.debt;
    takeOnDebt(c); app.changed();
    if (had) return;
    const t = this.add.text(sxOf(this.pos.x), syOf(this.pos.y) - 200, `-$${GENERATOR_DEBT.toLocaleString('en-US')}`, { fontFamily: FONT, fontSize: '30px', color: '#ff6a5a', fontStyle: 'bold', stroke: '#2a0a08', strokeThickness: 6 }).setOrigin(0.5).setDepth(9300);
    this.tweens.add({ targets: t, y: t.y - 50, alpha: 0, duration: 2400, delay: 600, onComplete: () => t.destroy() });
    sfx.groan();
  }

  /** After the homecoming: night, then (round 82) a month on, the letter morning, 31 March (the day art, so a fresh scene). */
  private toLetterMorning() {
    const c = app.career;
    skipTo(c, 'letter'); setStage('letter');
    const banner = this.add.text(640, 330, 'ONE MONTH LATER', { fontFamily: FONT, fontSize: '54px', color: '#ffe9a8', fontStyle: 'bold', stroke: '#2a1a10', strokeThickness: 8 }).setOrigin(0.5).setDepth(8960).setAlpha(0).setScale(0.8);
    this.tweens.add({ targets: banner, alpha: 1, scale: 1, duration: 450, ease: 'Back.easeOut', hold: 600 });
    sfx.greenChime();
    this.time.delayedCall(900, () => this.cameras.main.fadeOut(450, 0, 0, 0));
    this.time.delayedCall(1400, () => { const [scene, data] = storyScene('letter'); this.scene.start(scene, data); });
  }

  /** Smoke still curling up out of the burned generator. */
  private drawSmoke(dt: number) {
    const g = this.smokeG; if (!g) return;
    const gen = TRAILER_YARD.furniture.find((p) => p.id === 'generator')!;
    if (this.t > this.nextSmoke) {
      this.nextSmoke = this.t + (this.story === 'homecoming' ? 0.25 : 0.6);
      this.smoke.push({ x: sxOf(gen.x + gen.w / 2) + (Math.random() - 0.5) * 18, y: syOf(gen.y) - 60, t: this.t, r: 5 + Math.random() * 5 });
    }
    this.smoke = this.smoke.filter((s) => this.t - s.t < 4.5);
    g.clear();
    for (const s of this.smoke) {
      const k = (this.t - s.t) / 4.5;
      g.fillStyle(this.night ? 0x3a3e48 : 0x6a6e76, 0.45 * (1 - k)).fillCircle(s.x + Math.sin(s.t * 3 + k * 4) * 10 - k * 30, s.y - k * 170, s.r + k * 22);
    }
    void dt;
  }

  /** The mail carrier: a front-view figure in a blue uniform and cap, walking in along the road. */
  private startMailman() {
    const key = 'story_mailman_v1';
    if (!this.textures.exists(key)) {
      const a = randomAppearance(() => 0.61);
      Object.assign(a, { skin: 1, hair: 'buzz', hairColor: '#5a4632', facial: 'mustache', headband: null, goggles: false, mask: false, armSleeve: 'none', wristband: null, legSleeve: 'none', kneePad: false });
      const look: CelebLook = { a, outfit: 'tracksuit', color: '#2d3e66', accent: '#c9cfd8', hat: 'cap', hatColor: '#2d3e66', shades: null, chain: false, longHair: null, stand: true, side: 'neutral' };
      const tex = this.textures.addCanvas(key, buildCelebSheet(look))!;
      for (let f = 0; f < CELEB_FRAMES; f++) tex.add(f, 0, f * CELEB_W, 0, CELEB_W, CELEB_H);
    }
    const x = 48, sprite = this.add.sprite(sxOf(x), syOf(MAILBOX.y + 0.4), key, 0).setOrigin(0.5, 1).setScale(SPRITE_SCALE * 0.95).setTint(0xdfe6f2);
    this.mailman = { sprite, x, phase: 'in', t: 0 };
  }
  private stepMailman(dt: number) {
    const m = this.mailman; if (!m) return;
    m.t += dt;
    const stop = MAILBOX.x + 1.6, sp = 4.2;
    if (m.phase === 'in') { m.x = Math.max(stop, m.x - sp * dt); if (m.x <= stop) { m.phase = 'drop'; m.t = 0; } }
    else if (m.phase === 'drop') {
      m.sprite.setFrame(m.t < 0.9 ? 4 : 0);
      if (m.t > 0.6 && this.piece('mailbox')?.frame.name !== '1') { this.piece('mailbox')?.setFrame(1); sfx.doorClose(); }
      if (m.t > 1.2) { m.phase = 'out'; m.t = 0; }
    } else {
      m.x += sp * dt;
      if (m.x > 50) { m.sprite.destroy(); this.mailman = null; this.busy = false; this.think('Mail? Nobody sends us mail.'); return; }
    }
    const walking = m.phase !== 'drop';
    m.sprite.setPosition(sxOf(m.x), syOf(MAILBOX.y + 0.4) - (walking ? Math.abs(Math.sin(m.t * 9)) * 3 : 0)).setDepth(syOf(MAILBOX.y + 0.4)).setFlipX(m.phase === 'out');
  }

  /** ✕ at the mailbox: the paper (if Ridgemont lost: Kingston busted), then the agent's letter. */
  private readMail() {
    const c = app.career, st = c.story!, you = c.firstName || c.name.split(' ')[0];
    const agent = AGENT_NAME;
    this.piece('mailbox')?.setFrame(0);
    sfx.paperRustle();
    const letter = () => this.pushPage('mail_letter', drawLetter(you, agent), LETTER_W, LETTER_H, () => {
      st.agent = agent; app.changed();
      this.lines = [{ who: 'you', text: `${agent}. An agent.` }, { who: 'you', text: 'Ma\'s dealt with enough already. I\'ll go on my own.' }];
      this.thinking = true; this.busy = true;
      if (!this.box) this.box = new StoryBox(this, { y: 590 });
    });
    if (!st.final?.won) {
      const r = st.rival;
      const king = { name: 'Kingston Williams', number: r?.number ?? 23, heightFt: (r?.heightIn ?? 76) / 12, appearance: kingstonLook(r?.appearance ?? randomAppearance(() => 0.4)), colors: ['#1c2b4a', '#c0c6cf'] as [string, string] };
      // round 82 (owner): you take it in, then find the letter under it
      this.pushPage('mail_bust', drawBustPage(king, c.name), PAPER_W, PAPER_H, () => {
        this.lines = [{ who: 'you', text: 'Kingston... no way.' }, { who: 'you', text: 'Wait. There\'s more in here.', then: letter }];
        this.thinking = true; this.busy = true;
        if (!this.box) this.box = new StoryBox(this, { y: 590 });
      });
    } else letter();
  }
  private pushPage(key: string, cv: HTMLCanvasElement, w: number, h: number, then?: () => void) {
    if (this.textures.exists(key)) this.textures.remove(key);
    this.textures.addCanvas(key, cv);
    this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.pages.push({ key, w, h, then });
    this.busy = true;
  }
  /** Show the first page full screen; ✕ moves on (and runs its `then`). */
  private stepPages() {
    const pg = this.pages[0];
    if (!pg) return;
    if (!this.pageObjs.length) {
      const scale = Math.min(620 / pg.h, 1000 / pg.w) / PAGE_K;
      this.pageObjs.push(this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.62).setOrigin(0, 0).setScrollFactor(0).setDepth(9400));
      this.pageObjs.push(this.add.image(640, 352, pg.key).setScale(scale).setRotation(-0.025).setScrollFactor(0).setDepth(9401));
      this.pageObjs.push(this.add.text(1240, 690, '✕ next', { fontFamily: FONT, fontSize: '16px', color: '#ffffff', fontStyle: 'bold', stroke: '#000', strokeThickness: 4 }).setOrigin(1, 1).setScrollFactor(0).setDepth(9402));
      return;
    }
    if (this.inp.pressed('a')) {
      sfx.paperRustle();
      for (const o of this.pageObjs) o.destroy();
      this.pageObjs = [];
      this.pages.shift();
      pg.then?.();
      if (!this.pages.length && !this.lines.length) this.busy = false;
    }
  }
}

/** Round 81: the agent who writes after the final (later: he's the one who made the generator fail). */
export const AGENT_NAME = 'Victor Hale';
/** The pages are drawn at this many canvas px per art px. */
const PAGE_K = 4;
type TLine = { who: BoxSpeaker; text: string; name?: string; then?: () => void; choices?: { text: string; pick: () => void }[] };
