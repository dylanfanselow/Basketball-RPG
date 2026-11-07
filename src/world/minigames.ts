/**
 * Garage workout mini-games (round 39). Pure logic (no Phaser), unit-tested; GarageScene draws them and feeds input.
 * Each game: `update(dt, input)`, `reps`, a 1 s red-✗ lock after a mistake (`missing`), `animU()` (where the player's
 * clip is), `controls` (shown when it starts).
 */
export interface MiniInput {
  stick: { x: number; y: number };
  /** button edges this frame (✕ ○ □ △, L2, R2) */
  a: boolean; b: boolean; x: boolean; y: boolean; l2: boolean; r2: boolean;
  /** ✕ held */
  aHeld: boolean;
}
export type FaceBtn = 'a' | 'b' | 'x' | 'y';
import type { CoreStat } from '../sim/data';

/**
 * Workout orbs (round 42): finishing a set amount of a workout ('orb' event) sends these XP orbs from you to the skill
 * cards on the HUD (each one costs energy). One full bar on the squat / bench / dribbling mat, every ORB_HITS hits on
 * the treadmill, every made shot at the hoop.
 */
export const ORBS: Record<string, CoreStat[]> = {
  treadmill: ['mobility', 'mobility'],
  squat: ['strength', 'mobility'],
  shoot: ['shooting', 'finishing'],
  bench: ['strength', 'finishing'],
  dribble: ['playmaking', 'shooting'],
};
export const NO_INPUT: MiniInput = { stick: { x: 0, y: 0 }, a: false, b: false, x: false, y: false, l2: false, r2: false, aHeld: false };

export abstract class MiniGame {
  abstract id: string;
  abstract controls: string[];
  reps = 0;
  t = 0;
  missUntil = -9;
  /** Things that happened this frame (for sounds): 'rep', 'miss', 'hit', 'press', 'hop', 'release', 'make', 'clank', … */
  events: string[] = [];
  constructor(public rand: () => number = Math.random) {}
  protected emit(e: string) { this.events.push(e); }
  /** Take this frame's events. */
  takeEvents(): string[] { const e = this.events; this.events = []; return e; }
  /** How high you are off the floor (ft): only the jump shot leaves the ground. */
  jumpFt(): number { return 0; }
  /** A game that picks its own clip (the dribbling mat) returns it here; others use the station's clip. */
  clip(): { clip: string; u: number } | null { return null; }
  get missing() { return this.t < this.missUntil; }
  protected miss() { this.missUntil = this.t + 1; this.emit('miss'); }
  update(dt: number, inp: MiniInput) { this.t += dt; this.step(dt, this.missing ? { ...NO_INPUT, stick: inp.stick, aHeld: inp.aHeld } : inp); }
  protected abstract step(dt: number, inp: MiniInput): void;
  /** Where the player's clip should be (0..1). */
  abstract animU(): number;
}

/** A bar you fill by pressing and that drains; full = a rep, then the body goes back down before the next one. */
abstract class RepBar extends MiniGame {
  fill = 0;
  descendUntil = -9;
  abstract drain: number;
  abstract descendTime: number;
  protected add(v: number) {
    this.fill = Math.min(1, this.fill + v);
    if (this.fill >= 1) { this.reps++; this.fill = 0; this.descendUntil = this.t + this.descendTime; this.emit('rep'); this.emit('orb'); }
  }
  get descending() { return this.t < this.descendUntil; }
  protected drainStep(dt: number) { if (!this.descending) this.fill = Math.max(0, this.fill - this.drain * dt); }
  /** Clips that go top (0) → bottom (0.42–0.55) → top (1): push up from the bottom as the bar fills. */
  animU() {
    if (this.descending) return 0.45 * (1 - (this.descendUntil - this.t) / this.descendTime);
    return 0.55 + 0.45 * this.fill;
  }
}

// ---------------------------------------------------------------- squat
/** Alternate L2 / R2 to drive up out of the squat; the bar drains. */
export class SquatGame extends RepBar {
  id = 'squat';
  controls = ['Alternate L2 / R2 to drive the bar up  (E / Shift)', "Don't stop: the bar sinks"];
  drain = 0.22; descendTime = 0.6;
  last: 'l2' | 'r2' | null = null;
  protected step(dt: number, inp: MiniInput) {
    if (!this.descending) for (const k of ['l2', 'r2'] as const) if (inp[k]) { if (this.last !== k) { this.emit('press'); this.add(0.11); } this.last = k; }
    this.drainStep(dt);
  }
}

// ---------------------------------------------------------------- treadmill
/** A dot slides back and forth along a line; ○ while it's in the centre square. Each hit speeds it up. */
export class TreadmillGame extends MiniGame {
  id = 'treadmill';
  controls = ['○ when the dot is inside the square  (L)', 'Every hit speeds it up'];
  static BASE = 2.2; static HALF = 0.17;
  /** hits per orb */
  static ORB_HITS = 5;
  phase = 0; speed = TreadmillGame.BASE; run = 0;
  private hitThisPass = false;
  get dot() { return Math.sin(this.phase); }
  protected step(dt: number, inp: MiniInput) {
    this.phase += this.speed * dt;
    this.run += dt * (this.speed / TreadmillGame.BASE) * 1.6;
    const inSquare = Math.abs(this.dot) < TreadmillGame.HALF;
    if (!inSquare) this.hitThisPass = false;
    if (inp.b) {
      if (inSquare && !this.hitThisPass) {
        this.hitThisPass = true; this.reps++; this.speed *= 1.1; this.emit('hit');
        if (this.reps % TreadmillGame.ORB_HITS === 0) this.emit('orb');
      }
      else if (!inSquare) { this.miss(); this.speed = Math.max(TreadmillGame.BASE, this.speed * 0.75); }
    }
  }
  animU() { return this.run; }
}

// ---------------------------------------------------------------- dribbling mat
/** The dribble move each button triggers (clip names), and how long each plays (s). */
export const DRIBBLE_MOVES: Record<FaceBtn, { clip: string; dur: number }> = {
  a: { clip: 'mat_cross', dur: 0.8 },   // ✕ crossover (and back)
  b: { clip: 'mat_legs', dur: 0.8 },    // ○ between the legs (and back)
  x: { clip: 'mat_back', dur: 0.85 },   // □ behind the back
  y: { clip: 'mat_inout', dur: 0.5 },   // △ in-and-out
};
/** The stationary pound dribble between moves, and how long one bounce takes (s). */
export const POUND = { clip: 'mat_pound', dur: 0.5 };
/**
 * Dribbling mat (round 40; same rules as the old push-ups): press the button shown to fill a falling bar, each right
 * button is a dribble move; a wrong one = ✗ for a second. Between moves you keep a steady pound dribble.
 */
export class DribbleGame extends RepBar {
  id = 'dribble';
  controls = ['Press the button shown  (✕ K  ○ L  □ J  △ I)', 'Each one is a move · wrong button = ✗'];
  drain = 0.12; descendTime = 0.01;
  want: FaceBtn = 'a';
  move: FaceBtn | null = null;
  moveAt = -9;
  constructor(rand?: () => number) { super(rand); this.want = this.pick(); }
  private pick(): FaceBtn { const all: FaceBtn[] = ['a', 'b', 'x', 'y'].filter((b) => b !== this.want) as FaceBtn[]; return all[Math.floor(this.rand() * all.length) % all.length]; }
  protected step(dt: number, inp: MiniInput) {
    const pressed = (['a', 'b', 'x', 'y'] as FaceBtn[]).filter((b) => inp[b]);
    if (pressed.length) {
      if (pressed.length === 1 && pressed[0] === this.want) { this.move = this.want; this.moveAt = this.t; this.emit('press'); this.add(0.26); this.want = this.pick(); }
      else this.miss();
    }
    this.drainStep(dt);
  }
  /** The move for its length after a right button, otherwise the pound dribble (restarted as each move ends, so the ball
   *  carries on from the right hand). */
  clip(): { clip: string; u: number } {
    let from = 0;
    if (this.move) {
      const m = DRIBBLE_MOVES[this.move], k = (this.t - this.moveAt) / m.dur;
      if (k < 1) return { clip: m.clip, u: k };
      from = this.moveAt + m.dur;
    }
    return { clip: POUND.clip, u: (this.t - from) / POUND.dur };
  }
  animU() { return this.clip().u; }
}

// ---------------------------------------------------------------- shooting
/** Hold ✕: a meter fills (and falls back past the top); release in the green = make. */
export class ShootGame extends MiniGame {
  id = 'shoot';
  controls = ['Hold ✕ to load the shot  (K)', 'Release in the green to make it'];
  static FILL = 0.9; static GREEN: [number, number] = [0.8, 0.95]; static FLIGHT = 2.1;
  /** a tiny red slice in the middle of the green: perfect release */
  static PERFECT: [number, number] = [0.866, 0.886];
  perfect = false;
  state: 'idle' | 'meter' | 'shot' = 'idle';
  meter = 0; rising = true; attempts = 0; made = false; shotAt = -9; releasedAt = 0;
  private armed = false; // the ✕ that started the game must be let go first
  protected step(dt: number, inp: MiniInput) {
    if (!inp.aHeld) this.armed = true;
    if (this.state === 'shot') { if (this.t - this.shotAt > ShootGame.FLIGHT) this.state = 'idle'; return; }
    if (this.state === 'idle' && this.armed && inp.aHeld) { this.state = 'meter'; this.meter = 0; this.rising = true; this.emit('load'); }
    if (this.state === 'meter') {
      if (inp.aHeld) {
        this.meter += (this.rising ? 1 : -1) * dt / ShootGame.FILL;
        if (this.meter >= 1) { this.meter = 1; this.rising = false; }
        if (this.meter < 0) this.meter = 0;
      } else {
        this.releasedAt = this.meter;
        this.made = this.meter >= ShootGame.GREEN[0] && this.meter <= ShootGame.GREEN[1];
        this.attempts++; if (this.made) this.reps++;
        this.state = 'shot'; this.shotAt = this.t; this.jumpAtRelease = this.jumpFt0(this.meter);
        this.perfect = this.meter >= ShootGame.PERFECT[0] && this.meter <= ShootGame.PERFECT[1];
        this.emit('release'); if (this.perfect) this.emit('perfect'); else if (this.made) this.emit('green');
        if (this.made) this.emit('orb');
      }
    }
  }
  jumpAtRelease = 0;
  static JUMP = 1.7; static LAND = 0.35;
  private jumpFt0(m: number) { return ShootGame.JUMP * Math.sin((Math.min(1, Math.max(0, m)) * Math.PI) / 2); }
  /** You rise with the meter (top of the jump = full meter, 2K-style) and come down after letting go. */
  jumpFt() {
    if (this.state === 'meter') return this.jumpFt0(this.meter);
    if (this.state === 'shot') { const k = (this.t - this.shotAt) / ShootGame.LAND; return k < 1 ? this.jumpAtRelease * (1 - k * k) : 0; }
    return 0;
  }
  /** jump-shot clip: windup follows the meter, the release + follow-through play after letting go */
  animU(rel = 0.58) {
    if (this.state === 'meter') return this.meter * rel * 0.92;
    if (this.state === 'shot') return Math.min(1, rel + (1 - rel) * ((this.t - this.shotAt) / 0.45));
    return 0;
  }
}

// ---------------------------------------------------------------- bench press
/** Hold ✕ to press while the bar wobbles: keep the level gauge centred with the L-stick. Tipping over drops it. */
export class BenchGame extends RepBar {
  id = 'bench';
  controls = ['Hold ✕ to press the bar  (K)', 'Keep it level with the L-stick  (A / D)'];
  drain = 0.3; descendTime = 0.8;
  tilt = 0;
  private dir = 1; private flipAt = 0; private creakAt = -9;
  static LEVEL = 0.5;
  protected step(dt: number, inp: MiniInput) {
    if (this.descending) { this.tilt *= 0.9; return; }
    if (this.t > this.flipAt) { this.dir = this.rand() < 0.5 ? -1 : 1; this.flipAt = this.t + 0.8 + this.rand() * 0.8; }
    if (inp.aHeld) {
      const drift = (0.35 + 0.8 * this.fill) * this.dir;
      // the bar wants to tip (the more it leans, the faster it goes) and drifts; push the stick the other way
      this.tilt += (drift + this.tilt * 1.0 + inp.stick.x * 2.6) * dt;
      if (Math.abs(this.tilt) >= 1) { this.miss(); this.emit('drop'); this.fill = 0; this.tilt = 0; return; }
      if (Math.abs(this.tilt) > 0.55 && this.t - this.creakAt > 0.45) { this.creakAt = this.t; this.emit('creak'); }
      if (Math.abs(this.tilt) < BenchGame.LEVEL) this.add(0.4 * dt);
    } else {
      this.tilt *= Math.pow(0.2, dt);
      this.drainStep(dt);
    }
  }
}

export function makeMiniGame(stationId: string, rand: () => number = Math.random): MiniGame | null {
  switch (stationId) {
    case 'squat': return new SquatGame(rand);
    case 'treadmill': return new TreadmillGame(rand);
    case 'dribble': return new DribbleGame(rand);
    case 'shoot': return new ShootGame(rand);
    case 'bench': return new BenchGame(rand);
    default: return null;
  }
}
