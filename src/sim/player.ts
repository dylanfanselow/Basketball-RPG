import { CoreStats, MOVES } from './data';
import { computeSubRatings, SubRatings, rmap, Position, HEIGHTS } from './attributes';
import { ModSet, ModSource } from './modifiers';
import { Vec, v } from './math';
import { Appearance, defaultAppearance } from '../render/appearance';

export type PState = 'idle' | 'shoot' | 'screen' | 'charge' | 'stagger' | 'fallen' | 'jump' | 'dribbleMove' | 'swipe';

export interface BoxScore { pts: number; fgm: number; fga: number; tpm: number; tpa: number; ast: number; reb: number; stl: number; blk: number; tov: number; secs: number; usage: number; touches: number }
export const emptyBox = (): BoxScore => ({ pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ast: 0, reb: 0, stl: 0, blk: 0, tov: 0, secs: 0, usage: 0, touches: 0 });

export interface PlayerInit {
  id: string; name: string; team: 0 | 1; pos: Position; core: CoreStats; nodes?: string[]; extra?: ModSource[]; isUser?: boolean; number?: number; skin?: number; height?: number; appearance?: Appearance;
}

export class Player {
  id: string; name: string; team: 0 | 1; pos: Position; role: string; number: number; skin: number;
  height: number; isUser: boolean; appearance: Appearance;
  core: CoreStats; nodes: Set<string>; extra: ModSource[];
  mods: ModSet; sub!: SubRatings;

  p: Vec = v(); vel: Vec = v(); z = 0; vz = 0; face: Vec = v(1, 0);
  stamina = 1;
  state: PState = 'idle'; stateT = 0; stateDur = 0;
  /** current dribble move */
  move: { id: string; dir: Vec; t: number } | null = null;
  lastMove: { id: string; endAt: number; dir: Vec } | null = null;
  receivedAt = -99; dribbledSinceCatch = false; lastScreenAt = -99; screenCdUntil = 0;
  pumpFakeAt = -99; openShotUntil = -99; openShotMult = 1;
  staggerUntil = 0; screenedUntil = 0; chargeSetAt = -99; swipeCdUntil = 0; blockCdUntil = 0;
  ultCharge = 0;
  box: BoxScore = emptyBox();
  /** AI scratch */
  target: Vec = v(); guarding: string | null = null; aiNextThink = 0; callForBallUntil = 0;
  aiMode: 'none' | 'drive' = 'none'; aiModeUntil = 0; cutUntil = 0;
  /** runtime sim fields */
  want: Vec = v(); moveVel: Vec = v(); jumpAt = 0; swipingUntil = 0; screenHit = false; boxedOut = 0; sprinting = false;
  /** current animation clip for the renderer (shots, moves, falls) */
  anim: { name: string; start: number; release?: number; dur?: number } | null = null;
  movePlantAt = 0.3; movePlanted = false;
  allowOobUntil = 0;
  lastBitAt = 0; boxOutHeld = false; bumpedUntil = -9; crashing = false; boxingOut = false; lastBumpAt = -9;
  burstUntil = 0; burstCdUntil = 0; burstStartAt = -9;
  /** pump fake picked up the dribble: can only pass or shoot */
  deadDribble = false; deadDribbleAt = 0; deadWarned = false;
  /** side-drive direction (screen up/down) the flick-cross watches for, and until when */
  flickDir = 0; flickUntil = 0;
  bufferedMove: { stick: Vec; at: number } | null = null;
  pendingShot: { type: string; override?: { base?: number; label?: string; contestMult?: number } } | null = null;

  constructor(init: PlayerInit) {
    this.id = init.id; this.name = init.name; this.team = init.team; this.pos = init.pos;
    this.role = String(['PG', 'SG', 'SF', 'PF', 'C'].indexOf(init.pos) + 1);
    this.number = init.number ?? 0; this.skin = init.skin ?? 0;
    this.height = init.height ?? HEIGHTS[init.pos];
    this.isUser = !!init.isUser;
    this.appearance = init.appearance ?? { ...defaultAppearance(), skin: this.skin };
    this.core = { ...init.core };
    this.nodes = new Set(init.nodes ?? []);
    this.extra = init.extra ?? [];
    this.mods = ModSet.fromNodes(this.nodes, this.extra);
    this.recompute();
  }

  /** Call after core stats or nodes change. */
  recompute() {
    this.mods.setNodes(this.nodes, this.extra);
    this.sub = computeSubRatings(this.core, this.mods.subAdds);
  }

  hasMove(id: string) { return !!MOVES[id]?.default || this.mods.moves.has(id); }
  hasShot(id: string) { return this.mods.shotTypes.has(id); }

  get walkSpeed() { return rmap(this.sub.speed, 10.5, 14.5); }
  get sprintSpeed() { return rmap(this.sub.speed, 15.5, 21); }
  /** default top speed (no burst) */
  get runSpeed() { return this.sprintSpeed * 0.88; }
  /** sprint-burst top speed */
  get burstSpeed() { return this.sprintSpeed * 1.12; }
  /** seconds a sprint burst lasts (stamina rating) */
  get burstDur() { return rmap(this.sub.stamina, 1.2, 2.2) * (0.75 + 0.25 * this.stamina); }
  /** cooldown after a burst (speed rating, perks, fatigue) */
  get burstCd() { return rmap(this.sub.speed, 6.0, 3.5) * this.mods.pMult('burstCd') * (1.3 - 0.3 * this.stamina); }
  get ballSpeedMult() { return rmap(this.sub.ballSpeed, 0.82, 0.97); }
  get jumpVel() { return rmap(this.sub.jump, 11, 16.5); }
  get passSpeed() { return rmap(this.sub.passSpeed, 34, 62); }
  get safePassDist() { return rmap(this.sub.passRange, 22, 52); }
  get reach() { return this.height + 2.1; }
  get busy() { return this.state === 'shoot' || this.state === 'fallen' || this.state === 'stagger'; }
}
