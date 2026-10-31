import type { GameSim } from '../game';
import { Player } from '../player';
import { RESTRICTED_R } from '../court';
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

  if (man === h) {
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
