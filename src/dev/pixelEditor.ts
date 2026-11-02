/**
 * Pixel editor (dev panel → "Pixel editor", or open the game with ?editor). Two modes:
 *  - Celebs: the 16-member courtside cast, 4 frames each (src/art/celebs/celeb_NN.png).
 *  - Face parts: hair (front / back layer), beard, brows, eyes, nose, mouth, side and front views
 *    (src/art/parts/<type>/<variant>_<view>.png, see render/faceParts.ts). Mix and match them per player in the
 *    dev panel's "NBA player looks" and "Save look to rosters.json".
 * Edits autosave as local drafts the game uses right away (this browser only). Under `npm run dev`,
 * "Save to repo" writes the PNGs so they can be committed and pushed.
 */
import { CELEB_CAST, RETIRED_CELEBS, FRAME_NAMES, castSheet, generatedSheet, repoArt, activeDraft, saveDraft, clearDraft, castName, loadDraft, baseId } from '../render/celebArt';
import { CELEB_W, CELEB_H, CELEB_FRAMES } from '../render/celebs';
import { PART_SIZE, PART_C, PartType, PartView, partKey, getPart, setPart, partVariants } from '../render/faceParts';
import { PART_REPO, activePartDraft, savePartDraft, clearPartDraft, loadPartDraft, partBase, draftKeys, decodePng } from '../render/facePartsArt';
import { renderPartCanvas, seedLook } from './partSeeds';
import { drawHead, frontHead } from '../render/sprites';
import { Appearance, HAIR_STYLES, FACIAL, NOSES, MOUTHS, HAIR_COLORS, withDefaults } from '../render/appearance';
import { REAL_ROSTERS } from '../career/roster';

type Tool = 'pencil' | 'eraser' | 'fill' | 'picker' | 'line';
const TOOLS: [Tool, string, string][] = [['pencil', '✏️ Pencil', 'B'], ['eraser', '🧽 Eraser', 'E'], ['fill', '🪣 Fill', 'G'], ['picker', '💧 Picker', 'I'], ['line', '📏 Line', 'L']];
const CSS = `
#pxed { position: fixed; inset: 0; z-index: 50; background: #0b0a18; color: #dfe6ff; font: 13px/1.35 ui-monospace, Menlo, Consolas, monospace;
  display: grid; grid-template-columns: 170px 1fr 300px; grid-template-rows: auto auto 1fr; user-select: none; }
#pxed header { grid-column: 1 / 4; display: flex; gap: 8px; align-items: center; padding: 8px 10px; border-bottom: 1px solid #2a3150; flex-wrap: wrap; }
#pxed header h1 { font-size: 15px; margin: 0 10px 0 0; color: #ffcc33; }
#pxed .bar { grid-column: 1 / 4; display: flex; gap: 8px; align-items: center; padding: 6px 10px; border-bottom: 1px solid #2a3150; flex-wrap: wrap; min-height: 18px; }
#pxed button, #pxed select { background: #1f2742; color: #fff; border: 1px solid #3c4876; border-radius: 4px; padding: 4px 8px; cursor: pointer; font: inherit; }
#pxed button:hover { background: #2d3866; } #pxed button.on { background: #ffcc33; color: #111; border-color: #ffcc33; }
#pxed button:disabled { opacity: 0.4; cursor: default; }
#pxed .cast { overflow-y: auto; border-right: 1px solid #2a3150; padding: 6px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; align-content: start; }
#pxed .cast div { position: relative; background: #2a2150; border: 2px solid transparent; border-radius: 4px; cursor: pointer; text-align: center; padding-top: 2px; }
#pxed .cast div.sel { border-color: #ffcc33; } #pxed .cast canvas { image-rendering: pixelated; }
#pxed .cast span { position: absolute; top: 2px; right: 3px; font-size: 10px; color: #7fffc8; } #pxed .cast b { display: block; font-size: 10px; color: #9fb0e0; font-weight: normal; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 2px; }
#pxed .stage { overflow: auto; display: flex; align-items: center; justify-content: center; background: repeating-conic-gradient(#1a1830 0 25%, #221f3d 0 50%) 0 0 / 16px 16px; }
#pxed .stage canvas { image-rendering: pixelated; cursor: crosshair; box-shadow: 0 0 0 1px #3c4876; }
#pxed aside { border-left: 1px solid #2a3150; padding: 10px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
#pxed .pal { display: grid; grid-template-columns: repeat(8, 1fr); gap: 3px; } #pxed .pal i { aspect-ratio: 1; border-radius: 3px; cursor: pointer; border: 1px solid #0006; }
#pxed .pal i.cur { outline: 2px solid #fff; } #pxed .note { color: #7884aa; font-size: 11px; } #pxed .status { color: #7fffc8; min-height: 1.3em; }
#pxed .prev { background: #2a2150; border-radius: 4px; padding: 6px; display: flex; gap: 6px; align-items: flex-end; justify-content: center; flex-wrap: wrap; }
#pxed .prev canvas { image-rendering: pixelated; }
`;

let root: HTMLElement | null = null;

export function openPixelEditor(mode: 'celebs' | 'parts' = 'celebs') {
  if (root) return;
  const game = (window as any).__phaser;
  try { game?.loop?.sleep(); } catch { /* not running */ }
  if (!document.getElementById('pxed-css')) { const st = document.createElement('style'); st.id = 'pxed-css'; st.textContent = CSS; document.head.append(st); }
  root = document.createElement('div'); root.id = 'pxed';
  document.body.append(root);
  new Editor(root, mode, () => {
    root?.remove(); root = null;
    try { game?.loop?.wake(); } catch { /* ignore */ }
  });
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, any> = {}, ...kids: (Node | string)[]) => {
  const e = document.createElement(tag); for (const [k, v] of Object.entries(props)) (e as any)[k] = v; e.append(...kids); return e;
};
const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
const canvas = (w: number, hh: number) => { const c = document.createElement('canvas'); c.width = w; c.height = hh; return c; };

// ---------- documents: what the editor is editing ----------
interface Item { id: string; label: string; badge: string }
interface Doc {
  title: string;
  FW: number; FH: number; frames: string[];
  /** thumbnail drawn into the left list (canvas size FW×FH) */
  thumbScale: number;
  items(): Item[];
  load(id: string, onChange: () => void): HTMLCanvasElement;
  statusFor(id: string): string;
  commit(id: string, sheet: HTMLCanvasElement): void;
  repoName(id: string): string;
  repoPath(id: string): string;
  generated(id: string): HTMLCanvasElement;
  clearDraft(id: string): void;
  guide(id: string): HTMLCanvasElement | null;
  preview(id: string, sheet: HTMLCanvasElement, el: HTMLElement, frame: number): void;
  bar(ed: Editor): HTMLElement[];
  thumb(id: string, c: HTMLCanvasElement): void;
}

/** Courtside celebs: 16 sheets of 4 frames. */
class CelebDoc implements Doc {
  title = 'courtside celebs'; FW = CELEB_W; FH = CELEB_H; frames = FRAME_NAMES; thumbScale = 1;
  items() { return Array.from({ length: CELEB_CAST }, (_, i) => i).filter((i) => !RETIRED_CELEBS.includes(i)).map((i) => ({ id: String(i), label: `#${String(i).padStart(2, '0')}`, badge: activeDraft(i) ? 'draft' : repoArt(i) ? 'saved' : '' })); }
  load(id: string, onChange: () => void) { return castSheet(+id, onChange); }
  statusFor(id: string) { const i = +id, d = loadDraft(i); return d && d.base !== baseId(i) ? 'Your old draft was drawn on an older version of this celeb (the saved art changed), so it is not used.' : activeDraft(i) ? 'Showing your local draft.' : repoArt(i) ? 'Showing the saved art from the repo.' : 'Showing the generated sprite.'; }
  commit(id: string, sheet: HTMLCanvasElement) {
    saveDraft(+id, sheet.toDataURL('image/png'));
    try { const tm = (window as any).__phaser?.textures; const key = `celebcast_${id}`; if (tm?.exists(key)) tm.remove(key); } catch { /* ignore */ }
  }
  repoName(id: string) { return castName(+id); }
  repoPath(id: string) { return `src/art/celebs/${castName(+id)}.png`; }
  generated(id: string) { return generatedSheet(+id); }
  clearDraft(id: string) { clearDraft(+id); }
  guide() { return null; }
  preview(_id: string, sheet: HTMLCanvasElement, el: HTMLElement, frame: number) {
    el.innerHTML = '';
    for (let f = 0; f < CELEB_FRAMES; f++) {
      const c = canvas(CELEB_W, CELEB_H); c.style.width = `${CELEB_W * 1.09}px`; c.style.height = `${CELEB_H * 1.09}px`;
      if (f === frame) c.style.outline = '1px solid #ffcc33';
      c.getContext('2d')!.drawImage(sheet, f * CELEB_W, 0, CELEB_W, CELEB_H, 0, 0, CELEB_W, CELEB_H);
      el.append(c);
    }
  }
  bar() { return [h('span', { className: 'note', textContent: 'Pick a celeb on the left; frames are the four poses.' })]; }
  thumb(id: string, c: HTMLCanvasElement) { const s = castSheet(+id, () => this.thumb(id, c)); const x = c.getContext('2d')!; x.clearRect(0, 0, c.width, c.height); x.drawImage(s, 0, 0, CELEB_W, CELEB_H, 0, 0, CELEB_W, CELEB_H); }
}

const BUILTIN: Record<PartType, readonly string[]> = { hair: HAIR_STYLES.filter((x) => x !== 'bald'), hairBack: HAIR_STYLES.filter((x) => x !== 'bald'), beard: FACIAL.filter((x) => x !== 'none'), brows: ['thin', 'thick'], eyes: ['default', 'wide'], nose: NOSES, mouth: MOUTHS };
const TYPE_LABEL: Record<PartType, string> = { hair: 'Hair (front)', hairBack: 'Hair (back layer)', beard: 'Beard', brows: 'Brows', eyes: 'Eyes', nose: 'Nose', mouth: 'Mouth' };
/** Which look field a part type sets, for previews. */
function withPart(a: Appearance, t: PartType, v: string): Appearance {
  const o = { ...a };
  if (t === 'hair' || t === 'hairBack') o.hair = v; else if (t === 'beard') o.facial = v; else if (t === 'brows') o.brows = v;
  else if (t === 'eyes') o.eyes = v; else if (t === 'nose') o.nose = v; else o.mouth = v;
  return o;
}

/** Face parts: one PART_SIZE picture per (type, variant, view). Item id = variant. */
class PartsDoc implements Doc {
  title = 'face parts'; FW = PART_SIZE; FH = PART_SIZE; frames = ['Picture']; thumbScale = 1;
  type: PartType = 'hair'; view: PartView = 'side';
  previewTeam = 'BOS'; previewIdx = 0;
  key(id: string) { return partKey(this.type, id, this.view); }
  variants(): string[] {
    const fromDrafts = draftKeys().map((k) => k.match(/^([^/]+)\/(.+)_(side|front)$/)).filter((m) => m && m[1] === this.type).map((m) => m![2]);
    return [...new Set([...BUILTIN[this.type], ...partVariants(this.type), ...fromDrafts])];
  }
  items() {
    return this.variants().map((v, i) => {
      const k = this.key(v);
      return { id: v, label: `${i + 1}. ${v}`, badge: activePartDraft(k) ? 'draft' : PART_REPO[k] ? 'saved' : getPart(k) ? '' : 'code' };
    });
  }
  /** The look used to draw this part: seed grays, with this variant set. */
  look(id: string) { return seedLook(withPart(seedLook(), this.type, id)); }
  load(id: string, onChange: () => void) {
    const k = this.key(id), c = canvas(PART_SIZE, PART_SIZE), x = c.getContext('2d', { willReadFrequently: true })!;
    const img = getPart(k);
    if (img) x.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.w, img.h), 0, 0);
    else {
      // no picture yet: start from the code-drawn part (or the repo file if the library hasn't loaded it)
      x.drawImage(renderPartCanvas(this.type, this.view, this.look(id), { open: this.type === 'mouth' && id === 'open' }), 0, 0);
      const url = PART_REPO[k];
      if (url) decodePng(url).then((p) => { x.clearRect(0, 0, PART_SIZE, PART_SIZE); x.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.w, p.h), 0, 0); onChange(); });
    }
    return c;
  }
  statusFor(id: string) {
    const k = this.key(id), d = loadPartDraft(k);
    if (d && d.base !== partBase(k)) return 'Your old draft was drawn on an older saved picture, so it is not used.';
    return activePartDraft(k) ? 'Showing your local draft.' : PART_REPO[k] ? 'Showing the saved picture from the repo.' : 'No picture yet: this is the code-drawn part. Draw on it and it becomes a picture.';
  }
  commit(id: string, sheet: HTMLCanvasElement) {
    const k = this.key(id);
    savePartDraft(k, sheet.toDataURL('image/png'));
    const d = sheet.getContext('2d')!.getImageData(0, 0, PART_SIZE, PART_SIZE);
    setPart(k, { w: PART_SIZE, h: PART_SIZE, data: d.data }); // live: previews and the next game use it
  }
  repoName(id: string) { return `parts/${this.key(id)}`; }
  repoPath(id: string) { return `src/art/parts/${this.key(id)}.png`; }
  generated(id: string) { return renderPartCanvas(this.type, this.view, this.look(id), { open: this.type === 'mouth' && id === 'open' }); }
  clearDraft(id: string) { clearPartDraft(this.key(id)); }
  /** Faint head underneath for alignment: bare head + default eyes / nose / mouth (minus the part being edited). */
  guide() {
    const c = canvas(PART_SIZE, PART_SIZE), x = c.getContext('2d')!, a = seedLook({ eyeColor: '#3a2416' });
    const layers: (PartType | 'base')[] = ['base', 'eyes', 'brows', 'nose', 'mouth'];
    for (const t of layers) if (t !== this.type) x.drawImage(renderPartCanvas(t, this.view, a), 0, 0);
    return c;
  }
  player(): Appearance {
    const e = REAL_ROSTERS[this.previewTeam]?.[this.previewIdx];
    return withDefaults(e?.appearance);
  }
  /** Live preview: a real player wearing this part (side, ¾, front) plus a few hair colors / skin tones. */
  preview(id: string, _sheet: HTMLCanvasElement, el: HTMLElement) {
    el.innerHTML = '';
    const head = (a: Appearance, mode: 'side' | 'q' | 'front', scale = 3) => {
      const c = canvas(PART_SIZE, PART_SIZE), x = c.getContext('2d')!;
      if (mode === 'side') drawHead(x, PART_C, PART_C, a, 1, false); else frontHead(x, PART_C, PART_C, a, 1, { turn: mode === 'q' ? 0.6 : 0 });
      c.style.width = c.style.height = `${PART_SIZE * scale}px`;
      return c;
    };
    const a = withPart(this.player(), this.type, id);
    el.append(head(a, 'side'), head(a, 'q'), head(a, 'front'));
    const row = h('div', { style: 'display:flex;gap:4px;justify-content:center;width:100%' });
    for (const [skin, hair] of [[0, HAIR_COLORS[5]], [1, HAIR_COLORS[3]], [3, HAIR_COLORS[0]], [4, HAIR_COLORS[7]]] as [number, string][]) {
      row.append(head({ ...a, skin, hairColor: hair }, this.view === 'side' ? 'side' : 'front', 1.6));
    }
    el.append(row);
  }
  bar(ed: Editor) {
    const typeSel = h('select', { onchange: () => { this.type = typeSel.value as PartType; ed.reloadList(); } },
      ...(Object.keys(TYPE_LABEL) as PartType[]).map((t) => h('option', { value: t, selected: t === this.type, textContent: TYPE_LABEL[t] })));
    const viewBtns = (['side', 'front'] as PartView[]).map((v) => h('button', { className: v === this.view ? 'on' : '', textContent: v === 'side' ? 'Side view' : 'Front / ¾ view', onclick: () => { this.view = v; ed.reloadList(); } }));
    const teams = Object.keys(REAL_ROSTERS).sort();
    const teamSel = h('select', { onchange: () => { this.previewTeam = teamSel.value; this.previewIdx = 0; ed.reloadList(); } }, ...teams.map((t) => h('option', { value: t, selected: t === this.previewTeam, textContent: t })));
    const plSel = h('select', { onchange: () => { this.previewIdx = +plSel.value; ed.render(); } },
      ...(REAL_ROSTERS[this.previewTeam] ?? []).map((p, i) => h('option', { value: String(i), selected: i === this.previewIdx, textContent: p.name })));
    return [h('b', {}, 'Part '), typeSel, ...viewBtns,
      h('button', { textContent: '＋ New variant', title: 'Copy the current part into a new numbered variant', onclick: () => ed.newVariant() }),
      h('span', { className: 'note', textContent: '  Preview on ' }), teamSel, plSel];
  }
  thumb(id: string, c: HTMLCanvasElement) {
    const x = c.getContext('2d')!; x.clearRect(0, 0, c.width, c.height);
    x.globalAlpha = 0.35; x.drawImage(this.guide(), 0, 0); x.globalAlpha = 1;
    x.drawImage(this.load(id, () => this.thumb(id, c)), 0, 0);
  }
}

class Editor {
  doc: Doc;
  id = '0'; frame = 0; tool: Tool = 'pencil'; color = '#ff4fa3'; zoom = 6; grid = true;
  sheet!: HTMLCanvasElement; ctx!: CanvasRenderingContext2D;
  guideCanvas: HTMLCanvasElement | null = null;
  undo: ImageData[] = []; redo: ImageData[] = [];
  view: HTMLCanvasElement; vctx: CanvasRenderingContext2D;
  listEl: HTMLElement; palEl: HTMLElement; prevEl: HTMLElement; statusEl: HTMLElement; barEl: HTMLElement; framesEl: HTMLElement;
  toolBtns = new Map<Tool, HTMLButtonElement>(); modeBtns: HTMLButtonElement[] = [];
  colorInp: HTMLInputElement; saveBtn: HTMLButtonElement; titleEl: HTMLElement; noteEl: HTMLElement;
  drawing = false; lineFrom: [number, number] | null = null; hover: [number, number] | null = null;
  recent: string[] = [];
  docs = { celebs: new CelebDoc(), parts: new PartsDoc() };

  constructor(private el: HTMLElement, mode: 'celebs' | 'parts', private close: () => void) {
    const dev = import.meta.env.DEV;
    this.doc = this.docs[mode];
    this.view = h('canvas'); this.vctx = this.view.getContext('2d')!;
    this.listEl = h('div', { className: 'cast' });
    this.palEl = h('div', { className: 'pal' });
    this.prevEl = h('div', { className: 'prev' });
    this.statusEl = h('div', { className: 'status' });
    this.barEl = h('div', { className: 'bar' });
    this.framesEl = h('span');
    this.titleEl = h('h1');
    this.colorInp = h('input', { type: 'color', value: this.color, oninput: () => this.setColor(this.colorInp.value) });
    this.saveBtn = h('button', { textContent: '💾 Save to repo', disabled: !dev, title: dev ? 'Writes the PNG into src/art/' : 'Only under npm run dev', onclick: () => this.saveRepo() });
    const header = h('header', {}, this.titleEl);
    for (const m of ['celebs', 'parts'] as const) { const b = h('button', { textContent: m === 'celebs' ? '🎤 Celebs' : '🙂 Face parts', onclick: () => this.setMode(m) }); this.modeBtns.push(b); header.append(b); }
    header.append(h('span', { textContent: ' │ ' }), this.framesEl, h('span', { textContent: ' │ ' }));
    for (const [t, label, key] of TOOLS) { const b = h('button', { textContent: label, title: `${label} (${key})`, onclick: () => this.setTool(t) }); this.toolBtns.set(t, b); header.append(b); }
    header.append(h('span', { textContent: ' │ ' }),
      h('button', { textContent: '↶ Undo', title: 'Ctrl+Z', onclick: () => this.doUndo() }),
      h('button', { textContent: '↷ Redo', title: 'Ctrl+Shift+Z / Ctrl+Y', onclick: () => this.doRedo() }),
      h('button', { textContent: '−', title: 'Zoom out (-)', onclick: () => this.setZoom(this.zoom - 1) }),
      h('button', { textContent: '+', title: 'Zoom in (+)', onclick: () => this.setZoom(this.zoom + 1) }),
      h('button', { textContent: '# Grid', onclick: () => { this.grid = !this.grid; this.render(); } }),
      h('button', { textContent: '✕ Close (Esc)', onclick: () => this.exit() }));
    this.noteEl = h('div', { className: 'note' });
    const aside = h('aside', {},
      h('div', {}, 'Color ', this.colorInp),
      h('div', {}, h('div', { className: 'note' }, 'Colors in this picture (click to use):'), this.palEl),
      h('div', {}, h('div', { className: 'note' }, 'Preview:'), this.prevEl),
      h('div', {}, h('button', { textContent: '⧉ Copy frame → all frames', onclick: () => this.copyToAll() }), ' ', h('button', { textContent: '⇋ Mirror', onclick: () => this.mirror() })),
      h('div', {}, this.saveBtn, ' ', h('button', { textContent: '⬇ Download PNG', onclick: () => this.download() })),
      h('div', {}, h('button', { textContent: '↺ Revert to saved', title: 'Drop your local draft', onclick: () => this.revert(false) }), ' ',
        h('button', { textContent: '⟲ Reset to code-drawn', onclick: () => this.revert(true) })),
      this.statusEl, this.noteEl,
      h('div', { className: 'note' }, 'Keys: B pencil · E eraser · G fill · I picker · L line · 1–8 frame · Z/Ctrl+Z undo · +/− zoom · Alt+click = pick color · right-click = erase'));
    const stage = h('div', { className: 'stage' }, this.view);
    el.append(header, this.barEl, this.listEl, stage, aside);
    this.bindCanvas(); this.bindKeys();
    this.setMode(mode);
  }

  setMode(m: 'celebs' | 'parts') {
    this.doc = this.docs[m];
    this.modeBtns.forEach((b, i) => b.classList.toggle('on', (i === 0) === (m === 'celebs')));
    this.titleEl.textContent = `Pixel editor — ${this.doc.title}`;
    this.zoom = Math.max(3, Math.min(m === 'parts' ? 16 : 10, Math.floor((window.innerHeight - 140) / this.doc.FH)));
    this.framesEl.innerHTML = '';
    if (this.doc.frames.length > 1) this.doc.frames.forEach((n, f) => this.framesEl.append(h('button', { textContent: `${f + 1} ${n}`, onclick: () => this.setFrame(f) })));
    const dev = import.meta.env.DEV;
    this.noteEl.innerHTML = m === 'parts'
      ? `Draw parts in <b>grays</b>: they take each player's hair color (hair, beard, brows) or skin tone (nose, mouth) by brightness. In eyes, pure green <code>#00ff00</code> becomes the eye color. Give a player your parts in the dev panel's <b>NBA player looks</b>, then <b>Save look to rosters.json</b>. ${dev ? '<b>Save to repo</b> writes <code>src/art/parts/…</code>: commit + push it.' : 'Saving to the repo needs <code>npm run dev</code> on your computer.'}`
      : `Edits autosave in this browser and show up in the next game. ${dev ? '<b>Save to repo</b> writes <code>src/art/celebs/celeb_NN.png</code>: commit + push it.' : 'Saving to the repo needs <code>npm run dev</code> on your computer.'}`;
    this.frame = 0;
    this.reloadList(this.doc.items()[0]?.id);
  }
  /** Rebuild the left list and the bar (after a type/view change); keeps the current item if it still exists. */
  reloadList(keep?: string) {
    this.barEl.innerHTML = ''; this.barEl.append(...this.doc.bar(this));
    const items = this.doc.items();
    const id = keep ?? (items.some((i) => i.id === this.id) ? this.id : items[0]?.id ?? '0');
    this.listEl.innerHTML = '';
    for (const it of items) {
      const c = canvas(this.doc.FW, this.doc.FH);
      c.style.width = `${this.doc.FW * (this.doc === this.docs.parts ? 1.6 : 1)}px`;
      this.listEl.append(h('div', { onclick: () => this.load(it.id) }, c, h('span', {}, it.badge), h('b', { title: it.label }, it.label)));
      (this.listEl.lastChild as HTMLElement).dataset.id = it.id;
      this.doc.thumb(it.id, c);
    }
    this.load(id);
  }

  // ---------- data ----------
  load(id: string) {
    this.id = id; this.undo = []; this.redo = [];
    this.sheet = this.doc.load(id, () => this.afterLoad());
    this.ctx = this.sheet.getContext('2d', { willReadFrequently: true })!;
    this.guideCanvas = this.doc.guide(id);
    this.status(this.doc.statusFor(id));
    this.afterLoad();
  }
  afterLoad() { this.render(); this.buildPalette(); this.markList(); }
  get SW() { return this.doc.FW * this.doc.frames.length; }
  snapshot() { this.undo.push(this.ctx.getImageData(0, 0, this.SW, this.doc.FH)); if (this.undo.length > 100) this.undo.shift(); this.redo = []; }
  commit() { this.doc.commit(this.id, this.sheet); this.markList(); this.buildPalette(); }
  newVariant() {
    if (!(this.doc instanceof PartsDoc)) return;
    const d = this.doc, used = new Set(d.variants());
    let n = 1; while (used.has(`${d.type}_${n}`)) n++;
    const id = `${d.type}_${n}`, from = this.id;
    // copy the current picture (this view) and, if there is one, the other view of the same variant
    const cur = this.sheet.getContext('2d')!.getImageData(0, 0, PART_SIZE, PART_SIZE);
    const otherView: PartView = d.view === 'side' ? 'front' : 'side';
    const other = getPart(partKey(d.type, this.id, otherView));
    const save = (view: PartView, data: Uint8ClampedArray) => {
      const c = canvas(PART_SIZE, PART_SIZE); c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(data), PART_SIZE, PART_SIZE), 0, 0);
      const k = partKey(d.type, id, view); savePartDraft(k, c.toDataURL('image/png')); setPart(k, { w: PART_SIZE, h: PART_SIZE, data: new Uint8ClampedArray(data) });
    };
    save(d.view, cur.data);
    if (other) save(otherView, other.data);
    this.reloadList(id);
    this.status(`Made ${id} (copy of ${from}). Edit it, then give it to players in the dev panel.`);
  }

  // ---------- tools ----------
  px(x: number, y: number): [number, number, number, number] { const d = this.ctx.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2], d[3]]; }
  inFrame(x: number, y: number) { const W = this.doc.FW; return x >= this.frame * W && x < (this.frame + 1) * W && y >= 0 && y < this.doc.FH; }
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
    const SW = this.SW, FH = this.doc.FH, W = this.doc.FW;
    const img = this.ctx.getImageData(0, 0, SW, FH), d = img.data;
    const at = (px: number, py: number) => (py * SW + px) * 4;
    const t = d.slice(at(x, y), at(x, y) + 4);
    const c = this.color.match(/\w\w/g)!.map((v) => parseInt(v, 16));
    if (t[3] === 255 && t[0] === c[0] && t[1] === c[1] && t[2] === c[2]) return;
    const same = (i: number) => d[i] === t[0] && d[i + 1] === t[1] && d[i + 2] === t[2] && d[i + 3] === t[3];
    const x0 = this.frame * W, x1 = x0 + W;
    const stack: [number, number][] = [[x, y]];
    while (stack.length) {
      const [px, py] = stack.pop()!;
      if (px < x0 || px >= x1 || py < 0 || py >= FH) continue;
      const i = at(px, py); if (!same(i)) continue;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
    }
    this.ctx.putImageData(img, 0, 0);
  }
  pick(x: number, y: number) { const [r, g, b, a] = this.px(x, y); if (a > 0) this.setColor(hex(r, g, b)); }

  bindCanvas() {
    const cell = (e: MouseEvent): [number, number] => { const r = this.view.getBoundingClientRect(); return [this.frame * this.doc.FW + Math.floor((e.clientX - r.left) / this.zoom), Math.floor((e.clientY - r.top) / this.zoom)]; };
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
      this.render(false);
    });
    this.view.addEventListener('pointerleave', () => { this.hover = null; this.render(false); });
    this.view.addEventListener('pointerup', (e) => {
      if (!this.drawing) return;
      const [x, y] = cell(e), W = this.doc.FW;
      if (this.tool === 'line' && this.lineFrom) { this.line(this.lineFrom[0], this.lineFrom[1], Math.max(this.frame * W, Math.min((this.frame + 1) * W - 1, x)), Math.max(0, Math.min(this.doc.FH - 1, y)), erase); this.lineFrom = null; }
      this.drawing = false; last = null; this.commit(); this.render();
    });
  }
  keyHandler = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT') return;
    e.stopPropagation();
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? this.doRedo() : this.doUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); this.doRedo(); return; }
    if (k === 'escape') this.exit();
    else if (k === 'b') this.setTool('pencil'); else if (k === 'e') this.setTool('eraser'); else if (k === 'g') this.setTool('fill');
    else if (k === 'i') this.setTool('picker'); else if (k === 'l') this.setTool('line'); else if (k === 'z') this.doUndo();
    else if (k === '+' || k === '=') this.setZoom(this.zoom + 1); else if (k === '-') this.setZoom(this.zoom - 1);
    else if (/^[1-8]$/.test(k) && +k <= this.doc.frames.length) this.setFrame(+k - 1);
  };
  bindKeys() { window.addEventListener('keydown', this.keyHandler, true); }
  exit() { window.removeEventListener('keydown', this.keyHandler, true); this.close(); }

  setTool(t: Tool) { this.tool = t; this.render(false); }
  setFrame(f: number) { this.frame = f; this.render(); this.buildPalette(); }
  setZoom(z: number) { this.zoom = Math.max(2, Math.min(18, z)); this.render(false); }
  setColor(c: string) { this.color = c; this.colorInp.value = c; this.recent = [c, ...this.recent.filter((x) => x !== c)].slice(0, 8); this.buildPalette(); }
  doUndo() { const s = this.undo.pop(); if (!s) return; this.redo.push(this.ctx.getImageData(0, 0, this.SW, this.doc.FH)); this.ctx.putImageData(s, 0, 0); this.commit(); this.render(); }
  doRedo() { const s = this.redo.pop(); if (!s) return; this.undo.push(this.ctx.getImageData(0, 0, this.SW, this.doc.FH)); this.ctx.putImageData(s, 0, 0); this.commit(); this.render(); }
  copyToAll() {
    const W = this.doc.FW, H = this.doc.FH;
    if (this.doc.frames.length < 2) return;
    this.snapshot();
    const src = this.ctx.getImageData(this.frame * W, 0, W, H);
    for (let f = 0; f < this.doc.frames.length; f++) if (f !== this.frame) this.ctx.putImageData(src, f * W, 0);
    this.commit(); this.render(); this.status(`Copied frame ${this.frame + 1} to every frame.`);
  }
  mirror() {
    const W = this.doc.FW, H = this.doc.FH;
    this.snapshot();
    const tmp = canvas(W, H);
    tmp.getContext('2d')!.putImageData(this.ctx.getImageData(this.frame * W, 0, W, H), 0, 0);
    this.ctx.save(); this.ctx.clearRect(this.frame * W, 0, W, H);
    this.ctx.translate((this.frame + 1) * W, 0); this.ctx.scale(-1, 1); this.ctx.drawImage(tmp, 0, 0); this.ctx.restore();
    this.commit(); this.render();
  }
  revert(toGenerated: boolean) {
    if (!confirm(toGenerated ? 'Throw away your edits and go back to the code-drawn version?' : 'Throw away your local draft?')) return;
    this.doc.clearDraft(this.id);
    if (toGenerated) {
      this.snapshot(); this.ctx.clearRect(0, 0, this.SW, this.doc.FH); this.ctx.drawImage(this.doc.generated(this.id), 0, 0); this.commit(); this.render();
      this.status('Back to the code-drawn version (as a draft).');
    } else this.load(this.id);
  }
  async saveRepo() {
    this.status('Saving…');
    try {
      const r = await fetch('/__dev/save-art', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: this.doc.repoName(this.id), png: this.sheet.toDataURL('image/png') }) });
      this.status(r.ok ? `Saved ${this.doc.repoPath(this.id)} — commit and push it.` : `Couldn't save (${r.status}).`);
    } catch { this.status("Couldn't save: no dev server. Run the game with npm run dev, or use Download PNG."); }
  }
  download() { const a = document.createElement('a'); a.href = this.sheet.toDataURL('image/png'); a.download = `${this.doc.repoName(this.id).replace(/\//g, '_')}.png`; a.click(); }
  status(s: string) { this.statusEl.textContent = s; }

  // ---------- UI ----------
  markList() {
    const items = new Map(this.doc.items().map((i) => [i.id, i]));
    Array.from(this.listEl.children).forEach((cell) => {
      const id = (cell as HTMLElement).dataset.id!;
      cell.classList.toggle('sel', id === this.id);
      (cell.querySelector('span') as HTMLElement).textContent = items.get(id)?.badge ?? '';
      if (id === this.id) { const c = cell.querySelector('canvas')!; const x = c.getContext('2d')!; x.clearRect(0, 0, c.width, c.height); if (this.guideCanvas) { x.globalAlpha = 0.35; x.drawImage(this.guideCanvas, 0, 0); x.globalAlpha = 1; } x.drawImage(this.sheet, 0, 0, this.doc.FW, this.doc.FH, 0, 0, this.doc.FW, this.doc.FH); }
    });
  }
  buildPalette() {
    const d = this.ctx.getImageData(this.frame * this.doc.FW, 0, this.doc.FW, this.doc.FH).data;
    const count = new Map<string, number>();
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { const k = hex(d[i], d[i + 1], d[i + 2]); count.set(k, (count.get(k) ?? 0) + 1); }
    const grays = this.doc === this.docs.parts ? ['#2a2a2a', '#434343', '#5f5f5f', '#808080', '#a4a4a4', '#c8c8c8', '#f4f4f4', '#00ff00'] : [];
    const cols = [...new Set([...this.recent, ...grays, ...[...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)])].slice(0, 48);
    this.palEl.innerHTML = '';
    for (const c of cols) this.palEl.append(h('i', { className: c === this.color ? 'cur' : '', title: c, style: `background:${c}`, onclick: () => this.setColor(c) }));
  }
  render(withPreview = true) {
    const W0 = this.doc.FW, H0 = this.doc.FH;
    const z = this.zoom, W = W0 * z, H = H0 * z, v = this.vctx;
    if (this.view.width !== W || this.view.height !== H) { this.view.width = W; this.view.height = H; }
    v.imageSmoothingEnabled = false;
    v.clearRect(0, 0, W, H);
    if (this.guideCanvas) { v.globalAlpha = 0.3; v.drawImage(this.guideCanvas, 0, 0, W0, H0, 0, 0, W, H); v.globalAlpha = 1; }
    v.drawImage(this.sheet, this.frame * W0, 0, W0, H0, 0, 0, W, H);
    if (this.grid && z >= 4) {
      v.strokeStyle = 'rgba(255,255,255,0.08)'; v.lineWidth = 1; v.beginPath();
      for (let x = 0; x <= W0; x++) { v.moveTo(x * z + 0.5, 0); v.lineTo(x * z + 0.5, H); }
      for (let y = 0; y <= H0; y++) { v.moveTo(0, y * z + 0.5); v.lineTo(W, y * z + 0.5); }
      v.stroke();
      if (this.doc === this.docs.parts) { v.strokeStyle = 'rgba(255,204,51,0.35)'; v.beginPath(); v.moveTo(PART_C * z + 0.5, 0); v.lineTo(PART_C * z + 0.5, H); v.moveTo(0, PART_C * z + 0.5); v.lineTo(W, PART_C * z + 0.5); v.stroke(); }
    }
    if (this.hover && this.inFrame(...this.hover)) {
      const hx = (this.hover[0] - this.frame * W0) * z, hy = this.hover[1] * z;
      v.strokeStyle = '#ffcc33'; v.lineWidth = 2; v.strokeRect(hx + 1, hy + 1, z - 2, z - 2);
      if (this.lineFrom) { v.strokeStyle = this.color; v.beginPath(); v.moveTo((this.lineFrom[0] - this.frame * W0 + 0.5) * z, (this.lineFrom[1] + 0.5) * z); v.lineTo(hx + z / 2, hy + z / 2); v.stroke(); }
    }
    Array.from(this.framesEl.children).forEach((b, f) => b.classList.toggle('on', f === this.frame));
    for (const [t, b] of this.toolBtns) b.classList.toggle('on', t === this.tool);
    if (withPreview) this.doc.preview(this.id, this.sheet, this.prevEl, this.frame);
  }
}
