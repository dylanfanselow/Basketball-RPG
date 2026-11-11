import { NODES, TREES } from '../sim/data';
import type { CareerState } from './career';

export type UnlockCheck = { ok: true } | { ok: false; reason: string };

/** Skyrim-style constellations: a node is reachable if it's a root or ALL of its prereqs are owned (round 64). */
export function canUnlock(c: CareerState, id: string): UnlockCheck {
  const n = NODES[id];
  if (!n) return { ok: false, reason: 'Unknown perk' };
  if (c.nodes.includes(id)) return { ok: false, reason: 'Already unlocked' };
  if (n.needsTree) {
    const tree = TREES.find((t) => t.id === n.tree)!;
    if (tree.nodes.some((m) => m.id !== id && !c.nodes.includes(m.id))) return { ok: false, reason: `Requires every ${tree.name} perk` };
  }
  if (c.perkPoints < n.cost) return { ok: false, reason: `Needs ${n.cost} perk point${n.cost > 1 ? 's' : ''}` };
  const missing = n.prereqs.filter((p) => !c.nodes.includes(p));
  if (missing.length) return { ok: false, reason: `Requires ${missing.map((p) => NODES[p]?.name).join(' and ')}` };
  if (n.posLock && !n.posLock.includes(c.pos) && !c.traits.includes('unicorn')) return { ok: false, reason: `${n.posLock.join('/')} only` };
  if (n.req) for (const [k, v] of Object.entries(n.req)) if ((c.core as any)[k] < (v as number)) return { ok: false, reason: `Requires ${k} ${v}` };
  return { ok: true };
}

export function unlock(c: CareerState, id: string): boolean {
  const chk = canUnlock(c, id);
  if (!chk.ok) return false;
  c.perkPoints -= NODES[id].cost;
  c.nodes.push(id);
  return true;
}

export function respec(c: CareerState) {
  for (const id of c.nodes) c.perkPoints += NODES[id]?.cost ?? 0;
  c.nodes = [];
}
