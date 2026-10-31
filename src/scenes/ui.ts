import Phaser from 'phaser';
import { InputMapper } from '../input/input';

export const FONT = '"Courier New", monospace';
export const COL = { bg: '#0d0f1a', panel: 0x161a2b, accent: '#ffcc33', dim: '#8892b0', text: '#e8ecff', good: '#7dff9a', bad: '#ff7d7d' };

/** A vertical menu that works with stick/d-pad/keyboard and mouse. */
export class MenuList {
  idx = 0;
  texts: Phaser.GameObjects.Text[] = [];
  constructor(private scene: Phaser.Scene, private x: number, private y: number, public items: { label: string; action: () => void; disabled?: boolean; hint?: string }[], private size = 22) {
    this.build();
  }
  build() {
    for (const t of this.texts) t.destroy();
    this.texts = this.items.map((it, i) => {
      const t = this.scene.add.text(this.x, this.y + i * (this.size + 16), it.label, { fontFamily: FONT, fontSize: `${this.size}px`, color: it.disabled ? '#555b70' : COL.text }).setInteractive({ useHandCursor: true });
      t.on('pointerover', () => { this.idx = i; this.refresh(); });
      t.on('pointerdown', () => { this.idx = i; this.fire(); });
      return t;
    });
    this.refresh();
  }
  refresh() {
    this.texts.forEach((t, i) => {
      const it = this.items[i];
      t.setText((i === this.idx ? '▶ ' : '  ') + it.label);
      t.setColor(it.disabled ? '#555b70' : i === this.idx ? COL.accent : COL.text);
    });
  }
  fire() { const it = this.items[this.idx]; if (it && !it.disabled) it.action(); }
  update(inp: InputMapper) {
    if (inp.pressed('down')) { this.idx = (this.idx + 1) % this.items.length; this.refresh(); }
    if (inp.pressed('up')) { this.idx = (this.idx + this.items.length - 1) % this.items.length; this.refresh(); }
    if (inp.confirm()) this.fire();
  }
}

export function title(scene: Phaser.Scene, text: string, sub?: string) {
  scene.add.text(60, 40, text, { fontFamily: FONT, fontSize: '40px', color: COL.accent, fontStyle: 'bold' });
  if (sub) scene.add.text(62, 92, sub, { fontFamily: FONT, fontSize: '16px', color: COL.dim });
}
