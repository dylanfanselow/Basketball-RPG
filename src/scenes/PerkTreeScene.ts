import Phaser from 'phaser';
import { InputMapper } from '../input/input';
import { FONT, COL } from './ui';
import { app } from '../state';
import { TREES, TreeNode } from '../sim/data';
import { canUnlock, unlock } from '../career/skilltree';

const AREA = { x: 120, y: 150, w: 760, h: 520 };

export class PerkTreeScene extends Phaser.Scene {
  inp!: InputMapper; treeIdx = 0; sel = 0; back = 'Hub';
  g!: Phaser.GameObjects.Graphics; tabs!: Phaser.GameObjects.Text; info!: Phaser.GameObjects.Text; header!: Phaser.GameObjects.Text;
  names: Phaser.GameObjects.Text[] = [];
  stars: { x: number; y: number; tw: number }[] = [];
  constructor() { super('PerkTree'); }
  init(d: { back?: string }) { this.back = d.back ?? 'Hub'; }
  create() {
    this.cameras.main.setBackgroundColor('#05060d');
    this.inp = new InputMapper(this);
    for (let i = 0; i < 160; i++) this.stars.push({ x: Math.random() * 1280, y: Math.random() * 720, tw: Math.random() * 6 });
    this.g = this.add.graphics();
    this.header = this.add.text(40, 20, '', { fontFamily: FONT, fontSize: '30px', color: COL.accent, fontStyle: 'bold' });
    this.tabs = this.add.text(40, 70, '', { fontFamily: FONT, fontSize: '14px', color: COL.text });
    this.info = this.add.text(910, 150, '', { fontFamily: FONT, fontSize: '15px', color: COL.text, wordWrap: { width: 340 }, lineSpacing: 5 });
    this.add.text(40, 690, 'L1/R1 or Q/E: switch tree   Stick/WASD: select   ✕/Enter: unlock   ○/Esc: back   (mouse works too)', { fontFamily: FONT, fontSize: '13px', color: COL.dim });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const n = this.nodeAt(p.x, p.y);
      if (n >= 0) { if (n === this.sel) this.tryUnlock(); else this.sel = n; }
      if (p.y < 100 && p.y > 64) { const i = Math.floor((p.x - 40) / 126); if (i >= 0 && i < TREES.length) { this.treeIdx = i; this.sel = 0; } }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { const n = this.nodeAt(p.x, p.y); if (n >= 0) this.sel = n; });
  }
  get tree() { return TREES[this.treeIdx]; }
  pos(n: TreeNode) { return { x: AREA.x + (n.x / 100) * AREA.w, y: AREA.y + (n.y / 100) * AREA.h }; }
  nodeAt(x: number, y: number) { return this.tree.nodes.findIndex((n) => { const p = this.pos(n); return Math.hypot(p.x - x, p.y - y) < 22; }); }
  tryUnlock() {
    const n = this.tree.nodes[this.sel];
    if (unlock(app.career, n.id)) { app.changed(); this.cameras.main.flash(150, 255, 220, 120); }
    else this.cameras.main.shake(100, 0.004);
  }
  navigate(dx: number, dy: number) {
    const cur = this.pos(this.tree.nodes[this.sel]);
    let best = -1, bs = 1e9;
    this.tree.nodes.forEach((n, i) => {
      if (i === this.sel) return;
      const p = this.pos(n); const vx = p.x - cur.x, vy = p.y - cur.y;
      const along = vx * dx + vy * dy; if (along <= 4) return;
      const lat = Math.abs(vx * dy - vy * dx);
      const s = along + lat * 2.2;
      if (s < bs) { bs = s; best = i; }
    });
    if (best >= 0) this.sel = best;
  }
  update(t: number) {
    const inp = this.inp; inp.poll();
    if (inp.pressed('dev')) (window as any).__toggleDev?.();
    if (inp.pressed('rb')) { this.treeIdx = (this.treeIdx + 1) % TREES.length; this.sel = 0; }
    if (inp.pressed('lb')) { this.treeIdx = (this.treeIdx + TREES.length - 1) % TREES.length; this.sel = 0; }
    if (inp.pressed('up')) this.navigate(0, -1);
    if (inp.pressed('down')) this.navigate(0, 1);
    if (inp.pressed('left')) this.navigate(-1, 0);
    if (inp.pressed('right')) this.navigate(1, 0);
    if (inp.confirm()) this.tryUnlock();
    if (inp.cancel()) { this.scene.start(this.back); return; }
    this.draw(t);
  }
  draw(t: number) {
    const c = app.career, tree = this.tree, g = this.g;
    g.clear();
    for (const s of this.stars) { g.fillStyle(0xffffff, 0.25 + 0.25 * Math.sin(t / 700 + s.tw)); g.fillRect(s.x, s.y, 2, 2); }
    const col = Phaser.Display.Color.HexStringToColor(tree.color).color;
    this.header.setText(`${tree.name.toUpperCase()}   ·   perk points: ${c.perkPoints}`);
    const SHORT: Record<string, string> = { perimeter: 'Perimeter D', interior: 'Post D / Reb' };
    this.tabs.setText(TREES.map((tr, i) => { const n = SHORT[tr.id] ?? tr.name; return (i === this.treeIdx ? `[${n}]` : ` ${n} `).padEnd(15); }).join(''));
    // constellation lines
    for (const n of tree.nodes) for (const pr of n.prereqs) {
      const a = this.pos(n), b = this.pos(tree.nodes.find((m) => m.id === pr)!);
      const lit = c.nodes.includes(pr) && c.nodes.includes(n.id);
      g.lineStyle(lit ? 3 : 2, lit ? col : 0x44506e, lit ? 0.95 : 0.6); g.lineBetween(a.x, a.y, b.x, b.y);
    }
    for (const tx of this.names) tx.destroy();
    this.names = [];
    tree.nodes.forEach((n, i) => {
      const p = this.pos(n);
      const owned = c.nodes.includes(n.id);
      const can = canUnlock(c, n.id).ok;
      const r = n.type === 'passive' ? 9 : 13;
      if (owned) { g.fillStyle(col, 0.25); g.fillCircle(p.x, p.y, r + 10 + Math.sin(t / 300 + i) * 2); }
      g.fillStyle(owned ? col : can ? 0xffffff : 0x3a4260, 1);
      if (n.type === 'passive') g.fillCircle(p.x, p.y, r);
      else { g.fillPoints([new Phaser.Math.Vector2(p.x, p.y - r), new Phaser.Math.Vector2(p.x + r, p.y), new Phaser.Math.Vector2(p.x, p.y + r), new Phaser.Math.Vector2(p.x - r, p.y)], true); }
      if (i === this.sel) { g.lineStyle(2, 0xffcc33, 1); g.strokeCircle(p.x, p.y, r + 7); }
      this.names.push(this.add.text(p.x, p.y + r + 6, n.name, { fontFamily: FONT, fontSize: '12px', color: owned ? '#ffffff' : can ? '#d8def0' : '#68708c' }).setOrigin(0.5, 0));
    });
    const n = tree.nodes[this.sel];
    const chk = canUnlock(c, n.id);
    const owned = c.nodes.includes(n.id);
    this.info.setText([
      tree.desc, '', `▶ ${n.name}`, `${n.type === 'passive' ? '● Passive' : n.type === 'move' ? '◆ Move' : '◆ Ability'}   cost ${n.cost}`, '', n.desc, '',
      owned ? '✓ UNLOCKED' : chk.ok ? 'Press ✕ to unlock' : `✗ ${chk.reason}`,
      '', '● passive   ◆ move / ability',
    ].join('\n'));
  }
}
