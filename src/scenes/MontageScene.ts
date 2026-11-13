import Phaser from 'phaser';
import { hiRes, FONT } from './ui';
import { InputMapper } from '../input/input';
import { app } from '../state';
import { sfx } from '../audio/sfx';
import { StoryBox, BoxSpeaker } from '../render/storyBox';
import { drawBurgerBack, drawBurgerCounter, BURGER_W } from '../render/burgerArt';
import { buildCoachSheet, FRONT_W, FRONT_H, COACH_FRAMES } from '../render/sprites';
import { setStage, storyScene } from './setup';
import { draftDays } from '../career/draft';
import { dateLabel } from '../career/calendar';

interface Line { who: BoxSpeaker; text: string; name?: string; then?: () => void }

/**
 * Round 84 (owner): the week after the scrimmage, in three beats, each with its date:
 *   0. Spring 12, the trailer yard: the snow's gone; you push the new generator into place (TrailerScene 'generator').
 *   1. Spring 14, Burger Barn: you at the register (this scene).
 *   2. Spring 17, the garage at night: working out after your shift (GarageScene 'montage').
 * Then you wake on Spring 18 at the apartment, and Garcia starts calling.
 */
export class MontageScene extends Phaser.Scene {
  constructor() { super('Montage'); }
  private beat = 0;
  private inp!: InputMapper;
  private box!: StoryBox;
  private lines: Line[] = [];
  private t = 0;
  private you!: Phaser.GameObjects.Sprite;
  private leaving = false;

  init(data?: { beat?: number }) { this.beat = data?.beat ?? 0; this.lines = []; this.t = 0; this.leaving = false; }

  create() {
    hiRes(this);
    if (this.beat !== 1) { montageGo(this, this.beat); return; }
    this.inp = new InputMapper(this);
    const c = app.career, you = c.firstName || c.name.split(' ')[0];
    c.life.day = Math.max(c.life.day, draftDays().montage + 2); app.changed();
    const k = 1280 / BURGER_W;
    const add = (key: string, cv: HTMLCanvasElement, depth: number) => { if (this.textures.exists(key)) this.textures.remove(key); this.textures.addCanvas(key, cv); return this.add.image(0, 0, key).setOrigin(0, 0).setScale(k).setDepth(depth); };
    add('burger_back', drawBurgerBack(), 0);
    // you behind the counter: the front-view figure in the red Burger Barn shirt, a little bob as you ring people up
    const key = `burger_you_${c.appearance.skin}_${c.appearance.hair}`;
    if (this.textures.exists(key)) this.textures.remove(key);
    const sheet = buildCoachSheet(c.height, { ...c.appearance, headband: '#ffcc2e' }, { jersey: '#c62a1e', jerseyShade: '#8e1a12', trim: '#ffcc2e', shorts: '#2a2a30', number: -1, pants: true });
    const tex = this.textures.addCanvas(key, sheet)!;
    for (let f = 0; f < COACH_FRAMES; f++) tex.add(f, 0, f * FRONT_W, 0, FRONT_W, FRONT_H);
    this.you = this.add.sprite(300 * k, 330 * k, key, 0).setOrigin(0.5, 1).setScale(2.9).setDepth(1);
    add('burger_counter', drawBurgerCounter(), 2);
    this.box = new StoryBox(this);
    this.cameras.main.fadeIn(600, 0, 0, 0);
    banner(this, dateLabel(c.life.day).toUpperCase(), 'BURGER BARN');
    this.lines = [
      { who: 'narrator', text: 'Burger Barn. A double shift. Then another one.' },
      { who: 'me', name: you, text: 'Welcome to Burger Barn. What can I get you?', then: () => sfx.blip(true) },
      { who: 'me', name: you, text: 'A number one, large. That\'ll be six ninety-nine at the window.', then: () => { this.you.setFrame(1); sfx.ding(); } },
      { who: 'you', text: 'Every paycheck goes to the debt. Every one.', then: () => this.pay() },
      { who: 'you', text: 'Nobody at the register knows I was at the combine last week.', then: () => this.leave() },
    ];
  }

  /** The week's pay toward the debt: money up, a green "+$600". */
  private pay() {
    const c = app.career;
    c.life.money += 600; app.changed();
    const t = this.add.text(640, 260, '+$600', { fontFamily: FONT, fontSize: '30px', color: '#7dff9a', fontStyle: 'bold', stroke: '#0a2010', strokeThickness: 6 }).setOrigin(0.5).setDepth(9300);
    this.tweens.add({ targets: t, y: 210, alpha: 0, duration: 2200, delay: 400, onComplete: () => t.destroy() });
    sfx.greenChime();
  }
  private leave() {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(700, 0, 0, 0);
    this.time.delayedCall(750, () => montageGo(this, 2));
  }

  update(_t: number, deltaMs: number) {
    if (this.beat !== 1 || !this.inp) return;
    this.t += deltaMs / 1000;
    this.inp.poll();
    // a little bob, and you look down at the register now and then
    if (this.you) this.you.setY(330 * (1280 / BURGER_W) + Math.abs(Math.sin(this.t * 2.2)) * -2).setFrame(Math.sin(this.t * 0.9) > 0.7 ? 1 : 0);
    const l = this.lines[0];
    if (l && this.t > 1.2) {
      this.box.show({ who: l.who, text: l.text, name: l.name, blocking: true });
      if (this.inp.pressed('a')) { if (this.box.typing) this.box.finishTyping(); else { this.lines.shift(); sfx.blip(true); l.then?.(); } }
    } else if (!l) this.box.hide();
    this.box.draw();
  }
}

/** A date card and a caption, up and gone. */
export function banner(scene: Phaser.Scene, big: string, small: string) {
  const a = scene.add.text(640, 300, big, { fontFamily: FONT, fontSize: '50px', color: '#ffe9a8', fontStyle: 'bold', stroke: '#2a1a10', strokeThickness: 8 }).setOrigin(0.5).setDepth(9500).setAlpha(0);
  const b = scene.add.text(640, 356, small, { fontFamily: FONT, fontSize: '20px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 5 }).setOrigin(0.5).setDepth(9500).setAlpha(0);
  scene.tweens.add({ targets: [a, b], alpha: 1, duration: 450, hold: 1300, yoyo: true, onComplete: () => { a.destroy(); b.destroy(); } });
  sfx.greenChime();
}

/**
 * Round 84: the montage's beats, in order (each beat's scene calls the next): 0 the generator at the trailer, 1 Burger
 * Barn, 2 the garage at night, 3 done: wake at the apartment on Spring 18 (the calls start).
 */
export function montageGo(scene: Phaser.Scene, beat: number) {
  const c = app.career, st = c.story!, d = draftDays();
  if (beat === 0) { c.life.day = Math.max(c.life.day, d.montage); app.changed(); scene.scene.start('Trailer', { story: 'generator' }); return; }
  if (beat === 1) { scene.scene.start('Montage', { beat: 1 }); return; }
  if (beat === 2) { c.life.day = Math.max(c.life.day, d.montage + 5); app.changed(); scene.scene.start('Garage', { story: 'montage' }); return; }
  st.montage = true; c.life.day = Math.max(c.life.day, d.back); setStage('draftWeek'); app.changed();
  const [s, data] = storyScene('draftWeek'); scene.scene.start(s, data);
}
