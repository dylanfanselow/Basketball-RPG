import Phaser from 'phaser';
import { buildTrailerArt } from '../render/trailerArt';
import { buildGlow } from '../render/roomArt';
import { RoomDef, Poly, V, sxOf, syOf } from '../world/apartment';
import { TRAILER_YARD, TRAILER_SOLID, DOOR_SPOT, PATH_END, DOOR_X, TRAILER, liftAt } from '../world/trailer';
import { RoomScene, ART } from './RoomScene';
import { FONT } from './ui';
import { app } from '../state';
import { sfx } from '../audio/sfx';
import { advanceDay, sleepPlan, ENERGY_ORB } from '../career/career';
import { StoryBox, BoxSpeaker } from '../render/storyBox';
import { setStage, storyScene } from './setup';

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
  private lines: { who: BoxSpeaker; text: string }[] = [];
  init(data?: { at?: string; night?: boolean; story?: 'night' }) { super.init(data); this.night = !!data?.night; this.story = data?.story ?? null; }
  room(): RoomDef { return TRAILER_YARD; }
  buildArt(tm: Phaser.Textures.TextureManager) { return buildTrailerArt(tm, this.night); }
  extraObstacles(): Poly[] { return [TRAILER_SOLID]; }
  /** Wood on the steps, grass and dirt everywhere else. */
  footSurface(): boolean | 'grass' { return liftAt(this.pos) > 0 ? false : 'grass'; }

  private piece(id: string) { return this.pieces.find((p) => p.art.piece?.id === id)?.img as Phaser.GameObjects.Sprite | undefined; }

  onCreate() {
    this.box = null; this.lines = [];
    if (this.story === 'night') {
      this.box = new StoryBox(this, { y: 590 });
      this.lines = [
        { who: 'narrator', text: 'Home. The generator\'s still going.' },
        { who: 'narrator', text: 'Big game tomorrow. Go inside and get some sleep (✕ at the door).' },
      ];
      this.busy = true; // no walking while a line is up
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

  onUpdate() {
    // round 60: the story box (✕ reads on; walking is held while a line is up)
    if (this.box) {
      const l = this.lines[0];
      if (l) {
        this.box.show({ who: l.who, text: l.text, blocking: true });
        if (this.inp.pressed('a')) { if (this.box.typing) this.box.finishTyping(); else { this.lines.shift(); sfx.blip(true); if (!this.lines.length) this.busy = false; } }
      } else this.box.hide();
      this.box.draw();
    }
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
