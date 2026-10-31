import { Vec, v, dist } from './math';

/** Court in feet. x: 0..94 baseline to baseline, y: 0..50 sideline to sideline (y=0 is the far sideline on screen). */
export const COURT_L = 94;
export const COURT_W = 50;
export const MID_X = 47;
export const RIM_OFFSET = 5.25;
export const RIM_HEIGHT = 10;
export const THREE_R = 23.75;
export const THREE_CORNER = 22;
export const CORNER_Y = 14; // corner-3 straightaway runs this far from the baseline
export const RESTRICTED_R = 4;

export type Side = 1 | -1; // 1 = attacking the right rim (x=94), -1 = attacking the left rim

export const rimPos = (side: Side): Vec => v(side === 1 ? COURT_L - RIM_OFFSET : RIM_OFFSET, COURT_W / 2);

/** Half-court frame -> court coords. hx: feet from the attacked baseline, hy: lateral offset from center (-25..25). */
export function hc(side: Side, hx: number, hy: number): Vec {
  return v(side === 1 ? COURT_L - hx : hx, COURT_W / 2 + hy * side);
}
export function toHc(side: Side, p: Vec): { hx: number; hy: number } {
  return { hx: side === 1 ? COURT_L - p.x : p.x, hy: (p.y - COURT_W / 2) * side };
}

export function isCorner(side: Side, p: Vec): boolean {
  const { hx, hy } = toHc(side, p);
  return hx < CORNER_Y && Math.abs(hy) > THREE_CORNER - 1;
}

export function isThree(side: Side, p: Vec): boolean {
  const { hx, hy } = toHc(side, p);
  if (hx < CORNER_Y) return Math.abs(hy) >= THREE_CORNER;
  return dist(p, rimPos(side)) >= THREE_R;
}

export function inFrontcourt(side: Side, p: Vec): boolean {
  return side === 1 ? p.x > MID_X : p.x < MID_X;
}

/** Named offensive spots in the half-court frame [hx, hy]. */
export const SPOTS: Record<string, [number, number]> = {
  top: [30, 0], ls: [28, -9], rs: [28, 9],
  lw: [21, -19], rw: [21, 19],
  lc: [3, -22.5], rc: [3, 22.5],
  le: [19, -7], re: [19, 7],
  fl: [20, -5], fr: [20, 5],
  lb: [7, -7.5], rb: [7, 7.5],
  ldk: [4, -10], rdk: [4, 10],
  rim: [6, 0],
  back: [40, 0],
};

export const spot = (side: Side, name: string): Vec => {
  const s = SPOTS[name] ?? SPOTS.top;
  return hc(side, s[0], s[1]);
};

export function clampToCourt(p: Vec): Vec {
  return v(Math.max(0.8, Math.min(COURT_L - 0.8, p.x)), Math.max(0.8, Math.min(COURT_W - 0.8, p.y)));
}
