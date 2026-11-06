import { describe, it, expect } from 'vitest';
import { Player } from '../src/sim/player';
import { assignGuards, scorerRep, scorerStyle, threatWeight, guardFit, newHeat, afterShot, HEAT_AT, tierCap } from '../src/sim/attention';
import { TEAMS } from '../src/sim/data';
import { GameSim } from '../src/sim/game';
import { generateRoster } from '../src/career/roster';
import { Position } from '../src/sim/attributes';

const mk = (id: string, team: 0 | 1, pos: Position, height: number, role: string, sub: Record<string, number>, core: Partial<Record<string, number>> = {}) => {
  const p = new Player({ id, name: id, team, pos, height, core: { shooting: 55, finishing: 55, strength: 55, mobility: 55, playmaking: 55, ...core } as any });
  p.role = role;
  Object.assign(p.sub, { three: 55, mid: 55, layup: 55, dunk: 50, craft: 50, post: 45, hook: 45, ballSpeed: 55, perimD: 60, postD: 55, block: 55, speed: 60 }, sub);
  return p;
};
const weight = (o: Player) => threatWeight(scorerRep(o));
const isPerm = (m: Map<string, string>, offs: Player[]) => new Set(m.values()).size === offs.length && offs.every((o) => [...m.values()].includes(o.id));

describe('round 47: who guards whom', () => {
  const star = mk('STAR', 0, 'SG', 6.5, '2', { three: 95, mid: 95, layup: 88, craft: 90, ballSpeed: 88, speed: 80 }, { playmaking: 88 });
  const offs = [mk('o1', 0, 'PG', 6.25, '1', {}), star, mk('o3', 0, 'SF', 6.7, '3', {}), mk('o4', 0, 'PF', 6.85, '4', {}), mk('o5', 0, 'C', 7.0, '5', { post: 60, hook: 58 })];
  // a small scoring guard who can't defend, a lock-down wing, and three ordinary defenders
  const smallScorer = mk('d1', 1, 'PG', 6.1, '1', { perimD: 45, speed: 62, three: 92, mid: 92 });
  const stopper = mk('d3', 1, 'SF', 6.6, '3', { perimD: 85, speed: 82 });
  const defs = [smallScorer, mk('d2', 1, 'SG', 6.45, '2', { perimD: 62 }), stopper, mk('d4', 1, 'PF', 6.85, '4', { postD: 62 }), mk('d5', 1, 'C', 7.0, '5', { postD: 70, block: 72 }, { strength: 75 })];

  it('every man is guarded exactly once (5v5 and 3v3)', () => {
    expect(isPerm(assignGuards(defs, offs, weight), offs)).toBe(true);
    expect(isPerm(assignGuards(defs.slice(0, 3), offs.slice(0, 3), weight), offs.slice(0, 3))).toBe(true);
  });
  it('the stopper takes the star; the small scorer who can\'t defend hides elsewhere', () => {
    const m = assignGuards(defs, offs, weight);
    expect(m.get('d3')).toBe('STAR');
    expect(m.get('d1')).not.toBe('STAR');
  });
  it('a post scorer gets the big who can defend the post, not a guard', () => {
    expect(scorerStyle(offs[4])).toBe('post');
    const m = assignGuards(defs, offs, weight);
    expect(m.get('d5')).toBe('o5');
    expect(guardFit(defs[4], offs[4])).toBeGreaterThan(guardFit(smallScorer, offs[4]) + 20);
  });
  it('real rosters: NYK puts a wing on Luka, not Brunson', () => {
    const ta = TEAMS.find((t) => t.id === 'LAL')!, tb = TEAMS.find((t) => t.id === 'NYK')!;
    const g = new GameSim({ mode: 'game', quarterLen: 300, seed: 1, teams: [ta, tb], rosters: [generateRoster(ta, 0), generateRoster(tb, 1)], userId: null, trust: { team: 50, coach: 50 }, ult: { unlocked: false, id: null, level: 0 } });
    const luka = g.teams[0].onCourt.find((p) => p.name.startsWith('Luka'))!;
    const onLuka = g.teams[1].onCourt.find((d) => d.guarding === luka.id)!;
    expect(onLuka.name).not.toMatch(/Brunson/);
    expect(onLuka.pos === 'SF' || onLuka.pos === 'PF').toBe(true);
  });
});

describe('round 47: heat (the outliers who take most of the shots)', () => {
  /** He takes `share` of his team's shots; everyone else shoots 45% for 2. */
  const run = (share: number, makeEvery: (i: number) => boolean, rep: number, shots: number, cap = 3) => {
    const h = newHeat(), box = { fga: 0, fgm: 0, pts: 0 }, team = { fga: 0, pts: 0 };
    let others = 0, last = 0;
    for (let i = 0; i < shots; i++) {
      // the rest of the team's shots between his
      others += (1 - share) / share;
      while (others >= 1) { others--; team.fga++; if ((team.fga * 7) % 20 < 9) team.pts += 2; } // 45%, deterministic
      const made = makeEvery(i);
      box.fga++; team.fga++; if (made) { box.fgm++; box.pts += 2; team.pts += 2; }
      afterShot(h, rep, box, team, made, cap);
      expect(h.score).toBeGreaterThanOrEqual(last); last = h.score; // never cools
    }
    return h;
  };
  const efficient = (i: number) => i % 3 !== 2; // 67%
  it('a ball hog taking ~85% of the shots and making them climbs to triples, one tier at a time', () => {
    expect(run(0.85, efficient, 85, 40).tier).toBe(3);
  });
  it('half the shots → doubles, not triples', () => {
    expect(run(0.55, efficient, 85, 40).tier).toBe(2);
  });
  it('a normal star taking ~30% of the shots is left alone (at most keyed in)', () => {
    expect(run(0.3, efficient, 95, 30).tier).toBeLessThanOrEqual(1);
    expect(run(0.25, efficient, 95, 30).tier).toBe(0);
  });
  it('cold against the double: no extra man is sent, and the tier never steps down', () => {
    const h = run(0.85, (i) => (i < 24 ? efficient(i) : i % 4 === 0), 85, 50);
    expect(h.tier).toBe(2);
    expect(h.score).toBeGreaterThanOrEqual(HEAT_AT[2]);
  });
  it('3v3 stops at doubles; 1v1 never escalates', () => {
    expect(tierCap(5)).toBe(3); expect(tierCap(3)).toBe(2); expect(tierCap(1)).toBe(0);
    expect(run(0.9, () => true, 95, 40, 2).tier).toBe(2);
  });
});
