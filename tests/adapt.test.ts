import { describe, it, expect } from 'vitest';
import { makeGame } from './helpers';
import { emptyInput } from '../src/sim/game';
import { Player } from '../src/sim/player';
import { screenCoverage, newHeat } from '../src/sim/attention';
import { newCareer, applyGameResult } from '../src/career/career';

const mkUser = () => {
  const u = new Player({ id: 'U', name: 'Rookie', team: 0, pos: 'PG', height: 6.3, core: { shooting: 70, finishing: 75, strength: 60, mobility: 85, playmaking: 80 } as any });
  return u;
};
const live = (u?: Player) => {
  const g = makeGame({ seed: 6 }, u);
  const inp = emptyInput();
  for (let t = 0; t < 30 && !(g.live && g.holder()); t += 1 / 30) g.update(1 / 30, inp);
  return g;
};

describe('round 49: the defense learns your moves', () => {
  it('the same move again and again works less (3rd+ in 45 s), and recovers', () => {
    const u = mkUser(), g = live(u);
    expect(g.moveRead(u, 'crossover')).toBe(1);
    g.moveLog[u.id] = Array.from({ length: 4 }, (_, i) => ({ id: 'crossover', side: 1, at: g.time - i }));
    expect(g.moveRead(u, 'crossover')).toBeCloseTo(0.64, 2);
    expect(g.moveRead(u, 'hesi')).toBe(1);
    g.time += 50;
    expect(g.moveRead(u, 'crossover')).toBe(1);
  });
  it('his favourite side shows once he has a habit; AI players are never logged', () => {
    const u = mkUser(), g = live(u);
    g.moveLog[u.id] = [1, 1, 1, -1, 1].map((side, i) => ({ id: 'lateral', side, at: g.time - i }));
    expect(g.favoriteSide(u)).toBeCloseTo(0.6, 2);
    const ai = g.offense().find((p) => p !== u)!;
    g.giveBall(ai); g.dribbleMove(ai, { x: 0, y: 1 });
    expect(g.moveLog[ai.id]).toBeUndefined();
  });
});

describe('round 49: scouting report', () => {
  it('your games go into the report (last 5)', () => {
    const c = newCareer('T', 'PG');
    for (let i = 0; i < 7; i++) applyGameResult(c, { box: { pts: 30 + i } as any, won: true, grade: { good: 0, bad: 0, points: 0 }, milestones: [], scout: { pts: 30 + i, fga: 20, teamFga: 80, rim: 10, jumper: 20, post: 0 } });
    expect(c.scout!.length).toBe(5);
    expect(c.scout![4].pts).toBe(36);
  });
  it('a 35-a-night scorer starts keyed in; a known ball hog starts at doubles; a role player starts normal', () => {
    const scorer = { pts: 35, fga: 25, teamFga: 85, rim: 20, jumper: 15, post: 0 };
    let u = mkUser(), g = live(u);
    g.applyScouting([scorer, scorer, scorer]);
    expect(g.tierOf(u)).toBe(1);
    expect(g.heat[u.id].buckets.rim).toBe(10);
    expect(g.events.some((e) => /Scouting report/.test(e.text))).toBe(true);
    u = mkUser(); g = live(u);
    g.applyScouting([{ ...scorer, fga: 50 }, { ...scorer, fga: 52 }, { ...scorer, fga: 55 }]);
    expect(g.tierOf(u)).toBe(2);
    u = mkUser(); g = live(u);
    g.applyScouting([{ pts: 12, fga: 10, teamFga: 85, rim: 6, jumper: 6, post: 0 }]);
    expect(g.tierOf(u)).toBe(0);
  });
});

describe('round 49: screen coverages', () => {
  const g = live(), [a, b] = g.offense(), d1 = g.defense()[0], d2 = g.defense()[1];
  it('can\'t shoot → under; a shooter → blitz; similar defenders → switch; otherwise over', () => {
    a.sub.three = 55; a.sub.mid = 58;
    expect(screenCoverage(a, d1, d2, undefined)).toBe('under');
    a.sub.three = 88;
    expect(screenCoverage(a, d1, d2, undefined)).toBe('blitz');
    a.sub.three = 74; a.sub.mid = 74;
    Object.assign(d2.sub, d1.sub); d2.height = d1.height; d2.role = d1.role;
    expect(screenCoverage(a, d1, d2, undefined)).toBe('switch');
    d2.sub.perimD = 10; d2.sub.speed = 10;
    expect(screenCoverage(a, d1, d2, undefined)).toBe('over');
  });
  it('tonight counts: a poor shooter who keeps hitting jumpers stops getting the under', () => {
    const h = newHeat(); h.buckets = { rim: 4, jumper: 20, post: 0 };
    b.sub.three = 60; b.sub.mid = 62;
    expect(screenCoverage(b, d1, null, h)).not.toBe('under');
  });
});

describe('round 49: CPU effort when blown out', () => {
  it('a CPU-only team down 15+ turns it up, and lets go under 10; a team with a human never does', () => {
    const g = live(), inp = emptyInput();
    g.teams[0].score = 40; g.teams[1].score = 20;
    g.update(1 / 30, inp);
    expect(g.effort[1]).toBe(true);
    expect(g.events.some((e) => e.kind === 'effort')).toBe(true);
    g.teams[1].score = 32; g.update(1 / 30, inp);
    expect(g.effort[1]).toBe(false);
    const u = mkUser(), g2 = live(u);
    g2.teams[1].score = 60; g2.teams[0].score = 20; g2.update(1 / 30, inp);
    expect(g2.effort[u.team]).toBe(false);
  });
});
