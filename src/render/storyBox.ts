import Phaser from 'phaser';
import { FONT } from '../scenes/ui';

/** Who's talking in the box (round 60). The narrator (tutorial) has no name tag. */
export type BoxSpeaker = 'narrator' | 'kingston' | 'coach' | 'you';
export interface BoxContent { who: BoxSpeaker; text: string; blocking: boolean; title?: string; sub?: string }

const TAG: Record<BoxSpeaker, { name: string; color: number; text: string } | null> = {
  narrator: null,
  kingston: { name: 'KINGSTON', color: 0x7a1f2b, text: '#ffe9a8' },
  coach: { name: 'COACH', color: 0x3a3f52, text: '#ffffff' },
  you: { name: 'YOU (thinking)', color: 0x2a3566, text: '#c9d6ff' },
};

/**
 * Round 60: the story / tutorial text box at the bottom of the screen (between the stick and the button diamond,
 * above the PLAY bar). Typewriter text, a speaker tag, "✕ next" on lines you have to read, a ✓ flash on a finished
 * tutorial step. HUD space (scroll factor 0), depth 9200+. Lays out in 1280×720 units like every scene.
 */
export class StoryBox {
  static X = 250; static W = 780; static H = 112;
  /** top of the box (scene units); rooms put it a little lower */
  private Y = 548;
  private g: Phaser.GameObjects.Graphics;
  private body: Phaser.GameObjects.Text;
  private tag: Phaser.GameObjects.Text;
  private head: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private shown: BoxContent | null = null;
  private startAt = 0;
  private flashAt = -1e9;
  visible = false;

  constructor(private scene: Phaser.Scene, opts: { y?: number } = {}) {
    if (opts.y !== undefined) this.Y = opts.y;
    const fixed = <T extends Phaser.GameObjects.Components.ScrollFactor>(o: T) => { o.setScrollFactor(0); return o; };
    this.g = fixed(scene.add.graphics().setDepth(9200));
    this.body = fixed(scene.add.text(StoryBox.X + 22, this.Y + 18, '', { fontFamily: FONT, fontSize: '19px', color: '#ffffff', wordWrap: { width: StoryBox.W - 44 }, lineSpacing: 5 }).setDepth(9201));
    this.tag = fixed(scene.add.text(StoryBox.X + 18, this.Y - 13, '', { fontFamily: FONT, fontSize: '14px', color: '#ffffff', fontStyle: 'bold', padding: { x: 9, y: 4 } }).setDepth(9202));
    this.head = fixed(scene.add.text(StoryBox.X + StoryBox.W - 18, this.Y - 13, '', { fontFamily: FONT, fontSize: '13px', color: '#ffe680', fontStyle: 'bold', backgroundColor: '#141a2c', padding: { x: 8, y: 4 } }).setOrigin(1, 0).setDepth(9202));
    this.hint = fixed(scene.add.text(StoryBox.X + StoryBox.W - 16, this.Y + StoryBox.H - 10, '✕ next', { fontFamily: FONT, fontSize: '13px', color: '#9fb0d8', fontStyle: 'bold' }).setOrigin(1, 1).setDepth(9202));
    this.hide();
  }

  /** Is the typewriter still revealing the line? */
  get typing() { return !!this.shown && this.chars() < this.shown.text.length; }
  private chars() { return Math.floor((this.scene.time.now - this.startAt) / 1000 * 62); }
  /** ✕ while typing: show the whole line at once. */
  finishTyping() { this.startAt = -1e9; }
  /** A ✓ flash (a tutorial step done). */
  flash() { this.flashAt = this.scene.time.now; }

  show(c: BoxContent) {
    const same = this.shown && this.shown.text === c.text && this.shown.who === c.who;
    if (!same) this.startAt = c.blocking ? this.scene.time.now : -1e9; // prompts appear at once
    this.shown = c;
    this.visible = true;
    for (const o of [this.g, this.body, this.tag, this.hint, this.head]) o.setVisible(true);
    this.draw();
  }

  hide() {
    this.shown = null; this.visible = false;
    for (const o of [this.g, this.body, this.tag, this.hint, this.head]) o.setVisible(false);
  }

  /** Call every frame while shown (typewriter, blinking hint, flash). */
  draw() {
    const c = this.shown; if (!c) return;
    const now = this.scene.time.now;
    const t = TAG[c.who];
    const flash = Math.max(0, 1 - (now - this.flashAt) / 700);
    const { X, W } = StoryBox;
    // a prompt (you're playing) is a slim bar at the bottom of the box's space; lines you read get the full box
    const H = c.blocking ? StoryBox.H : 64, Y = this.Y + StoryBox.H - H;
    this.body.setY(Y + (c.blocking ? 18 : 20));
    this.tag.setY(Y - 13); this.head.setY(Y - 13);
    const g = this.g.clear();
    g.fillStyle(0x000000, 0.35); g.fillRoundedRect(X + 3, Y + 5, W, H, 12);
    g.fillStyle(c.who === 'you' ? 0x111733 : 0x0e1424, 0.93); g.fillRoundedRect(X, Y, W, H, 12);
    const edge = flash > 0 ? 0x5fe08a : t ? t.color : 0x6b7bb0;
    g.lineStyle(flash > 0 ? 4 : 2, edge, 1); g.strokeRoundedRect(X, Y, W, H, 12);
    if (flash > 0) { g.fillStyle(0x5fe08a, 0.18 * flash); g.fillRoundedRect(X, Y, W, H, 12); }
    this.body.setText(c.text.slice(0, Math.max(0, this.chars())))
      .setFontStyle(c.who === 'you' ? 'italic' : c.blocking ? '' : 'bold')
      .setColor(c.who === 'you' ? '#d6e0ff' : c.blocking ? '#ffffff' : '#ffe9a8');
    if (t) this.tag.setText(t.name).setBackgroundColor(Phaser.Display.Color.IntegerToColor(t.color).rgba).setColor(t.text).setVisible(true);
    else this.tag.setVisible(false);
    const head = [c.title, c.sub].filter(Boolean).join('  ·  ');
    this.head.setText(flash > 0 ? '✓  ' + head : head).setVisible(!!head).setColor(flash > 0 ? '#5fe08a' : '#ffe680');
    this.hint.setVisible(c.blocking && !this.typing).setAlpha(0.55 + 0.45 * Math.abs(Math.sin(now / 380)));
  }

  destroy() { for (const o of [this.g, this.body, this.tag, this.hint, this.head]) o.destroy(); }
}
