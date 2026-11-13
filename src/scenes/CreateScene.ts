import Phaser from 'phaser';
import { InputMapper } from '../input/input';
import { FONT, hiRes } from './ui';
import { app } from '../state';
import { sfx } from '../audio/sfx';
import { newStory, LINCOLN } from '../sim/story';
import { prepareStory } from './preload';
import type { CareerState } from '../career/career';
import { storyScene } from './setup';
import { casualKit } from './RoomScene';
import { NODES } from '../sim/data';
import { createCareer, STARTER_PERKS, STARTER_CORE, HEIGHT_RANGE, fmtHeight, cleanName, NAME_MAX } from '../career/career';
import { POSITIONS, Position } from '../sim/attributes';
import { CORE_STATS, TEAMS } from '../sim/data';
import {
  Appearance, HAIR_STYLES, FACIAL, NOSES, MOUTHS, SOCKS, ARM_SLEEVE, LEG_SLEEVE, SKIN_TONES, HAIR_COLORS, EYE_COLORS, GEAR_COLORS, CLOTHES_COLORS,
  defaultAppearance, randomAppearance, withDefaults,
} from '../render/appearance';
import { partVariants } from '../render/faceParts';
import { FRAME_W, FRAME_H, CX, FOOT_Y, SPRITE_SCALE, Kit, drawAngled, crispenRect, figureHeight, shade } from '../render/sprites';
import { CLIP, sampleClip, frameTime } from '../render/anim';

/** 0 NAME · 1 LOOK · 2 POSITION · 3 HEIGHT · 4 NUMBER · 5 READY */
type Step = 0 | 1 | 2 | 3 | 4 | 5;
const STEPS = ['NAME', 'LOOK', 'POSITION', 'HEIGHT', 'NUMBER', 'READY'];
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
/** The on-screen keyboard (controller): letters, - and ', then space / delete / random / done. */
const GRID = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '-', "'", 'SPACE', 'DEL', 'RANDOM', 'DONE'];
const GRID_COLS = 10;
const FIRST_NAMES = ['Jalen', 'Marcus', 'Tyrese', 'Darius', 'Andre', 'Cam', 'Malik', 'Jaylen', 'Isaiah', 'Devin', 'Trey', 'Miles', 'Jordan', 'Elijah', 'Xavier', 'DeShawn', 'Nico', 'Theo', 'Omar', 'Luca'];
const LAST_NAMES = ['Carter', 'Brooks', 'Hayes', 'Mitchell', 'Coleman', 'Freeman', 'Banks', 'Ellis', 'Reed', 'Washington', 'Moore', 'Price', 'Grant', 'Holloway', 'Vance', 'Okafor', 'Silva', 'Ramirez', 'Novak', 'Kim'];

interface Row { label: string; value: () => string; swatch?: () => string | null; cycle: (d: number) => void }

/**
 * The character builder (round 59; New Game → here). 1 NAME (first + last: type on the keyboard, or the on-screen
 * letters with a controller), 2 LOOK (every appearance option, live preview), 3 POSITION (starter skills, 40 floor),
 * 4 HEIGHT (a range per position), 5 NUMBER (0-99, numbers your team already wears are skipped; you see it on the
 * jersey), 6 READY → the prologue starts on the rainy school court (round 60).
 * ✕ next / pick · ○ (L1) back · □ randomize look · △ turn the preview.
 */
export class CreateScene extends Phaser.Scene {
  inp!: InputMapper;
  private step: Step = 0;
  private look: Appearance = defaultAppearance();
  private pos: Position = 'SG';
  private heightIn = 77;
  private first = ''; private last = ''; private field: 0 | 1 = 0; private gi = 0;
  private number = 7; private numNote = '';
  private taken = new Map<number, string>();
  private typedFrame = -1;
  private row = 0;
  private view = 0;
  private g!: Phaser.GameObjects.Graphics;
  private preview!: Phaser.GameObjects.Sprite;
  private tabs: Phaser.GameObjects.Text[] = [];
  private head!: Phaser.GameObjects.Text;
  private body!: Phaser.GameObjects.Text;
  private help!: Phaser.GameObjects.Text;
  private big!: Phaser.GameObjects.Text;
  private rowTexts: Phaser.GameObjects.Text[] = [];
  private keyTexts: Phaser.GameObjects.Text[] = [];
  private teeShorts = '#333333'; private jersey!: Kit;
  private leaving = false;

  constructor() { super('Create'); }

  create() {
    hiRes(this);
    this.inp = new InputMapper(this);
    this.step = 0; this.candidate = null; this.row = 0; this.view = 0; this.leaving = false; this.rowTexts = []; this.tabs = []; this.keyTexts = [];
    this.first = ''; this.last = ''; this.field = 0; this.gi = 0; this.numNote = ''; this.typedFrame = -1;
    this.look = randomAppearance(Math.random);
    Object.assign(this.look, { headband: null, armSleeve: 'none', wristband: null, legSleeve: 'none', kneePad: false, goggles: false, mask: false });
    this.pos = 'SG'; this.heightIn = this.midHeight('SG');
    const teamId = app.career?.teamId ?? 'LAL', team = TEAMS.find((t) => t.id === teamId) ?? TEAMS[0];
    // round 60g: you're in high school, not on an NBA team yet, so every number is free
    this.taken = new Map();
    this.number = 7;
    this.teeShorts = shade(team.colors[0], 0.9); // round 80k: the tee follows your shirt / pants picks (`casualKit`)
    const hs = LINCOLN.colors; // the number preview: your Lincoln High jersey
    this.jersey = { jersey: hs[0], jerseyShade: shade(hs[0], 0.75), trim: hs[1], shorts: shade(hs[0], 0.9), number: this.number };
    // backdrop: a dark purple studio with a spotlight on the floor under you
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x07081a, 0x07081a, 0x2a1650, 0x1a0e34, 1); bg.fillRect(0, 0, 1280, 720);
    bg.fillStyle(0x000000, 0.35); bg.fillRect(0, 610, 1280, 110);
    bg.fillStyle(0xffe9b0, 0.08); bg.fillEllipse(330, 610, 360, 60); bg.fillStyle(0xffe9b0, 0.08); bg.fillEllipse(330, 610, 220, 34);
    bg.fillStyle(0xffffff, 0.035); bg.fillTriangle(250, 0, 410, 0, 470, 610); bg.fillTriangle(250, 0, 190, 610, 470, 610);
    this.add.text(40, 26, 'CREATE YOUR PLAYER', { fontFamily: FONT, fontSize: '30px', color: '#ffffff', fontStyle: 'bold', stroke: '#140a22', strokeThickness: 6 });
    let tx = 646;
    STEPS.forEach((s, i) => { const t = this.add.text(tx, 36, `${i + 1} ${s}`, { fontFamily: FONT, fontSize: '15px', color: '#8892b0', fontStyle: 'bold' }); this.tabs.push(t); tx += t.width + 16; });
    this.g = this.add.graphics().setDepth(5);
    if (!this.textures.exists('cc_prev')) { const t = this.textures.createCanvas('cc_prev', FRAME_W * 4, FRAME_H)!; for (let f = 0; f < 4; f++) t.add(f, 0, f * FRAME_W, 0, FRAME_W, FRAME_H); }
    this.preview = this.add.sprite(330, 610, 'cc_prev', 0).setOrigin(CX / FRAME_W, FOOT_Y / FRAME_H).setScale(SPRITE_SCALE * 2.3).setDepth(4);
    this.head = this.add.text(660, 96, '', { fontFamily: FONT, fontSize: '24px', color: '#ffe680', fontStyle: 'bold' }).setDepth(6);
    this.body = this.add.text(660, 138, '', { fontFamily: FONT, fontSize: '17px', color: '#e8ecff', lineSpacing: 6, wordWrap: { width: 580 } }).setDepth(6);
    this.big = this.add.text(940, 300, '', { fontFamily: FONT, fontSize: '96px', color: '#ffffff', fontStyle: 'bold', stroke: '#140a22', strokeThickness: 8 }).setOrigin(0.5).setDepth(6);
    for (let i = 0; i < 14; i++) this.rowTexts.push(this.add.text(684, 138 + i * 34, '', { fontFamily: FONT, fontSize: '18px', color: '#e8ecff', fontStyle: 'bold' }).setDepth(6));
    GRID.forEach((k) => this.keyTexts.push(this.add.text(0, 0, k === 'SPACE' ? 'SPACE' : k === 'DEL' ? '⌫' : k, { fontFamily: FONT, fontSize: k.length > 1 ? '13px' : '18px', color: '#e8ecff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(7)));
    this.help = this.add.text(40, 676, '', { fontFamily: FONT, fontSize: '15px', color: '#aab4d8' }).setDepth(6);
    // typing on a keyboard (the name step): letters go into the active field, and don't count as game buttons
    this.input.keyboard?.on('keydown', this.onKey, this);
    this.events.once('shutdown', () => this.input.keyboard?.off('keydown', this.onKey, this));
    this.redrawPreview();
    this.refresh();
    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  private midHeight(p: Position) { const [lo, hi] = HEIGHT_RANGE[p]; return Math.round((lo + hi) / 2); }
  /** The next number in direction d that nobody on your team wears. */
  private freeFrom(n: number, d: number) { for (let i = 0; i < 100; i++) { if (!this.taken.has(n)) return n; n = (n + d + 100) % 100; } return n; }
  private nameOk() { return cleanName(this.first).length > 0 && cleanName(this.last).length > 0; }
  private get fieldText() { return this.field === 0 ? this.first : this.last; }
  private set fieldText(v: string) { if (this.field === 0) this.first = v; else this.last = v; }
  private typeChar(ch: string) {
    const cur = this.fieldText;
    if (cur.length >= NAME_MAX) return;
    if (ch === ' ' && (!cur.length || cur.endsWith(' '))) return;
    // capitalise the start of each word
    this.fieldText = cur + (!cur.length || cur.endsWith(' ') || cur.endsWith('-') || cur.endsWith("'") ? ch.toUpperCase() : ch.toLowerCase());
  }
  private randomName() { this.first = Phaser.Utils.Array.GetRandom(FIRST_NAMES); this.last = Phaser.Utils.Array.GetRandom(LAST_NAMES); }

  private onKey(e: KeyboardEvent) {
    if (this.step !== 0 || this.leaving) return;
    const k = e.key;
    let used = true;
    if (k.length === 1 && /[A-Za-z '\-]/.test(k)) this.typeChar(k);
    else if (k === 'Backspace') this.fieldText = this.fieldText.slice(0, -1);
    else if (k === 'Tab') { this.field = this.field ? 0 : 1; e.preventDefault(); }
    else if (k === 'Enter') { if (this.field === 0) this.field = 1; else this.next(); }
    else used = false;
    if (used) { this.typedFrame = this.game.loop.frame; sfx.blip(true); this.refresh(); }
  }

  private next() {
    if (this.step === 0 && !this.nameOk()) { sfx.blip(false); this.numNote = ''; this.refresh(); return; }
    if (this.step === 5) { this.finish(); return; }
    this.step = (this.step + 1) as Step;
    if (this.step === 5) this.prepare();
    if (this.step === 4) this.view = 0; // the number: face the camera so it's on the jersey
    this.redrawPreview(); this.refresh();
  }

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
      // round 80k: everyday clothes (rooms, the trailer; in games you wear the team's uniform)
      ['Shirt color', { ...colorRow('shirt', CLOTHES_COLORS), swatch: () => a.shirt ?? '#ebe7de' }],
      ['Pants color', { ...colorRow('pants', CLOTHES_COLORS), swatch: () => a.pants ?? this.teeShorts }],
      ['Pants', { label: '', value: () => (a.longPants ? 'long' : 'shorts'), cycle: () => { a.longPants = !a.longPants; } }],
    ];
    return r.map(([label, row]) => ({ ...row, label }));
  }

  /** Redraw the preview's idle frames at the current look / height / view (drawn here, no sprite sheet needed). */
  private redrawPreview() {
    const tex = this.textures.get('cc_prev') as Phaser.Textures.CanvasTexture, ctx = tex.getContext();
    const look = withDefaults({ ...this.look }), H = figureHeight(this.heightIn / 12), yaw = VIEWS[this.view], idle = CLIP.idle;
    const kit = this.step >= 4 ? { ...this.jersey, number: this.number } : casualKit(this.look, this.teeShorts); // in your jersey from the number step on
    ctx.clearRect(0, 0, FRAME_W * 4, FRAME_H);
    for (let f = 0; f < 4; f++) {
      ctx.save(); ctx.beginPath(); ctx.rect(f * FRAME_W, 0, FRAME_W, FRAME_H); ctx.clip();
      drawAngled(ctx, f * FRAME_W, 0, sampleClip(idle, frameTime(idle, f)), H, look, kit, false, yaw);
      ctx.restore();
      crispenRect(ctx, f * FRAME_W, 0, FRAME_W, FRAME_H);
    }
    tex.refresh();
  }

  private refresh() {
    this.tabs.forEach((t, i) => t.setColor(i === this.step ? '#ffe680' : i < this.step ? '#bff58a' : '#8892b0'));
    const g = this.g.clear();
    g.fillStyle(0x0c0a1c, 0.82).fillRoundedRect(640, 84, 600, 576, 12); g.lineStyle(2, 0x9a6ae0, 1).strokeRoundedRect(640, 84, 600, 576, 12);
    for (const t of this.rowTexts) t.setText('').setFontSize(18);
    for (const t of this.keyTexts) t.setVisible(false);
    this.body.setText(''); this.big.setText('');
    const st = STARTER_CORE[this.pos], [lo, hi] = HEIGHT_RANGE[this.pos];
    const name = `${cleanName(this.first)} ${cleanName(this.last)}`.trim();
    const statBars = (y0: number) => CORE_STATS.forEach((s, i) => {
      const v = st[s], y = y0 + i * 30;
      this.rowTexts[i].setText(`${s[0].toUpperCase()}${s.slice(1)}`.padEnd(12) + String(v)).setPosition(684, y - 4).setColor('#e8ecff');
      g.fillStyle(0x1c1830, 1).fillRoundedRect(900, y, 300, 14, 7);
      g.fillStyle(STAT_COL[s], 1).fillRoundedRect(900, y, Math.max(14, 300 * (v - 25) / 50), 14, 7);
      g.fillStyle(0xffffff, 0.25).fillRect(900 + 300 * 15 / 50, y - 2, 2, 18); // the 40 baseline
    });
    if (this.step === 0) {
      this.head.setText('YOUR NAME');
      const caret = Math.floor(this.time.now / 450) % 2 === 0 ? '_' : ' ';
      ['FIRST', 'LAST'].forEach((lbl, i) => {
        const on = this.field === i, y = 150 + i * 66, val = i === 0 ? this.first : this.last;
        g.fillStyle(on ? 0x2a1f4a : 0x16122a, 1).fillRoundedRect(684, y, 520, 46, 8);
        g.lineStyle(2, on ? 0xffe680 : 0x4a3e6a, 1).strokeRoundedRect(684, y, 520, 46, 8);
        this.rowTexts[i].setText(`${lbl.padEnd(7)}${val}${on ? caret : ''}`).setPosition(700, y + 12).setColor(on ? '#ffe680' : '#e8ecff').setFontSize(20);
      });
      // the on-screen keyboard (controller): highlight the cursor key
      GRID.forEach((k, i) => {
        const col = i % GRID_COLS, rw = Math.floor(i / GRID_COLS), wide = k.length > 1, x = 690 + col * 51, y = 310 + rw * 50;
        const on = i === this.gi;
        g.fillStyle(on ? 0x9a6ae0 : 0x1c1830, 1).fillRoundedRect(x, y, wide ? 47 : 45, 42, 6);
        this.keyTexts[i].setVisible(true).setPosition(x + (wide ? 23 : 22), y + 21).setColor(on ? '#ffffff' : k === 'DONE' && !this.nameOk() ? '#5a6078' : '#e8ecff');
      });
      this.rowTexts[2].setText(this.nameOk() ? '' : 'Enter your first and last name').setPosition(684, 528).setColor('#ff9a8a').setFontSize(15);
      this.help.setText('type your name (Tab / △ switch, Enter next)   ·   controller: ✕ letter  □ delete  R1 random  Options done   ○ back');
    } else if (this.step === 1) {
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
    } else if (this.step === 2) {
      this.head.setText(`◀  ${POS_NAMES[this.pos]} (${this.pos})  ▶`);
      this.body.setText(`${POS_BLURB[this.pos]}\nHeight ${fmtHeight(lo)} – ${fmtHeight(hi)}\n\nStarter skills (40 is the floor):`);
      statBars(330);
      // round 60f: the two perks this position starts with
      this.rowTexts[13].setText(`Starter perks: ${STARTER_PERKS[this.pos].map((id) => NODES[id]?.name ?? id).join(' + ')}`).setPosition(684, 478).setColor('#ffe680').setFontSize(16);
      POSITIONS.forEach((p, i) => { const x = 690 + i * 104; g.fillStyle(p === this.pos ? 0x9a6ae0 : 0x2a2244, 1).fillRoundedRect(x, 520, 90, 44, 8); });
      POSITIONS.forEach((p, i) => this.rowTexts[8 + i].setText(p).setPosition(690 + i * 104 + 45 - p.length * 6, 530).setColor(p === this.pos ? '#ffffff' : '#8892b0'));
      this.help.setText('←→ position   ✕ next: height   ○ back');
    } else if (this.step === 3) {
      this.head.setText(`HEIGHT  ◀  ${fmtHeight(this.heightIn)}  ▶`);
      this.body.setText(`${POS_NAMES[this.pos]}s here are ${fmtHeight(lo)} to ${fmtHeight(hi)}.\nTaller: dunks come easier and you contest and block more. Shorter: lower to the floor on the dribble.`);
      const x0 = 700, w = 480, k = (this.heightIn - lo) / Math.max(1, hi - lo);
      g.fillStyle(0x1c1830, 1).fillRoundedRect(x0, 330, w, 16, 8); g.fillStyle(0x9a6ae0, 1).fillRoundedRect(x0, 330, Math.max(16, w * k), 16, 8);
      for (let h = lo; h <= hi; h++) g.fillStyle(0xffffff, 0.5).fillRect(x0 + w * (h - lo) / Math.max(1, hi - lo) - 1, 352, 2, 8);
      this.rowTexts[0].setText(fmtHeight(lo)).setPosition(x0 - 10, 366).setColor('#8892b0');
      this.rowTexts[1].setText(fmtHeight(hi)).setPosition(x0 + w - 30, 366).setColor('#8892b0');
      this.help.setText('←→ height   ✕ next: number   ○ back');
    } else if (this.step === 4) {
      this.head.setText('JERSEY NUMBER');
      this.big.setText(`◀ ${this.number} ▶`).setPosition(940, 300);
      this.body.setText('Any number from 0 to 99.');
      this.rowTexts[0].setText(this.numNote).setPosition(684, 400).setColor('#ff9a8a').setFontSize(16);
      this.help.setText('←→ ±1   ↑↓ ±10   ✕ next   ○ back');
    } else {
      this.head.setText('READY?');
      this.body.setText(`${name.toUpperCase()}  ·  #${this.number}\n${POS_NAMES[this.pos]} · ${fmtHeight(this.heightIn)}\n\nYour starter skills:`);
      statBars(270);
      this.rowTexts[8].setText('✕  START YOUR CAREER').setPosition(760, 490).setColor('#ffe680').setFontSize(26);
      this.help.setText('✕ start   ○ back');
    }
  }

  update(t: number) {
    const inp = this.inp; inp.poll();
    if (inp.pressed('dev')) (window as any).__toggleDev?.();
    this.preview.setFrame(Math.floor(t / 300) % 4);
    if (this.leaving) return;
    // keys typed this frame (letters, Enter, Tab, Backspace on the name step) were text, not buttons
    if (this.typedFrame === this.game.loop.frame) return;
    if (this.step === 0) this.refresh(); // caret blink
    let lookChanged = false, changed = false;
    const lr = (inp.pressed('right') ? 1 : 0) - (inp.pressed('left') ? 1 : 0);
    const ud = (inp.pressed('down') ? 1 : 0) - (inp.pressed('up') ? 1 : 0);
    if (inp.cancel()) {
      sfx.blip(false);
      if (this.step === 0) { this.leaving = true; this.scene.start('Title'); return; }
      this.step = (this.step - 1) as Step; this.numNote = ''; lookChanged = true;
    } else if (this.step === 0) {
      // controller: the letter grid
      if (lr || ud) {
        const n = GRID.length, cols = GRID_COLS;
        let i = this.gi + lr + ud * cols;
        if (ud && (i < 0 || i >= n)) i = ud > 0 ? this.gi % cols : Math.min(n - 1, (Math.floor((n - 1) / cols)) * cols + (this.gi % cols));
        this.gi = Math.max(0, Math.min(n - 1, (i + n) % n)); changed = true;
      }
      if (inp.pressed('a')) {
        const k = GRID[this.gi];
        if (k === 'DONE') this.next();
        else if (k === 'DEL') this.fieldText = this.fieldText.slice(0, -1);
        else if (k === 'RANDOM') this.randomName();
        else this.typeChar(k === 'SPACE' ? ' ' : k);
        sfx.blip(true); changed = true;
      }
      if (inp.pressed('x')) { this.fieldText = this.fieldText.slice(0, -1); changed = true; }
      if (inp.pressed('y')) { this.field = this.field ? 0 : 1; changed = true; }
      if (inp.pressed('icon')) { this.randomName(); changed = true; }
      if (inp.pressed('start')) this.next();
    } else if (inp.confirm()) { sfx.blip(true); this.next(); return; }
    else if (inp.pressed('y')) { this.view = (this.view + 1) % VIEWS.length; lookChanged = true; }
    else if (this.step === 1) {
      const rows = this.rows();
      if (ud) { this.row = (this.row + ud + rows.length) % rows.length; changed = true; }
      if (lr) { rows[this.row].cycle(lr); lookChanged = true; sfx.blip(true); }
      if (inp.pressed('x')) { const skin = this.look.skin; this.look = randomAppearance(Math.random); if (Math.random() < 0.5) this.look.skin = skin; lookChanged = true; sfx.blip(true); }
    } else if (this.step === 2 && lr) {
      const i = POSITIONS.indexOf(this.pos);
      this.pos = POSITIONS[(i + lr + POSITIONS.length) % POSITIONS.length];
      this.heightIn = this.midHeight(this.pos); lookChanged = true; sfx.blip(true);
    } else if (this.step === 3 && lr) {
      const [lo, hi] = HEIGHT_RANGE[this.pos];
      const h = Math.max(lo, Math.min(hi, this.heightIn + lr));
      if (h !== this.heightIn) { this.heightIn = h; lookChanged = true; sfx.blip(true); }
    } else if (this.step === 4 && (lr || ud)) {
      const d = lr || ud * 10, dir = Math.sign(d);
      const want = (this.number + d + 100) % 100, got = this.freeFrom(want, dir);
      this.numNote = got !== want ? `#${want} is taken by ${this.taken.get(want)}` : '';
      this.number = got; lookChanged = true; sfx.blip(true);
    }
    if (lookChanged) this.redrawPreview();
    if (lookChanged || changed) this.refresh();
  }

  /**
   * Round 60c: on READY, make the career you're about to confirm (not saved yet) and start building the tutorial:
   * its players' sprites are drawn while you read the summary, so the rainy court opens without "Lacing up".
   */
  private candidate: CareerState | null = null;
  private makeCareer(): CareerState {
    const c = createCareer({ firstName: this.first, lastName: this.last, number: this.number, pos: this.pos, heightIn: this.heightIn, appearance: this.look });
    c.story = newStory(c); // round 60: high school, the prologue starts on the rainy court
    return c;
  }
  private prepare() { this.candidate = this.makeCareer(); prepareStory(this, 'tutorial', this.candidate); }

  /** Make the career and walk onto the rainy court (round 60). */
  private finish() {
    this.leaving = true;
    app.career = this.candidate ?? this.makeCareer();
    app.changed();
    sfx.greenChime();
    this.cameras.main.fadeOut(400, 0, 0, 0);
    const [scene, data] = storyScene('tutorial');
    this.time.delayedCall(420, () => this.scene.start(scene, data));
  }
}
