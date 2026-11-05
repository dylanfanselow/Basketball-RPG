import Phaser from 'phaser';
import type { Appearance } from './appearance';
import { Sheet, Kit, FRAME_W, FRAME_H, frameRect, drawAngled, crispenRect, figureHeight } from './sprites';
import { requestSheet } from './sheetPool';
import { FrameCache } from './frameCache';
import { CLIP, sampleClip, frameTime } from './anim';
import { partsVersion } from './faceParts';

/**
 * Player sprite sheets + their multi-angle frame caches, shared by every scene that draws full players
 * (GameScene, the apartment). Textures outlive scenes, so the caches are module-level.
 */
export const SHEET_CACHE = new Map<string, Sheet>();
const SHEETS_LOADING = new Set<string>();
export const MAX_SHEETS = 16;
/** Angled frames are drawn on demand into pages of 8 x 6 slots, per sheet (look) key; freed with the sheet. */
export const ANG_COLS = 8, ANG_ROWS = 6, ANG_PAGES = 6;
export const ANGLE_CACHE = new Map<string, { cache: FrameCache; prewarm: string[] }>();
export const angPage = (key: string, n: number) => `${key}_ang${n}`;

export function hashStr(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/** Sheet key for a look + kit (the id keeps two players with the same look apart in the LRU). */
export const playerSheetKey = (id: string, look: Appearance, heightFt: number, kit: Kit) =>
  `pl_${id}_${hashStr(JSON.stringify([look, heightFt.toFixed(2), kit]))}_v${partsVersion()}`;

/**
 * A cached sprite sheet (+ texture), or null while it's being drawn in the background (sheet workers).
 * `onLoaded` runs after a new sheet lands (GameScene uses it to evict old sheets).
 */
export function sheetFor(scene: Phaser.Scene, key: string, heightFt: number, look: Appearance, kit: Kit, onLoaded?: () => void): Sheet | null {
  const cached = SHEET_CACHE.get(key);
  if (cached && scene.textures.exists(key)) { SHEET_CACHE.delete(key); SHEET_CACHE.set(key, cached); return cached; }
  if (!SHEETS_LOADING.has(key)) {
    SHEETS_LOADING.add(key);
    const tm = scene.sys.game.textures;
    requestSheet(heightFt, look, kit).then((sheet) => {
      SHEETS_LOADING.delete(key);
      if (tm.exists(key)) tm.remove(key);
      const tex = tm.addCanvas(key, sheet.canvas)!;
      for (let i = 0; i < sheet.total; i++) { const r = frameRect(i); tex.add(i, 0, r.x, r.y, FRAME_W, FRAME_H); }
      SHEET_CACHE.set(key, sheet);
      onLoaded?.();
    });
  }
  return null;
}

/** Drop a sheet's texture and its angled-frame pages. */
export function dropSheet(scene: Phaser.Scene, key: string) {
  SHEET_CACHE.delete(key);
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const ang = ANGLE_CACHE.get(key);
  if (ang) { for (let n = 0; n < ang.cache.pages; n++) if (scene.textures.exists(angPage(key, n))) scene.textures.remove(angPage(key, n)); ANGLE_CACHE.delete(key); }
}

/**
 * The angled-frame cache for a sheet key (created on first use). Frames are drawn on the main thread into canvas
 * texture pages; the caller drains it and refreshes dirty pages once per frame. Prewarm queues common angles.
 */
export function angleCache(scene: Phaser.Scene, key: string, heightFt: number, look: Appearance, kit: Kit, prewarmClips: string[]): FrameCache {
  let e = ANGLE_CACHE.get(key);
  if (e) return e.cache;
  const tm = scene.sys.game.textures, H = figureHeight(heightFt);
  const cache = new FrameCache({
    newPage: (n) => { if (tm.exists(angPage(key, n))) tm.remove(angPage(key, n)); tm.createCanvas(angPage(key, n), ANG_COLS * FRAME_W, ANG_ROWS * FRAME_H); },
    draw: (ck, page, index) => {
      const [clip, frame, yaw] = ck.split('|');
      const tex = tm.get(angPage(key, page)) as Phaser.Textures.CanvasTexture;
      const ctx = tex.getContext();
      const x = (index % ANG_COLS) * FRAME_W, y = Math.floor(index / ANG_COLS) * FRAME_H;
      ctx.clearRect(x, y, FRAME_W, FRAME_H);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, FRAME_W, FRAME_H); ctx.clip();
      const c = CLIP[clip];
      const r = drawAngled(ctx, x, y, sampleClip(c, frameTime(c, +frame)), H, look, kit, c.keys.some((k) => !!k.pose.ball), +yaw);
      ctx.restore();
      crispenRect(ctx, x, y, FRAME_W, FRAME_H);
      if (!tex.has(`s${index}`)) tex.add(`s${index}`, 0, x, y, FRAME_W, FRAME_H);
      return r;
    },
  }, ANG_COLS * ANG_ROWS, ANG_PAGES);
  const prewarm: string[] = [];
  for (const yaw of [45, 90, -45, -90]) for (const clip of prewarmClips) for (let f = 0; f < CLIP[clip].frames; f++) prewarm.push(`${clip}|${f}|${yaw}`);
  e = { cache, prewarm };
  ANGLE_CACHE.set(key, e);
  return cache;
}

/** Draw up to `budget` queued angled frames for one sheet (+ one prewarm frame when idle); refresh dirty pages. */
export function pumpSheet(scene: Phaser.Scene, key: string, budget: number, warm: boolean): number {
  const e = ANGLE_CACHE.get(key); if (!e) return 0;
  if (warm && !e.cache.pending && e.prewarm.length) e.cache.request(e.prewarm.shift()!);
  const before = e.cache.drawn;
  for (const n of e.cache.drain(budget)) (scene.textures.get(angPage(key, n)) as Phaser.Textures.CanvasTexture).refresh();
  return e.cache.drawn - before;
}
