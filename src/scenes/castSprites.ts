import Phaser from 'phaser';
import { buildCelebSheet, CelebLook, CELEB_W, CELEB_H, CELEB_FRAMES } from '../render/celebs';
import { randomAppearance, Appearance } from '../render/appearance';
import { app } from '../state';

/**
 * Round 84: front-view standing figures for story scenes (the celebs' drawing): Mom, your old teammates on draft night,
 * the scouts at the combine and the workouts. Each look is built once into a texture with the celeb frames.
 */
export function castTexture(scene: Phaser.Scene, key: string, look: CelebLook): string {
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.addCanvas(key, buildCelebSheet(look))!;
    for (let f = 0; f < CELEB_FRAMES; f++) tex.add(f, 0, f * CELEB_W, 0, CELEB_W, CELEB_H);
  }
  return key;
}
const plain = { headband: null, goggles: false, mask: false, armSleeve: 'none', wristband: null, legSleeve: 'none', kneePad: false } as const;

/** Mom (round 60b's look: curly hair, a mauve hoodie, your skin tone). */
export function momTexture(scene: Phaser.Scene): string {
  const c = app.career, a = randomAppearance(() => 0.37);
  Object.assign(a, plain, { skin: c.appearance.skin, hair: 'curly', hairColor: '#2b1d14', facial: 'none', mouth: 'smile' });
  return castTexture(scene, `story_mom_${c.appearance.skin}_v1`, { a, outfit: 'hoodie', color: '#6b4a5e', accent: '#d9c7ae', hat: 'none', hatColor: '#000000', shades: null, chain: false, longHair: '#2b1d14', stand: true, side: 'neutral' });
}
/** A player you know (their own look) in a team hoodie. */
export function mateTexture(scene: Phaser.Scene, id: string, appearance: Appearance, color: string, accent: string): string {
  const a = { ...appearance, ...plain, mouth: 'smile' } as Appearance;
  return castTexture(scene, `story_mate_${id}_v1`, { a, outfit: 'hoodie', color, accent, hat: 'none', hatColor: '#000000', shades: null, chain: false, longHair: null, stand: true, side: 'neutral' });
}
/** A scout: a polo, a cap in the team's color (or grey), a clipboard look. */
export function scoutTexture(scene: Phaser.Scene, i: number, color = '#3a3f52'): string {
  const a = randomAppearance(() => (0.13 + i * 0.29) % 1);
  Object.assign(a, plain, { facial: i % 2 ? 'stubble' : 'none' });
  return castTexture(scene, `story_scout_${i}_${color}_v1`, { a, outfit: 'tracksuit', color, accent: '#e8e2d0', hat: i % 2 ? 'cap' : 'none', hatColor: color, shades: null, chain: false, longHair: null, stand: true, side: 'neutral' });
}
