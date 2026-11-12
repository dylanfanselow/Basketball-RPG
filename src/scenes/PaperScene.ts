import Phaser from 'phaser';
import { hiRes, FONT, HI_RES } from './ui';
import { InputMapper } from '../input/input';
import { app } from '../state';
import { sfx } from '../audio/sfx';
import { StoryBox, BoxSpeaker } from '../render/storyBox';
import { drawFrontPage, drawUnderPage, PAPER_W, PAPER_H, PAPER_SPOTS } from '../render/paperArt';
import { setStage, storyScene, ensureStory } from './setup';
import { prewarmRoom } from './preload';

/** The paper on the table: its centre (scene units), scale (scene units per art px) and tilt (the reference's). */
const PX = 660, PY = 380, PS = 2.2, TILT = -0.2;
/** Camera stops: the whole front page, then the headline, your photo, the weather, Kingston. */
const STOPS: { at: keyof typeof PAPER_SPOTS | null; zoom: number }[] = [
  { at: null, zoom: 0.62 }, { at: 'head', zoom: 1.25 }, { at: 'photo', zoom: 1.35 }, { at: 'cold', zoom: 1.45 }, { at: 'kingston', zoom: 1.35 },
];

/**
 * Round 80: three months later. A black card ("THREE MONTHS LATER"), then the newspaper on the table (the owner's
 * reference: a stack of tilted newsprint): Lincoln is headed to nationals behind you, record low temperatures, and at
 * the bottom Crestview Prep adding transfer Kingston Williams. ✕ moves the camera from story to story. Then black
 * again and Mom wakes you up (→ the snowy morning at the trailer).
 */
export class PaperScene extends Phaser.Scene {
  constructor() { super('Paper'); }
  private inp!: InputMapper;
  private box!: StoryBox;
  private phase: 'card' | 'paper' | 'wake' | 'leaving' = 'card';
  private stop = 0;
  private t = 0;
  private card!: Phaser.GameObjects.Text;
  private black!: Phaser.GameObjects.Rectangle;
  private hint!: Phaser.GameObjects.Text;
  private lines: { who: BoxSpeaker; text: string; name?: string }[] = [];
  private zoom = 1;

  create() {
    hiRes(this);
    this.zoom = this.cameras.main.zoom;
    this.inp = new InputMapper(this);
    this.phase = 'card'; this.stop = 0; this.t = 0; this.lines = [];
    const c = app.career;
    ensureStory();
    // it's winter now (the yard stays snowy from here on); three months have gone by
    if (!c.story!.winter) { c.story!.winter = true; c.life.day += 90; app.changed(); }
    prewarmRoom(this); // your trailer walk in the snow is next
    this.cameras.main.setBackgroundColor('#e9dbb8');
    // the table: warm cream with a faint grain
    const g = this.add.graphics().setDepth(-10);
    g.fillStyle(0xeee0bd, 1).fillRect(-1200, -1200, 4000, 4000);
    for (let i = 0; i < 500; i++) g.fillStyle(i % 3 ? 0xe4d5ae : 0xf4e8c8, 1).fillRect(((i * 7919) % 3000) - 900, ((i * 104729) % 2600) - 900, 6, 3);
    // the stack: two older papers under the front page, each with a soft shadow
    const make = (key: string, cv: HTMLCanvasElement) => { if (this.textures.exists(key)) this.textures.remove(key); this.textures.addCanvas(key, cv); return key; };
    const under = [make('paper_under1', drawUnderPage(3)), make('paper_under2', drawUnderPage(9))];
    const front = make('paper_front', drawFrontPage({ name: c.name, number: c.number, heightFt: c.height, appearance: c.appearance }));
    const place = (key: string, dx: number, dy: number, rot: number, depth: number) => {
      this.add.image(PX + dx + 18, PY + dy + 22, key).setScale(PS).setRotation(rot).setTint(0x000000).setAlpha(0.18).setDepth(depth - 1);
      return this.add.image(PX + dx, PY + dy, key).setScale(PS).setRotation(rot).setDepth(depth);
    };
    place(under[1], -250, 60, TILT - 0.18, 1);
    place(under[0], -130, 40, TILT - 0.09, 3);
    place(front, 0, 0, TILT, 5);
    // the overlays (story box, black card, hint) live on their own camera so the zooms don't scale them
    const world = [...this.children.list];
    this.box = new StoryBox(this, { y: 590 });
    // the black card on top (screen space)
    this.black = this.add.rectangle(0, 0, 1280, 720, 0x000000, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(9000);
    this.card = this.add.text(640, 340, '', { fontFamily: FONT, fontSize: '40px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(9001);
    this.hint = this.add.text(1262, 702, '✕ next', { fontFamily: FONT, fontSize: '15px', color: '#5a4a30', fontStyle: 'bold' }).setOrigin(1, 1).setScrollFactor(0).setDepth(8000).setVisible(false);
    const ui = this.children.list.filter((o) => !world.includes(o));
    const uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height).setZoom(HI_RES).setOrigin(0, 0);
    uiCam.ignore(world); this.cameras.main.ignore(ui);
    this.look(0, true);
    sfx.music('mom');
    this.events.once('shutdown', () => sfx.music(null));
  }

  /** Where a camera stop's point lands in the scene (the paper is scaled and turned). */
  private spot(i: number): { x: number; y: number } {
    const s = STOPS[i].at ? PAPER_SPOTS[STOPS[i].at!] : { x: PAPER_W / 2, y: PAPER_H / 2 };
    const dx = (s.x - PAPER_W / 2) * PS, dy = (s.y - PAPER_H / 2) * PS;
    return { x: PX + dx * Math.cos(TILT) - dy * Math.sin(TILT), y: PY + dx * Math.sin(TILT) + dy * Math.cos(TILT) };
  }

  /** Point the camera at stop i (eased, or at once). The camera's origin is its top left (hiRes). */
  private look(i: number, now = false) {
    const cam = this.cameras.main, p = this.spot(i), z = this.zoom * STOPS[i].zoom;
    // with the origin at the top left the view is (1280 · HI_RES / z) scene units wide: centre it on p
    const to = { zoom: z, scrollX: p.x - (1280 * this.zoom) / (2 * z), scrollY: p.y - (720 * this.zoom) / (2 * z) };
    if (now) { cam.setZoom(to.zoom); cam.setScroll(to.scrollX, to.scrollY); return; }
    this.tweens.add({ targets: cam, zoom: to.zoom, scrollX: to.scrollX, scrollY: to.scrollY, duration: 1100, ease: 'Sine.easeInOut' });
  }

  update(_t: number, dms: number) {
    const dt = Math.min(0.05, dms / 1000);
    this.t += dt;
    this.inp.poll();
    const ok = this.inp.pressed('a');
    if (this.inp.pressed('dev')) (window as any).__toggleDev?.();
    if (this.phase === 'card') {
      const full = 'THREE MONTHS LATER';
      this.card.setText(full.slice(0, Math.floor(this.t * 14)));
      if ((ok && this.t > 0.4) || this.t > 3.2) {
        this.phase = 'paper'; this.t = 0;
        this.card.setText('');
        sfx.paperRustle();
        this.tweens.add({ targets: this.black, alpha: 0, duration: 900 });
        this.time.delayedCall(1300, () => this.look(1));
        this.stop = 1;
      }
    } else if (this.phase === 'paper') {
      this.hint.setVisible(this.t > 1.4).setAlpha(0.55 + 0.45 * Math.abs(Math.sin(this.t * 2.6)));
      if (ok && this.t > 1.4) {
        this.t = 0.6;
        sfx.paperRustle();
        if (this.stop < STOPS.length - 1) this.look(++this.stop);
        else {
          // black, and Mom's voice through the wall
          this.phase = 'wake'; this.hint.setVisible(false);
          this.tweens.add({ targets: this.black, alpha: 1, duration: 800 });
          sfx.music(null);
          this.time.delayedCall(1000, () => {
            this.lines = [
              { who: 'mom', text: 'Baby! You better wake up! That bus is not gonna wait on you!' },
              { who: 'me', name: app.career.firstName || app.career.name.split(' ')[0], text: 'I\'m up, I\'m up...' },
            ];
          });
        }
      }
    } else if (this.phase === 'wake') {
      const l = this.lines[0];
      if (l) {
        this.box.show({ who: l.who, text: l.text, blocking: true, name: l.name });
        if (ok) { if (this.box.typing) this.box.finishTyping(); else { this.lines.shift(); sfx.blip(true); if (!this.lines.length) this.leave(); } }
      }
      this.box.draw();
    }
  }

  private leave() {
    this.phase = 'leaving';
    this.box.hide();
    setStage('snow');
    this.time.delayedCall(400, () => { const [scene, data] = storyScene('snow'); this.scene.start(scene, data); });
  }
}
