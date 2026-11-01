import Phaser from 'phaser';
import { InputMapper } from '../input/input';
import { MenuList, title, FONT, COL, hiRes } from './ui';
import { app } from '../state';
import { xpToNext } from '../career/career';
import { minutesFor } from '../sim/rotation';
import { TEAMS } from '../sim/data';

export class HubScene extends Phaser.Scene {
  inp!: InputMapper; menu!: MenuList;
  constructor() { super('Hub'); }
  create() {
    hiRes(this);
    this.cameras.main.setBackgroundColor(COL.bg);
    this.inp = new InputMapper(this);
    const c = app.career;
    const team = TEAMS.find((t) => t.id === c.teamId)!;
    const opp = TEAMS.find((t) => t.id === c.season.schedule[c.season.gameNo % c.season.schedule.length])!;
    title(this, 'CAREER HUB', `${c.name} · ${c.pos} · ${team.city} ${team.name} · Record ${c.season.wins}-${c.season.losses}`);
    const role = minutesFor(c.trust.coach);
    this.add.text(640, 160, [
      `LEVEL ${c.level}   XP ${c.xp}/${xpToNext(c.level)}`,
      `Stat points: ${c.statPoints}    Perk points: ${c.perkPoints}`,
      '',
      `Coach trust ${c.trust.coach.toFixed(0)} → ${role.role} (~${role.minutes} min)`,
      `Team trust  ${c.trust.team.toFixed(0)} → how often teammates look for you`,
      '',
      `Next: Game ${c.season.gameNo + 1} vs ${opp.city} ${opp.name}`,
      '',
      'Off-court story & random events: coming later',
      '(the systems are stubbed in src/career/story.ts)',
    ].join('\n'), { fontFamily: FONT, fontSize: '17px', color: COL.text, lineSpacing: 6 });
    this.menu = new MenuList(this, 80, 160, [
      { label: 'Play Next Game', action: () => this.scene.start('Game', { mode: 'career' }) },
      { label: `Level Up${c.statPoints ? ` (${c.statPoints})` : ''}`, action: () => this.scene.start('LevelUp') },
      { label: `Perk Trees${c.perkPoints ? ` (${c.perkPoints})` : ''}`, action: () => this.scene.start('PerkTree', { back: 'Hub' }) },
      { label: c.flags.ult_unlocked ? 'Ultimate' : 'Ultimate  ???', action: () => this.scene.start('Ultimate') },
      { label: 'Practice Court', action: () => this.scene.start('Game', { mode: 'practice' }) },
      { label: 'Main Menu', action: () => this.scene.start('Menu') },
    ]);
  }
  update() { this.inp.poll(); if (this.inp.pressed('dev')) (window as any).__toggleDev?.(); this.menu.update(this.inp); if (this.inp.cancel()) this.scene.start('Menu'); }
}
