import type { GameSim } from '../game';
import { Player } from '../player';
import { POST } from '../post';
import { scorerStyle, ATT } from '../attention';
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
  // round 47: double / triple team on a hot scorer (helpers come after a short read; the rest rotate)
  const load = sim.isAI(d) && ATT.load ? sim.loadFor() : null;
  const tp = sim.trapTarget();
  const trap = tp && tp.team !== d.team && ATT.trap ? sim.trapFor(tp) : null;
  if (trap && tp && sim.isAI(d) && sim.time >= trap.start) {
    const h = tp;
    const toRim = norm(sub(rim, h.p)), pr = { x: -toRim.y, y: toRim.x };
    const hi = trap.helpers.indexOf(d.id);
    if (hi >= 0) {
      // the first helper comes from the side he's on, the second takes the other side: with the on-ball man in front
      // they make a wall between him and the rim (inside his shot cone, so every one of them contests)
      const first = sim.players.find((q) => q.id === trap.helpers[0]);
      const s0 = first && dot(sub(first.p, h.p), pr) >= 0 ? 1 : -1;
      const sideSign = hi === 0 ? s0 : -s0;
      sim.steer(d, add(h.p, add(scale(pr, 1.7 * sideSign), scale(toRim, 2.1))), true);
      if (sim.time - trap.start > 0.4 && dist(d.p, h.p) < 3.8 && sim.rng.chance(dt * 0.7 * (d.sub.steal / 70))) sim.swipe(d);
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
  if (man === h && hBack && !pressing) {
    // no press: give ground in the backcourt and pick him up around half court
    const gap = clamp(4 + 0.35 * Math.abs(man.p.x - 47), 4, 12);
    target = add(man.p, scale(norm(sub(rim, man.p)), gap));
  } else if (man === h) {
    const gap = 3.4 - (d.sub.perimD / 99) * 0.9;
    target = add(man.p, scale(norm(sub(rim, man.p)), gap));
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
      // loaded up: this defender is one of the hot scorer's doublers — sit in the gap toward him, ready to jump the catch
      target = lerpV(target, load.hot.p, 0.25);
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
  if (man === h && sim.isAI(d) && dist(d.p, h.p) < 4 && sim.rng.chance(dt * 0.12 * (d.sub.steal / 70))) sim.swipe(d);
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
