/**
 * Ball physics at the hoop. A shot's make/miss is decided at release by the shot equation; this module only decides
 * HOW it happens: `planShot` searches for a real physical trajectory (launch arc + aim error) whose simulated result
 * matches the decided outcome, and the sim plays it back. The ball is a sphere under gravity; the rim is a solid ring
 * (torus) it can roll on, rattle off or spin out of; the backboard is a plane; the net slows a ball inside it.
 * Pure and deterministic (fixed step, randomness only from the passed-in Rng).
 */
import { Rng, clamp } from './math';
import { RIM_HEIGHT } from './court';

export interface V3 { x: number; y: number; z: number }
const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z });

export const BALL_R = 0.39;     // ft (9.4" diameter)
export const RIM_R = 0.75;      // ring radius to the center of the iron
const IRON = 0.03;              // iron tube radius
export const GRAVITY = 32;      // ft/s²
const STEP = 1 / 240;
const SAMPLE = 1 / 60;
const RIM_E = 0.58, RIM_FRICTION = 0.82;      // restitution / tangential keep on the iron
const BOARD_E = 0.62, BOARD_FRICTION = 0.9;

/** A hoop: rim center on the court plane, and which way the backboard is from it (+1 = +x). */
export interface Hoop { x: number; y: number; dir: 1 | -1 }
const boardX = (h: Hoop) => h.x + h.dir * 1.25;
const BOARD_Y = 3, BOARD_Z0 = 9.6, BOARD_Z1 = 13.1;

export type ContactKind = 'rim' | 'board' | 'net';
export interface Contact { t: number; kind: ContactKind; speed: number }
export interface ShotSim {
  /** ball center every SAMPLE s from release */
  samples: V3[];
  contacts: Contact[];
  /** time the ball dropped through the ring (made), else null */
  through: number | null;
  end: { t: number; p: V3; v: V3 };
  /** ended by the time cap (e.g. stuck rolling) — not a usable plan */
  timedOut: boolean;
}

/** Fly a ball from p0 with velocity v0 until it is clearly done with the hoop. */
export function simulateShot(p0: V3, v0: V3, hoop: Hoop, maxT = 4): ShotSim {
  const p = { ...p0 }, v = { ...v0 };
  const samples: V3[] = [{ ...p }];
  const contacts: Contact[] = [];
  let through: number | null = null;
  let t = 0, nextSample = SAMPLE, touchedHoop = false;
  const bx = boardX(hoop);
  const touch = (kind: ContactKind, speed: number) => {
    const last = contacts[contacts.length - 1];
    if (last && last.kind === kind && t - last.t < 0.06) { last.speed = Math.max(last.speed, speed); return; }
    if (speed > 0.6) contacts.push({ t, kind, speed });
  };
  while (t < maxT) {
    t += STEP;
    const prevZ = p.z;
    v.z -= GRAVITY * STEP;
    p.x += v.x * STEP; p.y += v.y * STEP; p.z += v.z * STEP;

    // rim: nearest point on the ring
    const dx = p.x - hoop.x, dy = p.y - hoop.y;
    const hr = Math.hypot(dx, dy);
    const ux = hr > 1e-6 ? dx / hr : 1, uy = hr > 1e-6 ? dy / hr : 0;
    const qx = hoop.x + ux * RIM_R, qy = hoop.y + uy * RIM_R;
    const nx0 = p.x - qx, ny0 = p.y - qy, nz0 = p.z - RIM_HEIGHT;
    const dl = Math.hypot(nx0, ny0, nz0);
    if (dl < BALL_R + IRON && dl > 1e-6) {
      const nx = nx0 / dl, ny = ny0 / dl, nz = nz0 / dl;
      const vn = v.x * nx + v.y * ny + v.z * nz;
      if (vn < 0) {
        const tx = v.x - vn * nx, ty = v.y - vn * ny, tz = v.z - vn * nz;
        const out = -vn * RIM_E;
        v.x = tx * RIM_FRICTION + out * nx; v.y = ty * RIM_FRICTION + out * ny; v.z = tz * RIM_FRICTION + out * nz;
        touch('rim', -vn); touchedHoop = true;
      }
      const push = BALL_R + IRON - dl;
      p.x += nx * push; p.y += ny * push; p.z += nz * push;
    }

    // backboard: the ball can't pass the plane while it's in front of the glass
    const pen = (p.x - bx) * hoop.dir + BALL_R;
    if (pen > 0 && pen < 0.6 && Math.abs(p.y - hoop.y) < BOARD_Y + BALL_R * 0.5 && p.z > BOARD_Z0 - BALL_R * 0.5 && p.z < BOARD_Z1 + BALL_R * 0.5) {
      const vIn = v.x * hoop.dir;
      if (vIn > 0) { v.x = -v.x * BOARD_E; v.y *= BOARD_FRICTION; v.z *= BOARD_FRICTION; touch('board', vIn); touchedHoop = true; }
      p.x -= hoop.dir * pen;
    }

    // net: a ball inside the ring below the iron gets slowed by the cords
    const inRing = hr < RIM_R - 0.1;
    if (inRing && p.z < RIM_HEIGHT + 0.2) {
      const k = Math.max(0, 1 - 3.2 * STEP);
      v.x *= k; v.y *= k; v.z *= Math.max(0, 1 - 1.6 * STEP);
      // the net funnels it to the middle
      v.x -= dx * 6 * STEP; v.y -= dy * 6 * STEP;
    }
    if (t >= nextSample) { samples.push({ ...p }); nextSample += SAMPLE; }

    // done: dropped through the ring (the sim takes over the fall through the net), or falling away from the hoop,
    // or flying off
    if (through === null && inRing && prevZ >= RIM_HEIGHT - 0.4 && p.z < RIM_HEIGHT - 0.4) {
      through = t; touch('net', Math.abs(v.z));
      return { samples, contacts, through, end: { t, p: { ...p }, v: { ...v } }, timedOut: false };
    }
    const away = hr > RIM_R + BALL_R + 0.25;
    if (away && v.z < 0 && p.z < RIM_HEIGHT - 1.2) return { samples, contacts, through, end: { t, p: { ...p }, v: { ...v } }, timedOut: false };
    if (touchedHoop && hr > 4) return { samples, contacts, through, end: { t, p: { ...p }, v: { ...v } }, timedOut: false };
    if (p.z < 1) return { samples, contacts, through, end: { t, p: { ...p }, v: { ...v } }, timedOut: false };
  }
  return { samples, contacts, through, end: { t, p: { ...p }, v: { ...v } }, timedOut: true };
}

/** Launch velocity from p0 at angle theta (radians above horizontal) so the ball's center passes through `aim`. */
export function launchVelocity(p0: V3, aim: V3, theta: number, g = GRAVITY): V3 | null {
  const dx = aim.x - p0.x, dy = aim.y - p0.y, D = Math.hypot(dx, dy), h = aim.z - p0.z;
  if (D < 0.05) return v3(0, 0, Math.sqrt(2 * g * Math.max(0.5, h + 0.5)));
  const c = Math.cos(theta), den = 2 * c * c * (D * Math.tan(theta) - h);
  if (den <= 0) return null;
  const sp = Math.sqrt((g * D * D) / den);
  return v3((dx / D) * sp * c, (dy / D) * sp * c, sp * Math.sin(theta));
}

/** Arc by shot type (degrees above horizontal at release). */
const ARC: Record<string, number> = { mid: 50, three: 49, deep3: 47, stepThroughJumper: 50, floater: 62, hook: 56, layup: 58, euro: 58, stepThrough: 58, push: 55 };
const BANKERS = new Set(['layup', 'euro', 'stepThrough', 'push']);

export interface ShotPlan extends ShotSim { aim: V3; swish: boolean; airball: boolean; fallback: boolean }

export interface PlanInput {
  release: V3; hoop: Hoop; type: string; made: boolean; airball: boolean;
  /** shot distance (ft) and how contested (0..1) — bigger misses from deep / under pressure */
  dist: number; contest: number;
}

/**
 * Find a physical shot that produces the decided result. Makes aim close to center (physics decides swish vs. a
 * kiss / roll-in); misses aim with an error that grows with distance and contest (deep misses: short = front rim,
 * long = back iron / glass); airballs miss everything.
 */
export function planShot(inp: PlanInput, rng: Rng): ShotPlan {
  const { release, hoop, type, made, airball } = inp;
  const toHoop = { x: hoop.x - release.x, y: hoop.y - release.y };
  const L = Math.hypot(toHoop.x, toHoop.y) || 1;
  const along = { x: toHoop.x / L, y: toHoop.y / L }, lat = { x: -along.y, y: along.x };
  const arc = ((ARC[type] ?? 52) + rng.range(-2, 2)) * Math.PI / 180;
  const spread = (0.22 + inp.dist * 0.018) * (1 + 0.8 * clamp(inp.contest, 0, 1));
  // layups from an angle go off the glass sometimes: aim above the rim on the backboard side
  const sideAngle = Math.abs(along.y);
  const bank = BANKERS.has(type) && sideAngle > 0.3 && rng.chance(0.55);
  // close in, the ball has to get up over the near iron: loft it more (cycled per attempt for variety)
  const close = clamp((8 - inp.dist) / 6, 0, 1);
  let attempt = 0;
  const tryAim = (a: number, l: number, zAim = RIM_HEIGHT + 0.05): ShotPlan | null => {
    const aim = v3(hoop.x + along.x * a + lat.x * l, hoop.y + along.y * a + lat.y * l, zAim);
    const th0 = Math.min(1.42, arc + close * ((attempt++ % 4) * 0.1 + 0.12));
    // released above the line to the aim point (high release): loft it more until there's an arc
    let vel: V3 | null = null;
    for (let th = th0; !vel && th < 1.5; th += 0.1) vel = launchVelocity(release, aim, th);
    if (!vel) return null;
    const sim = simulateShot(release, vel, hoop);
    if (sim.timedOut) return null;
    const hit = sim.contacts.some((c) => c.kind !== 'net');
    return { ...sim, aim, swish: sim.through !== null && !hit, airball: !hit && sim.through === null, fallback: false };
  };
  const ok = (p: ShotPlan | null) => !!p && (made ? p.through !== null : p.through === null && (airball ? p.airball : !p.airball));
  for (let i = 0; i < 40; i++) {
    let a: number, l: number, z = RIM_HEIGHT + 0.05;
    if (made) {
      // anywhere a ball can still go in: dead center swishes, near the iron it kisses, rattles or rolls in
      const s = i < 20 ? 1 : 0.5;
      a = rng.range(-0.55, 0.42) * s; l = rng.range(-0.4, 0.4) * s;
      if (bank && i < 20) { a = rng.range(0.55, 0.86); l = rng.range(-0.35, 0.35); z = RIM_HEIGHT + rng.range(0.7, 1.7); }
    } else if (airball) {
      // short of everything, or wide of the rim (long ones would just hit the glass)
      if (rng.chance(0.65)) { a = -(1.5 + rng.range(0, 1.5)); l = rng.range(-0.8, 0.8); }
      else { a = rng.range(-0.8, 0.2); l = (rng.chance(0.5) ? 1 : -1) * (1.4 + rng.range(0, 0.9)); }
    } else {
      // short or long, plus some side to side; deep shots miss by more
      const short = rng.chance(0.55);
      a = (short ? -1 : 1) * (0.35 + Math.abs(rng.range(-1, 1)) * spread * 1.6); l = rng.range(-1, 1) * spread * 0.8;
      if (bank && i < 20) { a = rng.range(0.5, 0.86); l = rng.range(-0.7, 0.7); z = RIM_HEIGHT + rng.range(0.6, 2.0); }
    }
    const p = tryAim(a, l, z);
    if (ok(p)) return p!;
  }
  // fallbacks that always produce the decided outcome
  const forced = made ? tryAim(0, 0) : tryAim(airball ? -2.4 : -0.85, 0.05);
  if (forced && ok(forced)) return { ...forced, fallback: true };
  const last = made ? tryAim(0.02, 0, RIM_HEIGHT + 0.6) : tryAim(-1.0, 0.3);
  if (last && ok(last)) return { ...last, fallback: true };
  return scriptedPlan(release, hoop, along, made);
}

/** Last resort (odd release spots): a simple drop into the ring, or off the front of it. */
function scriptedPlan(release: V3, hoop: Hoop, along: { x: number; y: number }, made: boolean): ShotPlan {
  const T = 0.7, n = Math.round(T / SAMPLE);
  const top = v3(hoop.x - along.x * (made ? 0 : RIM_R), hoop.y - along.y * (made ? 0 : RIM_R), RIM_HEIGHT + (made ? -0.45 : 0.4));
  const samples: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    samples.push(v3(release.x + (top.x - release.x) * k, release.y + (top.y - release.y) * k, release.z + (top.z - release.z) * k + Math.sin(Math.PI * k) * 3));
  }
  const end = { t: T, p: top, v: made ? v3(0, 0, -8) : v3(-along.x * 7, -along.y * 7, 5) };
  return { samples, contacts: made ? [{ t: T, kind: 'net', speed: 8 }] : [{ t: T, kind: 'rim', speed: 9 }], through: made ? T : null, end, timedOut: false, aim: top, swish: made, airball: false, fallback: true };
}

/** Ball position along a plan at time t (linear between 60 Hz samples). */
export function samplePlan(plan: ShotSim, t: number): V3 {
  const s = plan.samples;
  const f = clamp(t / SAMPLE, 0, s.length - 1);
  const i = Math.floor(f), k = f - i;
  const a = s[i], b = s[Math.min(s.length - 1, i + 1)];
  return v3(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
}
