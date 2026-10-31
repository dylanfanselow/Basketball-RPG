import { PLAYS, PlayDef, PlayPhase, PlayRole } from '../data';
import { Rng } from '../math';

/** Tracks the play the coach called for the current possession. */
export class PlayRunner {
  playId: string | null = null;
  phase = 0;
  t = 0;
  done = false;
  ballCalledAt = -1;
  /** sim time a reset ends (>0), -1 = none, -2 = no more calls this possession */
  resetUntil = -1;
  lastPlayId: string | null = null;
  swungAt = -1;
  /** play-role swap so the set is run for a specific player: [roleA, roleB] */
  roleSwap: [string, string] | null = null;
  /** id of the player this set is run for */
  focusPid: string | null = null;

  get play(): PlayDef | null { return this.playId ? PLAYS[this.playId] : null; }
  get cur(): PlayPhase | null { return !this.done && this.play ? this.play.phases[this.phase] ?? null : null; }

  call(id: string, swap: [string, string] | null = null, focusPid: string | null = null) { this.roleSwap = swap && swap[0] !== swap[1] ? swap : null; this.focusPid = focusPid; this.playId = id; this.lastPlayId = id; this.phase = 0; this.t = 0; this.done = false; this.ballCalledAt = -1; this.resetUntil = -1; }
  reset() { this.roleSwap = null; this.focusPid = null; this.playId = null; this.phase = 0; this.t = 0; this.done = false; this.resetUntil = -1; this.swungAt = -1; }
  resetting(now: number) { return this.resetUntil > now; }

  static pick(rng: Rng, allowed?: string[], exclude?: string | null): string {
    const ids = (allowed && allowed.length ? allowed : Object.keys(PLAYS)).filter((id) => PLAYS[id]);
    const fresh = ids.filter((id) => id !== exclude);
    return rng.pick(fresh.length ? fresh : ids);
  }

  /** Returns true when the phase just advanced (so the caller can grade the previous phase). */
  tick(dt: number): { advanced: boolean; prev: PlayPhase | null } {
    if (!this.play || this.done) return { advanced: false, prev: null };
    this.t += dt;
    const ph = this.play.phases[this.phase];
    if (this.t >= ph.dur) {
      this.phase++; this.t = 0;
      if (this.phase >= this.play.phases.length) this.done = true;
      return { advanced: true, prev: ph };
    }
    return { advanced: false, prev: null };
  }

  /** The latest assignment for a role up to the current phase (roles keep their last instruction). */
  roleAssignment(role: string): PlayRole | null {
    if (!this.play) return null;
    const upto = this.done ? this.play.phases.length - 1 : this.phase;
    for (let i = upto; i >= 0; i--) {
      const r = this.play.phases[i].roles[role];
      if (r) return r;
    }
    return null;
  }
  /** Assignment that is specific to the current phase (used for grading). */
  phaseAssignment(role: string): PlayRole | null { return this.cur?.roles[role] ?? null; }
}
