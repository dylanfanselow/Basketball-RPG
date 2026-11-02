import { describe, it, expect } from 'vitest';
import { recolorPixels, variantOf, setParts, partsFor, partKey, partVariants } from '../src/render/faceParts';
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
