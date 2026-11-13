import Phaser from 'phaser';
import { hiRes } from './ui';
import { InputMapper } from '../input/input';
import { app } from '../state';
import { sfx } from '../audio/sfx';
import { StoryBox, BoxSpeaker } from '../render/storyBox';
import { buildBusArt, BUS_ART, VW, ROWS, BUS_W, BUS_H, WHEELS, WHEEL_Y, WHEEL_R } from '../render/busArt';
import { setStage, storyScene, ensureStory } from './setup';
import { prepareStory } from './preload';
import { academySquad, squadCaptain } from '../sim/story';

interface Line { who: BoxSpeaker; text: string; name?: string; then?: () => void; choices?: { text: string; pick: () => void }[] }

/** How fast the world goes by (art px / s at the road's depth) and each layer's share of it. */
const SPEED = 110;
const LAYERS = { far: 0.12, near: 0.42, road: 1, verge: 1.35 };

/**
 * Round 80: the bus ride to the national final (the owner's reference: a pixel school bus side-on, front to the
 * right, on a road through pines; here in winter). The world scrolls by, the bus bobs and its wheels turn. The team
 * jokes (the captain: a C if you're the point guard, otherwise the point guard), one joke brings up Kingston, then
 * Mom calls: the generator broke. You choose what you tell her (saved as `momCall`), and it fades to the arena.
 */
export class BusScene extends Phaser.Scene {
  constructor() { super('Bus'); }
  private inp!: InputMapper;
  private box!: StoryBox;
  private lines: Line[] = [];
  private choice = 0;
  private t = 0;
  private leaving = false;
  private layers: { img: Phaser.GameObjects.TileSprite; k: number }[] = [];
  private bus!: Phaser.GameObjects.Sprite;
  private wheels: Phaser.GameObjects.Sprite[] = [];
  private fx!: Phaser.GameObjects.Graphics;
  private flakes: { x: number; y: number; vy: number; r: number }[] = [];
  private puffs: { x: number; y: number; t: number }[] = [];
  private nextPuff = 0;
  private started = false;
  private busY0 = 0;

  create() {
    hiRes(this);
    this.inp = new InputMapper(this);
    this.lines = []; this.choice = 0; this.t = 0; this.leaving = false; this.layers = []; this.wheels = []; this.flakes = []; this.puffs = []; this.started = false;
    ensureStory();
    prepareStory(this, 'final'); // tonight's game, drawn while you ride
    this.cameras.main.setBackgroundColor('#b9c1cc');
    const tex = buildBusArt(this.textures);
    const A = BUS_ART;
    this.add.image(0, 0, tex.sky).setOrigin(0, 0).setScale(A).setDepth(0);
    const tile = (key: string, y: number, h: number, k: number, depth: number) => {
      const img = this.add.tileSprite(0, y * A, VW, h, key).setOrigin(0, 0).setScale(A).setDepth(depth);
      this.layers.push({ img, k });
    };
    const src = (k: string) => this.textures.get(k).getSourceImage() as HTMLCanvasElement;
    tile(tex.far, 0, src(tex.far).height, LAYERS.far, 1);
    tile(tex.near, 0, src(tex.near).height, LAYERS.near, 2);
    tile(tex.road, ROWS.roadTop, src(tex.road).height, LAYERS.road, 3);
    // the bus on the far lane, its shadow on the road, wheels turning
    const bx = Math.round((VW - BUS_W) / 2) - 10, by = ROWS.centre - BUS_H + 4;
    const sh = this.add.graphics().setDepth(4);
    sh.fillStyle(0x2c3036, 0.35).fillRect((bx + 4) * A, (by + BUS_H - 6) * A, (BUS_W - 6) * A, 5 * A);
    this.bus = this.add.sprite(bx * A, by * A, tex.bus, 0).setOrigin(0, 0).setScale(A).setDepth(5);
    this.busY0 = this.bus.y;
    for (const wx of WHEELS) this.wheels.push(this.add.sprite((bx + wx) * A, (by + WHEEL_Y) * A, tex.wheel, 0).setScale(A).setDepth(6));
    tile(tex.verge, ROWS.roadBot, src(tex.verge).height, LAYERS.verge, 8);
    this.fx = this.add.graphics().setDepth(9);
    for (let i = 0; i < 150; i++) this.flakes.push({ x: Math.random() * 1280, y: Math.random() * 720, vy: 40 + Math.random() * 60, r: Math.random() < 0.3 ? 2.2 : 1.4 });
    this.box = new StoryBox(this, { y: 590 });
    this.cameras.main.fadeIn(800, 0, 0, 0);
    sfx.busRumble(true);
    this.events.once('shutdown', () => sfx.busRumble(false));
    this.time.delayedCall(1200, () => { this.started = true; this.lines = this.script(); });
  }

  /** The ride's talk (see the class comment). Names come from the saved squad, the same guys as in the final. */
  private script(): Line[] {
    const c = app.career, you = c.firstName || c.name.split(' ')[0];
    const squad = academySquad(c), cap = squadCaptain(c, squad); // round 80i: your Ridgemont Academy teammates
    const [a, b] = squad.filter((p) => p !== cap);
    const first = (n: string) => n.split(' ')[0];
    const C = `${first(cap.name)} (Captain)`, A = first(a.name), B = first(b.name);
    const mate = (name: string, text: string): Line => ({ who: 'mate', name, text });
    const me = (text: string): Line => ({ who: 'me', name: you, text });
    return [
      { who: 'narrator', text: 'Ridgemont Academy. The road to the national final. Three hours, one heater, twelve guys.' },
      mate(A, `Captain, my captain. Permission to crack a window? It smells like ${B}'s feet back here.`),
      mate(C, 'Denied. Captain\'s orders. We\'re keeping every bit of heat this bus has got.'),
      mate(B, 'What heat? This heater\'s been broke since my brother rode this bus. He\'s thirty.'),
      mate(A, 'Coach sews one letter on his jersey and now he\'s giving orders like he\'s the president.'),
      mate(C, `It's sewn on, ${A}. Sewn. That's permanent.`),
      { who: 'coach', text: 'Keep it down back there. Some of us are trying to watch film.' },
      mate(B, 'Coach, that\'s not film. That\'s the snow on the window.'),
      mate(A, `And ${B}, why you got a face mask on? You tryna be Kingston now?`),
      mate(B, 'It\'s for the cold, man!'),
      { who: 'narrator', text: 'Nobody laughs.' },
      mate(A, '...Too soon?'),
      mate(C, 'Y\'all seen his tape at Crestview? Thirty a night. Against prep schools.'),
      mate(B, `${you}, y'all came up together, right? Back at Lincoln?`),
      me('Best friends since we were eight. Then he just left. Didn\'t say bye, didn\'t say nothing.'),
      mate(C, 'You talk to him since?'),
      me('Not since the court. He said he\'d figure out a way.'),
      mate(C, 'Guess he did. Tonight we see what that way looks like.'),
      { who: 'narrator', text: 'Your phone buzzes. MOM.', then: () => sfx.phoneRing() },
      { who: 'phone', text: 'Baby? Can you hear me? It\'s the generator. It just quit. Won\'t start back up.' },
      me('Ma, it\'s below zero out there.'),
      { who: 'phone', text: 'I know. I got every blanket in the house on me.' },
      {
        who: 'me', name: you, text: '', choices: [
          { text: 'I\'m getting off this bus. I\'ll be right there.', pick: () => this.answer('go') },
          { text: 'Hold out, Ma. I\'ll be back right after the game.', pick: () => this.answer('stay') },
        ],
      },
    ];
  }

  /** Your answer on the phone (saved for the story), and hers. */
  private answer(call: 'go' | 'stay') {
    const c = app.career;
    c.story!.momCall = call; app.changed();
    const you = c.firstName || c.name.split(' ')[0];
    this.lines.push(...(call === 'go'
      ? [
        { who: 'me' as const, name: you, text: 'I\'m getting off this bus. I\'ll be right there.' },
        { who: 'phone' as const, text: 'No. No, you are not. You go play your heart out over there. I\'ll figure this out.' },
      ]
      : [
        { who: 'me' as const, name: you, text: 'Hold out, Ma. I\'ll be back right after the game.' },
        { who: 'phone' as const, text: '...I\'ll try, baby. I\'ll try.' },
      ]), { who: 'narrator', text: 'The line goes quiet.', then: () => this.leave() });
  }

  private leave() {
    if (this.leaving) return;
    this.leaving = true;
    setStage('final');
    sfx.busRumble(false);
    this.cameras.main.fadeOut(1100, 0, 0, 0);
    this.time.delayedCall(1700, () => { const [scene, data] = storyScene('final'); this.scene.start(scene, data); });
  }

  update(_t: number, dms: number) {
    const dt = Math.min(0.05, dms / 1000);
    this.t += dt;
    this.inp.poll();
    if (this.inp.pressed('dev')) (window as any).__toggleDev?.();
    if (this.inp.pressed('escape') || this.inp.pressed('back')) { this.scene.start('Title'); return; } // the stage is saved
    // the world goes by; the bus rides the bumps
    for (const l of this.layers) l.img.tilePositionX += SPEED * l.k * dt;
    const bob = Math.round(Math.sin(this.t * 7.3) * 0.5 + (Math.sin(this.t * 2.1) > 0.92 ? -1 : 0));
    this.bus.setY(this.busY0 + bob * BUS_ART);
    this.bus.setFrame(Math.sin(this.t * 1.7) > 0.6 ? 1 : 0);
    const spin = Math.floor(this.t * SPEED / (Math.PI * WHEEL_R) * 4) % 4;
    for (const w of this.wheels) w.setFrame(spin);
    this.drawFx(dt);
    // the talk
    const l = this.lines[0];
    if (l && !this.leaving) {
      const ok = this.inp.pressed('a');
      if (l.choices) {
        if (this.inp.pressed('down') || this.inp.pressed('up')) { this.choice = 1 - this.choice; sfx.blip(true); }
        this.box.show({ who: l.who, name: l.name, text: '', blocking: true, choices: l.choices.map((o) => o.text), choice: this.choice });
        if (ok) { const pick = l.choices[this.choice]; this.lines.shift(); sfx.blip(true); pick.pick(); }
      } else {
        this.box.show({ who: l.who, text: l.text, blocking: true, name: l.name });
        if (ok) { if (this.box.typing) this.box.finishTyping(); else { this.lines.shift(); sfx.blip(true); l.then?.(); } }
      }
    } else if (this.started || this.leaving) this.box.hide();
    this.box.draw();
  }

  /** Falling snow (blown back by the bus's speed) and exhaust puffs out the back. */
  private drawFx(dt: number) {
    const g = this.fx.clear(), A = BUS_ART;
    for (const f of this.flakes) {
      f.y += f.vy * dt; f.x -= (SPEED * 1.6 + f.vy) * dt;
      if (f.y > 724 || f.x < -6) { f.y = Math.random() < 0.5 ? -4 : Math.random() * 720; f.x = f.y < 0 ? Math.random() * 1400 : 1286; }
      g.fillStyle(0xffffff, 0.85).fillRect(f.x, f.y, f.r * 2, f.r);
    }
    if (this.t > this.nextPuff) {
      this.nextPuff = this.t + 0.35 + Math.random() * 0.3;
      this.puffs.push({ x: this.bus.x - 2 * A, y: this.bus.y + (BUS_H - 15) * A, t: this.t });
    }
    this.puffs = this.puffs.filter((p) => this.t - p.t < 1.4);
    for (const p of this.puffs) {
      const k = (this.t - p.t) / 1.4;
      g.fillStyle(0xd8dde4, 0.5 * (1 - k)).fillCircle(p.x - k * 70 * A / 3, p.y - k * 18, (3 + k * 9) * A / 2);
    }
  }
}
