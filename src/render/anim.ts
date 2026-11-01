/**
 * Keyframe animation. Poses are skeletons in a canonical figure 100 units tall (top of head = 100,
 * floor = 0, +x = facing direction). Clips list keyframes at normalized times; at sprite-build time
 * each clip is sampled into N frames with eased joint interpolation, which gives smooth in-betweens.
 * Pure TS so it can be unit-tested.
 */
export type J = [number, number];
export const JOINTS = ['head', 'neck', 'sF', 'sB', 'eF', 'eB', 'hF', 'hB', 'hip', 'kF', 'kB', 'fF', 'fB'] as const;
export type JointName = (typeof JOINTS)[number];
/** backView: player turned away from the camera (spin moves) - drawn without a face */
export type Pose = Record<JointName, J> & { ball?: J | null; backView?: boolean };
type PosePatch = Partial<Record<JointName, J>> & { ball?: J | null; backView?: boolean };

export const BASE: Pose = {
  head: [1, 91], neck: [0, 82], sF: [2, 79], sB: [-2, 79], eF: [4, 65], eB: [-3, 65], hF: [5, 52], hB: [-3, 52],
  hip: [0, 51], kF: [3, 27], kB: [-2, 27], fF: [3, 0], fB: [-3, 0], ball: null,
};

const P = (patch: PosePatch, from: Pose = BASE): Pose => ({ ...from, ...patch });

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
const [sprA, sprB] = stride(1.35, 6, 16);
// running dribble: legs from the jog, front arm pumping the ball
const runDrib = (legs: Pose, hand: J, ball: J): Pose => ({ ...legs, eF: [9, 62], hF: hand, ball, eB: [0, 66], hB: [6, 60] });

export const CLIPS: Clip[] = [
  // ---------- locomotion ----------
  { name: 'idle', frames: 4, loop: true, keys: [{ t: 0, pose: BASE }, { t: 0.5, pose: P({ head: [1, 90.3], neck: [0, 81.3], sF: [2, 78.4], sB: [-2, 78.4], hip: [0, 50.5] }) }, { t: 1, pose: BASE }] },
  { name: 'jog', frames: 8, loop: true, keys: cycle(jogA, jogB) },
  { name: 'sprint', frames: 8, loop: true, keys: cycle(sprA, sprB) },
  { name: 'defend', frames: 4, loop: true, keys: [
    { t: 0, pose: P({ eF: [10, 71], hF: [17, 75], eB: [-9, 71], hB: [-14, 76] }, lowStance) },
    { t: 0.5, pose: P({ hip: [0, 43], head: [3, 84], neck: [2, 75], eF: [10, 70], hF: [17, 72], eB: [-9, 70], hB: [-14, 73] }, lowStance) },
    { t: 1, pose: P({ eF: [10, 71], hF: [17, 75], eB: [-9, 71], hB: [-14, 76] }, lowStance) }] },
  { name: 'slide', frames: 6, loop: true, keys: [
    { t: 0, pose: P({ eF: [10, 71], hF: [17, 75], eB: [-9, 71], hB: [-14, 76] }, lowStance) },
    { t: 0.5, pose: P({ kF: [4, 22], kB: [-3, 22], fF: [4, 1], fB: [-4, 0], hip: [0, 46], eF: [10, 71], hF: [17, 76], eB: [-9, 71], hB: [-14, 77] }, lowStance) },
    { t: 1, pose: P({ eF: [10, 71], hF: [17, 75], eB: [-9, 71], hB: [-14, 76] }, lowStance) }] },
  { name: 'dribble', frames: 6, loop: true, bounce: [0.5], keys: [{ t: 0, pose: dribHigh }, { t: 0.5, pose: dribLow }, { t: 1, pose: dribHigh }] },
  { name: 'dribbleRun', frames: 8, loop: true, bounce: [0.25, 0.75], keys: [
    { t: 0, pose: runDrib(jogA, [11, 47], [12, 42]) }, { t: 0.25, pose: runDrib(jogB, [11, 42], [13, 3]) },
    { t: 0.5, pose: runDrib(mirrorLegsArms(jogA), [11, 47], [12, 42]) }, { t: 0.75, pose: runDrib(mirrorLegsArms(jogB), [11, 42], [13, 3]) },
    { t: 1, pose: runDrib(jogA, [11, 47], [12, 42]) }] },

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
  { name: 'move_lateral', frames: 9, bounce: [0.3, 0.75], keys: [
    { t: 0, pose: P({ hip: [0, 44], head: [4, 85], neck: [3, 76], hF: [11, 42], ball: [12, 36], kF: [8, 22], fF: [11, 0] }, athletic) },
    { t: 0.3, pose: P({ hip: [0, 42], head: [8, 81], neck: [6, 73], sF: [7, 70], sB: [3, 70], kF: [12, 24], fF: [18, 2], kB: [-7, 20], fB: [-14, 3], hF: [16, 20], eF: [12, 46], ball: [17, 4] }) },
    { t: 0.55, pose: P({ hip: [0, 43], head: [8, 82], neck: [6, 74], sF: [7, 71], sB: [3, 71], kF: [3, 30], fF: [1, 10], kB: [9, 24], fB: [15, 1], hF: [15, 38], eF: [11, 54], ball: [16, 32] }) },
    { t: 0.75, pose: P({ hip: [0, 42], head: [8, 81], neck: [6, 73], sF: [7, 70], sB: [3, 70], kF: [12, 24], fF: [18, 2], kB: [-7, 20], fB: [-14, 3], hF: [16, 20], eF: [12, 46], ball: [17, 4] }) },
    { t: 1, pose: P({ hip: [0, 44], head: [5, 84], neck: [4, 75], hF: [12, 42], ball: [13, 36], kF: [8, 22], fF: [11, 0] }, athletic) }] },

  // ---------- shots ----------
  { name: 'shot_jumper', frames: 12, release: 0.58, post: 0.55, keys: [
    { t: 0, pose: chest },
    { t: 0.22, pose: P({ hip: [0, 44], kF: [6, 22], kB: [1, 22], head: [2, 86], neck: [1, 77], sF: [2, 74], sB: [-2, 74], ball: [6, 58], hF: [6, 60], hB: [4, 58], eF: [6, 66], eB: [3, 66] }) },
    { t: 0.42, pose: P({ hip: [0, 53], kF: [2, 29], fF: [2, 1], kB: [-1, 29], fB: [-2, 1], ball: [3, 100], hF: [3, 97], eF: [7, 87], hB: [0, 96], eB: [-4, 87] }) },
    { t: 0.58, pose: P({ hip: [0, 53], kF: [2, 28], fF: [2, -1], kB: [-1, 28], fB: [-2, -1], ball: [6, 114], hF: [5, 110], eF: [4, 98], hB: [2, 99], eB: [-3, 90] }) },
    { t: 0.78, pose: P({ hip: [0, 53], kF: [3, 28], kB: [-1, 28], hF: [8, 107], eF: [5, 98], hB: [3, 96], eB: [-2, 88] }) },
    { t: 1, pose: P({ hip: [0, 48], kF: [4, 25], kB: [-2, 25], hF: [7, 82], eF: [7, 76], hB: [2, 80], eB: [-1, 74] }) }] },
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
    { t: 0.12, pose: P({ hip: [1, 45], head: [4, 86], neck: [3, 78], sF: [4, 75], sB: [0, 75], kF: [9, 30], fF: [12, 8], kB: [-5, 23], fB: [-9, 0], ball: [3, 52], hF: [4, 53], hB: [2, 52], eF: [6, 62], eB: [1, 62] }) },
    { t: 0.26, pose: P({ hip: [3, 43], head: [7, 84], neck: [6, 76], sF: [7, 73], sB: [3, 73], kF: [14, 24], fF: [19, 3], kB: [-6, 22], fB: [-11, 0], ball: [6, 55], hF: [6, 55], hB: [4, 54], eF: [8, 63], eB: [3, 63] }) },
    { t: 0.37, pose: P({ hip: [4, 45], head: [6, 86], neck: [5, 78], sF: [6, 75], sB: [2, 75], kF: [11, 22], fF: [14, 0], kB: [-3, 25], fB: [-6, 4], ball: [8, 66], hF: [8, 66], hB: [6, 65], eF: [8, 72], eB: [4, 72] }) },
    { t: 0.45, pose: P({ hip: [3, 49], head: [5, 89], neck: [4, 80], sF: [5, 77], sB: [1, 77], kF: [7, 24], fF: [8, 0], kB: [3, 34], fB: [-1, 16], ball: [9, 79], hF: [9, 78], hB: [6, 77], eF: [9, 74], eB: [4, 73] }) },
    { t: 0.56, pose: P({ hip: [1, 53], head: [3, 92], neck: [2, 83], sF: [3, 80], sB: [-1, 80], kF: [2, 26], fF: [1, 2], kB: [8, 46], fB: [5, 28], ball: [10, 92], hF: [10, 90], hB: [6, 88], eF: [9, 78], eB: [3, 76] }) },
    { t: 0.68, pose: P({ hip: [1, 54], head: [3, 93], neck: [2, 84], sF: [3, 81], sB: [-1, 81], kF: [1, 27], fF: [0, 4], kB: [8, 48], fB: [5, 30], ball: [12, 112], hF: [11, 108], eF: [9, 95], hB: [-3, 80], eB: [-2, 72] }) },
    { t: 0.83, pose: P({ hip: [0, 53], kF: [2, 27], fF: [1, 2], kB: [6, 40], fB: [4, 22], hF: [12, 106], eF: [9, 95], hB: [-4, 76], eB: [-2, 70] }) },
    { t: 0.92, pose: P({ hip: [0, 51], kF: [3, 26], fF: [2, 1], kB: [3, 31], fB: [0, 11], hF: [10, 93], eF: [8, 85], hB: [-2, 62], eB: [-2, 66] }) },
    { t: 1, pose: P({ hF: [7, 80], eF: [7, 72] }, athletic) }] },
  // Step-Through Jumper: same rip + long grounded stride as the finish, then plant both feet, square up and pull up.
  { name: 'shot_stepThroughJumper', frames: 16, release: 0.7, post: 0.55, keys: [
    { t: 0, pose: TRIPLE },
    { t: 0.12, pose: P({ hip: [1, 45], head: [4, 86], neck: [3, 78], sF: [4, 75], sB: [0, 75], kF: [9, 30], fF: [12, 8], kB: [-5, 23], fB: [-9, 0], ball: [3, 52], hF: [4, 53], hB: [2, 52], eF: [6, 62], eB: [1, 62] }) },
    { t: 0.26, pose: P({ hip: [3, 43], head: [7, 84], neck: [6, 76], sF: [7, 73], sB: [3, 73], kF: [14, 24], fF: [19, 3], kB: [-6, 22], fB: [-11, 0], ball: [6, 55], hF: [6, 55], hB: [4, 54], eF: [8, 63], eB: [3, 63] }) },
    { t: 0.385, pose: P({ hip: [2, 44], head: [3, 86], neck: [2, 77], sF: [3, 74], sB: [-1, 74], kF: [8, 22], fF: [10, 0], kB: [-2, 22], fB: [-3, 0], ball: [6, 60], hF: [6, 62], hB: [4, 60], eF: [6, 66], eB: [3, 66] }) },
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
  { name: 'screen', frames: 3, keys: [
    { t: 0, pose: P({ kF: [6, 26], fF: [8, 0], kB: [-6, 26], fB: [-8, 0], hip: [0, 49], eF: [6, 68], hF: [1, 70], eB: [-5, 68], hB: [2, 72] }) },
    { t: 1, pose: P({ kF: [7, 25], fF: [9, 0], kB: [-7, 25], fB: [-9, 0], hip: [0, 48], eF: [6, 67], hF: [0, 70], eB: [-5, 67], hB: [2, 71], head: [1, 90] }) }] },
  { name: 'charge', frames: 3, keys: [
    { t: 0, pose: lowStance },
    { t: 1, pose: P({ head: [-2, 88], neck: [-2, 79], kF: [5, 25], fF: [7, 0], kB: [-5, 25], fB: [-7, 0], hip: [0, 48], eF: [4, 68], hF: [0, 70], eB: [-4, 68], hB: [1, 72] }) }] },
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
  { name: 'catch', frames: 3, keys: [
    { t: 0, pose: P({ hF: [12, 66], eF: [8, 68], hB: [10, 65], eB: [5, 67], ball: [14, 66] }) },
    { t: 1, pose: chest }] },

  { name: 'boxout', frames: 6, loop: true, keys: [
    { t: 0, pose: P({ hip: [-2, 34], head: [-6, 72], neck: [-5, 63], sF: [-4, 60], sB: [-6, 60], eF: [9, 62], hF: [18, 66], eB: [-15, 62], hB: [-24, 66], kF: [9, 18], fF: [14, 0], kB: [-11, 18], fB: [-15, 0] }) },
    { t: 0.5, pose: P({ hip: [-4, 32], head: [-8, 70], neck: [-7, 61], sF: [-6, 58], sB: [-8, 58], eF: [8, 60], hF: [18, 63], eB: [-16, 60], hB: [-25, 63], kF: [10, 18], fF: [15, 1], kB: [-12, 17], fB: [-16, 0] }) },
    { t: 1, pose: P({ hip: [-2, 34], head: [-6, 72], neck: [-5, 63], sF: [-4, 60], sB: [-6, 60], eF: [9, 62], hF: [18, 66], eB: [-15, 62], hB: [-24, 66], kF: [9, 18], fF: [14, 0], kB: [-11, 18], fB: [-15, 0] }) }] },
  { name: 'boxoutPush', frames: 6, loop: true, keys: [
    { t: 0, pose: P({ hip: [-5, 33], head: [-5, 71], neck: [-5, 62], sF: [-5, 59], sB: [-7, 59], eF: [7, 60], hF: [16, 64], eB: [-17, 61], hB: [-26, 66], kF: [10, 18], fF: [16, 0], kB: [-10, 17], fB: [-13, 0] }) },
    { t: 0.5, pose: P({ hip: [-8, 32], head: [-3, 70], neck: [-4, 61], sF: [-5, 58], sB: [-7, 58], eF: [7, 58], hF: [17, 61], eB: [-18, 59], hB: [-27, 62], kF: [11, 19], fF: [17, 1], kB: [-9, 18], fB: [-12, 0] }) },
    { t: 1, pose: P({ hip: [-5, 33], head: [-5, 71], neck: [-5, 62], sF: [-5, 59], sB: [-7, 59], eF: [7, 60], hF: [16, 64], eB: [-17, 61], hB: [-26, 66], kF: [10, 18], fF: [16, 0], kB: [-10, 17], fB: [-13, 0] }) }] },
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
  { name: 'dribbleReady', frames: 8, loop: true, bounce: [0.25, 0.75], keys: [
    { t: 0, pose: P({ hip: [0, 42], kF: [9, 20], fF: [13, 0], kB: [-8, 20], fB: [-12, 0], head: [3, 82], neck: [2, 73], sF: [3, 70], sB: [-1, 70], hF: [11, 40], eF: [9, 56], hB: [3, 46], eB: [1, 58], ball: [11, 34] }) },
    { t: 0.25, pose: P({ hip: [0, 41], kF: [9, 20], fF: [13, 0], kB: [-8, 20], fB: [-12, 0], head: [3, 81], neck: [2, 72], sF: [3, 69], sB: [-1, 69], hF: [8, 22], eF: [8, 46], hB: [4, 22], eB: [2, 46], ball: [6, 4] }) },
    { t: 0.5, pose: P({ hip: [0, 42], kF: [9, 20], fF: [13, 0], kB: [-8, 20], fB: [-12, 0], head: [3, 82], neck: [2, 73], sF: [3, 70], sB: [-1, 70], hB: [9, 40], eB: [7, 56], hF: [4, 46], eF: [5, 58], ball: [9, 34] }) },
    { t: 0.75, pose: P({ hip: [0, 41], kF: [9, 20], fF: [13, 0], kB: [-8, 20], fB: [-12, 0], head: [3, 81], neck: [2, 72], sF: [3, 69], sB: [-1, 69], hF: [8, 22], eF: [8, 46], hB: [4, 22], eB: [2, 46], ball: [6, 4] }) },
    { t: 1, pose: P({ hip: [0, 42], kF: [9, 20], fF: [13, 0], kB: [-8, 20], fB: [-12, 0], head: [3, 82], neck: [2, 73], sF: [3, 70], sB: [-1, 70], hF: [11, 40], eF: [9, 56], hB: [3, 46], eB: [1, 58], ball: [11, 34] }) }] },
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

export const CLIP: Record<string, Clip> = Object.fromEntries(CLIPS.map((c) => [c.name, c]));

/** Map a sim shot type to its animation clip. */
export const SHOT_CLIP: Record<string, string> = {
  three: 'shot_jumper', deep3: 'shot_jumper', mid: 'shot_jumper', push: 'shot_push', floater: 'shot_floater',
  hook: 'shot_hook', layup: 'shot_layup', euro: 'shot_euro', stepThrough: 'shot_stepThrough', stepThroughJumper: 'shot_stepThroughJumper', dunk: 'shot_dunk',
};

const lerpJ = (a: J, b: J, t: number): J => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** Catmull-Rom through p1..p2 using neighbours p0/p3: smooth curves that still pass through every key. */
const cr = (p0: J, p1: J, p2: J, p3: J, t: number): J => {
  const t2 = t * t, t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
};

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
