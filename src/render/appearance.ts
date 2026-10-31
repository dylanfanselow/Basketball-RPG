/** How a player looks. Generated per roster player from a seed; the user's lives in the career save. */
export const HAIR_STYLES = ['bald', 'buzz', 'fade', 'hightop', 'afro', 'twists', 'dreads', 'braids', 'mohawk', 'bun', 'curly', 'waves'] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];
export const FACIAL = ['none', 'stubble', 'mustache', 'goatee', 'beard'] as const;
export const NOSES = ['small', 'wide', 'long'] as const;
export const MOUTHS = ['neutral', 'smile', 'frown', 'open'] as const;
export const SOCKS = ['low', 'crew', 'high'] as const;
export const ARM_SLEEVE = ['none', 'shooting', 'both'] as const;
export const LEG_SLEEVE = ['none', 'one', 'both'] as const;

export const SKIN_TONES: [string, string][] = [['#f3c9a2', '#d9a77e'], ['#e0aa78', '#c08858'], ['#b97a48', '#9a6034'], ['#8a5630', '#6c3f20'], ['#5c3720', '#432614']];
export const HAIR_COLORS = ['#141010', '#2b1d14', '#4a3020', '#7a5230', '#b88a4a', '#d8c08a', '#8a2a1a', '#dcdcdc'];
export const EYE_COLORS = ['#3a2416', '#5a3a1e', '#2e5c8a', '#3d7a4a', '#6a6a72', '#1a1a1a'];
export const GEAR_COLORS = ['#ffffff', '#111111', '#e03a3e', '#1d428a', '#fdb927', '#00a86b', '#ff7a00', '#7a3fd0', '#ff4fa3', '#9aa4b0'];

export interface Appearance {
  skin: number;
  hair: HairStyle; hairColor: string;
  facial: (typeof FACIAL)[number];
  eyeColor: string; eyeY: -1 | 0 | 1; eyeGap: 0 | 1; brow: 1 | 2;
  nose: (typeof NOSES)[number];
  mouth: (typeof MOUTHS)[number]; mouthY: -1 | 0 | 1;
  bigEars: boolean;
  headband: string | null;
  armSleeve: (typeof ARM_SLEEVE)[number]; sleeveColor: string;
  wristband: string | null;
  legSleeve: (typeof LEG_SLEEVE)[number]; legSleeveColor: string;
  kneePad: boolean;
  socks: (typeof SOCKS)[number]; sockColor: string;
  goggles: boolean; mask: boolean;
  shoe: string; shoeAccent: string;
}

export const defaultAppearance = (): Appearance => ({
  skin: 2, hair: 'fade', hairColor: HAIR_COLORS[0], facial: 'none',
  eyeColor: EYE_COLORS[0], eyeY: 0, eyeGap: 0, brow: 1, nose: 'small', mouth: 'neutral', mouthY: 0, bigEars: false,
  headband: null, armSleeve: 'none', sleeveColor: '#ffffff', wristband: null, legSleeve: 'none', legSleeveColor: '#ffffff',
  kneePad: false, socks: 'crew', sockColor: '#ffffff', goggles: false, mask: false, shoe: '#f4f4f4', shoeAccent: '#e03a3e',
});

/** Deterministic random look. rnd() must return [0,1). */
export function randomAppearance(rnd: () => number, skin?: number): Appearance {
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
  const chance = (p: number) => rnd() < p;
  const s = skin ?? Math.floor(rnd() * SKIN_TONES.length);
  const darkHair = s >= 2 || chance(0.5);
  return {
    skin: s,
    hair: pick(HAIR_STYLES),
    hairColor: darkHair ? pick(HAIR_COLORS.slice(0, 3)) : pick(HAIR_COLORS),
    facial: chance(0.45) ? 'none' : pick(FACIAL),
    eyeColor: s >= 3 ? pick(EYE_COLORS.slice(0, 2).concat(['#1a1a1a'])) : pick(EYE_COLORS),
    eyeY: pick([-1, 0, 0, 1] as const), eyeGap: pick([0, 1] as const), brow: pick([1, 1, 2] as const),
    nose: pick(NOSES), mouth: pick(['neutral', 'neutral', 'smile', 'frown', 'open'] as const), mouthY: pick([-1, 0, 0, 1] as const),
    bigEars: chance(0.25),
    headband: chance(0.18) ? pick(GEAR_COLORS) : null,
    armSleeve: chance(0.3) ? pick(['shooting', 'shooting', 'both'] as const) : 'none', sleeveColor: pick(GEAR_COLORS),
    wristband: chance(0.3) ? pick(GEAR_COLORS) : null,
    legSleeve: chance(0.22) ? pick(['one', 'both'] as const) : 'none', legSleeveColor: pick(GEAR_COLORS),
    kneePad: chance(0.12),
    socks: pick(SOCKS), sockColor: chance(0.7) ? '#ffffff' : pick(GEAR_COLORS),
    goggles: chance(0.04), mask: chance(0.03),
    shoe: pick(['#f4f4f4', '#f4f4f4', '#111111', ...GEAR_COLORS]), shoeAccent: pick(GEAR_COLORS),
  };
}

/** Fill any fields missing from an older save. */
export const withDefaults = (a: Partial<Appearance> | undefined): Appearance => ({ ...defaultAppearance(), ...(a ?? {}) });
