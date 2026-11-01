import type { GameSim } from '../game';
import { Player } from '../player';
import { spot, hc, inFrontcourt, toHc } from '../court';
import { Vec, dist, norm, sub, add, scale, segDist, clamp01, dot, len, v } from '../math';
import { evaluateShot, selectShotType } from '../shooting';
import { passFactor, callBonus } from './trust';

const FREELANCE: Record<string, string[]> = { '1': ['top', 'ls', 'rs'], '2': ['lw', 'lc'], '3': ['rw', 'rc'], '4': ['lc', 'le', 'lw'], '5': ['rdk', 'rb', 'ldk'] };

/** A teammate is "ahead" when he's closer to the rim than every defender (a leak-out / beat-everyone runner). */
export function aheadOfDefense(sim: GameSim, m: Player): boolean {
  const rim = sim.rim(m.team);
  const md = dist(m.p, rim);
  return sim.opp(m.team).every((d) => dist(d.p, rim) > md + 2);
}

/** How free a teammate is: distance to his own defender and to the nearest help. */
export function separation(sim: GameSim, m: Player): { own: number; help: number } {
  const own = sim.defenderOf(m);
  return { own: own ? dist(own.p, m.p) : 99, help: sim.nearestDefender(m).dist };
}

export function offBallTarget(sim: GameSim, p: Player): { pos: Vec; act: string; urgent: boolean } {
  const side = sim.side(p.team);
  const h = sim.holder();
  // fast break: fill the lanes - wings run the sidelines, bigs trail, anyone ahead of the defense goes to the rim
  if (sim.inTransition(p.team) && h && h !== p) {
    if (aheadOfDefense(sim, p)) return { pos: spot(side, 'rim'), act: 'cut', urgent: true };
    const lane = p.role === '2' ? hc(side, 7, -18) : p.role === '3' ? hc(side, 7, 18) : p.role === '1' ? hc(side, 24, 0) : hc(side, 22, p.role === '4' ? -7 : 7);
    return { pos: lane, act: 'move', urgent: true };
  }
  if (h && !inFrontcourt(side, h.p)) {
    const s = FREELANCE[p.role]?.[0] ?? 'top';
    return { pos: spot(side, s), act: 'move', urgent: true };
  }
  if (sim.time < p.cutUntil) return { pos: spot(side, 'rim'), act: 'cut', urgent: true };
  const a = sim.runner.roleAssignment(sim.playRole(p));
  if (a && !sim.runner.done) return { pos: sim.assignmentPos(p, a), act: a.act, urgent: a.act === 'cut' || a.act === 'screen' };
  // freelance 5-out-ish spacing: take the first preferred spot nobody is standing near
  const prefs = FREELANCE[p.role] ?? ['top'];
  const mates = sim.mates(p);
  for (const s of prefs) {
    const pos = spot(side, s);
    if (!mates.some((m) => dist(m.target ?? m.p, pos) < 7 && m.role < p.role)) return { pos, act: 'move', urgent: false };
  }
  return { pos: spot(side, prefs[0]), act: 'move', urgent: false };
}

export function thinkOffense(sim: GameSim, p: Player, dt: number) {
  const h = sim.holder();
  if (h === p) { handlerAI(sim, p, dt); return; }
  const bs = sim.ball.st;
  if (bs.kind === 'pass' && bs.to === p) { sim.steer(p, bs.b, true); return; }
  if (p.state === 'screen') return;
  const t = offBallTarget(sim, p);
  sim.steer(p, t.pos, t.urgent);
  if (t.act === 'screen' && dist(p.p, t.pos) < 2.2 && sim.time > p.screenCdUntil && p.lastScreenAt < sim.phaseStartedAt) sim.setScreen(p);
  // backdoor cuts when the defender is ball-watching
  if (sim.runner.done || !sim.runner.playId) {
    const d = sim.defenderOf(p);
    const overplay = d ? dist(d.p, p.p) > 5.5 : false;
    if (h && sim.time > p.cutUntil + 3 && sim.rng.chance(dt * (overplay ? 0.5 : 0.08))) p.cutUntil = sim.time + 1.6;
  }
}

/** Trust the AI uses for passes to the user. While testing (feature me), there's a floor of 70. */
const userTrust = (sim: GameSim) => (sim.featureUser ? Math.max(70, sim.trust.team) : sim.trust.team);

function laneRisk(sim: GameSim, from: Player, to: Player): number {
  let r = 0;
  for (const d of sim.opp(from.team)) {
    const s = segDist(d.p, from.p, to.p);
    if (s.t > 0.08 && s.t < 0.97 && s.d < 3.2) r += (1 - s.d / 3.2) * 0.7 * (0.6 + d.sub.steal / 99 * 0.6);
  }
  return Math.min(1.5, r);
}

function catchEV(sim: GameSim, m: Player): number {
  const side = sim.side(m.team);
  const type = selectShotType(m, side, v(), sim.time);
  const ev = evaluateShot(m, sim.opp(m.team), side, type, { now: sim.time, clutch: sim.clutch });
  return ev.pct * ev.pts * (['mid', 'three', 'deep3'].includes(type) ? 1.08 : 1);
}

function handlerAI(sim: GameSim, p: Player, dt: number) {
  const side = sim.side(p.team);
  const rim = sim.rim(p.team);
  const d = dist(p.p, rim);
  if (p.state === 'dribbleMove' || p.state === 'shoot') return;
  // dribble picked up: pass to the best option, or shoot if nobody is open
  if (p.deadDribble) {
    p.want = v();
    if (sim.time - p.deadDribbleAt < 0.35) return;
    let best: Player | null = null, bv = -1;
    for (const m of sim.mates(p)) { const val = sim.openness(m) - laneRisk(sim, p, m); if (val > bv) { bv = val; best = m; } }
    if (best && bv > 0.15) sim.pass(p, best); else sim.startShot(p, selectShotType(p, side, v(), sim.time));
    return;
  }

  // ---- transition: read the break before walking it up ----
  if (sim.inTransition(p.team) && p.aiMode !== 'drive') {
    const sinceCatchT = sim.time - p.receivedAt;
    const mates = sim.mates(p);
    const leaders = mates.filter((m) => aheadOfDefense(sim, m) && dist(m.p, rim) < d - 4 && laneRisk(sim, p, m) < 0.5)
      .sort((a, b) => dist(a.p, rim) - dist(b.p, rim));
    if (leaders.length && sinceCatchT > 0.15) { sim.pass(p, leaders[0]); return; }
    // rebounding big: outlet to the point guard
    const pg = sim.byRole(p.team, '1');
    if ((p.role === '4' || p.role === '5') && pg && pg !== p && sim.openness(pg) > 0.4 && laneRisk(sim, p, pg) < 0.4 && sinceCatchT > 0.25) { sim.pass(p, pg); return; }
    // numbers: attackers vs defenders between the ball and the rim
    const offAhead = mates.filter((m) => dist(m.p, rim) < d + 3).length + 1;
    const defBack = sim.opp(p.team).filter((o) => dist(o.p, rim) < d).length;
    if (offAhead > defBack) { sim.steer(p, rim, true); if (d < 22) { p.aiMode = 'drive'; p.aiModeUntil = sim.time + 1.8; } return; }
    sim.transitionUntil = 0; // no advantage: walk it up and run something
  }

  if (!inFrontcourt(side, p.p) || toHc(side, p.p).hx > 40) {
    sim.steer(p, hc(side, 30, 0), false);
    p.aiMode = 'none';
    return;
  }

  // drive mode: attack until close, then finish
  if (p.aiMode === 'drive' && sim.time < p.aiModeUntil) {
    sim.steer(p, rim, true);
    if (d < 7.5) {
      const toRim = norm(sub(rim, p.p));
      const nd = sim.nearestDefender(p);
      const stick = nd.d && nd.dist < 4 && p.hasShot('euro') ? scale({ x: -toRim.y, y: toRim.x }, 1) : toRim;
      sim.startShot(p, selectShotType(p, side, stick, sim.time));
      p.aiMode = 'none';
    }
    return;
  }
  p.aiMode = 'none';

  if (sim.time < p.aiNextThink) return;
  p.aiNextThink = sim.time + 0.18 + sim.rng.next() * 0.14;
  const sinceCatch = sim.time - p.receivedAt;
  const urgency = clamp01(1 - sim.shotClock / 14);
  const phase = sim.runner.cur;
  const resetting = sim.runner.resetting(sim.time);

  // reset: get the ball back to the top and to the point guard, then the coach calls the next set
  if (resetting) {
    const pg = sim.byRole(p.team, '1');
    if (pg && pg !== p && sim.runner.swungAt < 0 && sinceCatch > 0.3 && laneRisk(sim, p, pg) < 0.4 && sim.openness(pg) > 0.3) {
      sim.runner.swungAt = sim.time; sim.pass(p, pg); return;
    }
    sim.steer(p, spot(side, 'top'), false, 0.85);
    const quick = selectShotType(p, side, v(), sim.time);
    const qev = evaluateShot(p, sim.opp(p.team), side, quick, { now: sim.time, clutch: sim.clutch });
    if (qev.contest < 0.08 && qev.pct * qev.pts > 1.15) sim.startShot(p, quick); // only a wide-open look
    return;
  }

  // the play wants the ball somewhere else this phase
  if (phase?.ball && phase.ball !== sim.playRole(p) && sim.runner.ballCalledAt !== sim.runner.phase) {
    sim.runner.ballCalledAt = sim.runner.phase;
    const tgt = sim.byPlayRole(p.team, phase.ball);
    if (tgt && laneRisk(sim, p, tgt) < 0.5) {
      const f = tgt.isUser ? 0.35 + 0.65 * userTrust(sim) / 100 : 1;
      if (sim.rng.chance(0.9 * f)) { sim.pass(p, tgt); return; }
    }
  }

  const type = selectShotType(p, side, v(), sim.time);
  const ev = evaluateShot(p, sim.opp(p.team), side, type, { now: sim.time, clutch: sim.clutch });
  const myEV = ev.pct * ev.pts;
  // keep everyone involved: high-usage players get pickier, low-touch teammates get looked for
  const team = sim.teams[p.team].onCourt;
  const avgUse = team.reduce((a, q) => a + q.box.usage, 0) / Math.max(1, team.length);
  const avgTouch = team.reduce((a, q) => a + q.box.touches, 0) / Math.max(1, team.length);
  const shootT = 0.98 - urgency * 0.45 + (phase ? 0.06 : 0) + Math.max(0, p.box.usage - avgUse) * 0.09;

  let best: Player | null = null, bestVal = -1e9;
  for (const m of sim.mates(p)) {
    if (m.state === 'fallen') continue;
    const open = sim.openness(m);
    let val = catchEV(sim, m) * (0.5 + 0.6 * open);
    if (phase?.options?.includes(sim.playRole(m))) val += 0.22;
    // open man first: a teammate whose defender is far away gets the ball over the play
    const sep = separation(sim, m);
    if (sep.own > 7.5 && sep.help > 6) val += 0.4;
    if (aheadOfDefense(sim, m) && dist(m.p, rim) < 16) val += 0.7;
    if (avgTouch > 3) val += clamp01((avgTouch - m.box.touches) / avgTouch) * 0.2;
    val -= Math.max(0, m.box.usage - avgUse) * 0.05;
    const toRimM = norm(sub(rim, m.p));
    if (dot(m.vel, toRimM) > 8 && open > 0.4) val += 0.25;
    val -= laneRisk(sim, p, m) * 0.9;
    if (dist(p.p, m.p) > p.safePassDist) val -= 0.25;
    if (m === sim.lastPasser && sim.time - sim.lastPassAt < 1.5) val -= 0.3;
    if (m.isUser) {
      val *= passFactor(userTrust(sim));
      if (m.callForBallUntil > sim.time) val += callBonus(userTrust(sim), open);
      if (sim.time - m.lastScreenAt < 2) val *= m.mods.pMult('rollTrust');
    }
    val += sim.rng.next() * 0.08;
    if (val > bestVal) { bestVal = val; best = m; }
  }
  const holdVal = 0.66 + (phase ? 0.08 : 0) - urgency * 0.35 - Math.max(0, sinceCatch - 3) * 0.08;

  // drive lane check
  const toRim = norm(sub(rim, p.p));
  let blockers = 0;
  for (const o of sim.opp(p.team)) {
    const rel = sub(o.p, p.p);
    const along = dot(rel, toRim);
    if (along > 0 && along < Math.min(d, 14) && Math.abs(rel.x * toRim.y - rel.y * toRim.x) < 3.5) blockers += sim.time < o.staggerUntil || o.state === 'fallen' ? 0.3 : 1;
  }
  const driveVal = d < 26 ? (blockers === 0 ? 1.15 : blockers < 1 ? 0.9 : 0.3) * (0.7 + p.sub.layup / 99 * 0.5) : 0;

  // a wide-open teammate (or one behind the defense) beats a contested look and the play
  if (best && sinceCatch > 0.3 && bestVal > holdVal + 0.45 && bestVal > myEV * 1.1 && laneRisk(sim, p, best) < 0.35) { sim.pass(p, best); return; }
  if (sinceCatch > 0.12 && myEV > shootT && (ev.contest < 0.35 || urgency > 0.7)) { sim.startShot(p, type); return; }
  if (urgency > 0.93) { sim.startShot(p, type); return; }
  if (best && bestVal > holdVal + 0.12 && sinceCatch > 0.7) { sim.pass(p, best); return; }
  if (driveVal > holdVal && driveVal > bestVal) { p.aiMode = 'drive'; p.aiModeUntil = sim.time + 1.6; return; }

  const nd = sim.nearestDefender(p);
  // side drive, then snap it back the other way when the defender recovers
  if (p.flickDir && sim.time < p.flickUntil && nd.d && nd.dist < 4 && sim.rng.chance(0.5)) { sim.flickCross(p, -p.flickDir); return; }
  if (nd.d && nd.dist < 4.2 && sim.rng.chance(0.14 * (p.sub.ankleBreak / 70))) {
    // change direction across the hoop line if already moving across it, otherwise side drive or attack the rim
    const pr = { x: -toRim.y, y: toRim.x };
    const lat = p.vel.x * toRim.y - p.vel.y * toRim.x; // -(toRim × vel)
    const going = Math.abs(lat) > 3 ? -Math.sign(lat) : 0;
    const stick = going && sim.rng.chance(0.6) ? scale(pr, -going) : sim.rng.chance(0.3) ? scale(pr, sim.rng.chance(0.5) ? 1 : -1) : toRim;
    sim.dribbleMove(p, stick);
    return;
  }
  // otherwise run the handler's spot in the play / probe
  const a = sim.runner.roleAssignment(sim.playRole(p));
  const pos = a && a.act === 'handle' ? sim.assignmentPos(p, a) : add(p.p, scale(norm(sub(spot(side, 'top'), p.p)), Math.min(3, dist(p.p, spot(side, 'top')))));
  sim.steer(p, pos, false, 0.8);
  void len; void dt;
}
