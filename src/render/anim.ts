/**
 * Keyframe animation. Poses are skeletons in a canonical figure 100 units tall (top of head = 100,
 * floor = 0, +x = facing direction). Clips list keyframes at normalized times; at sprite-build time
 * each clip is sampled into N frames with eased joint interpolation, which gives smooth in-betweens.
 * Pure TS so it can be unit-tested.
 */
export type J = [number, number];
export const JOINTS = ['head', 'neck', 'sF', 'sB', 'eF', 'eB', 'hF', 'hB', 'hip', 'kF', 'kB', 'fF', 'fB'] as const;
export type JointName = (typeof JOINTS)[number];
/**
 * backView: player turned away from the camera (spin moves) - drawn without a face.
 * lat: optional sideways spread per joint for multi-angle drawing (pose3d.lift): invisible from the side (yaw 0),
 * it shows as soon as the player turns (wide feet, knees out, arms spread). Interpolated between keys.
 */
export type Pose = Record<JointName, J> & { ball?: J | null; backView?: boolean; lat?: Partial<Record<JointName, number>>; headTurn?: number; ballLat?: number };
type PosePatch = Partial<Record<JointName, J>> & { ball?: J | null; backView?: boolean; lat?: Partial<Record<JointName, number>>; headTurn?: number; ballLat?: number };

export const BASE: Pose = {
  head: [1, 91], neck: [0, 82], sF: [2, 79], sB: [-2, 79], eF: [4, 65], eB: [-3, 65], hF: [5, 52], hB: [-3, 52],
  hip: [0, 51], kF: [3, 27], kB: [-2, 27], fF: [3, 0], fB: [-3, 0], ball: null,
};

const P = (patch: PosePatch, from: Pose = BASE): Pose => ({ ...from, ...patch });

/** Catmull-Rom between p1 and p2 (defined up here so clips can be resampled while they're being built). */
const cr = (p0: J, p1: J, p2: J, p3: J, t: number): J => {
  const t2 = t * t, t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
};


export interface Key { t: number; pose: Pose }
export interface Clip {
  name: string; frames: number; loop?: boolean; keys: Key[];
  /** normalized time the ball leaves the hand (shots) */
  release?: number;
  /** seconds of follow-through after release */
  post?: number;
  /** normalized times where a dribbled ball hits the floor */
  bounce?: number[];
}

// ---------- reusable poses ----------
const athletic = P({ head: [2, 89], neck: [1, 80], sF: [2, 77], sB: [-2, 77], hip: [0, 48], kF: [4, 25], kB: [-3, 25], fF: [5, 0], fB: [-5, 0] });
const dribHigh = P({ eF: [8, 63], hF: [11, 49], ball: [12, 45], eB: [-1, 65], hB: [5, 58] }, athletic);
const dribLow = P({ eF: [8, 60], hF: [11, 43], ball: [12, 4], eB: [-1, 65], hB: [5, 58] }, athletic);
const chest = P({ hF: [7, 60], hB: [5, 59], eF: [5, 66], eB: [1, 66], ball: [8, 61] });
/** Triple threat after picking up the dribble: the hold loop, the pump fake and the step-through all start here. */
const TRIPLE = P({ hip: [0, 47], kF: [6, 23], fF: [9, 0], kB: [-6, 23], fB: [-9, 0], hF: [7, 66], hB: [5, 65], eF: [8, 60], eB: [4, 60], ball: [8, 67], head: [2, 89] });
// ---------- fixed-length limbs (authoring-time two-bone solve) ----------
/** Arm and leg bone lengths for re-keyed clips (about BASE's). */
export const ARM_U = 14, ARM_F = 13.5, THIGH = 24, SHIN = 27;
/**
 * Two-bone solve: the middle joint (elbow/knee) for a root->end span with bone lengths l1/l2, bending to an explicit
 * side (+1 = counter-clockwise of root->end, so it never flips). Out of reach: the limb straightens toward the target
 * and `end` is pulled in to where the straight limb ends.
 */
export function limb(root: J, end: J, l1: number, l2: number, side: 1 | -1): { mid: J; end: J } {
  const dx = end[0] - root[0], dy = end[1] - root[1], d0 = Math.hypot(dx, dy);
  const ux = d0 > 1e-6 ? dx / d0 : 0, uy = d0 > 1e-6 ? dy / d0 : -1;
  if (d0 >= l1 + l2) return { mid: [root[0] + ux * l1, root[1] + uy * l1], end: [root[0] + ux * (l1 + l2), root[1] + uy * (l1 + l2)] };
  const d = Math.max(d0, Math.abs(l1 - l2) + 1e-3);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  return { mid: [root[0] + ux * a - uy * h * side, root[1] + uy * a + ux * h * side], end };
}
/** Put the hands at fixed arm length (elbows solved; -1 = natural elbow: behind for low hands, in front overhead). */
export function arms(p: Pose, hF?: J | null, hB?: J | null, side: [1 | -1, 1 | -1] = [-1, -1]): Pose {
  const o: Pose = { ...p };
  if (hF) { const r = limb(p.sF, hF, ARM_U, ARM_F, side[0]); o.eF = r.mid; o.hF = r.end; }
  if (hB) { const r = limb(p.sB, hB, ARM_U, ARM_F, side[1]); o.eB = r.mid; o.hB = r.end; }
  return o;
}
/** Put the feet at fixed leg length (knees bend forward). */
export function legs(p: Pose, fF?: J | null, fB?: J | null): Pose {
  const o: Pose = { ...p };
  if (fF) { const r = limb(p.hip, fF, THIGH, SHIN, 1); o.kF = r.mid; o.fF = r.end; }
  if (fB) { const r = limb(p.hip, fB, THIGH, SHIN, 1); o.kB = r.mid; o.fB = r.end; }
  return o;
}

/** Crouched stance for the crossing ready dribble. */
const READY = P({ hip: [0, 42], kF: [9, 20], fF: [13, 0], kB: [-8, 20], fB: [-12, 0], head: [3, 82], neck: [2, 73], sF: [3, 70], sB: [-1, 70] });
/** Stationary dribble: the hand stays around the hip (elbow bent) and the ball comes back up to it. */
const dribAt = (hand: J, ball: J, guard: J = [5, 60]): Pose => ({ ...arms(athletic, hand, guard), ball });
/**
 * Defensive stance: slight squat (hips back, knees bent over the toes), arms out and angled down with soft elbows.
 * spread = sideways stance (pose3d lat): feet wide, knees out over them, arms out to the sides; side-on it's invisible,
 * turned toward the camera it reads as a wide open stance. fl/bl = feet lateral (+ = the player's right/near side).
 */
const defPose = (o: { hip?: number; fF?: J; fB?: J; hF?: J; hB?: J; dip?: number; fl?: number; bl?: number } = {}): Pose => {
  const dip = o.dip ?? 0;
  const torso = P({ hip: [-2, (o.hip ?? 45) - dip], head: [4, 84 - dip], neck: [3, 75 - dip], sF: [3, 72 - dip], sB: [-1, 72 - dip] });
  const fl = o.fl ?? 12, bl = o.bl ?? -12;
  // arms out to the sides (mostly sideways, a little forward) so they read in every view, not across the chest.
  // Elbows are placed, not solved: halfway out and well below the shoulder->hand line, so they point at the floor
  // from every angle (a side-view solve bent the far arm's elbow up into a "chicken wing" when turned).
  const lg = legs(torso, o.fF ?? [6, 0], o.fB ?? [-5, 0]);
  const hF = o.hF ?? [11, 51 - dip], hB = o.hB ?? [-5, 50 - dip];
  const elbow = (s: J, h: J): J => [(s[0] + h[0]) / 2, (s[1] + h[1]) / 2 - 6.5];
  return { ...lg, hF, hB, eF: elbow(lg.sF, hF), eB: elbow(lg.sB, hB),
    lat: { fF: fl, kF: fl - 1, fB: bl, kB: bl + 1, eF: 19, hF: 29, eB: -19, hB: -29 } };
};

/**
 * Arms folded across the chest (screens, charges): hands crossed in front at full arm length, elbows solved down and
 * back; the forearms cross toward the camera (lat), so turned views show the crossed arms too.
 */
const foldArms = (p: Pose, t: number): Pose => {
  const hF: J = [p.sF[0] + 7, p.sF[1] - 13 - t], hB: J = [p.sB[0] + 8, p.sB[1] - 11 - t];
  return { ...arms(p, hF, hB), lat: { ...(p.lat ?? {}), eF: 9, hF: -5, eB: -9, hB: 5 } };
};
/**
 * Box-out arms: spread wide front and back with the forearms up and the elbows pointing at the floor (solved at full
 * arm length so nothing bends backwards). k = how far the arms reach out (push = a little wider and higher).
 */
const boxArms = (p: Pose, k = 1): Pose => arms(p, [p.sF[0] + 15 * k, p.sF[1] + 3 * k], [p.sB[0] - 15 * k, p.sB[1] + 3 * k], [-1, 1]);

const lowStance = P({ head: [3, 85], neck: [2, 76], sF: [3, 73], sB: [-1, 73], hip: [0, 44], kF: [7, 22], kB: [-6, 22], fF: [9, 0], fB: [-8, 0] });

// jog / sprint keys (front leg forward, passing, back leg forward, passing)
const stride = (amp: number, lean: number, lift: number): Pose[] => [
  P({ head: [1 + lean, 90], neck: [lean * 0.7, 81], sF: [2 + lean * 0.6, 78], sB: [-2 + lean * 0.6, 78],
    kF: [7 * amp, 28], fF: [12 * amp, 2], kB: [-4 * amp, 25], fB: [-11 * amp, 6 + lift * 0.4],
    eF: [-2, 66], hF: [-5, 57], eB: [5, 67], hB: [9 * amp, 61], hip: [0, 50] }),
  P({ head: [1 + lean, 92], neck: [lean * 0.7, 83], sF: [2 + lean * 0.6, 80], sB: [-2 + lean * 0.6, 80],
    kF: [3, 26], fF: [1, 0], kB: [3, 30 + lift * 0.5], fB: [-5, 12 + lift],
    eF: [2, 66], hF: [2, 54], eB: [1, 66], hB: [2, 54], hip: [0, 53] }),
];
const mirrorLegsArms = (p: Pose): Pose => ({ ...p, kF: p.kB, kB: p.kF, fF: p.fB, fB: p.fF, eF: p.eB, eB: p.eF, hF: p.hB, hB: p.hF });

function cycle(a: Pose, b: Pose): Key[] {
  return [{ t: 0, pose: a }, { t: 0.25, pose: b }, { t: 0.5, pose: mirrorLegsArms(a) }, { t: 0.75, pose: mirrorLegsArms(b) }, { t: 1, pose: a }];
}

const [jogA, jogB] = stride(1, 2, 8);
/**
 * Sprint burst (R2): torso leaning well into the run, hips a touch lower, long reaching stride with toe-off behind,
 * high knee drive on the passing pose, hard arm pump. [contact, passing] like `stride`; legs/arms at fixed length.
 */
const BURST_LEAN = 11;
const burstTorso = (hipY: number, rise: number): Pose => P({
  hip: [0, hipY], head: [1 + BURST_LEAN, 86 + rise], neck: [BURST_LEAN * 0.75, 77 + rise],
  sF: [2 + BURST_LEAN * 0.65, 74 + rise], sB: [-2 + BURST_LEAN * 0.65, 74 + rise],
});
const burstA = arms(legs(burstTorso(48, 0), [20, 2], [-20, 6]), [-10, 58], [BURST_LEAN + 10, 74]);
const burstB = arms(legs(burstTorso(51, 2), [2, 0], [-6, 26]), [4, 60], [8, 62]);
/** Dribbling burst: same legs, the hand pushes the ball farther out front and it comes back up to the hand. */
const burstDrib = (lg: Pose, hand: J, ball: J): Pose => ({ ...arms(lg, hand, [BURST_LEAN - 2, 62]), ball });
const [sprA, sprB] = stride(1.35, 6, 16);
// running dribble: legs from the jog, front arm pumping the ball
const runDrib = (legs: Pose, hand: J, ball: J): Pose => ({ ...legs, eF: [9, 62], hF: hand, ball, eB: [0, 66], hB: [6, 60] });
/** Running dribble with a fixed-length arm: the hand stays at the hip and the ball comes back up to it. */
const runDribK = (lg: Pose, hand: J, ball: J): Pose => ({ ...arms(lg, hand, [6, 62]), ball });

export const CLIPS: Clip[] = [
  // ---------- locomotion ----------
  { name: 'idle', frames: 4, loop: true, keys: [{ t: 0, pose: BASE }, { t: 0.5, pose: P({ head: [1, 90.3], neck: [0, 81.3], sF: [2, 78.4], sB: [-2, 78.4], hip: [0, 50.5] }) }, { t: 1, pose: BASE }] },
  { name: 'jog', frames: 8, loop: true, keys: cycle(jogA, jogB) },
  { name: 'sprint', frames: 8, loop: true, keys: cycle(sprA, sprB) },
  { name: 'burst', frames: 8, loop: true, keys: cycle(burstA, burstB) },
  { name: 'dribbleBurst', frames: 8, loop: true, bounce: [0.25, 0.75], keys: [
    { t: 0, pose: burstDrib(burstA, [BURST_LEAN + 6, 54], [BURST_LEAN + 7, 49]) }, { t: 0.25, pose: burstDrib(burstB, [BURST_LEAN + 7, 52], [BURST_LEAN + 9, 3]) },
    { t: 0.5, pose: burstDrib(mirrorLegsArms(burstA), [BURST_LEAN + 6, 54], [BURST_LEAN + 7, 49]) }, { t: 0.75, pose: burstDrib(mirrorLegsArms(burstB), [BURST_LEAN + 7, 52], [BURST_LEAN + 9, 3]) },
    { t: 1, pose: burstDrib(burstA, [BURST_LEAN + 6, 54], [BURST_LEAN + 7, 49]) }] },
  // stance, alive but calm: a small bounce, weight shifting foot to foot, the hands drifting slightly out of step
  { name: 'defend', frames: 12, loop: true, keys: [
    { t: 0, pose: defPose() },
    { t: 0.25, pose: defPose({ dip: 0.8, hF: [11.5, 52.5], hB: [-5.5, 49], fl: 12.6, bl: -11.4 }) },
    { t: 0.5, pose: defPose({ dip: 0.2, hF: [11, 50.5], hB: [-5, 50.8] }) },
    { t: 0.75, pose: defPose({ dip: 0.8, hF: [11.5, 52], hB: [-5.5, 49.5], fl: 11.4, bl: -12.6 }) },
    { t: 1, pose: defPose() }] },
  // defensive shuffle, stepping sideways (lat): the lead (right/near) foot steps out in the air while the trail foot
  // stays planted (sliding in relative to the hips by the body's travel), then the trail foot closes. One cycle = 16
  // figure units of sideways travel (GameScene.defStance). Side-on the feet just lift in turn.
  { name: 'slide', frames: 8, loop: true, keys: [
    { t: 0, pose: defPose() },
    { t: 0.25, pose: defPose({ dip: 0.5, fF: [6, 5], fl: 16, bl: -16, hF: [11, 53] }) },
    { t: 0.5, pose: defPose({ dip: 1.5, fl: 20, bl: -20 }) },
    { t: 0.75, pose: defPose({ dip: 0.5, fB: [-5, 4], fl: 16, bl: -16, hB: [-5, 52] }) },
    { t: 1, pose: defPose() }] },
  { name: 'dribble', frames: 8, loop: true, bounce: [0.5], keys: [
    { t: 0, pose: dribAt([11, 56], [12, 51]) },
    { t: 0.2, pose: dribAt([12, 52], [13, 45]) },
    { t: 0.5, pose: dribAt([11, 55], [12, 4]) },
    { t: 0.78, pose: dribAt([11, 57], [12, 34]) },
    { t: 1, pose: dribAt([11, 56], [12, 51]) }] },
  { name: 'dribbleRun', frames: 8, loop: true, bounce: [0.25, 0.75], keys: [
    { t: 0, pose: runDribK(jogA, [12, 55], [13, 50]) }, { t: 0.25, pose: runDribK(jogB, [12, 52], [13, 3]) },
    { t: 0.5, pose: runDribK(mirrorLegsArms(jogA), [12, 55], [13, 50]) }, { t: 0.75, pose: runDribK(mirrorLegsArms(jogB), [12, 52], [13, 3]) },
    { t: 1, pose: runDribK(jogA, [12, 55], [13, 50]) }] },

  // ---------- dribble moves ----------
  // Each move: sell (lean / ball out), plant (dip, ball hits the floor), action (ball changes hands /
  // body turns), recovery into the next dribble. plantAt in moves.json lines up with the plant key.
  { name: 'move_changeDir', frames: 8, bounce: [0.4], keys: [
    { t: 0, pose: runDrib(jogA, [11, 46], [12, 42]) },
    { t: 0.4, pose: P({ hip: [0, 45], head: [3, 86], neck: [2, 77], hF: [8, 26], eF: [8, 50], ball: [7, 4], kF: [7, 22], fF: [10, 0] }, athletic) },
    { t: 0.7, pose: P({ hB: [9, 40], eB: [6, 58], ball: [10, 36], hF: [3, 58], eF: [5, 66] }, athletic) },
    { t: 1, pose: P({ hB: [11, 46], eB: [8, 62], ball: [12, 42], hF: [4, 58] }, athletic) }] },
  { name: 'move_crossover', frames: 14, bounce: [0.42], keys: [
    { t: 0, pose: runDrib(jogA, [11, 46], [12, 42]) },
    { t: 0.16, pose: P({ head: [5, 87], neck: [4, 78], sF: [5, 75], sB: [1, 75], hip: [0, 46], hF: [15, 42], eF: [11, 57], ball: [16, 34], kF: [10, 24], fF: [14, 0], kB: [-4, 25], fB: [-8, 1], hB: [6, 60] }, athletic) },
    { t: 0.3, pose: P({ head: [4, 82], neck: [3, 74], sF: [4, 71], sB: [0, 71], hip: [0, 42], hF: [12, 26], eF: [10, 48], ball: [12, 14], kF: [9, 20], fF: [13, 0], kB: [-7, 21], fB: [-11, 0], hB: [5, 40] }) },
    { t: 0.42, pose: P({ head: [3, 80], neck: [2, 72], sF: [3, 69], sB: [-1, 69], hip: [0, 40], hF: [6, 18], eF: [7, 42], hB: [3, 18], eB: [2, 42], ball: [4, 4], kF: [9, 19], fF: [13, 0], kB: [-8, 19], fB: [-12, 0] }) },
    { t: 0.6, pose: P({ head: [5, 82], neck: [4, 74], hip: [0, 42], hB: [9, 30], eB: [6, 50], ball: [10, 22], hF: [3, 52], eF: [5, 62], kF: [8, 24], fF: [10, 0], kB: [-8, 21], fB: [-13, 1] }, athletic) },
    { t: 0.78, pose: P({ head: [7, 84], neck: [6, 76], hip: [0, 44], hB: [11, 40], eB: [8, 58], ball: [12, 34], hF: [3, 60], kF: [9, 32], fF: [7, 12], kB: [-8, 23], fB: [-14, 2] }, athletic) },
    { t: 1, pose: P({ hB: [11, 46], eB: [8, 62], ball: [12, 42], hF: [4, 58], eF: [5, 66] }, athletic) }] },
  { name: 'move_doubleCross', frames: 14, bounce: [0.42], keys: [
    { t: 0, pose: P({ hB: [10, 40], eB: [7, 57], ball: [11, 35], hF: [3, 60] }, athletic) },
    { t: 0.18, pose: P({ head: [2, 84], hip: [0, 43], hB: [8, 28], eB: [6, 48], ball: [9, 18], hF: [4, 52], kF: [8, 21], fF: [12, 0], kB: [-7, 21], fB: [-11, 0] }, athletic) },
    { t: 0.42, pose: P({ head: [3, 80], neck: [2, 72], hip: [0, 40], hF: [6, 18], eF: [7, 42], hB: [4, 18], eB: [3, 42], ball: [5, 4], kF: [9, 19], fF: [13, 0], kB: [-8, 19], fB: [-12, 0] }) },
    { t: 0.62, pose: P({ head: [5, 82], hip: [0, 42], hF: [10, 30], eF: [9, 50], ball: [11, 22], hB: [3, 52], kF: [10, 24], fF: [14, 1], kB: [-7, 22], fB: [-12, 2] }, athletic) },
    { t: 0.8, pose: P({ head: [6, 84], hip: [0, 44], hF: [11, 40], eF: [9, 56], ball: [12, 33], hB: [2, 58], kF: [10, 27], fF: [15, 2], kB: [-6, 24], fB: [-12, 3] }, athletic) },
    { t: 1, pose: runDrib(jogB, [11, 46], [12, 42]) }] },
  { name: 'move_inOut', frames: 9, bounce: [0.62], keys: [
    { t: 0, pose: runDrib(jogA, [11, 46], [12, 42]) },
    { t: 0.3, pose: P({ head: [-1, 88], neck: [-1, 79], sF: [0, 76], sB: [-4, 76], hF: [6, 36], eF: [8, 54], ball: [5, 30], kF: [6, 25], fF: [9, 0] }, athletic) },
    { t: 0.5, pose: P({ head: [6, 85], neck: [5, 76], sF: [6, 73], hF: [14, 34], eF: [11, 52], ball: [15, 26], kF: [10, 26], fF: [15, 1], kB: [-6, 23], fB: [-12, 3] }, athletic) },
    { t: 0.62, pose: P({ head: [7, 84], hF: [14, 22], eF: [12, 46], ball: [16, 4], kF: [10, 26], fF: [15, 1] }, athletic) },
    { t: 1, pose: runDrib(jogB, [11, 46], [12, 42]) }] },
  { name: 'move_betweenLegs', frames: 10, bounce: [0.32], keys: [
    { t: 0, pose: P({ hip: [0, 43], kF: [9, 21], fF: [14, 0], kB: [-7, 21], fB: [-11, 0], hF: [12, 44], eF: [9, 60], ball: [13, 40] }, athletic) },
    { t: 0.32, pose: P({ hip: [0, 41], head: [3, 82], neck: [2, 74], kF: [10, 20], fF: [15, 0], kB: [-8, 20], fB: [-12, 0], hF: [5, 22], eF: [7, 46], ball: [2, 4] }, athletic) },
    { t: 0.55, pose: P({ hip: [0, 42], kF: [10, 20], fF: [15, 0], kB: [-8, 20], fB: [-12, 0], hB: [-5, 28], eB: [-5, 50], ball: [-4, 25], hF: [6, 54] }, athletic) },
    { t: 0.78, pose: P({ hip: [0, 45], hB: [-2, 42], eB: [-4, 58], ball: [-1, 40], hF: [7, 56] }, athletic) },
    { t: 1, pose: P({ hB: [9, 44], eB: [6, 60], ball: [10, 40], hF: [4, 58] }, athletic) }] },
  { name: 'move_behindBack', frames: 10, bounce: [0.45], keys: [
    { t: 0, pose: P({ hB: [10, 40], eB: [7, 57], ball: [11, 35], hF: [3, 60] }, athletic) },
    { t: 0.25, pose: P({ head: [5, 85], hip: [0, 45], hB: [-9, 40], eB: [-6, 58], ball: [-11, 36], hF: [6, 58], kF: [9, 24], fF: [13, 0] }, athletic) },
    { t: 0.45, pose: P({ head: [5, 83], hip: [0, 43], hB: [-7, 22], eB: [-7, 46], ball: [-6, 5], hF: [9, 34], eF: [9, 54], kF: [10, 22], fF: [15, 0], kB: [-7, 22], fB: [-12, 1] }, athletic) },
    { t: 0.68, pose: P({ head: [6, 85], hF: [12, 38], eF: [10, 55], ball: [13, 33], hB: [-2, 58], kF: [9, 30], fF: [8, 10], kB: [-7, 23], fB: [-13, 2] }, athletic) },
    { t: 1, pose: runDrib(jogA, [11, 46], [12, 42]) }] },
  { name: 'move_shammgod', frames: 11, keys: [
    { t: 0, pose: P({ hB: [10, 40], eB: [7, 57], ball: [11, 35], hF: [4, 58] }, athletic) },
    { t: 0.28, pose: P({ head: [-2, 88], neck: [-1, 79], sF: [1, 76], hB: [21, 42], eB: [13, 58], ball: [23, 38], hF: [5, 56], kF: [11, 24], fF: [16, 0], kB: [-6, 24], fB: [-10, 0] }, athletic) },
    { t: 0.55, pose: P({ head: [2, 86], hF: [19, 40], eF: [12, 56], ball: [17, 36], hB: [10, 50], eB: [7, 60], kF: [10, 22], fF: [15, 0], kB: [-7, 22], fB: [-12, 0], hip: [0, 42] }, athletic) },
    { t: 0.75, pose: runDrib(sprA, [13, 40], [15, 18]) },
    { t: 1, pose: runDrib(sprB, [12, 44], [13, 38]) }] },
  { name: 'move_snatchBack', frames: 9, keys: [
    { t: 0, pose: runDrib(jogA, [11, 44], [12, 36]) },
    { t: 0.3, pose: P({ hip: [0, 43], kF: [10, 21], fF: [14, 0], head: [4, 84], hF: [12, 22], ball: [13, 10] }, athletic) },
    { t: 0.55, pose: P({ fF: [7, 10], fB: [-3, 12], kF: [8, 33], kB: [-1, 35], hip: [-2, 55], hF: [4, 58], hB: [2, 57], ball: [5, 58], head: [-2, 93], neck: [-2, 84] }) },
    { t: 0.8, pose: P({ hip: [0, 46], kF: [7, 23], fF: [9, 0], kB: [-6, 23], fB: [-9, 0], ball: [6, 60], hF: [6, 60], hB: [4, 58] }) },
    { t: 1, pose: P({ ball: [6, 60], hF: [6, 60], hB: [4, 58] }, athletic) }] },
  { name: 'move_spin', frames: 11, keys: [
    { t: 0, pose: runDrib(jogA, [11, 44], [12, 38]) },
    { t: 0.2, pose: P({ hip: [0, 45], kF: [9, 23], fF: [12, 0], kB: [-5, 25], fB: [-9, 2], hF: [8, 48], eF: [7, 60], ball: [9, 46], hB: [6, 60], head: [3, 86] }, athletic) },
    { t: 0.42, pose: P({ backView: true, head: [-1, 87], neck: [-1, 78], sF: [-3, 76], sB: [3, 76], hF: [-9, 50], eF: [-6, 62], ball: [-10, 46], hB: [7, 58], eB: [5, 66], kF: [-2, 26], fF: [-1, 0], kB: [6, 27], fB: [11, 4] }, athletic) },
    { t: 0.62, pose: P({ backView: true, head: [0, 88], sF: [-1, 77], sB: [1, 77], hF: [-4, 46], hB: [-2, 48], ball: [-4, 44], kF: [3, 26], fF: [2, 0], kB: [3, 30], fB: [6, 10] }, athletic) },
    { t: 0.8, pose: P({ head: [5, 86], hF: [9, 42], eF: [8, 58], ball: [10, 38], kF: [10, 28], fF: [15, 2], kB: [-5, 24], fB: [-10, 4] }, athletic) },
    { t: 1, pose: runDrib(sprA, [12, 46], [13, 40]) }] },
  { name: 'move_stepback', frames: 9, keys: [
    { t: 0, pose: P({ head: [6, 86], neck: [5, 77], ball: [12, 38], hF: [11, 44] }, athletic) },
    { t: 0.3, pose: P({ hip: [0, 42], head: [6, 82], neck: [5, 74], kF: [11, 21], fF: [15, 0], kB: [-6, 22], fB: [-10, 1], ball: [13, 8], hF: [12, 22] }, athletic) },
    { t: 0.55, pose: P({ fF: [6, 11], fB: [-3, 13], kF: [8, 34], kB: [-1, 36], hip: [-2, 56], ball: [5, 58], hF: [6, 58], hB: [4, 57], head: [-2, 94], neck: [-2, 85] }) },
    { t: 0.8, pose: P({ hip: [0, 45], kF: [7, 23], fF: [9, 0], kB: [-6, 23], fB: [-9, 0], ball: [6, 60], hF: [6, 60], hB: [4, 58] }) },
    { t: 1, pose: P({ ball: [6, 60], hF: [6, 60], hB: [4, 58] }, athletic) }] },
  { name: 'move_hesi', frames: 9, bounce: [0.72], keys: [
    { t: 0, pose: runDrib(jogA, [11, 46], [12, 42]) },
    { t: 0.3, pose: P({ hip: [0, 50], head: [0, 92], neck: [0, 83], hF: [12, 38], ball: [13, 30], kF: [7, 26], fF: [10, 0], kB: [-5, 26], fB: [-8, 0] }, athletic) },
    { t: 0.45, pose: P({ hip: [0, 52], head: [-1, 94], neck: [-1, 85], sF: [1, 82], sB: [-3, 82], hF: [12, 50], eF: [9, 64], ball: [13, 46], hB: [4, 62], kF: [7, 27], fF: [10, 0], kB: [-5, 27], fB: [-8, 0] }, athletic) },
    { t: 0.72, pose: P({ hip: [0, 48], head: [3, 89], hF: [12, 24], ball: [13, 4] }, athletic) },
    { t: 1, pose: dribHigh }] },
  { name: 'move_hesiBurst', frames: 8, bounce: [0.5], keys: [
    { t: 0, pose: P({ hip: [0, 52], head: [-1, 94], neck: [-1, 85], hF: [12, 50], ball: [13, 46] }, athletic) },
    { t: 0.2, pose: P({ head: [10, 82], neck: [8, 74], sF: [9, 71], sB: [5, 71], hip: [0, 46], hF: [14, 38], ball: [15, 32] }, athletic) },
    { t: 0.5, pose: P({ head: [11, 82], neck: [9, 74], sF: [10, 71], sB: [6, 71], hip: [0, 47], kF: [11, 28], fF: [17, 2], kB: [-7, 22], fB: [-14, 6], hF: [16, 20], ball: [18, 4] }) },
    { t: 1, pose: runDrib(sprA, [12, 46], [13, 40]) }] },
  { name: 'move_hesiPullback', frames: 8, keys: [
    { t: 0, pose: P({ hip: [0, 52], head: [-1, 94], neck: [-1, 85], hF: [12, 50], ball: [13, 46] }, athletic) },
    { t: 0.25, pose: P({ hip: [0, 43], kF: [10, 21], fF: [14, 0], head: [5, 84], hF: [12, 26], ball: [13, 12] }, athletic) },
    { t: 0.55, pose: P({ head: [-3, 89], neck: [-3, 80], hip: [-1, 47], kF: [6, 25], fF: [8, 2], kB: [-7, 24], fB: [-12, 0], hF: [5, 40], ball: [5, 34] }, athletic) },
    { t: 1, pose: P({ ball: [6, 58], hF: [6, 58], hB: [4, 56] }, athletic) }] },
  { name: 'move_jab', frames: 8, bounce: [0.5], keys: [
    { t: 0, pose: dribHigh },
    { t: 0.3, pose: P({ kF: [12, 22], fF: [17, 0], kB: [-5, 24], fB: [-8, 0], hip: [2, 44], head: [7, 84], neck: [6, 76], sF: [6, 73], sB: [2, 73], hF: [12, 30], eF: [10, 52], ball: [13, 14] }, athletic) },
    { t: 0.5, pose: P({ kF: [11, 22], fF: [16, 0], kB: [-5, 24], fB: [-8, 0], hip: [2, 44], head: [6, 84], neck: [5, 76], hF: [12, 26], ball: [13, 4] }, athletic) },
    { t: 1, pose: dribHigh }] },
  // Pump fake: load, sell it hard (ball snaps above the forehead, eyes up, up on the toes, feet stay planted),
  // a beat at the top, then rip it back down into the triple threat the hold loop starts from.
  { name: 'pumpfake', frames: 14, keys: [
    { t: 0, pose: TRIPLE },
    { t: 0.12, pose: P({ hip: [0, 45], kF: [7, 21], fF: [9, 0], kB: [-6, 21], fB: [-9, 0], head: [3, 87], neck: [1, 79], sF: [3, 76], sB: [-1, 76], ball: [8, 63], hF: [7, 62], hB: [5, 61], eF: [8, 57], eB: [4, 57] }) },
    { t: 0.3, pose: P({ hip: [0, 51], kF: [5, 27], fF: [9, 0], kB: [-4, 27], fB: [-9, 1], head: [2, 92], neck: [1, 83], sF: [2, 80], sB: [-2, 80], ball: [5, 91], hF: [5, 88], hB: [3, 87], eF: [7, 78], eB: [0, 77] }) },
    { t: 0.45, pose: P({ hip: [0, 53], kF: [4, 29], fF: [9, 1], kB: [-3, 29], fB: [-9, 2], head: [1, 93], neck: [0, 84], sF: [2, 81], sB: [-2, 81], ball: [4, 99], hF: [4, 96], hB: [2, 95], eF: [7, 85], eB: [-1, 84] }) },
    { t: 0.6, pose: P({ hip: [0, 53], kF: [4, 29], fF: [9, 1], kB: [-3, 29], fB: [-9, 2], head: [1, 93], neck: [0, 84], sF: [2, 81], sB: [-2, 81], ball: [4, 98], hF: [4, 95], hB: [2, 94], eF: [7, 84], eB: [-1, 83] }) },
    { t: 0.8, pose: P({ hip: [0, 48], kF: [6, 24], fF: [9, 0], kB: [-5, 24], fB: [-9, 0], head: [2, 90], neck: [1, 81], sF: [2, 78], sB: [-2, 78], ball: [7, 77], hF: [7, 75], hB: [5, 74], eF: [9, 67], eB: [4, 67] }) },
    { t: 1, pose: TRIPLE }] },
  { name: 'move_retreat', frames: 8, bounce: [0.5], keys: [
    { t: 0, pose: runDrib(jogB, [11, 45], [12, 40]) },
    { t: 0.25, pose: P({ head: [-2, 88], hB: [5, 62], hF: [10, 34], ball: [11, 24] }, jogA) },
    { t: 0.5, pose: runDrib(mirrorLegsArms(jogB), [10, 40], [11, 4]) },
    { t: 1, pose: runDrib(jogB, [11, 45], [12, 40]) }] },
  // side drive: lean and push the ball out front; the hand stays at the hip (fixed arm length) and the ball comes back up
  { name: 'move_lateral', frames: 9, bounce: [0.3, 0.75], keys: [
    { t: 0, pose: { ...arms(P({ hip: [0, 44], head: [4, 85], neck: [3, 76], kF: [8, 22], fF: [11, 0] }, athletic), [12, 52], [5, 60]), ball: [13, 47] } },
    { t: 0.3, pose: { ...arms(P({ hip: [0, 42], head: [8, 81], neck: [6, 73], sF: [7, 70], sB: [3, 70], kF: [12, 24], fF: [18, 2], kB: [-7, 20], fB: [-14, 3] }), [15, 50], [8, 56]), ball: [18, 4] } },
    { t: 0.55, pose: { ...arms(P({ hip: [0, 43], head: [8, 82], neck: [6, 74], sF: [7, 71], sB: [3, 71], kF: [3, 30], fF: [1, 10], kB: [9, 24], fB: [15, 1] }), [16, 49], [8, 57]), ball: [17, 44] } },
    { t: 0.75, pose: { ...arms(P({ hip: [0, 42], head: [8, 81], neck: [6, 73], sF: [7, 70], sB: [3, 70], kF: [12, 24], fF: [18, 2], kB: [-7, 20], fB: [-14, 3] }), [15, 50], [8, 56]), ball: [18, 4] } },
    { t: 1, pose: { ...arms(P({ hip: [0, 44], head: [5, 84], neck: [4, 75], kF: [8, 22], fF: [11, 0] }, athletic), [13, 52], [5, 60]), ball: [14, 47] } }] },

  // ---------- shots ----------
  // jumper: ball rises from the dribble into the shooting pocket (in front, chest/chin), then up to the set point
  // and release, all quickly; short follow-through. Arms keep a fixed length throughout.
  { name: 'shot_jumper', frames: 14, release: 0.58, post: 0.35, keys: [
    { t: 0, pose: { ...arms(athletic, [11, 56], [5, 60]), ball: [12, 51] } },
    { t: 0.15, pose: { ...arms(P({ hip: [0, 45], kF: [6, 23], kB: [-3, 23], fF: [5, 0], fB: [-5, 0], head: [2, 87], neck: [1, 78], sF: [2, 75], sB: [-2, 75] }), [12, 59], [7, 55]), ball: [11, 60] } },
    { t: 0.3, pose: { ...arms(P({ hip: [0, 43], kF: [7, 21], kB: [-2, 21], fF: [5, 0], fB: [-4, 0], head: [2, 85], neck: [1, 76], sF: [2, 73], sB: [-2, 73] }), [5, 64], [11, 63]), ball: [9, 68] } },
    { t: 0.45, pose: { ...arms(P({ hip: [0, 51], kF: [3, 27], kB: [-1, 27], fF: [2, 1], fB: [-2, 1], head: [2, 90], neck: [1, 81], sF: [2, 78], sB: [-2, 78] }), [4, 93], [9, 95]), ball: [6, 98] } },
    { t: 0.58, pose: { ...arms(P({ hip: [0, 53], kF: [2, 28], fF: [2, -1], kB: [-1, 28], fB: [-2, -1] }), [5, 105], [8, 97]), ball: [6, 110] } },
    { t: 0.78, pose: arms(P({ hip: [0, 53], kF: [3, 28], kB: [-1, 28] }), [10, 102], [5, 94]) },
    { t: 1, pose: arms(P({ hip: [0, 48], kF: [4, 25], kB: [-2, 25] }), [8, 72], [4, 68]) }] },
  { name: 'shot_push', frames: 8, release: 0.55, post: 0.4, keys: [
    { t: 0, pose: chest },
    { t: 0.3, pose: P({ hip: [0, 46], kF: [5, 23], kB: [0, 23], ball: [6, 70], hF: [6, 72], hB: [4, 70] }) },
    { t: 0.55, pose: P({ ball: [10, 104], hF: [9, 100], eF: [7, 88], hB: [3, 88], kF: [3, 28], fF: [2, -1] }) },
    { t: 1, pose: P({ hF: [9, 86], eF: [8, 78], hB: [2, 74] }) }] },
  { name: 'shot_floater', frames: 9, release: 0.55, post: 0.45, keys: [
    { t: 0, pose: P({ ball: [7, 60], hF: [7, 60], hB: [5, 59] }, jogA) },
    { t: 0.3, pose: P({ kF: [8, 40], fF: [6, 22], kB: [-2, 25], fB: [-5, 2], hip: [0, 52], ball: [9, 84], hF: [8, 81], eF: [8, 70], hB: [4, 78], eB: [1, 70] }) },
    { t: 0.55, pose: P({ kF: [8, 42], fF: [5, 24], kB: [-2, 26], fB: [-5, 1], hip: [0, 53], ball: [14, 108], hF: [12, 104], eF: [8, 92], hB: [-5, 80], eB: [-4, 72] }) },
    { t: 0.8, pose: P({ kF: [7, 38], fF: [5, 20], hF: [14, 101], eF: [9, 92], hB: [-6, 78] }) },
    { t: 1, pose: P({ kF: [4, 26], fF: [5, 0], hF: [8, 80], eF: [7, 72] }, athletic) }] },
  { name: 'shot_hook', frames: 9, release: 0.6, post: 0.45, keys: [
    { t: 0, pose: chest },
    { t: 0.3, pose: P({ hB: [11, 72], eB: [6, 74], ball: [-9, 70], hF: [-8, 72], eF: [-4, 68], kF: [6, 38], fF: [4, 20], head: [2, 91], sF: [-1, 79], sB: [3, 79] }) },
    { t: 0.6, pose: P({ hB: [11, 74], eB: [6, 75], ball: [-1, 117], hF: [-1, 113], eF: [-3, 99], kF: [6, 40], fF: [4, 22] }) },
    { t: 0.8, pose: P({ hB: [9, 70], hF: [8, 105], eF: [3, 97], kF: [5, 36], fF: [4, 18] }) },
    { t: 1, pose: P({ hF: [6, 84], eF: [5, 76] }, athletic) }] },
  { name: 'shot_layup', frames: 10, release: 0.65, post: 0.5, keys: [
    { t: 0, pose: P({ kF: [8, 26], fF: [13, 1], kB: [-4, 28], fB: [-10, 6], ball: [6, 56], hF: [6, 57], hB: [4, 55], eF: [5, 66], eB: [1, 65] }) },
    { t: 0.3, pose: P({ kB: [4, 26], fB: [3, 0], kF: [6, 34], fF: [2, 14], ball: [7, 70], hF: [7, 70], hB: [5, 68], head: [3, 90] }) },
    { t: 0.5, pose: P({ kF: [9, 48], fF: [6, 30], kB: [-1, 24], fB: [-4, 2], hip: [0, 53], ball: [9, 90], hF: [9, 88], eF: [7, 76], hB: [-6, 72], eB: [-4, 66] }) },
    { t: 0.65, pose: P({ kF: [9, 50], fF: [6, 32], kB: [-1, 25], fB: [-4, 2], hip: [0, 54], ball: [13, 116], hF: [12, 112], eF: [9, 98], hB: [-7, 74], eB: [-4, 68] }) },
    { t: 0.85, pose: P({ kF: [7, 42], fF: [5, 24], hip: [0, 53], hF: [12, 108], eF: [9, 96], hB: [-6, 72] }) },
    { t: 1, pose: P({ hF: [7, 78], eF: [7, 70] }, athletic) }] },
  { name: 'shot_euro', frames: 10, release: 0.65, post: 0.5, keys: [
    { t: 0, pose: P({ kF: [8, 26], fF: [13, 1], kB: [-4, 28], fB: [-10, 6], ball: [6, 56], hF: [6, 57], hB: [4, 55] }) },
    { t: 0.3, pose: P({ head: [-3, 88], neck: [-3, 79], sF: [-1, 76], sB: [-5, 76], kF: [10, 22], fF: [16, 0], kB: [-6, 22], fB: [-12, 0], hip: [0, 44], ball: [-6, 62], hF: [-5, 62], hB: [-7, 60] }) },
    { t: 0.5, pose: P({ head: [5, 89], kF: [9, 46], fF: [6, 28], hip: [0, 52], ball: [8, 88], hF: [8, 86], eF: [7, 74], hB: [-6, 72] }) },
    { t: 0.65, pose: P({ kF: [9, 48], fF: [6, 30], hip: [0, 53], ball: [13, 114], hF: [12, 110], eF: [9, 96], hB: [-7, 74] }) },
    { t: 1, pose: P({ hF: [7, 78], eF: [7, 70] }, athletic) }] },
  // Step-Through: rip the ball low across the hip, one long stride past the defender (still on the floor),
  // plant, drive the back knee up and finish high with one hand. Lift-off (STEP_LIFT of the gather) is at u≈0.37.
  { name: 'shot_stepThrough', frames: 16, release: 0.68, post: 0.5, keys: [
    { t: 0, pose: TRIPLE },
    { t: 0.12, pose: P({ hip: [1, 44], head: [5, 84], neck: [4, 76], sF: [5, 73], sB: [1, 73], kF: [11, 29], fF: [15, 9], kB: [-5, 22], fB: [-9, 0], ball: [-3, 50], hF: [-1, 51], hB: [-4, 50], eF: [4, 58], eB: [-1, 58] }) },
    { t: 0.26, pose: P({ hip: [5, 39], head: [13, 79], neck: [11, 71], sF: [11, 68], sB: [7, 68], kF: [20, 21], fF: [27, 2], kB: [-4, 19], fB: [-13, 0], ball: [1, 47], hF: [2, 48], hB: [0, 47], eF: [8, 56], eB: [4, 56] }) },
    { t: 0.37, pose: P({ hip: [7, 42], head: [11, 83], neck: [10, 75], sF: [10, 72], sB: [6, 72], kF: [15, 21], fF: [19, 0], kB: [-1, 24], fB: [-8, 4], ball: [9, 62], hF: [9, 62], hB: [7, 61], eF: [10, 68], eB: [6, 68] }) },
    { t: 0.45, pose: P({ hip: [4, 49], head: [6, 89], neck: [5, 80], sF: [6, 77], sB: [2, 77], kF: [8, 24], fF: [9, 0], kB: [4, 34], fB: [0, 16], ball: [10, 79], hF: [10, 78], hB: [7, 77], eF: [10, 74], eB: [5, 73] }) },
    { t: 0.56, pose: P({ hip: [1, 53], head: [3, 92], neck: [2, 83], sF: [3, 80], sB: [-1, 80], kF: [2, 26], fF: [1, 2], kB: [8, 46], fB: [5, 28], ball: [10, 92], hF: [10, 90], hB: [6, 88], eF: [9, 78], eB: [3, 76] }) },
    { t: 0.68, pose: P({ hip: [1, 54], head: [3, 93], neck: [2, 84], sF: [3, 81], sB: [-1, 81], kF: [1, 27], fF: [0, 4], kB: [8, 48], fB: [5, 30], ball: [12, 112], hF: [11, 108], eF: [9, 95], hB: [-3, 80], eB: [-2, 72] }) },
    { t: 0.83, pose: P({ hip: [0, 53], kF: [2, 27], fF: [1, 2], kB: [6, 40], fB: [4, 22], hF: [12, 106], eF: [9, 95], hB: [-4, 76], eB: [-2, 70] }) },
    { t: 0.92, pose: P({ hip: [0, 51], kF: [3, 26], fF: [2, 1], kB: [3, 31], fB: [0, 11], hF: [10, 93], eF: [8, 85], hB: [-2, 62], eB: [-2, 66] }) },
    { t: 1, pose: P({ hF: [7, 80], eF: [7, 72] }, athletic) }] },
  // Step-Through Jumper: same rip + long grounded stride as the finish, then plant both feet, square up and pull up.
  { name: 'shot_stepThroughJumper', frames: 16, release: 0.7, post: 0.55, keys: [
    { t: 0, pose: TRIPLE },
    { t: 0.12, pose: P({ hip: [1, 44], head: [5, 84], neck: [4, 76], sF: [5, 73], sB: [1, 73], kF: [11, 29], fF: [15, 9], kB: [-5, 22], fB: [-9, 0], ball: [-3, 50], hF: [-1, 51], hB: [-4, 50], eF: [4, 58], eB: [-1, 58] }) },
    { t: 0.26, pose: P({ hip: [5, 39], head: [13, 79], neck: [11, 71], sF: [11, 68], sB: [7, 68], kF: [20, 21], fF: [27, 2], kB: [-4, 19], fB: [-13, 0], ball: [1, 47], hF: [2, 48], hB: [0, 47], eF: [8, 56], eB: [4, 56] }) },
    { t: 0.385, pose: P({ hip: [5, 42], head: [7, 84], neck: [6, 75], sF: [7, 72], sB: [3, 72], kF: [11, 21], fF: [13, 0], kB: [1, 21], fB: [-1, 0], ball: [8, 58], hF: [8, 60], hB: [6, 58], eF: [8, 64], eB: [5, 64] }) },
    { t: 0.55, pose: P({ hip: [0, 53], kF: [2, 29], fF: [2, 1], kB: [-1, 29], fB: [-2, 1], ball: [3, 100], hF: [3, 97], eF: [7, 87], hB: [0, 96], eB: [-4, 87] }) },
    { t: 0.7, pose: P({ hip: [0, 53], kF: [2, 28], fF: [2, -1], kB: [-1, 28], fB: [-2, -1], ball: [6, 114], hF: [5, 110], eF: [4, 98], hB: [2, 99], eB: [-3, 90] }) },
    { t: 0.86, pose: P({ hip: [0, 53], kF: [3, 28], kB: [-1, 28], hF: [8, 107], eF: [5, 98], hB: [3, 96], eB: [-2, 88] }) },
    { t: 1, pose: P({ hip: [0, 48], kF: [4, 25], kB: [-2, 25], hF: [7, 82], eF: [7, 76], hB: [2, 80], eB: [-1, 74] }) }] },
  { name: 'shot_dunk', frames: 11, release: 0.7, post: 0.6, keys: [
    { t: 0, pose: P({ kF: [8, 26], fF: [13, 1], kB: [-4, 28], fB: [-10, 6], ball: [7, 60], hF: [7, 60], hB: [5, 59] }) },
    { t: 0.25, pose: P({ hip: [0, 40], kF: [8, 20], fF: [7, 0], kB: [-2, 20], fB: [-5, 0], head: [5, 80], neck: [4, 72], sF: [5, 69], sB: [1, 69], ball: [6, 56], hF: [6, 56], hB: [4, 55], eF: [7, 62], eB: [3, 62] }) },
    { t: 0.45, pose: P({ hip: [0, 54], kF: [7, 42], fF: [4, 24], kB: [-3, 31], fB: [-8, 10], ball: [7, 100], hF: [7, 97], hB: [5, 96], eF: [8, 86], eB: [3, 86] }) },
    { t: 0.6, pose: P({ hip: [0, 54], kF: [6, 40], fF: [3, 22], kB: [-3, 30], fB: [-8, 9], ball: [-6, 113], hF: [-5, 109], eF: [3, 101], hB: [-3, 107], eB: [-1, 100] }) },
    { t: 0.7, pose: P({ hip: [0, 54], kF: [6, 38], fF: [3, 20], ball: [14, 102], hF: [12, 105], eF: [8, 97], hB: [-6, 84], eB: [-4, 76] }) },
    { t: 0.85, pose: P({ hip: [0, 52], kF: [3, 25], fF: [3, 3], kB: [-2, 25], fB: [-3, 3], hF: [11, 114], eF: [8, 102], hB: [9, 113], eB: [5, 101], head: [2, 90] }) },
    { t: 1, pose: P({ hF: [7, 80], eF: [7, 72] }, athletic) }] },

  // ---------- getting rocked ----------
  // stripped: the ball hand gets yanked, the body twists away, an off-balance stumble back, then he gathers himself
  { name: 'stripped', frames: 12, keys: [
    { t: 0, pose: dribHigh },
    { t: 0.14, pose: P({ head: [6, 86], neck: [5, 78], sF: [5, 75], sB: [1, 75], hF: [16, 54], eF: [11, 61], hB: [5, 60], eB: [0, 64], hip: [1, 47] }, athletic) },
    { t: 0.36, pose: P({ head: [-2, 88], neck: [-1, 79], sF: [1, 76], sB: [-4, 76], hip: [-1, 47], hF: [-6, 62], eF: [-3, 67], hB: [12, 68], eB: [8, 71], kF: [4, 24], fF: [8, 0], kB: [-7, 22], fB: [-12, 2] }) },
    { t: 0.6, pose: P({ head: [-5, 86], neck: [-4, 78], sF: [-3, 75], sB: [-7, 75], hip: [-2, 46], kF: [3, 23], fF: [6, 0], kB: [-9, 24], fB: [-14, 4], hF: [-1, 57], hB: [-11, 59], eF: [0, 65], eB: [-8, 67] }) },
    { t: 0.82, pose: P({ head: [-1, 88], neck: [-1, 79], hip: [-1, 47], hF: [4, 56], eF: [4, 63], hB: [-4, 58], eB: [-3, 65] }, athletic) },
    { t: 1, pose: athletic }] },
  // blocked: arms thrown back by the swat, a heavy landing, a stumble, then recover
  { name: 'blockedLand', frames: 12, keys: [
    { t: 0, pose: P({ hip: [0, 53], kF: [2, 28], kB: [-1, 28], hF: [6, 108], eF: [5, 97], hB: [2, 99], eB: [-3, 90] }) },
    { t: 0.16, pose: P({ head: [-4, 90], neck: [-3, 82], sF: [-2, 79], sB: [-6, 79], hip: [-1, 52], hF: [-8, 103], eF: [-5, 94], hB: [-13, 97], eB: [-9, 89], kF: [5, 32], fF: [4, 6], kB: [-3, 26], fB: [-6, 2] }) },
    { t: 0.4, pose: P({ hip: [-1, 42], kF: [6, 20], fF: [9, 0], kB: [-6, 20], fB: [-10, 0], head: [-2, 80], neck: [-2, 72], sF: [-1, 69], sB: [-5, 69], hF: [-6, 60], eF: [-3, 64], hB: [-12, 58], eB: [-8, 63] }) },
    { t: 0.65, pose: P({ hip: [-2, 46], kB: [-10, 24], fB: [-15, 3], kF: [3, 24], fF: [5, 0], head: [-4, 85], neck: [-3, 77], sF: [-2, 74], sB: [-6, 74], hF: [6, 62], eF: [4, 68], hB: [-14, 61], eB: [-9, 67] }) },
    { t: 0.85, pose: P({ head: [0, 88], neck: [0, 79], hF: [5, 58], eF: [5, 64], hB: [-3, 58], eB: [-2, 65] }, athletic) },
    { t: 1, pose: athletic }] },

  // ---------- defense / misc ----------
  { name: 'block', frames: 6, keys: [
    { t: 0, pose: P({ hip: [0, 44], kF: [5, 22], kB: [-3, 22], hF: [6, 74], hB: [-2, 74], head: [2, 86], neck: [1, 77] }) },
    { t: 0.4, pose: P({ hip: [0, 53], kF: [2, 30], fF: [1, 2], kB: [-2, 30], fB: [-3, 2], hF: [4, 121], eF: [3, 102], hB: [0, 119], eB: [-2, 101] }) },
    { t: 1, pose: P({ hip: [0, 52], kF: [4, 34], fF: [1, 12], kB: [-2, 30], fB: [-4, 8], hF: [3, 118], eF: [2, 100], hB: [-1, 116], eB: [-3, 99] }) }] },
  { name: 'swipe', frames: 4, keys: [
    { t: 0, pose: P({ eF: [10, 71], hF: [17, 75] }, lowStance) },
    { t: 0.5, pose: P({ head: [6, 82], neck: [5, 73], sF: [6, 70], eF: [14, 58], hF: [22, 46], kF: [10, 22], fF: [13, 0] }, lowStance) },
    { t: 1, pose: P({ eF: [10, 71], hF: [17, 75] }, lowStance) }] },
  // screen: wide base, arms folded across the chest at full arm length (elbows down and back, like the defensive arms)
  { name: 'screen', frames: 3, keys: [
    { t: 0, pose: foldArms(legs(P({ hip: [0, 49], head: [2, 90] }), [9, 0], [-9, 0]), 0) },
    { t: 1, pose: foldArms(legs(P({ hip: [0, 47], head: [2, 89], neck: [1, 80], sF: [2, 77], sB: [-2, 77] }), [10, 0], [-10, 0]), 1) }] },
  // taking a charge: feet set, braced and leaning back a touch, arms folded to the chest
  { name: 'charge', frames: 3, keys: [
    { t: 0, pose: foldArms(lowStance, 0) },
    { t: 1, pose: foldArms(legs(P({ head: [-3, 86], neck: [-3, 77], sF: [-2, 74], sB: [-5, 74], hip: [0, 46] }), [8, 0], [-7, 0]), 1) }] },
  { name: 'fall', frames: 6, keys: [
    { t: 0, pose: P({ head: [-6, 88], neck: [-5, 79], sF: [-3, 77], sB: [-7, 77], eF: [4, 80], hF: [10, 88], eB: [-12, 78], hB: [-17, 84] }) },
    { t: 0.35, pose: P({ head: [-20, 40], neck: [-14, 36], sF: [-12, 34], sB: [-14, 34], hip: [0, 22], kF: [8, 30], fF: [16, 20], kB: [7, 26], fB: [15, 14], eF: [-6, 44], hF: [-1, 50], eB: [-20, 26], hB: [-24, 14] }) },
    { t: 1, pose: { head: [-36, 7], neck: [-28, 7], sF: [-25, 9], sB: [-25, 6], eF: [-18, 14], hF: [-12, 10], eB: [-31, 12], hB: [-37, 5], hip: [0, 6], kF: [9, 12], fF: [19, 3], kB: [9, 7], fB: [20, 2], ball: null } }] },
  { name: 'ankleFall', frames: 8, keys: [
    { t: 0, pose: lowStance },
    { t: 0.25, pose: P({ kF: [-3, 24], fF: [-6, 2], kB: [3, 24], fB: [6, 1], head: [-4, 86], hF: [12, 74], hB: [-14, 70] }) },
    { t: 0.55, pose: P({ hip: [0, 18], kF: [8, 22], fF: [14, 4], kB: [6, 20], fB: [12, 2], head: [-4, 54], neck: [-3, 46], sF: [-2, 43], sB: [-4, 43], eF: [6, 34], hF: [10, 24], eB: [-10, 34], hB: [-12, 20] }) },
    { t: 1, pose: { head: [-36, 7], neck: [-28, 7], sF: [-25, 9], sB: [-25, 6], eF: [-18, 14], hF: [-12, 10], eB: [-31, 12], hB: [-37, 5], hip: [0, 6], kF: [9, 12], fF: [19, 3], kB: [9, 7], fB: [20, 2], ball: null } }] },
  { name: 'stagger', frames: 5, loop: true, keys: [
    { t: 0, pose: P({ head: [-5, 88], neck: [-4, 79], sF: [-2, 77], sB: [-6, 77], eF: [4, 76], hF: [9, 82], eB: [-10, 74], hB: [-14, 80], kB: [-4, 27], fB: [-7, 2] }) },
    { t: 0.5, pose: P({ head: [-7, 87], neck: [-6, 78], sF: [-4, 76], sB: [-8, 76], eF: [3, 78], hF: [7, 86], eB: [-12, 76], hB: [-16, 84], kF: [1, 27], fF: [0, 3] }) },
    { t: 1, pose: P({ head: [-5, 88], neck: [-4, 79], sF: [-2, 77], sB: [-6, 77], eF: [4, 76], hF: [9, 82], eB: [-10, 74], hB: [-14, 80], kB: [-4, 27], fB: [-7, 2] }) }] },
  { name: 'pass', frames: 4, keys: [
    { t: 0, pose: chest },
    { t: 0.5, pose: P({ hF: [17, 63], eF: [10, 66], hB: [16, 61], eB: [8, 64], kF: [6, 26], fF: [9, 0], head: [3, 90] }) },
    { t: 1, pose: P({ hF: [14, 60], eF: [9, 64], hB: [12, 58], eB: [6, 62] }) }] },
  // round 65 Finger Wag: after the block, the ball arm straight up and the hand wagging side to side
  { name: 'fingerWag', frames: 8, keys: [
    { t: 0, pose: P({ hF: [9, 100], eF: [7, 88], hB: [-3, 56], eB: [-2, 66], head: [2, 90] }) },
    { t: 0.25, pose: P({ hF: [3, 106], eF: [5, 92], hB: [-3, 56], eB: [-2, 66], head: [2, 90] }) },
    { t: 0.5, pose: P({ hF: [11, 105], eF: [6, 92], hB: [-3, 56], eB: [-2, 66], head: [2, 90] }) },
    { t: 0.75, pose: P({ hF: [3, 106], eF: [5, 92], hB: [-3, 56], eB: [-2, 66], head: [2, 90] }) },
    { t: 1, pose: P({ hF: [11, 105], eF: [6, 92], hB: [-3, 56], eB: [-2, 66], head: [2, 90] }) }] },
  // round 64 Magic: behind-the-back / wraparound pass: the ball hand swings it around the hip and flicks it out behind him
  { name: 'passBehind', frames: 5, keys: [
    { t: 0, pose: P({ hB: [8, 50], eB: [5, 62], ball: [9, 48], hF: [6, 58], eF: [5, 66] }) },
    { t: 0.45, pose: P({ head: [3, 89], hip: [0, 49], hB: [-9, 46], eB: [-5, 58], ball: [-11, 45], hF: [8, 60], eF: [6, 67] }) },
    { t: 1, pose: P({ head: [2, 89], hB: [-15, 50], eB: [-9, 60], ball: null, hF: [7, 59], eF: [5, 66] }) }] },
  { name: 'catch', frames: 3, keys: [
    { t: 0, pose: P({ hF: [12, 66], eF: [8, 68], hB: [10, 65], eB: [5, 67], ball: [14, 66] }) },
    { t: 1, pose: chest }] },

  { name: 'boxout', frames: 6, loop: true, keys: [
    { t: 0, pose: boxArms(P({ hip: [-2, 34], head: [-6, 72], neck: [-5, 63], sF: [-4, 60], sB: [-6, 60], kF: [9, 18], fF: [14, 0], kB: [-11, 18], fB: [-15, 0] })) },
    { t: 0.5, pose: boxArms(P({ hip: [-4, 32], head: [-8, 70], neck: [-7, 61], sF: [-6, 58], sB: [-8, 58], kF: [10, 18], fF: [15, 1], kB: [-12, 17], fB: [-16, 0] }), 0.96) },
    { t: 1, pose: boxArms(P({ hip: [-2, 34], head: [-6, 72], neck: [-5, 63], sF: [-4, 60], sB: [-6, 60], kF: [9, 18], fF: [14, 0], kB: [-11, 18], fB: [-15, 0] })) }] },
  { name: 'boxoutPush', frames: 6, loop: true, keys: [
    { t: 0, pose: boxArms(P({ hip: [-5, 33], head: [-5, 71], neck: [-5, 62], sF: [-5, 59], sB: [-7, 59], kF: [10, 18], fF: [16, 0], kB: [-10, 17], fB: [-13, 0] }), 1.05) },
    { t: 0.5, pose: boxArms(P({ hip: [-8, 32], head: [-3, 70], neck: [-4, 61], sF: [-5, 58], sB: [-7, 58], kF: [11, 19], fF: [17, 1], kB: [-9, 18], fB: [-12, 0] }), 1.1) },
    { t: 1, pose: boxArms(P({ hip: [-5, 33], head: [-5, 71], neck: [-5, 62], sF: [-5, 59], sB: [-7, 59], kF: [10, 18], fF: [16, 0], kB: [-10, 17], fB: [-13, 0] }), 1.05) }] },
  { name: 'bumped', frames: 7, keys: [
    { t: 0, pose: P({ head: [-12, 84], neck: [-9, 76], sF: [-6, 74], sB: [-10, 74], eF: [6, 84], hF: [14, 96], eB: [-18, 82], hB: [-26, 94], kF: [6, 32], fF: [10, 8], kB: [-6, 26], fB: [-10, 0] }) },
    { t: 0.3, pose: P({ head: [-15, 80], neck: [-12, 72], sF: [-9, 70], sB: [-13, 70], eF: [2, 78], hF: [9, 88], eB: [-22, 76], hB: [-30, 84], hip: [-3, 46], kF: [4, 26], fF: [7, 2], kB: [-10, 20], fB: [-16, 2] }) },
    { t: 0.6, pose: P({ head: [-9, 76], neck: [-7, 68], sF: [-5, 66], sB: [-9, 66], eF: [4, 60], hF: [10, 52], eB: [-14, 62], hB: [-20, 54], hip: [-2, 40], kF: [6, 20], fF: [9, 0], kB: [-8, 12], fB: [-14, 0] }) },
    { t: 1, pose: athletic }] },
  { name: 'rebound', frames: 9, keys: [
    { t: 0, pose: P({ hip: [0, 38], kF: [7, 18], fF: [7, 0], kB: [-4, 18], fB: [-5, 0], head: [3, 76], neck: [2, 68], sF: [3, 65], sB: [-1, 65], hF: [8, 56], hB: [5, 55], eF: [8, 60], eB: [4, 60] }) },
    { t: 0.3, pose: P({ hip: [0, 54], kF: [3, 30], fF: [1, 4], kB: [-2, 30], fB: [-3, 4], hF: [5, 124], eF: [4, 106], hB: [2, 122], eB: [0, 104], ball: [4, 128], head: [1, 93] }) },
    { t: 0.55, pose: P({ hip: [0, 52], kF: [5, 34], fF: [3, 12], kB: [-3, 32], fB: [-5, 10], hF: [6, 92], eF: [9, 84], hB: [3, 91], eB: [-3, 84], ball: [5, 95] }) },
    { t: 0.8, pose: P({ hip: [0, 42], kF: [8, 21], fF: [10, 0], kB: [-7, 21], fB: [-10, 0], head: [2, 82], neck: [1, 73], sF: [2, 70], sB: [-2, 70], hF: [6, 72], hB: [4, 71], eF: [13, 70], eB: [-7, 70], ball: [6, 73] }) },
    { t: 1, pose: P({ hip: [0, 44], kF: [7, 22], fF: [9, 0], kB: [-6, 22], fB: [-9, 0], head: [2, 84], neck: [1, 75], sF: [2, 72], sB: [-2, 72], hF: [6, 72], hB: [4, 71], eF: [12, 70], eB: [-6, 70], ball: [6, 73] }) }] },
  // picking a loose ball up off the floor: drop the hips, reach down with both hands, bring it up to the chest
  { name: 'scoop', frames: 7, keys: [
    { t: 0, pose: P({ hip: [-2, 42], kF: [7, 21], fF: [8, 0], kB: [-6, 20], fB: [-8, 0], head: [8, 80], neck: [6, 71], sF: [8, 68], sB: [4, 68], eF: [13, 56], hF: [16, 44], eB: [9, 56], hB: [12, 44] }) },
    { t: 0.4, pose: P({ hip: [-6, 30], kF: [8, 17], fF: [9, 0], kB: [-5, 15], fB: [-10, 0], head: [18, 59], neck: [14, 52], sF: [15, 49], sB: [11, 49], eF: [18, 36], hF: [19, 22], eB: [14, 36], hB: [15, 22], ball: [20, 15] }) },
    { t: 0.7, pose: P({ hip: [-3, 38], kF: [7, 20], fF: [9, 0], kB: [-6, 19], fB: [-10, 0], head: [9, 76], neck: [7, 67], sF: [9, 64], sB: [5, 64], eF: [12, 52], hF: [12, 60], eB: [8, 52], hB: [9, 59], ball: [13, 60] }) },
    { t: 1, pose: P({ hip: [0, 44], kF: [7, 22], fF: [9, 0], kB: [-6, 22], fB: [-9, 0], head: [2, 84], neck: [1, 75], sF: [2, 72], sB: [-2, 72], hF: [6, 72], hB: [4, 71], eF: [12, 70], eB: [-6, 70], ball: [6, 73] }) }] },
  // crossing dribble while holding ○: both hands stay at the hips, the ball goes hand -> floor -> other hand
  { name: 'dribbleReady', frames: 8, loop: true, bounce: [0.25, 0.75], keys: [
    { t: 0, pose: { ...arms(READY, [11, 46], [3, 48]), ball: [11, 40] } },
    { t: 0.25, pose: { ...arms(READY, [9, 44], [5, 45]), ball: [6, 4] } },
    { t: 0.5, pose: { ...arms(READY, [4, 48], [9, 46]), ball: [9, 40] } },
    { t: 0.75, pose: { ...arms(READY, [5, 45], [7, 44]), ball: [6, 4] } },
    { t: 1, pose: { ...arms(READY, [11, 46], [3, 48]), ball: [11, 40] } }] },
  // ---------- dead ball / inbounds / sideline ----------
  { name: 'hold', frames: 4, loop: true, keys: [
    { t: 0, pose: TRIPLE },
    { t: 0.5, pose: P({ hip: [1, 47], kF: [7, 23], fF: [10, 0], kB: [-6, 23], fB: [-8, 1], hF: [6, 66], hB: [4, 65], eF: [8, 60], eB: [4, 60], ball: [7, 67], head: [3, 89] }) },
    { t: 1, pose: TRIPLE }] },
  { name: 'inbound', frames: 4, loop: true, keys: [
    { t: 0, pose: P({ hF: [3, 104], hB: [1, 103], eF: [5, 92], eB: [-2, 92], ball: [3, 109], kF: [5, 26], fF: [7, 0], kB: [-4, 26], fB: [-6, 0] }) },
    { t: 0.5, pose: P({ hF: [5, 103], hB: [3, 102], eF: [6, 91], eB: [0, 91], ball: [5, 108], head: [2, 91], kF: [5, 26], fF: [7, 0], kB: [-4, 26], fB: [-6, 0] }) },
    { t: 1, pose: P({ hF: [3, 104], hB: [1, 103], eF: [5, 92], eB: [-2, 92], ball: [3, 109], kF: [5, 26], fF: [7, 0], kB: [-4, 26], fB: [-6, 0] }) }] },
  { name: 'sit', frames: 4, loop: true, keys: [
    { t: 0, pose: P({ head: [3, 63], neck: [2, 55], sF: [3, 52], sB: [-1, 52], eF: [8, 40], eB: [4, 40], hF: [12, 34], hB: [9, 34], hip: [0, 26], kF: [14, 28], kB: [13, 27], fF: [14, 0], fB: [12, 0] }) },
    { t: 0.5, pose: P({ head: [4, 63], neck: [3, 55], sF: [4, 52], sB: [0, 52], eF: [8, 39], eB: [4, 39], hF: [12, 33], hB: [9, 33], hip: [0, 26], kF: [14, 28], kB: [13, 27], fF: [14, 0], fB: [12, 0] }) },
    { t: 1, pose: P({ head: [3, 63], neck: [2, 55], sF: [3, 52], sB: [-1, 52], eF: [8, 40], eB: [4, 40], hF: [12, 34], hB: [9, 34], hip: [0, 26], kF: [14, 28], kB: [13, 27], fF: [14, 0], fB: [12, 0] }) }] },
  { name: 'cheer', frames: 6, loop: true, keys: [
    { t: 0, pose: P({ hF: [6, 112], eF: [5, 96], hB: [-4, 110], eB: [-3, 95] }) },
    { t: 0.5, pose: P({ hF: [10, 108], eF: [6, 95], hB: [-8, 107], eB: [-4, 94], hip: [0, 53], head: [1, 93], neck: [0, 84], sF: [2, 81], sB: [-2, 81], kF: [3, 29], kB: [-2, 29] }) },
    { t: 1, pose: P({ hF: [6, 112], eF: [5, 96], hB: [-4, 110], eB: [-3, 95] }) }] },
  { name: 'point', frames: 4, keys: [
    { t: 0, pose: BASE },
    { t: 0.5, pose: P({ hF: [20, 78], eF: [12, 76], head: [3, 91] }) },
    { t: 1, pose: P({ hF: [21, 80], eF: [12, 77], head: [3, 91] }) }] },
];

/**
 * Lean a whole pose back about the hip (rigid rotation, so every limb keeps its length): the head and the ball go
 * back (away from the facing), the feet kick forward. deg > 0 = lean back.
 */
export function leanBack(p: Pose, deg: number): Pose {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), [hx, hy] = p.hip;
  const rot = (j: J): J => { const x = j[0] - hx, y = j[1] - hy; return [hx + x * c - y * s, hy + x * s + y * c]; };
  const out = { ...p } as Pose;
  for (const k of JOINTS) if (k !== 'hip') out[k] = rot(p[k]);
  if (p.ball) out.ball = rot(p.ball);
  return out;
}
// ---------- Dreamer fakes (✕ tap with the Finishing ability): each sells its own shot, feet stay planted ----------
/** A fake pose: torso up/down (hip y), shoulders turned (turn > 0 = near shoulder back, for the hook), the hands
 * placed at fixed arm length and the ball carried at the shooting hand (+ offset); feet planted at fF/fB. */
const fakePose = (o: { hip: number; head?: J; hF: J; hB: J; ball?: J; turn?: number; fF?: J; fB?: J }): Pose => {
  const lift = o.hip - 47, t = o.turn ?? 0;
  const torso = P({ hip: [0, o.hip], head: o.head ?? [2, 89 + lift], neck: [1, 80 + lift], sF: [2 - t, 77 + lift], sB: [-2 + t, 77 + lift] });
  const pz = arms(legs(torso, o.fF ?? [9, 0], o.fB ?? [-9, 0]), o.hF, o.hB);
  const off = o.ball ?? [1, 3];
  return { ...pz, ball: [pz.hF[0] + off[0], pz.hF[1] + off[1]] };
};
CLIPS.push(
  // layup fake: gather, rise onto the toes and lift it one-handed toward the rim (front knee coming up), drop back
  { name: 'fake_layup', frames: 14, keys: [
    { t: 0, pose: TRIPLE },
    { t: 0.22, pose: fakePose({ hip: 45, hF: [9, 63], hB: [7, 61], ball: [1, 2] }) },
    { t: 0.45, pose: fakePose({ hip: 51, head: [3, 93], hF: [12, 94], hB: [3, 78], ball: [1, 4], fF: [11, 7] }) },
    { t: 0.62, pose: fakePose({ hip: 52, head: [3, 94], hF: [13, 97], hB: [3, 79], ball: [1, 4], fF: [11, 7] }) },
    { t: 0.82, pose: fakePose({ hip: 48, hF: [9, 73], hB: [7, 71], ball: [1, 2] }) },
    { t: 1, pose: TRIPLE }] },
  // floater fake: a dip, then a quick one-hand teardrop flick high out front (off arm out for balance), back down
  { name: 'fake_floater', frames: 14, keys: [
    { t: 0, pose: TRIPLE },
    { t: 0.2, pose: fakePose({ hip: 44, hF: [8, 61], hB: [6, 60], ball: [1, 2] }) },
    { t: 0.42, pose: fakePose({ hip: 50, head: [4, 92], hF: [15, 96], hB: [-6, 73], ball: [2, 4], fF: [10, 3] }) },
    { t: 0.6, pose: fakePose({ hip: 50, head: [4, 92], hF: [16, 99], hB: [-6, 74], ball: [2, 4], fF: [10, 3] }) },
    { t: 0.82, pose: fakePose({ hip: 47, hF: [9, 74], hB: [6, 70], ball: [1, 2] }) },
    { t: 1, pose: TRIPLE }] },
  // hook fake: shoulders turn, the ball swings out to the far side and sweeps up over the head (off arm barred out
  // front), then swings back to the chest
  { name: 'fake_hook', frames: 14, keys: [
    { t: 0, pose: TRIPLE },
    { t: 0.24, pose: fakePose({ hip: 46, turn: 3, hF: [-8, 70], hB: [12, 70], ball: [-2, 1] }) },
    { t: 0.46, pose: fakePose({ hip: 50, turn: 3, head: [2, 92], hF: [-4, 102], hB: [13, 73], ball: [0, 4], fF: [7, 6] }) },
    { t: 0.62, pose: fakePose({ hip: 50, turn: 3, head: [2, 92], hF: [-3, 103], hB: [13, 73], ball: [0, 4], fF: [7, 6] }) },
    { t: 0.84, pose: fakePose({ hip: 47, turn: 1, hF: [4, 75], hB: [9, 69], ball: [2, 2] }) },
    { t: 1, pose: TRIPLE }] },
);

// ---------- post up (L2) ----------
// Authored facing +x = AWAY from the rim (back to the basket); the defender is behind (-x). Angled clips: the view
// turns with the post angle (GameScene.viewFor), like the defensive stance.
/** Back-down stance: low and wide, hips back into the defender, the ball dribbled out front on the near hand, the
 * off arm barred back toward him. dip = extra crouch, back = hips further back (a bump). */
const postPose = (o: { dip?: number; back?: number; hand: J; ball: J | null; bar?: J; lean?: number }): Pose => {
  const dip = o.dip ?? 0, back = o.back ?? 0, lean = o.lean ?? 0;
  const torso = P({ hip: [-5 - back, 41 - dip], neck: [2 + lean - back * 0.4, 70 - dip], head: [5 + lean - back * 0.4, 79 - dip], sF: [3 + lean - back * 0.4, 67 - dip], sB: [-1 + lean - back * 0.4, 67 - dip] });
  const lg = legs(torso, [8, 0], [-11, 0]);
  return { ...arms(lg, o.hand, o.bar ?? [-13 - back, 57 - dip], [-1, 1]), ball: o.ball, lat: { fF: 8, kF: 7, fB: -8, kB: -7 } };
};
/** Posted defender: low, chest and forearm into the attacker's back (he's in front, +x). */
const postDefPose = (o: { dip?: number; push?: number } = {}): Pose => {
  const dip = o.dip ?? 0, push = o.push ?? 0;
  const torso = P({ hip: [-3 + push * 0.5, 43 - dip], neck: [4 + push, 72 - dip], head: [7 + push, 81 - dip], sF: [5 + push, 69 - dip], sB: [1 + push, 69 - dip] });
  return { ...arms(legs(torso, [7, 0], [-11, 0]), [16 + push, 60 - dip], [12 + push, 50 - dip]), lat: { fF: 9, kF: 8, fB: -9, kB: -8, hF: 6, hB: -6 } };
};
CLIPS.push(
  { name: 'postUp', frames: 8, loop: true, bounce: [0.5], keys: [
    { t: 0, pose: postPose({ hand: [14, 40], ball: [15, 35] }) },
    { t: 0.25, pose: postPose({ dip: 0.8, back: 0.6, hand: [15, 37], ball: [16, 26] }) },
    { t: 0.5, pose: postPose({ dip: 1.2, back: 1, hand: [14, 38], ball: [16, 4] }) },
    { t: 0.75, pose: postPose({ dip: 0.6, back: 0.4, hand: [14, 41], ball: [15, 24] }) },
    { t: 1, pose: postPose({ hand: [14, 40], ball: [15, 35] }) }] },
  // the bump: hips and the barred arm drive back into him, ball tucked up to the chest
  { name: 'postBump', frames: 6, keys: [
    { t: 0, pose: postPose({ hand: [14, 40], ball: [15, 35] }) },
    { t: 0.35, pose: postPose({ dip: 3, back: 5, lean: 3, hand: [12, 52], ball: [13, 50], bar: [-20, 62] }) },
    { t: 0.6, pose: postPose({ dip: 2, back: 3, lean: 2, hand: [13, 48], ball: [14, 45], bar: [-17, 60] }) },
    { t: 1, pose: postPose({ hand: [14, 40], ball: [15, 35] }) }] },
  // shoved off by a stronger defender: lurches forward (away from the rim), ball tucked, then gathers himself
  { name: 'postBumpedBack', frames: 7, keys: [
    { t: 0, pose: postPose({ hand: [14, 40], ball: [15, 35] }) },
    { t: 0.3, pose: { ...arms(legs(P({ hip: [3, 43], neck: [12, 69], head: [16, 77], sF: [12, 66], sB: [8, 66] }), [19, 3], [-6, 0]), [16, 54], [13, 50]), ball: [17, 53] } },
    { t: 0.6, pose: { ...arms(legs(P({ hip: [2, 45], neck: [8, 73], head: [11, 81], sF: [8, 70], sB: [4, 70] }), [16, 0], [-7, 0]), [15, 56], [12, 52]), ball: [16, 55] } },
    { t: 1, pose: { ...arms(athletic, [11, 58], [9, 56]), ball: [12, 57] } }] },
  { name: 'postDefend', frames: 8, loop: true, keys: [
    { t: 0, pose: postDefPose() },
    { t: 0.5, pose: postDefPose({ dip: 1, push: 1.2 }) },
    { t: 1, pose: postDefPose() }] },
  // bumped by the post: rocked back on his heels, arms out for balance (held while stun-locked)
  { name: 'postBumped', frames: 7, keys: [
    { t: 0, pose: postDefPose({ push: 1 }) },
    { t: 0.3, pose: { ...arms(legs(P({ hip: [-6, 46], neck: [-7, 76], head: [-9, 85], sF: [-6, 73], sB: [-9, 73] }), [5, 2], [-17, 0]), [8, 74], [-17, 66]), lat: { hF: 10, hB: -10 } } },
    { t: 0.65, pose: { ...arms(legs(P({ hip: [-5, 45], neck: [-5, 75], head: [-7, 84], sF: [-4, 72], sB: [-7, 72] }), [6, 0], [-15, 0]), [9, 66], [-16, 62]), lat: { hF: 12, hB: -12 } } },
    { t: 1, pose: { ...arms(legs(P({ hip: [-4, 44], neck: [-3, 74], head: [-5, 83], sF: [-2, 71], sB: [-5, 71] }), [6, 0], [-14, 0]), [10, 62], [-14, 60]), lat: { hF: 12, hB: -12 } } }] },
);

// ---------- post kick-out (round 44): pass out of the post / a double team ----------
// From the post crouch he pivots up toward the target, takes the ball overhead in both hands (out of the digging
// hands) and whips a two-handed outlet over the top, finishing with arms out and a step into it.
CLIPS.push({ name: 'postPass', frames: 9, keys: [
  { t: 0, pose: postPose({ dip: 1, back: 1, hand: [13, 42], ball: [14, 38] }) },
  { t: 0.3, pose: { ...arms(legs(P({ hip: [-2, 45], head: [0, 87], neck: [-1, 78], sF: [0, 75], sB: [-3, 75] }), [8, 0], [-10, 0]), [-2, 96], [-4, 94]), ball: [-3, 101] } },
  { t: 0.55, pose: { ...arms(legs(P({ hip: [1, 47], head: [6, 88], neck: [5, 79], sF: [6, 76], sB: [2, 76] }), [13, 0], [-9, 0]), [31, 82], [29, 80]), ball: [34, 83] } },
  { t: 1, pose: { ...arms(legs(P({ hip: [1, 47], head: [5, 88], neck: [4, 79], sF: [5, 76], sB: [1, 76] }), [11, 0], [-9, 0]), [28, 64], [26, 62]), ball: null } }] });

// ---------- loose-ball dive (✕ when the ball is loose on the floor) ----------
// Launch low and forward, fly out horizontally with both arms reaching for the ball, slide on the floor, get up.
CLIPS.push({ name: 'dive', frames: 12, keys: [
  { t: 0, pose: P({ hip: [0, 40], kF: [9, 20], fF: [12, 0], kB: [-8, 20], fB: [-12, 0], head: [9, 78], neck: [7, 70], sF: [6, 67], sB: [3, 67], eF: [14, 58], hF: [20, 50], eB: [10, 58], hB: [16, 50] }) },
  { t: 0.15, pose: { head: [26, 58], neck: [19, 54], sF: [16, 52], sB: [14, 53], eF: [29, 52], hF: [41, 52], eB: [27, 54], hB: [39, 55], hip: [-2, 36], kF: [4, 16], fF: [2, -1], kB: [-20, 30], fB: [-38, 22], ball: null } },
  { t: 0.33, pose: { head: [34, 26], neck: [27, 24], sF: [24, 23], sB: [22, 24], eF: [37, 22], hF: [50, 21], eB: [35, 24], hB: [48, 25], hip: [0, 22], kF: [-22, 20], fF: [-46, 18], kB: [-23, 23], fB: [-47, 24], ball: null } },
  { t: 0.55, pose: { head: [34, 9], neck: [27, 8], sF: [24, 7], sB: [22, 8], eF: [37, 6], hF: [50, 5], eB: [35, 8], hB: [48, 8], hip: [0, 6], kF: [-23, 5], fF: [-48, 4], kB: [-23, 8], fB: [-48, 9], ball: null } },
  { t: 0.72, pose: { head: [30, 10], neck: [23, 9], sF: [20, 8], sB: [18, 9], eF: [31, 5], hF: [42, 3], eB: [29, 8], hB: [40, 6], hip: [-2, 7], kF: [-24, 6], fF: [-48, 4], kB: [-22, 9], fB: [-46, 10], ball: null } },
  { t: 0.86, pose: { head: [12, 50], neck: [9, 43], sF: [8, 40], sB: [5, 41], eF: [15, 30], hF: [20, 20], eB: [12, 31], hB: [16, 20], hip: [-6, 24], kF: [8, 14], fF: [12, 0], kB: [-14, 2], fB: [-36, 1], ball: null } },
  { t: 1, pose: P({ hip: [0, 46], kF: [5, 23], fF: [8, 0], kB: [-6, 23], fB: [-9, 0], head: [3, 87], neck: [2, 78], sF: [3, 75], sB: [-1, 75], eF: [7, 63], hF: [11, 52], eB: [3, 63], hB: [6, 52] }) }] });

// ---------- garage workouts (round 38) ----------
// Side-view poses like every clip (+x = facing). The squat is shown from the front (multi-angle yaw 90) and the
// treadmill reuses `jog` from behind (yaw -90); push-ups, bench press and jump rope are side views. `lat: {}` keeps the
// keyed arm lengths (rigArms only stretches arms of free clips without lat).
const SQ_LAT = { hF: 15, hB: -15, eF: 13, eB: -13, kF: 4, kB: -4, fF: 5, fB: -5 };
// hands grip the bar on the shoulders from below: elbows point down under it
const SQ_UP = { ...legs(P({ head: [1, 91], neck: [0, 82], sF: [1, 79], sB: [-1, 79], hip: [0, 51] }), [3, 0], [-3, 0]), eF: [-3, 67] as J, eB: [-4, 67] as J, hF: [0, 79] as J, hB: [-1, 79] as J };
const SQ_DOWN = { ...legs(P({ head: [9, 67], neck: [6, 58], sF: [6, 55], sB: [4, 55], hip: [-12, 30] }), [3, 0], [-3, 0]), eF: [3, 43] as J, eB: [2, 43] as J, hF: [6, 55] as J, hB: [5, 55] as J };
CLIPS.push({ name: 'squat', frames: 12, loop: true, keys: [
  { t: 0, pose: { ...SQ_UP, lat: SQ_LAT } },
  { t: 0.42, pose: { ...SQ_DOWN, lat: { ...SQ_LAT, kF: 9, kB: -9 } } },
  { t: 0.55, pose: { ...SQ_DOWN, lat: { ...SQ_LAT, kF: 9, kB: -9 } } },
  { t: 1, pose: { ...SQ_UP, lat: SQ_LAT } }] });
const PU_UP = arms({ head: [33, 32], neck: [29, 30], sF: [26, 27], sB: [25, 28], eF: [26, 13], eB: [25, 13], hF: [26, 0], hB: [24, 0], hip: [0, 18], kF: [-22, 11], kB: [-23, 12], fF: [-48, 2], fB: [-49, 3], ball: null, lat: {} }, [26, 0], [24, 0]);
const PU_DOWN = arms({ head: [33, 14], neck: [29, 12], sF: [26, 9], sB: [25, 10], eF: [16, 12], eB: [15, 12], hF: [26, 0], hB: [24, 0], hip: [3, 7], kF: [-21, 5], kB: [-22, 6], fF: [-48, 2], fB: [-49, 3], ball: null, lat: {} }, [26, 0], [24, 0], [-1, -1]);
CLIPS.push({ name: 'pushup', frames: 10, loop: true, keys: [{ t: 0, pose: PU_UP }, { t: 0.45, pose: PU_DOWN }, { t: 0.55, pose: PU_DOWN }, { t: 1, pose: PU_UP }] });
// ---------- dribbling mat (round 40) ----------
// Front-view drills, shown at yaw 90 (facing the camera) like the owner's reference: a low, wide stance, chest over the
// knees, the ball pounded hard beside the feet. Each joint is [forward, height] + lat (sideways, + = the player's right),
// so from the front only lat and height show; forward only decides what's in front (the ball goes behind the legs /
// back with forward < -4). Every move starts and ends with the ball in the right hand, so the pound loop picks up cleanly.
type B3 = [number, number, number]; // [forward, height, lat]
const GUARD_R: B3 = [12, 42, 22], GUARD_L: B3 = [12, 42, -22];
const matPose = (hR: B3, hL: B3, ball: B3, sway = 0, dip = 0): Pose => {
  const sh = 63 - dip;
  const elbow = (h: B3, side: number): J => [(6 + h[0]) / 2, (sh + h[1]) / 2 - 2];
  const eLat = (h: B3, side: number) => (side * 12.5 + h[2]) / 2 + side * 5;
  return {
    head: [9, 75 - dip], neck: [7, 66 - dip], sF: [6, sh], sB: [6, sh], hip: [0, 37 - dip],
    eF: elbow(hR, 1), hF: [hR[0], hR[1]], eB: elbow(hL, -1), hB: [hL[0], hL[1]],
    kF: [7, 19], fF: [2, 0], kB: [7, 19], fB: [2, 0],
    ball: [ball[0], ball[1]], ballLat: ball[2],
    lat: { head: sway * 3, neck: sway * 2.5, hip: sway * 1.5, sF: 12.5 + sway * 2, sB: -12.5 + sway * 2,
      eF: eLat(hR, 1) + sway, hF: hR[2], eB: eLat(hL, -1) + sway, hB: hL[2], kF: 15, fF: 17, kB: -15, fB: -17 },
  };
};
// the ball in the right / left hand at the top of the dribble, and on the floor beside each foot / in the middle
const RH = (h: number, lat = 21): [B3, B3] => [[9, h + 6, lat - 1], [10, h, lat]];
CLIPS.push(
  { name: 'mat_pound', frames: 8, loop: true, bounce: [0.5], keys: [
    { t: 0, pose: matPose(RH(30)[0], GUARD_L, RH(30)[1]) },
    { t: 0.2, pose: matPose(RH(21)[0], GUARD_L, RH(21)[1], 0, 1) },
    { t: 0.5, pose: matPose([9, 24, 20], GUARD_L, [10, 4.5, 22], 0, 1.5) },
    { t: 0.78, pose: matPose(RH(22)[0], GUARD_L, RH(22)[1], 0, 0.5) },
    { t: 1, pose: matPose(RH(30)[0], GUARD_L, RH(30)[1]) }] },
  // ✕ crossover and back: right → bounce in front → left hand, then left → bounce → right
  { name: 'mat_cross', frames: 16, bounce: [0.25, 0.75], keys: [
    { t: 0, pose: matPose(RH(30)[0], GUARD_L, RH(30)[1]) },
    { t: 0.12, pose: matPose([11, 28, 14], GUARD_L, [12, 22, 12], -0.3, 1) },
    { t: 0.25, pose: matPose([10, 26, 10], [11, 26, -10], [14, 4.5, 0], -0.6, 2) },
    { t: 0.38, pose: matPose(GUARD_R, [11, 28, -15], [12, 22, -14], -1, 1) },
    { t: 0.5, pose: matPose(GUARD_R, [9, 36, -20], [10, 30, -21], -1) },
    { t: 0.62, pose: matPose(GUARD_R, [11, 28, -14], [12, 22, -12], -0.4, 1) },
    { t: 0.75, pose: matPose([11, 26, 10], [10, 26, -10], [14, 4.5, 0], 0.4, 2) },
    { t: 0.88, pose: matPose([11, 28, 15], GUARD_L, [12, 22, 14], 0.8, 1) },
    { t: 1, pose: matPose(RH(30)[0], GUARD_L, RH(30)[1]) }] },
  // ○ between the legs and back: the ball bounces between the feet (behind the knees) to the other hand, twice
  { name: 'mat_legs', frames: 16, bounce: [0.25, 0.75], keys: [
    { t: 0, pose: matPose(RH(30)[0], GUARD_L, RH(30)[1]) },
    { t: 0.12, pose: matPose([2, 24, 14], GUARD_L, [1, 18, 11], 0, 2) },
    { t: 0.25, pose: matPose([0, 22, 8], [2, 24, -8], [-6, 4.5, 0], 0, 3) },
    { t: 0.38, pose: matPose(GUARD_R, [2, 24, -14], [1, 18, -11], -0.5, 2) },
    { t: 0.5, pose: matPose(GUARD_R, [9, 34, -20], [10, 28, -21], -0.8, 1) },
    { t: 0.62, pose: matPose(GUARD_R, [2, 24, -14], [1, 18, -11], -0.3, 2) },
    { t: 0.75, pose: matPose([2, 24, 8], [0, 22, -8], [-6, 4.5, 0], 0, 3) },
    { t: 0.88, pose: matPose([2, 24, 14], GUARD_L, [1, 18, 11], 0.5, 2) },
    { t: 1, pose: matPose(RH(30)[0], GUARD_L, RH(30)[1]) }] },
  // □ behind the back: the right hand wraps it round the hips, it bounces behind you up into the left hand, then a
  // crossover in front brings it home
  { name: 'mat_back', frames: 16, bounce: [0.4, 0.78], keys: [
    { t: 0, pose: matPose(RH(30)[0], GUARD_L, RH(30)[1]) },
    { t: 0.14, pose: matPose([-3, 38, 22], GUARD_L, [-5, 34, 24], 0.4) },
    { t: 0.27, pose: matPose([-9, 39, 9], GUARD_L, [-11, 36, 4], 0.6, 1) },
    { t: 0.4, pose: matPose(GUARD_R, [-6, 26, -10], [-10, 4.5, -6], 0, 2) },
    { t: 0.54, pose: matPose(GUARD_R, [1, 32, -20], [0, 26, -21], -0.8, 1) },
    { t: 0.64, pose: matPose(GUARD_R, [9, 34, -19], [10, 28, -20], -1) },
    { t: 0.78, pose: matPose([11, 26, 10], [10, 26, -10], [14, 4.5, 0], 0, 2) },
    { t: 0.9, pose: matPose([11, 28, 15], GUARD_L, [12, 22, 14], 0.6, 1) },
    { t: 1, pose: matPose(RH(30)[0], GUARD_L, RH(30)[1]) }] },
  // △ in-and-out: the right hand fakes the ball inward (head and shoulders sell it), then snaps it back out and pounds
  { name: 'mat_inout', frames: 10, bounce: [0.58], keys: [
    { t: 0, pose: matPose(RH(30)[0], GUARD_L, RH(30)[1]) },
    { t: 0.22, pose: matPose([10, 30, 11], GUARD_L, [11, 24, 9], -1, 1) },
    { t: 0.4, pose: matPose([10, 30, 24], GUARD_L, [11, 24, 25], 0.8, 1) },
    { t: 0.58, pose: matPose([9, 24, 21], GUARD_L, [10, 4.5, 23], 0.4, 2) },
    { t: 0.8, pose: matPose(RH(22)[0], GUARD_L, RH(22)[1], 0.1, 1) },
    { t: 1, pose: matPose(RH(30)[0], GUARD_L, RH(30)[1]) }] },
);
/** The dribbling-mat clips (drawn facing the camera). */
export const MAT_CLIPS = ['mat_pound', 'mat_cross', 'mat_legs', 'mat_back', 'mat_inout'];

// bench press: lying on the back, facing +x = toward the feet (so the shoes point the right way); the head lies at -x
// with the back of the head on the bench, turned to look up (headTurn); the scene doesn't mirror it
const BP_BODY = legs({ head: [-27, 33], neck: [-21, 30], sF: [-16, 29], sB: [-16, 30], eF: [-16, 29], eB: [-16, 30], hF: [-16, 29], hB: [-16, 30], hip: [11, 26], kF: [0, 0], kB: [0, 0], fF: [0, 0], fB: [0, 0], ball: null, lat: {}, headTurn: -Math.PI / 2 }, [31, 0], [36, 0]);
const BP_UP = arms(BP_BODY, [-15, 56], [-16, 56]);
const BP_DOWN = arms(BP_BODY, [-12, 38], [-13, 38], [-1, -1]);
CLIPS.push({ name: 'benchPress', frames: 12, loop: true, keys: [{ t: 0, pose: BP_UP }, { t: 0.45, pose: BP_DOWN }, { t: 0.55, pose: BP_DOWN }, { t: 1, pose: BP_UP }] });
// sleeping on the couch (round 45): on his back along the seat (side view, head at -x on the pillow, looking up like the
// bench press), one hand on his belly, the other hanging off the cushion, legs out with soft knees; the chest rises.
// Round 46: propped up on the pillow (torso reclined, head tipped back) with the knees a little bent, so
// the whole figure (hair included) fits inside the 96-px frame even for a 7-footer, the head used to be cut off.
const SL_BODY = (breath: number) => legs({ head: [-23, 50 + breath * 0.5], neck: [-20, 45 + breath], sF: [-16, 41 + breath], sB: [-16, 42 + breath], eF: [-16, 41], eB: [-16, 42], hF: [-16, 41], hB: [-16, 42], hip: [2, 24], kF: [0, 0], kB: [0, 0], fF: [0, 0], fB: [0, 0], ball: null, lat: {}, headTurn: -0.85 }, [37, 23], [36, 21]);
const SL = (breath: number) => arms(SL_BODY(breath), [-1, 32 + breath], [-19, 17], [-1, 1]);
CLIPS.push({ name: 'sleep', frames: 8, loop: true, keys: [{ t: 0, pose: SL(0) }, { t: 0.5, pose: SL(1.4) }, { t: 1, pose: SL(0) }] });
// jump rope: small hops on the balls of the feet, hands by the hips turning the rope
const JR_DOWN = arms(legs(P({ head: [2, 90], neck: [1, 81], sF: [2, 78], sB: [-1, 78], hip: [0, 49] }), [3, 0], [-2, 0]), [10, 52], [8, 52]);
const JR_UP = arms(legs(P({ head: [2, 96], neck: [1, 87], sF: [2, 84], sB: [-1, 84], hip: [0, 56] }), [4, 6], [-1, 5]), [10, 58], [8, 58]);
CLIPS.push({ name: 'jumpRope', frames: 8, loop: true, keys: [{ t: 0, pose: { ...JR_DOWN, lat: {} } }, { t: 0.5, pose: { ...JR_UP, lat: {} } }, { t: 1, pose: { ...JR_DOWN, lat: {} } }] });

// ---------- dunk package (dunks.ts: unlocks with the Dunk rating) ----------
// Same timing as shot_dunk (11 frames, release 0.7, post 0.6) so the ball flight and the sound stay in sync.
// Legs / hips per phase are shot_dunk's; the arms are solved at fixed length and the ball rides the hand.
const DK_LEGS: Record<string, Partial<Pose>> = {
  gather: { kF: [8, 26], fF: [13, 1], kB: [-4, 28], fB: [-10, 6] },
  load: { hip: [0, 40], kF: [8, 20], fF: [7, 0], kB: [-2, 20], fB: [-5, 0], head: [5, 80], neck: [4, 72], sF: [5, 69], sB: [1, 69] },
  rise: { hip: [0, 54], kF: [7, 42], fF: [4, 24], kB: [-3, 31], fB: [-8, 10] },
  peak: { hip: [0, 54], kF: [6, 40], fF: [3, 22], kB: [-3, 30], fB: [-8, 9] },
  slam: { hip: [0, 54], kF: [6, 38], fF: [3, 20], kB: [-3, 30], fB: [-8, 9] },
  hang: { hip: [0, 52], kF: [3, 25], fF: [3, 3], kB: [-2, 25], fB: [-3, 3], head: [2, 90] },
};
/** A dunk pose: legs of a phase, hands placed at arm length, ball at the ball hand (+ offset) or null. */
const dk = (legs: keyof typeof DK_LEGS, hF: J, hB: J, ball: J | null = [1, 3], extra: Partial<Pose> = {}): Pose => {
  const pz = arms(P({ ...DK_LEGS[legs], ...extra } as PosePatch), hF, hB);
  return { ...pz, ball: ball ? [pz.hF[0] + ball[0], pz.hF[1] + ball[1]] : null };
};
/** The same pose seen from behind, facing the other way (reverse dunks, 360 spins in profile). */
const turned = (p: Pose): Pose => {
  const o = { ...p } as Pose;
  for (const j of JOINTS) o[j] = [-p[j][0], p[j][1]];
  if (p.ball) o.ball = [-p.ball[0], p.ball[1]];
  return { ...o, backView: true };
};
const dunkClip = (name: string, keys: [number, Pose][]): Clip => ({ name, frames: 11, release: 0.7, post: 0.6, keys: keys.map(([t, pose]) => ({ t, pose })) });
const DK_GATHER = dk('gather', [7, 61], [5, 59], [0, 0]);
const DK_LOAD = dk('load', [6, 56], [4, 55], [0, 0]);
const DK_LAND: Pose = { ...arms(athletic, [8, 72], [6, 70]), ball: null };
// Round 54: every dunk gets its own takeoff, body angle and finish (not just different arms). Feet targets for the
// airborne phases (legs solved at fixed length, knees forward):
const FT = {
  oneRise: [[9, 30], [-7, 4]], twoRise: [[4, 8], [-2, 7]], tuck: [[7, 32], [1, 30]], straight: [[3, 4], [-3, 4]],
  hangBent: [[2, 12], [-3, 10]], swing: [[15, 16], [11, 13]], kickBack: [[-3, 12], [-9, 15]], split: [[16, 14], [-16, 12]],
} as const satisfies Record<string, [J, J]>;
/** A dunk pose: feet preset, hands at arm length, ball at the ball hand (+ offset) or null, the whole body leaned
 * (deg > 0 = arched back, < 0 = leaning in over the rim), optionally seen from behind. */
const dkx = (ft: keyof typeof FT, hF: J, hB: J, ball: J | null = [1, 3], o: { lean?: number; turn?: boolean } = {}): Pose => {
  let pz = arms(legs(P({ hip: [0, 54] }), FT[ft][0] as J, FT[ft][1] as J), hF, hB);
  pz = { ...pz, ball: ball ? [pz.hF[0] + ball[0], pz.hF[1] + ball[1]] : null };
  if (o.lean) pz = leanBack(pz, o.lean);
  return o.turn ? turned(pz) : pz;
};
/** Takeoffs: off one foot (long last stride) or two (feet together, deeper load). */
const DK_GATHER1 = dk('gather', [7, 61], [5, 59], [0, 0], { kF: [10, 24], fF: [15, 0], kB: [-6, 27], fB: [-14, 7] });
const DK_LOAD1 = dk('load', [6, 58], [4, 57], [0, 0], { kF: [9, 21], fF: [8, 0], kB: [-4, 24], fB: [-12, 10] });
const DK_GATHER2 = dk('gather', [7, 60], [5, 59], [0, 0], { kF: [6, 26], fF: [6, 0], kB: [-3, 26], fB: [-5, 0] });
const DK_LOAD2 = dk('load', [5, 54], [3, 53], [0, 0], { hip: [0, 37], kF: [9, 18], fF: [5, 0], kB: [0, 18], fB: [-4, 0], head: [6, 77], neck: [5, 69], sF: [6, 66], sB: [2, 66] });
const one = (rest: [number, Pose][]): [number, Pose][] => [[0, DK_GATHER1], [0.25, DK_LOAD1], ...rest, [1, DK_LAND]];
const two = (rest: [number, Pose][]): [number, Pose][] => [[0, DK_GATHER2], [0.25, DK_LOAD2], ...rest, [1, DK_LAND]];
CLIPS.splice(CLIPS.findIndex((c) => c.name === 'shot_dunk'), 1);
CLIPS.push(
  // one-hand flush: off one foot, upright, quick through and straight down
  dunkClip('shot_dunk', one([[0.45, dkx('oneRise', [7, 97], [5, 88])], [0.6, dkx('oneRise', [9, 105], [6, 90])],
    [0.7, dkx('straight', [14, 101], [6, 88], [1, 2])], [0.85, dkx('straight', [11, 96], [5, 84], null)]])),
  // two-hand flush: off two feet, both hands up together, hangs on the rim with the knees bent
  dunkClip('shot_dunk_twoHand', two([[0.45, dkx('twoRise', [7, 96], [5, 95])], [0.6, dkx('tuck', [9, 104], [7, 103])],
    [0.7, dkx('tuck', [14, 101], [12, 100], [1, 2])], [0.85, dkx('hangBent', [12, 106], [10, 105], null)]])),
  // tomahawk: one foot with the knee driven high, leaning in, ball cocked high behind the head, chopped down, legs kick back
  dunkClip('shot_dunk_tomahawk', one([[0.45, dkx('oneRise', [3, 100], [10, 90], [0, 3])], [0.6, dkx('oneRise', [-9, 104], [12, 92], [-1, 3], { lean: -10 })],
    [0.7, dkx('kickBack', [16, 98], [8, 86], [1, 2], { lean: -16 })], [0.85, dkx('kickBack', [13, 100], [6, 88], null, { lean: -6 })]])),
  // two-hand hammer: two feet, knees tucked, arched way back with both hands behind the head, then a long rim hang
  dunkClip('shot_dunk_hammer', two([[0.45, dkx('twoRise', [4, 99], [2, 98])], [0.6, dkx('tuck', [-10, 102], [-11, 101], [0, 3], { lean: 16 })],
    [0.7, dkx('tuck', [14, 100], [12, 99], [1, 2], { lean: 2 })], [0.85, dkx('swing', [12, 106], [10, 105], null, { lean: -4 })]])),
  // cock-back: one foot, the ball arm swung straight back at shoulder height, chest open, then over the top
  dunkClip('shot_dunk_cockBack', one([[0.45, dkx('oneRise', [-12, 74], [12, 92], [-2, 0])], [0.6, dkx('oneRise', [-24, 84], [15, 96], [-3, 1], { lean: 8 })],
    [0.7, dkx('straight', [16, 100], [8, 88], [1, 2], { lean: -10 })], [0.85, dkx('straight', [13, 98], [6, 86], null, { lean: -4 })]])),
  // reverse: two feet, turns his back to the rim in the air, legs split, throws it down backwards over his head
  dunkClip('shot_dunk_reverse', two([[0.45, dkx('twoRise', [6, 96], [4, 95])], [0.6, dkx('tuck', [-4, 104], [-6, 103], [0, 3], { turn: true })],
    [0.7, dkx('split', [-13, 100], [-11, 99], [-1, 2], { turn: true, lean: -6 })], [0.85, dkx('hangBent', [-11, 105], [-9, 104], null, { turn: true })]])),
  // windmill: one foot, a full arm circle (forward and low, back past the hip, up behind, over), knees tucked through it
  dunkClip('shot_dunk_windmill', one([[0.38, dkx('oneRise', [13, 60], [6, 88], [1, -2])], [0.46, dkx('tuck', [-12, 60], [8, 92], [-1, -2])],
    [0.54, dkx('tuck', [-16, 86], [9, 94], [-1, 2], { lean: 6 })], [0.62, dkx('tuck', [-8, 105], [9, 94], [-1, 3], { lean: 8 })],
    [0.7, dkx('swing', [15, 102], [8, 90], [1, 2], { lean: -8 })], [0.85, dkx('swing', [13, 107], [6, 92], null)]])),
  // 360: two feet, tucked, a full spin (facing away through the middle of it), two hands
  dunkClip('shot_dunk_360', two([[0.4, dkx('tuck', [6, 80], [4, 79], [1, 1])], [0.48, dkx('tuck', [6, 84], [4, 83], [1, 1], { turn: true })],
    [0.56, dkx('tuck', [5, 90], [3, 89], [1, 1], { turn: true })], [0.63, dkx('tuck', [8, 100], [6, 99], [1, 3])],
    [0.7, dkx('tuck', [14, 101], [12, 100], [1, 2], { lean: -6 })], [0.85, dkx('hangBent', [12, 106], [10, 105], null)]])),
  // 360 windmill: the spin with the ball circling down and back, then over the top
  dunkClip('shot_dunk_360windmill', two([[0.38, dkx('tuck', [13, 58], [6, 86], [1, -2])], [0.46, dkx('tuck', [-12, 62], [8, 90], [-1, -2], { turn: true })],
    [0.54, dkx('tuck', [-14, 92], [8, 92], [-1, 2], { turn: true })], [0.62, dkx('tuck', [-10, 104], [9, 94], [-1, 3], { lean: 8 })],
    [0.7, dkx('swing', [15, 102], [8, 90], [1, 2], { lean: -8 })], [0.85, dkx('swing', [13, 107], [6, 92], null)]])),
);

// ---------- alley-oops (hold △ to lob) ----------
// passLob: ball lifted high in two hands and floated up toward the rim. oopReach: the receiver in the air, both arms up
// for it. shot_oop: catch with two hands over the head at the top and throw it down; shot_oopLayup: one-hand catch
// high and laid off the glass. Both start airborne (caught in the air), release 0.5.
CLIPS.push(
  { name: 'passLob', frames: 6, keys: [
    { t: 0, pose: chest },
    { t: 0.35, pose: { ...arms(P({ hip: [0, 46], kF: [5, 23], kB: [-4, 23] }), [5, 84], [3, 83]), ball: [6, 88] } },
    { t: 0.6, pose: { ...arms(P({ hip: [0, 50], head: [3, 91] }), [11, 100], [9, 99]), ball: [13, 104] } },
    { t: 1, pose: { ...arms(P({ hip: [0, 49] }), [12, 98], [10, 96]), ball: null } }] },
  { name: 'oopReach', frames: 4, loop: true, keys: [
    { t: 0, pose: { ...arms(P({ ...DK_LEGS.peak } as PosePatch), [7, 104], [4, 103]), ball: null } },
    { t: 0.5, pose: { ...arms(P({ ...DK_LEGS.peak, head: [2, 92] } as PosePatch), [8, 105], [5, 104]), ball: null } },
    { t: 1, pose: { ...arms(P({ ...DK_LEGS.peak } as PosePatch), [7, 104], [4, 103]), ball: null } }] },
  { name: 'shot_oopLayup', frames: 9, release: 0.5, post: 0.6, keys: [
    { t: 0, pose: dk('peak', [8, 104], [3, 92], [1, 3]) },
    { t: 0.25, pose: dk('peak', [6, 98], [4, 90], [1, 3]) },
    { t: 0.5, pose: dk('slam', [12, 104], [5, 88], [1, 4]) },
    { t: 0.75, pose: dk('hang', [12, 106], [5, 86], null) },
    { t: 1, pose: DK_LAND }] },
);

// Round 55: Hang Time (Free-Throw-Line Dunk Lv2): the ball comes down to the hip in the air (the stall), he hangs
// tucked, then brings it back up and throws it down. Release 0.7 like the other dunks.
CLIPS.push(dunkClip('shot_dunk_clutch', [[0, dkx('tuck', [9, 104], [7, 103], [1, 3])], [0.2, dkx('tuck', [8, 62], [10, 70], [1, -1], { lean: 6 })],
  [0.38, dkx('tuck', [7, 60], [11, 72], [1, -1], { lean: 8 })], [0.55, dkx('tuck', [4, 98], [9, 92], [0, 3], { lean: 4 })],
  [0.7, dkx('swing', [15, 101], [8, 90], [1, 2], { lean: -8 })], [0.85, dkx('swing', [12, 106], [10, 105], null)], [1, DK_LAND]]));

// Round 54: alley-oop slams (oop dunk styles, dunks.ts OOP_DUNKS). Caught in the air with the hands up, then a clear
// load, a hard finish through the rim and a hang. Release 0.5, 11 frames.
const oopClip = (name: string, keys: [number, Pose][]): Clip => ({ name, frames: 11, release: 0.5, post: 0.6, keys: [...keys, [1, DK_LAND] as [number, Pose]].map(([t, pose]) => ({ t, pose })) });
const OOP_CATCH2 = dkx('tuck', [8, 105], [6, 104]), OOP_CATCH1 = dkx('oneRise', [9, 105], [4, 94]);
CLIPS.push(
  // two-hand: catch, pull it back behind the head, both hands throw it down, hang
  oopClip('shot_oop', [[0, OOP_CATCH2], [0.2, dkx('tuck', [-8, 103], [-10, 102], [0, 3], { lean: 10 })], [0.36, dkx('tuck', [-11, 100], [-12, 99], [0, 3], { lean: 14 })],
    [0.5, dkx('swing', [15, 99], [13, 98], [1, 2], { lean: -8 })], [0.72, dkx('swing', [12, 106], [10, 105], null, { lean: -2 })]]),
  // one-hand: catch it high one-handed and slam it straight down
  oopClip('shot_oop_oneHand', [[0, OOP_CATCH1], [0.25, dkx('oneRise', [4, 106], [8, 92], [0, 3], { lean: 4 })],
    [0.5, dkx('straight', [16, 99], [6, 86], [1, 2], { lean: -10 })], [0.72, dkx('straight', [13, 104], [5, 86], null)]]),
  // tomahawk: catch, the ball cocked way back with one arm, chopped down, legs kick back
  oopClip('shot_oop_tomahawk', [[0, OOP_CATCH1], [0.18, dkx('oneRise', [-6, 104], [10, 92], [-1, 3], { lean: 6 })], [0.34, dkx('oneRise', [-15, 97], [12, 94], [-2, 2], { lean: 12 })],
    [0.5, dkx('kickBack', [16, 97], [8, 86], [1, 2], { lean: -16 })], [0.72, dkx('kickBack', [13, 100], [6, 88], null, { lean: -6 })]]),
  // reverse: catch, turn the back to the rim, throw it down backwards over the head
  oopClip('shot_oop_reverse', [[0, OOP_CATCH2], [0.25, dkx('tuck', [-4, 104], [-6, 103], [0, 3], { turn: true })],
    [0.5, dkx('split', [-14, 99], [-12, 98], [-1, 2], { turn: true, lean: -6 })], [0.72, dkx('hangBent', [-11, 105], [-9, 104], null, { turn: true })]]),
  // windmill: catch, the ball swings down and around, then over the top
  oopClip('shot_oop_windmill', [[0, OOP_CATCH1], [0.14, dkx('tuck', [13, 64], [6, 90], [1, -2])], [0.27, dkx('tuck', [-12, 62], [8, 92], [-1, -2])],
    [0.39, dkx('tuck', [-12, 98], [9, 94], [-1, 3], { lean: 8 })], [0.5, dkx('swing', [15, 101], [8, 90], [1, 2], { lean: -8 })], [0.72, dkx('swing', [13, 106], [6, 92], null)]]),
);

// Jelly Fake (Finishing ability): up for the dunk, then the ball is pulled down to the hip, he hangs (knees tucked,
// leaning back, off arm shielding) and swoops it up underhand off the fingertips. Release 0.75.
const jellyPose = (legs: PosePatch, torso: PosePatch, hF: J, hB: J, ball: J | null): Pose => {
  const pz = arms(P({ ...legs, ...torso }), hF, hB);
  return { ...pz, ball: ball ? [pz.hF[0] + ball[0], pz.hF[1] + ball[1]] : null };
};
const JELLY_TUCK: PosePatch = { hip: [0, 54], kF: [10, 42], fF: [2, 26], kB: [-6, 38], fB: [-12, 24] };
const JELLY_LEAN: PosePatch = { head: [-2, 90], neck: [-2, 81], sF: [-1, 78], sB: [-4, 78] };
CLIPS.push({ name: 'shot_jelly', frames: 12, release: 0.75, post: 0.5, keys: [
  { t: 0, pose: dk('rise', [7, 97], [5, 96], [1, 3]) },
  { t: 0.25, pose: jellyPose(JELLY_TUCK, JELLY_LEAN, [6, 57], [16, 73], [0, 4]) },
  { t: 0.5, pose: jellyPose(JELLY_TUCK, JELLY_LEAN, [-1, 58], [16, 75], [0, 4]) },
  { t: 0.75, pose: jellyPose({ hip: [0, 54], kF: [8, 38], fF: [4, 20], kB: [-5, 34], fB: [-10, 18] }, { head: [1, 91], neck: [0, 82], sF: [1, 79], sB: [-2, 79] }, [13, 93], [12, 72], [1, 4]) },
  { t: 1, pose: jellyPose({ hip: [0, 52], kF: [4, 26], fF: [4, 4], kB: [-2, 26], fB: [-4, 3] }, { head: [2, 90] }, [10, 100], [8, 74], null) }] });

/**
 * Windmill Gather (Driving ability, D-Wade / Donovan Mitchell): the gather swings the ball in a big arm circle away
 * from the defender (forward and low, back past the hip, up and over) before the finish. Replaces the finish clip's
 * gather keys (0 < t < 0.45) and keeps the rest, so the release timing is the same.
 */
export function windmillGatherOf(c: Clip): Clip {
  const at = (t: number, hand: J, guard: J, off: J): { t: number; pose: Pose } => {
    const base = [...c.keys].reverse().find((k) => k.t <= t)!.pose; // the finish's body at that point (gather / load)
    const pz = arms(base, hand, guard);
    return { t, pose: { ...pz, ball: [pz.hF[0] + off[0], pz.hF[1] + off[1]] } };
  };
  const keep = c.keys.filter((k) => k.t === 0 || k.t >= 0.45);
  const swing = [
    at(0.12, [11, 56], [6, 66], [1, -2]),   // out front and low
    at(0.24, [-11, 58], [8, 68], [-1, -2]), // back past the hip, off arm out as a shield
    at(0.36, [-9, 96], [10, 76], [-1, 3]),  // up behind the head
  ];
  return { ...c, name: `${c.name}_wm`, keys: [keep[0], ...swing, ...keep.slice(1)] };
}

// Fade Away: the jumper, drifting back. Resampled from the jumper at 21 points with a smoothly easing lean (it grows
// through the rise and release, eases off on the way down) and drawn with more frames, so it flows instead of
// stepping between a few leaned keys.
{
  const j = CLIPS.find((c) => c.name === 'shot_jumper')!;
  const ease = (t: number, a: number, b: number) => { const k = Math.max(0, Math.min(1, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
  const lean = (t: number) => 17 * ease(t, 0.1, 0.5) - 7 * ease(t, 0.78, 1);
  const N = 20;
  const keys = Array.from({ length: N + 1 }, (_, i) => { const t = i / N; return { t, pose: leanBack(sampleClip(j, t), lean(t)) }; });
  CLIPS.push({ ...j, name: 'shot_fade', frames: 24, keys });
}

// Windmill Gather variants of every layup / Euro / dunk finish
for (const c of CLIPS.filter((c) => c.name === 'shot_layup' || c.name === 'shot_euro' || c.name.startsWith('shot_dunk')).slice()) CLIPS.push(windmillGatherOf(c));

export const CLIP: Record<string, Clip> = Object.fromEntries(CLIPS.map((c) => [c.name, c]));

/** Map a sim shot type to its animation clip. */
export const SHOT_CLIP: Record<string, string> = {
  three: 'shot_jumper', deep3: 'shot_jumper', mid: 'shot_jumper', fade: 'shot_fade', push: 'shot_push', floater: 'shot_floater',
  hook: 'shot_hook', layup: 'shot_layup', jelly: 'shot_jelly', alleyOop: 'shot_oop', alleyOopLayup: 'shot_oopLayup', euro: 'shot_euro', stepThrough: 'shot_stepThrough', stepThroughJumper: 'shot_stepThroughJumper', dunk: 'shot_dunk',
};

const lerpJ = (a: J, b: J, t: number): J => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** Catmull-Rom through p1..p2 using neighbours p0/p3: smooth curves that still pass through every key. */

/** Pose of a clip at normalized time u (0..1). Joints follow Catmull-Rom splines through the keyframes. */
export function sampleClip(c: Clip, u: number): Pose {
  const k = c.keys;
  u = Math.max(0, Math.min(1, u));
  let i = 0;
  while (i < k.length - 2 && u > k[i + 1].t) i++;
  const a = k[i], b = k[i + 1] ?? a;
  const span = b.t - a.t;
  const t = span > 0 ? (u - a.t) / span : 0;
  // neighbours (loops wrap: the last key repeats the first)
  const prev = i > 0 ? k[i - 1] : c.loop && k.length > 2 ? k[k.length - 2] : a;
  const next = i + 2 < k.length ? k[i + 2] : c.loop && k.length > 2 ? k[1] : b;
  const out = {} as Pose;
  for (const j of JOINTS) out[j] = cr(prev.pose[j], a.pose[j], b.pose[j], next.pose[j], t);
  const ba = a.pose.ball, bb = b.pose.ball;
  out.ball = ba && bb ? cr(prev.pose.ball ?? ba, ba, bb, next.pose.ball ?? bb, t) : t < 0.5 ? ba ?? null : bb ?? null;
  out.backView = t < 0.5 ? !!a.pose.backView : !!b.pose.backView;
  const ht = t < 0.5 ? a.pose.headTurn : b.pose.headTurn;
  if (ht) out.headTurn = ht;
  if (a.pose.lat || b.pose.lat) {
    // sideways spread blends like the joints (keys without one hold their neighbour's)
    const la = a.pose.lat ?? b.pose.lat!, lb = b.pose.lat ?? la, lp = prev.pose.lat ?? la, ln = next.pose.lat ?? lb;
    const lat: Partial<Record<JointName, number>> = {};
    for (const j of Object.keys(la) as JointName[]) {
      const v = (q: Partial<Record<JointName, number>>) => [q[j] ?? la[j]!, 0] as J;
      lat[j] = cr(v(lp), v(la), v(lb), v(ln), t)[0];
    }
    out.lat = lat;
  }
  if (a.pose.ballLat !== undefined && b.pose.ballLat !== undefined) {
    const v = (q: Key, d: number) => [q.pose.ballLat ?? d, 0] as J;
    out.ballLat = cr(v(prev, a.pose.ballLat), [a.pose.ballLat, 0], [b.pose.ballLat, 0], v(next, b.pose.ballLat), t)[0];
  }
  return out;
}

/** Normalized time of frame i in a clip with N frames. */
export const frameTime = (c: Clip, i: number) => (c.loop ? i / c.frames : c.frames > 1 ? i / (c.frames - 1) : 0);

/** Frame index for a normalized time u. */
export function frameAt(c: Clip, u: number): number {
  if (c.loop) { const w = ((u % 1) + 1) % 1; return Math.floor(w * c.frames) % c.frames; }
  return Math.max(0, Math.min(c.frames - 1, Math.round(u * (c.frames - 1))));
}

/**
 * Shot clips: the windup (start..release) plays the frames up to the release key, then the
 * follow-through plays over `post` seconds.
 */
export function shotU(c: Clip, now: number, start: number, release: number | undefined): number {
  const r = c.release ?? 0.6;
  if (release === undefined || now < release) {
    const total = (release ?? start + 0.5) - start;
    return r * Math.max(0, Math.min(1, (now - start) / Math.max(0.05, total)));
  }
  return r + (1 - r) * Math.min(1, (now - release) / (c.post ?? 0.5));
}

/**
 * Defender stance choice with hysteresis so it doesn't flicker between the idle stance and the shuffle when the speed
 * hovers around the threshold: start shuffling above 0.6 ft/s, stop below 0.3 ft/s.
 */
export const shuffleState = (speed: number, wasShuffling: boolean) => (wasShuffling ? speed > 0.3 : speed > 0.6);

// ---------- arm rig (applied when a pose is drawn) ----------
/** How far the arm sockets sit below the authored keyframes (toward the hips), in figure units. */
export const ARM_DROP = 6;
/** How far the jersey/torso top sits below the authored shoulders (less than ARM_DROP so the torso keeps its length). */
export const TORSO_DROP = 4.5;
/** Minimum full arm length for free arms (clips without the ball: defense, off-ball). Authored keys are often shorter. */
export const UPPER_ARM = 15;
export const FOREARM = 14;
/** A hand this close to the ball is holding it (the ball moves down with the arms); past HOLD_FAR it doesn't. */
export const HOLD_NEAR = 8;
export const HOLD_FAR = 12;

const dist = (a: J, b: J) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Offset `amount` units from the neck toward the hips (straight down when upright, sideways in falls). */
export function dropToward(p: Pose, amount: number): J {
  const dx = p.hip[0] - p.neck[0], dy = p.hip[1] - p.neck[1], dl = Math.hypot(dx, dy) || 1;
  return [(dx / dl) * amount, (dy / dl) * amount];
}

/**
 * Lowers the arms by ARM_DROP. Ball clips (any key has the ball: dribbles, moves, shots, holds) move each arm
 * rigidly, keeping its keyed shape and length; a ball held in the hands moves with them. Free clips (no ball:
 * defense, off-ball) scale each arm about the lowered shoulder to at least UPPER_ARM + FOREARM, same shape and bend.
 */
export function rigArms(p: Pose, ballClip: boolean): Pose {
  const out: Pose = { ...p };
  const [dx, dy] = dropToward(p, ARM_DROP);
  const move = (j: J): J => [j[0] + dx, j[1] + dy];
  for (const [sk, ek, hk] of [['sF', 'eF', 'hF'], ['sB', 'eB', 'hB']] as const) {
    const s0 = p[sk], e0 = p[ek], h0 = p[hk];
    const s1 = move(s0);
    // sideways-spread poses (lat) are authored at their real 3D length: don't stretch them in 2D
    const f = ballClip || p.lat ? 1 : Math.max(1, Math.min(2, (UPPER_ARM + FOREARM) / Math.max(1e-6, dist(s0, e0) + dist(e0, h0))));
    out[sk] = s1;
    out[ek] = [s1[0] + (e0[0] - s0[0]) * f, s1[1] + (e0[1] - s0[1]) * f];
    out[hk] = [s1[0] + (h0[0] - s0[0]) * f, s1[1] + (h0[1] - s0[1]) * f];
  }
  if (p.ball) {
    const t = Math.max(0, Math.min(1, (Math.min(dist(p.hF, p.ball), dist(p.hB, p.ball)) - HOLD_NEAR) / (HOLD_FAR - HOLD_NEAR)));
    const hold = 1 - t * t * (3 - 2 * t);
    out.ball = [p.ball[0] + dx * hold, p.ball[1] + dy * hold];
  }
  return out;
}
