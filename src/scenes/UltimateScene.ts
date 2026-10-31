import Phaser from 'phaser';
import { InputMapper } from '../input/input';
import { FONT, COL, title } from './ui';
import { app } from '../state';
import { ULTIMATES } from '../sim/data';

export class UltimateScene extends Phaser.Scene {
  inp!: InputMapper; idx = 0; body!: Phaser.GameObjects.Text; g!: Phaser.GameObjects.Graphics;
  constructor() { super('Ultimate'); }
  create() {
    this.cameras.main.setBackgroundColor('#07070c');
    this.inp = new InputMapper(this);
    this.g = this.add.graphics();
    this.body = this.add.text(80, 150, '', { fontFamily: FONT, fontSize: '17px', color: COL.text, lineSpacing: 6, wordWrap: { width: 1120 } });
    if (!app.career.flags.ult_unlocked) [0, 1, 2].forEach((i) => this.add.text(160 + i * 340 + 140, 350, '?', { fontFamily: FONT, fontSize: '80px', color: '#44445e' }).setOrigin(0.5).setDepth(1));
    title(this, app.career.flags.ult_unlocked ? 'ULTIMATE' : '???', app.career.flags.ult_unlocked ? '✕: equip   △: evolve (milestone points)   ○: back' : '○: back');
  }
  ids() {
    const c = app.career;
    return Object.keys(ULTIMATES).filter((id) => ULTIMATES[id].positions.includes(c.pos) || c.traits.includes('unicorn') || c.flags.dev_all_ults);
  }
  update(t: number) {
    const inp = this.inp; inp.poll();
    if (inp.pressed('dev')) (window as any).__toggleDev?.();
    if (inp.cancel()) { this.scene.start('Hub'); return; }
    const c = app.career;
    this.g.clear();
    if (!c.flags.ult_unlocked) {
      for (let i = 0; i < 3; i++) {
        const x = 160 + i * 340, y = 220;
        this.g.fillStyle(0x15151f, 1); this.g.fillRoundedRect(x, y, 280, 360, 12);
        this.g.lineStyle(2, 0x33334a, 1); this.g.strokeRoundedRect(x, y, 280, 360, 12);
        this.g.fillStyle(0x22222e, 1); this.g.fillCircle(x + 140, y + 130, 60 + Math.sin(t / 500 + i) * 3);
      }
      this.body.setText('Something is waiting for you this season…\n\nThere\'s more in your game than you\'ve shown. Every star has a moment that changes them.\n(Ultimates unlock through a story event in your rookie season. Use the dev tools, F1, to unlock them now for testing.)');
      return;
    }
    const ids = this.ids();
    if (inp.pressed('down')) this.idx = (this.idx + 1) % ids.length;
    if (inp.pressed('up')) this.idx = (this.idx + ids.length - 1) % ids.length;
    const sel = ids[this.idx];
    if (inp.confirm() && sel) { if (c.ult.id !== sel) { c.ult.id = sel; c.ult.level = 0; } app.changed(); }
    if (inp.pressed('y') && c.ult.id) {
      const def = ULTIMATES[c.ult.id];
      const next = def.levels[c.ult.level + 1];
      if (next && c.ult.evoPoints >= next.cost) { c.ult.evoPoints -= next.cost; c.ult.level++; app.changed(); this.cameras.main.flash(200, 255, 200, 80); }
    }
    const lines: string[] = [`Evolution points: ${c.ult.evoPoints}   (earn them with a 50-point game, a game-winner, a triple-double…)`, ''];
    ids.forEach((id, i) => {
      const d = ULTIMATES[id];
      const eq = c.ult.id === id;
      lines.push(`${i === this.idx ? '▶' : ' '} ${d.name}${eq ? '   [EQUIPPED]' : ''}   (${d.positions.join('/')})`);
      lines.push(`    ${d.desc}`);
      d.levels.forEach((lv, li) => lines.push(`    ${eq && li <= c.ult.level ? '★' : '☆'} Lv${li + 1} ${lv.name}${lv.cost ? `  (${lv.cost} pts)` : ''}`));
      lines.push('');
    });
    this.body.setText(lines.join('\n'));
  }
}
