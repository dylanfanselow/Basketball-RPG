import Phaser from 'phaser';
import { InputMapper } from '../input/input';
import { FONT, COL, title, hiRes } from './ui';
import { TEAMS } from '../sim/data';
import { REAL_ROSTERS } from '../career/roster';
import { app } from '../state';
import type { MatchSetup } from './setup';

const KEY = 'hoopcareer.matchSetup';

/** Quick 5v5 setup: your team, the opponent, and who you play as (a real starter or your own player). */
export class MatchSetupScene extends Phaser.Scene {
  inp!: InputMapper;
  col = 0;
  sel: [number, number, number] = [13, 19, 0];
  texts: Phaser.GameObjects.Text[][] = [[], [], []];
  g!: Phaser.GameObjects.Graphics;
  info!: Phaser.GameObjects.Text;
  constructor() { super('MatchSetup'); }

  create() {
    hiRes(this);
    this.cameras.main.setBackgroundColor(COL.bg);
    this.inp = new InputMapper(this);
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as MatchSetup | null;
      if (saved) this.sel = [Math.max(0, TEAMS.findIndex((t) => t.id === saved.myTeam)), Math.max(0, TEAMS.findIndex((t) => t.id === saved.oppTeam)), saved.playAs === 'me' ? 5 : saved.playAs];
    } catch { /* first time */ }
    title(this, 'QUICK 5v5', 'Stick/D-pad: move · ←/→ or R1/L2: switch column · ✕/Enter: start · ○/L1/Esc: back');
    this.g = this.add.graphics();
    ['YOUR TEAM', 'OPPONENT', 'PLAY AS'].forEach((h, i) => this.add.text(70 + i * 400, 128, h, { fontFamily: FONT, fontSize: '18px', color: COL.accent, fontStyle: 'bold' }));
    this.info = this.add.text(870, 470, '', { fontFamily: FONT, fontSize: '14px', color: COL.text, lineSpacing: 4, wordWrap: { width: 380 } });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.move(this.col, Math.sign(dy)));
    this.redraw();
  }

  rows(col: number): string[] {
    if (col < 2) return TEAMS.map((t) => `${t.city} ${t.name}`);
    const roster = REAL_ROSTERS[TEAMS[this.sel[0]].id] ?? [];
    return [...roster.slice(0, 5).map((p) => `${p.pos.padEnd(3)} ${p.name}`), `★   My Player (${app.career.name})`];
  }

  move(col: number, d: number) {
    const n = this.rows(col).length;
    this.sel[col] = (this.sel[col] + d + n) % n;
    if (col === 0) this.sel[2] = Math.min(this.sel[2], 5);
    this.redraw();
  }

  redraw() {
    for (const col of this.texts) for (const t of col) t.destroy();
    this.texts = [[], [], []];
    this.g.clear();
    for (let col = 0; col < 3; col++) {
      const rows = this.rows(col);
      const visible = col < 2 ? 12 : rows.length;
      const start = col < 2 ? Phaser.Math.Clamp(this.sel[col] - 5, 0, Math.max(0, rows.length - visible)) : 0;
      for (let i = start; i < Math.min(rows.length, start + visible); i++) {
        const y = 165 + (i - start) * 26;
        const on = i === this.sel[col];
        if (col < 2) {
          const t = TEAMS[i];
          this.g.fillStyle(Phaser.Display.Color.HexStringToColor(t.colors[0]).color, on ? 1 : 0.35); this.g.fillRect(64 + col * 400, y - 2, 8, 22);
        }
        if (on) { this.g.lineStyle(2, col === this.col ? 0xffcc33 : 0x55607a, 1); this.g.strokeRect(60 + col * 400, y - 4, 360, 26); }
        const txt = this.add.text(80 + col * 400, y, rows[i], { fontFamily: FONT, fontSize: '16px', color: on ? (col === this.col ? COL.accent : '#ffffff') : COL.dim }).setInteractive({ useHandCursor: true });
        txt.on('pointerdown', () => { this.col = col; this.sel[col] = i; if (col === 0) this.sel[2] = Math.min(this.sel[2], 5); this.redraw(); });
        this.texts[col].push(txt);
      }
    }
    const roster = REAL_ROSTERS[TEAMS[this.sel[0]].id] ?? [];
    const pick = this.sel[2] < 5 ? roster[this.sel[2]] : null;
    this.info.setText(pick
      ? `${pick.name}  #${pick.number}\n${pick.pos} · ${Math.floor(pick.heightFt)}'${Math.round((pick.heightFt % 1) * 12)}"\n\nShooting ${pick.core.shooting}  Finishing ${pick.core.finishing}\nStrength ${pick.core.strength}  Mobility ${pick.core.mobility}\nPlaymaking ${pick.core.playmaking}\n\nPerks: ${pick.perks.length}\n\n✕ / Enter to tip off`
      : `Your created player (${app.career.pos}) takes that position in the starting five.\n\n✕ / Enter to tip off`);
  }

  start() {
    const setup: MatchSetup = { myTeam: TEAMS[this.sel[0]].id, oppTeam: TEAMS[this.sel[1]].id, playAs: this.sel[2] < 5 ? this.sel[2] : 'me' };
    if (setup.myTeam === setup.oppTeam) { this.cameras.main.shake(120, 0.004); return; }
    try { localStorage.setItem(KEY, JSON.stringify(setup)); } catch { /* ignore */ }
    this.scene.start('Game', { mode: 'quick', setup });
  }

  update() {
    const inp = this.inp; inp.poll();
    if (inp.pressed('dev')) (window as any).__toggleDev?.();
    if (inp.pressed('down')) this.move(this.col, 1);
    if (inp.pressed('up')) this.move(this.col, -1);
    if (inp.pressed('tabNext') || inp.pressed('right')) { this.col = (this.col + 1) % 3; this.redraw(); }
    if (inp.pressed('tabPrev') || inp.pressed('left')) { this.col = (this.col + 2) % 3; this.redraw(); }
    if (inp.confirm()) this.start();
    if (inp.cancel()) this.scene.start('Menu');
  }
}
