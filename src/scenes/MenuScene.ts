import Phaser from 'phaser';
import { InputMapper } from '../input/input';
import { MenuList, title, FONT, COL } from './ui';
import { app } from '../state';
import { sfx } from '../audio/sfx';

export class MenuScene extends Phaser.Scene {
  inp!: InputMapper; menu!: MenuList;
  constructor() { super('Menu'); }
  create() {
    this.cameras.main.setBackgroundColor(COL.bg);
    this.inp = new InputMapper(this);
    title(this, 'HOOP CAREER', 'gameplay-first vertical slice  ·  5v5 career basketball RPG');
    const c = app.career;
    this.menu = new MenuList(this, 80, 180, [
      { label: 'Practice Court', action: () => this.scene.start('Game', { mode: 'practice' }), hint: 'Half court. Configure defenders/teammates in the dev panel (F1).' },
      { label: 'Quick 5v5 Game (you start)', action: () => this.scene.start('Game', { mode: 'quick' }) },
      { label: 'Career Hub', action: () => this.scene.start('Hub') },
      { label: 'Perk Trees', action: () => this.scene.start('PerkTree', { back: 'Menu' }) },
    ]);
    this.add.text(80, 400, `Player: ${c.name}  ·  ${c.pos}  ·  Lv ${c.level}`, { fontFamily: FONT, fontSize: '16px', color: COL.dim });
    this.add.text(80, 440, [
      'CONTROLS (gamepad)                    KEYBOARD',
      'Left stick  move                      WASD',
      '✕  shoot  |  block                    K / Space',
      '△  pass ● | call for ball | steal     I',
      '○  dribble move | screen | charge     L',
      '□  ultimate                           J',
      'R2 sprint burst (tap)  Options pause  Shift / Enter',
      'Create+Options  dev tools             F1 or `',
      '                                      M  mute',
    ].join('\n'), { fontFamily: FONT, fontSize: '15px', color: COL.text, lineSpacing: 4 });
  }
  padText?: Phaser.GameObjects.Text;
  soundText?: Phaser.GameObjects.Text;
  update() {
    const pad = this.inp.pad;
    if (!this.padText) this.padText = this.add.text(80, 640, '', { fontFamily: FONT, fontSize: '15px', color: COL.dim });
    if (!this.soundText) this.soundText = this.add.text(80, 668, '', { fontFamily: FONT, fontSize: '15px', color: COL.dim });
    this.soundText.setText(sfx.running ? `🔊 Sound on  (M to ${sfx.settings.muted ? 'unmute' : 'mute'})` : '🔇 Press any key or click to enable sound');
    if (this.inp.pressed('mute')) sfx.toggleMute();
    this.padText.setText(pad ? `🎮 Controller: ${pad.id.replace(/\(.*\)/, '').trim()}` : 'No controller detected. Plug one in and press any button on it.').setColor(pad ? COL.good : COL.dim);
    this.inp.poll(); if (this.inp.pressed('dev')) (window as any).__toggleDev?.(); this.menu.update(this.inp); }
}
