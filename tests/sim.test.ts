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
    const far = computeContest(p, [mkD(6.5)], side, 'three', 0).raw;
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
  });
  it('crossover chains into behind-the-back inside the window only', () => {
    const p = mk({ nodes: ['dr_cross', 'dr_btb'] });
    expect(resolveMove(p, v(0, 1), toRim, 0, 3)).toBe('crossover');
    p.lastMove = { id: 'crossover', endAt: 1.0, dir: v(0, 1) };
    expect(resolveMove(p, v(0, -1), toRim, 1.3, 3)).toBe('behindBack');
    expect(resolveMove(p, v(0, -1), toRim, 2.5, 3)).toBe('crossover');
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
