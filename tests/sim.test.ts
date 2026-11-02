import { describe, it, expect } from 'vitest';
import { computeSubRatings, statFactor } from '../src/sim/attributes';
import { evaluateShot, selectShotType, computeContest } from '../src/sim/shooting';
import { resolveMove, availableMoves } from '../src/sim/moves';
import { passProbability } from '../src/sim/ai/trust';
import { planRotation } from '../src/sim/rotation';
import { Player } from '../src/sim/player';
import { hc, rimPos } from '../src/sim/court';
import { v, norm, sub, scale } from '../src/sim/math';
import { newCareer, applyGameResult, spendStatPoint } from '../src/career/career';
import { canUnlock, unlock } from '../src/career/skilltree';
import { makeGame, simToEnd } from './helpers';
import { emptyBox } from '../src/sim/player';
import { screenImpact } from '../src/sim/game';
import { planShot } from '../src/sim/ballPhysics';
import { Rng } from '../src/sim/math';
import { topStats } from '../src/sim/boxScore';

const core = (n = 60) => ({ shooting: n, finishing: n, strength: n, mobility: n, playmaking: n });
const mk = (o: Partial<ConstructorParameters<typeof Player>[0]> = {}) => new Player({ id: 'p', name: 'P', team: 0, pos: 'SG', core: core(), ...o });

describe('attributes', () => {
  it('maps core stats through the influence matrix', () => {
    const s = computeSubRatings({ shooting: 90, finishing: 40, strength: 50, mobility: 50, playmaking: 50 });
    expect(s.three).toBeCloseTo(90);
    expect(s.floater).toBeGreaterThan(50); expect(s.floater).toBeLessThan(90);
    expect(statFactor(60)).toBeCloseTo(1.0);
  });
  it('perk sub adds stack', () => {
    const p = mk({ nodes: ['sh_root'] });
    expect(p.sub.three).toBeCloseTo(63);
  });
});

describe('shooting', () => {
  const side = 1 as const;
  it('equation terms multiply to the displayed pct', () => {
    const p = mk({ nodes: ['sh_root', 'sh_catch', 'sh_corner'] });
    p.p = hc(side, 2, 22.5);
    p.receivedAt = 0;
    const e = evaluateShot(p, [], side, 'three', { now: 0.2, clutch: false });
    const prod = e.terms.reduce((a, t) => a * t.value, 1);
    expect(e.pct).toBeCloseTo(prod, 6);
    expect(e.terms.some((t) => t.label === 'Corner Specialist')).toBe(true);
    expect(e.terms.some((t) => t.label === 'Catch & Shoot')).toBe(true);
  });
  it('contest falls off with distance and angle', () => {
    const p = mk(); p.p = hc(side, 25, 0);
    const toRim = norm(sub(rimPos(side), p.p));
    const mkD = (dx: number) => { const d = mk({ team: 1 }); d.p = { x: p.p.x + toRim.x * dx, y: p.p.y + toRim.y * dx }; return d; };
    const near = computeContest(p, [mkD(2.5)], side, 'three', 0).raw;
    const far = computeContest(p, [mkD(4.5)], side, 'three', 0).raw;
    expect(computeContest(p, [mkD(6)], side, 'three', 0).raw).toBe(0); // outside the shorter jumper cone
    const behind = computeContest(p, [mkD(-3)], side, 'three', 0).raw;
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(behind);
  });
  it('stick direction picks floater / hook near the rim', () => {
    const p = mk(); p.p = hc(side, 10, 0);
    const toRim = norm(sub(rimPos(side), p.p));
    expect(selectShotType(p, side, { x: -toRim.x, y: -toRim.y }, 0)).toBe('floater');
    expect(selectShotType(p, side, { x: -toRim.y, y: toRim.x }, 0)).toBe('hook');
    p.p = hc(side, 30, 0);
    expect(selectShotType(p, side, v(), 0)).toBe('three');
  });
});

describe('moves', () => {
  const toRim = v(1, 0);
  it('falls back to basic moves when nothing is unlocked', () => {
    const p = mk();
    expect(resolveMove(p, v(0, 1), toRim, 0, 3)).toBe('lateral');
    p.vel = v(0, 8);
    expect(resolveMove(p, v(0, -1), toRim, 0, 3)).toBe('changeDir');
  });
  it('crossover needs a change of direction up/down the screen', () => {
    const p = mk({ nodes: ['dr_cross'] });
    expect(resolveMove(p, v(0, 1), toRim, 0, 3)).toBe('lateral');      // standing still: no cross
    p.vel = v(2, 8);                                                     // dribbling down the screen
    expect(resolveMove(p, v(0, 1), toRim, 0, 3)).toBe('lateral');      // same way: no cross
    expect(resolveMove(p, v(0, -1), toRim, 0, 3)).toBe('crossover');   // the other way: crossover
    expect(resolveMove(p, v(1, 0), toRim, 0, 3)).toBe('hesi');         // toward the hoop
  });
  it('crossover chains: double cross, behind-the-back, shammgod, only inside the window', () => {
    const p = mk({ nodes: ['dr_cross', 'dr_btb', 'dr_dbl', 'dr_shammgod'] });
    p.vel = v(0, -8); // now going up after the cross
    p.lastMove = { id: 'crossover', endAt: 1.0, dir: v(0, -1) };
    expect(resolveMove(p, v(0, 1), toRim, 1.3, 3)).toBe('doubleCross');
    expect(resolveMove(p, v(0, 0), toRim, 1.3, 3)).toBe('behindBack');
    expect(resolveMove(p, v(1, 0), toRim, 1.3, 3)).toBe('shammgod');
    expect(resolveMove(p, v(0, 1), toRim, 2.5, 3)).toBe('crossover');
  });
  it('between-the-legs when standing, in-and-out when moving', () => {
    const p = mk({ nodes: ['dr_legs', 'dr_inout'] });
    expect(resolveMove(p, v(0, 1), toRim, 0, 3)).toBe('betweenLegs');
    p.vel = v(0, 8);
    expect(resolveMove(p, v(0, 1), toRim, 0, 3)).toBe('inOut');
  });
});

describe('modifiers', () => {
  it('can add and remove perks live', () => {
    const p = mk();
    expect(p.hasMove('crossover')).toBe(false);
    p.nodes.add('dr_cross'); p.recompute();
    expect(p.hasMove('crossover')).toBe(true);
    p.nodes.delete('dr_cross'); p.recompute();
    expect(p.hasMove('crossover')).toBe(false);
  });
  it('code hooks expire', () => {
    const p = mk();
    p.mods.addHook('shot', 'ult', () => ({ label: 'ULT', mult: 2 }), 5);
    expect(p.mods.shotTerms({ type: 'three', conds: new Set() }).length).toBe(1);
    p.mods.expire(6);
    expect(p.mods.shotTerms({ type: 'three', conds: new Set() }).length).toBe(0);
  });
});

describe('trust', () => {
  it('a covered rookie calling for the ball almost never gets it', () => {
    expect(passProbability(15, 0.1, true)).toBeLessThan(0.1);
  });
  it('a trusted open player calling for it usually does', () => {
    expect(passProbability(90, 0.9, true)).toBeGreaterThan(0.5);
  });
});

describe('rotation', () => {
  it('low coach trust = few minutes, high = starter', () => {
    expect(planRotation(10, 180).minutes).toBeLessThan(8);
    const s = planRotation(80, 180);
    expect(s.starter).toBe(true);
    expect(s.stints[0][0]).toBe(0);
  });
});

describe('career', () => {
  it('stat points and perk unlock rules', () => {
    const c = newCareer('Test', 'SG');
    expect(spendStatPoint(c, 'shooting')).toBe(true);
    expect(c.core.shooting).toBe(52);
    expect(canUnlock(c, 'dr_btb').ok).toBe(false); // needs crossover
    expect(unlock(c, 'dr_handle')).toBe(true);
    expect(unlock(c, 'dr_cross')).toBe(true);
    expect(canUnlock(c, 'dr_btb').ok).toBe(false); // out of points
  });
  it('ult evolution points only once unlocked', () => {
    const c = newCareer('Test', 'C');
    applyGameResult(c, { box: emptyBox(), won: true, grade: { good: 0, bad: 0, points: 0 }, milestones: ['gameWinner'] });
    expect(c.ult.evoPoints).toBe(0);
    c.flags.ult_unlocked = true;
    applyGameResult(c, { box: emptyBox(), won: true, grade: { good: 0, bad: 0, points: 0 }, milestones: ['gameWinner'] });
    expect(c.ult.evoPoints).toBe(2);
  });
});

describe('headless AI game', () => {
  it('plays a full game with team basketball (assists, spread usage)', () => {
    const g = makeGame();
    simToEnd(g);
    expect(g.over).toBe(true);
    const all = g.players.concat(g.teams[0].roster, g.teams[1].roster);
    const uniq = [...new Set(all)];
    const fgm = uniq.reduce((a, p) => a + p.box.fgm, 0);
    const ast = uniq.reduce((a, p) => a + p.box.ast, 0);
    const fga = uniq.reduce((a, p) => a + p.box.fga, 0);
    const maxUsage = Math.max(...uniq.map((p) => p.box.fga)) / Math.max(1, fga / 2);
    console.log(`score ${g.teams[0].score}-${g.teams[1].score} fga ${fga} fgm ${fgm} ast ${ast} maxShare ${maxUsage.toFixed(2)}`);
    expect(fga).toBeGreaterThan(30);
    expect(ast / Math.max(1, fgm)).toBeGreaterThan(0.4);
    expect(maxUsage).toBeLessThan(0.4);
  });
});

describe('input buffering', () => {
  it('B pressed during a crossover queues behind-the-back', () => {
    const u = new Player({ id: 'USER', name: 'You', team: 0, pos: 'SG', core: core(70), nodes: ['dr_cross', 'dr_btb'], isUser: true });
    const g = makeGame({ mode: 'practice', practice: { defenders: 1, teammates: 0, runPlays: false } }, u);
    const idle = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false };
    for (let i = 0; i < 20; i++) g.update(1 / 60, { ...idle, move: { x: 0, y: 1 } }); // dribble down the screen
    g.update(1 / 60, { ...idle, move: { x: 0, y: -1 }, b: true, bHeld: true });     // stick up + ○ = crossover
    for (let i = 0; i < 10; i++) g.update(1 / 60, idle);
    g.update(1 / 60, { ...idle, b: true, bHeld: true }); // quick ○ tap mid-move…
    g.update(1 / 60, idle);                              // …released: queued as the chain
    for (let i = 0; i < 40; i++) g.update(1 / 60, idle);
    const moves = g.events.filter((e) => e.kind === 'move').map((e) => e.text);
    expect(moves).toEqual(['Crossover', 'Behind-the-Back']);
  });
});

describe('three-move chain', () => {
  it('crossover -> behind-the-back -> snatch-back', () => {
    const u = new Player({ id: 'USER', name: 'You', team: 0, pos: 'SG', core: core(70), nodes: ['dr_cross', 'dr_btb', 'dr_snatch'], isUser: true });
    const g = makeGame({ mode: 'practice', practice: { defenders: 1, teammates: 0, runPlays: false } }, u);
    const idle = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false };
    const run = (n: number) => { for (let i = 0; i < n; i++) g.update(1 / 60, idle); };
    for (let i = 0; i < 20; i++) g.update(1 / 60, { ...idle, move: { x: 0, y: 1 } });
    g.update(1 / 60, { ...idle, move: { x: 0, y: -1 }, b: true, bHeld: true }); run(26);
    g.update(1 / 60, { ...idle, b: true, bHeld: true }); run(26);
    g.update(1 / 60, { ...idle, move: { x: -1, y: 0 }, b: true, bHeld: true }); run(30);
    expect(g.events.filter((e) => e.kind === 'move').map((e) => e.text)).toEqual(['Crossover', 'Behind-the-Back', 'Snatch-Back']);
  });
});

describe('chase-down ultimate', () => {
  function trial(seed: number, useUlt: boolean) {
    const u = new Player({ id: 'USER', name: 'You', team: 0, pos: 'C', core: core(70), isUser: true });
    const g = makeGame({ seed, ult: { unlocked: true, id: 'chaseDown', level: 0 } }, u);
    g.inbound(1);
    const h = g.holder()!;
    const side = g.side(1);
    // breakaway: handler sprinting at the rim, user trailing behind, everyone else far away
    for (const p of g.players) p.p = hc(side, 70, p.team === 0 ? -20 : 20);
    h.p = hc(side, 22, 0); u.p = hc(side, 27, 0);
    h.aiMode = 'drive'; h.aiModeUntil = 99;
    u.ultCharge = 100;
    const idle = { move: { x: 0, y: 0 }, sprint: true, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false };
    g.update(1 / 60, { ...idle, x: useUlt });
    for (let i = 0; i < 150; i++) g.update(1 / 60, idle);
    return g.events.some((e) => e.kind === 'block');
  }
  it('locks on and blocks from behind far more often than a normal chase', () => {
    let withUlt = 0, without = 0;
    for (let s = 1; s <= 30; s++) { if (trial(s, true)) withUlt++; if (trial(s, false)) without++; }
    console.log(`chase-down blocks: ult ${withUlt}/30, no ult ${without}/30`);
    expect(withUlt).toBeGreaterThan(without + 8);
  });
});

describe('playtest round 4 mechanics', () => {
  const idle = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false };
  const practice = (nodes: string[] = [], core = 70) => {
    const u = new Player({ id: 'USER', name: 'You', team: 0, pos: 'SG', core: { shooting: core, finishing: core, strength: core, mobility: core, playmaking: core }, nodes, isUser: true });
    const g = makeGame({ mode: 'practice', practice: { defenders: 0, teammates: 0, runPlays: false } }, u);
    return { g, u };
  };
  it('floaters are less accurate than before', () => {
    const p = mk(); p.p = hc(1, 10, 0);
    expect(evaluateShot(p, [], 1, 'floater', { now: 0, clutch: false }).terms[0].value).toBeLessThan(0.5); // was ~0.54 here
  });
  it('sprint is a timed burst with a cooldown; mobility recovers faster', () => {
    const { g, u } = practice();
    const run = u.runSpeed;
    g.update(1 / 60, { ...idle, move: { x: 1, y: 0 }, sprint: true });
    expect(g.topSpeed(u)).toBeCloseTo(u.burstSpeed);
    expect(u.burstSpeed).toBeGreaterThan(run);
    for (let i = 0; i < 60 * 3; i++) g.update(1 / 60, { ...idle, move: { x: 1, y: 0 } });
    expect(g.topSpeed(u)).toBeCloseTo(u.runSpeed);
    const before = u.burstUntil;
    g.update(1 / 60, { ...idle, sprint: true }); // still recharging
    expect(u.burstUntil).toBe(before);
    expect(mk({ core: { shooting: 60, finishing: 60, strength: 60, mobility: 95, playmaking: 60 } }).burstCd).toBeLessThan(mk({ core: { shooting: 60, finishing: 60, strength: 60, mobility: 40, playmaking: 60 } }).burstCd);
  });
  it('side drive covers real distance, and a stick flick (no button) crosses over', () => {
    for (const [nodes, expected] of [[['dr_cross'], 'Crossover'], [[], 'Change of Direction']] as const) {
      const { g, u } = practice([...nodes]);
      const y0 = u.p.y;
      g.update(1 / 60, { ...idle, move: { x: 0, y: 1 }, b: true });
      for (let i = 0; i < 30; i++) g.update(1 / 60, { ...idle, move: { x: 0, y: 1 } });
      expect(u.p.y - y0).toBeGreaterThan(8);
      g.update(1 / 60, { ...idle, move: { x: 0, y: -1 } }); // flick up, no button
      const moves = g.events.filter((e) => e.kind === 'move').map((e) => e.text);
      expect(moves).toEqual(['Side Drive', expected]);
    }
  });
  it('a pump fake picks up the dribble: no moving or dribbling, but you can still pass or shoot', () => {
    const { g, u } = practice();
    u.dribbledSinceCatch = true; // already dribbling (a fake on the catch keeps the dribble, see below)
    g.update(1 / 60, { ...idle, a: true, aHeld: true }); g.update(1 / 60, idle); // quick ✕ tap = pump fake
    for (let i = 0; i < 30; i++) g.update(1 / 60, idle);
    expect(u.deadDribble).toBe(true);
    const p0 = { ...u.p };
    for (let i = 0; i < 30; i++) g.update(1 / 60, { ...idle, move: { x: 1, y: 0 } });
    expect(Math.hypot(u.p.x - p0.x, u.p.y - p0.y)).toBeLessThan(0.3);
    g.update(1 / 60, { ...idle, move: { x: 0, y: 1 }, b: true, bHeld: true });
    expect(g.events.filter((e) => e.kind === 'move').length).toBe(1);
    g.update(1 / 60, { ...idle, a: true, aHeld: true });
    for (let i = 0; i < 12; i++) g.update(1 / 60, { ...idle, aHeld: true });
    expect(u.state).toBe('shoot');
  });
});

describe('inbounds, transition, equal touches', () => {
  const idle = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false };
  it('after a made basket a big walks out of bounds and passes it in to the point guard (nobody teleports)', () => {
    const g = makeGame({ seed: 4 });
    let checked = false;
    for (let i = 0; i < 60 * 400 && !checked; i++) {
      const before = g.events.length;
      g.update(1 / 60, idle);
      const madeNow = g.events.slice(before).some((e) => e.kind === 'net');
      if (madeNow && g.inb) {
        const inb = g.inb;
        expect(['4', '5']).toContain(inb.inbounder.role);
        const pg = inb.receiver;
        let maxJump = 0, prev = { ...pg.p };
        let passes = 0;
        for (let k = 0; k < 60 * 8 && g.inb; k++) {
          const b2 = g.events.length;
          g.update(1 / 60, idle);
          maxJump = Math.max(maxJump, Math.hypot(pg.p.x - prev.x, pg.p.y - prev.y)); prev = { ...pg.p };
          passes += g.events.slice(b2).filter((e) => e.kind === 'pass').length;
        }
        g.update(1 / 60, idle);
        expect(g.inb).toBeNull();
        expect(inb.inbounder.p.x < 1 || inb.inbounder.p.x > 93).toBe(true); // he was out of bounds
        expect(g.events.some((e) => e.kind === 'pass' && e.pid === inb.inbounder.id)).toBe(true);
        expect(maxJump).toBeLessThan(1); // the PG walked there
        checked = true;
      }
    }
    expect(checked).toBe(true);
  });
  it('with "feature me" on, the coach runs about a fifth of the sets for you', () => {
    const u = new Player({ id: 'USER', name: 'You', team: 0, pos: 'C', core: core(60), isUser: true });
    const g = makeGame({ featureUser: true }, u);
    g.inbound(0);
    let mine = 0;
    for (let i = 0; i < 50; i++) { g.callPlay(); if (g.runner.focusPid === 'USER') mine++; }
    expect(mine).toBeGreaterThanOrEqual(8);
    expect(mine).toBeLessThanOrEqual(13);
  });
  it('a swapped play gives you the featured role even as a center', () => {
    const u = new Player({ id: 'USER', name: 'You', team: 0, pos: 'C', core: core(60), isUser: true });
    const g = makeGame({ featureUser: true, allowedPlays: ['floppy'] }, u);
    g.inbound(0);
    for (let i = 0; i < 10; i++) { g.callPlay(); if (g.runner.focusPid === 'USER') break; }
    expect(g.runner.focusPid).toBe('USER');
    expect(g.playRole(u)).toBe('2'); // Floppy is run for the 2-man
  });
});

describe('tap vs hold controls', () => {
  const idle = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false };
  const setup = (nodes: string[] = []) => {
    const u = new Player({ id: 'USER', name: 'You', team: 0, pos: 'SG', core: core(70), nodes, isUser: true });
    return { g: makeGame({ mode: 'practice', practice: { defenders: 1, teammates: 0, runPlays: false } }, u), u };
  };
  it('✕ tap = pump fake (repeatable, no shot); ✕ hold = shot', () => {
    const { g, u } = setup();
    u.dribbledSinceCatch = true;
    for (let k = 0; k < 3; k++) { g.update(1 / 60, { ...idle, a: true, aHeld: true }); g.update(1 / 60, idle); for (let i = 0; i < 30; i++) g.update(1 / 60, idle); }
    expect(g.events.filter((e) => e.text === 'Pump Fake').length).toBe(3);
    expect(g.events.some((e) => e.kind === 'release')).toBe(false);
    expect(u.deadDribble).toBe(true);
    g.update(1 / 60, { ...idle, a: true, aHeld: true });
    for (let i = 0; i < 9; i++) { g.update(1 / 60, { ...idle, aHeld: true }); expect(i < 9 && u.state === 'shoot' ? i >= 9 : true).toBe(true); }
    for (let i = 0; i < 3; i++) g.update(1 / 60, { ...idle, aHeld: true });
    expect(u.state).toBe('shoot');
  });
  it('hold ○ and flick: crossover, then flick back for the double crossover', () => {
    const { g } = setup(['dr_cross', 'dr_dbl']);
    for (let i = 0; i < 20; i++) g.update(1 / 60, { ...idle, move: { x: 0, y: 1 } }); // dribbling down
    g.update(1 / 60, { ...idle, b: true, bHeld: true });                              // ○ down, stick neutral
    g.update(1 / 60, { ...idle, bHeld: true, move: { x: 0, y: -1 } });                // flick up = cross
    for (let i = 0; i < 6; i++) g.update(1 / 60, { ...idle, bHeld: true });           // back to neutral
    for (let i = 0; i < 22; i++) g.update(1 / 60, { ...idle, bHeld: true, move: { x: 0, y: 1 } }); // flick down = double cross
    expect(g.events.filter((e) => e.kind === 'move').map((e) => e.text)).toEqual(['Crossover', 'Double Crossover']);
  });
  it('a quick neutral ○ tap is a jab step that keeps the dribble', () => {
    const { g, u } = setup();
    g.update(1 / 60, { ...idle, b: true, bHeld: true }); g.update(1 / 60, idle);
    expect(g.events.filter((e) => e.kind === 'move').map((e) => e.text)).toEqual(['Jab Step']);
    expect(u.deadDribble).toBe(false);
  });
  it('the HUD move list matches what the resolver fires', () => {
    const { g, u } = setup(['dr_cross', 'dr_stepback']);
    u.vel = { x: 0, y: 8 };
    const toRim = { x: 1, y: 0 };
    const list = availableMoves(u, toRim, g.time, 3);
    for (const m of list) expect(resolveMove(u, m.dir, toRim, g.time, 3)).toBe(m.id);
    expect(list.find((m) => m.dir.y < 0)!.id).toBe('crossover');
    expect(list.find((m) => m.dir.x < 0)!.id).toBe('stepback');
  });
});

describe('rebounding: live rim, airballs, box-outs, crash roles', () => {
  it('physical shots: planned makes drop through, misses never do, and misses touch the hoop in varied ways', () => {
    const r = new Rng(3);
    const hoop = { x: 88.75, y: 25, dir: 1 as const };
    const contactCounts = new Set<number>();
    let swishes = 0, boards = 0;
    for (let i = 0; i < 120; i++) {
      const ang = (i % 7) * 0.2 - 0.6, d = 6 + (i % 5) * 5;
      const release = { x: hoop.x - Math.cos(ang) * d, y: 25 + Math.sin(ang) * d, z: 9.3 };
      const type = d > 22 ? 'three' : d > 10 ? 'mid' : 'floater';
      const made = planShot({ release, hoop, type, made: true, airball: false, dist: d, contest: 0.2 }, r);
      expect(made.through).not.toBeNull();
      if (made.swish) swishes++;
      const miss = planShot({ release, hoop, type, made: false, airball: false, dist: d, contest: 0.3 }, r);
      expect(miss.through).toBeNull();
      expect(miss.airball).toBe(false);
      contactCounts.add(Math.min(4, miss.contacts.length));
      if (miss.contacts.some((c) => c.kind === 'board')) boards++;
      const air = planShot({ release, hoop, type, made: false, airball: true, dist: d, contest: 0.6 }, r);
      expect(air.contacts.length).toBe(0); expect(air.through).toBeNull();
    }
    expect(swishes).toBeGreaterThan(20); expect(swishes).toBeLessThan(100); // not every make is a swish
    expect(contactCounts.size).toBeGreaterThanOrEqual(3); // one clank, two, rattles...
    expect(boards).toBeGreaterThan(3);
  });
  it('deep misses come off the rim harder and land farther away than short misses; same seed, same shot', () => {
    const hoop = { x: 88.75, y: 25, dir: 1 as const };
    const landing = (d: number, type: string) => {
      const r = new Rng(11); let sum = 0;
      for (let i = 0; i < 80; i++) {
        const p = planShot({ release: { x: hoop.x - d, y: 25, z: 9.4 }, hoop, type, made: false, airball: false, dist: d, contest: 0.2 }, r);
        // where the loose ball comes down (ballistic from the hoop exit)
        const { p: e, v: ve } = p.end;
        const tFall = (ve.z + Math.sqrt(ve.z * ve.z + 2 * 32 * Math.max(0, e.z - 4))) / 32;
        sum += Math.hypot(e.x + ve.x * tFall - hoop.x, e.y + ve.y * tFall - hoop.y);
      }
      return sum / 80;
    };
    expect(landing(30, 'deep3')).toBeGreaterThan(landing(8, 'floater') * 1.3);
    const a = planShot({ release: { x: 70, y: 20, z: 9 }, hoop, type: 'three', made: false, airball: false, dist: 19, contest: 0 }, new Rng(5));
    const b = planShot({ release: { x: 70, y: 20, z: 9 }, hoop, type: 'three', made: false, airball: false, dist: 19, contest: 0 }, new Rng(5));
    expect(a.end).toEqual(b.end);
  });
  it('in real games, airballs only come from bad shots', () => {
    let air = 0;
    for (const seed of [1, 2, 3]) {
      const g = makeGame({ seed });
      const shots: { pct: number; contest: number; dist: number; air: boolean }[] = [];
      const idle = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false };
      let lastShot: any = null;
      for (let t = 0; t < 60 * 900 && !g.over; t++) {
        g.update(1 / 60, idle);
        const st = g.ball.st as any;
        if (st.kind === 'shot' && st !== lastShot) { lastShot = st; shots.push({ pct: st.ev.pct, contest: st.ev.contest, dist: st.ev.dist, air: !!st.airball }); }
      }
      for (const s of shots) if (s.air) { air++; expect(s.pct < 0.25 || s.dist > 30).toBe(true); }
    }
    expect(air).toBeGreaterThanOrEqual(0);
  });
  it('a strong boxer knocks back a weaker player trying to go through him; a weak one gets beaten', () => {
    const run = (boxStr: number, moveStr: number) => {
      const g = makeGame({ seed: 5 });
      g.inbound(0);
      const shooter = g.offense()[0];
      const boxer = g.defense()[0], mover = g.offense()[1];
      boxer.core.strength = boxStr; boxer.recompute(); mover.core.strength = moveStr; mover.recompute();
      const rim = g.rim(0);
      for (const p of g.players) p.p = { x: 50, y: 5 + Math.random() };
      boxer.p = { x: rim.x - 6, y: rim.y }; mover.p = { x: rim.x - 8.2, y: rim.y };
      g.ball.st = { kind: 'shot', shooter, a: { ...rim }, z0: 9, t: 0, dur: 9, made: false, pts: 2, ev: { type: 'mid', dist: 15, pts: 2, pct: 0.4, contest: 0, terms: [], conds: new Set(), contestBy: [] }, foul: false } as any;
      g.freezeAI = true;
      boxer.boxingOut = true;
      mover.want = { x: 12, y: 0 }; mover.vel = { x: 10, y: 0 };
      (g as any).boxOut(boxer, mover, 2.2);
      return { bumped: mover.bumpedUntil > g.time, d: Math.hypot(mover.p.x - boxer.p.x, mover.p.y - boxer.p.y) };
    };
    const strong = run(95, 40);
    expect(strong.bumped).toBe(true);
    expect(strong.d).toBeGreaterThan(3);
    expect(run(30, 95).bumped).toBe(false);
  });
  it('centers crash the glass; shooting power forwards mostly get back', () => {
    const g = makeGame({ seed: 8 });
    g.inbound(0);
    const team = g.teams[0].onCourt;
    const c = team.find((p) => p.role === '5')!, pf = team.find((p) => p.role === '4')!;
    const shooter = team.find((p) => p.role === '1')!;
    let cc = 0, pfShooter = 0, pfBig = 0;
    for (let i = 0; i < 200; i++) {
      pf.core.shooting = 95; pf.recompute();
      g.giveBall(shooter); shooter.state = 'idle'; shooter.pendingShot = { type: 'mid' }; (g as any).releaseShot(shooter);
      if (c.crashing) cc++; if (pf.crashing) pfShooter++;
      pf.core.shooting = 35; pf.recompute();
      g.giveBall(shooter); shooter.state = 'idle'; shooter.pendingShot = { type: 'mid' }; (g as any).releaseShot(shooter);
      if (pf.crashing) pfBig++;
    }
    expect(cc / 200).toBeGreaterThan(0.9);
    expect(pfShooter).toBeLessThan(pfBig);
  });
});

describe('basket-relative moves, fixed distances, screens, shot hang time', () => {
  const idle = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false };
  it('from the wing, "toward the hoop" is hesi and "across the line, the other way" is a crossover', () => {
    const p = mk({ nodes: ['dr_cross'] });
    const toRim = norm({ x: 1, y: -1 }); // hoop is up and to the right
    const pr = { x: -toRim.y, y: toRim.x };
    p.vel = scale(pr, 8); // moving across the line one way
    expect(resolveMove(p, toRim, toRim, 0, 3)).toBe('hesi');
    expect(resolveMove(p, scale(toRim, -1), toRim, 0, 3)).toBe('retreat');
    expect(resolveMove(p, scale(pr, -1), toRim, 0, 3)).toBe('crossover');
    expect(resolveMove(p, { x: 0, y: -1 }, toRim, 0, 3)).not.toBe('crossover'); // plain "up" is not the cross here (it's toward-ish)
  });
  it('every move covers its fixed distance regardless of stick angle or tilt', () => {
    for (const [stick, expected] of [[{ x: 0, y: 1 }, 12], [{ x: 0.3, y: 0.9 }, 12], [{ x: 0.2, y: 0.45 }, 12], [{ x: 1, y: 0 }, 3]] as const) {
      const u = new Player({ id: 'USER', name: 'You', team: 0, pos: 'SG', core: core(70), isUser: true });
      const g = makeGame({ mode: 'practice', practice: { defenders: 0, teammates: 0, runPlays: false } }, u);
      const p0 = { ...u.p };
      g.update(1 / 60, { ...idle, move: stick, b: true, bHeld: true });
      for (let i = 0; i < 70; i++) g.update(1 / 60, idle);
      const d = Math.hypot(u.p.x - p0.x, u.p.y - p0.y);
      expect(d, JSON.stringify(stick)).toBeGreaterThan(expected * 0.85);
      expect(d, JSON.stringify(stick)).toBeLessThan(expected * 1.15);
    }
  });
  it('a screen knocks the defender back with the bumped animation', () => {
    const g = makeGame({ seed: 2 });
    g.inbound(0);
    const scr = g.offense()[4], def = g.defense()[0];
    scr.state = 'screen'; scr.stateT = 0; scr.stateDur = 1.1;
    scr.p = { x: 60, y: 25 }; def.p = { x: 61.8, y: 25 };
    const before = Math.hypot(def.p.x - scr.p.x, def.p.y - scr.p.y);
    (g as any).screenContact(scr, def, 1.8);
    expect(def.bumpedUntil).toBeGreaterThan(g.time);
    expect(def.anim?.name).toBe('bumped');
    expect(Math.hypot(def.p.x - scr.p.x, def.p.y - scr.p.y)).toBeGreaterThan(before + 0.5);
  });
  it('a 24 ft three hangs in the air at least 1.2s; a rebound grab plays the rebound animation', () => {
    const g = makeGame({ seed: 6 });
    g.inbound(0);
    const s = g.byRole(0, '2')!;
    s.p = hc(1, 29, 0);
    g.giveBall(s); s.pendingShot = { type: 'three' }; (g as any).releaseShot(s);
    const st = g.ball.st as any;
    if (st.kind === 'shot') expect(st.dur).toBeGreaterThanOrEqual(1.2);
    let grabbed = false;
    for (let i = 0; i < 60 * 6 && !grabbed; i++) { g.update(1 / 60, idle); grabbed = g.players.some((p) => ['rebound', 'scoop', 'reboundChest'].includes(p.anim?.name ?? '')); }
    expect(grabbed || g.events.some((e) => e.kind === 'net')).toBe(true);
  });
});

describe('round 20: net, screens, passing reads, stars', () => {
  const idle = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false };
  it('after a make the ball drops out of the net, bounces on the floor, and the inbounder picks it up there', () => {
    const g = makeGame({ seed: 4 });
    let checked = false;
    for (let i = 0; i < 60 * 400 && !checked; i++) {
      const before = g.events.length;
      g.update(1 / 60, idle);
      if (!g.events.slice(before).some((e) => e.kind === 'net') || !g.inb) continue;
      const st = g.ball.st;
      expect(st.kind === 'dead' && st.vz !== undefined).toBe(true); // still falling, not parked in the net
      const rim = g.ball.p;
      let minZ = 99, bounces = 0;
      for (let k = 0; k < 60 && !g.inb.hasBall; k++) {
        const b2 = g.events.length; g.update(1 / 60, idle);
        minZ = Math.min(minZ, g.ball.z); bounces += g.events.slice(b2).filter((e) => e.kind === 'bounce').length;
      }
      expect(minZ).toBeLessThan(0.6);
      expect(bounces).toBeGreaterThan(0);
      expect(Math.hypot(g.ball.p.x - rim.x, g.ball.p.y - rim.y)).toBeLessThan(6); // stays near the hoop
      checked = true;
    }
    expect(checked).toBe(true);
  });
  it('screens: stronger screener / less mobile defender = longer stun and knock-back; perks scale it', () => {
    const scr = mk({ core: { shooting: 50, finishing: 50, strength: 85, mobility: 50, playmaking: 50 } });
    const weak = mk({ core: { shooting: 50, finishing: 50, strength: 45, mobility: 45, playmaking: 50 } });
    const strong = mk({ core: { shooting: 50, finishing: 50, strength: 85, mobility: 80, playmaking: 50 } });
    const a = screenImpact(scr, weak), b = screenImpact(scr, strong);
    expect(a.stun).toBeGreaterThan(b.stun + 0.4);
    expect(a.knock).toBeGreaterThan(b.knock);
    const wall = mk({ core: scr.core, nodes: ['sc_root'] });
    expect(screenImpact(wall, strong).stun).toBeGreaterThan(b.stun * 1.25);
    const nav = mk({ core: weak.core, nodes: ['pd_root', 'pd_contest', 'pd_close', 'pd_navigate'] });
    expect(screenImpact(scr, nav).stun).toBeLessThan(a.stun * 0.7);
    expect(screenImpact(scr, nav).knock).toBeLessThan(a.knock * 0.7);
  });
  it('holding ○ keeps the screen up until it is released', () => {
    const u = new Player({ id: 'USER', name: 'You', team: 0, pos: 'C', core: core(70), isUser: true });
    const g = makeGame({ seed: 3 }, u);
    g.inbound(0);
    for (let i = 0; i < 60 && g.holder() === u; i++) g.update(1 / 60, idle);
    g.freezeAI = true; // nobody shoots or turns it over while we hold
    g.update(1 / 60, { ...idle, b: true, bHeld: true });
    expect(u.state).toBe('screen');
    for (let i = 0; i < 150; i++) g.update(1 / 60, { ...idle, bHeld: true });
    expect(u.state).toBe('screen'); // 2.5 s in, still holding
    for (let i = 0; i < 20; i++) g.update(1 / 60, idle);
    expect(u.state).not.toBe('screen');
  });
  it('safe passing range is longer, and overhead passes to runners in transition go further still', () => {
    const p = mk({ core: core(60) });
    expect(p.safePassDist).toBeGreaterThan(40);
    const g = makeGame({ seed: 5 });
    g.inbound(0);
    const [a, b] = g.offense();
    a.p = hc(1, 80, 0); b.p = hc(1, 30, 10); b.vel = { x: 0, y: 0 };
    for (const d of g.defense()) d.p = hc(1, 90, 20);
    const half = g.passSafety(a, b);
    expect(half.overhead).toBe(false);
    b.vel = scale(norm(sub(rimPos(1), b.p)), 18);
    g.transitionUntil = g.time + 5; g.possession = a.team;
    const fast = g.passSafety(a, b);
    expect(fast.overhead).toBe(true);
    expect(fast.safe).toBeGreaterThan(half.safe * 1.3);
  });
  it('a pump fake on the catch keeps the dribble; after dribbling it picks it up', () => {
    const g = makeGame({ seed: 6 });
    g.inbound(0);
    const p = g.offense()[1];
    g.giveBall(p);
    g.pumpFake(p);
    expect(p.deadDribble).toBe(false);
    p.state = 'idle'; p.dribbledSinceCatch = true;
    g.pumpFake(p);
    expect(p.deadDribble).toBe(true);
  });
  it('every real roster has one or two designated stars, and the coach calls isos for them', () => {
    const g = makeGame({ seed: 8 });
    for (const t of g.teams) { const n = t.roster.filter((p) => p.star).length; expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(2); }
    simToEnd(g);
    const isos = g.events.filter((e) => e.kind === 'play' && e.text.includes('Iso for')).length;
    const plays = g.events.filter((e) => e.kind === 'play').length;
    expect(isos).toBeGreaterThan(plays * 0.1);
    expect(isos).toBeLessThan(plays * 0.5);
  });
});

describe('round 22: grabs by ball height, box score', () => {
  const grab = (z: number) => {
    const g = makeGame({ seed: 9 });
    g.inbound(0);
    const p = g.offense()[2];
    for (const q of g.players) if (q !== p) q.p = { x: q.p.x, y: 48 };
    p.p = { x: 40, y: 25 }; p.z = 0; p.vz = 0; p.state = 'idle';
    g.ball.p = { x: 40.5, y: 25 }; g.ball.z = z;
    g.ball.st = { kind: 'loose', vel: { x: 0, y: 0 }, vz: 0, lastTeam: 1 };
    (g as any).tryGrab();
    return { anim: p.anim?.name, jumped: p.vz > 0, holder: g.holder() === p };
  };
  it('a ball on the floor is scooped up, a chest-high one caught, a high one reached for (jumping only above reach)', () => {
    expect(grab(0.4)).toEqual({ anim: 'scoop', jumped: false, holder: true });
    expect(grab(4.5)).toEqual({ anim: 'reboundChest', jumped: false, holder: true });
    const high = grab(8.6);
    expect(high.anim).toBe('rebound');
  });
  it('box score shows the three most valuable stats by weight, padded with PTS/REB/AST', () => {
    const z = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 };
    expect(topStats(z).map((s) => s.label)).toEqual(['PTS', 'REB', 'AST']);
    expect(topStats({ ...z, pts: 12, reb: 3, ast: 2, stl: 2, blk: 0 }).map((s) => s.label)).toEqual(['PTS', 'STL', 'REB']);
    expect(topStats({ ...z, pts: 2, blk: 3 }).map((s) => s.label)).toEqual(['BLK', 'PTS', 'REB']);
    expect(topStats({ ...z, pts: 3, ast: 2 }).map((s) => s.label)).toEqual(['PTS', 'AST', 'REB']); // 3 vs 3: PTS first
  });
});
