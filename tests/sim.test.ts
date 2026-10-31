import { describe, it, expect } from 'vitest';
import { computeSubRatings, statFactor } from '../src/sim/attributes';
import { evaluateShot, selectShotType, computeContest } from '../src/sim/shooting';
import { resolveMove } from '../src/sim/moves';
import { passProbability } from '../src/sim/ai/trust';
import { planRotation } from '../src/sim/rotation';
import { Player } from '../src/sim/player';
import { hc, rimPos } from '../src/sim/court';
import { v, norm, sub } from '../src/sim/math';
import { newCareer, applyGameResult, spendStatPoint } from '../src/career/career';
import { canUnlock, unlock } from '../src/career/skilltree';
import { makeGame, simToEnd } from './helpers';
import { emptyBox } from '../src/sim/player';

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
    g.update(1 / 60, { ...idle, move: { x: 0, y: -1 }, b: true });                  // stick up + B = crossover
    for (let i = 0; i < 10; i++) g.update(1 / 60, idle);
    g.update(1 / 60, { ...idle, b: true }); // press mid-move
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
    g.update(1 / 60, { ...idle, move: { x: 0, y: -1 }, b: true }); run(26);
    g.update(1 / 60, { ...idle, b: true }); run(26);
    g.update(1 / 60, { ...idle, move: { x: -1, y: 0 }, b: true }); run(30);
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
    g.update(1 / 60, { ...idle, b: true }); // neutral stick = pump fake
    for (let i = 0; i < 30; i++) g.update(1 / 60, idle);
    expect(u.deadDribble).toBe(true);
    const p0 = { ...u.p };
    for (let i = 0; i < 30; i++) g.update(1 / 60, { ...idle, move: { x: 1, y: 0 } });
    expect(Math.hypot(u.p.x - p0.x, u.p.y - p0.y)).toBeLessThan(0.3);
    g.update(1 / 60, { ...idle, move: { x: 0, y: 1 }, b: true });
    expect(g.events.filter((e) => e.kind === 'move').length).toBe(1);
    g.update(1 / 60, { ...idle, a: true });
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
