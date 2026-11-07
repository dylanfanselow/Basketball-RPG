import Phaser from 'phaser';
import { InputMapper } from '../input/input';
import { FONT, hiRes } from './ui';
import { app } from '../state';
import { sfx } from '../audio/sfx';
import { createCareer, STARTER_CORE, HEIGHT_RANGE, fmtHeight } from '../career/career';
import { POSITIONS, Position } from '../sim/attributes';
import { CORE_STATS, TEAMS } from '../sim/data';
import {
  Appearance, HAIR_STYLES, FACIAL, NOSES, MOUTHS, SOCKS, ARM_SLEEVE, LEG_SLEEVE, SKIN_TONES, HAIR_COLORS, EYE_COLORS, GEAR_COLORS,
  defaultAppearance, randomAppearance, withDefaults,
} from '../render/appearance';
import { partVariants } from '../render/faceParts';
import { FRAME_W, FRAME_H, CX, FOOT_Y, SPRITE_SCALE, Kit, drawAngled, crispenRect, figureHeight, shade } from '../render/sprites';
import { CLIP, sampleClip, frameTime } from '../render/anim';

type Step = 0 | 1 | 2 | 3;
const STEPS = ['LOOK', 'POSITION', 'HEIGHT', 'READY'];
const POS_NAMES: Record<Position, string> = { PG: 'Point Guard', SG: 'Shooting Guard', SF: 'Small Forward', PF: 'Power Forward', C: 'Center' };
const POS_BLURB: Record<Position, string> = {
  PG: 'Runs the offense. Best playmaker, quick, can shoot. Light on strength.',
  SG: 'The shooter. Best jumper, quick, some playmaking.',
  SF: 'Does a bit of everything: shoots, finishes, defends.',
  PF: 'Strong inside: finishing, rebounding, screens. Some range.',
  C: 'The anchor: strongest, finishes at the rim, protects it.',
};
const STAT_COL: Record<string, number> = { shooting: 0x9ae04a, finishing: 0x6ab8f0, strength: 0xf05a80, mobility: 0x9ff2ff, playmaking: 0xffd84a };
const VIEWS = [90, 45, 0];

interface Row { label: string; value: () => string; swatch?: () => string | null; cycle: (d: number) => void }

/**
 * Round 59: the character builder (New Game → here). Step 1 LOOK: every appearance option we've built (hair styles
 * incl. the hand-drawn parts, colours, face, gear) with a live preview; 2 POSITION (starter skills by position,
 * baseline 40); 3 HEIGHT (a range per position); 4 READY → the career starts in the apartment.
 * ✕ next / pick · ○ (L1) back · □ randomize look · △ turn the preview.
 */
export class CreateScene extends Phaser.Scene {
  inp!: InputMapper;
  private step: Step = 0;
  private look: Appearance = defaultAppearance();
  private pos: Position = 'SG';
  private heightIn = 77;
  private row = 0;
  private view = 0;
  private g!: Phaser.GameObjects.Graphics;
  private preview!: Phaser.GameObjects.Sprite;
  private tabs: Phaser.GameObjects.Text[] = [];
  private head!: Phaser.GameObjects.Text;
  private body!: Phaser.GameObjects.Text;
  private help!: Phaser.GameObjects.Text;
  private rowTexts: Phaser.GameObjects.Text[] = [];
  private kit!: Kit;
  private leaving = false;

  constructor() { super('Create'); }

  create() {
    hiRes(this);
    this.inp = new InputMapper(this);
    this.step = 0; this.row = 0; this.view = 0; this.leaving = false; this.rowTexts = []; this.tabs = [];
    this.look = randomAppearance(Math.random);
    Object.assign(this.look, { headband: null, armSleeve: 'none', wristband: null, legSleeve: 'none', kneePad: false, goggles: false, mask: false });
    this.pos = 'SG'; this.heightIn = this.midHeight('SG');
    const team = TEAMS.find((t) => t.id === 'LAL') ?? TEAMS[0];
    this.kit = { jersey: '#ebe7de', jerseyShade: '#c9c4b8', trim: '#d8d3c8', shorts: shade(team.colors[0], 0.9), number: -1 };
    // backdrop: a dark purple studio with a spotlight on the floor under you
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x07081a, 0x07081a, 0x2a1650, 0x1a0e34, 1); bg.fillRect(0, 0, 1280, 720);
    bg.fillStyle(0x000000, 0.35); bg.fillRect(0, 610, 1280, 110);
    bg.fillStyle(0xffe9b0, 0.08); bg.fillEllipse(330, 610, 360, 60); bg.fillStyle(0xffe9b0, 0.08); bg.fillEllipse(330, 610, 220, 34);
    bg.fillStyle(0xffffff, 0.035); bg.fillTriangle(250, 0, 410, 0, 470, 610); bg.fillTriangle(250, 0, 190, 610, 470, 610);
    this.add.text(40, 26, 'CREATE YOUR PLAYER', { fontFamily: FONT, fontSize: '30px', color: '#ffffff', fontStyle: 'bold', stroke: '#140a22', strokeThickness: 6 });
    STEPS.forEach((s, i) => this.tabs.push(this.add.text(640 + i * 152, 34, `${i + 1} ${s}`, { fontFamily: FONT, fontSize: '18px', color: '#8892b0', fontStyle: 'bold' })));
    this.g = this.add.graphics().setDepth(5);
    // the preview: a canvas texture with 4 idle frames, redrawn whenever the look / height / view changes
    if (!this.textures.exists('cc_prev')) { const t = this.textures.createCanvas('cc_prev', FRAME_W * 4, FRAME_H)!; for (let f = 0; f < 4; f++) t.add(f, 0, f * FRAME_W, 0, FRAME_W, FRAME_H); }
    this.preview = this.add.sprite(330, 610, 'cc_prev', 0).setOrigin(CX / FRAME_W, FOOT_Y / FRAME_H).setScale(SPRITE_SCALE * 2.3).setDepth(4);
    this.head = this.add.text(660, 96, '', { fontFamily: FONT, fontSize: '24px', color: '#ffe680', fontStyle: 'bold' }).setDepth(6);
    this.body = this.add.text(660, 138, '', { fontFamily: FONT, fontSize: '17px', color: '#e8ecff', lineSpacing: 6, wordWrap: { width: 580 } }).setDepth(6);
    for (let i = 0; i < 14; i++) this.rowTexts.push(this.add.text(684, 138 + i * 34, '', { fontFamily: FONT, fontSize: '18px', color: '#e8ecff', fontStyle: 'bold' }).setDepth(6));
    this.help = this.add.text(40, 676, '', { fontFamily: FONT, fontSize: '15px', color: '#aab4d8' }).setDepth(6);
    this.redrawPreview();
    this.refresh();
    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  private midHeight(p: Position) { const [lo, hi] = HEIGHT_RANGE[p]; return Math.round((lo + hi) / 2); }

  /** Every look option, cycled with ←/→ (the same options as the dev panel's appearance editor). */
  private rows(): Row[] {
    const a = this.look;
    const list = <T>(k: keyof Appearance, opts: readonly T[], name?: (v: T) => string): Row => ({
      label: '', value: () => (name ? name((a as any)[k]) : String((a as any)[k] ?? 'none')),
      cycle: (d) => { const i = opts.findIndex((o) => String(o) === String((a as any)[k])); (a as any)[k] = opts[((i < 0 ? 0 : i) + d + opts.length) % opts.length]; },
    });
    const colorRow = (k: keyof Appearance, opts: readonly (string | null)[]): Row => ({ ...list(k, opts, (v) => (v ? '    ' : 'none')), swatch: () => (a as any)[k] ?? null });
    const flag = (k: keyof Appearance): Row => ({ label: '', value: () => ((a as any)[k] ? 'yes' : 'no'), cycle: () => { (a as any)[k] = !(a as any)[k]; } });
    const parts = (base: readonly string[], ...types: Parameters<typeof partVariants>[0][]) => [...new Set([...base, ...types.flatMap((t) => partVariants(t))])];
    const pretty = (v: string) => v.replace(/_/g, ' ');
    const r: [string, Row][] = [
      ['Skin tone', { ...list('skin', SKIN_TONES.map((_, i) => i), (v) => `    tone ${v + 1}`), swatch: () => SKIN_TONES[a.skin][0] }],
      ['Hair', list('hair', parts(HAIR_STYLES, 'hair'), pretty)],
      ['Hair color', colorRow('hairColor', HAIR_COLORS)],
      ['Facial hair', list('facial', parts(FACIAL, 'beard'), pretty)],
      ['Eye color', colorRow('eyeColor', EYE_COLORS)],
      ['Eyes', list('eyes', ['', ...partVariants('eyes')] as string[], (v) => (v ? pretty(v) : 'standard'))],
      ['Eye height', list('eyeY', [-1, 0, 1], (v) => ['high', 'middle', 'low'][v + 1])],
      ['Brows', list('brow', [1, 2], (v) => (v === 2 ? 'thick' : 'thin'))],
      ['Nose', list('nose', parts(NOSES, 'nose'), pretty)],
      ['Mouth', list('mouth', parts(MOUTHS, 'mouth'), pretty)],
      ['Big ears', flag('bigEars')],
      ['Headband', colorRow('headband', [null, ...GEAR_COLORS])],
      ['Arm sleeve', list('armSleeve', ARM_SLEEVE)],
      ['Sleeve color', colorRow('sleeveColor', GEAR_COLORS)],
      ['Wristband', colorRow('wristband', [null, ...GEAR_COLORS])],
      ['Leg sleeve', list('legSleeve', LEG_SLEEVE)],
      ['Leg sleeve color', colorRow('legSleeveColor', GEAR_COLORS)],
      ['Knee pad', flag('kneePad')],
      ['Socks', list('socks', SOCKS)],
      ['Sock color', colorRow('sockColor', GEAR_COLORS)],
      ['Shoes', colorRow('shoe', ['#f4f4f4', ...GEAR_COLORS])],
      ['Shoe accent', colorRow('shoeAccent', GEAR_COLORS)],
      ['Goggles', flag('goggles')],
      ['Face mask', flag('mask')],
    ];
    return r.map(([label, row]) => ({ ...row, label }));
  }

  /** Redraw the preview's idle frames at the current look / height / view (drawn here, no sprite sheet needed). */
  private redrawPreview() {
    const tex = this.textures.get('cc_prev') as Phaser.Textures.CanvasTexture, ctx = tex.getContext();
    const look = withDefaults({ ...this.look }), H = figureHeight(this.heightIn / 12), yaw = VIEWS[this.view], idle = CLIP.idle;
    ctx.clearRect(0, 0, FRAME_W * 4, FRAME_H);
    for (let f = 0; f < 4; f++) {
      ctx.save(); ctx.beginPath(); ctx.rect(f * FRAME_W, 0, FRAME_W, FRAME_H); ctx.clip();
      drawAngled(ctx, f * FRAME_W, 0, sampleClip(idle, frameTime(idle, f)), H, look, this.kit, false, yaw);
      ctx.restore();
      crispenRect(ctx, f * FRAME_W, 0, FRAME_W, FRAME_H);
    }
    tex.refresh();
  }

  private refresh() {
    this.tabs.forEach((t, i) => t.setColor(i === this.step ? '#ffe680' : i < this.step ? '#bff58a' : '#8892b0'));
    const g = this.g.clear();
    g.fillStyle(0x0c0a1c, 0.82).fillRoundedRect(640, 84, 600, 576, 12); g.lineStyle(2, 0x9a6ae0, 1).strokeRoundedRect(640, 84, 600, 576, 12);
    for (const t of this.rowTexts) t.setText('');
    this.body.setText('');
    const st = STARTER_CORE[this.pos], [lo, hi] = HEIGHT_RANGE[this.pos];
    const statBars = (y0: number) => CORE_STATS.forEach((s, i) => {
      const v = st[s], y = y0 + i * 30;
      this.rowTexts[i].setText(`${s[0].toUpperCase()}${s.slice(1)}`.padEnd(12) + String(v)).setPosition(684, y - 4).setColor('#e8ecff');
      g.fillStyle(0x1c1830, 1).fillRoundedRect(900, y, 300, 14, 7);
      g.fillStyle(STAT_COL[s], 1).fillRoundedRect(900, y, Math.max(14, 300 * (v - 25) / 50), 14, 7);
      g.fillStyle(0xffffff, 0.25).fillRect(900 + 300 * 15 / 50, y - 2, 2, 18); // the 40 baseline
    });
    if (this.step === 0) {
      const rows = this.rows(), top = Math.max(0, Math.min(rows.length - 14, this.row - 6));
      this.head.setText('LOOK');
      rows.slice(top, top + 14).forEach((r, k) => {
        const i = top + k, on = i === this.row, y = 138 + k * 34;
        this.rowTexts[k].setPosition(684, y).setText(`${on ? '▶' : ' '} ${r.label.padEnd(17)}${on ? '◀ ' : '  '}${r.value()}${on ? ' ▶' : ''}`).setColor(on ? '#ffe680' : '#e8ecff');
        const sw = r.swatch?.();
        if (sw) { const x = 684 + 21 * 10.8 + 3; /* after "▶ label ◀ " (Courier: 0.6 em per character) */ g.fillStyle(0x000000, 1).fillRect(x - 1, y + 1, 26, 18); g.fillStyle(Phaser.Display.Color.HexStringToColor(sw).color, 1).fillRect(x, y + 2, 24, 16); }
      });
      if (rows.length > 14) { g.fillStyle(0x3a2e5a, 1).fillRect(1222, 138, 6, 476); g.fillStyle(0x9a6ae0, 1).fillRect(1222, 138 + 476 * top / rows.length, 6, 476 * 14 / rows.length); }
      this.help.setText('↑↓ option   ←→ change   □ randomize   △ turn   ✕ next: position   ○ back');
    } else if (this.step === 1) {
      this.head.setText(`◀  ${POS_NAMES[this.pos]} (${this.pos})  ▶`);
      this.body.setText(`${POS_BLURB[this.pos]}\nHeight ${fmtHeight(lo)} – ${fmtHeight(hi)}\n\nStarter skills (40 is the floor):`);
      statBars(330);
      POSITIONS.forEach((p, i) => { const x = 690 + i * 104; g.fillStyle(p === this.pos ? 0x9a6ae0 : 0x2a2244, 1).fillRoundedRect(x, 520, 90, 44, 8); });
      POSITIONS.forEach((p, i) => this.rowTexts[8 + i].setText(p).setPosition(690 + i * 104 + 45 - p.length * 6, 530).setColor(p === this.pos ? '#ffffff' : '#8892b0'));
      this.help.setText('←→ position   ✕ next: height   ○ back');
    } else if (this.step === 2) {
      this.head.setText(`HEIGHT  ◀  ${fmtHeight(this.heightIn)}  ▶`);
      this.body.setText(`${POS_NAMES[this.pos]}s here are ${fmtHeight(lo)} to ${fmtHeight(hi)}.\nTaller: dunks come easier and you contest and block more. Shorter: lower to the floor on the dribble.`);
      const x0 = 700, w = 480, k = (this.heightIn - lo) / Math.max(1, hi - lo);
      g.fillStyle(0x1c1830, 1).fillRoundedRect(x0, 330, w, 16, 8); g.fillStyle(0x9a6ae0, 1).fillRoundedRect(x0, 330, Math.max(16, w * k), 16, 8);
      for (let h = lo; h <= hi; h++) g.fillStyle(0xffffff, 0.5).fillRect(x0 + w * (h - lo) / Math.max(1, hi - lo) - 1, 352, 2, 8);
      this.rowTexts[0].setText(fmtHeight(lo)).setPosition(x0 - 10, 366).setColor('#8892b0');
      this.rowTexts[1].setText(fmtHeight(hi)).setPosition(x0 + w - 30, 366).setColor('#8892b0');
      this.help.setText('←→ height   ✕ next   ○ back');
    } else {
      this.head.setText('READY?');
      this.body.setText(`${POS_NAMES[this.pos]} · ${fmtHeight(this.heightIn)}\n\nYour starter skills:`);
      statBars(240);
      this.rowTexts[8].setText('✕  START YOUR CAREER').setPosition(760, 470).setColor('#ffe680').setFontSize(26);
      this.help.setText('✕ start   ○ back');
    }
    if (this.step !== 3) this.rowTexts[8]?.setFontSize(18);
  }

  update(t: number) {
    const inp = this.inp; inp.poll();
    if (inp.pressed('dev')) (window as any).__toggleDev?.();
    this.preview.setFrame(Math.floor(t / 300) % 4);
    if (this.leaving) return;
    let lookChanged = false, changed = false;
    const lr = (inp.pressed('right') ? 1 : 0) - (inp.pressed('left') ? 1 : 0);
    if (inp.cancel()) {
      sfx.blip(false);
      if (this.step === 0) { this.leaving = true; this.scene.start('Title'); return; }
      this.step = (this.step - 1) as Step; changed = true;
    } else if (inp.confirm()) {
      sfx.blip(true);
      if (this.step < 3) { this.step = (this.step + 1) as Step; changed = true; }
      else return this.finish();
    } else if (inp.pressed('y')) { this.view = (this.view + 1) % VIEWS.length; lookChanged = true; }
    else if (this.step === 0) {
      const rows = this.rows();
      if (inp.pressed('down')) { this.row = (this.row + 1) % rows.length; changed = true; }
      if (inp.pressed('up')) { this.row = (this.row + rows.length - 1) % rows.length; changed = true; }
      if (lr) { rows[this.row].cycle(lr); lookChanged = true; sfx.blip(true); }
      if (inp.pressed('x')) { const skin = this.look.skin; this.look = randomAppearance(Math.random); if (Math.random() < 0.5) this.look.skin = skin; lookChanged = true; sfx.blip(true); }
    } else if (this.step === 1 && lr) {
      const i = POSITIONS.indexOf(this.pos);
      this.pos = POSITIONS[(i + lr + POSITIONS.length) % POSITIONS.length];
      this.heightIn = this.midHeight(this.pos); lookChanged = true; sfx.blip(true);
    } else if (this.step === 2 && lr) {
      const [lo, hi] = HEIGHT_RANGE[this.pos];
      const h = Math.max(lo, Math.min(hi, this.heightIn + lr));
      if (h !== this.heightIn) { this.heightIn = h; lookChanged = true; sfx.blip(true); }
    }
    if (lookChanged) this.redrawPreview();
    if (lookChanged || changed) this.refresh();
  }

  /** Make the career and walk into your apartment. */
  private finish() {
    this.leaving = true;
    app.career = createCareer({ name: 'Rookie', pos: this.pos, heightIn: this.heightIn, appearance: this.look });
    app.changed();
    sfx.greenChime();
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.time.delayedCall(420, () => this.scene.start('Apartment'));
  }
}
