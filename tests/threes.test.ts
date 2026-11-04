import { describe, it, expect } from 'vitest';
import { PLAYS } from '../src/sim/data';
import { REAL_ROSTERS } from '../src/career/roster';
import { buildThrees, defaultLineup, slotChoices, fitsSlot, ThreeSetup } from '../src/sim/threes';
import { makeGame, simToEnd } from './helpers';

const base = (court: 'full' | 'half'): ThreeSetup => {
  const a = REAL_ROSTERS.LAL, b = REAL_ROSTERS.BOS;
  return { myTeam: 'LAL', oppTeam: 'BOS', mine: defaultLineup(a), theirs: defaultLineup(b), playAs: 0, court };
};

describe('Quick 3v3', () => {
  it('default lineups fill Guard (PG/SG), Wing (SG/SF/PF), Big (PF/C) with the best fits, no repeats', () => {
    for (const [id, r] of Object.entries(REAL_ROSTERS)) {
      const l = defaultLineup(r);
      expect(new Set(l).size, id).toBe(3);
      ([0, 1, 2] as const).forEach((s) => expect(fitsSlot(s, r[l[s]].pos), `${id} slot ${s} ${r[l[s]].pos}`).toBe(true));
      for (const s of [0, 1, 2] as const) for (const i of slotChoices(r, l, s)) expect(l.filter((_, k) => k !== s)).not.toContain(i);
    }
  });

  for (const court of ['full', 'half'] as const) {
    it(`${court} court: three a side as roles 1 / 3 / 5, only 3v3 plays (with isos) get called, a full game finishes`, () => {
      const g = buildThrees(base(court), 11, { cpuOnly: true, quarterLen: 120 });
      expect(g.teams[0].onCourt.length).toBe(3); expect(g.teams[1].onCourt.length).toBe(3);
      for (const t of g.teams) expect(t.onCourt.map((p) => p.role).sort()).toEqual(['1', '3', '5']);
      if (court === 'half') expect(g.side(0)).toBe(g.side(1)); else expect(g.side(0)).not.toBe(g.side(1));
      const calls: string[] = [];
      const o = g.emit.bind(g);
      g.emit = (e) => { if (e.kind === 'play') calls.push(e.text); o(e); };
      const played = new Set<string>();
      const tick = g.update.bind(g);
      g.update = (dt, i1, i2) => { tick(dt, i1, i2); if (g.runner.playId) played.add(g.runner.playId); };
      simToEnd(g);
      expect(g.over).toBe(true);
      expect(played.size).toBeGreaterThan(3);
      for (const id of played) expect(PLAYS[id].tags, id).toContain('3v3');
      expect(calls.some((c) => /Iso for/.test(c))).toBe(true); // iso ball
      const pts = g.teams[0].score + g.teams[1].score;
      expect(pts).toBeGreaterThan(20);
    }, 30000);
  }

  it('half court: after a make the other team checks it at the top (no inbound walk-out)', () => {
    const g = buildThrees(base('half'), 5, { cpuOnly: true, quarterLen: 120 });
    let checked = 0, scored = -1;
    const o = g.emit.bind(g);
    g.emit = (e) => { if (e.kind === 'score') scored = e.team!; o(e); };
    for (let i = 0; i < 60 * 120 && checked < 3; i++) {
      const before = g.live;
      g.update(1 / 60, { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false });
      if (!before && g.live) {
        expect(g.inb).toBeNull();
        const h = g.holder()!;
        expect(Math.abs(Math.hypot(h.p.x - g.rim(h.team).x, h.p.y - g.rim(h.team).y))).toBeGreaterThan(20); // up top
        if (scored >= 0) { expect(h.team).toBe(1 - scored); scored = -1; checked++; }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('5v5 never calls a 3v3 play', () => {
    const g = makeGame({ seed: 4, quarterLen: 60 });
    const played = new Set<string>();
    const tick = g.update.bind(g);
    g.update = (dt, i1, i2) => { tick(dt, i1, i2); if (g.runner.playId) played.add(g.runner.playId); };
    simToEnd(g);
    for (const id of played) expect(PLAYS[id].tags).not.toContain('3v3');
  }, 20000);
});
