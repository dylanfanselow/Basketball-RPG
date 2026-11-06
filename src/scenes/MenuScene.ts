import Phaser from 'phaser';
import { InputMapper } from '../input/input';
import { MenuList, title, FONT, COL, hiRes } from './ui';
import { app } from '../state';
import { sfx } from '../audio/sfx';

export class MenuScene extends Phaser.Scene {
  inp!: InputMapper; menu!: MenuList;
  constructor() { super('Menu'); }
  create() {
    hiRes(this);
    this.cameras.main.setBackgroundColor(COL.bg);
    this.inp = new InputMapper(this);
    // the scene object is reused: texts from the last visit were destroyed with it, so make fresh ones
    this.padText = this.add.text(80, 640, '', { fontFamily: FONT, fontSize: '15px', color: COL.dim });
    this.soundText = this.add.text(80, 668, '', { fontFamily: FONT, fontSize: '15px', color: COL.dim });
    title(this, 'HOOP CAREER', 'dev menu  ·  test any mode  ·  L1 / Esc: back to the main menu');
    const c = app.career;
    this.menu = new MenuList(this, 80, 140, [
      { label: 'Apartment (career home)', action: () => this.scene.start('Apartment'), hint: 'Your first place: walk around (furniture is solid). ✕ at a door, L1 to leave.' },
      { label: 'Garage (gym)', action: () => this.scene.start('Garage'), hint: 'Behind the apartment\'s left door. Training comes later.' },
      { label: 'Trailer (backstory)', action: () => this.scene.start('Trailer'), hint: 'Lights on a generator: walk up the steps, ✕ at the door ends the day; ✕ at the end of the path leaves.' },
      { label: 'Trailer (night)', action: () => this.scene.start('Trailer', { night: true }), hint: 'The trailer yard at night: the generator keeps the lamps on.' },
      { label: 'Practice Court', action: () => this.scene.start('Game', { mode: 'practice' }), hint: 'Half court. Configure defenders/teammates in the dev panel (F1).' },
      { label: 'Quick 5v5 Game', action: () => this.scene.start('MatchSetup') },
      { label: 'Quick 3v3 Game', action: () => this.scene.start('ThreeSetup'), hint: 'Real rosters, Guard / Wing / Big, 3v3 sets + iso ball. Full or half court.' },
      { label: '1v1 · Make It, Take It', action: () => this.scene.start('OneOnOneSetup'), hint: 'Half court, pick any NBA player; P2 = second controller/keyboard or CPU.' },
      { label: 'Career Hub', action: () => this.scene.start('Hub') },
      { label: 'Perk Trees', action: () => this.scene.start('PerkTree', { back: 'Menu' }) },
      { label: 'Fullscreen  (F)', action: () => (window as any).__toggleFullscreen?.(), hint: 'Or click ⛶ in the top-right corner.' },
    ], 18);
    this.add.text(80, 404, `Player: ${c.name}  ·  ${c.pos}  ·  Lv ${c.level}`, { fontFamily: FONT, fontSize: '16px', color: COL.dim });
    this.add.text(80, 428, [
      'CONTROLS (gamepad)                    KEYBOARD',
      'Left stick  move                      WASD',
      '✕  shoot  |  block                    K / Space',
      '△  pass ● | call for ball | steal     I',
      '○  dribble move | screen | charge     L',
      '□  ultimate                           J',
      'R2 sprint burst (tap)  Options pause  Shift / Enter',
      'L1  back / quit (in game: L1 twice)  Esc',
      'R1 (hold) icon pass: ✕○□△ = teammate  Q',
      'L2 (hold) post up: stick to/away rim  E',
      'Create+Options  dev tools             F1 or `',
      '                                      F fullscreen · M mute',
    ].join('\n'), { fontFamily: FONT, fontSize: '14px', color: COL.text, lineSpacing: 3 });
  }
  padText!: Phaser.GameObjects.Text;
  soundText!: Phaser.GameObjects.Text;
  update() {
    const pad = this.inp.pad;
    this.soundText.setText(sfx.running ? `🔊 Sound on  (M to ${sfx.settings.muted ? 'unmute' : 'mute'})` : '🔇 Press any key or click to enable sound');
    if (this.inp.pressed('mute')) sfx.toggleMute();
    this.padText.setText(pad ? `🎮 Controller: ${pad.id.replace(/\(.*\)/, '').trim()}` : 'No controller detected. Plug one in and press any button on it.').setColor(pad ? COL.good : COL.dim);
    this.inp.poll(); if (this.inp.pressed('dev')) (window as any).__toggleDev?.();
    if (this.inp.pressed('escape') || this.inp.pressed('back')) { this.scene.start('Title'); return; } // round 58: the real main menu
    this.menu.update(this.inp); }
}
