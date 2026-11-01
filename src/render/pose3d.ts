/**
 * Multi-angle players: lift a side-view skeleton pose to 3D and look at it from any yaw.
 *
 * Every clip is authored in profile facing +x, with near (F) and far (B) limbs. lift() gives each joint
 * [forward, lateral, up]: forward = the authored x, lateral = + for the near side (the player's right when facing
 * screen-right), - for the far side. project() turns the body by `yaw` toward the camera:
 *   yaw 0 = facing screen-right (the authored side view, unchanged), +90 = facing the camera, -90 = facing away.
 * Mirrors (facing left) are done by flipping the sprite, so only yaw in [-90, 90] is ever drawn.
 * Pure TS so it can be unit-tested.
 */
import type { J, JointName, Pose } from './anim';

export type J3 = [number, number, number];
export type Pose3 = Record<JointName, J3> & { ball?: J3 | null };

/** Half-widths (figure units) used to spread a profile pose sideways. */
export const SHOULDER_HALF = 12.5, HIP_HALF = 5;

const SIDE: Record<JointName, number> = {
  head: 0, neck: 0, hip: 0,
  sF: SHOULDER_HALF, eF: SHOULDER_HALF, hF: SHOULDER_HALF,
  sB: -SHOULDER_HALF, eB: -SHOULDER_HALF, hB: -SHOULDER_HALF,
  kF: HIP_HALF, fF: HIP_HALF, kB: -HIP_HALF, fB: -HIP_HALF,
};

export function lift(p: Pose): Pose3 {
  const o = {} as Pose3;
  // a pose can spread joints sideways (lat: wide feet, knees out, arms spread) - invisible at yaw 0
  for (const k of Object.keys(SIDE) as JointName[]) o[k] = [p[k][0], p.lat?.[k] ?? SIDE[k], p[k][1]];
  if (p.ball) {
    // the ball sits on the side of whichever hand is nearer to it
    const dF = Math.hypot(p.hF[0] - p.ball[0], p.hF[1] - p.ball[1]), dB = Math.hypot(p.hB[0] - p.ball[0], p.hB[1] - p.ball[1]);
    o.ball = [p.ball[0], (dF <= dB ? 1 : -1) * SHOULDER_HALF * 0.9, p.ball[1]];
  } else o.ball = null;
  return o;
}

/** Screen x of a 3D point at a yaw (radians). */
export const projX = (q: J3, yaw: number) => q[0] * Math.cos(yaw) - q[1] * Math.sin(yaw);
/** How far toward the camera a 3D point is at a yaw (bigger = nearer = drawn later). */
export const depth = (q: J3, yaw: number) => q[0] * Math.sin(yaw) + q[1] * Math.cos(yaw);

/** Project a lifted pose back to a 2D pose at `yaw` (joint names keep their meaning: F = the player's right side). */
export function project(p3: Pose3, yaw: number, base: Pose): Pose {
  const o: Pose = { ...base };
  for (const k of Object.keys(SIDE) as JointName[]) o[k] = [projX(p3[k], yaw), p3[k][2]];
  o.ball = p3.ball ? [projX(p3.ball, yaw), p3.ball[2]] : null;
  return o;
}

/** The 2D side pose seen at `yaw`, plus each joint's depth for draw order. */
export function view(p: Pose, yaw: number): { pose: Pose; depth: Record<JointName, number>; ballDepth: number } {
  const p3 = lift(p);
  const d = {} as Record<JointName, number>;
  for (const k of Object.keys(SIDE) as JointName[]) d[k] = depth(p3[k], yaw);
  return { pose: project(p3, yaw, p), depth: d, ballDepth: p3.ball ? depth(p3.ball, yaw) : 0 };
}

/** The 8 drawn directions: yaw (deg) actually rendered plus whether the sprite is mirrored. */
export const DIRS: { yaw: number; flip: boolean }[] = [
  { yaw: 0, flip: false }, { yaw: 45, flip: false }, { yaw: 90, flip: false }, { yaw: 45, flip: true },
  { yaw: 0, flip: true }, { yaw: -45, flip: true }, { yaw: -90, flip: false }, { yaw: -45, flip: false },
];
export const toRad = (deg: number) => (deg * Math.PI) / 180;
export type { J };
