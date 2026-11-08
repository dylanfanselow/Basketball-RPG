import { describe, it, expect } from 'vitest';
import { makeGame } from './helpers';
import { emptyInput, MAGIC, SLIP_S } from '../src/sim/game';
import { TREES, NODES } from '../src/sim/data';
import { Player } from '../src/sim/player';
import { newCareer, migrateCareer } from '../src/career/career';
import { canUnlock, unlock } from '../src/career/skilltree';
import { predictLanding } from '../src/sim/ballPhysics';
import { v, len, sub, norm, scale, add } from '../src/sim/math';
import rosters from '../src/data/rosters.json';

const live = (u?: Player, seed = 6) => {
  const g = makeGame({ seed }, u);
  const inp = emptyInput();
  for (let t = 0; t < 30 && !(g.live && g.holder()); t += 1 / 30) g.update(1 / 30, inp);
  return g;
};
const withNode = (p: Player, id: string, on: boolean) => { p.nodes.delete(id); if (on) p.nodes.add(id); p.recompute(); };

describe('round 64: perk trees', () => {
  it('every prereq exists in the same tree; tree and perk names', () => {
    for (const t of TREES) for (const n of t.nodes) for (const pr of n.prereqs) expect(t.nodes.some((m) => m.id === pr)).toBe(true);
    const name = (id: string) => TREES.find((t) => t.id === id)!.name;
    expect([name('interior'), name('perimeter'), name('dribbling')]).toEqual(['Post', 'Perimeter', 'Handles']);
    expect(NODES.sh_range.name).toBe('Way Down Town');
    expect(NODES.sh_pullup3.name).toBe('Bang!');
    expect(NODES.pa_vision).toBeUndefined();
    expect(NODES.pa_root.effects.some((e) => e.t === 'param' && e.key === 'laneVision')).toBe(true);
    expect(NODES.pd_ironnate.prereqs.sort()).toEqual(['pd_iq', 'pd_navigate', 'pd_pickup']);
    for (const id of ['pa_magic', 'sc_roller', 'sc_popper', 'in_gimme', 'in_foresight']) expect(NODES[id]).toBeDefined();
  });
  it('a perk with two lines into it needs both', () => {
    const c = newCareer('T', 'PG');
    c.perkPoints = 20;
    for (const id of ['pa_root', 'pa_skip']) expect(unlock(c, id)).toBe(true);
    const chk = canUnlock(c, 'pa_bullet');
    expect(chk.ok).toBe(false);
    if (!chk.ok) expect(chk.reason).toBe('Requires Dimer');
    for (const id of ['pa_lob', 'pa_dimes']) expect(unlock(c, id)).toBe(true);
    expect(unlock(c, 'pa_bullet')).toBe(true);
  });
  it('Dime Vision saves and rosters move to Floor General (refunded if they had both)', () => {
    const both: any = { ...newCareer('A', 'PG'), nodes: ['pa_root', 'pa_vision', 'pa_skip'], perkPoints: 0 };
    const m = migrateCareer(both)!;
    expect(m.nodes).toEqual(['pa_root', 'pa_skip']);
    expect(m.perkPoints).toBe(1);
    const only: any = { ...newCareer('B', 'PG'), nodes: ['pa_vision'], perkPoints: 0 };
    const m2 = migrateCareer(only)!;
    expect(m2.nodes).toEqual(['pa_root']);
    expect(m2.perkPoints).toBe(0);
    expect(JSON.stringify(rosters)).not.toContain('pa_vision');
  });
});

describe('round 64: Magic', () => {
  const setup = (magic: boolean) => {
    const g = live();
    const h = g.holder()!, m = g.mates(h)[0];
    withNode(h, 'pa_magic', magic);
    h.state = 'idle'; h.vel = v(); h.face = v(1, 0);
    m.p = add(h.p, v(-14, 0)); // right behind him
    for (const d of g.opp(h.team)) d.p = add(h.p, v(30, 20));
    g.pass(h, m);
    return { g, st: g.ball.st as any };
  };
  it('a pass to a man behind him goes behind the back, safer, and only with the perk', () => {
    const on = setup(true), off = setup(false);
    expect(on.st.kind).toBe('pass');
    expect(on.st.fancy).toBe('behindBack');
    expect(off.st.fancy).toBeUndefined();
    expect(on.st.riskMult).toBeCloseTo(off.st.riskMult * MAGIC.risk, 5);
    expect(on.g.lastPassStyle).toBe('behindBack');
    expect(on.g.events.some((e) => e.text === 'Behind the back!')).toBe(true);
  });
});

describe('round 64: Iron Nate', () => {
  const trial = (iron: boolean) => {
    let ankles = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const g = live(undefined, seed);
      const h = g.holder()!;
      for (const n of TREES.find((t) => t.id === 'dribbling')!.nodes) h.nodes.add(n.id);
      h.recompute(); h.sub.ankleBreak = 99;
      const d = g.nearestDefender(h).d!;
      withNode(d, 'pd_ironnate', iron); d.sub.ankleResist = 1;
      g.rng.chance = () => true;
      for (const stick of [v(0, 1), v(0, -1), v(1, 0), v(-1, 0)]) {
        h.state = 'idle'; h.deadDribble = false; h.move = null;
        d.state = 'idle'; d.p = add(h.p, scale(norm(sub(g.rim(h.team), h.p)), 2.5));
        g.dribbleMove(h, stick);
        if (g.events.some((e) => e.kind === 'ankles')) ankles++;
      }
    }
    return ankles;
  };
  it('a defender with Iron Nate never gets his ankles broken', () => {
    expect(trial(false)).toBeGreaterThan(0);
    expect(trial(true)).toBe(0);
  });
});

describe('round 64: Gimme That!', () => {
  const block = (snatch: boolean) => {
    const g = live();
    const sh = g.holder()!, d = g.opp(sh.team)[0];
    withNode(d, 'in_gimme', snatch);
    const rim = g.rim(sh.team), dir = Math.sign(47 - rim.x);
    sh.p = { x: rim.x + dir * 4, y: rim.y }; d.p = { x: rim.x + dir * 1.5, y: rim.y }; d.z = 2;
    g.rng.chance = () => true;
    sh.pendingShot = { type: 'layup' } as any;
    (g as any).releaseShot(sh);
    return { g, d };
  };
  it('the blocker keeps it with the perk; a normal block sends it flying', () => {
    const on = block(true), off = block(false);
    expect(on.g.events.some((e) => e.kind === 'block')).toBe(true);
    expect(on.g.holder()).toBe(on.d);
    expect(on.g.possession).toBe(on.d.team);
    expect(off.g.events.some((e) => e.kind === 'block')).toBe(true);
    expect(off.g.ball.st.kind).toBe('loose');
  });
});

describe('round 64: Foresight', () => {
  it('predicts where a loose ball first hits the floor in the sim', () => {
    const g = live();
    for (const p of g.players) p.p = v(5, 5);
    const start = v(60, 25);
    g.ball.p = { ...start }; g.ball.z = 10;
    g.ball.st = { kind: 'loose', vel: v(7, 3), vz: 5, lastTeam: 0, noGrabUntil: g.time + 9 };
    const spot = g.foresightSpot()!;
    expect(spot).not.toBeNull();
    let landed: { x: number; y: number } | null = null;
    for (let i = 0; i < 240 && !landed; i++) {
      const st = g.ball.st as any, before = st.vz;
      g.update(1 / 60, emptyInput());
      const after = (g.ball.st as any).vz;
      if (before < 0 && after >= 0) landed = { ...g.ball.p };
    }
    expect(landed).not.toBeNull();
    expect(len(sub(spot, landed!))).toBeLessThan(0.6);
    g.ball.z = 0.4; g.ball.st = { kind: 'loose', vel: v(3, 0), vz: 0, lastTeam: 0 };
    expect(g.foresightSpot()).toBeNull(); // rolling on the floor: nothing to show
    const q = predictLanding({ x: 10, y: 10, z: 8 }, v(), 0)!;
    expect([q.x, q.y]).toEqual([10, 10]); // straight down
  });
});

describe('round 64: Roller / Popper', () => {
  const speedAfterScreen = (node: string | null, towardRim: boolean) => {
    const u = new Player({ id: 'U', name: 'Big', team: 0, pos: 'C', isUser: true, core: { shooting: 60, finishing: 70, strength: 80, mobility: 60, playmaking: 50 } as any });
    const g = live(u, 9);
    for (const id of ['sc_roller', 'sc_popper']) u.nodes.delete(id);
    if (node) u.nodes.add(node);
    u.recompute();
    if (g.holder() === u) g.giveBall(g.mates(u)[0]);
    const toRim = norm(sub(g.rim(u.team), u.p));
    const dir = towardRim ? toRim : scale(toRim, -1);
    u.slipUntil = g.time + SLIP_S; u.vel = v();
    for (let i = 0; i < 20; i++) { u.slipUntil = g.time + SLIP_S; g.update(1 / 60, { ...emptyInput(), move: dir }); }
    return len(u.vel);
  };
  it('Roller is faster rolling to the rim, Popper popping away, each only its own way', () => {
    const base = speedAfterScreen(null, true), roll = speedAfterScreen('sc_roller', true);
    expect(roll).toBeGreaterThan(base * 1.1);
    const baseAway = speedAfterScreen(null, false), pop = speedAfterScreen('sc_popper', false);
    expect(pop).toBeGreaterThan(baseAway * 1.1);
    expect(speedAfterScreen('sc_popper', true)).toBeCloseTo(base, 1);
  });
});
