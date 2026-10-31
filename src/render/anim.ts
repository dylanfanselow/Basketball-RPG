/**
 * Keyframe animation. Poses are skeletons in a canonical figure 100 units tall (top of head = 100,
 * floor = 0, +x = facing direction). Clips list keyframes at normalized times; at sprite-build time
 * each clip is sampled into N frames with eased joint interpolation, which gives smooth in-betweens.
 * Pure TS so it can be unit-tested.
 */
export type J = [number, number];
export const JOINTS = ['head', 'neck', 'sF', 'sB', 'eF', 'eB', 'hF', 'hB', 'hip', 'kF', 'kB', 'fF', 'fB'] as const;
export type JointName = (typeof JOINTS)[number];
export type Pose = Record<JointName, J> & { ball?: J | null };
type PosePatch = Partial<Record<JointName, J>> & { ball?: J | null };

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
  { name: 'move_crossover', frames: 6, bounce: [0.45], keys: [
    { t: 0, pose: P({ hF: [10, 44], eF: [8, 60], ball: [11, 38] }, athletic) },
    { t: 0.45, pose: P({ head: [5, 83], neck: [4, 75], sF: [5, 72], sB: [1, 72], hip: [0, 43], kF: [9, 21], fF: [13, 0], kB: [-6, 21], fB: [-9, 0], hF: [7, 22], eF: [8, 48], hB: [5, 22], eB: [3, 48], ball: [6, 4] }) },
    { t: 1, pose: P({ hB: [9, 44], eB: [6, 60], hF: [3, 58], eF: [5, 66], ball: [10, 38], head: [3, 87], neck: [2, 78] }, athletic) }] },
  { name: 'move_inOut', frames: 5, bounce: [0.5], keys: [
    { t: 0, pose: dribHigh }, { t: 0.5, pose: P({ head: [4, 86], hF: [6, 30], eF: [7, 52], ball: [6, 4] }, athletic) }, { t: 1, pose: dribHigh }] },
  { name: 'move_behindBack', frames: 6, bounce: [0.5], keys: [
    { t: 0, pose: P({ hF: [9, 40], ball: [10, 34] }, athletic) },
    { t: 0.5, pose: P({ head: [4, 85], hip: [0, 45], hF: [-9, 32], eF: [-5, 56], ball: [-10, 6], kF: [10, 23], fF: [14, 0] }, athletic) },
    { t: 1, pose: P({ hB: [9, 42], eB: [6, 60], ball: [10, 36], hF: [4, 58] }, athletic) }] },
  { name: 'move_snatchBack', frames: 6, keys: [
    { t: 0, pose: P({ ball: [10, 30], hF: [9, 36] }, athletic) },
    { t: 0.4, pose: P({ fF: [6, 9], fB: [-3, 12], kF: [8, 32], kB: [-1, 34], hip: [-2, 54], hF: [3, 60], hB: [1, 58], ball: [4, 60], head: [-1, 92] }) },
    { t: 1, pose: P({ ball: [6, 60], hF: [6, 60], hB: [4, 58] }, athletic) }] },
  { name: 'move_spin', frames: 8, keys: [
    { t: 0, pose: P({ ball: [11, 40], hF: [10, 45] }, athletic) },
    { t: 0.35, pose: P({ head: [-1, 87], neck: [-1, 78], sF: [-3, 76], sB: [3, 76], hF: [-6, 50], eF: [-5, 63], hB: [8, 56], eB: [6, 66], ball: [-8, 46], kF: [-2, 26], fF: [-1, 0], kB: [6, 25], fB: [10, 2] }, athletic) },
    { t: 0.7, pose: P({ head: [0, 88], sF: [1, 77], sB: [-1, 77], hF: [-2, 46], ball: [-2, 40], kF: [6, 26], fF: [10, 2] }, athletic) },
    { t: 1, pose: P({ ball: [11, 40], hF: [10, 45], head: [4, 87] }, athletic) }] },
  { name: 'move_stepback', frames: 6, keys: [
    { t: 0, pose: P({ head: [5, 86], neck: [4, 78], ball: [11, 36], hF: [10, 42] }, athletic) },
    { t: 0.45, pose: P({ fF: [7, 10], fB: [-1, 12], kF: [8, 34], kB: [0, 36], hip: [-1, 55], ball: [5, 58], hF: [6, 58], hB: [4, 57], head: [-1, 93], neck: [-1, 84] }) },
    { t: 1, pose: P({ ball: [6, 60], hF: [6, 60], hB: [4, 58] }, athletic) }] },
  { name: 'move_hesi', frames: 5, bounce: [0.5], keys: [
    { t: 0, pose: dribHigh }, { t: 0.5, pose: P({ head: [0, 92], neck: [0, 83], sF: [1, 80], sB: [-3, 80], hip: [0, 52], hF: [9, 40], ball: [11, 4] }) }, { t: 1, pose: dribHigh }] },
  { name: 'move_hesiBurst', frames: 5, keys: [
    { t: 0, pose: dribHigh }, { t: 0.5, pose: P({ head: [10, 82], neck: [8, 74], sF: [9, 71], sB: [5, 71], hip: [0, 46], kF: [10, 26], fF: [14, 1], kB: [-6, 22], fB: [-12, 4], hF: [13, 34], ball: [15, 8] }) }, { t: 1, pose: runDrib(jogA, [11, 47], [12, 42]) }] },
  { name: 'move_jab', frames: 4, keys: [{ t: 0, pose: chest }, { t: 0.45, pose: P({ ball: [4, 94], hF: [4, 92], hB: [2, 91], eF: [6, 80], eB: [-2, 80], head: [1, 91] }) }, { t: 1, pose: chest }] },
  { name: 'move_retreat', frames: 5, bounce: [0.5], keys: [{ t: 0, pose: runDrib(jogB, [11, 45], [12, 40]) }, { t: 0.5, pose: runDrib(jogA, [11, 41], [12, 3]) }, { t: 1, pose: runDrib(jogB, [11, 45], [12, 40]) }] },
  { name: 'move_lateral', frames: 5, bounce: [0.5], keys: [{ t: 0, pose: dribHigh }, { t: 0.5, pose: P({ kF: [9, 22], fF: [12, 0], kB: [-8, 22], fB: [-11, 0], hip: [0, 44], hF: [11, 40], ball: [12, 4] }, athletic) }, { t: 1, pose: dribHigh }] },

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
  { name: 'shot_stepThrough', frames: 9, release: 0.62, post: 0.45, keys: [
    { t: 0, pose: P({ ball: [4, 90], hF: [4, 88], hB: [2, 87], eF: [6, 78], eB: [-2, 78] }) },
    { t: 0.35, pose: P({ kF: [10, 25], fF: [16, 1], kB: [-5, 25], fB: [-11, 3], hip: [1, 46], head: [5, 86], neck: [4, 77], ball: [8, 66], hF: [8, 66], hB: [6, 64] }) },
    { t: 0.62, pose: P({ kF: [8, 44], fF: [5, 26], hip: [0, 52], ball: [11, 110], hF: [10, 106], eF: [8, 94], hB: [-4, 76] }) },
    { t: 1, pose: P({ hF: [7, 80], eF: [7, 72] }, athletic) }] },
  { name: 'shot_dunk', frames: 11, release: 0.7, post: 0.6, keys: [
    { t: 0, pose: P({ kF: [8, 26], fF: [13, 1], kB: [-4, 28], fB: [-10, 6], ball: [7, 60], hF: [7, 60], hB: [5, 59] }) },
    { t: 0.25, pose: P({ hip: [0, 40], kF: [8, 20], fF: [7, 0], kB: [-2, 20], fB: [-5, 0], head: [5, 80], neck: [4, 72], sF: [5, 69], sB: [1, 69], ball: [6, 56], hF: [6, 56], hB: [4, 55], eF: [7, 62], eB: [3, 62] }) },
    { t: 0.45, pose: P({ hip: [0, 54], kF: [7, 42], fF: [4, 24], kB: [-3, 31], fB: [-8, 10], ball: [7, 100], hF: [7, 97], hB: [5, 96], eF: [8, 86], eB: [3, 86] }) },
    { t: 0.6, pose: P({ hip: [0, 54], kF: [6, 40], fF: [3, 22], kB: [-3, 30], fB: [-8, 9], ball: [-6, 113], hF: [-5, 109], eF: [3, 101], hB: [-3, 107], eB: [-1, 100] }) },
    { t: 0.7, pose: P({ hip: [0, 54], kF: [6, 38], fF: [3, 20], ball: [14, 102], hF: [12, 105], eF: [8, 97], hB: [-6, 84], eB: [-4, 76] }) },
    { t: 0.85, pose: P({ hip: [0, 52], kF: [3, 25], fF: [3, 3], kB: [-2, 25], fB: [-3, 3], hF: [11, 114], eF: [8, 102], hB: [9, 113], eB: [5, 101], head: [2, 90] }) },
    { t: 1, pose: P({ hF: [7, 80], eF: [7, 72] }, athletic) }] },

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
];

export const CLIP: Record<string, Clip> = Object.fromEntries(CLIPS.map((c) => [c.name, c]));

/** Map a sim shot type to its animation clip. */
export const SHOT_CLIP: Record<string, string> = {
  three: 'shot_jumper', deep3: 'shot_jumper', mid: 'shot_jumper', push: 'shot_push', floater: 'shot_floater',
  hook: 'shot_hook', layup: 'shot_layup', euro: 'shot_euro', stepThrough: 'shot_stepThrough', dunk: 'shot_dunk',
};

const ease = (x: number) => x * x * (3 - 2 * x);
const lerpJ = (a: J, b: J, t: number): J => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Pose of a clip at normalized time u (0..1). Joints ease between keyframes. */
export function sampleClip(c: Clip, u: number): Pose {
  const k = c.keys;
  u = Math.max(0, Math.min(1, u));
  let i = 0;
  while (i < k.length - 2 && u > k[i + 1].t) i++;
  const a = k[i], b = k[i + 1] ?? a;
  const span = b.t - a.t;
  const t = span > 0 ? ease((u - a.t) / span) : 0;
  const out = {} as Pose;
  for (const j of JOINTS) out[j] = lerpJ(a.pose[j], b.pose[j], t);
  const ba = a.pose.ball, bb = b.pose.ball;
  out.ball = ba && bb ? lerpJ(ba, bb, (u - a.t) / (span || 1)) : t < 0.5 ? ba ?? null : bb ?? null;
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
