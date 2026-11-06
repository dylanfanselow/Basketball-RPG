import { describe, it, expect } from 'vitest';
import { Player } from '../src/sim/player';
import { REAL_ROSTERS } from '../src/career/roster';
import { buildThrees, defaultLineup } from '../src/sim/threes';
import { inFrontcourt } from '../src/sim/court';
import { UserInput } from '../src/sim/game';
import { makeGame, simToEnd } from './helpers';

const idle: UserInput = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false };
const core = (n = 70) => ({ shooting: n, finishing: n, strength: n, mobility: n, playmaking: n });
const DT = 1 / 60;

describe('speed with the ball', () => {
  it('a little slower with it, and the sprint burst gives only half its gain', () => {
    const g = makeGame({ seed: 1 });
    const p = g.teams[0].onCourt[0];
    expect(p.ballSpeedMult).toBeLessThan(0.93);
    p.burstUntil = g.time + 1;
    const withBall = g.topSpeed(p, true), without = g.topSpeed(p, false);
    expect(without).toBeCloseTo(p.burstSpeed);
    expect(withBall).toBeLessThan(without);
    expect(withBall).toBeLessThan(p.runSpeed * 1.15);
  });
});

describe('bringing it up', () => {
  it('no press: the defender gives ground in the backcourt; the ball crosses quickly; no 8-second violations', () => {
    let far = 0, near = 0, viol = 0;
    const cross: number[] = [];
    for (const seed of [41, 42]) {
      const g = makeGame({ seed, quarterLen: 150 });
      const o = g.emit.bind(g); g.emit = (e) => { if (e.text === '8-second violation') viol++; o(e); };
      const tick = g.update.bind(g);
      let was = true, start = -1;
      g.update = (dt, a, b) => {
        tick(dt, a, b);
        if (!g.crossed && was) start = g.time;
        if (g.crossed && !was && start >= 0) cross.push(g.time - start);
        was = g.crossed;
        const h = g.holder();
        if (h && g.live && !g.crossed && !g.pressing[0] && !g.pressing[1] && !g.inTransition(h.team) && !inFrontcourt(g.side(h.team), h.p) && Math.abs(h.p.x - 47) > 20) {
          const d = g.defenderOf(h);
          if (d) { if (Math.hypot(d.p.x - h.p.x, d.p.y - h.p.y) > 5) far++; else near++; }
        }
      };
      simToEnd(g);
    }
    // round 49: a smarter CPU coach scores more → more inbounds after makes, where the defender starts closer
    // round 55: ult changes shift these seeded games; the defender still gives ground clearly more often than not
    expect(far).toBeGreaterThan(near * 1.4);
    expect(cross.reduce((a, b) => a + b, 0) / cross.length).toBeLessThan(6);
    expect(viol).toBeLessThanOrEqual(1);
  }, 40000);

  it('against a full-court press the AI breaks it: backcourt moves, screens called, most possessions cross', () => {
    let screens = 0, moves = 0, viol = 0, presses = 0;
    for (const seed of [43, 44]) {
      const g = makeGame({ seed, quarterLen: 150 });
      g.forcePress = true;
      const o = g.emit.bind(g);
      g.emit = (e) => {
        if (/"Screen!"/.test(e.text)) screens++;
        if (e.kind === 'move' && !g.crossed && /Drive|Cross|Direction|Hesi|Spin/.test(e.text)) moves++;
        if (e.text === '8-second violation') viol++;
        if (e.kind === 'press') presses++;
        o(e);
      };
      simToEnd(g);
    }
    expect(presses).toBeGreaterThan(50);
    expect(screens).toBeGreaterThan(0);
    expect(moves).toBeGreaterThan(0);
    expect(viol).toBeLessThan(presses * 0.1);
  }, 40000);

  it('teams press when trailing late', () => {
    const g = makeGame({ seed: 5, quarterLen: 120 });
    g.quarter = 4; g.clock = 20;
    g.teams[0].score = 80; g.teams[1].score = 86; // team 1 leads; team 0 trails
    g.possession = 1; g.giveBall(g.teams[1].onCourt[0]);
    g.teams[1].onCourt[0].p = { x: g.side(1) === 1 ? 20 : 74, y: 25 }; g.ball.p = { ...g.teams[1].onCourt[0].p };
    g.newPossession(false);
    expect(g.pressing[0]).toBe(true);
  });
});

describe('the 8-second rule', () => {
  it('standing in the backcourt with the ball = violation at 8 s (full-court games only)', () => {
    const u = new Player({ id: 'USER', name: 'You', team: 0, pos: 'PG', core: core(), isUser: true });
    const g = makeGame({ seed: 6, quarterLen: 300 }, u);
    for (let i = 0; i < 60 * 30 && !(g.live && g.possession === 0 && g.holder()); i++) g.update(DT, idle);
    g.freezeAI = true;
    g.possession = 0; g.giveBall(u);
    u.p = { x: g.side(0) === 1 ? 20 : 74, y: 25 }; g.ball.p = { ...u.p };
    g.newPossession(false);
    let violAt = -1;
    const o = g.emit.bind(g); g.emit = (e) => { if (e.text === '8-second violation' && violAt < 0) violAt = g.backcourtT; o(e); };
    for (let i = 0; i < 60 * 10 && violAt < 0; i++) g.update(DT, idle);
    expect(violAt).toBeGreaterThan(7.9);
    expect(violAt).toBeLessThan(8.2);
    const three = buildThrees({ myTeam: 'LAL', oppTeam: 'BOS', mine: defaultLineup(REAL_ROSTERS.LAL), theirs: defaultLineup(REAL_ROSTERS.BOS), playAs: 0, court: 'half' }, 3, { cpuOnly: true });
    expect(three.fullCourt).toBe(false);
  });
  it('a full AI game still finishes normally', () => {
    const g = makeGame({ seed: 7, quarterLen: 90 });
    simToEnd(g);
    expect(g.over).toBe(true);
  }, 20000);
});
