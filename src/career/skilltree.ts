import { NODES } from '../sim/data';
import type { CareerState } from './career';

export type UnlockCheck = { ok: true } | { ok: false; reason: string };

/** Skyrim-style: a node is reachable if it's a root or ANY of its prereqs is owned. */
export function canUnlock(c: CareerState, id: string): UnlockCheck {
  const n = NODES[id];
  if (!n) return { ok: false, reason: 'Unknown perk' };
  if (c.nodes.includes(id)) return { ok: false, reason: 'Already unlocked' };
  if (c.perkPoints < n.cost) return { ok: false, reason: `Needs ${n.cost} perk point${n.cost > 1 ? 's' : ''}` };
  if (n.prereqs.length && !n.prereqs.some((p) => c.nodes.includes(p))) return { ok: false, reason: `Requires ${n.prereqs.map((p) => NODES[p]?.name).join(' or ')}` };
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
