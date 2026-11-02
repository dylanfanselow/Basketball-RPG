/**
 * Main-thread loader for the face-part pictures (see faceParts.ts): the repo files src/art/parts/<type>/<variant>_<view>.png
 * (bundled inline, so they ship in the single-file build) plus this browser's unsaved pixel-editor drafts, which win
 * while the repo picture underneath them is unchanged.
 */
import { setParts, PartImg, PartType, PartView, partKey } from './faceParts';

/** repo pictures: 'hair/afro_side' -> data URL */
export const PART_REPO: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob('../art/parts/*/*.png', { eager: true, query: '?inline', import: 'default' }) as Record<string, string>)
    .map(([path, url]) => [path.replace(/^.*\/art\/parts\//, '').replace(/\.png$/, ''), url]),
);

function hashStr(s: string): string { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
/** What a draft was drawn on top of: the repo picture (by content) or nothing. */
export const partBase = (key: string) => (PART_REPO[key] ? `repo:${hashStr(PART_REPO[key])}` : 'none');

const DRAFT = (key: string) => `hoopcareer.partDraft.${key}`;
export interface PartDraft { base: string; png: string; at: number }
export function loadPartDraft(key: string): PartDraft | null { try { const d = JSON.parse(localStorage.getItem(DRAFT(key)) ?? 'null'); return d?.png ? d : null; } catch { return null; } }
export const activePartDraft = (key: string) => { const d = loadPartDraft(key); return d && d.base === partBase(key) ? d : null; };
export function savePartDraft(key: string, png: string) { try { localStorage.setItem(DRAFT(key), JSON.stringify({ base: partBase(key), png, at: Date.now() })); } catch { /* storage blocked */ } }
export function clearPartDraft(key: string) { try { localStorage.removeItem(DRAFT(key)); } catch { /* ignore */ } }
/** Draft-only variants (made with "New variant" and not saved to the repo yet). */
export function draftKeys(): string[] {
  const out: string[] = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (k.startsWith('hoopcareer.partDraft.')) out.push(k.slice('hoopcareer.partDraft.'.length)); } } catch { /* ignore */ }
  return out;
}

export function decodePng(url: string): Promise<PartImg> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(img, 0, 0);
      resolve({ w: img.width, h: img.height, data: x.getImageData(0, 0, img.width, img.height).data });
    };
    img.onerror = reject;
    img.src = url;
  });
}

/** Load every repo picture and active draft into the part library. Resolves when done. */
export async function loadFaceParts(): Promise<void> {
  if (typeof document === 'undefined') return;
  const keys = new Set([...Object.keys(PART_REPO), ...draftKeys()]);
  const all: Record<string, PartImg> = {};
  await Promise.all([...keys].map(async (key) => {
    const draft = activePartDraft(key), url = draft?.png ?? PART_REPO[key];
    if (!url) return;
    try { all[key] = await decodePng(url); } catch { /* skip a broken picture */ }
  }));
  setParts(all, true);
}

export const keyOf = (t: PartType, variant: string, view: PartView) => partKey(t, variant, view);
