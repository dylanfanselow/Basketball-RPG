import Phaser from 'phaser';
import { InputMapper } from '../input/input';
import { sfx } from '../audio/sfx';
import { FONT } from './ui';

export interface MenuOption { label: string; run: () => void }

/**
 * Round 94 (owner): Esc / L1 in a room or on the city map opens this: Resume, Save and exit (and Back to town / Go
 * home where that applies). ↑↓ picks, ✕ chooses, Esc / L1 / ○ closes. The scene does nothing else while it's open.
 */
export class OptionsMenu {
  private objs: Phaser.GameObjects.GameObject[] = [];
  private rows: Phaser.GameObjects.Text[] = [];
  private i = 0;
  private openedAt: number;
  open = true;

  constructor(private scene: Phaser.Scene, private inp: InputMapper, private options: MenuOption[], title = 'OPTIONS') {
    const n = options.length, w = 380, h = 84 + n * 44, x = 640 - w / 2, y = 360 - h / 2, D = 9800;
    const fixed = <T extends Phaser.GameObjects.Components.ScrollFactor>(o: T) => { o.setScrollFactor(0); return o; };
    const g = fixed(scene.add.graphics().setDepth(D));
    g.fillStyle(0x000000, 0.55).fillRect(0, 0, 1280, 720);
    g.fillStyle(0x1a120c, 1).fillRoundedRect(x - 4, y - 4, w + 8, h + 8, 12);
    g.fillStyle(0xb08a5c, 1).fillRoundedRect(x - 1, y - 1, w + 2, h + 2, 10);
    g.fillStyle(0x2a1e14, 1).fillRoundedRect(x + 2, y + 2, w - 4, h - 4, 9);
    this.objs.push(g);
    const T = (tx: number, ty: number, s: string, size: number, col: string) => { const t = fixed(scene.add.text(tx, ty, s, { fontFamily: FONT, fontSize: `${size}px`, color: col, fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(D + 1)); this.objs.push(t); return t; };
    T(640, y + 18, title, 22, '#ffe9a8');
    this.rows = options.map((o, k) => T(640, y + 62 + k * 44, o.label, 19, '#e8dcc8'));
    T(640, y + h - 24, '↑↓ choose  ·  ✕ select  ·  L1 close', 12, '#9a8a72');
    this.openedAt = scene.time.now;
    sfx.blip(true);
    this.draw();
  }

  private draw() { this.rows.forEach((t, k) => t.setText(`${k === this.i ? '▶ ' : '  '}${this.options[k].label}`).setColor(k === this.i ? '#ffe680' : '#e8dcc8')); }

  /** Call every frame while open (after the input was polled). */
  update() {
    if (!this.open) return;
    const inp = this.inp, n = this.options.length;
    if (this.scene.time.now - this.openedAt < 120) return; // not on the press that opened it
    if (inp.pressed('down')) { this.i = (this.i + 1) % n; sfx.blip(true); this.draw(); }
    if (inp.pressed('up')) { this.i = (this.i + n - 1) % n; sfx.blip(true); this.draw(); }
    if (inp.cancel()) { this.close(); sfx.blip(false); return; }
    if (inp.pressed('a')) { const o = this.options[this.i]; this.close(); o.run(); }
  }

  close() { if (!this.open) return; this.open = false; for (const o of this.objs) o.destroy(); this.objs = []; }
}
