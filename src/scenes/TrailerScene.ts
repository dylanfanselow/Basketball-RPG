import Phaser from 'phaser';
import { buildTrailerArt } from '../render/trailerArt';
import { buildGlow } from '../render/roomArt';
import { RoomDef, Poly, V, sxOf, syOf, RS } from '../world/apartment';
import { TRAILER_YARD, TRAILER_SOLID, DOOR_SPOT, PATH_END, DOOR_X, TRAILER, liftAt } from '../world/trailer';
import { RoomScene, ART } from './RoomScene';
import { FONT } from './ui';
import { app } from '../state';
import { sfx } from '../audio/sfx';
import { advanceDay, sleepPlan, ENERGY_ORB } from '../career/career';
import { StoryBox, BoxSpeaker } from '../render/storyBox';
import { buildCelebSheet, CelebLook, CELEB_W, CELEB_H, CELEB_FRAMES } from '../render/celebs';
import { randomAppearance } from '../render/appearance';
import { SPRITE_SCALE } from '../render/sprites';
import { setStage, storyScene } from './setup';
import { prepareStory } from './preload';

/**
 * Hooks for the story element at the trailer door (round 57: the owner will add one). Each runs when you go inside,
 * before the day ends. Empty for now.
 */
export const TRAILER_DOOR_STORY: ((at: 'trailerDoor') => void)[] = [];

/**
 * Round 57: the trailer yard — the "Lights on a generator" backstory place (the owner's photo + sketch). Walk the yard,
 * climb the steps, ✕ at the door: it opens, you go in and the day ends (night, "DAY n", morning on the top step,
 * energy orbs refill the bar). The generator chugs away beside the steps (louder as you get close).
 */
export class TrailerScene extends RoomScene {
  constructor() { super('Trailer'); }
  /** Round 57c: the night version (Menu → Trailer (night); story events can ask for it). */
  night = false;
  /** Round 60: 'night' = home after the 1s with Kingston (the next day is the big game). */
  story: 'night' | null = null;
  private box: StoryBox | null = null;
  private lines: { who: BoxSpeaker; text: string; name?: string }[] = [];
  /**
   * Round 60b: the night after the 1s — you walk up the path, Mom comes out on the steps, you talk, she waves you in
   * and you follow her inside (→ the next day: the big game).
   */
  private cut: 'walkIn' | 'momOut' | 'talk' | 'usher' | 'walkUp' | null = null;
  private cutT = 0;
  private leg = 0;
  private shown = true;
  private mom: Phaser.GameObjects.Sprite | null = null;
  init(data?: { at?: string; night?: boolean; story?: 'night' }) { super.init(data); this.night = !!data?.night; this.story = data?.story ?? null; }
  room(): RoomDef { return TRAILER_YARD; }
  buildArt(tm: Phaser.Textures.TextureManager) { return buildTrailerArt(tm, this.night); }
  extraObstacles(): Poly[] { return [TRAILER_SOLID]; }
  /** Wood on the steps, grass and dirt everywhere else. */
  footSurface(): boolean | 'grass' { return liftAt(this.pos) > 0 ? false : 'grass'; }

  private piece(id: string) { return this.pieces.find((p) => p.art.piece?.id === id)?.img as Phaser.GameObjects.Sprite | undefined; }

  onCreate() {
    this.box = null; this.lines = []; this.cut = null; this.cutT = 0; this.leg = 0; this.mom = null;
    if (this.story === 'night') {
      this.box = new StoryBox(this, { y: 590 });
      this.mom = this.buildMom();
      this.cut = 'walkIn';
      sfx.music('mom'); // round 60c: "Sad Story" for the scene with Mom
      this.events.once('shutdown', () => sfx.music(null));
      this.cameras.main.fadeOut(0, 0, 0, 0); // dark until your sprite is drawn (round 60c)
      this.shown = false;
      this.busy = true; // a cutscene: the stick does nothing until you're inside
    }
    this.cameras.main.setBackgroundColor(this.night ? '#0b1020' : '#4f97e2');
    this.events.once('shutdown', () => sfx.genHum(0));
    if (this.night) {
      // moonlit: you're cooler and darker; warm light pools from the porch bulb and the lit windows
      this.player.setTint(0x8a96c8);
      const key = buildGlow(this.textures);
      const face = syOf(TRAILER.front);
      const add = (x: number, y: number, s: number, a: number) => this.add.image(x, y, key).setScale(ART * s).setBlendMode(Phaser.BlendModes.ADD).setDepth(4990).setAlpha(a);
      add(sxOf(DOOR_X[0]) - 8, face - TRAILER.topFt * 22 + 30, 1.6, 0.55);          // the porch bulb
      for (const x of [4.4, 7.9, 14.9]) add(sxOf(x), face - 5.9 * 22, 1.3, 0.3); // the curtained windows
      add(sxOf(DOOR_X[0] + 1.4), face + 30, 2.6, 0.22);                               // light spilling on the steps
    }
  }

  actions() {
    return [
      { label: 'Go inside', spot: DOOR_SPOT, reach: 1.3, run: () => this.goInside() },
      // round 57c: the end of the path (by the mailbox) leaves
      { label: 'Leave', spot: PATH_END, reach: 1.8, run: () => { sfx.footstep('grass', 0); this.scene.start('Title'); } },
    ];
  }

  onUpdate(dt = 1 / 60) {
    // round 60: the story box (✕ reads on)
    if (this.box) {
      const l = this.lines[0];
      if (l) {
        this.box.show({ who: l.who, text: l.text, blocking: true, name: l.name });
        if (this.inp.pressed('a')) { if (this.box.typing) this.box.finishTyping(); else { this.lines.shift(); sfx.blip(true); } }
      } else this.box.hide();
      this.box.draw();
    }
    this.momScene(dt);
    // the generator runs: shakes a pixel and its light blinks; the hum grows as you walk up to it
    this.piece('generator')?.setFrame(Math.floor(this.t * 14) % 2);
    const g = TRAILER_YARD.furniture.find((p) => p.id === 'generator')!;
    const d = Math.hypot(this.pos.x - (g.x + g.w / 2), (this.pos.y - (g.y + g.d / 2)) * 1.4);
    sfx.genHum(Math.max(0.15, Math.min(1, 1.4 - d / 18)));
  }

  /**
   * ✕ at the door: it opens, you step in, night falls and the day ends (the owner: a story element goes here later —
   * TRAILER_DOOR_STORY). In the morning you're back on the top step with the door shut and your energy refilled.
   */
  /** Round 60b: Mom — a standing front-view figure (the fans' drawing): your skin, long hair, a plain hoodie. */
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
      .setOrigin(0.5, 1).setScale(SPRITE_SCALE * 0.95).setTint(0x9aa4d4).setAlpha(0).setDepth((door?.depth ?? 0) + 1);
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
        prepareStory(this, 'bigGame');
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
        this.lines = [
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
      // waves you in, then heads inside ahead of you
      this.drawPlayer(0);
      mom.setFrame(this.cutT < 1.3 ? (Math.floor(this.cutT / 0.22) % 2 ? 5 : 4) : 0);
      if (this.cutT > 1.3 && mom.alpha === 1) this.tweens.add({ targets: mom, alpha: 0, duration: 380 });
      if (this.cutT > 1.8) { this.cut = 'walkUp'; this.cutT = 0; }
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
}
