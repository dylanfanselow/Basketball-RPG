import { describe, it, expect } from 'vitest';
import { Player } from '../src/sim/player';
import { evaluateShot } from '../src/sim/shooting';
import { rimPos } from '../src/sim/court';

const mk = (id: string, team: 0 | 1, x: number, y: number) => {
  const p = new Player({ id, name: id, team, pos: 'SF', height: 6.7, core: { shooting: 70, finishing: 80, strength: 70, mobility: 70, playmaking: 70 } as any });
  p.p = { x, y };
  return p;
};

describe('round 48: finishing through a crowd', () => {
  const rim = rimPos(1);
  const shooter = mk('S', 0, rim.x - 5, rim.y);
  // defenders between him and the rim, a little apart
  const d1 = mk('D1', 1, rim.x - 2.6, rim.y + 0.4), d2 = mk('D2', 1, rim.x - 2.8, rim.y - 1.4), d3 = mk('D3', 1, rim.x - 1.8, rim.y + 1.6);
  const ev = (type: string, defs: Player[]) => evaluateShot(shooter, defs, 1, type, { now: 10, clutch: false });
  it('a layup into three defenders carries the crowd term and is much harder than into one', () => {
    const one = ev('layup', [d1]), three = ev('layup', [d1, d2, d3]);
    expect(one.terms.some((t) => t.label.startsWith('crowd'))).toBe(false);
    const crowd = three.terms.find((t) => t.label.startsWith('crowd at the rim'));
    expect(crowd?.label).toBe('crowd at the rim (3)');
    expect(three.pct).toBeLessThan(one.pct * 0.75);
  });
  it('a dunk over two is a poster attempt (crowd + poster terms); jumpers have no crowd term', () => {
    const dunk = ev('dunk', [d1, d2]);
    expect(dunk.terms.map((t) => t.label)).toEqual(expect.arrayContaining(['crowd at the rim (2)', 'poster over 2']));
    expect(ev('mid', [d1, d2, d3]).terms.some((t) => t.label.startsWith('crowd'))).toBe(false);
  });
});
