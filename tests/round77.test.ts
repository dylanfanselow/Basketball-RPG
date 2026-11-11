import { describe, it, expect } from 'vitest';
import rosters from '../src/data/rosters.json';
import { TREES, NODES } from '../src/sim/data';
import { makeGame } from './helpers';
import { emptyInput } from '../src/sim/game';

const players = Object.values((rosters as any).teams).flat() as { name: string; perks: string[] }[];

describe('round 77: rosters up to date with the trees', () => {
  it('every player owns every prerequisite of every perk he has (Uncle Drew: the whole tree)', () => {
    const gaps: string[] = [];
    for (const p of players) for (const id of p.perks) {
      const n = NODES[id];
      expect(n, `${p.name}: unknown perk ${id}`).toBeDefined();
      const reqs = n.needsTree ? TREES.find((t) => t.id === n.tree)!.nodes.map((m) => m.id).filter((m) => m !== id) : n.prereqs;
      for (const r of reqs) if (!p.perks.includes(r)) gaps.push(`${p.name}: ${id} without ${r}`);
    }
    expect(gaps).toEqual([]);
  });
  it('every perk in the trees has at least one owner in the league', () => {
    const owned = new Set(players.flatMap((p) => p.perks));
    expect(Object.keys(NODES).filter((id) => !owned.has(id))).toEqual([]);
  });
});

describe('round 77: box score', () => {
  it('free throws and offensive rebounds are counted', () => {
    const g = makeGame({ seed: 3 });
    for (let t = 0; t < 30 && !(g.live && g.holder()); t += 1 / 30) g.update(1 / 30, emptyInput());
    const h = g.holder()!;
    (g as any).freeThrows(h, 2);
    expect(h.box.fta).toBe(2);
    expect(h.box.ftm).toBe(h.box.pts);
    const g2 = makeGame({ seed: 4 });
    for (let t = 0; t < 600 && !g2.over; t += 1 / 30) g2.update(1 / 30, emptyInput());
    const all = g2.players;
    const oreb = all.reduce((a, p) => a + p.box.oreb, 0), reb = all.reduce((a, p) => a + p.box.reb, 0);
    expect(reb).toBeGreaterThan(0);
    expect(oreb).toBeGreaterThan(0);
    expect(oreb).toBeLessThan(reb);
  });
});
