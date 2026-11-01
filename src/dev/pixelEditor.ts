/**
 * Pixel editor for the courtside celebrity cast (dev panel → "Pixel editor", or open the game with ?editor).
 * Edit any of the 4 frames pixel by pixel; edits autosave as a local draft that the game uses right away (this
 * browser only). Under `npm run dev`, "Save to repo" writes src/art/celebs/celeb_NN.png so it can be committed.
 */
import { CELEB_CAST, SHEET_W, SHEET_H, FRAME_NAMES, castSheet, generatedSheet, repoArt, activeDraft, saveDraft, clearDraft, castName, loadDraft, baseId } from '../render/celebArt';
import { CELEB_W, CELEB_H, CELEB_FRAMES } from '../render/celebs';

type Tool = 'pencil' | 'eraser' | 'fill' | 'picker' | 'line';
const TOOLS: [Tool, string, string][] = [['pencil', '✏️ Pencil', 'B'], ['eraser', '🧽 Eraser', 'E'], ['fill', '🪣 Fill', 'G'], ['picker', '💧 Picker', 'I'], ['line', '📏 Line', 'L']];
const CSS = `
#pxed { position: fixed; inset: 0; z-index: 50; background: #0b0a18; color: #dfe6ff; font: 13px/1.35 ui-monospace, Menlo, Consolas, monospace;
  display: grid; grid-template-columns: 150px 1fr 280px; grid-template-rows: auto 1fr; user-select: none; }
#pxed header { grid-column: 1 / 4; display: flex; gap: 8px; align-items: center; padding: 8px 10px; border-bottom: 1px solid #2a3150; flex-wrap: wrap; }
#pxed header h1 { font-size: 15px; margin: 0 10px 0 0; color: #ffcc33; }
#pxed button { background: #1f2742; color: #fff; border: 1px solid #3c4876; border-radius: 4px; padding: 4px 8px; cursor: pointer; font: inherit; }
#pxed button:hover { background: #2d3866; } #pxed button.on { background: #ffcc33; color: #111; border-color: #ffcc33; }
#pxed button:disabled { opacity: 0.4; cursor: default; }
#pxed .cast { overflow-y: auto; border-right: 1px solid #2a3150; padding: 6px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; align-content: start; }
#pxed .cast div { position: relative; background: #2a2150; border: 2px solid transparent; border-radius: 4px; cursor: pointer; text-align: center; padding-top: 2px; }
#pxed .cast div.sel { border-color: #ffcc33; } #pxed .cast canvas { image-rendering: pixelated; width: 48px; height: 120px; }
#pxed .cast span { position: absolute; top: 2px; right: 3px; font-size: 10px; color: #7fffc8; } #pxed .cast b { display: block; font-size: 10px; color: #9fb0e0; font-weight: normal; }
#pxed .stage { overflow: auto; display: flex; align-items: center; justify-content: center; background: repeating-conic-gradient(#1a1830 0 25%, #221f3d 0 50%) 0 0 / 16px 16px; }
#pxed .stage canvas { image-rendering: pixelated; cursor: crosshair; box-shadow: 0 0 0 1px #3c4876; }
#pxed aside { border-left: 1px solid #2a3150; padding: 10px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
#pxed .pal { display: grid; grid-template-columns: repeat(8, 1fr); gap: 3px; } #pxed .pal i { aspect-ratio: 1; border-radius: 3px; cursor: pointer; border: 1px solid #0006; }
#pxed .pal i.cur { outline: 2px solid #fff; } #pxed .note { color: #7884aa; font-size: 11px; } #pxed .status { color: #7fffc8; min-height: 1.3em; }
#pxed .prev { background: #2a2150; border-radius: 4px; padding: 6px; display: flex; gap: 6px; align-items: flex-end; justify-content: center; }
#pxed .prev canvas { image-rendering: pixelated; }
`;

let root: HTMLElement | null = null;

export function openPixelEditor() {
  if (root) return;
  const game = (window as any).__phaser;
  try { game?.loop?.sleep(); } catch { /* not running */ }
  if (!document.getElementById('pxed-css')) { const st = document.createElement('style'); st.id = 'pxed-css'; st.textContent = CSS; document.head.append(st); }
  root = document.createElement('div'); root.id = 'pxed';
  document.body.append(root);
  new Editor(root, () => {
    root?.remove(); root = null;
    try { game?.loop?.wake(); } catch { /* ignore */ }
  });
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, any> = {}, ...kids: (Node | string)[]) => {
  const e = document.createElement(tag); for (const [k, v] of Object.entries(props)) (e as any)[k] = v; e.append(...kids); return e;
};
const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

class Editor {
  idx = 0; frame = 0; tool: Tool = 'pencil'; color = '#ff4fa3'; zoom = 6; grid = true;
  sheet!: HTMLCanvasElement; ctx!: CanvasRenderingContext2D;
  undo: ImageData[] = []; redo: ImageData[] = [];
  view: HTMLCanvasElement; vctx: CanvasRenderingContext2D;
  castEl: HTMLElement; palEl: HTMLElement; prevEl: HTMLElement; statusEl: HTMLElement; frameBtns: HTMLButtonElement[] = []; toolBtns = new Map<Tool, HTMLButtonElement>();
  colorInp: HTMLInputElement; saveBtn: HTMLButtonElement;
  drawing = false; lineFrom: [number, number] | null = null; hover: [number, number] | null = null;
  recent: string[] = [];
  dirty = false;

  constructor(private el: HTMLElement, private close: () => void) {
    const dev = import.meta.env.DEV;
    this.view = h('canvas'); this.vctx = this.view.getContext('2d')!;
    this.castEl = h('div', { className: 'cast' });
    this.palEl = h('div', { className: 'pal' });
    this.prevEl = h('div', { className: 'prev' });
    this.statusEl = h('div', { className: 'status' });
    this.colorInp = h('input', { type: 'color', value: this.color, oninput: () => this.setColor(this.colorInp.value) });
    this.saveBtn = h('button', { textContent: '💾 Save to repo', disabled: !dev, title: dev ? 'Writes src/art/celebs/' : 'Only under npm run dev', onclick: () => this.saveRepo() });
    const header = h('header', {}, h('h1', {}, 'Pixel editor — courtside celebs'));
    FRAME_NAMES.forEach((n, f) => { const b = h('button', { textContent: `${f + 1} ${n}`, onclick: () => this.setFrame(f) }); this.frameBtns.push(b); header.append(b); });
    header.append(h('span', { textContent: ' │ ' }));
    for (const [t, label, key] of TOOLS) { const b = h('button', { textContent: label, title: `${label} (${key})`, onclick: () => this.setTool(t) }); this.toolBtns.set(t, b); header.append(b); }
    header.append(h('span', { textContent: ' │ ' }),
      h('button', { textContent: '↶ Undo', title: 'Ctrl+Z', onclick: () => this.doUndo() }),
      h('button', { textContent: '↷ Redo', title: 'Ctrl+Shift+Z / Ctrl+Y', onclick: () => this.doRedo() }),
      h('button', { textContent: '−', title: 'Zoom out (-)', onclick: () => this.setZoom(this.zoom - 1) }),
      h('button', { textContent: '+', title: 'Zoom in (+)', onclick: () => this.setZoom(this.zoom + 1) }),
      h('button', { textContent: '# Grid', onclick: () => { this.grid = !this.grid; this.render(); } }),
      h('button', { textContent: '✕ Close (Esc)', onclick: () => this.exit() }));
    const aside = h('aside', {},
      h('div', {}, 'Color ', this.colorInp),
      h('div', {}, h('div', { className: 'note' }, 'Colors in this sprite (click to use):'), this.palEl),
      h('div', {}, h('div', { className: 'note' }, 'In-game size:'), this.prevEl),
      h('div', {}, h('button', { textContent: '⧉ Copy frame → all frames', onclick: () => this.copyToAll() })),
      h('div', {}, h('button', { textContent: '⇋ Mirror frame', onclick: () => this.mirror() })),
      h('div', {}, this.saveBtn),
      h('div', {}, h('button', { textContent: '⬇ Download PNG', onclick: () => this.download() })),
      h('div', {}, h('button', { textContent: '↺ Revert to saved', title: 'Drop your local draft', onclick: () => this.revert(false) }), ' ',
        h('button', { textContent: '⟲ Reset to generated', onclick: () => this.revert(true) })),
      this.statusEl,
      h('div', { className: 'note', innerHTML: dev
        ? 'Edits autosave in this browser and show up in the next game. <b>Save to repo</b> writes <code>src/art/celebs/celeb_NN.png</code>: commit + push it and Claude can do the final touches.'
        : 'Edits autosave in this browser and show up in the next game. To send them to Claude, open the editor under <code>npm run dev</code> on your computer and use <b>Save to repo</b> (downloads may be blocked in the hosted link).' }),
      h('div', { className: 'note' }, 'Keys: B pencil · E eraser · G fill · I picker · L line · 1–4 frame · Z/Ctrl+Z undo · +/− zoom · Alt+click = pick color · right-click = erase'));
    const stage = h('div', { className: 'stage' }, this.view);
    el.append(header, this.castEl, stage, aside);
    this.zoom = Math.max(3, Math.min(10, Math.floor((window.innerHeight - 90) / CELEB_H)));
    this.bindCanvas(); this.bindKeys();
    this.buildCast();
    this.load(0);
  }

  // ---------- data ----------
  load(i: number) {
    this.idx = i; this.undo = []; this.redo = []; this.dirty = false;
    this.sheet = castSheet(i, () => { this.afterLoad(); });
    this.ctx = this.sheet.getContext('2d', { willReadFrequently: true })!;
    const d = loadDraft(i);
    this.status(d && d.base !== baseId(i) ? 'Your old draft was drawn on an older version of this celeb (the saved art changed), so it is not used.' : activeDraft(i) ? 'Showing your local draft.' : repoArt(i) ? 'Showing the saved art from the repo.' : 'Showing the generated sprite.');
    this.afterLoad();
  }
  afterLoad() { this.render(); this.buildPalette(); this.markCast(); }
  snapshot() { this.undo.push(this.ctx.getImageData(0, 0, SHEET_W, SHEET_H)); if (this.undo.length > 100) this.undo.shift(); this.redo = []; }
  commit() { this.dirty = true; saveDraft(this.idx, this.sheet.toDataURL('image/png')); this.dropTexture(); this.markCast(); this.buildPalette(); }
  /** Make the next game rebuild this celeb's texture from the new art. */
  dropTexture() { try { const tm = (window as any).__phaser?.textures; const key = `celebcast_${this.idx}`; if (tm?.exists(key)) tm.remove(key); } catch { /* ignore */ } }

  // ---------- tools ----------
  px(x: number, y: number): [number, number, number, number] { const d = this.ctx.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2], d[3]]; }
  inFrame(x: number, y: number) { return x >= this.frame * CELEB_W && x < (this.frame + 1) * CELEB_W && y >= 0 && y < CELEB_H; }
  plot(x: number, y: number, erase: boolean) {
    if (!this.inFrame(x, y)) return;
    if (erase) this.ctx.clearRect(x, y, 1, 1); else { this.ctx.fillStyle = this.color; this.ctx.fillRect(x, y, 1, 1); }
  }
  line(x0: number, y0: number, x1: number, y1: number, erase: boolean) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) { this.plot(x0, y0, erase); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  }
  fill(x: number, y: number) {
    const img = this.ctx.getImageData(0, 0, SHEET_W, SHEET_H), d = img.data;
    const at = (px: number, py: number) => (py * SHEET_W + px) * 4;
    const t = d.slice(at(x, y), at(x, y) + 4);
    const c = this.color.match(/\w\w/g)!.map((v) => parseInt(v, 16));
    if (t[3] === 255 && t[0] === c[0] && t[1] === c[1] && t[2] === c[2]) return;
    const same = (i: number) => d[i] === t[0] && d[i + 1] === t[1] && d[i + 2] === t[2] && d[i + 3] === t[3];
    const x0 = this.frame * CELEB_W, x1 = x0 + CELEB_W;
    const stack: [number, number][] = [[x, y]];
    while (stack.length) {
      const [px, py] = stack.pop()!;
      if (px < x0 || px >= x1 || py < 0 || py >= CELEB_H) continue;
      const i = at(px, py); if (!same(i)) continue;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
    }
    this.ctx.putImageData(img, 0, 0);
  }
  pick(x: number, y: number) { const [r, g, b, a] = this.px(x, y); if (a > 0) this.setColor(hex(r, g, b)); }

  bindCanvas() {
    const cell = (e: MouseEvent): [number, number] => { const r = this.view.getBoundingClientRect(); return [this.frame * CELEB_W + Math.floor((e.clientX - r.left) / this.zoom), Math.floor((e.clientY - r.top) / this.zoom)]; };
    let last: [number, number] | null = null, erase = false;
    this.view.addEventListener('contextmenu', (e) => e.preventDefault());
    this.view.addEventListener('pointerdown', (e) => {
      const [x, y] = cell(e);
      if (!this.inFrame(x, y)) return;
      if (e.altKey || this.tool === 'picker') { this.pick(x, y); return; }
      erase = e.button === 2 || this.tool === 'eraser';
      this.snapshot();
      if (this.tool === 'fill' && !erase) { this.fill(x, y); this.commit(); this.render(); return; }
      if (this.tool === 'line') { this.lineFrom = [x, y]; this.drawing = true; this.view.setPointerCapture(e.pointerId); return; }
      this.drawing = true; last = [x, y]; this.plot(x, y, erase); this.render();
      this.view.setPointerCapture(e.pointerId);
    });
    this.view.addEventListener('pointermove', (e) => {
      const [x, y] = cell(e); this.hover = [x, y];
      if (this.drawing && this.tool !== 'line' && last) { this.line(last[0], last[1], x, y, erase); last = [x, y]; }
      this.render();
    });
    this.view.addEventListener('pointerleave', () => { this.hover = null; this.render(); });
    this.view.addEventListener('pointerup', (e) => {
      if (!this.drawing) return;
      const [x, y] = cell(e);
      if (this.tool === 'line' && this.lineFrom) { this.line(this.lineFrom[0], this.lineFrom[1], Math.max(this.frame * CELEB_W, Math.min((this.frame + 1) * CELEB_W - 1, x)), Math.max(0, Math.min(CELEB_H - 1, y)), erase); this.lineFrom = null; }
      this.drawing = false; last = null; this.commit(); this.render();
    });
  }
  keyHandler = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    e.stopPropagation();
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? this.doRedo() : this.doUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); this.doRedo(); return; }
    if (k === 'escape') this.exit();
    else if (k === 'b') this.setTool('pencil'); else if (k === 'e') this.setTool('eraser'); else if (k === 'g') this.setTool('fill');
    else if (k === 'i') this.setTool('picker'); else if (k === 'l') this.setTool('line'); else if (k === 'z') this.doUndo();
    else if (k === '+' || k === '=') this.setZoom(this.zoom + 1); else if (k === '-') this.setZoom(this.zoom - 1);
    else if (/^[1-4]$/.test(k)) this.setFrame(+k - 1);
  };
  bindKeys() { window.addEventListener('keydown', this.keyHandler, true); }
  exit() { window.removeEventListener('keydown', this.keyHandler, true); this.close(); }

  setTool(t: Tool) { this.tool = t; this.render(); }
  setFrame(f: number) { this.frame = f; this.render(); this.buildPalette(); }
  setZoom(z: number) { this.zoom = Math.max(2, Math.min(14, z)); this.render(); }
  setColor(c: string) { this.color = c; this.colorInp.value = c; this.recent = [c, ...this.recent.filter((x) => x !== c)].slice(0, 8); this.buildPalette(); }
  doUndo() { const s = this.undo.pop(); if (!s) return; this.redo.push(this.ctx.getImageData(0, 0, SHEET_W, SHEET_H)); this.ctx.putImageData(s, 0, 0); this.commit(); this.render(); }
  doRedo() { const s = this.redo.pop(); if (!s) return; this.undo.push(this.ctx.getImageData(0, 0, SHEET_W, SHEET_H)); this.ctx.putImageData(s, 0, 0); this.commit(); this.render(); }
  copyToAll() {
    this.snapshot();
    const src = this.ctx.getImageData(this.frame * CELEB_W, 0, CELEB_W, CELEB_H);
    for (let f = 0; f < CELEB_FRAMES; f++) if (f !== this.frame) this.ctx.putImageData(src, f * CELEB_W, 0);
    this.commit(); this.render(); this.status(`Copied frame ${this.frame + 1} to every frame.`);
  }
  mirror() {
    this.snapshot();
    const tmp = document.createElement('canvas'); tmp.width = CELEB_W; tmp.height = CELEB_H;
    tmp.getContext('2d')!.putImageData(this.ctx.getImageData(this.frame * CELEB_W, 0, CELEB_W, CELEB_H), 0, 0);
    this.ctx.save(); this.ctx.clearRect(this.frame * CELEB_W, 0, CELEB_W, CELEB_H);
    this.ctx.translate((this.frame + 1) * CELEB_W, 0); this.ctx.scale(-1, 1); this.ctx.drawImage(tmp, 0, 0); this.ctx.restore();
    this.commit(); this.render();
  }
  revert(toGenerated: boolean) {
    if (!confirm(toGenerated ? 'Throw away your edits and go back to the generated sprite?' : 'Throw away your local draft?')) return;
    clearDraft(this.idx); this.dropTexture();
    if (toGenerated) {
      // a blank draft-free start from the procedural sprite; saved again as a draft so it overrides repo art locally
      this.snapshot(); this.ctx.clearRect(0, 0, SHEET_W, SHEET_H); this.ctx.drawImage(generatedSheet(this.idx), 0, 0); this.commit(); this.render();
      this.status('Back to the generated sprite (as a draft).');
    } else this.load(this.idx);
  }
  async saveRepo() {
    this.status('Saving…');
    try {
      const r = await fetch('/__dev/save-art', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: castName(this.idx), png: this.sheet.toDataURL('image/png') }) });
      this.status(r.ok ? `Saved src/art/celebs/${castName(this.idx)}.png — commit and push it.` : `Couldn't save (${r.status}).`);
    } catch { this.status("Couldn't save: no dev server. Run the game with npm run dev, or use Download PNG."); }
  }
  download() { const a = document.createElement('a'); a.href = this.sheet.toDataURL('image/png'); a.download = `${castName(this.idx)}.png`; a.click(); }
  status(s: string) { this.statusEl.textContent = s; }

  // ---------- UI ----------
  buildCast() {
    this.castEl.innerHTML = '';
    for (let i = 0; i < CELEB_CAST; i++) {
      const c = h('canvas', { width: CELEB_W, height: CELEB_H });
      const cell = h('div', { onclick: () => this.load(i) }, c, h('span'), h('b', {}, `#${String(i).padStart(2, '0')}`));
      const sheet = castSheet(i, () => this.thumb(c, sheet));
      this.thumb(c, sheet);
      this.castEl.append(cell);
    }
  }
  thumb(c: HTMLCanvasElement, sheet: HTMLCanvasElement) { const x = c.getContext('2d')!; x.clearRect(0, 0, CELEB_W, CELEB_H); x.drawImage(sheet, 0, 0, CELEB_W, CELEB_H, 0, 0, CELEB_W, CELEB_H); }
  markCast() {
    Array.from(this.castEl.children).forEach((cell, i) => {
      cell.classList.toggle('sel', i === this.idx);
      (cell.querySelector('span') as HTMLElement).textContent = activeDraft(i) ? 'draft' : repoArt(i) ? 'saved' : '';
      if (i === this.idx) this.thumb(cell.querySelector('canvas')!, this.sheet);
    });
  }
  buildPalette() {
    const d = this.ctx.getImageData(this.frame * CELEB_W, 0, CELEB_W, CELEB_H).data;
    const count = new Map<string, number>();
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { const k = hex(d[i], d[i + 1], d[i + 2]); count.set(k, (count.get(k) ?? 0) + 1); }
    const cols = [...new Set([...this.recent, ...[...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)])].slice(0, 48);
    this.palEl.innerHTML = '';
    for (const c of cols) this.palEl.append(h('i', { className: c === this.color ? 'cur' : '', title: c, style: `background:${c}`, onclick: () => this.setColor(c) }));
  }
  render() {
    const z = this.zoom, W = CELEB_W * z, H = CELEB_H * z, v = this.vctx;
    if (this.view.width !== W || this.view.height !== H) { this.view.width = W; this.view.height = H; }
    v.imageSmoothingEnabled = false;
    v.clearRect(0, 0, W, H);
    v.drawImage(this.sheet, this.frame * CELEB_W, 0, CELEB_W, CELEB_H, 0, 0, W, H);
    if (this.grid && z >= 4) {
      v.strokeStyle = 'rgba(255,255,255,0.08)'; v.lineWidth = 1; v.beginPath();
      for (let x = 0; x <= CELEB_W; x++) { v.moveTo(x * z + 0.5, 0); v.lineTo(x * z + 0.5, H); }
      for (let y = 0; y <= CELEB_H; y++) { v.moveTo(0, y * z + 0.5); v.lineTo(W, y * z + 0.5); }
      v.stroke();
    }
    if (this.hover && this.inFrame(...this.hover)) {
      const hx = (this.hover[0] - this.frame * CELEB_W) * z, hy = this.hover[1] * z;
      v.strokeStyle = '#ffcc33'; v.lineWidth = 2; v.strokeRect(hx + 1, hy + 1, z - 2, z - 2);
      if (this.lineFrom) { v.strokeStyle = this.color; v.beginPath(); v.moveTo((this.lineFrom[0] - this.frame * CELEB_W + 0.5) * z, (this.lineFrom[1] + 0.5) * z); v.lineTo(hx + z / 2, hy + z / 2); v.stroke(); }
    }
    this.frameBtns.forEach((b, f) => b.classList.toggle('on', f === this.frame));
    for (const [t, b] of this.toolBtns) b.classList.toggle('on', t === this.tool);
    // in-game size preview of all four frames (celebs are drawn at ~1.09x of art pixels at 1920x1080)
    this.prevEl.innerHTML = '';
    for (let f = 0; f < CELEB_FRAMES; f++) {
      const c = h('canvas', { width: CELEB_W, height: CELEB_H }); c.style.width = `${CELEB_W * 1.09}px`; c.style.height = `${CELEB_H * 1.09}px`;
      if (f === this.frame) c.style.outline = '1px solid #ffcc33';
      c.getContext('2d')!.drawImage(this.sheet, f * CELEB_W, 0, CELEB_W, CELEB_H, 0, 0, CELEB_W, CELEB_H);
      this.prevEl.append(c);
    }
  }
}
