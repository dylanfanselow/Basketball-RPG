/**
 * Exports the built-in (code-drawn) face parts as pictures, so the part library starts from today's faces.
 * Each part is drawn alone in neutral grays (gray skin and hair, eye-color key #00ff00) so it recolors per player.
 */
import { drawHead, frontHead } from '../render/sprites';
import { defaultAppearance, Appearance, HAIR_STYLES, FACIAL, NOSES, MOUTHS } from '../render/appearance';
import { PART_SIZE, PART_C, PartType, PartView, partKey } from '../render/faceParts';

/** The look every seed is drawn with. */
export function seedLook(over: Partial<Appearance> = {}): Appearance {
  return { ...defaultAppearance(), skin: -1, hairColor: '#808080', eyeColor: '#00ff00', eyeY: 0, mouthY: 0, eyeGap: 0, brow: 1, headband: null, goggles: false, mask: false, bigEars: false, ...over };
}

/** Draw one part (or 'base' = the bare head) for a look into a PART_SIZE canvas, code-drawn. */
export function renderPartCanvas(t: PartType | 'base', view: PartView, a: Appearance, opts: { open?: boolean } = {}): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = PART_SIZE; c.height = PART_SIZE;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  if (view === 'side') drawHead(ctx, PART_C, PART_C, a, 1, false, t);
  else frontHead(ctx, PART_C, PART_C, a, 1, { only: t, open: opts.open });
  return c;
}

const empty = (c: HTMLCanvasElement) => { const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) return false; return true; };

/** Every built-in variant of every part, both views: key -> PNG data URL (empty pictures skipped). */
export function renderSeedParts(): Record<string, string> {
  const out: Record<string, string> = {};
  const add = (t: PartType, variant: string, look: Partial<Appearance>, opts: { open?: boolean } = {}) => {
    for (const view of ['side', 'front'] as PartView[]) {
      const c = renderPartCanvas(t, view, seedLook(look), opts);
      if (!empty(c)) out[partKey(t, variant, view)] = c.toDataURL('image/png');
    }
  };
  for (const h of HAIR_STYLES) { if (h === 'bald') continue; add('hair', h, { hair: h }); add('hairBack', h, { hair: h }); }
  for (const f of FACIAL) if (f !== 'none') add('beard', f, { facial: f });
  add('brows', 'thin', { brow: 1 }); add('brows', 'thick', { brow: 2 });
  add('eyes', 'default', { eyeGap: 0 }); add('eyes', 'wide', { eyeGap: 1 });
  for (const n of NOSES) add('nose', n, { nose: n });
  for (const m of MOUTHS) add('mouth', m, { mouth: m }, { open: m === 'open' });
  return out;
}

/** Save pictures into src/art/parts via the dev server. */
export async function savePartsToRepo(parts: Record<string, string>): Promise<{ ok: number; failed: string[] }> {
  let ok = 0; const failed: string[] = [];
  for (const [key, png] of Object.entries(parts)) {
    try {
      const r = await fetch('/__dev/save-art', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `parts/${key}`, png }) });
      if (r.ok) ok++; else failed.push(key);
    } catch { failed.push(key); }
  }
  return { ok, failed };
}
