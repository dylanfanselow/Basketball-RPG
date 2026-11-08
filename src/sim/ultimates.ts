import { ULTIMATES, UltLevel } from './data';
import type { GameSim } from './game';
import { Player } from './player';
import { dist, norm, sub, scale, v, add } from './math';
import { isStepThrough } from './shooting';
import { AFTER_ULT } from './rhythm';

/** Career-side ultimate state. Locked until the story flag sets unlocked=true (dev tools can force it). */
export interface UltState { unlocked: boolean; id: string | null; level: number }
export interface UltActive {
  id: string; pid: string; until: number; level: UltLevel; targetId?: string;
  shotOverride?: { base?: number; label?: string; contestMult?: number };
  /** round 55: when it started; the second step-back's time; the stall fake was used; the takeoff spot (poster lane) */
  at: number; nextAt?: number; stalled?: boolean; from?: { x: number; y: number };
  /** round 55: slow-mo + darken + quiet (your ult, or one used against your team) */
  cinematic: boolean;
  /** round 71: the Free-Throw-Line Dunk's flight is over (his speed came off at the rim) */
  flown?: boolean;
}
export interface UltRuntime { state: UltState; active: UltActive | null }

/** Round 55: aura colour by position (PG blue, SG purple, SF yellow, PF green, C red). */
export const AURA_COLOR: Record<string, number> = { PG: 0x3fa0ff, SG: 0xa64dff, SF: 0xffd02a, PF: 0x3fe060, C: 0xff3a2a };
/** Round 55: how long (sim seconds) an ult's cinematic slow-mo lasts at most. */
export const CINE_MAX = { deepStepback: 1.7, ftTakeoff: 1.7, chaseDown: 2.2 } as Record<string, number>;
/** Sim speed during the cinematic. */
export const CINE_SPEED = 0.38;

/**
 * Round 55: a CPU star's ultimate by position (the owner's map): PG step-back; SG step-back if a shooter, else the
 * free-throw-line dunk; SF the dunk; PF chase-down if a shot-blocker, else the dunk; C chase-down. Level 2 for the very best.
 */
export function cpuUltFor(p: Player): UltState {
  const s = p.sub, shooter = Math.max(s.three, s.mid) >= Math.max(s.dunk, s.layup);
  const id = p.pos === 'C' ? 'chaseDown' : p.pos === 'PF' ? (s.block >= s.dunk ? 'chaseDown' : 'ftTakeoff')
    : p.pos === 'SF' ? 'ftTakeoff' : p.pos === 'SG' ? (shooter ? 'deepStepback' : 'ftTakeoff') : 'deepStepback';
  return { unlocked: true, id, level: p.overall >= 82 ? 1 : 0 };
}

/** Round 69: ultimates used on offense (CPU stars save these for the last period); Chase-Down is defense. */
export const OFFENSIVE_ULTS = ['deepStepback', 'ftTakeoff'];

/** Career milestone -> evolution points. */
export const ULT_MILESTONES: Record<string, { name: string; points: number }> = {
  fiftyBall: { name: '50-point game', points: 2 },
  tripleDouble: { name: 'Triple-double', points: 1 },
  gameWinner: { name: 'Game-winner', points: 2 },
};

/**
 * Use the ultimate (round 51: it runs on rhythm, a full meter, once a game; using it drops the meter to the 3rd notch).
 * Returns true when it fired. CPU stars call this from the AI when the moment fits.
 */
export function tryActivateUlt(sim: GameSim, p: Player): boolean {
  const st = sim.ultOf(p);
  const human = sim.isHuman(p);
  const say = (text: string) => { if (human) sim.emit({ kind: 'ult', text, pid: p.id }); };
  if (!st || !st.id) { say('Ultimate: ??? (locked)'); return false; }
  if ((sim.ultsUsed[p.id] ?? 0) >= 1) { say('Ultimate used this game'); return false; }
  if (p.rhythm < 100 && !sim.isAI(p)) { say(`Rhythm ${p.rhythm.toFixed(0)}%: fill it to ult`); return false; } // round 69: CPU stars don't need rhythm
  if (sim.ult.active) { say('Not now: another ultimate is in play'); return false; }
  const def = ULTIMATES[st.id];
  const level = def.levels[Math.min(st.level, def.levels.length - 1)];
  const rim = sim.rim(p.team);
  const d = dist(p.p, rim);
  const hasBall = sim.holder() === p;
  const u = sim.user;
  const cinematic = human || (!!u && sim.userOnCourt && p.team !== u.team);
  const base = { id: st.id, pid: p.id, level, at: sim.time, cinematic };
  let ok = false;

  if (st.id === 'deepStepback' && hasBall && d >= 17 && d <= 29 && p.state !== 'shoot' && p.state !== 'fallen') {
    // two explosive step-backs (the second one fires from tickUlt), then a window for the deep three
    stepBack(sim, p, level.stepFt);
    const until = sim.time + level.window;
    const label = `ULT ${level.name}`;
    p.mods.removeHooks('ult');
    p.mods.addHook('shot', 'ult', (c) => (c.type === 'three' || c.type === 'deep3' ? { label, mult: level.shotBonus } : isStepThrough(c.type) && level.finishMult ? { label, mult: level.finishMult } : null), until);
    p.mods.addHook('contestIn', 'ult', (c) => (c.type === 'three' || c.type === 'deep3' ? { label, mult: level.contestMult } : isStepThrough(c.type) && level.finishContest ? { label, mult: level.finishContest } : null), until);
    sim.ult.active = { ...base, until, nextAt: sim.time + 0.34 };
    ok = true;
  } else if (st.id === 'ftTakeoff' && hasBall && d >= 9 && d <= level.range && !p.busy) {
    const override = { base: level.makePct * 0.92, contestMult: level.contestMult, label: `ULT ${level.name}` };
    const from = { ...p.p };
    sim.startShot(p, 'dunk', override);
    p.stateDur = FT_FLIGHT;
    p.vel = scale(norm(sub(rim, p.p)), (d - 1.2) / FT_FLIGHT);
    // round 71 (owner: he was way below the ball): a floating rise (hang gravity, x0.25 of 32) that puts him at rim
    // height, ball in his hands, right at the release; a normal jump peaked at 0.4 s and he was falling by the rim
    p.hangUntil = sim.time + FT_FLIGHT;
    p.vz = (FT_DUNK_Z + 4 * FT_FLIGHT * FT_FLIGHT) / FT_FLIGHT;
    sim.ult.active = { ...base, until: sim.time + 1.6, shotOverride: override, from };
    ok = true;
  } else if (st.id === 'chaseDown' && p.team !== sim.possession) {
    const tgt = sim.holder() ?? (sim.ball.st.kind === 'shot' ? sim.ball.st.shooter : null);
    if (tgt) { sim.ult.active = { ...base, until: sim.time + level.duration, targetId: tgt.id }; ok = true; }
  }

  if (ok) {
    p.rhythm = Math.min(p.rhythm, AFTER_ULT); // keep the three notches; only the last stretch rebuilds (and there's no second ult tonight); a CPU star's never goes up
    if (sim.ultIso === p.id) sim.ultIso = null;
    sim.ultsUsed[p.id] = (sim.ultsUsed[p.id] ?? 0) + 1;
    sim.emit({ kind: 'ult', text: human ? `ULTIMATE: ${level.name}!` : `${p.name}: ULTIMATE ${level.name}!`, pid: p.id, team: p.team, big: true, good: human,
      data: { id: st.id, level: st.level, pos: p.pos, name: level.name, cinematic } });
  } else say(`${def.name}: not available from here`);
  return ok;
}

/** Free-Throw-Line Dunk: the flight from take-off to the release (s), and how high his feet are then (ft): the held
 *  ball sits ~7 ft above his feet, so 3 ft = the ball at the rim. */
export const FT_FLIGHT = 0.75, FT_DUNK_Z = 3.0;

/** One ult step-back: an explosive hop straight back from the rim. */
function stepBack(sim: GameSim, p: Player, ft: number) {
  const away = norm(sub(p.p, sim.rim(p.team)));
  p.state = 'dribbleMove'; p.stateT = 0; p.stateDur = 0.32;
  p.anim = { name: 'move_stepback', start: sim.time, dur: 0.32 };
  p.move = { id: 'stepback', dir: away, t: 0 };
  p.moveVel = scale(away, ft / 0.32);
  p.dribbledSinceCatch = true;
}

/**
 * Round 55: the ult's follow-ups while it's active (the owner: the fake is the ult button again, △ passes out).
 *  - fake: Double Step-Back Lv2+ = a fake everyone near bites on (then stick-to-rim + ✕ = the Step-Through);
 *          Free-Throw-Line Dunk Lv2+ in the air = a stall (hang time, the contest is wiped).
 *  - pass: Lv3 = pass out of it, even mid-air (the dunk / step-through is called off); the receiver is wide open.
 * Returns true when it did something.
 */
export function ultAction(sim: GameSim, p: Player, kind: 'fake' | 'pass', target?: Player | null): boolean {
  const a = sim.ult.active;
  if (!a || a.pid !== p.id || sim.time > a.until) return false;
  const lv = a.level;
  if (kind === 'fake') {
    if (a.id === 'deepStepback' && lv.fake && sim.holder() === p && p.state !== 'shoot' && p.state !== 'fallen') {
      if (p.state === 'dribbleMove') { p.state = 'idle'; p.move = null; p.moveVel = v(); } // cut the step short to sell it
      sim.pumpFake(p);
      for (const d of sim.opp(p.team)) {
        if (dist(d.p, p.p) > 8 || d.z > 0 || d.state === 'fallen') continue;
        if (sim.isAI(d)) { d.lastBitAt = sim.time; sim.jump(d, 0.9); }
      }
      sim.emit({ kind: 'move', text: 'ULT FAKE, they all bit! (stick to the rim + ✕)', pid: p.id, big: true });
      return true;
    }
    if (a.id === 'ftTakeoff' && lv.stall && !a.stalled && p.state === 'shoot' && p.pendingShot) {
      a.stalled = true;
      p.stateDur += STALL_S;
      const release = sim.time + (p.stateDur - p.stateT);
      p.anim = { name: 'shot_dunk_clutch', start: sim.time, release };
      p.hangUntil = release;
      p.vz = Math.max(p.vz, 2.5);
      p.vel = scale(p.vel, 0.55);
      if (p.pendingShot.override) p.pendingShot.override = { ...p.pendingShot.override, contestMult: 0.05 };
      a.until = Math.max(a.until, release + 0.8);
      sim.emit({ kind: 'move', text: 'HANG TIME!', pid: p.id, big: true });
      return true;
    }
    return false;
  }
  // pass out of it
  if (!lv.passOut || sim.holder() !== p) return false;
  const to = target ?? sim.pickPassTarget(p, p.face);
  if (!to) return false;
  if (p.state === 'shoot') { p.pendingShot = null; p.state = 'idle'; p.stateT = 0; p.hangUntil = 0; }
  if (p.state === 'dribbleMove') { p.state = 'idle'; p.move = null; p.moveVel = v(); }
  sim.pass(p, to, true);
  to.mods.removeHooks('ultKick');
  to.mods.addHook('contestIn', 'ultKick', () => ({ label: 'ULT kick-out', mult: 0.4 }), sim.time + 3);
  for (const d of sim.opp(p.team)) if (sim.isAI(d) && dist(d.p, p.p) < 9) d.staggerUntil = Math.max(d.staggerUntil, sim.time + 0.5); // they all collapsed on him
  sim.emit({ kind: 'move', text: `KICK-OUT to ${to.name}!`, pid: p.id, big: true });
  a.until = Math.min(a.until, sim.time + 0.6);
  return true;
}
/** Hang-time stall length (s). */
export const STALL_S = 0.45;

export function tickUlt(sim: GameSim, _dt: number) {
  const a = sim.ult.active;
  if (!a) return;
  if (sim.time > a.until) { sim.ult.active = null; return; }
  const p = sim.players.find((q) => q.id === a.pid);
  if (!p) { sim.ult.active = null; return; }
  if (a.id === 'deepStepback' && a.nextAt && sim.time >= a.nextAt) {
    a.nextAt = undefined;
    // the second step-back (only if he still has it and didn't fake / shoot out of the first)
    if (sim.holder() === p && p.state !== 'shoot' && p.state !== 'fallen' && sim.time - p.pumpFakeAt > 0.4) {
      stepBack(sim, p, a.level.stepFt);
      sim.emit({ kind: 'move', text: 'Double step-back!', pid: p.id });
    }
  }
  if (a.id === 'ftTakeoff' && p.state === 'shoot' && p.pendingShot && sim.holder() === p) {
    // round 71: carry all the way to the rim (in the air his speed bled off and he let go ~4.5 ft short)
    const rim = sim.rim(p.team), left = p.stateDur - p.stateT;
    if (left > 0.02) p.vel = scale(norm(sub(rim, p.p)), Math.max(0, dist(p.p, rim) - 1.2) / left);
  } else if (a.id === 'ftTakeoff' && !a.flown && p.state !== 'shoot' && sim.time - a.at > 0.1) {
    a.flown = true; // let go at the rim: stop there and come down (don't sail on under it)
    p.vel = scale(p.vel, 0.12);
  }
  if (a.id === 'ftTakeoff' && !sim.isHuman(p) && a.level.stall && !a.stalled && p.state === 'shoot') {
    // CPU Hang Time: stall when a defender has gone up with him
    if (sim.opp(p.team).some((d) => d.z > 1 && dist(d.p, p.p) < 5)) ultAction(sim, p, 'fake');
  }
  if (a.id === 'chaseDown') {
    const tgt = sim.players.find((q) => q.id === a.targetId);
    if (!tgt) { sim.ult.active = null; return; }
    // lock-on: sprint at the target (or the ball once it's in the air) with a big speed boost and go up when in range
    const ballUp = sim.ball.st.kind === 'shot';
    const aim = ballUp ? sim.ball.p : add(tgt.p, scale(tgt.vel, 0.25));
    p.want = scale(norm(sub(aim, p.p)), p.sprintSpeed * a.level.speedMult);
    if (dist(p.p, tgt.p) < 4.6 && (tgt.state === 'shoot' || tgt.z > 0.3) && p.z === 0) { p.blockCdUntil = 0; sim.jump(p, 1.1); }
  }
}

/** Round 55: on a Free-Throw-Line Dunk make, everyone in front of him (in his lane to the rim) gets posterized. */
export function posterLane(sim: GameSim, s: Player): Player[] {
  const a = sim.ult.active;
  if (!a || a.id !== 'ftTakeoff' || a.pid !== s.id || !a.from) return [];
  const rim = sim.rim(s.team), dir = norm(sub(rim, a.from)), L = dist(a.from, rim);
  const hit: Player[] = [];
  for (const d of sim.opp(s.team)) {
    const rel = sub(d.p, a.from), along = rel.x * dir.x + rel.y * dir.y, lat = Math.abs(rel.x * dir.y - rel.y * dir.x);
    if (along > -1 && along < L + 3 && lat < 6 && d.state !== 'fallen') hit.push(d);
  }
  return hit;
}

export const ultLevelName = (st: UltState) => (st.id ? ULTIMATES[st.id].levels[Math.min(st.level, ULTIMATES[st.id].levels.length - 1)].name : '???');
export { v };
