import type { GameSim } from '../game';
import { Player } from '../player';
import { spot, hc, inFrontcourt, toHc, clampToCourt } from '../court';
import { Vec, dist, norm, sub, add, scale, segDist, clamp01, clamp, dot, len, v } from '../math';
import { evaluateShot, selectShotType, ShotEval } from '../shooting';
import { POST, canPost, postDefender, postGap, postIntent } from '../post';
import { passFactor, callBonus } from './trust';
import { tryActivateUlt } from '../ultimates';

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
  // called up to screen for a pressured ball handler: go set it on his man
  if (p.screenFor) {
    if (h && h.id === p.screenFor.pid && sim.time < p.screenFor.until) {
      const d = sim.defenderOf(h) ?? sim.nearestDefender(h).d;
      if (d) {
        const away = norm(sub(d.p, sim.rim(p.team)));
        const lateral = norm(sub(p.p, d.p));
        return { pos: clampToCourt(add(d.p, scale(norm(add(scale(away, 0.4), lateral)), 2.0))), act: 'screenFor', urgent: true };
      }
    }
    p.screenFor = null;
  }
  if (h && !inFrontcourt(side, h.p)) {
    // press outlet: a guard flashes back toward the pressured handler (up court and toward the middle)
    if (h !== p && h.pressedSince > 0 && sim.pressing[(1 - p.team) as 0 | 1]) {
      const guards = sim.mates(h).filter((m) => m.role === '1' || m.role === '2' || m.role === '3');
      const outlet = guards.sort((a, b) => dist(a.p, h.p) - dist(b.p, h.p))[0];
      if (outlet === p) {
        const fx = Math.sign(sim.rim(p.team).x - h.p.x) || 1, my = h.p.y > 25 ? -1 : 1;
        return { pos: clampToCourt(add(h.p, { x: fx * 10, y: my * 10 })), act: 'move', urgent: true };
      }
    }
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
  // called up to screen for the ball handler against pressure: set it when there
  if (t.act === 'screenFor' && dist(p.p, t.pos) < 2.4 && sim.time > p.screenCdUntil) { sim.setScreen(p); p.screenFor = null; }
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

/** How dangerous the passing lane is. Overhead passes sail over the middle: only defenders near either end count. */
function laneRisk(sim: GameSim, from: Player, to: Player): number {
  const over = sim.passSafety(from, to).overhead;
  let r = 0;
  for (const d of sim.opp(from.team)) {
    const s = segDist(d.p, from.p, to.p);
    if (over && s.t > 0.15 && s.t < 0.82) continue;
    if (s.t > 0.08 && s.t < 0.97 && s.d < 3.2) r += (1 - s.d / 3.2) * 0.7 * (0.6 + d.sub.steal / 99 * 0.6);
  }
  return Math.min(1.5, r);
}

/** 0..1: how well (and how fast) a ball handler sees the floor. */
const readSkill = (p: Player) => clamp01(((p.sub.passRange + p.core.playmaking) / 2 - 25) / 70);

/** A teammate is open for a pass: his man is off him, no help close, a safe lane within range. */
function openForPass(sim: GameSim, from: Player, m: Player): boolean {
  if (m.state === 'fallen') return false;
  const sep = separation(sim, m);
  return sep.own > 7 && sep.help > 5 && sim.passSafety(from, m).ok && laneRisk(sim, from, m) < 0.4;
}

/** Iso: this set is being run for p. */
const isoFor = (sim: GameSim, p: Player) => !!sim.runner.play?.tags.includes('iso') && sim.runner.focusPid === p.id && !sim.runner.done;

/**
 * Catch read, before the first dribble: wide open = let it fly; a defender flying at you = pump fake (keeps the
 * dribble on the catch) and go by him, or just attack the closeout. Returns true when it acted.
 */
function catchRead(sim: GameSim, p: Player, sinceCatch: number): boolean {
  const side = sim.side(p.team), rim = sim.rim(p.team);
  if (p.dribbledSinceCatch || p.deadDribble || sinceCatch > 0.9 || sinceCatch < 0.12 || dist(p.p, rim) > 27 || !inFrontcourt(side, p.p)) return false;
  const nd = sim.nearestDefender(p);
  const type = selectShotType(p, side, v(), sim.time);
  const jumper = ['mid', 'three', 'deep3'].includes(type);
  const ev = evaluateShot(p, sim.opp(p.team), side, type, { now: sim.time, clutch: sim.clutch });
  const shotEV = ev.pct * ev.pts;
  const toRim = norm(sub(rim, p.p));
  const closing = nd.d ? dot(nd.d.vel, norm(sub(p.p, nd.d.p))) : 0;
  // attack the closeout: side drive away from where he's coming from, then go to the rim
  const attack = () => {
    const pr = { x: -toRim.y, y: toRim.x };
    const off = nd.d ? (nd.d.p.x - p.p.x) * pr.x + (nd.d.p.y - p.p.y) * pr.y : 0;
    sim.dribbleMove(p, scale(pr, off > 0 ? -1 : 1));
    p.aiMode = 'drive'; p.aiModeUntil = sim.time + 1.8;
  };
  const faked = p.pumpFakeAt > p.receivedAt;
  if (faked) {
    if (sim.time - p.pumpFakeAt < 0.45) return true;
    const bit = !!nd.d && (nd.d.z > 0.3 || sim.time - nd.d.lastJumpAt < 0.6 || sim.time < nd.d.staggerUntil);
    if (bit || nd.dist < 4.5) { attack(); return true; }
    if (jumper && nd.dist > 6) { sim.startShot(p, type); return true; }
    attack(); return true;
  }
  // one read per catch (then the normal half-court decisions take over)
  if (p.catchReadFor === p.receivedAt) return false;
  p.catchReadFor = p.receivedAt;
  if (jumper && nd.dist > 5.5 && shotEV > 0.9) { sim.startShot(p, type); return true; }
  const shooter = clamp01((p.sub.three - 40) / 45);
  if (jumper && closing > 8 && nd.dist > 2.5 && nd.dist < 7 && sim.rng.chance(0.25 + 0.5 * shooter)) { sim.pumpFake(p); return true; }
  if (closing > 7 && nd.dist < 3.5 && p.sub.layup > 45 && sim.rng.chance(0.6)) { attack(); return true; }
  return false;
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
  // post mode: back him down, then a post shot out of the window (or a Dreamer fake, or kick it out of a double)
  if (p.aiMode === 'post') { postAI(sim, p); return; }
  // dribble picked up: pass to the best option, or shoot if nobody is open
  if (p.deadDribble) {
    p.want = v();
    if (sim.time - p.deadDribbleAt < 0.35) return;
    let best: Player | null = null, bv = -1;
    for (const m of sim.mates(p)) { const val = sim.openness(m) - laneRisk(sim, p, m); if (val > bv) { bv = val; best = m; } }
    if (best && bv > 0.15) sim.pass(p, best); else sim.startShot(p, selectShotType(p, side, v(), sim.time));
    return;
  }

  // round 47: doubled / tripled in the half court: find the open man after a read (better passers see it sooner);
  // a great handler sometimes splits it instead
  if (inFrontcourt(side, p.p) && sim.opp(p.team).filter((o) => dist(o.p, p.p) < 4.2 && sim.time >= o.stunnedUntil && o.state !== 'fallen').length >= 2) {
    if (p.doubledSince < 0) p.doubledSince = sim.time;
    if (sim.time - p.doubledSince > 0.25 + 0.55 * (1 - readSkill(p))) {
      let best: Player | null = null, bv = -1;
      for (const m of sim.mates(p)) { const val = sim.openness(m) - laneRisk(sim, p, m); if (val > bv) { bv = val; best = m; } }
      if (best && bv > 0.1) { p.doubledSince = -1; throwTo(sim, p, best); return; }
      if (!p.deadDribble && p.sub.ballSpeed > 82 && sim.rng.chance(0.25)) {
        const toRim = norm(sub(rim, p.p)); p.doubledSince = -1;
        sim.dribbleMove(p, scale({ x: -toRim.y, y: toRim.x }, sim.rng.chance(0.5) ? 1 : -1));
        p.aiMode = 'drive'; p.aiModeUntil = sim.time + 1.4;
        return;
      }
    }
  } else p.doubledSince = -1;

  // round 51: the Deep Step-Back ult was used, let the three fly out of it
  if (p.ultShotAt > 0 && sim.time >= p.ultShotAt) { p.ultShotAt = 0; sim.startShot(p, selectShotType(p, side, v(), sim.time)); return; }
  // round 51: a CPU star in full rhythm uses his ultimate when the moment fits (once a game)
  const ult = p.rhythm >= 100 && !sim.ultsUsed[p.id] ? sim.ultOf(p) : null;
  if (ult && !p.deadDribble && inFrontcourt(side, p.p)) {
    if (ult.id === 'deepStepback' && d >= 17 && d <= 29 && sim.rng.chance(0.12) && tryActivateUlt(sim, p)) { p.ultShotAt = sim.time + 0.75; return; } // round 55: after both step-backs
    if (ult.id === 'ftTakeoff' && d >= 9 && d <= 19 && dot(p.vel, norm(sub(rim, p.p))) > 5 && tryActivateUlt(sim, p)) return;
  }
  // round 48: open floor on the run (transition / coming up the floor, moving toward the rim), nobody in front of him
  // or alongside his path to the rim: keep going and finish (no pass back to the point guard). Re-checked every tick: the moment a defender gets in the way, the normal reads take over.
  const running = dot(p.vel, norm(sub(rim, p.p))) > 4 && (sim.inTransition(p.team) || d > 30);
  if (OPEN_COURT.on && !p.deadDribble && d > 7.5 && d < 70 && (running || p.aiMode === 'drive') && clearPath(sim, p)) {
    if (p.aiMode !== 'drive') { OPEN_COURT.runs++; OPEN_COURT.startD.push(Math.round(d)); if (inFrontcourt(side, p.p) && !sim.inTransition(p.team)) OPEN_COURT.half++; }
    sim.steer(p, rim, true);
    if (len(p.vel) > 6) sim.startBurst(p);
    p.aiMode = 'drive'; p.aiModeUntil = sim.time + 0.6;
    return;
  }
  if (p.aiMode === 'drive' && d <= 7.5 && clearPath(sim, p)) { OPEN_COURT.shots++; sim.startShot(p, selectShotType(p, side, norm(sub(rim, p.p)), sim.time)); p.aiMode = 'none'; return; }

  // ---- transition: read the break before walking it up ----
  if (sim.inTransition(p.team) && p.aiMode !== 'drive') {
    const sinceCatchT = sim.time - p.receivedAt;
    const mates = sim.mates(p);
    // throw ahead: anyone well down the floor with his man trailing (or nobody on him) gets it over the top
    const leaders = mates.filter((m) => {
      const md = dist(m.p, rim);
      if (md > d - 6 || m.state === 'fallen') return false;
      const own = sim.defenderOf(m);
      const beat = aheadOfDefense(sim, m) || !own || dist(own.p, rim) > md + 1 || dist(own.p, m.p) > 5;
      return beat && sim.passSafety(p, m).ok && laneRisk(sim, p, m) < 0.6;
    }).sort((a, b) => dist(a.p, rim) - dist(b.p, rim));
    // better passers see it sooner
    const lead = leaders.find((m) => !m.isUser || passFactor(userTrust(sim)) > 0.45);
    if (lead && sinceCatchT > 0.55 - 0.43 * readSkill(p)) { throwTo(sim, p, lead); return; }
    // rebounding big: outlet to the point guard
    const pg = sim.byRole(p.team, '1');
    if ((p.role === '4' || p.role === '5') && pg && pg !== p && sim.openness(pg) > 0.4 && laneRisk(sim, p, pg) < 0.4 && sinceCatchT > 0.25) { sim.pass(p, pg); return; }
    // numbers: attackers vs defenders between the ball and the rim
    const offAhead = mates.filter((m) => dist(m.p, rim) < d + 3).length + 1;
    const defBack = sim.opp(p.team).filter((o) => dist(o.p, rim) < d).length;
    if (offAhead > defBack) { sim.steer(p, rim, true); if (d < 22) { p.aiMode = 'drive'; p.aiModeUntil = sim.time + 1.8; } return; }
    sim.transitionUntil = 0; // no advantage: walk it up and run something
  }

  if (!inFrontcourt(side, p.p) || toHc(side, p.p).hx > 40) { bringUp(sim, p); return; }

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

  const sinceCatch = sim.time - p.receivedAt;
  const iso = isoFor(sim, p);
  if (!iso && catchRead(sim, p, sinceCatch)) return;
  if (sim.time < p.aiNextThink) return;
  p.aiNextThink = sim.time + 0.18 + sim.rng.next() * 0.14;

  const urgency = clamp01(1 - sim.shotClock / 14);
  const phase = sim.runner.cur;
  const resetting = sim.runner.resetting(sim.time);

  // a lob set: once the lob man is cutting at the rim, throw him the alley-oop (one look per phase; the user only
  // gets it with the team's trust, and only if he actually cuts)
  if (phase?.lob && !resetting && sim.runner.lobPhase !== sim.runner.phase) {
    const m = sim.byPlayRole(p.team, phase.lob);
    if (m && m !== p && sim.lobTarget(p, m) && dot(m.vel, norm(sub(rim, m.p))) > 4) {
      sim.runner.lobPhase = sim.runner.phase;
      if (!m.isUser || sim.rng.chance(passFactor(userTrust(sim)))) { sim.lobPass(p, m); return; }
    }
  }

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

  // the open-man read: a teammate who has come open gets the ball before the play continues (the better the passer,
  // the sooner and more often he sees it). In an iso, only when the help commits.
  const helpers = sim.opp(p.team).filter((o) => dist(o.p, p.p) < 6).length;
  if ((!iso || helpers >= 2) && sinceCatch > 0.9 - 0.7 * readSkill(p)) {
    let open: Player | null = null, ov = 0;
    for (const m of sim.mates(p)) {
      if (!openForPass(sim, p, m)) continue;
      const near = dist(m.p, rim) < 10;
      const val = catchEV(sim, m) + (near ? 0.4 : 0);
      if (val > 0.85 && val > ov) { ov = val; open = m; }
    }
    const take = 0.3 + 0.6 * readSkill(p);
    if (open && (!open.isUser || sim.rng.chance(passFactor(userTrust(sim)))) && sim.rng.chance(iso ? 0.9 : take)) { throwTo(sim, p, open); return; }
  }

  // the play wants the ball somewhere else this phase
  if (!iso && phase?.ball && phase.ball !== sim.playRole(p) && sim.runner.ballCalledAt !== sim.runner.phase) {
    sim.runner.ballCalledAt = sim.runner.phase;
    const tgt = sim.byPlayRole(p.team, phase.ball);
    if (tgt && laneRisk(sim, p, tgt) < 0.5) {
      const f = tgt.isUser ? 0.35 + 0.65 * userTrust(sim) / 100 : 1;
      if (sim.rng.chance(0.9 * f)) { sim.pass(p, tgt); return; }
    }
  }

  // round 49 (play lab): the focus of a post set backs his man down when he catches it in range, the sets used to
  // leave it to chance (and iso posts never posted at all)
  const pl = sim.runner.play;
  const isFocus = !!pl && (sim.runner.focusPid ? sim.runner.focusPid === p.id : sim.playRole(p) === pl.focus);
  if (pl?.tags.includes('post') && isFocus && sinceCatch > 0.2 && urgency < 0.85 && d >= 6 && d <= 17 && canPost(sim, p)) {
    p.aiMode = 'post'; p.aiModeUntil = sim.time + sim.rng.range(2.5, 4.0);
    postAI(sim, p);
    return;
  }
  // bigs with an edge on their man post him up
  if (!iso && sinceCatch > 0.3 && urgency < 0.75 && wantsPost(sim, p)) {
    p.aiMode = 'post'; p.aiModeUntil = sim.time + sim.rng.range(2.5, 4.5);
    postAI(sim, p);
    return;
  }

  const { type, ev } = bestShot(sim, p);
  const myEV = ev.pct * ev.pts;
  // keep everyone involved: high-usage players get pickier, low-touch teammates get looked for
  const team = sim.teams[p.team].onCourt;
  const avgUse = team.reduce((a, q) => a + q.box.usage, 0) / Math.max(1, team.length);
  const avgTouch = team.reduce((a, q) => a + q.box.touches, 0) / Math.max(1, team.length);
  const shootT = 0.98 - urgency * 0.45 + (phase ? 0.06 : 0) + Math.max(0, p.box.usage - avgUse) * 0.09 - (iso ? 0.12 : 0);

  let best: Player | null = null, bestVal = -1e9;
  for (const m of sim.mates(p)) {
    if (m.state === 'fallen') continue;
    const open = sim.openness(m);
    let val = catchEV(sim, m) * (0.5 + 0.6 * open);
    if (phase?.options?.includes(sim.playRole(m))) val += 0.22;
    // round 49: the coach called this set for him, get him the ball when he's open (the action is the point of the call)
    if (sim.runner.focusPid === m.id && !sim.runner.done && open > 0.45) val += 0.18;
    if (sim.mismatch?.pid === m.id && sim.time < sim.mismatch.until) val += 0.35; // feed the switch mismatch
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
  if (best && (!iso || helpers >= 2) && sinceCatch > 0.3 && bestVal > holdVal + 0.45 && bestVal > myEV * 1.1 && laneRisk(sim, p, best) < 0.35) { throwTo(sim, p, best); return; }
  if (sinceCatch > 0.12 && myEV > shootT && (ev.contest < 0.35 || urgency > 0.7)) { sim.startShot(p, type); return; }
  if (urgency > 0.93) { sim.startShot(p, type); return; }
  if (!iso && best && bestVal > holdVal + 0.12 && sinceCatch > 0.7) { throwTo(sim, p, best); return; }
  if ((driveVal > holdVal && driveVal > bestVal) || (iso && blockers <= 1 && d < 26 && sim.rng.chance(0.45))) { p.aiMode = 'drive'; p.aiModeUntil = sim.time + 1.6; return; }

  const nd = sim.nearestDefender(p);
  // side drive, then snap it back the other way when the defender recovers
  if (p.flickDir && sim.time < p.flickUntil && nd.d && nd.dist < 4 && sim.rng.chance(0.5)) { sim.flickCross(p, -p.flickDir); return; }
  // iso: the star works his man with moves
  if (nd.d && nd.dist < (iso ? 6 : 4.2) && sim.rng.chance((iso ? 0.35 : 0.14) * (p.sub.ankleBreak / 70))) {
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

/**
 * The handler's best look from here: the normal shot, or a Fade Away (if he owns it) when the jumper is contested and
 * fading off the contest is worth more.
 */
function bestShot(sim: GameSim, p: Player): { type: string; ev: ShotEval } {
  const side = sim.side(p.team), now = sim.time, opp = sim.opp(p.team);
  const type = selectShotType(p, side, v(), now);
  const ev = evaluateShot(p, opp, side, type, { now, clutch: sim.clutch });
  if (p.hasShot('fade') && (type === 'mid' || type === 'push' || type === 'floater') && ev.contest > 0.25) {
    const fev = evaluateShot(p, opp, side, 'fade', { now, clutch: sim.clutch });
    if (fev.pct * fev.pts > ev.pct * ev.pts * 1.05) return { type: 'fade', ev: fev };
  }
  return { type, ev };
}

/** Should this handler post his man up? Bigs (or strong post players) 6-16 ft out with an edge, now and then. */
function wantsPost(sim: GameSim, p: Player): boolean {
  if (!(p.pos === 'C' || p.pos === 'PF' || p.sub.post >= 62) || !canPost(sim, p)) return false;
  const d = dist(p.p, sim.rim(p.team));
  if (d < 6 || d > 16) return false;
  const def = postDefender(sim, p);
  if (!def) return false;
  const gap = postGap(p, def);
  if (gap < -4) return false;
  return sim.rng.chance(clamp01(0.12 + gap * 0.02));
}

/** Post mode: back down toward the rim, then let go and score out of the window; kick out of a double team. */
function postAI(sim: GameSim, p: Player) {
  const side = sim.side(p.team), rim = sim.rim(p.team), d = dist(p.p, rim);
  const toRim = norm(sub(rim, p.p));
  const lat = { x: -toRim.y, y: toRim.x };
  // let go -> shoot out of the window (hook mostly: stick sideways; layup when deep)
  if (!p.post) {
    // Dreamer: off the hook fake, step through if his man bit, otherwise the hook
    if (p.aiFakeFollow) {
      p.aiFakeFollow = false; p.aiMode = 'none';
      const def = sim.players.find((q) => q.id === p.postDefId);
      const bit = !!def && (def.z > 0.3 || sim.time - def.lastJumpAt < 0.8);
      sim.startShot(p, selectShotType(p, side, bit ? toRim : lat, sim.time));
      return;
    }
    if (sim.time < p.postWindowUntil) {
      const stick = d <= 5 ? v() : sim.rng.chance(0.75) ? lat : v();
      sim.startShot(p, selectShotType(p, side, stick, sim.time));
      p.aiMode = 'none';
      return;
    }
    if (sim.time - p.postBumpedBackAt < POST.BACK_STUN + 0.3 && sim.time < p.aiModeUntil) { postIntent(p, true, toRim); return; }
    if (sim.time - p.postWindowUntil < 0.3) { p.aiMode = 'none'; return; } // the window just closed unused
    if (!canPost(sim, p) || sim.time > p.aiModeUntil) { p.aiMode = 'none'; return; }
    postIntent(p, true, toRim); // (re)start the post
    return;
  }
  // a second defender collapsing on him: kick it out
  const def = p.post.defId;
  const doubled = sim.opp(p.team).some((o) => o.id !== def && dist(o.p, p.p) < 4 && sim.time >= o.stunnedUntil);
  if (doubled) {
    let best: Player | null = null, bv = -1;
    for (const m of sim.mates(p)) { const val = sim.openness(m) - laneRisk(sim, p, m); if (val > bv) { bv = val; best = m; } }
    if (best && bv > 0.1) { sim.pass(p, best); p.aiMode = 'none'; return; }
  }
  const locked = !!def && sim.players.some((q) => q.id === def && sim.time < q.postLockUntil);
  const release = d <= 7 || sim.time > p.aiModeUntil || (locked && sim.time - p.post.since > 1.2) || p.post.mode === 'weaker' && sim.time - p.post.since > 1.5;
  // Dreamer: when he can't lock his man up, sell the hook instead of letting go (a locked defender can't bite)
  if (release && !locked && p.mods.pAdd('dreamer') > 0 && sim.rng.chance(0.4)) { sim.pumpFake(p, lat); p.aiFakeFollow = true; return; }
  postIntent(p, !release, toRim); // letting go opens the window; next think shoots
  if (release && p.post.mode === 'weaker') p.aiMode = 'none'; // no window when he's stronger: back to the offense
}

/**
 * Pass, or an alley-oop lob when he's cutting at the rim and the passer sees it (better lob passers more often, Lob
 * City owners much more).
 */
function throwTo(sim: GameSim, p: Player, m: Player) {
  const toRim = norm(sub(sim.rim(p.team), m.p));
  const chance = 0.06 + 0.2 * p.sub.lob / 99 + (p.mods.pAdd('lob') > 0 ? 0.2 : 0); // improvised (lob sets throw their own)
  if (sim.lobTarget(p, m) && dot(m.vel, toRim) > 6 && sim.rng.chance(chance)) sim.lobPass(p, m);
  else sim.pass(p, m);
}

/**
 * Bringing it up the floor: run it up (sprinting when the clock or the 8 seconds push), and against pressure read
 * the floor for an open man, break the defender down with a move and burst, or wait for the big's screen
 * (GameSim.pressHelp calls it).
 */
function bringUp(sim: GameSim, p: Player) {
  const side = sim.side(p.team);
  const nd = sim.nearestDefender(p);
  const laneY = nd.d ? clamp(-Math.sign(nd.d.p.y - p.p.y || 1) * 8, -12, 12) : 0;
  const dest = hc(side, 30, laneY);
  const toDest = norm(sub(dest, p.p));
  const { pressured, trapped } = sim.pressured(p);
  // broke it: burst into the frontcourt
  if (p.aiMode === 'beatPress' && sim.time < p.aiModeUntil) {
    sim.steer(p, dest, true);
    if (p.state !== 'dribbleMove') sim.startBurst(p);
    return;
  }
  if (p.aiMode === 'beatPress' || p.aiMode === 'drive' || p.aiMode === 'post') p.aiMode = 'none';
  if ((pressured || trapped) && sim.time >= p.aiNextThink) {
    p.aiNextThink = sim.time + 0.2 + sim.rng.next() * 0.15;
    // read the floor: whoever the press left open (ahead of the ball preferred)
    let best: Player | null = null, bv = -1;
    for (const m of sim.mates(p)) {
      if (m.state === 'fallen' || m.state === 'screen') continue;
      const open = sim.openness(m), risk = laneRisk(sim, p, m);
      if (open < 0.45 || risk > 0.35) continue;
      const val = open - risk + (dot(sub(m.p, p.p), toDest) > 0 ? 0.25 : 0);
      if (val > bv) { bv = val; best = m; }
    }
    if (best && (trapped || bv > 0.55) && (!best.isUser || sim.rng.chance(passFactor(userTrust(sim))))) { sim.pass(p, best); return; }
    // break him down: a move across, away from his side, then burst up court
    if (pressured && !p.deadDribble && p.pressedSince > 0 && sim.time - p.pressedSince > 0.35 && sim.rng.chance(0.22 * p.sub.ankleBreak / 70)) {
      const pr = { x: -toDest.y, y: toDest.x };
      const lat = nd.d ? dot(sub(nd.d.p, p.p), pr) : 0;
      sim.dribbleMove(p, scale(pr, lat > 0 ? -1 : 1));
      p.aiMode = 'beatPress'; p.aiModeUntil = sim.time + 1.4;
      return;
    }
  }
  // otherwise get it up the floor (a screen is on its way after 1.2 s of pressure)
  sim.steer(p, dest, sim.shotClock < 20 || sim.backcourtT > 3 || pressured);
}

/**
 * Round 48: is the way to the rim open? No defender ahead of him on his line to the rim or alongside it (within ~9 ft
 * sideways), the ones trailing behind don't count.
 */
/** Dev / stats switch for the round 48 open-court finish. */
export const OPEN_COURT = { on: true, runs: 0, shots: 0, startD: [] as number[], half: 0 };
export function clearPath(sim: GameSim, p: Player): boolean {
  const rim = sim.rim(p.team), toRim = norm(sub(rim, p.p)), d = dist(p.p, rim);
  for (const o of sim.opp(p.team)) {
    if (o.state === 'fallen') continue;
    const rel = sub(o.p, p.p), along = dot(rel, toRim), lat = Math.abs(rel.x * toRim.y - rel.y * toRim.x);
    if (along > -1.5 && along < d + 3 && lat < 9) return false;
  }
  return true;
}
