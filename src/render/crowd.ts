import Phaser from 'phaser';
import { CROWD_TOP, CROWD_ROWS, CROWD_ROW_H, WORLD_W, FLOOR_TOP, sx } from './view';
import { SPRITE_SCALE } from './sprites';
import { randomFan, buildCelebSheet, CelebLook, CELEB_W, CELEB_H, CELEB_FRAMES } from './celebs';

interface Fan { x: number; row: number; shirt: number; shirtLit: number; skin: number; skinLit: number; hair: number; phase: number; away: boolean; standClutch: boolean; seat: boolean; size: number }

/** Multiply a 0xRRGGBB color. */
const mul = (c: number, f: number) => {
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return (ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255);
};

const SKINS = [0xf3c9a2, 0xe0aa78, 0xb97a48, 0x8a5630, 0x5c3720];
const HAIRS = [0x141010, 0x2b1d14, 0x4a3020, 0x7a5230, 0xb88a4a, 0xdcdcdc];

/**
 * Animated stands: every fan idles (bob, clap, look around) and reacts to the game.
 * A cheer ripples outward from where it happened; groans make the home section sag and boo.
 * Only fans inside the camera are drawn each frame.
 */
export class Crowd {
  fans: Fan[] = [];
  g: Phaser.GameObjects.Graphics;
  /** 0..1 overall excitement, decays */
  hype = 0.15;
  events: { x: number; t: number; power: number; home: boolean; boo: boolean }[] = [];
  clutch = false;
  flashes: { x: number; y: number; t: number }[] = [];

  /** plain sprite fans in the row right behind the bench / celebs / table */
  row: FanRow;

  /** homeColors / awayColors: team colors (primary first); bigGame (playoffs): nearly every home fan wears them. */
  constructor(private scene: Phaser.Scene, homeColors: string[], awayColors: string[], bigGame = false, seed = 1) {
    this.g = scene.add.graphics().setDepth(-990);
    const rng = new Phaser.Math.RandomDataGenerator(['fans']);
    const homeAll = homeColors.map((c) => Phaser.Display.Color.HexStringToColor(c).color);
    const away = Phaser.Display.Color.HexStringToColor(awayColors[0]).color;
    const homeShare = bigGame ? 0.85 : 0.35, awayShare = bigGame ? 0.04 : 0.08;
    // shirt for one fan: home colors (mostly the primary), the odd visitor, or everyday neutrals
    const shirtFor = (neutral: number[]) => {
      const r = rng.frac();
      if (r < homeShare) return { base: rng.frac() < (bigGame ? 0.85 : 0.6) || homeAll.length < 2 ? homeAll[0] : homeAll[1], isAway: false };
      if (r < homeShare + awayShare) return { base: away, isAway: true };
      return { base: rng.pick(neutral), isAway: false };
    };
    const neutral = [0x3b4a6b, 0x6b3b3b, 0x5a4a3a, 0x8a7a5a, 0x5a5a8a, 0x2f2f3f, 0xb07040, 0xdddddd, 0x222222];
    for (let row = 0; row < CROWD_ROWS; row++) {
      // back rows sit in the shadow under the upper deck; front rows catch the court lights
      const lit = 0.5 + 0.5 * (row / (CROWD_ROWS - 1));
      for (let x = -150 + (row % 2) * 6; x < WORLD_W + 150; x += 12) {
        if (rng.frac() < 0.05) continue; // a few empty seats
        const { base, isAway } = shirtFor(neutral);
        const skin = rng.pick(SKINS);
        this.fans.push({
          x: x + rng.between(-2, 2), row, shirt: mul(base, 0.6 * lit), shirtLit: mul(base, 0.85 * lit), skin: mul(skin, 0.62 * lit), skinLit: mul(skin, 0.9 * lit),
          // a little bigger toward the front so the size ramps up into the sprite fan row
          hair: mul(rng.pick(HAIRS), lit), phase: rng.frac() * 10, away: isAway, standClutch: rng.frac() < 0.5, seat: true, size: 0.85 + 0.25 * (row / (CROWD_ROWS - 1)) + rng.frac() * 0.2,
        });
      }
    }
    this.row = new FanRow(scene, this, homeColors, awayColors[0], bigGame, seed);
  }

  /** How a fan at world x (rooting for the visitors if away) is reacting to recent events right now. */
  reaction(x: number, away: boolean, now: number) {
    let jump = 0, armsUp = false, boo = false;
    for (const e of this.events) {
      const delay = Math.abs(x - e.x) / 900 * 1000;
      const age = now - e.t - delay;
      if (age < 0 || age > 1600) continue;
      const mine = e.home ? !away : away;
      if (e.boo) { if (!away) boo = true; continue; }
      if (!mine) continue;
      const k = 1 - age / 1600;
      jump = Math.max(jump, Math.abs(Math.sin(age / 90)) * 7 * e.power * k);
      armsUp = true;
    }
    return { jump, armsUp, boo };
  }

  /** A cheer (home=true: home fans pop) or a groan/boo, centered at world pixel x. */
  react(worldX: number, power: number, home: boolean, boo = false) {
    this.events.push({ x: worldX, t: this.scene.time.now, power, home, boo });
    this.hype = Math.min(1, this.hype + power * 0.5);
    if (!boo) for (let i = 0; i < Math.round(power * 10); i++) this.flashes.push({ x: worldX + (Math.random() - 0.5) * 1400, y: CROWD_TOP + Math.random() * CROWD_ROWS * CROWD_ROW_H, t: this.scene.time.now + Math.random() * 600 });
  }

  update(camX: number, viewW: number) {
    const now = this.scene.time.now;
    const t = now / 1000;
    this.hype = Math.max(this.clutch ? 0.45 : 0.12, this.hype - 0.0025);
    this.events = this.events.filter((e) => now - e.t < 4500);
    this.flashes = this.flashes.filter((f) => now - f.t < 120);
    const g = this.g;
    g.clear();
    for (const f of this.fans) {
      if (f.x < camX - 20 || f.x > camX + viewW + 20) continue;
      const baseY = CROWD_TOP + f.row * CROWD_ROW_H + CROWD_ROW_H - 6;
      // reaction from events: a wave travels outward from the play at ~900 px/s
      const { jump, armsUp, boo } = this.reaction(f.x, f.away, now);
      const standing = armsUp || boo || (this.clutch && f.standClutch) || this.hype > 0.7;
      const bob = Math.sin(t * (2 + this.hype * 6) + f.phase) * (0.6 + this.hype * 2.2);
      const y = baseY - (standing ? 6 : 0) - jump + bob;
      const x = Math.round(f.x);
      // shaded shoulders + head (lit from the court side), hair cap
      const z = f.size;
      g.fillStyle(f.shirt, 1); g.fillEllipse(x, y - 3, 12 * z, (standing ? 15 : 11) * z, 10);
      g.fillStyle(f.shirtLit, 1); g.fillEllipse(x - 1, y - 4, 7 * z, (standing ? 11 : 7) * z, 8);
      g.fillStyle(f.skin, 1); g.fillEllipse(x, y - 12 * z, 7.4 * z, 8.4 * z, 10);
      g.fillStyle(f.skinLit, 1); g.fillEllipse(x - 0.7, y - 12.4 * z, 5 * z, 6 * z, 8);
      g.fillStyle(f.hair, 1); g.fillEllipse(x, y - 15.2 * z, 7.4 * z, 3.4 * z, 8);
      // arms: up on a cheer, crossed on a boo, an occasional clap otherwise
      g.fillStyle(f.skinLit, 1);
      if (armsUp) { const wave = Math.sin(t * 14 + f.phase) * 2; g.fillRect(x - 7, y - 22 + wave, 2, 10); g.fillRect(x + 5, y - 22 - wave, 2, 10); }
      else if (boo) { g.fillStyle(f.shirtLit, 1); g.fillRect(x - 5, y - 6, 10, 2); }
      else if (Math.sin(t * 1.3 + f.phase * 3) > 0.92 - this.hype * 0.3) { const c = Math.sin(t * 20 + f.phase) > 0 ? 0 : 2; g.fillRect(x - 2 + c, y - 8, 2, 3); g.fillRect(x + 2 - c, y - 8, 2, 3); }
    }
    this.row.update(camX, viewW, now);
    // camera flashes
    for (const fl of this.flashes) if (now >= fl.t) { g.fillStyle(0xffffff, 0.9); g.fillRect(fl.x - 2, fl.y - 2, 4, 4); g.fillStyle(0xffffff, 0.35); g.fillRect(fl.x - 5, fl.y - 1, 10, 2); g.fillRect(fl.x - 1, fl.y - 5, 2, 10); }
  }
}

/** Feet line of the sprite fan row (they sit on the lower-bowl riser; the riser's front wall hides their feet). */
export const FAN_ROW_FEET = 306;
const FAN_SCALE = SPRITE_SCALE * 0.7;
const FAN_LOOKS = 18;

/**
 * The row right behind the bench, celebs and scorer's table: plain fans drawn like the celebs (same shaded sprite
 * style) but smaller, dimmer and dressed down, bridging the detailed sideline people and the blob stands.
 */
class FanRow {
  fans: { sprite: Phaser.GameObjects.Sprite; x: number; away: boolean; phase: number; frame: number }[] = [];

  constructor(private scene: Phaser.Scene, private crowd: Crowd, home: string[], away: string, bigGame: boolean, seed: number) {
    const rng = new Phaser.Math.RandomDataGenerator([`fanrow${seed}${bigGame ? 'big' : ''}`]);
    const looks: { key: string; look: CelebLook }[] = [];
    for (let i = 0; i < FAN_LOOKS; i++) {
      const look = randomFan(() => rng.frac(), home, away, bigGame);
      const key = `fan_${seed}_${bigGame ? 1 : 0}_${i}`;
      if (!scene.textures.exists(key)) {
        const tex = scene.textures.addCanvas(key, buildCelebSheet(look))!;
        for (let f = 0; f < CELEB_FRAMES; f++) tex.add(f, 0, f * CELEB_W, 0, CELEB_W, CELEB_H);
      }
      looks.push({ key, look });
    }
    for (let ft = -10; ft <= 104; ft += 1.5) {
      if (rng.frac() < 0.04) continue; // an empty seat here and there
      const { key, look } = rng.pick(looks);
      const x = sx(ft) + rng.between(-3, 3);
      const sprite = scene.add.sprite(x, FAN_ROW_FEET, key, 0).setOrigin(0.5, 1).setScale(FAN_SCALE).setDepth(FAN_ROW_FEET).setTint(0xb4b0cc);
      this.fans.push({ sprite, x, away: look.side === 'away', phase: rng.frac() * 10, frame: 0 });
    }
    // front wall of their riser: hides their feet and reads as a raised row behind the sideline
    const wall = scene.add.graphics().setDepth(FAN_ROW_FEET + 1);
    const top = FAN_ROW_FEET - 10, W = WORLD_W + 400;
    wall.fillStyle(0x221b44, 1); wall.fillRect(-200, top, W, FLOOR_TOP - 40 - top);
    wall.fillStyle(0x3a3070, 1); wall.fillRect(-200, top, W, 2);
  }

  update(camX: number, viewW: number, now: number) {
    const t = now / 1000, crowd = this.crowd;
    for (const f of this.fans) {
      const on = f.x > camX - 40 && f.x < camX + viewW + 40;
      f.sprite.setVisible(on);
      if (!on) continue;
      const { jump, armsUp, boo } = crowd.reaction(f.x, f.away, now);
      let frame = 0;
      if (armsUp || crowd.hype > 0.7) frame = 1;
      else if (boo) frame = 3;
      else if (Math.sin(t / 1.9 + f.phase * 3) > 0.96) frame = 2; // now and then someone films the action
      f.frame = frame;
      const bob = frame === 1 ? -jump * 0.6 - 1 : Math.sin(t * (2 + crowd.hype * 6) + f.phase) * (0.3 + crowd.hype);
      f.sprite.setFrame(frame).setY(FAN_ROW_FEET + bob);
    }
  }
}
