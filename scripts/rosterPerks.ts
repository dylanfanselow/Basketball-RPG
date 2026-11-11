/**
 * Round 77: bring the real rosters' perks up to date with the trees.
 *  1. Prerequisite closure: every perk a player owns gets its prereqs (Uncle Drew's needsTree = the whole tree).
 *  2. The perks nobody in the league owned get handed to the players they fit (FITS, by core ratings, position,
 *     height and archetype), rarest fit first, best fit first, within a perk-point budget by tier. GOAT skills are
 *     never handed out.
 * Pure: takes the parsed rosters.json and returns the updated copy plus a report. scripts/rosterPerks.test.ts runs it
 * (WRITE=1 writes the file).
 */
import { TREES, NODES } from '../src/sim/data';

export interface RosterPlayer { name: string; pos: string; heightFt: number; tier: number; archetype: string; core: Record<string, number>; perks: string[] }

/** Perk points a player of this tier ends up with at most (closure for owned perks / GOATs can go past it). */
export const BUDGET: Record<number, number> = { 5: 20, 4: 15, 3: 11, 2: 8, 1: 6 };

const guard = (p: RosterPlayer) => p.pos === 'PG' || p.pos === 'SG';
const wing = (p: RosterPlayer) => p.pos === 'SG' || p.pos === 'SF';
const big = (p: RosterPlayer) => p.pos === 'PF' || p.pos === 'C';
const is = (p: RosterPlayer, ...a: string[]) => a.includes(p.archetype);

/** How well a perk fits a player (0 = not at all; higher = first pick). */
export const FITS: Record<string, (p: RosterPlayer, c: Record<string, number>) => number> = {
  // passing
  pa_magic: (p, c) => (c.playmaking >= 88 ? c.playmaking - 85 : 0),
  // driving
  dv_slither: (p, c) => (!big(p) && c.mobility >= 82 && c.finishing >= 78 ? c.mobility - 80 : 0),
  dv_drive: (p, c) => (c.finishing >= 82 && (c.strength >= 72 || c.mobility >= 82) && is(p, 'slasher', 'pointforward', 'shotcreator', 'playmaker') ? c.finishing - 80 : 0),
  dv_kick: (p, c) => (c.playmaking >= 80 && c.finishing >= 76 ? c.playmaking - 78 : 0),
  dv_windmill: (p, c) => (c.finishing >= 88 && c.mobility >= 78 ? c.finishing - 86 : 0),
  // screens
  sc_slip: (p, c) => (is(p, 'rimrunner', 'postbig') ? 2 + (c.finishing - 60) / 10 : 0),
  sc_roller: (p, c) => (is(p, 'rimrunner') && c.mobility >= 60 ? 2 + (c.mobility - 60) / 10 : 0),
  sc_popper: (p, c) => (is(p, 'stretchbig') || (big(p) && c.shooting >= 78) ? 2 + (c.shooting - 70) / 10 : 0),
  sc_rescreen: (p, c) => (big(p) && c.strength >= 80 ? 1 + (c.strength - 80) / 10 : 0),
  // perimeter
  pd_charge: (p, c) => (is(p, 'twoway', 'wing3d') && c.strength >= 66 ? 1 + (c.strength - 66) / 10 : 0),
  pd_lanes: (p, c) => (is(p, 'twoway', 'wing3d', 'playmaker') && c.mobility >= 82 ? 1 + (c.mobility - 82) / 5 : 0),
  pd_iq: (p, c) => (is(p, 'twoway') && p.tier >= 3 && c.playmaking >= 68 ? 1 + (c.playmaking - 68) / 10 : 0),
  pd_navigate: (p, c) => (is(p, 'twoway', 'wing3d') && c.mobility >= 78 ? 1.5 + (c.mobility - 78) / 10 : 0),
  pd_offnight: (p, c) => (is(p, 'twoway') && p.tier >= 3 ? p.tier : 0),
  pd_pickup: (p, c) => (is(p, 'twoway') && c.mobility >= 84 ? 1 + (c.mobility - 84) / 5 : 0),
  // post (interior)
  in_tip: (p, c) => (big(p) && c.strength >= 80 ? 1 + (c.strength - 80) / 10 : 0),
  in_gimme: (p, c) => (p.pos === 'C' && p.heightFt >= 6.9 && c.strength >= 75 && c.mobility >= 60 ? 2 + (p.heightFt - 6.9) * 10 : 0),
  in_fingerwag: (p, c) => (p.pos === 'C' && p.heightFt >= 6.9 && is(p, 'rimrunner', 'unicorn', 'postbig') && c.strength >= 78 ? 2 + (p.heightFt - 6.9) * 10 : 0),
  in_foresight: (p, c) => (p.pos === 'C' && p.heightFt >= 6.95 && p.tier >= 3 ? 1 + p.tier : 0),
  // handles
  dr_dbl: (p, c) => (guard(p) && c.mobility >= 82 && c.playmaking >= 74 ? c.mobility - 80 : 0),
  dr_shammgod: (p, c) => (p.pos === 'PG' && c.mobility >= 86 && c.playmaking >= 82 ? c.mobility - 84 : 0),
  dr_snatch: (p, c) => (guard(p) && c.shooting >= 85 && c.mobility >= 80 ? c.shooting - 83 : 0),
  dr_hesiburst: (p, c) => (!big(p) && c.mobility >= 84 ? c.mobility - 82 : 0),
  dr_pullback: (p, c) => (!big(p) && c.mobility >= 82 && c.shooting >= 84 ? c.shooting - 82 : 0),
  dr_chain: (p, c) => (p.tier >= 4 && guard(p) && c.mobility >= 85 && c.playmaking >= 80 ? c.mobility - 83 : 0),
  dr_breaker: (p, c) => (p.tier >= 4 && !big(p) && c.mobility >= 88 ? c.mobility - 86 : 0),
  // finishing
  fi_jelly: (p, c) => (c.finishing >= 91 && c.mobility >= 85 ? c.finishing - 89 : 0),
  fi_andone: (p, c) => (c.finishing >= 86 && c.strength >= 72 ? c.finishing - 84 : 0),
  fi_stepthru: (p, c) => (c.finishing >= 82 && c.playmaking >= 72 && is(p, 'shotcreator', 'slasher', 'pointforward', 'playmaker', 'postbig', 'playmakerbig') ? c.finishing - 80 : 0),
  // shooting
  sh_chef: (p, c) => (c.shooting >= 95 ? c.shooting - 93 : 0),
  sh_contact: (p, c) => (c.shooting >= 85 && c.strength >= 70 && is(p, 'shotcreator', 'pointforward', 'playmaker', 'twoway') ? c.shooting - 83 : 0),
  sh_clutch2: (p, c) => (c.shooting >= 88 && p.tier >= 4 ? c.shooting - 86 : 0),
  sh_mamba: (p, c) => (c.shooting >= 90 && p.tier >= 4 && is(p, 'shotcreator') ? c.shooting - 88 : 0),
};

/** Every prerequisite of these perks, recursively (needsTree = the rest of the tree), in place. */
export function close(perks: Set<string>): Set<string> {
  let grew = true;
  while (grew) {
    grew = false;
    for (const id of [...perks]) {
      const n = NODES[id];
      if (!n) continue;
      const reqs = n.needsTree ? TREES.find((t) => t.id === n.tree)!.nodes.map((m) => m.id).filter((m) => m !== id) : n.prereqs;
      for (const r of reqs) if (!perks.has(r)) { perks.add(r); grew = true; }
    }
  }
  return perks;
}
export const cost = (ids: Iterable<string>) => { let c = 0; for (const id of ids) c += NODES[id]?.cost ?? 0; return c; };
/** Perks in the order the trees list them (a stable, readable order in the file). */
const ORDER = TREES.flatMap((t) => t.nodes.map((n) => n.id));
const ordered = (s: Set<string>) => [...s].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));

export function updateRosters(rosters: any): { rosters: any; report: string[] } {
  const out = JSON.parse(JSON.stringify(rosters));
  const players: RosterPlayer[] = Object.values(out.teams as Record<string, RosterPlayer[]>).flat();
  const owned0 = new Set(players.flatMap((p) => p.perks));
  const goat = new Set(TREES.flatMap((t) => t.nodes.filter((n) => n.goat).map((n) => n.id)));
  const handout = Object.keys(FITS).filter((id) => !owned0.has(id) && !goat.has(id));
  let closed = 0;
  // 1. closure
  const sets = new Map<RosterPlayer, Set<string>>();
  for (const p of players) {
    const s = close(new Set(p.perks));
    closed += s.size - new Set(p.perks).size;
    sets.set(p, s);
  }
  // 2. hand out within the budget: the perks with the fewest fitting players go first (so a rare fit isn't crowded
  //    out by a common one), each to its candidates best fit first
  const cands = (id: string) => players.map((p) => ({ p, f: FITS[id](p, p.core) })).filter((x) => x.f > 0).sort((a, b) => b.f - a.f);
  for (const id of [...handout].sort((a, b) => cands(a).length - cands(b).length)) {
    for (const { p } of cands(id)) {
      const s = sets.get(p)!;
      if (s.has(id)) continue;
      const add = [...close(new Set([...s, id]))].filter((x) => !s.has(x));
      if (add.some((x) => goat.has(x))) continue;
      if (cost(s) + cost(add) > (BUDGET[p.tier] ?? 5)) continue;
      for (const x of add) s.add(x);
    }
  }
  // 3. a perk nobody could afford still goes to its best fit (every perk in the trees is owned by someone)
  for (const id of handout) {
    if (players.some((p) => sets.get(p)!.has(id))) continue;
    const best = players.map((p) => ({ p, f: FITS[id](p, p.core) })).filter((x) => x.f > 0).sort((a, b) => b.f - a.f || b.p.tier - a.p.tier)[0];
    if (best) close(sets.get(best.p)!.add(id));
  }
  for (const p of players) p.perks = ordered(sets.get(p)!);
  // report
  const report: string[] = [`prerequisites added: ${closed}`];
  for (const t of [5, 4, 3, 2, 1]) {
    const ps = players.filter((p) => p.tier === t);
    if (ps.length) report.push(`tier ${t}: ${ps.length} players, perk points avg ${(ps.reduce((a, p) => a + cost(p.perks), 0) / ps.length).toFixed(1)}, perks avg ${(ps.reduce((a, p) => a + p.perks.length, 0) / ps.length).toFixed(1)}`);
  }
  for (const id of handout) {
    const who = players.filter((p) => p.perks.includes(id)).map((p) => p.name);
    report.push(`${NODES[id].name} (${id}): ${who.length}${who.length ? ': ' + who.slice(0, 8).join(', ') + (who.length > 8 ? ', …' : '') : ''}`);
  }
  return { rosters: out, report };
}

/** rosters.json as written (1-space JSON; whole-number heights keep their ".0"). */
export const formatRosters = (r: any) => JSON.stringify(r, null, 1).replace(/("heightFt": )(\d+)(,)/g, '$1$2.0$3');
