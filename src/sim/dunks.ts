/**
 * Dunk package: the dunks a player can throw down unlock with his Dunk rating (finishing / mobility / strength + perks).
 * Contested dunks are power dunks; open ones lean to the flashiest unlocked, which are a hair less reliable (an
 * equation term) but get a bigger crowd pop and more ultimate charge. Phaser-free.
 */
import type { Player } from './player';
import type { Rng } from './math';

export interface DunkDef {
  id: string; name: string;
  /** Dunk rating needed */
  min: number;
  kind: 'power' | 'flash';
  /** make-chance multiplier (flash dunks are riskier) */
  mult: number;
  /** extra ultimate charge on a make */
  ult: number;
  /** animation clip */
  clip: string;
}

export const DUNKS: DunkDef[] = [
  { id: 'flush', name: 'One-Hand Flush', min: 0, kind: 'power', mult: 1, ult: 0, clip: 'shot_dunk' },
  { id: 'twoHand', name: 'Two-Hand Flush', min: 0, kind: 'power', mult: 1, ult: 0, clip: 'shot_dunk_twoHand' },
  { id: 'tomahawk', name: 'Tomahawk', min: 62, kind: 'power', mult: 1, ult: 1, clip: 'shot_dunk_tomahawk' },
  { id: 'hammer', name: 'Two-Hand Hammer', min: 68, kind: 'power', mult: 1, ult: 1, clip: 'shot_dunk_hammer' },
  { id: 'cockBack', name: 'Cock-Back', min: 74, kind: 'power', mult: 0.99, ult: 2, clip: 'shot_dunk_cockBack' },
  { id: 'reverse', name: 'Reverse Dunk', min: 78, kind: 'flash', mult: 0.98, ult: 3, clip: 'shot_dunk_reverse' },
  { id: 'windmill', name: 'Windmill', min: 84, kind: 'flash', mult: 0.97, ult: 4, clip: 'shot_dunk_windmill' },
  { id: 'spin360', name: '360', min: 90, kind: 'flash', mult: 0.95, ult: 6, clip: 'shot_dunk_360' },
  { id: 'windmill360', name: '360 Windmill', min: 95, kind: 'flash', mult: 0.93, ult: 6, clip: 'shot_dunk_360windmill' },
];
export const DUNK = Object.fromEntries(DUNKS.map((d) => [d.id, d])) as Record<string, DunkDef>;

export const unlockedDunks = (p: Player) => DUNKS.filter((d) => p.sub.dunk >= d.min);
/** The next dunk to unlock (and the rating it needs), or null when he has them all. */
export const nextDunk = (p: Player) => DUNKS.find((d) => p.sub.dunk < d.min) ?? null;

/**
 * Pick the dunk for this finish. contested = a defender right there: power dunks (Posterizer owners favor the
 * cock-back / tomahawk). Standing under the rim: a simple flush (or a reverse). Open and moving: weighted toward the
 * flashiest he has.
 */
export function pickDunk(p: Player, o: { contested: boolean; speedToRim: number; d: number }, rng: Rng): DunkDef {
  const have = unlockedDunks(p);
  let pool: { d: DunkDef; w: number }[];
  if (o.contested) {
    const poster = p.mods.pAdd('posterize') > 0;
    pool = have.filter((d) => d.kind === 'power').map((d, i) => ({ d, w: 1 + i * 0.6 + (poster && (d.id === 'cockBack' || d.id === 'tomahawk') ? 2 : 0) }));
  } else if (o.d < 3.2 && o.speedToRim < 4) {
    pool = have.filter((d) => d.id === 'flush' || d.id === 'twoHand' || d.id === 'reverse').map((d) => ({ d, w: d.id === 'reverse' ? 0.7 : 1 }));
  } else {
    pool = have.map((d, i) => ({ d, w: 1 + i * 0.9 + (d.kind === 'flash' ? 1.5 : 0) }));
  }
  if (!pool.length) return DUNK.flush;
  let r = rng.next() * pool.reduce((a, x) => a + x.w, 0);
  for (const x of pool) { r -= x.w; if (r <= 0) return x.d; }
  return pool[pool.length - 1].d;
}
