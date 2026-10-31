import Phaser from 'phaser';
import { InputMapper } from '../input/input';
import { FONT, COL, title } from './ui';
import { app } from '../state';
import { applyGameResult, xpToNext } from '../career/career';
import { ULT_MILESTONES } from '../sim/ultimates';
import type { GameSim } from '../sim/game';

export class PostGameScene extends Phaser.Scene {
  inp!: InputMapper; mode = 'quick'; sim: GameSim | null = null;
  constructor() { super('PostGame'); }
  init(d: { mode: string; sim: GameSim }) { this.mode = d.mode; this.sim = d.sim; }
  create() {
    this.cameras.main.setBackgroundColor(COL.bg);
    this.inp = new InputMapper(this);
    const sim = this.sim;
    if (!sim) { this.scene.start('Menu'); return; }
    const [a, b] = sim.teams;
    title(this, 'FINAL', `${a.def.city} ${a.def.name} ${a.score} – ${b.score} ${b.def.city} ${b.def.name}`);
    const u = sim.user!;
    const won = a.score > b.score;
    const bx = u.box;
    const lines = [
      `${u.name}:  ${bx.pts} PTS  ${bx.reb} REB  ${bx.ast} AST  ${bx.stl} STL  ${bx.blk} BLK  ${bx.tov} TOV`,
      `FG ${bx.fgm}/${bx.fga}   3PT ${bx.tpm}/${bx.tpa}   Minutes ${(bx.secs / sim.cfg.quarterLen * 12).toFixed(0)} (scaled)`,
      `Play execution: ${sim.grade.good} good / ${sim.grade.bad} missed`,
      `Team trust ${sim.trust.team.toFixed(0)}   Coach trust ${sim.trust.coach.toFixed(0)}`,
      '',
    ];
    if (sim.milestones.length) lines.push('Milestones: ' + sim.milestones.map((m) => ULT_MILESTONES[m]?.name ?? m).join(', '), '');
    if (this.mode === 'career') {
      const r = applyGameResult(app.career, { box: bx, won, grade: sim.grade, milestones: sim.milestones });
      app.changed();
      lines.push(`+${r.xp} XP   (Lv ${app.career.level}, ${app.career.xp}/${xpToNext(app.career.level)})`);
      if (r.levels) lines.push(`LEVEL UP! +${r.levels * 3} stat points, +${r.levels} perk point${r.levels > 1 ? 's' : ''}`);
      for (const e of r.evo) lines.push(`Ultimate evolution: ${e}`);
    } else {
      lines.push('(Quick games don\'t affect your career save.)');
    }
    lines.push('', 'Box score:');
    for (const t of sim.teams) {
      lines.push(`  ${t.def.id}`);
      for (const p of t.roster.filter((p) => p.box.secs > 0)) lines.push(`    ${(p.isUser || p.id === 'USER' ? '★ ' : '  ') + p.name.padEnd(20)} ${p.pos.padEnd(3)} ${String(p.box.pts).padStart(3)} pts ${String(p.box.reb).padStart(2)} reb ${String(p.box.ast).padStart(2)} ast  ${p.box.fgm}/${p.box.fga}`);
    }
    this.add.text(60, 130, lines.join('\n'), { fontFamily: FONT, fontSize: '14px', color: COL.text, lineSpacing: 3 });
    this.add.text(1220, 690, '✕ / Enter: continue', { fontFamily: FONT, fontSize: '14px', color: COL.dim }).setOrigin(1, 0);
  }
  update() { this.inp.poll(); if (this.inp.confirm()) this.scene.start(this.mode === 'career' ? 'Hub' : 'Menu'); }
}
