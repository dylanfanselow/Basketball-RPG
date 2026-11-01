import Phaser from 'phaser';
import { InputMapper } from '../input/input';
import { FONT, COL, title, hiRes } from './ui';
import { TEAMS } from '../sim/data';
import { REAL_ROSTERS, RosterEntry } from '../career/roster';
import { DEFAULT_1V1, OneOnOneSetup } from './setup';

const KEY = 'hoopcareer.oneOnOne';
const TARGETS = [7, 11, 15, 21];

/**
 * 1v1 make-it-take-it setup: each side picks a team and any player on its real roster,
 * then P2 (human or CPU), game-to, scoring and win-by-2.
 * Columns 0-3 are lists (P1 team, P1 player, P2 team, P2 player); 4-7 are the options along the bottom.
 */
export class OneOnOneSetupScene extends Phaser.Scene {
  inp!: InputMapper;
  p1src!: InputMapper;
  p2inp!: InputMapper;
  col = 0;
  o: OneOnOneSetup = { ...DEFAULT_1V1 };
  g!: Phaser.GameObjects.Graphics;
  texts: Phaser.GameObjects.Text[] = [];
  info!: Phaser.GameObjects.Text;
  pads!: Phaser.GameObjects.Text;
  constructor() { super('OneOnOneSetup'); }

  create() {
    hiRes(this);
    this.cameras.main.setBackgroundColor(COL.bg);
    this.inp = new InputMapper(this);
    this.p1src = new InputMapper(this, 1);
    this.p2inp = new InputMapper(this, 2);
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as OneOnOneSetup | null;
      if (saved && TEAMS.some((t) => t.id === saved.p1Team) && TEAMS.some((t) => t.id === saved.p2Team)) this.o = { ...DEFAULT_1V1, ...saved };
    } catch { /* first time */ }
    title(this, '1v1 · MAKE IT, TAKE IT', 'Stick/D-pad ↑↓: change · ←/→ or R1/L2: switch column · ✕/Enter: start · ○/L1/Esc: back');
    this.g = this.add.graphics();
    ['P1 TEAM', 'P1 PLAYER', 'P2 TEAM', 'P2 PLAYER'].forEach((h, i) => this.add.text(50 + i * 305, 128, h, { fontFamily: FONT, fontSize: '17px', color: i < 2 ? '#7fc8ff' : '#ff9f7f', fontStyle: 'bold' }));
    this.info = this.add.text(50, 580, '', { fontFamily: FONT, fontSize: '14px', color: COL.text, lineSpacing: 4 });
    this.pads = this.add.text(50, 680, '', { fontFamily: FONT, fontSize: '14px', color: COL.dim });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.change(this.col, Math.sign(dy)));
    this.redraw();
  }

  teamIdx(id: string) { return Math.max(0, TEAMS.findIndex((t) => t.id === id)); }
  roster(teamId: string): RosterEntry[] { return REAL_ROSTERS[teamId] ?? []; }

  rows(col: number): string[] {
    if (col === 0 || col === 2) return TEAMS.map((t) => `${t.city} ${t.name}`);
    const r = this.roster(col === 1 ? this.o.p1Team : this.o.p2Team);
    return r.map((p) => `${p.pos.padEnd(3)} ${p.name}`);
  }

  sel(col: number): number {
    return [this.teamIdx(this.o.p1Team), this.o.p1Idx, this.teamIdx(this.o.p2Team), this.o.p2Idx][col];
  }

  options(): { label: string; value: string }[] {
    return [
      { label: 'P2', value: this.o.p2Human ? 'Player 2' : 'CPU' },
      { label: 'Game to', value: String(this.o.target) },
      { label: 'Scoring', value: this.o.scoring === '1s2s' ? "1s & 2s" : "2s & 3s" },
      { label: 'Win by 2', value: this.o.winBy2 ? 'On' : 'Off' },
    ];
  }

  /** Up/down on a column: move through a list, or cycle an option's value. */
  change(col: number, d: number) {
    const o = this.o;
    if (col < 4) {
      const n = this.rows(col).length;
      if (!n) return;
      const next = (this.sel(col) + d + n) % n;
      if (col === 0) { o.p1Team = TEAMS[next].id; o.p1Idx = Math.min(o.p1Idx, this.roster(o.p1Team).length - 1); }
      if (col === 1) o.p1Idx = next;
      if (col === 2) { o.p2Team = TEAMS[next].id; o.p2Idx = Math.min(o.p2Idx, this.roster(o.p2Team).length - 1); }
      if (col === 3) o.p2Idx = next;
    } else if (col === 4) o.p2Human = !o.p2Human;
    else if (col === 5) o.target = TARGETS[(TARGETS.indexOf(o.target) + d + TARGETS.length) % TARGETS.length] ?? 11;
    else if (col === 6) o.scoring = o.scoring === '1s2s' ? '2s3s' : '1s2s';
    else if (col === 7) o.winBy2 = !o.winBy2;
    this.redraw();
  }

  redraw() {
    for (const t of this.texts) t.destroy();
    this.texts = [];
    this.g.clear();
    for (let col = 0; col < 4; col++) {
      const rows = this.rows(col);
      const visible = 12;
      const cur = this.sel(col);
      const start = Phaser.Math.Clamp(cur - 5, 0, Math.max(0, rows.length - visible));
      for (let i = start; i < Math.min(rows.length, start + visible); i++) {
        const x = 50 + col * 305, y = 165 + (i - start) * 26;
        const on = i === cur;
        if (col === 0 || col === 2) {
          this.g.fillStyle(Phaser.Display.Color.HexStringToColor(TEAMS[i].colors[0]).color, on ? 1 : 0.35);
          this.g.fillRect(x - 6, y - 2, 6, 22);
        }
        if (on) { this.g.lineStyle(2, col === this.col ? 0xffcc33 : 0x55607a, 1); this.g.strokeRect(x - 10, y - 4, 290, 26); }
        const label = rows[i].length > 27 ? rows[i].slice(0, 26) + '…' : rows[i];
        const txt = this.add.text(x + 4, y, label, { fontFamily: FONT, fontSize: '15px', color: on ? (col === this.col ? COL.accent : '#ffffff') : COL.dim }).setInteractive({ useHandCursor: true });
        txt.on('pointerdown', () => { this.col = col; this.change(col, i - this.sel(col)); });
        this.texts.push(txt);
      }
    }
    this.options().forEach((op, i) => {
      const col = 4 + i, x = 50 + i * 305, y = 515;
      const on = this.col === col;
      this.g.lineStyle(2, on ? 0xffcc33 : 0x55607a, 1); this.g.strokeRect(x - 10, y - 6, 290, 32);
      const txt = this.add.text(x + 4, y, `${op.label}:  ◀ ${op.value} ▶`, { fontFamily: FONT, fontSize: '16px', color: on ? COL.accent : COL.text }).setInteractive({ useHandCursor: true });
      txt.on('pointerdown', () => { this.col = col; this.change(col, 1); });
      this.texts.push(txt);
    });
    const p1 = this.roster(this.o.p1Team)[this.o.p1Idx];
    const p2 = this.roster(this.o.p2Team)[this.o.p2Idx];
    const line = (tag: string, p?: RosterEntry) => p
      ? `${tag} ${p.name} #${p.number} · ${p.pos} ${Math.floor(p.heightFt)}'${Math.round((p.heightFt % 1) * 12)}" · SHT ${p.core.shooting} FIN ${p.core.finishing} STR ${p.core.strength} MOB ${p.core.mobility} PLY ${p.core.playmaking}${p.perks.includes('fi_stepthru') ? ' · Step-Through' : ''}`
      : `${tag} —`;
    const same = p1 && p2 && this.o.p1Team === this.o.p2Team && this.o.p1Idx === this.o.p2Idx;
    this.info.setText([line('P1', p1), line(this.o.p2Human ? 'P2' : 'CPU', p2), same ? '(mirror match: same player on both sides)' : ''].join('\n'));
  }

  start() {
    try { localStorage.setItem(KEY, JSON.stringify(this.o)); } catch { /* ignore */ }
    this.scene.start('Game', { mode: 'oneOnOne', oneOnOne: { ...this.o } });
  }

  update() {
    const inp = this.inp; inp.poll(); this.p2inp.poll();
    this.pads.setText(`P1: ${this.p1src.source}   ·   P2: ${this.o.p2Human ? this.p2inp.source : 'CPU'}${this.o.p2Human && this.p2inp.source === 'not connected' ? '  (2 players: two controllers, or one controller + keyboard)' : ''}`);
    if (inp.pressed('dev')) (window as any).__toggleDev?.();
    if (inp.pressed('down')) this.change(this.col, 1);
    if (inp.pressed('up')) this.change(this.col, -1);
    if (inp.pressed('tabNext') || inp.pressed('right')) { this.col = (this.col + 1) % 8; this.redraw(); }
    if (inp.pressed('tabPrev') || inp.pressed('left')) { this.col = (this.col + 7) % 8; this.redraw(); }
    if (inp.confirm()) this.start();
    if (inp.cancel()) this.scene.start('Menu');
  }
}
