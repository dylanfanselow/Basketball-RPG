import { describe, it, expect } from 'vitest';
import { makeGame } from './helpers';
import { emptyInput, MAGIC, SLIP_S, GREEN_CONTEST, FINGER_WAG, mambaCost, FREIGHT, GRAVITY } from '../src/sim/game';
import { evaluateShot, windupFor, SHOOT_TUNE, shotConditions } from '../src/sim/shooting';
import { methodKey, methodLabel } from '../src/sim/rhythm';
import { TREES, NODES } from '../src/sim/data';
import { Player } from '../src/sim/player';
import { newCareer, migrateCareer } from '../src/career/career';
import { canUnlock, unlock } from '../src/career/skilltree';
import { predictLanding } from '../src/sim/ballPhysics';
import { resolveMove } from '../src/sim/moves';
import { PERK_SHAPES } from '../src/scenes/perkShapes';
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
    expect(NODES.pd_ironnate.prereqs.sort()).toEqual(['pd_iq', 'pd_pickup']);
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

describe('round 65: shaped trees and GOAT skills', () => {
  it('GOAT skills cost 5 and sit where the owner drew them', () => {
    const goats = TREES.flatMap((t) => t.nodes.filter((n) => n.goat).map((n) => n.id)).sort();
    expect(goats).toEqual(['dr_uncledrew', 'dv_freight', 'fi_unstoppable', 'in_blockparty', 'pa_pointgod', 'pd_ironnate', 'sc_gravity', 'sh_lethal']);
    for (const id of goats) expect(NODES[id].cost).toBe(5);
    expect(NODES.sh_lethal.prereqs.sort()).toEqual(['sh_chef', 'sh_mamba']);
    expect(NODES.sh_lethal.desc).toContain('I understand it now');
    expect(NODES.in_blockparty.prereqs.sort()).toEqual(['in_fingerwag', 'in_foresight', 'in_gimme']);
    expect(NODES.in_foresight.prereqs.sort()).toEqual(['in_fingerwag', 'in_gimme']);
    expect(NODES.pd_contest.prereqs).toEqual([]);
    for (const id of ['pd_root', 'pd_flop', 'in_swat']) expect(NODES[id]).toBeUndefined();
    expect(TREES.find((t) => t.id === 'shooting')!.shape).toBe('ball');
  });
  it('only the chosen players have the GOAT skills', () => {
    const all = JSON.stringify(rosters);
    for (const id of ['pd_root', 'pd_flop', 'in_swat']) expect(all).not.toContain(`"${id}"`);
    const flat: any[] = [];
    const walk = (o: any) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (Array.isArray(o.perks)) flat.push(o); Object.values(o).forEach(walk); } };
    walk(rosters);
    const who = (id: string) => flat.filter((p) => p.perks.includes(id)).map((p) => p.name).sort();
    expect(who('in_blockparty')).toEqual(['Victor Wembanyama']);
    expect(who('pd_ironnate')).toEqual(['Kawhi Leonard']);
    expect(who('dr_uncledrew')).toEqual(['Kyrie Irving']);
    expect(who('pa_pointgod')).toEqual(['Nikola Jokić', 'Tyrese Haliburton']);
    expect(who('dv_freight')).toEqual(['Giannis Antetokounmpo', 'LeBron James']);
    expect(who('sc_gravity')).toEqual(['Nikola Jokić']);
    expect(who('fi_unstoppable')).toEqual(['Giannis Antetokounmpo', 'Jalen Brunson', 'Kyrie Irving']);
    expect(who('sh_lethal')).toEqual(['Jalen Brunson', 'Luka Dončić', 'Shai Gilgeous-Alexander', 'Stephen Curry']);
  });
  it('old saves: Lockdown Stance -> Hand in Face, Swat Team -> Anchor, Floor Burn refunded', () => {
    const old: any = { ...newCareer('A', 'SF'), nodes: ['pd_root', 'pd_contest', 'pd_flop', 'in_root', 'in_wall', 'in_anchor', 'in_swat'], perkPoints: 0 };
    const m = migrateCareer(old)!;
    expect(m.nodes.sort()).toEqual(['in_anchor', 'in_root', 'in_wall', 'pd_contest']);
    expect(m.perkPoints).toBe(1 + 2 + 2);
    const only: any = { ...newCareer('B', 'SF'), nodes: ['pd_root'], perkPoints: 0 };
    const m2 = migrateCareer(only)!;
    expect(m2.nodes).toEqual(['pd_contest']);
    expect(m2.perkPoints).toBe(0);
  });
});

describe('round 65: Chef', () => {
  it('deep 3s out to 34 ft shoot like a normal 3, with a quicker windup', () => {
    const g = live();
    const sh = g.holder()!, side = g.side(sh.team), rim = g.rim(sh.team), dir = Math.sign(47 - rim.x);
    sh.p = { x: rim.x + dir * 30, y: rim.y };
    const base = () => evaluateShot(sh, [], side, 'deep3', { now: g.time, clutch: false }).terms[0].value;
    withNode(sh, 'sh_chef', false);
    const off = base(), w0 = windupFor(sh, 'three');
    withNode(sh, 'sh_chef', true);
    expect(base()).toBeCloseTo(0.36, 3);
    expect(off).toBeLessThan(0.3);
    expect(windupFor(sh, 'three')).toBeCloseTo(w0 * SHOOT_TUNE.chefWindup, 5);
    sh.p = { x: rim.x + dir * 38, y: rim.y }; // a heave stays a heave
    expect(base()).toBeLessThan(0.2);
  });
});

describe('round 65: Mamba and Lethal Shooter', () => {
  const ev = (pct: number, contest: number) => ({ pct, contest } as any);
  it('Mamba: every other miss goes in for rhythm, more for a worse shot, none when broke', () => {
    const g = live();
    const p = g.holder()!;
    withNode(p, 'sh_mamba', true);
    g.setRhythm(p, 100);
    expect(g.missSaved(p, 'mid', ev(0.45, 0.3))).toBe(false);
    expect(g.missSaved(p, 'mid', ev(0.45, 0.3))).toBe(true);
    const spentGood = 100 - p.rhythm;
    g.setRhythm(p, 100);
    g.missSaved(p, 'three', ev(0.1, 0.6));
    expect(g.missSaved(p, 'three', ev(0.1, 0.6))).toBe(true);
    expect(100 - p.rhythm).toBeGreaterThan(spentGood);
    expect(mambaCost(0.1)).toBeGreaterThan(mambaCost(0.45));
    g.setRhythm(p, 5);
    g.missSaved(p, 'mid', ev(0.4, 0.3));
    expect(g.missSaved(p, 'mid', ev(0.4, 0.3))).toBe(false);
  });
  it('Lethal Shooter: every third green jumper miss goes in (round 78, was every other), free; contested or not a jumper, no', () => {
    const g = live();
    const p = g.holder()!;
    withNode(p, 'sh_lethal', true);
    g.setRhythm(p, 0);
    const res = [0, 1, 2, 3, 4, 5].map(() => g.missSaved(p, 'three', ev(0.4, GREEN_CONTEST / 2)));
    expect(res).toEqual([false, false, true, false, false, true]);
    expect(p.rhythm).toBe(0);
    expect([0, 1].map(() => g.missSaved(p, 'three', ev(0.4, 0.5)))).toEqual([false, false]);
    expect([0, 1].map(() => g.missSaved(p, 'layup', ev(0.4, 0)))).toEqual([false, false]);
  });
});

describe('round 65: Finger Wag and Block Party', () => {
  const setup = (seed = 6) => {
    const g = live(undefined, seed);
    const sh = g.holder()!, d = g.opp(sh.team)[0];
    const rim = g.rim(sh.team), dir = Math.sign(47 - rim.x);
    for (const o of g.players) if (o !== sh && o !== d) o.p = { x: 47, y: 2 };
    sh.p = { x: rim.x + dir * 4, y: rim.y }; d.p = { x: rim.x + dir * 2, y: rim.y };
    return { g, sh, d };
  };
  it('Finger Wag: twice the rhythm both ways on a block', () => {
    const swing = (wag: boolean) => {
      const { g, sh, d } = setup();
      withNode(d, 'in_fingerwag', wag);
      g.setRhythm(d, 20); g.setRhythm(sh, 50); d.z = 2;
      g.rng.chance = () => true;
      sh.pendingShot = { type: 'layup' } as any;
      (g as any).releaseShot(sh);
      expect(g.events.some((e) => e.kind === 'block')).toBe(true);
      return { gain: d.rhythm - 20, loss: 50 - sh.rhythm, wagAt: d.fingerWagAt, said: g.events.some((e) => /Finger wag/.test(e.text)) };
    };
    const off = swing(false), on = swing(true);
    expect(on.gain).toBeCloseTo(off.gain * FINGER_WAG, 5);
    expect(on.loss).toBeCloseTo(off.loss * FINGER_WAG, 5);
    expect(on.said).toBe(true);
    expect(off.said).toBe(false);
  });
  it('Block Party: a smaller dunker in front of him is blocked every time, a bigger one is not', () => {
    const trial = (seed: number, bigger: boolean, perk = true) => {
      const { g, sh, d } = setup(seed);
      withNode(d, 'in_blockparty', perk);
      d.height = 7.3; d.core.strength = 50; d.z = 0;
      sh.height = bigger ? 7.5 : 6.5; sh.core.strength = bigger ? 90 : 60;
      sh.pendingShot = { type: 'dunk' } as any;
      (g as any).releaseShot(sh);
      return g.events.some((e) => e.kind === 'block' && /BLOCK PARTY/.test(e.text));
    };
    for (let s = 1; s <= 10; s++) {
      expect(trial(s, false)).toBe(true);
      expect(trial(s, true)).toBe(false);
      expect(trial(s, false, false)).toBe(false);
    }
  });
});

describe('round 67: Mamba midrange never goes stale', () => {
  it('a repeated midrange counts as fresh with Mamba, stale without; threes still go stale', () => {
    const g = live();
    const p = g.holder()!;
    const mid = { type: 'mid', pts: 2, dist: 15 }, three = { type: 'three', pts: 3, dist: 24 };
    p.methods.set('mid|dribble', 3); p.methods.set('three|catch', 2);
    withNode(p, 'sh_mamba', false);
    expect(g.staleTimes(p, 'mid|dribble', mid)).toBe(3);
    withNode(p, 'sh_mamba', true);
    expect(g.staleTimes(p, 'mid|dribble', mid)).toBe(0);
    expect(g.staleTimes(p, 'three|catch', three)).toBe(2);
  });
});

describe('round 68: a shot off a pump fake is its own scoring method', () => {
  it('pump fake then shoot is "fake", not off the dribble, for the STALE count', () => {
    expect(methodKey('mid', new Set(['pullUp', 'afterFake']))).toBe('mid|fake');
    expect(methodKey('three', new Set(['catchShoot', 'afterFake']))).toBe('three|fake');
    expect(methodKey('mid', new Set(['pullUp']))).toBe('mid|dribble');
    expect(methodLabel('mid|fake')).toBe('mid · pump fake');
    const g = live();
    const p = g.holder()!;
    p.dribbledSinceCatch = true; p.receivedAt = g.time - 3; p.pumpFakeAt = g.time - 0.5;
    const c = shotConditions(p, g.side(p.team), 'mid', g.time, false);
    expect(c.has('afterFake')).toBe(true);
    p.pumpFakeAt = g.time - 5; // a fake before this catch doesn't count
    expect(shotConditions(p, g.side(p.team), 'mid', g.time, false).has('afterFake')).toBe(false);
  });
});

describe('round 72: shaped trees (player, baton, hand, valve) and Uncle Drew', () => {
  const tree = (id: string) => TREES.find((t) => t.id === id)!;
  it('each tree is drawn on its picture and starts where the owner said', () => {
    expect(['driving', 'passing', 'finishing', 'dribbling'].map((id) => tree(id).shape)).toEqual(['player', 'baton', 'hand', 'valve']);
    for (const s of ['player', 'baton', 'hand']) expect(PERK_SHAPES[s]?.length).toBeGreaterThan(0);
    const root = (id: string) => tree(id).nodes.find((n) => n.prereqs.length === 0)!;
    const maxY = (id: string) => Math.max(...tree(id).nodes.map((n) => n.y));
    for (const id of ['driving', 'finishing', 'dribbling']) expect(root(id).y).toBe(maxY(id)); // from the bottom
    const pa = root('passing');
    expect(pa.y).toBe(maxY('passing'));
    expect(pa.x).toBe(Math.min(...tree('passing').nodes.map((n) => n.x))); // bottom left
    expect([NODES.dr_uncledrew.x, NODES.dr_uncledrew.y]).toEqual([50, 48]); // the hub of the wheel
    expect(NODES.dr_chain.prereqs.sort()).toEqual(['dr_killer', 'dr_snatch', 'dr_stepback']);
  });
  it('Uncle Drew is a GOAT skill that needs every Handles perk', () => {
    expect(NODES.dr_uncledrew.goat).toBe(true);
    expect(NODES.dr_uncledrew.cost).toBe(5);
    const c = newCareer('U', 'PG');
    c.perkPoints = 99;
    const rest = tree('dribbling').nodes.map((n) => n.id).filter((id) => id !== 'dr_uncledrew');
    for (const id of rest.slice(0, -1)) expect(unlock(c, id)).toBe(true);
    const chk = canUnlock(c, 'dr_uncledrew');
    expect(chk.ok).toBe(false);
    if (!chk.ok) expect(chk.reason).toBe('Requires every Handles perk');
    expect(unlock(c, rest[rest.length - 1])).toBe(true);
    expect(unlock(c, 'dr_uncledrew')).toBe(true);
  });
  const handler = (uncle: boolean) => {
    const g = live();
    const h = g.holder()!;
    for (const n of tree('dribbling').nodes) h.nodes.add(n.id);
    if (!uncle) h.nodes.delete('dr_uncledrew');
    h.recompute(); h.deadDribble = false;
    return { g, h };
  };
  it('cancels a dribble move straight into the next one (no buffering)', () => {
    for (const uncle of [false, true]) {
      const { g, h } = handler(uncle);
      g.dribbleMove(h, v(0, 1));
      expect(h.state).toBe('dribbleMove');
      const first = h.move!.id;
      h.stateT = 0.2;
      g.dribbleMove(h, v(0, -1));
      if (uncle) {
        expect(h.state).toBe('dribbleMove');
        expect(h.bufferedMove).toBeNull();
        expect(h.lastMove!.id).toBe(first);
        expect(h.stateT).toBe(0);
      } else {
        expect(h.bufferedMove).not.toBeNull();
        expect(h.move!.id).toBe(first);
      }
    }
  });
  it('every chain move works off any move (Snatch-Back off a Spin)', () => {
    for (const uncle of [false, true]) {
      const { g, h } = handler(uncle);
      const toRim = norm(sub(g.rim(h.team), h.p));
      h.vel = v(); h.lastMove = { id: 'spin', endAt: g.time, dir: toRim };
      const id = resolveMove(h, scale(toRim, -1), toRim, g.time, 3);
      expect(id).toBe(uncle ? 'snatchBack' : 'stepback');
    }
  });
});

describe('round 73: Point God, Unstoppable, Freight Train, Gravity', () => {
  it('the screens wall is 1, 4, 3, 1 bricks from the bottom, Gravity on top', () => {
    const t = TREES.find((x) => x.id === 'screens')!;
    const rows = [...new Set(t.nodes.map((n) => n.y))].sort((a, b) => b - a).map((y) => t.nodes.filter((n) => n.y === y).length);
    expect(rows).toEqual([1, 4, 3, 1]);
    expect(t.nodes.find((n) => n.y === Math.min(...t.nodes.map((m) => m.y)))!.id).toBe('sc_gravity');
    expect(NODES.sc_gravity.prereqs.sort()).toEqual(['sc_ghost', 'sc_rescreen', 'sc_slip']);
    for (const id of ['pa_pointgod', 'fi_unstoppable', 'dv_freight', 'sc_gravity']) expect(NODES[id].cost).toBe(5);
    expect(NODES.fi_unstoppable.name).toBe('Unstoppable');
  });
  it('Point God passes out of a shot', () => {
    for (const god of [false, true]) {
      const g = live();
      const h = g.holder()!, m = g.mates(h)[0];
      withNode(h, 'pa_pointgod', god);
      g.startShot(h, 'mid');
      expect(h.state).toBe('shoot');
      g.pass(h, m);
      if (god) { expect(g.ball.st.kind).toBe('pass'); expect(h.pendingShot).toBeNull(); expect(h.state).toBe('idle'); }
      else { expect(g.ball.st.kind).not.toBe('pass'); expect(h.state).toBe('shoot'); }
    }
  });
  it('Unstoppable: a sure block is only a contest, and contests on his shots are weaker', () => {
    for (const un of [false, true]) {
      const g = live();
      g.freezeAI = true;
      const h = g.holder()!;
      withNode(h, 'fi_unstoppable', un);
      const d = g.nearestDefender(h).d!;
      g.rng.chance = () => true;
      g.startShot(h, 'layup');
      for (let t = 0; t < 2 && h.pendingShot; t += 1 / 60) {
        d.p = add(h.p, scale(norm(sub(g.rim(h.team), h.p)), 2)); d.z = 2; d.state = 'idle';
        g.update(1 / 60, emptyInput());
      }
      expect(g.events.some((e) => e.kind === 'block')).toBe(!un);
      if (un) expect(g.events.some((e) => e.text.startsWith('UNSTOPPABLE'))).toBe(true);
    }
    const p = new Player({ id: 'u', name: 'U', pos: 'SG' } as any);
    expect(p.mods.contestInTerms({ type: 'mid', conds: new Set() } as any).length).toBe(0);
    p.nodes.add('fi_unstoppable'); p.recompute();
    expect(p.mods.contestInTerms({ type: 'mid', conds: new Set() } as any).map((t) => t.mult)).toEqual([0.75]);
  });
  it('Freight Train: faster after a change of possession', () => {
    const g = live();
    const h = g.holder()!;
    const d = g.opp(h.team)[0];
    withNode(d, 'dv_freight', true);
    d.burstUntil = 0;
    const base = g.topSpeed(d, false);
    g.changePossessionLive(d.team);
    g.update(1 / 60, emptyInput());
    expect(d.freightUntil).toBeGreaterThan(g.time + FREIGHT.secs - 0.05);
    d.burstUntil = 0; // no sprint burst in the comparison
    expect(g.topSpeed(d, false)).toBeCloseTo(base * FREIGHT.boost, 5);
  });
  it('Gravity pulls nearby defenders toward his screen', () => {
    const pulled = (grav: boolean) => {
      const g = live();
      g.freezeAI = true;
      const h = g.holder()!, s = g.mates(h)[0], d = g.opp(h.team)[0];
      withNode(s, 'sc_gravity', grav);
      for (const q of g.players) if (q !== s && q !== d && q !== h) q.p = v(5, 5); // out of the way
      d.p = add(s.p, v(8, 0)); d.vel = v();
      g.setScreen(s);
      for (let t = 0; t < 0.5; t += 1 / 60) g.update(1 / 60, emptyInput());
      return 8 - Math.hypot(d.p.x - s.p.x, d.p.y - s.p.y);
    };
    expect(pulled(true)).toBeGreaterThan(pulled(false) + 1);
    expect(GRAVITY.r).toBeGreaterThan(8);
  });
});
