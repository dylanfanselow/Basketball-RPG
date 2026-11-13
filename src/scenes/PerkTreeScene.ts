import Phaser from 'phaser';
import { InputMapper } from '../input/input';
import { FONT, COL, hiRes } from './ui';
import { app } from '../state';
import { TREES, TreeNode, Tree } from '../sim/data';
import { canUnlock, unlock } from '../career/skilltree';
import { PERK_SHAPES } from './perkShapes';

const AREA = { x: 120, y: 150, w: 760, h: 520 };
const GOLD = 0xffcc33;
const BG = 0x05060d;
/** a color blended toward the background, drawn opaque (so overlapping strokes don't stack up) */
const fade = (c: number, t: number) => {
  const ch = (s: number) => Math.round(((BG >> s) & 255) + (((c >> s) & 255) - ((BG >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

export class PerkTreeScene extends Phaser.Scene {
  inp!: InputMapper; treeIdx = 0; sel = 0; back = 'Hub';
  g!: Phaser.GameObjects.Graphics; tabs!: Phaser.GameObjects.Text; info!: Phaser.GameObjects.Text; header!: Phaser.GameObjects.Text;
  names: Phaser.GameObjects.Text[] = [];
  stars: { x: number; y: number; tw: number }[] = [];
  constructor() { super('PerkTree'); }
  init(d: { back?: string }) { this.back = d.back ?? 'Hub'; }
  create() {
    hiRes(this);
    this.cameras.main.setBackgroundColor('#05060d');
    this.inp = new InputMapper(this);
    for (let i = 0; i < 160; i++) this.stars.push({ x: Math.random() * 1280, y: Math.random() * 720, tw: Math.random() * 6 });
    this.g = this.add.graphics();
    this.header = this.add.text(40, 20, '', { fontFamily: FONT, fontSize: '30px', color: COL.accent, fontStyle: 'bold' });
    this.tabs = this.add.text(40, 70, '', { fontFamily: FONT, fontSize: '14px', color: COL.text });
    this.info = this.add.text(910, 150, '', { fontFamily: FONT, fontSize: '15px', color: COL.text, wordWrap: { width: 340 }, lineSpacing: 5 });
    this.add.text(40, 690, 'L2/R1 or Q/E: switch tree   Stick/WASD: select   ✕/Enter: unlock   ○/L1/Esc: back   (mouse works too)', { fontFamily: FONT, fontSize: '13px', color: COL.dim });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const n = this.nodeAt(p.x, p.y);
      if (n >= 0) { if (n === this.sel) this.tryUnlock(); else this.sel = n; }
      if (p.y < 100 && p.y > 64) { const i = Math.floor((p.x - 40) / 126); if (i >= 0 && i < TREES.length) { this.treeIdx = i; this.sel = 0; } }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { const n = this.nodeAt(p.x, p.y); if (n >= 0) this.sel = n; });
  }
  get tree() { return TREES[this.treeIdx]; }
  /**
   * Round 65: the picture a shaped tree is drawn on (a ball, the court, the key, a brick wall), faint, behind the lines.
   * Round 72: the traced pictures (player, baton, hand) from perkShapes.ts and the valve wheel.
   */
  drawBackdrop(tree: Tree) {
    const g = this.g, X = (x: number) => AREA.x + (x / 100) * AREA.w, Y = (y: number) => AREA.y + (y / 100) * AREA.h;
    const traced = PERK_SHAPES[tree.shape];
    if (traced) {
      const pts = (fl: number[]) => { const out: Phaser.Math.Vector2[] = []; for (let i = 0; i < fl.length; i += 2) out.push(new Phaser.Math.Vector2(X(fl[i]), Y(fl[i + 1]))); return out; };
      for (const part of traced) {
        for (const poly of part.polys) {
          const p = pts(poly);
          g.fillStyle(part.fill, part.alpha ?? 0.13); g.fillPoints(p, true);
          g.lineStyle(2, part.edge, 0.4); g.strokePoints(p, true, true);
        }
        g.lineStyle(2, part.edge, 0.3);
        for (const l of part.lines ?? []) g.strokePoints(pts(l), false, false);
      }
    } else if (tree.shape === 'valve') this.drawValve();
    else if (tree.shape === 'ball') {
      const cx = X(49.5), cy = Y(49), r = 232;
      g.fillStyle(0xe86a1c, 0.13); g.fillCircle(cx, cy, r);
      g.lineStyle(3, 0x2a1408, 0.35); g.strokeCircle(cx, cy, r);
      g.lineBetween(cx - r, cy, cx + r, cy); g.lineBetween(cx, cy - r, cx, cy + r);
      g.beginPath(); g.arc(cx - r * 1.35, cy, r * 1.05, -0.72, 0.72); g.strokePath();
      g.beginPath(); g.arc(cx + r * 1.35, cy, r * 1.05, Math.PI - 0.72, Math.PI + 0.72); g.strokePath();
    } else if (tree.shape === 'court') {
      g.fillStyle(0xc8873e, 0.08); g.fillRect(X(4), Y(2), X(96) - X(4), Y(93) - Y(2));
      g.fillStyle(0x74b9ff, 0.07); g.fillRect(X(38), Y(52), X(62) - X(38), Y(90) - Y(52)); // the lane
      g.lineStyle(2, 0xffffff, 0.14); g.strokeRect(X(38), Y(52), X(62) - X(38), Y(90) - Y(52));
      g.lineStyle(3, 0xffffff, 0.3); g.lineBetween(X(44), Y(84), X(56), Y(84)); // backboard
      g.lineStyle(2, 0xff7a30, 0.45); g.strokeCircle(X(50), Y(80), 9); // rim
    } else if (tree.shape === 'key') {
      g.fillStyle(0x7a3fa0, 0.14); g.fillRect(X(28), Y(40), X(72) - X(28), Y(90) - Y(40));
      g.lineStyle(2, 0xffffff, 0.16); g.strokeRect(X(28), Y(40), X(72) - X(28), Y(90) - Y(40));
      g.beginPath(); g.arc(X(50), Y(40), X(72) - X(50), Math.PI, 0); g.strokePath(); // free-throw circle, top half
      g.lineStyle(3, 0xffffff, 0.3); g.lineBetween(X(44), Y(84), X(56), Y(84));
      g.lineStyle(2, 0xff7a30, 0.45); g.strokeCircle(X(50), Y(80), 9);
    } else if (tree.shape === 'bricks') {
      const bw = (24 / 100) * AREA.w - 6, bh = (24 / 100) * AREA.h - 8;
      for (const n of tree.nodes) {
        const p = this.pos(n);
        g.fillStyle(0x8a3b2a, 0.28); g.fillRect(p.x - bw / 2, p.y - bh / 2, bw, bh);
        g.lineStyle(2, 0xcfc6b8, 0.25); g.strokeRect(p.x - bw / 2, p.y - bh / 2, bw, bh);
      }
    }
  }
  /**
   * Round 72: the Handles valve wheel, after the owner's picture (front on: 8 knobs on the rim, a + of spokes, an inner
   * ring, a diamond hole in the hub). Drawn in pixels so it stays round; the Handles nodes sit on the same radii
   * (outer knobs 215 px, inner ring 118 px, centre at x 50 / y 48 in tree units).
   */
  drawValve() {
    const g = this.g, cx = AREA.x + 0.5 * AREA.w, cy = AREA.y + 0.48 * AREA.h, R = 215, r = 118, RED = 0xd42a2a;
    const at = (rad: number, k: number) => ({ x: cx + Math.sin((k * Math.PI) / 4) * rad, y: cy - Math.cos((k * Math.PI) / 4) * rad });
    // two passes: a lighter edge drawn wider, then the body on top, so every bar gets an outline
    for (const [col, grow] of [[fade(RED, 0.42), 4], [fade(RED, 0.2), 0]] as const) {
      g.lineStyle(22 + grow, col, 1);
      for (let k = 0; k < 8; k++) { const a = at(R, k), b = at(R, k + 1), i = at(r, k); g.lineBetween(a.x, a.y, b.x, b.y); g.lineBetween(i.x, i.y, a.x, a.y); }
      for (let k = 0; k < 8; k += 2) { const i = at(r, k); g.lineBetween(cx, cy, i.x, i.y); }
      g.strokeCircle(cx, cy, r);
      g.fillStyle(col, 1);
      for (let k = 0; k < 8; k++) { const a = at(R, k); g.fillCircle(a.x, a.y, 22 + grow / 2); }
      g.fillCircle(cx, cy, 36 + grow / 2);
    }
    g.fillStyle(BG, 1);
    g.fillPoints([new Phaser.Math.Vector2(cx, cy - 15), new Phaser.Math.Vector2(cx + 15, cy), new Phaser.Math.Vector2(cx, cy + 15), new Phaser.Math.Vector2(cx - 15, cy)], true);
  }
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
    if (inp.pressed('tabNext')) { this.treeIdx = (this.treeIdx + 1) % TREES.length; this.sel = 0; }
    if (inp.pressed('tabPrev')) { this.treeIdx = (this.treeIdx + TREES.length - 1) % TREES.length; this.sel = 0; }
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
    this.tabs.setText(TREES.map((tr, i) => (i === this.treeIdx ? `[${tr.name}]` : ` ${tr.name} `).padEnd(15)).join(''));
    this.drawBackdrop(tree);
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
      const r = n.goat ? 17 : n.type === 'passive' ? 9 : 13;
      if (owned) { g.fillStyle(n.goat ? GOLD : col, 0.25); g.fillCircle(p.x, p.y, r + 10 + Math.sin(t / 300 + i) * 2); }
      if (n.goat) {
        // round 65: GOAT skills are gold stars
        g.fillStyle(owned ? GOLD : can ? 0xfff2c0 : 0x6b5a20, 1);
        g.fillPoints(Array.from({ length: 10 }, (_, k) => { const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.45 : r; return new Phaser.Math.Vector2(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr); }), true);
      } else g.fillStyle(owned ? col : can ? 0xffffff : 0x3a4260, 1);
      if (n.goat) { /* drawn above */ }
      else if (n.type === 'passive') g.fillCircle(p.x, p.y, r);
      else { g.fillPoints([new Phaser.Math.Vector2(p.x, p.y - r), new Phaser.Math.Vector2(p.x + r, p.y), new Phaser.Math.Vector2(p.x, p.y + r), new Phaser.Math.Vector2(p.x - r, p.y)], true); }
      if (i === this.sel) { g.lineStyle(2, 0xffcc33, 1); g.strokeCircle(p.x, p.y, r + 7); }
      const nameCol = n.goat ? (owned || can ? '#ffcc33' : '#b39a4a') : owned ? '#ffffff' : can ? '#e2e7f6' : '#8c94b2';
      const wrap = tree.labelWrap ? { wordWrap: { width: tree.labelWrap }, align: 'center' } : {};
      this.names.push(this.add.text(p.x, n.labelAbove ? p.y - r - 4 : p.y + r + 6, n.name, { fontFamily: FONT, fontSize: '13px', color: nameCol, fontStyle: 'bold', stroke: '#0b0e18', strokeThickness: 3, ...wrap }).setOrigin(0.5, n.labelAbove ? 1 : 0));
    });
    const n = tree.nodes[this.sel];
    const chk = canUnlock(c, n.id);
    const owned = c.nodes.includes(n.id);
    this.info.setText([
      tree.desc, '', `▶ ${n.name}`, `${n.goat ? '★ GOAT skill' : n.type === 'passive' ? '● Passive' : n.type === 'move' ? '◆ Move' : '◆ Ability'}   cost ${n.cost}`, '', n.desc, '',
      owned ? '✓ UNLOCKED' : chk.ok ? 'Press ✕ to unlock' : `✗ ${chk.reason}`,
      '', '● passive   ◆ move / ability   ★ GOAT',
    ].join('\n'));
  }
}
