import { describe, it, expect } from 'vitest';
import { recolorPixels, variantOf, setParts, partsFor, partKey, partVariants, snapCell, plotEyeCells, frontEyeCells, eyeCellsOf, EyeCell, PartImg } from '../src/render/faceParts';
import { defaultAppearance } from '../src/render/appearance';

const ramp = { hi: '#c08060', base: '#a06040', sh: '#704020', deep: '#402010' };
const px = (r: number, g: number, b: number, a = 255) => new Uint8ClampedArray([r, g, b, a]);
const run = (src: Uint8ClampedArray, mode: 'hair' | 'skin' | 'eyes', eye = '#2e5c8a') => { const out = new Uint8ClampedArray(4); recolorPixels(src, out, mode, ramp, eye); return [...out]; };

describe('face parts', () => {
  it('maps seed grays onto the player ramp, keeps whites, keys the eye color, keeps tints', () => {
    expect(run(px(128, 128, 128), 'hair')).toEqual([0xa0, 0x60, 0x40, 255]); // base gray -> ramp base
    expect(run(px(67, 67, 67), 'hair')).toEqual([0x40, 0x20, 0x10, 255]);   // deep gray -> ramp deep
    expect(run(px(244, 244, 244), 'skin')).toEqual([244, 244, 244, 255]);    // teeth / eye whites stay white
    expect(run(px(0, 255, 0), 'eyes')).toEqual([0x2e, 0x5c, 0x8a, 255]);     // eye-color key
    expect(run(px(240, 239, 232), 'eyes')).toEqual([240, 239, 232, 255]);     // other eye pixels as drawn
    const lip = run(px(150, 100, 100), 'skin');
    expect(lip[0] / lip[1]).toBeGreaterThan(0xa0 / 0x60);                     // a reddish lip stays redder than plain skin
    expect(run(px(10, 10, 10, 0), 'hair')[3]).toBe(0);                        // transparent stays transparent
  });
  it('picks variants from the look (incl. defaults for brows / eyes / an open mouth)', () => {
    const a = { ...defaultAppearance(), hair: 'afro', facial: 'goatee', brow: 2 as const, eyeGap: 1 as const };
    expect(variantOf(a, 'hair')).toBe('afro'); expect(variantOf(a, 'hairBack')).toBe('afro'); expect(variantOf(a, 'beard')).toBe('goatee');
    expect(variantOf(a, 'brows')).toBe('thick'); expect(variantOf(a, 'eyes')).toBe('wide');
    expect(variantOf({ ...a, brows: 'brows_3', eyes: 'eyes_2' }, 'brows')).toBe('brows_3');
    expect(variantOf(a, 'mouth', { open: true })).toBe('open');
  });
  it('a sheet job gets exactly the pictures its look uses', () => {
    const img = { w: 1, h: 1, data: new Uint8ClampedArray(4) };
    setParts({ [partKey('hair', 'hair_7', 'side')]: img, [partKey('hair', 'afro', 'side')]: img, [partKey('nose', 'wide', 'front')]: img }, true);
    const got = Object.keys(partsFor({ ...defaultAppearance(), hair: 'hair_7', nose: 'wide' }));
    expect(got.sort()).toEqual([partKey('hair', 'hair_7', 'side'), partKey('nose', 'wide', 'front')].sort());
    expect(partVariants('hair').sort()).toEqual(['afro', 'hair_7']);
    setParts({}, true);
  });
});

/** The eye pictures in the repo, as data URLs (same glob the game uses). */
const EYE_PNGS = import.meta.glob('../src/art/parts/eyes/*.png', { eager: true, query: '?inline', import: 'default' }) as Record<string, string>;
/** Minimal PNG reader (8-bit RGBA / RGB, non-interlaced: what the pixel editor and PIL write). */
async function readPng(dataUrl: string): Promise<PartImg> {
  const buf = Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0)), dv = new DataView(buf.buffer);
  let o = 8, w = 0, h = 0, ct = 6; const idat: BlobPart[] = [];
  while (o < buf.length) {
    const len = dv.getUint32(o), type = String.fromCharCode(...buf.subarray(o + 4, o + 8)), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = dv.getUint32(o + 8); h = dv.getUint32(o + 12); ct = d[9]; }
    if (type === 'IDAT') idat.push(d.slice());
    o += 12 + len;
  }
  const raw = new Uint8Array(await new Response(new Blob(idat).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  const bpp = ct === 6 ? 4 : 3, stride = w * bpp, px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x], a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      px[y * stride + x] = (v + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]) & 255;
    }
  }
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) for (let ch = 0; ch < 4; ch++) data[i * 4 + ch] = ch < bpp ? px[i * bpp + ch] : 255;
  return { w, h, data };
}

/** Plot cells into a fake ctx; returns { x,y -> {color, iris} }. */
function plot(cells: EyeCell[], x: number, y: number, k: number) {
  const got = new Map<string, string>(); let fill = '';
  const ctx = { set fillStyle(c: string) { fill = c; }, fillRect(px: number, py: number) { got.set(`${px},${py}`, fill); } } as unknown as CanvasRenderingContext2D;
  plotEyeCells(ctx, x, y, k, cells);
  return got;
}
/** Eyes must be mirror images around the face center: same pixels, irises inside whites (looking straight ahead). */
function expectMirrored(got: Map<string, string>, x: number, iris: string) {
  const bx = Math.round(x);
  const pts = [...got.keys()].map((s) => s.split(',').map(Number));
  for (const [px, py] of pts) {
    const mx = 2 * bx - 1 - px; // mirror around the pixel boundary at bx
    expect(got.has(`${mx},${py}`), `pixel ${px},${py} has no mirror at ${mx}`).toBe(true);
    expect(got.get(`${mx},${py}`) === iris).toBe(got.get(`${px},${py}`) === iris);
  }
  // per eye: the iris is the innermost pixel, and each eye shows the same amount of white
  const left = pts.filter(([px]) => px < bx), right = pts.filter(([px]) => px >= bx);
  const inner = (side: number[][], dir: number) => side.reduce((m, p) => (dir * p[0] > dir * m[0] ? p : m));
  if (left.length) {
    expect(got.get(`${inner(left, 1)[0]},${inner(left, 1)[1]}`)).toBe(iris);
    expect(got.get(`${inner(right, -1)[0]},${inner(right, -1)[1]}`)).toBe(iris);
  }
  expect(left.filter(([a, b]) => got.get(`${a},${b}`) !== iris).length).toBe(right.filter(([a, b]) => got.get(`${a},${b}`) !== iris).length);
}

const SCALES = [0.5, 0.7, 0.82, 1, 1.1, 1.25, 1.5, 1.9];
const XS = [20, 20.3, 20.5, 20.7, 21.49];

describe('eyes (owner rule: W I · · · · I W, mirrored, straight ahead)', () => {
  it('snapCell mirrors exactly at every scale', () => {
    for (const k of SCALES) for (const d of [0.5, 1.5, 2.5, 3.5, 4.5, 9.5]) expect(snapCell(-d, k)).toBe(-1 - snapCell(d, k));
  });
  it('the code-drawn pair is mirrored with equal whites at every scale and position', () => {
    for (const gap of [4, 6]) for (const k of SCALES) for (const x of XS) expectMirrored(plot(frontEyeCells('#2e5c8a', gap), x, 30.4, k), x, '#2e5c8a');
  });
  it('every front eye picture in src/art/parts/eyes is mirrored with irises inside', async () => {
    const files = Object.keys(EYE_PNGS).filter((f) => f.endsWith('_front.png'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const cells = eyeCellsOf(await readPng(EYE_PNGS[f]), '#2e5c8a');
      expect(cells.length, f).toBeGreaterThan(0);
      for (const k of SCALES) for (const x of XS) {
        const got = plot(cells, x, 30, k);
        expectMirrored(got, x, '#2e5c8a');
      }
    }
  });
  it('profile eyes: both irises in front of their whites (looking forward)', async () => {
    for (const f of Object.keys(EYE_PNGS).filter((f) => f.endsWith('_side.png'))) {
      const cells = eyeCellsOf(await readPng(EYE_PNGS[f]), '#2e5c8a');
      const iris = cells.filter((c) => c.iris), white = cells.filter((c) => !c.iris);
      expect(iris.length, f).toBe(2);
      for (const w of white) expect(iris.some((i) => i.dy === w.dy && i.dx === w.dx + 1), f).toBe(true);
    }
  });
});
