import type { GameSim } from '../game';
import { Player } from '../player';
import { POST, postGap } from '../post';
import { scorerStyle, ATT } from '../attention';
import { tryActivateUlt } from '../ultimates';
import { RESTRICTED_R, inFrontcourt } from '../court';
import { add, dist, norm, scale, sub, lerpV, clamp, dot, len } from '../math';

export function thinkDefense(sim: GameSim, d: Player, dt: number) {
  if (d.state === 'charge' || d.state === 'jump') return;
  const off = sim.offense();
  let man = off.find((o) => o.id === d.guarding) ?? null;
  if (!man) { man = off.slice().sort((a, b) => dist(a.p, d.p) - dist(b.p, d.p))[0] ?? null; if (man) d.guarding = man.id; }
  if (!man) return;
  const rim = sim.rim(sim.possession);
  const h = sim.holder();
  const ballP = sim.ball.p;
  let target;
  let urgent = false;

  // transition defense: get back and protect the rim before matching up
  if (sim.inTransition(sim.possession) && dist(d.p, rim) > dist(ballP, rim) - 3) {
    const depth = Math.max(4, Math.min(16, dist(ballP, rim) * 0.4));
    sim.steer(d, add(rim, scale(norm(sub(ballP, rim)), depth)), true);
    return;
  }

  const pressing = sim.pressing[d.team];
  const hBack = !!h && sim.fullCourt && !inFrontcourt(sim.side(h.team), h.p);
  // press trap: the closest other defender leaves his man and doubles the ball near a sideline or half court
  if (pressing && hBack && h && man !== h && (Math.abs(h.p.y - 25) > 14 || Math.abs(h.p.x - 47) < 10)) {
    const others = sim.defense().filter((o) => o.guarding !== h.id);
    const trapper = others.sort((a, b) => dist(a.p, h.p) - dist(b.p, h.p))[0];
    if (trapper === d && dist(d.p, h.p) < 15) {
      sim.steer(d, add(h.p, scale(norm(sub({ x: 47, y: 25 }, h.p)), 2.6)), true); // cut off the escape toward half court
      return;
    }
  }
  // round 51: a CPU star in full rhythm with Chase-Down runs down a break from behind (once a game)
  if (h && h.team !== d.team && d.rhythm >= 100 && !sim.ultsUsed[d.id] && sim.isAI(d) && sim.inTransition(h.team)) {
    const u = sim.ultOf(d), hr = dist(h.p, rim);
    if (u?.id === 'chaseDown' && hr < 30 && dist(d.p, rim) > hr + 2 && tryActivateUlt(sim, d)) return;
  }
  // round 47: double / triple team on a hot scorer (helpers come after a short read; the rest rotate)
  const load = sim.isAI(d) && ATT.load ? sim.loadFor() : null;
  const tp = sim.trapTarget();
  const trap = tp && tp.team !== d.team && ATT.trap ? sim.trapFor(tp) : null;
  if (trap && tp && sim.isAI(d) && sim.time >= trap.start) {
    const h = tp;
    const toRim = norm(sub(rim, h.p)), pr = { x: -toRim.y, y: toRim.x };
    const hi = trap.helpers.indexOf(d.id);
    if (hi >= 0) {
      // round 48: help by how he scores (not a blob that mirrors him, one move would beat them all)
      const first = sim.players.find((q) => q.id === trap.helpers[0]);
      const s0 = first && dot(sub(first.p, h.p), pr) >= 0 ? 1 : -1;
      const sideSign = hi === 0 ? s0 : -s0;
      const spot = helpSpot(trap.scheme, hi, h, rim, sideSign);
      sim.steer(d, spot.at, true);
      if (spot.tight && sim.time - trap.start > 0.4 && dist(d.p, h.p) < 3.8 && sim.rng.chance(dt * 0.7 * (d.sub.steal / 70))) sim.swipe(d);
      return;
    }
    const rot = trap.rotate.get(d.id);
    const left = rot ? sim.players.find((q) => q.id === rot) : undefined;
    if (left) {
      // split the difference between his own man and the man left open, a step toward the ball (ready to close out)
      const mid = lerpV(man.p, left.p, 0.5);
      sim.steer(d, add(mid, scale(norm(sub(ballP, mid)), 2.5)), true);
      return;
    }
  }
  // post double team (round 44): the rotated helper leaves his man, comes to the ball side of the post and digs at it
  if (h?.post && h.post.helpId === d.id && sim.time >= h.post.helpAt && sim.isAI(d)) {
    const toRim = norm(sub(rim, h.p)), pr = { x: -toRim.y, y: toRim.x };
    const sideSign = dot(sub(d.p, h.p), pr) >= 0 ? 1 : -1;
    sim.steer(d, add(h.p, add(scale(pr, 2.4 * sideSign), scale(toRim, 0.6))), true);
    if (h.post.helpCalled && sim.time - h.post.helpArrivedAt > POST.HELP_REACT && dist(d.p, h.p) < 3.6 && sim.rng.chance(dt * 0.7 * (d.sub.steal / 70))) sim.swipe(d);
    return;
  }
  // round 49: ball-screen coverage for a handler the defense cares about (you, or a hot handler)
  const sc = h && h.team !== d.team && sim.isAI(d) && inFrontcourt(sim.side(h.team), h.p) ? sim.screenFor(h) : null;
  if (sc && h) {
    const scr = sim.players.find((q) => q.id === sc.screenerId);
    const toRimH = norm(sub(rim, h.p));
    if (scr && man === scr) {
      if (sc.kind === 'blitz' && sim.time - sc.at < 1.6) {
        // the big jumps out and traps him high, on the side the screen comes from
        const side = dot(sub(scr.p, h.p), { x: -toRimH.y, y: toRimH.x }) >= 0 ? 1 : -1;
        sim.steer(d, helpSpot('chase', 0, h, rim, side).at, true);
        if (dist(d.p, h.p) < 3.8 && sim.rng.chance(dt * 0.6 * (d.sub.steal / 70))) sim.swipe(d);
        return;
      }
      if (sc.kind === 'under') { sim.steer(d, add(rim, scale(norm(sub(h.p, rim)), 9)), true); return; } // drop deep
    }
    if (scr && sc.kind === 'blitz' && sim.time - sc.at < 2.2 && man !== h && man !== scr) {
      // the low man tags the roller while the big is up on the ball
      const scrDef = sim.defenderOf(scr), onBall = sim.defenderOf(h);
      const tagger = sim.opp(h.team).filter((o) => o !== scrDef && o !== onBall && sim.isAI(o)).sort((a, b) => dist(a.p, scr.p) - dist(b.p, scr.p))[0];
      if (tagger === d) { sim.steer(d, lerpV(scr.p, rim, 0.35), true); return; }
    }
  }
  if (man === h && hBack && !pressing) {
    // no press: give ground in the backcourt and pick him up around half court
    const gap = clamp(4 + 0.35 * Math.abs(man.p.x - 47), 4, 12);
    target = add(man.p, scale(norm(sub(rim, man.p)), gap));
  } else if (man === h) {
    // round 48: a shooter the defense is packing gets crowded (no air space for the catch-and-fire)
    const packed = sim.tierOf(man) >= 2 && sim.coverageOf(man) === 'chase';
    let gap = 3.4 - (d.sub.perimD / 99) * 0.9 - (packed ? 1.1 : 0) - (sim.effort[d.team] ? 0.3 : 0);
    // round 61: a 1v1 CPU guards by his level: where he last saw his man (reaction lag, Hard reads ahead), a scouted
    // cushion (Hard), a wandering one (Easy), and Hard steps into the cone during the windup
    const L = sim.cpuCfg(d);
    let mp = man.p;
    if (L) {
      if (!d.aiSeen || sim.time - d.aiSeen.at >= L.lag) d.aiSeen = { p: { ...man.p }, vel: { ...man.vel }, at: sim.time };
      mp = add(d.aiSeen.p, scale(d.aiSeen.vel, L.lead));
      if (L.scout) gap += (man.sub.three >= 75 ? -0.5 : man.sub.three < 55 ? 1.2 : 0) + (man.sprintSpeed > d.sprintSpeed + 0.5 ? 0.5 : 0);
      if (L.wobble) gap += L.wobble * Math.sin(sim.time * 0.9 + d.id.length);
      // a much stronger post player inside the post range: play him off, out of reach of the post-up
      if (L.postAware && !man.post && postGap(man, d) >= POST.NOTICE && dist(man.p, rim) < POST.RANGE - 1) gap = Math.max(gap, POST.ENGAGE + 0.4);
      if (man.state === 'shoot' && L.closeGap) { gap = Math.min(gap, L.closeGap); mp = man.p; }
      gap = Math.max(1.2, gap);
    }
    target = add(mp, scale(norm(sub(rim, mp)), gap));
    if (sc?.kind === 'under') target = add(man.p, scale(norm(sub(rim, man.p)), gap + 3.5)); // under the screen: sag, dare the jumper
    // round 49: shade the side a human likes to go (up to 1 ft), so his favourite drive is the harder one
    if (!sim.isAI(man)) { const fav = sim.favoriteSide(man) * (L?.shade ?? 1), tr = norm(sub(rim, man.p)); if (fav) target = add(target, scale({ x: -tr.y, y: tr.x }, fav)); }
    urgent = true;
  } else {
    const dBall = dist(man.p, ballP);
    const gap = clamp(2.4 + dBall * 0.17, 2.4, 9);
    const dir = norm(lerpV(norm(sub(rim, man.p)), norm(sub(ballP, man.p)), 0.35));
    target = add(man.p, scale(dir, gap));
    urgent = dist(d.p, target) > 5;
    // drop coverage: big guarding the screener sinks toward the rim
    if (h && !sim.switchAll && (d.role === '5' || d.role === '4') && man.state === 'screen' && dist(man.p, h.p) < 8) {
      target = add(rim, scale(norm(sub(h.p, rim)), 9));
    }
    // round 47, keyed in: deny the catch to a hot scorer who lives off the catch (shooters, post scorers): stand in the
    // passing lane a step off him (front the post when he's down low)
    const st = sim.tierOf(man) >= 1 ? scorerStyle(man) : null;
    if (ATT.deny && h && st && st !== 'creator' && h.team === man.team) {
      // half in the lane, half toward the rim, so a back cut isn't a free layup
      const low = st === 'post' && dist(man.p, rim) < 13;
      const lane = norm(lerpV(norm(sub(rim, man.p)), norm(sub(ballP, man.p)), low ? 0.8 : 0.6));
      target = add(man.p, scale(lane, low ? 1.3 : 1.8));
      urgent = true;
    } else if (load && load.helpers.includes(d.id) && load.hot !== man) {
      // loaded up: this defender is one of the hot scorer's doublers, sit where the scheme wants him before the catch:
      // under a shooter (between him and the rim), in the drive lane of a rim scorer, or in the gap otherwise
      const hr = norm(sub(rim, load.hot.p)), hd = dist(load.hot.p, rim);
      if (load.scheme === 'chase' && load.helpers[0] === d.id) target = add(load.hot.p, scale(hr, Math.min(5, hd * 0.4)));
      else if (load.scheme === 'wall') target = add(load.hot.p, scale(hr, hd * (load.helpers[0] === d.id ? 0.5 : 0.75)));
      else target = lerpV(target, load.hot.p, 0.25);
    } else if (ATT.shade) {
      // help shading: sag toward a hot scorer near you (not your man) so you're in his cone on the drive
      for (const o of sim.offense()) {
        const t = o === man ? 0 : sim.tierOf(o);
        if (!t || !inFrontcourt(sim.side(o.team), o.p) || dist(o.p, target) > 14) continue;
        target = add(target, scale(norm(sub(o.p, target)), t >= 2 ? 2 : 1.2));
        break;
      }
    }
    // help on a beaten drive
    if (h) {
      const hd = dist(h.p, rim);
      const onBall = sim.defenderOf(h);
      const beaten = !onBall || dist(onBall.p, rim) > hd + 0.5 || sim.time < onBall.staggerUntil || sim.time < onBall.screenedUntil || onBall.state === 'fallen';
      if (hd < 17 && beaten && isClosestHelper(sim, d, h, onBall)) {
        target = add(h.p, scale(norm(sub(rim, h.p)), 3.2));
        urgent = true;
        const toRim = norm(sub(rim, h.p));
        if (sim.isAI(d) && dot(h.vel, toRim) > 8 && dist(d.p, rim) > RESTRICTED_R + 0.5 && dist(d.p, h.p) < 7 && sim.rng.chance(dt * 1.2 * (d.sub.charge / 70))) {
          sim.takeCharge(d); return;
        }
      }
    }
  }
  sim.steer(d, target, urgent);
  // round 50: a defender with Pick-Up Pressure reaches more against a live dribble (even a miss can kill it)
  const pressure = man === h && h && d.mods.pAdd('killDribble') > 0 && sim.liveDribble(h) ? 1.6 : 1;
  // round 61: a 1v1 CPU reaches by his level (Hard picks his moment: a move's sell or a post)
  const LR = man === h && h ? sim.cpuCfg(d) : null;
  const reach = LR && h ? (h.state === 'dribbleMove' || h.post ? LR.reach[0] : LR.reach[1]) : 1;
  if (man === h && sim.isAI(d) && dist(d.p, h.p) < 4 && sim.rng.chance(dt * 0.12 * (d.sub.steal / 70) * (sim.effort[d.team] ? 1.25 : 1) * pressure * reach)) sim.swipe(d);
  void len;
}

function isClosestHelper(sim: GameSim, d: Player, h: Player, onBall: Player | null): boolean {
  let best: Player | null = null, bd = 1e9;
  for (const o of sim.defense()) {
    if (o === onBall || o.isUser) continue;
    const dd = dist(o.p, h.p);
    if (dd < bd) { bd = dd; best = o; }
  }
  return best === d;
}

/**
 * Round 48: where a double / triple helper stands, by coverage scheme (hi = 0 first helper, 1 second):
 *  - wall (rim scorer): on his line to the rim, deep, about halfway (at least 7 ft in front) and at the edge of the
 *    restricted area. A crossover or burst beats his own man, not the wall.
 *  - chase (shooter): one "over", tight on his high side (cutting off where his burst is heading), and one "under",
 *    ~5 ft between him and the rim.
 *  - post: the round 44 dig from the top, and one at the rim on the baseline side.
 *  - mixed: one high and tight, one deep at the restricted area.
 */
export function helpSpot(scheme: string, hi: number, h: Player, rim: { x: number; y: number }, sideSign: number): { at: { x: number; y: number }; tight: boolean } {
  const toRim = norm(sub(rim, h.p)), pr = { x: -toRim.y, y: toRim.x }, D = dist(h.p, rim);
  // deep spots along his line to the rim (measured from him)
  const deep = (fromHim: number, lat: number) => add(h.p, add(scale(toRim, clamp(fromHim, 1.5, Math.max(1.5, D - 2.5))), scale(pr, lat)));
  // tight spots cut off a dribble move: aim ahead of where the burst is going, not where he is
  const lead = h.state === 'dribbleMove' && h.move ? add(h.p, scale(h.move.dir, 3.5)) : h.p;
  const over = () => add(lead, add(scale(pr, 1.9 * sideSign), scale(toRim, 1.2)));
  const rimEdge = D - 4.5;
  switch (scheme) {
    case 'wall': return { at: hi === 0 ? deep(Math.max(7, D * 0.45), 1.5 * sideSign) : deep(rimEdge, -1.5 * sideSign), tight: false };
    case 'chase': return hi === 0 ? { at: over(), tight: true } : { at: deep(5, 0), tight: false };
    case 'post': return hi === 0 ? { at: add(h.p, add(scale(pr, 2.4 * sideSign), scale(toRim, 0.6))), tight: true } : { at: deep(D - 3, -1.2 * sideSign), tight: false };
    default: return hi === 0 ? { at: over(), tight: true } : { at: deep(rimEdge, 0), tight: false };
  }
}
