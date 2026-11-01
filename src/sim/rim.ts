/**
 * Live rim: after a shot reaches the hoop, the ball plays a short scripted sequence (rattles,
 * rolls, glass, high bounces) before it drops in or comes off as a rebound. Make/miss is still
 * decided at release; this only decides *how* it happens. Coordinates are rim-local:
 * dx = toward the backboard (+), dy = across the rim, z = absolute height (ft).
 */
import { Rng } from './math';

export type RimSeq =
  | 'swish' | 'rimIn' | 'rollIn' | 'glassIn' | 'kissIn'
  | 'rattleOut' | 'inOut' | 'backIron' | 'frontRim' | 'boardRim' | 'highBounce';

export interface RimKey { t: number; dx: number; dy: number; z: number; sound?: 'tick' | 'clank' | 'board' | 'net' }
export interface RimPath { seq: RimSeq; made: boolean; keys: RimKey[]; exit?: { dx: number; dy: number; vz: number; speed: number } }

const R = 0.75; // rim radius, ft

export function pickSeq(made: boolean, jumper: boolean, contest: number, rng: Rng): RimSeq {
  if (made) {
    const r = rng.next();
    // plenty of swishes on clean looks, but makes also kiss the rim, bounce around and roll in
    if (jumper && contest < 0.25 && r < 0.45) return 'swish';
    if (r < 0.64) return jumper ? 'kissIn' : 'glassIn';
    if (r < 0.82) return 'rimIn';
    if (r < 0.94) return 'rollIn';
    return jumper ? 'swish' : 'glassIn';
  }
  return rng.pick(['rattleOut', 'rattleOut', 'inOut', 'backIron', 'frontRim', 'boardRim', 'highBounce'] as RimSeq[]);
}

/** Circle the rim from angle a0 to a1 (radians) over time dur, starting at t0, with occasional ticks. */
function roll(t0: number, dur: number, a0: number, a1: number, n = 6): RimKey[] {
  const out: RimKey[] = [];
  for (let i = 1; i <= n; i++) {
    const k = i / n, a = a0 + (a1 - a0) * k;
    out.push({ t: t0 + dur * k, dx: Math.cos(a) * R, dy: Math.sin(a) * R, z: 10.15 + 0.08 * Math.sin(k * Math.PI * 3), sound: i % 3 === 0 ? 'tick' : undefined });
  }
  return out;
}

export function buildPath(seq: RimSeq, rng: Rng): RimPath {
  const side = rng.chance(0.5) ? 1 : -1;
  const net: RimKey = { t: 0, dx: 0, dy: 0, z: 9.6, sound: 'net' };
  // made: the ball keeps going down through the net and out of the bottom of it
  const done = (keys: RimKey[], made: boolean, exit?: RimPath['exit']): RimPath =>
    ({ seq, made, keys: made ? [...keys, { t: keys[keys.length - 1].t + 0.09, dx: 0.05, dy: 0, z: 8.4 }] : keys, exit });
  switch (seq) {
    case 'swish': return done([{ t: 0, dx: -0.1, dy: 0, z: 10.2 }, { ...net, t: 0.08 }], true);
    case 'kissIn': return done([{ t: 0, dx: -R, dy: 0, z: 10.15, sound: 'tick' }, { ...net, t: 0.14 }], true);
    case 'glassIn': return done([{ t: 0, dx: 1.2, dy: 0.2 * side, z: 11.2, sound: 'board' }, { t: 0.14, dx: 0.3, dy: 0, z: 10.4 }, { ...net, t: 0.24 }], true);
    case 'rimIn': return done([{ t: 0, dx: -R, dy: 0, z: 10.15, sound: 'clank' }, { t: 0.22, dx: 0.1, dy: 0.1 * side, z: 11.7 }, { t: 0.42, dx: R * 0.6, dy: 0, z: 10.2, sound: 'tick' }, { ...net, t: 0.55 }], true);
    case 'rollIn': {
      const dur = rng.range(0.4, 0.8);
      return done([{ t: 0, dx: -R, dy: 0, z: 10.15, sound: 'tick' }, ...roll(0, dur, Math.PI, Math.PI + side * Math.PI * 1.6), { ...net, t: dur + 0.12 }], true);
    }
    case 'rattleOut': {
      const keys: RimKey[] = [{ t: 0, dx: -R, dy: 0, z: 10.15, sound: 'clank' }];
      const n = rng.chance(0.5) ? 2 : 3;
      let t = 0, x = -R;
      for (let i = 0; i < n; i++) {
        t += 0.18; keys.push({ t, dx: x * -0.2, dy: rng.range(-0.3, 0.3), z: 10.9 + rng.range(0, 0.6) });
        x = -x; t += 0.17; keys.push({ t, dx: x, dy: rng.range(-0.4, 0.4), z: 10.15, sound: i === n - 1 ? 'clank' : 'tick' });
      }
      const ang = rng.range(0, Math.PI * 2);
      return done(keys, false, { dx: Math.cos(ang), dy: Math.sin(ang), vz: rng.range(4, 7), speed: rng.range(5, 9) });
    }
    case 'inOut': {
      const dur = rng.range(0.45, 0.7);
      const a1 = Math.PI + side * Math.PI * 1.5;
      return done([{ t: 0, dx: -R, dy: 0, z: 10.15, sound: 'tick' }, ...roll(0, dur, Math.PI, a1)], false, { dx: Math.cos(a1), dy: Math.sin(a1), vz: 4, speed: rng.range(6, 10) });
    }
    case 'backIron': return done([{ t: 0, dx: R, dy: rng.range(-0.3, 0.3), z: 10.15, sound: 'clank' }], false, { dx: -1, dy: rng.range(-0.5, 0.5), vz: rng.range(6, 9), speed: rng.range(11, 15) });
    case 'frontRim': return done([{ t: 0, dx: -R, dy: rng.range(-0.3, 0.3), z: 10.15, sound: 'clank' }], false, { dx: -1, dy: rng.range(-0.4, 0.4), vz: rng.range(5, 7), speed: rng.range(3, 6) });
    case 'boardRim': return done([{ t: 0, dx: 1.2, dy: 0.3 * side, z: 11.6, sound: 'board' }, { t: 0.16, dx: -0.6, dy: 0.2 * side, z: 10.2, sound: 'clank' }], false, { dx: -0.6, dy: side, vz: 5, speed: rng.range(6, 10) });
    case 'highBounce': return done([{ t: 0, dx: 0.4, dy: 0, z: 10.15, sound: 'clank' }, { t: 0.45, dx: 0.1, dy: 0.2 * side, z: 15.5 }, { t: 0.9, dx: -0.3, dy: 0.4 * side, z: 10.25, sound: 'tick' }], false, { dx: rng.range(-1, 1), dy: side, vz: 4, speed: rng.range(5, 9) });
  }
}

/** Ball position along a path at time t (linear between keys, small arc between bounces). */
export function sampleRim(path: RimPath, t: number): { dx: number; dy: number; z: number } {
  const k = path.keys;
  if (t <= k[0].t) return k[0];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i].t) {
      const a = k[i - 1], b = k[i];
      const u = (t - a.t) / Math.max(1e-6, b.t - a.t);
      return { dx: a.dx + (b.dx - a.dx) * u, dy: a.dy + (b.dy - a.dy) * u, z: a.z + (b.z - a.z) * u + Math.sin(u * Math.PI) * 0.25 };
    }
  }
  return k[k.length - 1];
}

export const pathEnd = (p: RimPath) => p.keys[p.keys.length - 1].t;
