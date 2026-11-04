import Phaser from 'phaser';
import { InputMapper } from '../input/input';
import { FONT, COL, title, hiRes } from './ui';
import { TEAMS } from '../sim/data';
import { REAL_ROSTERS, RosterEntry } from '../career/roster';
import { app } from '../state';
import { SLOTS, Slot, ThreeSetup, defaultLineup, slotChoices, slotForPos } from '../sim/threes';

const KEY = 'hoopcareer.threeSetup';

/**
 * Quick 3v3 setup: both teams, both lineups (Guard PG/SG · Wing SG/SF/PF · Big PF/C, best fits by default, each slot
 * swappable), who you play as, and full or half court. Columns: teams | opponent | lineups & options.
 * In the right column ←/→ changes the highlighted row; R1/L2 (or Q/E) switch columns everywhere.
 */
export class ThreeSetupScene extends Phaser.Scene {
  inp!: InputMapper;
  col = 0;
  team: [number, number] = [13, 19];
  mine: [number, number, number] = [0, 1, 2];
  theirs: [number, number, number] = [0, 1, 2];
  playAs: Slot | 'me' = 0;
  court: 'full' | 'half' = 'full';
  row = 0;
  texts: Phaser.GameObjects.Text[] = [];
  g!: Phaser.GameObjects.Graphics;
  info!: Phaser.GameObjects.Text;
  constructor() { super('ThreeSetup'); }

  roster(side: 0 | 1): RosterEntry[] { return REAL_ROSTERS[TEAMS[this.team[side]].id] ?? []; }

  create() {
    hiRes(this);
    this.cameras.main.setBackgroundColor(COL.bg);
    this.inp = new InputMapper(this);
    this.col = 0; this.row = 0;
    this.team = [13, 19];
    this.mine = defaultLineup(this.roster(0)); this.theirs = defaultLineup(this.roster(1));
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as ThreeSetup | null;
      if (s) {
        this.team = [Math.max(0, TEAMS.findIndex((t) => t.id === s.myTeam)), Math.max(0, TEAMS.findIndex((t) => t.id === s.oppTeam))];
        const ok = (l: number[], side: 0 | 1) => l.length === 3 && l.every((i) => i >= 0 && i < this.roster(side).length) && new Set(l).size === 3;
        this.mine = ok(s.mine, 0) ? s.mine : defaultLineup(this.roster(0));
        this.theirs = ok(s.theirs, 1) ? s.theirs : defaultLineup(this.roster(1));
        this.playAs = s.playAs; this.court = s.court === 'half' ? 'half' : 'full';
      }
    } catch { /* first time */ }
    title(this, 'QUICK 3v3', 'Stick/D-pad: move · R1/L2 or Q/E: switch column · Left/Right: change a row · ✕/Enter: tip off · ○/L1: back');
    this.g = this.add.graphics();
    ['YOUR TEAM', 'OPPONENT', 'LINEUPS & OPTIONS'].forEach((h, i) => this.add.text([70, 370, 670][i], 128, h, { fontFamily: FONT, fontSize: '18px', color: COL.accent, fontStyle: 'bold' }));
    this.info = this.add.text(1040, 165, '', { fontFamily: FONT, fontSize: '13px', color: COL.text, lineSpacing: 4, wordWrap: { width: 225 } });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.vert(Math.sign(dy)));
    this.redraw();
  }

  /** Right-column rows: 6 lineup slots, play as, court. */
  optionRows(): string[] {
    const r0 = this.roster(0), r1 = this.roster(1);
    const nm = (r: RosterEntry[], i: number) => (r[i] ? `${r[i].pos.padEnd(3)}${r[i].name}` : '-');
    const me = this.playAs === 'me' ? slotForPos(app.career.pos) : -1;
    const rows = SLOTS.map((s, i) => `You  ${s.padEnd(6)}${me === i ? `★ ${app.career.name}` : nm(r0, this.mine[i])}`);
    rows.push(...SLOTS.map((s, i) => `Opp  ${s.padEnd(6)}${nm(r1, this.theirs[i])}`));
    rows.push(`Play as   ${this.playAs === 'me' ? `★ My Player (${app.career.pos})` : `${SLOTS[this.playAs]}: ${r0[this.mine[this.playAs]]?.name ?? '-'}`}`);
    rows.push(`Court     ${this.court === 'full' ? 'Full (like 5v5)' : 'Half (check up top)'}`);
    return rows;
  }

  vert(d: number) {
    if (this.col < 2) {
      const n = TEAMS.length, side = this.col as 0 | 1;
      this.team[side] = (this.team[side] + d + n) % n;
      if (side === 0) this.mine = defaultLineup(this.roster(0)); else this.theirs = defaultLineup(this.roster(1));
    } else this.row = (this.row + d + 8) % 8;
    this.redraw();
  }

  /** ←/→ on a right-column row. */
  change(d: number) {
    if (this.row < 6) {
      const side: 0 | 1 = this.row < 3 ? 0 : 1, slot = (this.row % 3) as Slot;
      const lineup = side === 0 ? this.mine : this.theirs;
      const ch = slotChoices(this.roster(side), lineup, slot);
      if (!ch.length) return;
      const at = ch.indexOf(lineup[slot]);
      lineup[slot] = ch[((at < 0 ? 0 : at) + d + ch.length) % ch.length];
    } else if (this.row === 6) {
      const opts: (Slot | 'me')[] = [0, 1, 2, 'me'];
      this.playAs = opts[(opts.indexOf(this.playAs) + d + opts.length) % opts.length];
    } else this.court = this.court === 'full' ? 'half' : 'full';
    this.redraw();
  }

  redraw() {
    for (const t of this.texts) t.destroy();
    this.texts = [];
    this.g.clear();
    // team columns
    for (const side of [0, 1] as const) {
      const sel = this.team[side], visible = 16;
      const start = Phaser.Math.Clamp(sel - 7, 0, Math.max(0, TEAMS.length - visible));
      for (let i = start; i < Math.min(TEAMS.length, start + visible); i++) {
        const y = 165 + (i - start) * 26, on = i === sel, t = TEAMS[i], x = 60 + side * 300;
        this.g.fillStyle(Phaser.Display.Color.HexStringToColor(t.colors[0]).color, on ? 1 : 0.35); this.g.fillRect(x + 4, y - 2, 8, 22);
        if (on) { this.g.lineStyle(2, side === this.col ? 0xffcc33 : 0x55607a, 1); this.g.strokeRect(x, y - 4, 280, 26); }
        const txt = this.add.text(x + 20, y, `${t.city} ${t.name}`, { fontFamily: FONT, fontSize: '15px', color: on ? (side === this.col ? COL.accent : '#ffffff') : COL.dim }).setInteractive({ useHandCursor: true });
        txt.on('pointerdown', () => { this.col = side; this.team[side] = i; if (side === 0) this.mine = defaultLineup(this.roster(0)); else this.theirs = defaultLineup(this.roster(1)); this.redraw(); });
        this.texts.push(txt);
      }
    }
    // lineups & options
    const rows = this.optionRows();
    rows.forEach((r, i) => {
      const y = 165 + i * 34 + (i >= 3 ? 12 : 0) + (i >= 6 ? 12 : 0), on = i === this.row, x = 664;
      if (on) { this.g.lineStyle(2, this.col === 2 ? 0xffcc33 : 0x55607a, 1); this.g.strokeRect(x - 4, y - 5, 360, 28); }
      const txt = this.add.text(x, y, (on && this.col === 2 ? '‹ ' : '  ') + r + (on && this.col === 2 ? ' ›' : ''), { fontFamily: FONT, fontSize: '13px', color: on ? (this.col === 2 ? COL.accent : '#ffffff') : COL.text }).setInteractive({ useHandCursor: true });
      txt.on('pointerdown', () => { if (this.col === 2 && this.row === i) this.change(1); else { this.col = 2; this.row = i; this.redraw(); } });
      this.texts.push(txt);
    });
    // info: the highlighted player
    let e: RosterEntry | null = null;
    if (this.col === 2 && this.row < 6) e = (this.row < 3 ? this.roster(0) : this.roster(1))[(this.row < 3 ? this.mine : this.theirs)[this.row % 3]] ?? null;
    const sameTeam = this.team[0] === this.team[1];
    this.info.setText((e
      ? `${e.name}  #${e.number}\n${e.pos} · ${Math.floor(e.heightFt)}'${Math.round((e.heightFt % 1) * 12)}"\n\nShooting ${e.core.shooting}\nFinishing ${e.core.finishing}\nStrength ${e.core.strength}\nMobility ${e.core.mobility}\nPlaymaking ${e.core.playmaking}\n\nPerks: ${e.perks.length}\n\n`
      : `3 on 3 with real rosters.\nGuard: PG/SG\nWing: SG/SF/PF\nBig: PF/C\n\nThe coach calls 3v3 sets (pick & roll, pop, handoff, pin-down, post-up, give & go) and isos.\n\nNo subs: your three play the whole game.\n\n`)
      + (sameTeam ? 'Pick two different teams.' : '✕ / Enter to tip off'));
  }

  start() {
    if (this.team[0] === this.team[1]) { this.cameras.main.shake(120, 0.004); return; }
    const setup: ThreeSetup = { myTeam: TEAMS[this.team[0]].id, oppTeam: TEAMS[this.team[1]].id, mine: [...this.mine], theirs: [...this.theirs], playAs: this.playAs, court: this.court };
    try { localStorage.setItem(KEY, JSON.stringify(setup)); } catch { /* ignore */ }
    this.scene.start('Game', { mode: 'quick3', three: setup });
  }

  update() {
    const inp = this.inp; inp.poll();
    if (inp.pressed('dev')) (window as any).__toggleDev?.();
    if (inp.pressed('down')) this.vert(1);
    if (inp.pressed('up')) this.vert(-1);
    if (inp.pressed('tabNext')) { this.col = (this.col + 1) % 3; this.redraw(); }
    if (inp.pressed('tabPrev')) { this.col = (this.col + 2) % 3; this.redraw(); }
    if (inp.pressed('right')) { if (this.col === 2) this.change(1); else { this.col++; this.redraw(); } }
    if (inp.pressed('left')) { if (this.col === 2) this.change(-1); else if (this.col > 0) { this.col--; this.redraw(); } }
    if (inp.confirm()) this.start();
    if (inp.cancel()) this.scene.start('Menu');
  }
}
