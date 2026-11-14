import Phaser from 'phaser';
import type { GameScene } from './GameScene';
import { StoryBox, BoxContent } from '../render/storyBox';
import { FilmDirector, FilmCourse, markFilmDone, FILM_COURSES } from '../sim/film';
import { app } from '../state';
import { sfx } from '../audio/sfx';
import { FONT } from './ui';
import { VIEW_W, VIEW_H } from '../render/view';
import type { GameInit } from './setup';

/** Where the TV sends you: the apartment, standing at the TV, the course list open. */
export const BACK_TO_TV: NonNullable<GameInit['returnTo']> = { scene: 'Apartment', data: { film: true } };
/** Round 91: the practice court from the apartment TV (an empty arena; L1 → back to the apartment). */
export const PRACTICE_COURT: GameInit = { mode: 'practice', venue: 'arena', empty: true, returnTo: { scene: 'Apartment', data: { tv: true } } };

/**
 * Round 91 (owner): a film course running inside GameScene. The box follows the FilmDirector (lines, prompts, ✓),
 * the tape gets a VHS look (scanlines, a tracking band, "▶ PLAY"), and the end of the course is a little menu: run it
 * again, the practice court, or back to the TV. `update` returns true when the sim must not step.
 */
export class FilmRun {
  box: StoryBox;
  dir: FilmDirector;
  private lastCheck = -9;
  private leaving = false;
  /** the end-of-course menu (the highlighted choice) */
  private menu: { choice: number } | null = null;
  private vhs: Phaser.GameObjects.Graphics;
  private band: Phaser.GameObjects.Graphics;
  private tag: Phaser.GameObjects.Text;

  constructor(private gs: GameScene, public course: FilmCourse) {
    this.box = new StoryBox(gs);
    this.dir = gs.sim.director as FilmDirector;
    // the tape: a cool tint and scanlines over the court, a tracking band rolling down, the deck's PLAY tag
    const fixed = <T extends Phaser.GameObjects.Components.ScrollFactor>(o: T) => { o.setScrollFactor(0); return o; };
    this.vhs = fixed(gs.add.graphics().setDepth(9100));
    this.vhs.fillStyle(0x2a3f7a, 0.14).fillRect(0, 0, VIEW_W, VIEW_H);
    for (let y = 0; y < VIEW_H; y += 4) this.vhs.fillStyle(0x000000, 0.17).fillRect(0, y, VIEW_W, 1.5);
    this.band = fixed(gs.add.graphics().setDepth(9101));
    this.tag = fixed(gs.add.text(VIEW_W - 36, 62, '', { fontFamily: FONT, fontSize: '22px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4 }).setOrigin(1, 0).setDepth(9102));
    this.showTape(false);
  }

  private showTape(on: boolean) { for (const o of [this.vhs, this.band, this.tag]) o.setVisible(on); }

  private choices() { return ['Run it again', 'Practice court', 'Back to the TV']; }

  /** Per frame, before the sim steps. True = hold the sim. */
  update(): boolean {
    const gs = this.gs, inp = gs.input2, dir = this.dir;
    const ok = inp.pressed('a');
    const watching = dir.phase === 'demo' || dir.phase === 'demoWait';
    this.showTape(watching && !this.menu);
    if (watching) {
      const t = gs.time.now / 1000;
      const y = ((t * 140) % (VIEW_H + 80)) - 40;
      this.band.clear().fillStyle(0xffffff, 0.06).fillRect(0, y, VIEW_W, 18).fillStyle(0xffffff, 0.04).fillRect(0, y + 22, VIEW_W, 6);
      this.tag.setText(`▶ PLAY   ${dir.ctx().demo.name.toUpperCase()}`).setAlpha(Math.floor(t * 1.6) % 2 ? 1 : 0.75);
    }
    if (this.menu) {
      const n = this.choices().length;
      if (inp.pressed('down')) { this.menu.choice = (this.menu.choice + 1) % n; sfx.blip(true); }
      if (inp.pressed('up')) { this.menu.choice = (this.menu.choice + n - 1) % n; sfx.blip(true); }
      this.box.show({ who: 'narrator', text: '', blocking: true, title: `FILM · ${this.course.title} · DONE`, choices: this.choices(), choice: this.menu.choice });
      this.box.draw();
      if (ok && !this.leaving) this.pick(this.menu.choice);
      return true;
    }
    let hold = false;
    let content: BoxContent | null = null;
    const v = dir.view();
    if (v) {
      const n = dir.lessons.length;
      content = { who: v.who, name: v.name, text: v.text, blocking: v.blocking, title: `FILM · ${this.course.title}${n > 1 && v.title ? ` · ${dir.i + 1}/${n} ${v.title}` : ''}`, sub: v.steps && v.steps > 1 ? `${v.step}/${v.steps}` : undefined };
      if (v.blocking) {
        hold = true;
        if (ok) { if (this.box.typing) this.box.finishTyping(); else { dir.nextLine(); sfx.blip(true); } }
      }
    }
    if (dir.checkAt !== this.lastCheck) { this.lastCheck = dir.checkAt; this.box.flash(); sfx.greenChime(); }
    if (dir.finished && !this.menu) {
      // the course is done: remember it (the to-do list counts it), then the menu
      if (markFilmDone(app.career, this.course.id)) app.changed();
      this.menu = { choice: 2 };
      gs.sim.live = false;
      return true;
    }
    if (content) this.box.show(content); else this.box.hide();
    this.box.draw();
    return hold || this.leaving;
  }

  private pick(i: number) {
    const gs = this.gs;
    sfx.blip(true);
    this.leaving = true;
    const go = (scene: string, data?: object) => { gs.cameras.main.fadeOut(400, 0, 0, 0); gs.time.delayedCall(430, () => gs.scene.start(scene, data)); };
    if (i === 0) { this.leaving = false; this.menu = null; gs.scene.restart(gs.initData); }
    else if (i === 1) go('Game', PRACTICE_COURT);
    else go(BACK_TO_TV.scene, BACK_TO_TV.data);
  }

  /** Practice never ends on its own. */
  onOver(): boolean { return true; }
  pauseOptions(): string[] { return ['Skip lesson']; }
  pauseAction(i: number) { if (i === 0) this.dir.skipLesson(); }
}

/** The Game scene's data for a course. */
export function filmInit(id: string): GameInit {
  return { mode: 'film', film: FILM_COURSES.some((f) => f.id === id) ? id : FILM_COURSES[0].id, venue: 'arena', empty: true, returnTo: BACK_TO_TV };
}
