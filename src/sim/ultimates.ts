import { ULTIMATES, UltLevel } from './data';
import type { GameSim } from './game';
import { Player } from './player';
import { dist, norm, sub, scale, v, add } from './math';

/** Career-side ultimate state. Locked until the story flag sets unlocked=true (dev tools can force it). */
export interface UltState { unlocked: boolean; id: string | null; level: number }
export interface UltRuntime {
  state: UltState;
  active: { id: string; pid: string; until: number; level: UltLevel; targetId?: string; shotOverride?: { base?: number; label?: string; contestMult?: number } } | null;
}

/** In-game ult meter gains (meter is 0-100). */
export const ULT_GAINS = { score: 10, assist: 10, rebound: 5, stop: 7, steal: 12, block: 12, charge: 16, playExec: 6, screen: 4, ankles: 8 };

/** Career milestone -> evolution points. */
export const ULT_MILESTONES: Record<string, { name: string; points: number }> = {
  fiftyBall: { name: '50-point game', points: 2 },
  tripleDouble: { name: 'Triple-double', points: 1 },
  gameWinner: { name: 'Game-winner', points: 2 },
};

export function tryActivateUlt(sim: GameSim, p: Player) {
  const st = sim.ult.state;
  if (!st.unlocked || !st.id) { sim.emit({ kind: 'ult', text: 'Ultimate: ??? (locked)', pid: p.id }); return; }
  if (p.ultCharge < 100) { sim.emit({ kind: 'ult', text: `Ultimate charging… ${p.ultCharge.toFixed(0)}%`, pid: p.id }); return; }
  const def = ULTIMATES[st.id];
  const level = def.levels[Math.min(st.level, def.levels.length - 1)];
  const rim = sim.rim(p.team);
  const d = dist(p.p, rim);
  const hasBall = sim.holder() === p;
  let ok = false;

  if (st.id === 'deepStepback' && hasBall && d >= 17 && d <= 29 && !p.busy) {
    const away = norm(sub(p.p, rim));
    p.state = 'dribbleMove'; p.stateT = 0; p.stateDur = 0.32;
    p.anim = { name: 'move_stepback', start: sim.time, dur: 0.32 };
    p.move = { id: 'stepback', dir: away, t: 0 };
    p.moveVel = scale(away, level.stepFt / 0.32);
    p.dribbledSinceCatch = true;
    const until = sim.time + level.window;
    const label = `ULT ${level.name}`;
    p.mods.removeHooks('ult');
    p.mods.addHook('shot', 'ult', (c) => (c.type === 'three' || c.type === 'deep3' ? { label, mult: level.shotBonus } : null), until);
    p.mods.addHook('contestIn', 'ult', (c) => (c.type === 'three' || c.type === 'deep3' ? { label, mult: level.contestMult } : null), until);
    sim.ult.active = { id: st.id, pid: p.id, until, level };
    ok = true;
  } else if (st.id === 'ftTakeoff' && hasBall && d >= 9 && d <= level.range && !p.busy) {
    const override = { base: level.makePct * 0.92, contestMult: level.contestMult, label: `ULT ${level.name}` };
    sim.startShot(p, 'dunk', override);
    p.stateDur = 0.75;
    p.vel = scale(norm(sub(rim, p.p)), (d - 1.2) / 0.75);
    p.vz = 13;
    if (level.stunDefenders) for (const o of sim.opp(p.team)) if (dist(o.p, p.p) < 7) o.staggerUntil = sim.time + 0.9;
    sim.ult.active = { id: st.id, pid: p.id, until: sim.time + 1.0, level, shotOverride: override };
    ok = true;
  } else if (st.id === 'chaseDown' && p.team !== sim.possession) {
    const tgt = sim.holder() ?? (sim.ball.st.kind === 'shot' ? sim.ball.st.shooter : null);
    if (tgt) { sim.ult.active = { id: st.id, pid: p.id, until: sim.time + level.duration, level, targetId: tgt.id }; ok = true; }
  }

  if (ok) {
    p.ultCharge = 0;
    sim.emit({ kind: 'ult', text: `ULTIMATE: ${level.name}!`, pid: p.id, big: true, good: true });
  } else {
    sim.emit({ kind: 'ult', text: `${def.name}: not available from here`, pid: p.id });
  }
}

export function tickUlt(sim: GameSim, _dt: number) {
  const a = sim.ult.active;
  if (!a) return;
  if (sim.time > a.until) { sim.ult.active = null; return; }
  if (a.id === 'chaseDown') {
    const p = sim.players.find((q) => q.id === a.pid);
    const tgt = sim.players.find((q) => q.id === a.targetId);
    if (!p || !tgt) { sim.ult.active = null; return; }
    // lock-on: sprint at the target with a speed boost and jump when in range
    const lead = add(tgt.p, scale(tgt.vel, 0.25));
    p.want = scale(norm(sub(lead, p.p)), p.sprintSpeed * a.level.speedMult);
    if (dist(p.p, tgt.p) < 4.2 && (tgt.state === 'shoot' || tgt.z > 0.3) && p.z === 0) { p.blockCdUntil = 0; sim.jump(p, 1.05); }
  }
}

export const ultLevelName = (st: UltState) => (st.id ? ULTIMATES[st.id].levels[Math.min(st.level, ULTIMATES[st.id].levels.length - 1)].name : '???');
export { v };
