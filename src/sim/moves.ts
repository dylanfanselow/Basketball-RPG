import { MOVES, MoveDef } from './data';
import { Player } from './player';
import { Vec, dot, cross, len, norm, sub, scale, add, perp, v } from './math';

export type StickDir = 'toward' | 'back' | 'cross' | 'same' | 'neutral';

/** Which side of the player-to-hoop line a vector points to: +1 / -1 (0 if along the line). */
export const sideOf = (toRim: Vec, d: Vec) => Math.sign(cross(toRim, d));

/**
 * Stick classification relative to the player's line to the hoop: toward / back along it, or
 * lateral across it. Lateral is 'cross' when it opposes the way you're moving across that line
 * (a change of direction), otherwise 'same'.
 */
export function classifyStick(stick: Vec, toRim: Vec, vel: Vec = { x: 0, y: 0 }): StickDir {
  const l = len(stick);
  if (l < 0.3) return 'neutral';
  const t = dot(stick, toRim) / l;
  if (t > 0.6) return 'toward';
  if (t < -0.6) return 'back';
  const latVel = cross(toRim, vel);
  if (Math.abs(latVel) > 3 && Math.sign(cross(toRim, stick)) !== Math.sign(latVel)) return 'cross';
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

/** The four stick directions shown on the HUD stick: toward the hoop, away, and across the line either side. */
export function availableMoves(p: Player, toRim: Vec, now: number, defDist: number): { dir: Vec; id: string; chain: boolean }[] {
  const pr = perp(toRim);
  const dirs: Vec[] = [toRim, scale(toRim, -1), pr, scale(pr, -1)];
  // mid-move, show what the next press chains into (it gets buffered and fires as this move ends)
  const saved = p.lastMove;
  if (p.state === 'dribbleMove' && p.move) p.lastMove = { id: p.move.id, endAt: now, dir: p.move.dir };
  const out = dirs.map((d) => {
    const id = resolveMove(p, d, toRim, now, defDist);
    return { dir: d, id, chain: !!MOVES[id]?.chainFrom };
  });
  p.lastMove = saved;
  return out;
}

/**
 * World-space direction a move travels. The stick only chooses the move and the side; the direction
 * itself is canonical relative to the hoop, so moves always look and travel the same way.
 */
export function moveDirection(id: string, p: Player, stick: Vec, toRim: Vec, defPos: Vec | null): Vec {
  const m = MOVES[id];
  const pr = perp(toRim);
  const stickSide = len(stick) > 0.3 ? sideOf(toRim, stick) : 0;
  const side = stickSide || sideOf(toRim, p.vel) || sideOf(toRim, p.face) || 1;
  switch (m.burstDir) {
    case 'none': return v();
    case 'reverseLast': {
      const last = p.lastMove?.dir ?? scale(pr, side);
      return norm(add(scale(toRim, 0.45), scale(pr, -(sideOf(toRim, last) || side))));
    }
    case 'aroundDefender': {
      if (!defPos) return toRim;
      const s2 = cross(toRim, sub(defPos, p.p)) > 0 ? -1 : 1;
      return norm(add(toRim, scale(pr, s2 * 0.9)));
    }
  }
  switch (m.dir) {
    case 'toward': case 'neutral': return toRim;
    case 'back': return scale(toRim, -1);
    case 'cross': return norm(add(scale(pr, side), scale(toRim, 0.25)));     // across the line, a little downhill
    case 'same': return norm(add(scale(pr, side), scale(toRim, id === 'lateral' ? 0.15 : 0.1)));
    default: return norm(add(scale(pr, side), scale(toRim, 0.25)));
  }
}
