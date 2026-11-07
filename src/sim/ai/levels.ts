/**
 * Round 61: 1v1 CPU levels. Every number here is a decision (how fast he reads, how well he judges a contest, how
 * many options he strings together, how he guards); none of them touch a rating (owner rule, round 47).
 * Phaser-free, imports nothing from the sim so game.ts and the AI can both use it.
 */
export type CpuLevel = 'easy' | 'medium' | 'hard';
export const CPU_LEVEL_IDS: CpuLevel[] = ['easy', 'medium', 'hard'];
export const CPU_LEVEL_NAMES: Record<CpuLevel, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

export interface CpuLevelCfg {
  // ---- offense ----
  /** seconds between decisions (min, max) */
  think: [number, number];
  /** forecast error: how far off (ft) he judges where the defender will be at the release */
  noise: number;
  /** share of thinks he doesn't forecast at all and just looks at the contest right now */
  naive: number;
  /** a forecast contest under this = "he can't get a real contest up in time": shoot */
  openCut: number;
  /** options he strings together after the first one in a possession */
  followUps: number;
  /** longest dribble combo (moves chained) */
  combo: number;
  /** chance a counter read (he bit, he's shading, he's crowding...) is seen on a think */
  counter: number;
  /** chance he sprints when a drive or a blow-by calls for it */
  sprint: number;
  /** shot clock (s left) at which he settles for a contested look: drawn per possession */
  settle: [number, number];
  /** throws it up when the clock left is under the windup plus this */
  margin: number;
  /** 0..1: how much what worked against this defender earlier steers his choices */
  memory: number;
  /** random spread in option choice (0 = always the best scored option) */
  whim: number;
  /** chance he finishes a drive with a fake when his man is set in front (then steps through if he bites) */
  rimFake: number;
  // ---- defense ----
  /** he guards where his man was this long ago (s) */
  lag: number;
  /** and reads ahead along his man's velocity (s) */
  lead: number;
  /** scouts the cushion (tight on shooters, sags off non-shooters) */
  scout: boolean;
  /** gap wobble (ft) when he doesn't scout */
  wobble: number;
  /** steps into the cone this close (ft) during the shooter's windup (0 = no) */
  closeGap: number;
  /** contest jump delay after the shot starts (s), and the chance he doesn't jump at all */
  jump: [number, number];
  noJump: number;
  /** pump-fake bite chance multiplier, and how much a recent bite still lowers the next one */
  bite: number;
  biteAgain: number;
  /** how strongly he reads a human's repeated moves (0 = never), and whether he reads one from its 2nd use */
  readMoves: number;
  readEarly: boolean;
  /** plays a much stronger post player off (out of the post-up reach) instead of letting him back down */
  postAware: boolean;
  /** shading toward a human's favourite side (x the base 1 ft) */
  shade: number;
  /** reach-in rate: [while the handler is selling a move or posting, otherwise] */
  reach: [number, number];
}

export const CPU_LEVELS: Record<CpuLevel, CpuLevelCfg> = {
  easy: {
    think: [0.45, 0.65], noise: 2.0, naive: 0.3, openCut: 0.2, followUps: 1, combo: 1, counter: 0.35, sprint: 0.35,
    settle: [0, 11], margin: 0.15, memory: 0, whim: 0.8, rimFake: 0,
    lag: 0.22, lead: 0, scout: false, wobble: 0.8, closeGap: 0, jump: [0.2, 0.4], noJump: 0.25, bite: 1.4, biteAgain: 0.7,
    readMoves: 0, readEarly: false, postAware: false, shade: 0, reach: [0.6, 0.6],
  },
  medium: {
    think: [0.25, 0.38], noise: 1.0, naive: 0.1, openCut: 0.15, followUps: 2, combo: 2, counter: 0.7, sprint: 0.75,
    settle: [2.5, 8], margin: 0.3, memory: 0.5, whim: 0.35, rimFake: 0.25,
    lag: 0.08, lead: 0, scout: false, wobble: 0, closeGap: 0, jump: [0.1, 0.28], noJump: 0, bite: 1, biteAgain: 0.4,
    readMoves: 1, readEarly: false, postAware: false, shade: 1, reach: [1, 1],
  },
  hard: {
    think: [0.12, 0.2], noise: 0.3, naive: 0, openCut: 0.12, followUps: 4, combo: 3, counter: 0.95, sprint: 1,
    settle: [3, 7], margin: 0.35, memory: 1, whim: 0.15, rimFake: 0.6,
    lag: 0, lead: 0.15, scout: true, wobble: 0, closeGap: 1.8, jump: [0.08, 0.16], noJump: 0, bite: 0.65, biteAgain: 0.2,
    readMoves: 1.4, readEarly: true, postAware: true, shade: 1.5, reach: [1.5, 0.6],
  },
};
