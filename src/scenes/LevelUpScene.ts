import Phaser from 'phaser';
import { InputMapper } from '../input/input';
import { title, FONT, COL, hiRes } from './ui';
import { app } from '../state';
import { CORE_STATS, CoreStat, STAT_INFLUENCE } from '../sim/data';
import { spendStatPoint, STAT_POINT_VALUE } from '../career/career';
import { computeSubRatings } from '../sim/attributes';

const DESC: Record<CoreStat, string> = {
  shooting: '3PT & midrange (most), floaters & step-throughs (less)',
  finishing: 'layups, dunks, craft finishes (most), floaters (less)',
  strength: 'post-ups, screens, finishing/shooting through contact, not getting bumped off drives',
  mobility: 'speed with/without ball, ankle resistance, stamina, jump height, a bit of finishing',
  playmaking: 'pass speed, safe pass distance, lobs, speed with ball, screening, breaking ankles',
};

export class LevelUpScene extends Phaser.Scene {
  inp!: InputMapper; idx = 0; rows: Phaser.GameObjects.Text[] = []; g!: Phaser.GameObjects.Graphics; info!: Phaser.GameObjects.Text; pts!: Phaser.GameObjects.Text;
  constructor() { super('LevelUp'); }
  create() {
    hiRes(this);
    this.cameras.main.setBackgroundColor(COL.bg);
    this.inp = new InputMapper(this);
    title(this, 'LEVEL UP', `Each point = +${STAT_POINT_VALUE} to a core stat. Then spend perk points in the trees.  ✕/Enter: add · ○/Esc: back`);
    this.g = this.add.graphics();
    this.pts = this.add.text(60, 130, '', { fontFamily: FONT, fontSize: '20px', color: COL.accent });
    this.rows = CORE_STATS.map((s, i) => {
      const t = this.add.text(60, 180 + i * 70, '', { fontFamily: FONT, fontSize: '20px', color: COL.text }).setInteractive();
      t.on('pointerdown', () => { this.idx = i; this.add1(); });
      return t;
    });
    CORE_STATS.forEach((st, i) => this.add.text(80, 180 + i * 70 + 30, DESC[st], { fontFamily: FONT, fontSize: '12px', color: COL.dim }));
    this.info = this.add.text(760, 180, '', { fontFamily: FONT, fontSize: '15px', color: COL.text, lineSpacing: 4 });
    this.draw();
  }
  add1() { if (spendStatPoint(app.career, CORE_STATS[this.idx])) app.changed(); this.draw(); }
  draw() {
    const c = app.career;
    this.pts.setText(`Stat points: ${c.statPoints}`);
    this.g.clear();
    CORE_STATS.forEach((s, i) => {
      const y = 180 + i * 70;
      this.rows[i].setText(`${i === this.idx ? '▶' : ' '} ${s.toUpperCase().padEnd(11)} ${String(c.core[s]).padStart(2)}`).setColor(i === this.idx ? COL.accent : COL.text);
      this.g.fillStyle(0x222a44, 1); this.g.fillRect(360, y + 4, 340, 16);
      this.g.fillStyle(i === this.idx ? 0xffcc33 : 0x4fa3ff, 1); this.g.fillRect(360, y + 4, 340 * c.core[s] / 99, 16);
    });
    const stat = CORE_STATS[this.idx];
    const subs = computeSubRatings(c.core);
    const affected = Object.entries(STAT_INFLUENCE).filter(([, w]) => (w as any)[stat]).sort((a, b) => ((b[1] as any)[stat] - (a[1] as any)[stat]));
    this.info.setText([`${stat.toUpperCase()} drives:`, '', ...affected.map(([k, w]) => `${k.padEnd(15)} ${subs[k].toFixed(0).padStart(3)}   weight ${((w as any)[stat] * 100).toFixed(0)}%`)].join('\n'));
  }
  update() {
    this.inp.poll();
    if (this.inp.pressed('dev')) (window as any).__toggleDev?.();
    if (this.inp.pressed('down')) { this.idx = (this.idx + 1) % 5; this.draw(); }
    if (this.inp.pressed('up')) { this.idx = (this.idx + 4) % 5; this.draw(); }
    if (this.inp.confirm()) this.add1();
    if (this.inp.cancel()) this.scene.start('Hub');
  }
}
