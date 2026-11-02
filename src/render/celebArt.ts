/**
 * The fixed courtside celebrity cast and their art. Each cast member's 4-frame sheet comes from, in order:
 *   1. a local draft from the pixel editor (this browser only, ignored once the art it was drawn on changes),
 *   2. hand-edited art saved into the repo: src/art/celebs/celeb_NN.png (bundled inline, so it ships everywhere),
 *   3. the procedural drawing (celebs.ts).
 */
import { randomCeleb, buildCelebSheet, CelebLook, CELEB_W, CELEB_H, CELEB_FRAMES } from './celebs';
import { Rng } from '../sim/math';

export const CELEB_CAST = 18;
/** Cast members with a hand-picked look (and a guaranteed courtside seat every game). */
export const FEATURED_CELEBS = [16, 17];
/** Cast members taken out of the courtside rotation. */
export const RETIRED_CELEBS = [2, 4];
/** Cast members who ignore the game and keep tapping their cane (frames 0-3 = one tap). */
export const CANE_CELEBS = [17];
export const SHEET_W = CELEB_W * CELEB_FRAMES, SHEET_H = CELEB_H;
export const FRAME_NAMES = ['Seated', 'Cheering', 'Phone', 'Shock', 'Wave 1', 'Wave 2', 'Kiss', 'Kiss blown'];
/** Celebs who wave and blow kisses courtside (frames 4-7). */
export const GLAM_CELEBS = [1, 9, 12, 16];

const castName = (i: number) => `celeb_${String(i).padStart(2, '0')}`;
export { castName };

/** Cast member i always looks the same (seeded by index). */
export function castLook(i: number): CelebLook {
  const r = new Rng(1000 + i * 7919);
  const look = randomCeleb(() => r.next());
  if (i === 1) {
    // #01: wine-red sequined gown, long sleeves, feather peplum and cuffs, floor-length mermaid skirt
    Object.assign(look, { outfit: 'gown', color: '#8e1324', accent: '#b8182c', chain: false });
  }
  if (i === 17) {
    // #17: the cane man — black suit, top hat, silver skull mask, gold dragon-head cane
    Object.assign(look.a, { skin: 3, facial: 'none' });
    Object.assign(look, { outfit: 'suit', color: '#121216', accent: '#121216', hat: 'tophat', shades: null, chain: false, longHair: null, cane: true });
  }
  if (i === 16) {
    // #16: fair skin, long platinum-blonde hair, blue eyes; sapphire sequin dress, silver heels
    Object.assign(look.a, { skin: 0, hair: 'fade', hairColor: '#ecd9a6', eyeColor: '#3f8fff', facial: 'none', mouth: 'smile', eyeY: 0, mouthY: 0 });
    Object.assign(look, { outfit: 'dress', color: '#1f5fd8', accent: '#dfe3ea', hat: 'none', shades: null, chain: false, longHair: '#ecd9a6' });
  }
  return look;
}

/** Repo art: celeb_NN -> data URL. */
const REPO: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob('../art/celebs/*.png', { eager: true, query: '?inline', import: 'default' }) as Record<string, string>)
    .map(([k, url]) => [k.replace(/^.*\/(celeb_\d+)\.png$/, '$1'), url]),
);
export const repoArt = (i: number): string | null => REPO[castName(i)] ?? null;

function hashStr(s: string): string { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

/** Identifies the art a draft was drawn on top of (repo file or the procedural look). */
export function baseId(i: number): string { const r = repoArt(i); return r ? `repo:${hashStr(r)}` : `gen:${hashStr(JSON.stringify(castLook(i)))}`; }

const DRAFT_KEY = (i: number) => `hoopcareer.celebDraft.${castName(i)}`;
export interface Draft { base: string; png: string; at: number }
export function loadDraft(i: number): Draft | null { try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY(i)) ?? 'null'); return d && d.png ? d : null; } catch { return null; } }
export function saveDraft(i: number, png: string) { try { localStorage.setItem(DRAFT_KEY(i), JSON.stringify({ base: baseId(i), png, at: Date.now() })); } catch { /* storage full or blocked */ } }
export function clearDraft(i: number) { try { localStorage.removeItem(DRAFT_KEY(i)); } catch { /* ignore */ } }
/** A draft only applies while the art underneath it is unchanged (e.g. not after a newer repo version is pulled). */
export const activeDraft = (i: number): Draft | null => { const d = loadDraft(i); return d && d.base === baseId(i) ? d : null; };

function drawUrl(cv: HTMLCanvasElement, url: string, done: () => void) {
  const img = new Image();
  // older art may hold fewer frames than the sheet: only replace what the picture covers (the rest stays code-drawn)
  img.onload = () => { const c = cv.getContext('2d')!; c.clearRect(0, 0, img.width, img.height); c.drawImage(img, 0, 0); done(); };
  img.src = url;
}

/**
 * Sheet for cast member i. Returns the procedural sheet at once; repo art / a draft (data URLs) are drawn over it as
 * soon as they decode, then onChange runs (so a Phaser CanvasTexture can refresh).
 */
export function castSheet(i: number, onChange?: () => void, opts: { draft?: boolean } = {}): HTMLCanvasElement {
  const cv = buildCelebSheet(castLook(i));
  const url = (opts.draft !== false ? activeDraft(i)?.png : null) ?? repoArt(i);
  if (url) drawUrl(cv, url, () => onChange?.());
  return cv;
}

/** Procedural sheet only (the editor's "reset to generated"). */
export const generatedSheet = (i: number) => buildCelebSheet(castLook(i));
