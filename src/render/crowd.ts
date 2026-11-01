import Phaser from 'phaser';
import { CROWD_TOP, CROWD_ROWS, CROWD_ROW_H, WORLD_W } from './view';

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

  constructor(private scene: Phaser.Scene, homeColor: string, awayColor: string) {
    this.g = scene.add.graphics().setDepth(-990);
    const rng = new Phaser.Math.RandomDataGenerator(['fans']);
    const home = Phaser.Display.Color.HexStringToColor(homeColor).color;
    const away = Phaser.Display.Color.HexStringToColor(awayColor).color;
    const neutral = [0x3b4a6b, 0x6b3b3b, 0x4b6b3b, 0x8a7a5a, 0x5a5a8a, 0x2f2f3f, 0xb07040, 0xdddddd, 0x222222];
    for (let row = 0; row < CROWD_ROWS; row++) {
      // back rows sit in the shadow under the upper deck; front rows catch the court lights
      const lit = 0.5 + 0.5 * (row / (CROWD_ROWS - 1));
      for (let x = -150 + (row % 2) * 6; x < WORLD_W + 150; x += 12) {
        if (rng.frac() < 0.05) continue; // a few empty seats
        const isAway = rng.frac() < 0.12;
        const base = rng.frac() < 0.45 ? (isAway ? away : home) : rng.pick(neutral);
        const skin = rng.pick(SKINS);
        this.fans.push({
          x: x + rng.between(-2, 2), row, shirt: mul(base, 0.6 * lit), shirtLit: mul(base, 0.85 * lit), skin: mul(skin, 0.62 * lit), skinLit: mul(skin, 0.9 * lit),
          hair: mul(rng.pick(HAIRS), lit), phase: rng.frac() * 10, away: isAway, standClutch: rng.frac() < 0.5, seat: true, size: 0.9 + rng.frac() * 0.25,
        });
      }
    }
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
      let jump = 0, armsUp = false, boo = false;
      for (const e of this.events) {
        const delay = Math.abs(f.x - e.x) / 900 * 1000;
        const age = now - e.t - delay;
        if (age < 0 || age > 1600) continue;
        const mine = e.home ? !f.away : f.away;
        if (e.boo) { if (!f.away) boo = true; continue; }
        if (!mine) continue;
        const k = 1 - age / 1600;
        jump = Math.max(jump, Math.abs(Math.sin(age / 90)) * 7 * e.power * k);
        armsUp = true;
      }
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
    // camera flashes
    for (const fl of this.flashes) if (now >= fl.t) { g.fillStyle(0xffffff, 0.9); g.fillRect(fl.x - 2, fl.y - 2, 4, 4); g.fillStyle(0xffffff, 0.35); g.fillRect(fl.x - 5, fl.y - 1, 10, 2); g.fillRect(fl.x - 1, fl.y - 5, 2, 10); }
  }
}
