import Phaser from 'phaser';
import type { GameSim } from '../sim/game';
import { AURA_COLOR, CINE_MAX } from '../sim/ultimates';
import { sy } from './view';

/**
 * Round 55: ultimate effects (the owner's reference: a pixel outline glow with flame wisps rising off the body).
 *  - Flame aura on the ult player, coloured by position (PG blue, SG purple, SF yellow, PF green, C red): tinted
 *    copies of his current sprite frame around him (the outline), plus pooled pixel-flame wisps rising off the body.
 *  - Cinematic (your ult or one against your team): the screen darkens behind the ult player (and the ball / his
 *    chase-down target), the sim slows (GameScene) and the sound ducks (sfx.duck).
 *  - A banner for every ult.
 * All objects are pooled and created up front (never lazily in update: the scene is reused between games).
 */
/** Two rings of tinted copies: a tight bright one and a wide soft one (the reference's thick glow). [dx, dy, ring] */
const OUTLINE: [number, number, number][] = [
  [-4, 0, 0], [4, 0, 0], [0, -5, 0], [-3, -4, 0], [3, -4, 0], [-3, 3, 0], [3, 3, 0], [0, 3, 0],
  [-8, 0, 1], [8, 0, 1], [0, -10, 1], [-6, -7, 1], [6, -7, 1], [-6, 5, 1], [6, 5, 1], [0, 6, 1]];
const WISPS = 22;
export const SHADE_DEPTH = 4000, LIFT_DEPTH = 4100;

const mixWhite = (c: number, k: number) => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return (Math.round(r + (255 - r) * k) << 16) | (Math.round(g + (255 - g) * k) << 8) | Math.round(b + (255 - b) * k);
};

/** A small pixel flame (white; tinted per use): wide at the bottom, licking up to a point. */
function buildWisp(scene: Phaser.Scene) {
  if (scene.textures.exists('aura_wisp')) return;
  const rows = ['..#...', '..#...', '.##...', '.###..', '..###.', '.####.', '#####.', '.#####', '######', '######', '.####.', '..##..'];
  const tex = scene.textures.createCanvas('aura_wisp', 6, rows.length)!;
  const c = tex.getContext();
  c.fillStyle = '#ffffff';
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') c.fillRect(x, y, 1, 1); }));
  tex.refresh();
}

export class UltFx {
  private outline: Phaser.GameObjects.Sprite[] = [];
  private core: Phaser.GameObjects.Sprite;
  private wisps: { img: Phaser.GameObjects.Image; born: number; life: number; x: number; y: number; rise: number; sway: number; front: boolean }[] = [];
  private shade: Phaser.GameObjects.Rectangle;
  private banner: Phaser.GameObjects.Text;
  private bannerSub: Phaser.GameObjects.Text;
  private aura = { pid: '', color: 0xffffff, until: 0 };
  private nextWisp = 0;
  /** Is the cinematic (slow-mo + darken + quiet) on right now? */
  cineOn = false;
  /** sprite ids lifted above the shade this frame */
  lifted: string[] = [];

  constructor(private scene: Phaser.Scene, viewW: number, viewH: number) {
    buildWisp(scene);
    for (let i = 0; i < OUTLINE.length; i++) this.outline.push(scene.add.sprite(0, 0, '__WHITE').setVisible(false));
    this.core = scene.add.sprite(0, 0, '__WHITE').setVisible(false);
    for (let i = 0; i < WISPS; i++) this.wisps.push({ img: scene.add.image(0, 0, 'aura_wisp').setOrigin(0.5, 1).setVisible(false), born: -1e9, life: 1, x: 0, y: 0, rise: 0, sway: 0, front: false });
    this.shade = scene.add.rectangle(viewW / 2, viewH / 2, viewW * 2, viewH * 2, 0x05040c, 1).setScrollFactor(0).setDepth(SHADE_DEPTH).setAlpha(0);
    const st = (size: number) => ({ fontFamily: 'monospace', fontSize: `${size}px`, color: '#ffffff', fontStyle: 'bold', stroke: '#000', strokeThickness: 6 });
    this.banner = scene.add.text(viewW / 2, 178, '', st(40)).setOrigin(0.5).setScrollFactor(0).setDepth(9004).setAlpha(0);
    this.bannerSub = scene.add.text(viewW / 2, 216, '', st(18)).setOrigin(0.5).setScrollFactor(0).setDepth(9004).setAlpha(0);
  }

  /** The banner every ult gets: `ULTIMATE · DOUBLE STEP-BACK`, the player's name under it, in his aura colour. */
  showBanner(name: string, who: string, pos: string, font: string) {
    const col = AURA_COLOR[pos] ?? 0xffdd33, css = `#${mixWhite(col, 0.25).toString(16).padStart(6, '0')}`;
    for (const t of [this.banner, this.bannerSub]) { this.scene.tweens.killTweensOf(t); t.setFontFamily(font); }
    this.banner.setText(`ULTIMATE · ${name.toUpperCase()}`).setColor(css).setAlpha(1).setScale(0.7);
    this.bannerSub.setText(who).setColor('#ffffff').setAlpha(1);
    this.scene.tweens.add({ targets: this.banner, scale: 1, duration: 220, ease: 'Back.Out' });
    this.scene.tweens.add({ targets: [this.banner, this.bannerSub], alpha: 0, delay: 1500, duration: 450 });
  }

  /** Sim speed factor for the cinematic (1 = normal). */
  static speed(sim: GameSim, slow: number): number {
    const a = sim.ult.active;
    return a && a.cinematic && sim.time - a.at < (CINE_MAX[a.id] ?? 1.7) ? slow : 1;
  }

  /** Per frame, after the players are drawn. */
  update(sim: GameSim, sprites: Map<string, Phaser.GameObjects.Sprite>, now: number) {
    const a = sim.ult.active;
    if (a) {
      const p = sim.players.find((q) => q.id === a.pid);
      this.aura = { pid: a.pid, color: AURA_COLOR[p?.pos ?? 'PG'] ?? 0xffffff, until: now + 400 };
    }
    this.cineOn = !!a && a.cinematic && sim.time - a.at < (CINE_MAX[a.id] ?? 1.7);
    // shade in / out
    const target = this.cineOn ? 0.58 : 0;
    this.shade.setAlpha(this.shade.alpha + (target - this.shade.alpha) * (this.cineOn ? 0.25 : 0.12));
    this.lifted = [];
    if (this.shade.alpha > 0.02 && this.aura.pid) {
      this.lifted.push(this.aura.pid);
      if (a?.targetId) this.lifted.push(a.targetId);
      for (const id of this.lifted) sprites.get(id)?.setDepth(LIFT_DEPTH + (id === this.aura.pid ? 2 : 0));
    }
    // the aura
    const fade = Math.max(0, Math.min(1, (this.aura.until - now) / 400));
    const s = this.aura.pid ? sprites.get(this.aura.pid) : undefined;
    const p = this.aura.pid ? sim.players.find((q) => q.id === this.aura.pid) : undefined;
    const on = !!s && !!p && s.visible && fade > 0;
    const col = this.aura.color, light = mixWhite(col, 0.55);
    this.outline.forEach((o, i) => {
      if (!on) { o.setVisible(false); return; }
      const [ox, oy, ring] = OUTLINE[i], flick = 0.75 + 0.25 * Math.sin(now / 55 + i * 1.7);
      o.setTexture(s!.texture.key, s!.frame.name).setOrigin(s!.originX, s!.originY).setScale(s!.scaleX, s!.scaleY).setFlipX(s!.flipX)
        .setPosition(s!.x + ox * (1 + 0.25 * Math.sin(now / 90 + i)), s!.y + oy - 2 * Math.abs(Math.sin(now / 120 + i)))
        .setTintFill(ring ? col : mixWhite(col, 0.15)).setAlpha((ring ? 0.3 : 0.7) * fade * flick).setDepth(s!.depth - (ring ? 0.03 : 0.02)).setVisible(true);
    });
    if (on) this.core.setTexture(s!.texture.key, s!.frame.name).setOrigin(s!.originX, s!.originY).setScale(s!.scaleX, s!.scaleY).setFlipX(s!.flipX)
      .setPosition(s!.x, s!.y - 1).setTintFill(light).setAlpha(0.45 * fade).setDepth(s!.depth - 0.01).setVisible(true);
    else this.core.setVisible(false);
    // flame wisps rising off the body (cosmetic randomness: Math.random, never the sim's rng)
    if (on && now >= this.nextWisp) {
      this.nextWisp = now + 28;
      const w = this.wisps.find((q) => now - q.born > q.life);
      if (w) {
        const top = sy(p!.p.y, p!.z + p!.height), foot = sy(p!.p.y, p!.z), h = foot - top;
        w.born = now; w.life = 420 + Math.random() * 300;
        // licks off the edges of the body and over the head (never across the chest): behind him, rising
        const overHead = Math.random() < 0.3, side = Math.random() < 0.5 ? -1 : 1;
        w.x = s!.x + (overHead ? (Math.random() * 2 - 1) * h * 0.08 : side * h * (0.13 + Math.random() * 0.12));
        w.y = overHead ? top + h * 0.05 : top + h * (0.15 + Math.random() * 0.5);
        w.rise = 26 + Math.random() * 34; w.sway = (Math.random() * 2 - 1) * 8; w.front = false;
        w.img.setTint(Math.random() < 0.4 ? light : col);
      }
    }
    for (const w of this.wisps) {
      const k = (now - w.born) / w.life;
      if (k < 0 || k > 1 || !on) { w.img.setVisible(false); continue; }
      w.img.setVisible(true).setPosition(w.x + Math.sin(k * Math.PI * 2 + w.sway) * w.sway * 0.6, w.y - w.rise * k)
        .setScale(3 * (1 - 0.6 * k), 3 * (1 - 0.3 * k)).setAlpha(0.9 * (1 - k) * fade).setDepth(s!.depth + (w.front ? 0.03 : -0.03));
    }
  }
}
