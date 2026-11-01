import { describe, it, expect } from 'vitest';
import { Player } from '../src/sim/player';
import { hc, rimPos } from '../src/sim/court';
import { add, norm, scale, sub } from '../src/sim/math';
import { computeContest, bitOnFake } from '../src/sim/shooting';
import { buildOneOnOne, DEFAULT_1V1 } from '../src/sim/oneOnOne';
import { GameSim, UserInput } from '../src/sim/game';
import { makeGame } from './helpers';

const idle: UserInput = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false };
const core = (n = 60) => ({ shooting: n, finishing: n, strength: n, mobility: n, playmaking: n });

describe('pump fake → Step-Through', () => {
  /** Practice 1-on-1 at 13 ft from the rim, defender 4 ft in front. */
  const setup = (nodes: string[] = ['fi_stepthru']) => {
    const u = new Player({ id: 'USER', name: 'You', team: 0, pos: 'SG', core: core(70), nodes, isUser: true });
    const g = makeGame({ mode: 'practice', practice: { defenders: 1, teammates: 0, runPlays: false } }, u);
    const d = g.teams[1].onCourt[0];
    u.p = hc(1, 18, 0);
    d.p = add(u.p, scale(norm(sub(rimPos(1), u.p)), 4));
    d.p.y += 0.6; // a little to one side so the stride angle is defined
    return { g, u, d };
  };
  const fake = (g: GameSim) => { g.update(1 / 60, { ...idle, a: true, aHeld: true }); g.update(1 / 60, idle); };
  const shoot = (g: GameSim, move = { x: 0, y: 0 }) => {
    g.update(1 / 60, { ...idle, move, a: true, aHeld: true });
    for (let i = 0; i < 12; i++) g.update(1 / 60, { ...idle, move, aHeld: true });
  };
  const toRim = { x: 1, y: 0 }; // team 0 attacks +x

  it('the fake plays a full 0.42 s sell before the hold', () => {
    const { g, u } = setup();
    fake(g);
    expect(u.anim?.name).toBe('pumpfake');
    expect(u.state).toBe('dribbleMove');
    for (let i = 0; i < 20; i++) g.update(1 / 60, idle);
    expect(u.state).toBe('dribbleMove'); // still selling at ~0.35 s
    for (let i = 0; i < 10; i++) g.update(1 / 60, idle);
    expect(u.state).toBe('idle');
    expect(u.deadDribble).toBe(true);
  });

  it('needs the perk, a recent fake and the stick toward the rim', () => {
    for (const [nodes, move, expected] of [
      [['fi_stepthru'], toRim, true],
      [['fi_stepthru'], { x: 0, y: 0 }, false], // no stick: normal shot
      [['fi_stepthru'], { x: -1, y: 0 }, false], // stick away: normal shot (floater/fade)
      [[], toRim, false],                        // no perk
    ] as const) {
      const { g, u } = setup([...nodes]);
      fake(g);
      for (let i = 0; i < 6; i++) g.update(1 / 60, idle);
      shoot(g, move);
      expect(u.state).toBe('shoot');
      expect(u.pendingShot?.type === 'stepThrough').toBe(expected);
    }
  });

  it('strides on the floor first, then lifts off, and moves past the defender', () => {
    const { g, u } = setup();
    fake(g);
    for (let i = 0; i < 6; i++) g.update(1 / 60, idle);
    const x0 = u.p.x;
    g.update(1 / 60, { ...idle, move: toRim, a: true, aHeld: true });
    let groundedFrames = 0, airborne = false;
    for (let i = 0; i < 40 && u.state !== 'idle'; i++) {
      g.update(1 / 60, { ...idle, move: toRim, aHeld: true });
      if (u.pendingShot?.type !== 'stepThrough' && u.state === 'shoot') break;
      if (u.z === 0 && !airborne) groundedFrames++;
      if (u.z > 0) airborne = true;
    }
    expect(groundedFrames).toBeGreaterThanOrEqual(12); // TAP_S hold + stride on the floor
    expect(airborne).toBe(true);
    expect(u.p.x - x0).toBeGreaterThan(3.5);
  });

  it('a defender who bites on the fake can barely contest and cannot block the step-through', () => {
    const { g, u, d } = setup();
    fake(g);
    d.blockCdUntil = 0; d.state = 'idle'; d.z = 0;
    g.jump(d, 0.9); // bites
    expect(bitOnFake(d, u, g.time)).toBe(true);
    const bit = computeContest(u, [d], 1, 'stepThrough', g.time).raw;
    const honest = computeContest(u, [d], 1, 'stepThrough', g.time + 5).raw; // long after the bite
    expect(bit).toBeLessThan(honest * 0.3);
    for (let i = 0; i < 6; i++) g.update(1 / 60, idle);
    shoot(g, toRim);
    expect(g.events.some((e) => e.text.startsWith('STEP-THROUGH!'))).toBe(true);
    for (let i = 0; i < 60; i++) g.update(1 / 60, idle);
    expect(g.events.some((e) => e.kind === 'block')).toBe(false);
  });
});

describe('1v1 make it, take it', () => {
  it('builds a half-court game: one player a side, same hoop, unique ids for same-team picks', () => {
    const g = buildOneOnOne({ ...DEFAULT_1V1, p1Team: 'LAL', p2Team: 'LAL', p1Idx: 0, p2Idx: 0, p2Human: true }, 3);
    expect(g.teams[0].onCourt.length).toBe(1);
    expect(g.teams[1].onCourt.length).toBe(1);
    expect(g.side(0)).toBe(g.side(1));
    const ids = g.players.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(g.user2).toBe(g.teams[1].onCourt[0]);
    expect(g.isAI(g.user!)).toBe(false);
    expect(g.isAI(g.user2!)).toBe(false);
    expect(g.live).toBe(true);
    expect(g.holder()).toBe(g.teams[g.possession].onCourt[0]);
  });

  it('both humans get their own input', () => {
    const g = buildOneOnOne({ ...DEFAULT_1V1, p2Human: true }, 5);
    const p1 = g.user!, p2 = g.user2!;
    const a = { ...p1.p }, b = { ...p2.p };
    const up = { ...idle, move: { x: 0, y: -1 } }, down = { ...idle, move: { x: 0, y: 1 } };
    for (let i = 0; i < 30; i++) g.update(1 / 60, g.holder() === p1 ? idle : up, g.holder() === p2 ? idle : down);
    // whoever is on defense moved with their own stick
    if (g.holder() === p1) expect(p2.p.y - b.y).toBeGreaterThan(1);
    else expect(a.y - p1.p.y).toBeGreaterThan(1);
  });

  it('CPU vs CPU: scorer keeps the ball, buckets are 1s and 2s, ends at 11 win-by-2', () => {
    const g = buildOneOnOne({ ...DEFAULT_1V1, p1Team: 'OKC', p2Team: 'DEN' }, 11, false);
    let pendingScorer: 0 | 1 | null = null;
    let checks = 0, keeps = 0;
    for (let t = 0; t < 60 * 60 * 40 && !g.over; t++) {
      const before = g.events.length;
      const wasLive = g.live;
      g.update(1 / 60, idle);
      for (const e of g.events.slice(before)) if (e.kind === 'score') {
        expect(e.text).toMatch(/\+[12]$/);
        pendingScorer = e.team as 0 | 1;
      }
      if (!wasLive && g.live && pendingScorer !== null) {
        checks++; if (g.possession === pendingScorer) keeps++;
        pendingScorer = null;
      }
    }
    expect(g.over).toBe(true);
    const [a, b] = [g.teams[0].score, g.teams[1].score];
    expect(Math.max(a, b)).toBeGreaterThanOrEqual(11);
    expect(Math.abs(a - b)).toBeGreaterThanOrEqual(2);
    expect(checks).toBeGreaterThan(3);
    expect(keeps).toBe(checks);
    expect(g.shotClock).toBeLessThanOrEqual(14);
  });

  it('a defensive rebound or steal means the new offense checks it at the top', () => {
    const g = buildOneOnOne({ ...DEFAULT_1V1 }, 21, false);
    let changes = 0;
    for (let t = 0; t < 60 * 60 * 10 && !g.over; t++) {
      const pos = g.possession, live = g.live;
      g.update(1 / 60, idle);
      if (live && g.possession !== pos) {
        changes++;
        // goes dead immediately and resumes with the ball at the top
        expect(g.live).toBe(false);
        while (!g.live && !g.over) g.update(1 / 60, idle);
        const h = g.holder()!;
        expect(h.team).toBe(g.possession);
        const top = hc(g.side(h.team), 30, 0);
        expect(Math.hypot(h.p.x - top.x, h.p.y - top.y)).toBeLessThan(1);
      }
    }
    expect(changes).toBeGreaterThan(0);
  });
});
