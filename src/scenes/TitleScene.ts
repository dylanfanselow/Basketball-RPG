import Phaser from 'phaser';
import { InputMapper } from '../input/input';
import { FONT, HI_RES } from './ui';
import { app } from '../state';
import { sfx } from '../audio/sfx';
import { loadCareer } from '../career/career';
import { storyScene } from './setup';
import { drawCourt, drawHoops, VIEW_W, VIEW_H, WORLD_W } from '../render/view';
import { Crowd } from '../render/crowd';
import { addSchoolCourt } from '../render/schoolArt';
import { buildRoomArt, buildGlow, LAMP_ART, ART_W } from '../render/roomArt';
import { syOf, pieceDepthFt } from '../world/apartment';
import { TEAMS } from '../sim/data';

const ART = 1 / 0.75;
type BgId = 'school' | 'home' | 'arena';
interface Item { id: 'new' | 'load' | 'settings'; label: string; y: number; bg: BgId }

/**
 * Round 58: the real main menu (the owner's layout): NEW GAME and LOAD SAVE top left, SETTINGS bottom left, the
 * title top right. Behind it, the game itself under a gradient: the rainy school court while NEW GAME is selected,
 * the apartment on LOAD SAVE, the arena on SETTINGS (cross-fading as you move). Each background lives on its own
 * camera (they all use the game's own coordinates); the menu draws on a camera of its own on top.
 * The old menu with every mode is the dev menu (Settings → Dev menu, or the dev panel).
 */
export class TitleScene extends Phaser.Scene {
  inp!: InputMapper;
  private cams = {} as Record<BgId, Phaser.Cameras.Scene2D.Camera>;
  private order: BgId[] = ['arena', 'school', 'home'];
  private ui: Phaser.GameObjects.GameObject[] = [];
  private items: Item[] = [];
  private texts: Phaser.GameObjects.Text[] = [];
  private idx = 0;
  private bg: BgId = 'school';
  private hint!: Phaser.GameObjects.Text;
  private marker!: Phaser.GameObjects.Graphics;
  private tint!: Phaser.GameObjects.Graphics;
  private crowd!: Crowd;
  private rainG!: Phaser.GameObjects.Graphics;
  private flash!: Phaser.GameObjects.Rectangle;
  private drops: { x: number; y: number; len: number; sp: number }[] = [];
  private nextFlash = 0;
  private hasSave = false;
  /** 'menu' | 'confirm' (new game over a save) | 'settings' */
  private mode: 'menu' | 'confirm' | 'settings' = 'menu';
  private panel!: { g: Phaser.GameObjects.Graphics; title: Phaser.GameObjects.Text; body: Phaser.GameObjects.Text };
  private setIdx = 0;
  private leaving = false;

  constructor() { super('Title'); }

  create() {
    this.leaving = false; this.mode = 'menu'; this.idx = 0; this.setIdx = 0; this.ui = []; this.texts = []; this.drops = [];
    this.inp = new InputMapper(this);
    this.hasSave = !!loadCareer();
    const grab = (fn: () => void) => { const before = new Set(this.children.list); fn(); return this.children.list.filter((o) => !before.has(o)); };

    // --- the three backgrounds, built in their own game coordinates
    const arena = grab(() => {
      const [a, b] = [TEAMS.find((t) => t.id === 'LAL') ?? TEAMS[0], TEAMS.find((t) => t.id === 'BOS') ?? TEAMS[1]];
      drawCourt(this, [a.colors[0], b.colors[0]]);
      drawHoops(this, 'arena');
      this.crowd = new Crowd(this, a.colors, b.colors, true, a.seed);
    });
    const school = grab(() => {
      addSchoolCourt(this, 'rain');
      drawHoops(this, 'school');
      this.rainG = this.add.graphics().setScrollFactor(0).setDepth(4450);
      this.flash = this.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W * 2, VIEW_H * 2, 0xdfe8ff, 1).setScrollFactor(0).setDepth(4440).setAlpha(0);
      this.drops = Array.from({ length: 170 }, () => ({ x: Math.random() * (VIEW_W + 200), y: Math.random() * VIEW_H, len: 10 + Math.random() * 16, sp: 900 + Math.random() * 500 }));
    });
    const home = grab(() => {
      const art = buildRoomArt(this.textures);
      this.add.image(0, 0, art.bg).setOrigin(0, 0).setScale(ART).setDepth(-1000);
      for (const p of art.pieces) {
        const img = p.frames > 1 ? this.add.sprite(p.x * ART, p.y * ART, p.key, 0) : this.add.image(p.x * ART, p.y * ART, p.key);
        img.setOrigin(0, 0).setScale(ART).setDepth(syOf(p.piece ? pieceDepthFt(p.piece) : p.depthFt));
      }
      this.add.image(LAMP_ART.x * ART, LAMP_ART.y * ART, buildGlow(this.textures)).setScale(ART * 2).setBlendMode(Phaser.BlendModes.ADD).setDepth(5000).setAlpha(0.8);
      void ART_W;
    });

    // --- the menu (its own camera, on top)
    this.ui = grab(() => this.buildMenu());

    // cameras: main = arena, then school, home, and the menu last (drawn on top)
    const groups: Record<BgId, Phaser.GameObjects.GameObject[]> = { arena, school, home };
    this.cams.arena = this.cameras.main;
    this.cams.school = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.cams.home = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    const uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    for (const id of this.order) {
      const cam = this.cams[id];
      cam.setZoom(HI_RES).setOrigin(0, 0).setBackgroundColor(id === 'school' ? '#0a0e1a' : id === 'home' ? '#1a120c' : '#0d0f1a');
      cam.ignore(this.ui);
      for (const other of this.order) if (other !== id) cam.ignore(groups[other]);
    }
    uiCam.setZoom(HI_RES).setOrigin(0, 0);
    uiCam.ignore([...arena, ...school, ...home]);
    this.cams.school.setScroll(60, 0);
    this.cams.home.setScroll(0, 0);
    this.cams.arena.setScroll((WORLD_W - VIEW_W) / 2, 0);
    for (const id of this.order) this.cams[id].setVisible(id === this.bg).setAlpha(1);
    this.select(0, true);
    this.events.once('shutdown', () => { sfx.rain(false); sfx.setArena(false); });
  }

  /** The menu: options on the left (the owner's layout), title top right, gradients over the game. */
  private buildMenu() {
    // gradient filter: dark on the left behind the options fading out, a soft vignette, and a colour wash per background
    const g = this.add.graphics().setScrollFactor(0).setDepth(9000);
    g.fillGradientStyle(0x05060d, 0x05060d, 0x05060d, 0x05060d, 0.88, 0, 0.88, 0); g.fillRect(0, 0, VIEW_W * 0.55, VIEW_H);
    g.fillGradientStyle(0x05060d, 0x05060d, 0x05060d, 0x05060d, 0, 0, 0.75, 0.75); g.fillRect(0, VIEW_H * 0.6, VIEW_W, VIEW_H * 0.4);
    g.fillGradientStyle(0x05060d, 0x05060d, 0x05060d, 0x05060d, 0, 0.7, 0, 0); g.fillRect(VIEW_W * 0.45, 0, VIEW_W * 0.55, VIEW_H * 0.3);
    this.tint = this.add.graphics().setScrollFactor(0).setDepth(9001);
    // title, top right
    this.add.text(VIEW_W - 60, 52, 'BASKETBALL RPG', { fontFamily: FONT, fontSize: '54px', color: '#ffffff', fontStyle: 'bold', stroke: '#140a22', strokeThickness: 8, shadow: { offsetX: 0, offsetY: 4, color: '#000', blur: 0, fill: true } }).setOrigin(1, 0).setScrollFactor(0).setDepth(9010);
    this.add.text(VIEW_W - 64, 116, 'a career on and off the court', { fontFamily: FONT, fontSize: '16px', color: '#cdb8ff', fontStyle: 'bold' }).setOrigin(1, 0).setScrollFactor(0).setDepth(9010);
    const c = app.career;
    this.items = [
      { id: 'new', label: 'NEW GAME', y: 118, bg: 'school' },
      { id: 'load', label: 'LOAD SAVE', y: 214, bg: 'home' },
      { id: 'settings', label: 'SETTINGS', y: 588, bg: 'arena' },
    ];
    this.marker = this.add.graphics().setScrollFactor(0).setDepth(9009);
    this.texts = this.items.map((it, i) => {
      const t = this.add.text(92, it.y, it.label, { fontFamily: FONT, fontSize: '40px', color: '#ffffff', fontStyle: 'bold', stroke: '#05060d', strokeThickness: 6 }).setScrollFactor(0).setDepth(9010).setInteractive({ useHandCursor: true });
      t.on('pointerover', () => { if (this.mode === 'menu' && this.enabled(i)) this.select(i); });
      t.on('pointerdown', () => { if (this.mode === 'menu' && this.enabled(i)) { this.select(i); this.activate(); } });
      return t;
    });
    this.hint = this.add.text(96, 0, '', { fontFamily: FONT, fontSize: '15px', color: '#e8ecff', fontStyle: 'bold', stroke: '#05060d', strokeThickness: 4 }).setScrollFactor(0).setDepth(9010);
    void c;
    this.add.text(VIEW_W - 60, VIEW_H - 40, '✕ select   ↑↓ move', { fontFamily: FONT, fontSize: '14px', color: '#8892b0' }).setOrigin(1, 0).setScrollFactor(0).setDepth(9010);
    // the panel used by the new-game confirm and by settings
    const pg = this.add.graphics().setScrollFactor(0).setDepth(9020).setVisible(false);
    const title = this.add.text(VIEW_W / 2, 200, '', { fontFamily: FONT, fontSize: '28px', color: '#ffe680', fontStyle: 'bold', stroke: '#05060d', strokeThickness: 6 }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(9021).setVisible(false);
    const body = this.add.text(VIEW_W / 2, 250, '', { fontFamily: FONT, fontSize: '19px', color: '#ffffff', fontStyle: 'bold', align: 'left', lineSpacing: 10, stroke: '#05060d', strokeThickness: 4 }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(9021).setVisible(false);
    this.panel = { g: pg, title, body };
  }

  private enabled(i: number) { return this.items[i].id !== 'load' || this.hasSave; }

  private select(i: number, instant = false) {
    this.idx = i;
    const it = this.items[i], c = app.career;
    this.texts.forEach((t, k) => {
      const on = k === i, ok = this.enabled(k);
      t.setColor(!ok ? '#5a6078' : on ? '#ffe680' : '#ffffff').setFontSize(on ? 46 : 38).setX(on ? 112 : 92);
    });
    const hints: Record<Item['id'], string> = {
      new: 'Create your player and start a career',
      load: this.hasSave ? `Continue: Day ${c.life.day} · Lv ${c.level} · ${c.name}` : 'No save yet',
      settings: 'Sound, game length, fullscreen, dev tools',
    };
    this.hint.setText(hints[it.id]).setY(it.y + 56);
    this.marker.clear().fillStyle(0xffe680, 1).fillTriangle(84, it.y + 14, 84, it.y + 38, 100, it.y + 26);
    this.showBg(it.bg, instant);
  }

  /** Cross-fade to a background (the higher camera fades in, or the old one fades out over the new one). */
  private showBg(id: BgId, instant: boolean) {
    const old = this.bg; this.bg = id;
    // ambience: rain on the school court, the arena's murmur
    sfx.rain(id === 'school'); sfx.setArena(id === 'arena');
    const wash: Record<BgId, [number, number]> = { school: [0x1a3a8a, 0x3a1a6a], home: [0x8a4a1a, 0x5a1a3a], arena: [0x4a1a8a, 0x8a5a1a] };
    const [c1, c2] = wash[id];
    this.tint.clear().fillGradientStyle(c1, c2, c1, c2, 0.28, 0.12, 0.2, 0.3).fillRect(0, 0, VIEW_W, VIEW_H);
    if (old === id || instant) { for (const k of this.order) this.cams[k].setVisible(k === id).setAlpha(1); return; }
    const a = this.cams[old], b = this.cams[id];
    this.tweens.killTweensOf(a); this.tweens.killTweensOf(b);
    for (const k of this.order) if (k !== old && k !== id) this.cams[k].setVisible(false);
    if (this.order.indexOf(id) > this.order.indexOf(old)) {
      b.setVisible(true).setAlpha(0);
      this.tweens.add({ targets: b, alpha: 1, duration: 380, onComplete: () => a.setVisible(false) });
    } else {
      b.setVisible(true).setAlpha(1); a.setVisible(true).setAlpha(1);
      this.tweens.add({ targets: a, alpha: 0, duration: 380, onComplete: () => a.setVisible(false).setAlpha(1) });
    }
  }

  private activate() {
    const it = this.items[this.idx];
    sfx.blip(true);
    if (it.id === 'new') { if (this.hasSave) this.openConfirm(); else this.startNew(); }
    else if (it.id === 'load') { const [scene, data] = storyScene(app.career.story?.stage ?? 'done'); this.go(scene, data); } // round 60: pick up the story where it is
    else this.openSettings();
  }

  /** Round 59: New Game goes to the character builder (the career is made there). */
  private startNew() { this.go('Create'); }

  private go(scene: string, data?: object) {
    if (this.leaving) return;
    this.leaving = true;
    for (const k of this.order) this.cams[k].fadeOut(350, 0, 0, 0);
    this.time.delayedCall(380, () => this.scene.start(scene, data));
  }

  // ------------------------------------------------------------ panels
  private showPanel(title: string, w: number, h: number) {
    const { g } = this.panel, x = VIEW_W / 2 - w / 2, y = 180;
    g.clear().setVisible(true);
    g.fillStyle(0x000000, 0.55).fillRect(0, 0, VIEW_W, VIEW_H);
    g.fillStyle(0x140a22, 0.95).fillRoundedRect(x, y, w, h, 12);
    g.lineStyle(3, 0x9a6ae0, 1).strokeRoundedRect(x, y, w, h, 12);
    this.panel.title.setText(title).setVisible(true).setY(y + 18);
    this.panel.body.setVisible(true).setY(y + 70);
  }
  private hidePanel() { this.panel.g.setVisible(false); this.panel.title.setVisible(false); this.panel.body.setVisible(false); this.mode = 'menu'; }

  private openConfirm() {
    const c = app.career;
    this.mode = 'confirm';
    this.showPanel('START A NEW CAREER?', 620, 200);
    this.panel.body.setText(`Your save (Day ${c.life.day}, Lv ${c.level}) will be replaced.\n\n      ✕ Yes, start over      ○ No`).setAlign('center');
  }

  private settingsRows(): { label: string; value: () => string; change?: (d: number) => void; act?: () => void }[] {
    const s = sfx.settings, pct = (v: number) => `${Math.round(v * 100)}%`;
    const vol = (k: 'master' | 'sfx' | 'crowd' | 'music') => (d: number) => { s[k] = Math.max(0, Math.min(1, Math.round(((s[k] ?? 0.5) + d * 0.1) * 10) / 10)); sfx.applySettings(); };
    const QL = [180, 300, 480, 720];
    return [
      { label: 'Master volume', value: () => pct(s.master), change: vol('master') },
      { label: 'Effects', value: () => pct(s.sfx), change: vol('sfx') },
      { label: 'Crowd', value: () => pct(s.crowd), change: vol('crowd') },
      { label: 'Music', value: () => pct(s.music ?? 0.5), change: vol('music') },
      { label: 'Sound', value: () => (s.muted ? 'Muted' : 'On'), change: () => { sfx.toggleMute(); }, act: () => { sfx.toggleMute(); } },
      { label: 'Quarter length', value: () => `${app.settings.quarterLen / 60} min`, change: (d) => { const i = Math.max(0, Math.min(QL.length - 1, QL.indexOf(app.settings.quarterLen) + d)); app.settings.quarterLen = QL[i < 0 ? 0 : i]; } },
      { label: 'Fullscreen', value: () => (this.scale.isFullscreen ? 'On' : 'Off'), act: () => (window as any).__toggleFullscreen?.() },
      { label: 'Dev menu (every mode)', value: () => '▶', act: () => this.go('Menu') },
      { label: 'Back', value: () => '', act: () => this.hidePanel() },
    ];
  }
  private openSettings() { this.mode = 'settings'; this.setIdx = 0; this.showPanel('SETTINGS', 640, 440); this.panel.body.setAlign('left'); this.drawSettings(); }
  private drawSettings() {
    const rows = this.settingsRows();
    this.panel.body.setText(rows.map((r, i) => `${i === this.setIdx ? '▶' : ' '} ${r.label.padEnd(24)}${r.change ? `◀ ${r.value()} ▶` : r.value()}`).join('\n'));
  }

  // ------------------------------------------------------------ frame
  update(_t: number, dms: number) {
    const inp = this.inp; inp.poll();
    if (inp.pressed('dev')) (window as any).__toggleDev?.();
    if (inp.pressed('mute')) sfx.toggleMute();
    this.animate(dms);
    if (this.leaving) return;
    if (this.mode === 'confirm') {
      if (inp.confirm()) { this.hidePanel(); this.startNew(); }
      else if (inp.cancel()) { sfx.blip(false); this.hidePanel(); }
      return;
    }
    if (this.mode === 'settings') {
      const rows = this.settingsRows();
      if (inp.pressed('down')) { this.setIdx = (this.setIdx + 1) % rows.length; sfx.blip(true); }
      if (inp.pressed('up')) { this.setIdx = (this.setIdx + rows.length - 1) % rows.length; sfx.blip(true); }
      const r = rows[this.setIdx];
      if (r.change && inp.pressed('left')) r.change(-1);
      if (r.change && inp.pressed('right')) r.change(1);
      if (inp.confirm() && r.act) r.act();
      if (inp.cancel()) { sfx.blip(false); this.hidePanel(); return; }
      if (this.mode === 'settings') this.drawSettings();
      return;
    }
    const n = this.items.length;
    const step = (d: number) => { let i = this.idx; do { i = (i + d + n) % n; } while (!this.enabled(i)); if (i !== this.idx) { sfx.blip(true); this.select(i); } };
    if (inp.pressed('down')) step(1);
    if (inp.pressed('up')) step(-1);
    if (inp.confirm()) this.activate();
  }

  /** The backgrounds keep moving: a slow camera drift, the crowd, the rain and the odd lightning flash. */
  private animate(dms: number) {
    const t = this.time.now / 1000, dt = Math.min(0.05, dms / 1000);
    this.cams.arena.setScroll((WORLD_W - VIEW_W) / 2 + Math.sin(t / 9) * 260, 0);
    this.cams.school.setScroll(160 + Math.sin(t / 11) * 140, 0);
    this.cams.home.setScroll(Math.sin(t / 13) * 6, 0);
    if (this.cams.arena.visible) this.crowd.update(this.cams.arena.scrollX, VIEW_W);
    if (this.cams.school.visible) {
      const g = this.rainG; g.clear(); g.lineStyle(1.2, 0xb8c8e0, 0.45);
      for (const d of this.drops) {
        d.y += d.sp * dt; d.x -= d.sp * 0.22 * dt;
        if (d.y > VIEW_H || d.x < -20) { d.y = -d.len - Math.random() * 60; d.x = Math.random() * (VIEW_W + 200); }
        g.lineBetween(d.x, d.y, d.x + d.len * 0.22, d.y - d.len);
      }
      const now = this.time.now;
      if (now > this.nextFlash) {
        this.nextFlash = now + 7000 + Math.random() * 9000;
        this.flash.setAlpha(0.3);
        this.tweens.add({ targets: this.flash, alpha: 0, duration: 90, yoyo: true, repeat: 1, onComplete: () => { this.flash.setAlpha(0.15); this.tweens.add({ targets: this.flash, alpha: 0, duration: 380 }); } });
      }
    }
  }
}
