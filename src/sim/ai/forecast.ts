/**
 * Round 61: the contest forecast. The shot equation is decided at the release, a windup after the gather, so the
 * question a shooter asks is not "is he on me now?" but "can he get a real contest up by the time it's out?".
 * This works out where each defender will be at the release (how long until he can move, his reaction, how far he
 * covers with the real acceleration, whether his hand will be up) and runs the real `evaluateShot` on those ghosts.
 * Phaser-free.
 */
import type { GameSim } from '../game';
import { Player } from '../player';
import { SHOT_TYPES } from '../data';
import { evaluateShot, selectShotType, windupFor, ShotEval } from '../shooting';
import { Vec, add, sub, scale, norm, dist, len, dot, v } from '../math';

/** Physics: velocity eases toward the wanted speed at this rate (1/s) on the ground (game.ts physics). */
const ACCEL = 9;
/** Fade Away drift (ft/s, = game.ts FADE_DRIFT). */
const FADE_DRIFT = 4;
/** A human defender's reaction to the gather (s). */
export const HUMAN_REACT = 0.18;
/** The defender's contest spot: this far in front of the shooter, on his line to the rim (ft). */
export const CONTEST_GAP = 2.4;

export interface Forecast {
  type: string; ev: ShotEval;
  /** the forecast contest (0 = nobody gets there) and the shot's worth in this game's scoring (pct x points) */
  contest: number; value: number;
  /** windup (s) and the nearest defender's forecast distance at the release (ft) */
  T: number; near: number;
  /** the stick that picks this shot (shotOptions) */
  stick?: Vec;
}
export interface ForecastOpts {
  /** the shooter's own extra delay before the gather (his think lag) */
  lead?: number;
  /** level noise: a fixed offset (ft, + = he thinks the defender gets closer) */
  noise?: number;
  /** just look at the contest right now (Easy, sometimes) */
  naive?: boolean;
}

/** Distance covered in t s from speed v0 (toward the spot) with top speed vmax under the physics' easing. */
export function coverDist(v0: number, vmax: number, t: number): number {
  if (t <= 0) return 0;
  return Math.max(0, vmax * t - ((vmax - v0) / ACCEL) * (1 - Math.exp(-ACCEL * t)));
}
const speedAfter = (v0: number, vmax: number, t: number) => vmax - (vmax - v0) * Math.exp(-ACCEL * Math.max(0, t));

/** Seconds before this defender can move at full effort (on the floor, in the air, staggered, stunned, screened). */
export function lockedFor(d: Player, now: number): number {
  let w = 0;
  if (d.state === 'fallen') w = Math.max(w, d.stateDur - d.stateT);
  if (d.z > 0 || d.vz > 0) w = Math.max(w, (d.vz + Math.sqrt(d.vz * d.vz + 64 * Math.max(0, d.z))) / 32); // lands (g = 32)
  if (d.jumpAt > now) w = Math.max(w, d.jumpAt - now + 0.55); // about to leave his feet on something
  w = Math.max(w, (d.stunnedUntil - now) * 0.9, (d.bumpedUntil - now) * 0.88, (d.screenedUntil - now) * 0.85, (d.staggerUntil - now) * 0.75);
  if (now < d.postLockUntil) w = Math.max(w, d.postLockUntil - now);
  return Math.max(0, w);
}

/** Where the shooter will be at the release: drives carry to the rim, jumpers keep a little, fades drift back. */
function shooterAt(sim: GameSim, p: Player, type: string, T: number): Vec {
  const rim = sim.rim(p.team), d = dist(p.p, rim), toRim = norm(sub(rim, p.p));
  const def = SHOT_TYPES[type];
  if (def.contact || type === 'floater' || type === 'stepThrough') {
    const travel = Math.max(0, d - (type === 'dunk' ? 1.2 : type === 'floater' ? d * 0.6 : 2.5));
    return add(p.p, scale(toRim, Math.min(travel, (type === 'stepThrough' ? 9 : 16) * T) * 0.9));
  }
  if (type === 'stepThroughJumper') return add(p.p, scale(toRim, Math.min(7, d - 2.5)));
  if (type === 'fade') return add(p.p, scale(toRim, -FADE_DRIFT * T));
  return add(p.p, scale(p.vel, 0.25 * T));
}

/** A copy of a player that reads through to the real one, with a few fields replaced. */
function ghost(p: Player, over: Partial<Pick<Player, 'p' | 'z' | 'vel'>>): Player {
  const g = Object.create(p) as Player;
  Object.assign(g, over);
  return g;
}

/**
 * What the shot equation will say at the release if he gathers now (after `lead`), and what the shot is worth.
 * Every rule in the real equation (cone, stagger, bit on the fake, post lock, open-shot moves, perks) applies.
 */
export function forecastShot(sim: GameSim, p: Player, type: string, o: ForecastOpts = {}): Forecast {
  const side = sim.side(p.team), rim = sim.rim(p.team);
  const lead = o.lead ?? 0;
  const T = windupFor(p, type) + lead;
  const now = sim.time;
  const ctx = { now: now + T, clutch: sim.clutch };
  if (o.naive) {
    const ev = evaluateShot(p, sim.opp(p.team), side, type, { now, clutch: sim.clutch });
    const near = Math.min(99, ...sim.opp(p.team).map((d) => dist(d.p, p.p)));
    return { type, ev, contest: ev.contest, value: ev.pct * sim.scoreValue(ev.pts), T, near };
  }
  const at = shooterAt(sim, p, type, T);
  const shooter = ghost(p, { p: at });
  const toRimAt = norm(sub(rim, at));
  const spot = add(at, scale(toRimAt, CONTEST_GAP));
  let near = 99;
  const ghosts = sim.opp(p.team).map((d) => {
    if (d.state === 'fallen' && d.stateDur - d.stateT > T) return d; // still down at the release: the equation skips him
    const human = sim.isHuman(d);
    const L = sim.cpuCfg(d);
    const react = human ? HUMAN_REACT : (L?.lag ?? 0) + 0.03;
    const lock = lockedFor(d, now);
    const toSpot = sub(spot, d.p), gap = len(toSpot), dir = norm(toSpot);
    const vmax = sim.topSpeed(d, false);
    const v0 = Math.max(0, dot(d.vel, dir));
    // the contest jump: an AI defender inside 7.5 ft goes up a beat after the gather and barely moves after that
    const jumps = dist(d.p, p.p) < 7.5 && d.z === 0;
    const jumpT = jumps ? (human ? 0.25 : ((L?.jump[0] ?? 0.1) + (L?.jump[1] ?? 0.28)) / 2 * (1.4 - d.sub.block / 99 * 0.6)) : T;
    // locked (down, staggered, stunned): no ground covered; reacting: he keeps the speed he already has toward the
    // spot; then he accelerates; once he jumps he coasts at the speed he left the floor with
    const groundT = Math.max(0, Math.min(T, jumpT) - lock);
    const carryT = lock > 0 ? 0 : Math.min(groundT, react);
    const v1 = lock > 0 ? 0 : v0;
    const runT = groundT - carryT;
    let s = v1 * carryT + coverDist(v1, vmax, runT);
    if (jumps && T > jumpT) s += speedAfter(v1, vmax, runT) * (T - Math.max(jumpT, lock)) * 0.9; // coasting in the air
    s = Math.min(gap, s + (o.noise ?? 0));
    const pos = add(d.p, scale(dir, Math.max(0, s)));
    near = Math.min(near, dist(pos, at));
    const handUp = jumps && T > jumpT + 0.05 && !(L && L.noJump >= 1);
    return ghost(d, { p: pos, z: handUp ? 0.5 : 0 });
  });
  const ev = evaluateShot(shooter, ghosts, side, type, ctx);
  return { type, ev, contest: ev.contest, value: ev.pct * sim.scoreValue(ev.pts), T, near };
}

/**
 * Every shot he can take from here (the stick picks it: standing type, back = floater / fade, toward = layup / dunk /
 * step-through in the fake window, sideways away from his man = hook / euro), best forecast value first.
 */
export function shotOptions(sim: GameSim, p: Player, o: ForecastOpts = {}): Forecast[] {
  const side = sim.side(p.team), rim = sim.rim(p.team), toRim = norm(sub(rim, p.p));
  const pr = { x: -toRim.y, y: toRim.x };
  const nd = sim.nearestDefender(p).d;
  const away = nd ? (dot(sub(nd.p, p.p), pr) > 0 ? -1 : 1) : 1;
  const sticks: Vec[] = [v(), scale(toRim, -1), toRim, scale(pr, away)];
  const seen = new Set<string>();
  const out: Forecast[] = [];
  for (const st of sticks) {
    const type = selectShotType(p, side, st, sim.time);
    if (seen.has(type) || !SHOT_TYPES[type] || type === 'jelly' || type.startsWith('alleyOop')) continue;
    seen.add(type);
    out.push({ ...forecastShot(sim, p, type, o), stick: st });
  }
  return out.sort((a, b) => b.value - a.value);
}
