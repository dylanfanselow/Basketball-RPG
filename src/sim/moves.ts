import { MOVES, MoveDef } from './data';
import { Player } from './player';
import { Vec, dot, cross, len, norm, sub, scale, add, perp, v } from './math';

export type StickDir = 'toward' | 'back' | 'cross' | 'same' | 'neutral';

/**
 * Screen-axis stick classification (side view: court y is up/down on screen).
 * Horizontal stick = toward/away from the hoop. Vertical stick = 'cross' when it opposes the way you're
 * dribbling up/down the screen (a change of direction), otherwise 'same'.
 */
export function classifyStick(stick: Vec, toRim: Vec, vel: Vec = { x: 0, y: 0 }): StickDir {
  const l = len(stick);
  if (l < 0.3) return 'neutral';
  if (Math.abs(stick.x) >= Math.abs(stick.y)) return stick.x * (toRim.x || 1) > 0 ? 'toward' : 'back';
  if (Math.abs(vel.y) > 3 && Math.sign(stick.y) !== Math.sign(vel.y)) return 'cross';
  return 'same';
}

/**
 * Pick the dribble move for B + stick. Chains (e.g. Crossover -> Behind-the-Back) take priority while
 * their window is open. Otherwise the best unlocked move for the stick direction is used,
 * falling back to the always-known basic move.
 */
export function resolveMove(p: Player, stick: Vec, toRim: Vec, now: number, defDist: number): string {
  const dir = classifyStick(stick, toRim, p.vel);
  const speed = len(p.vel);
  const chainMult = p.mods.pMult('chainWindow');
  const fits = (m: MoveDef) => (m.dir === dir || m.dir === 'any') && (!m.slow || speed < 4) && (!m.moving || speed >= 4);
  if (p.lastMove) {
    const since = now - p.lastMove.endAt;
    const chains = Object.entries(MOVES).filter(([id, m]) => m.chainFrom === p.lastMove!.id && since <= (m.chainWindow ?? 0.5) * chainMult && p.hasMove(id) && fits(m));
    chains.sort((a, b) => (a[1].dir === 'any' ? 1 : 0) - (b[1].dir === 'any' ? 1 : 0));
    if (chains.length) return chains[0][0];
  }
  const cands = Object.entries(MOVES).filter(([id, m]) => !m.chainFrom && !m.default && fits(m) && m.dir !== 'any' && p.hasMove(id) && (!m.needsClose || defDist < 4.5));
  if (cands.length) return cands[0][0];
  const def = Object.entries(MOVES).find(([, m]) => m.default && m.dir === dir);
  return def ? def[0] : 'hesi';
}

/** World-space burst direction for a move. */
export function moveDirection(id: string, p: Player, stick: Vec, toRim: Vec, defPos: Vec | null): Vec {
  const m = MOVES[id];
  const s = len(stick) > 0.3 ? norm(stick) : p.face;
  switch (m.burstDir) {
    case 'none': return v();
    case 'reverseLast': {
      const last = p.lastMove?.dir ?? s;
      const lat = cross(toRim, last);
      // mirror the lateral component, keep going downhill
      return norm(add(scale(toRim, 0.55), scale(perp(toRim), lat > 0 ? -1 : 1)));
    }
    case 'aroundDefender': {
      if (!defPos) return toRim;
      const side = cross(toRim, sub(defPos, p.p)) > 0 ? -1 : 1;
      return norm(add(toRim, scale(perp(toRim), side * 0.9)));
    }
    case 'crossKeep': {
      // change direction up/down the screen but keep the forward/back momentum
      const fwd = len(p.vel) > 1 ? p.vel.x / len(p.vel) : 0;
      return norm(v(fwd * 0.55, Math.sign(s.y || 1)));
    }
    default: return s;
  }
}
