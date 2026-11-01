import Phaser from 'phaser';
import { InputMapper } from '../input/input';
import { FONT, COL, title, hiRes } from './ui';
import { app } from '../state';
import { applyGameResult, xpToNext } from '../career/career';
import { ULT_MILESTONES } from '../sim/ultimates';
import type { GameSim } from '../sim/game';
import type { GameInit } from './setup';

export class PostGameScene extends Phaser.Scene {
  inp!: InputMapper; mode = 'quick'; sim: GameSim | null = null; replay?: GameInit;
  constructor() { super('PostGame'); }
  init(d: { mode: string; sim: GameSim; replay?: GameInit }) { this.mode = d.mode; this.sim = d.sim; this.replay = d.replay; }
  create() {
    hiRes(this);
    this.cameras.main.setBackgroundColor(COL.bg);
    this.inp = new InputMapper(this);
    const sim = this.sim;
    if (!sim) { this.scene.start('Menu'); return; }
    if (this.mode === 'oneOnOne') { this.oneOnOne(sim); return; }
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
  /** 1v1 result: winner, both stat lines, rematch / change players / menu. */
  oneOnOne(sim: GameSim) {
    const [a, b] = sim.teams;
    const pa = a.onCourt[0], pb = b.onCourt[0];
    const winner = a.score > b.score ? pa : pb;
    const o = sim.cfg.oneOnOne!;
    title(this, `${winner.name.toUpperCase()} WINS`, `${pa.name} ${a.score} – ${b.score} ${pb.name}   ·   to ${o.target}, ${o.scoring === '1s2s' ? '1s & 2s' : '2s & 3s'}${o.winBy2 ? ', win by 2' : ''}`);
    const line = (tag: string, p: typeof pa) => {
      const x = p.box;
      return `${tag.padEnd(4)}${p.name.padEnd(24)} ${String(x.pts).padStart(3)} pts   FG ${x.fgm}/${x.fga}   3PT ${x.tpm}/${x.tpa}   REB ${x.reb}   STL ${x.stl}   BLK ${x.blk}   TOV ${x.tov}`;
    };
    this.add.text(60, 150, [line('P1', pa), line(sim.user2 ? 'P2' : 'CPU', pb), '', '(1v1 games don\'t affect your career save.)'].join('\n'), { fontFamily: FONT, fontSize: '16px', color: COL.text, lineSpacing: 6 });
    this.add.text(60, 330, '✕ / Enter   Rematch\n○ / L1      Change players\n△ / I       Main menu', { fontFamily: FONT, fontSize: '20px', color: COL.accent, lineSpacing: 10 });
  }

  update() {
    this.inp.poll();
    if (this.mode === 'oneOnOne') {
      if (this.inp.confirm()) this.scene.start('Game', this.replay ?? { mode: 'oneOnOne' });
      else if (this.inp.cancel()) this.scene.start('OneOnOneSetup');
      else if (this.inp.pressed('y')) this.scene.start('Menu');
      return;
    }
    if (this.inp.confirm()) this.scene.start(this.mode === 'career' ? 'Hub' : 'Menu');
  }
}
