import { describe, it, expect } from 'vitest';
import { makeGame } from './helpers';
import { emptyInput, FREIGHT, GameSim } from '../src/sim/game';
import { TEAMS } from '../src/sim/data';
import { generateRoster } from '../src/career/roster';
import { cpuUltFor } from '../src/sim/ultimates';
import { scoreCall, topScorer, isBig } from '../src/sim/plays/coach';
import { updatePost, postIntent, POST } from '../src/sim/post';
import { thinkDefense } from '../src/sim/ai/defense';
import { Player } from '../src/sim/player';
import { add, norm, scale, sub, v } from '../src/sim/math';

const live = (seed = 6) => {
  const g = makeGame({ seed });
  const inp = emptyInput();
  for (let t = 0; t < 30 && !(g.live && g.holder()); t += 1 / 30) g.update(1 / 30, inp);
  return g;
};
const withNode = (p: Player, id: string, on: boolean) => { p.nodes.delete(id); if (on) p.nodes.add(id); p.recompute(); };
const realGame = (a: string, b: string, seed = 3) => {
  const ta = TEAMS.find((t) => t.id === a)!, tb = TEAMS.find((t) => t.id === b)!;
  return new GameSim({ mode: 'game', quarterLen: 180, seed, teams: [ta, tb], rosters: [generateRoster(ta, 0), generateRoster(tb, 1)], userId: null, trust: { team: 50, coach: 50 }, ult: { unlocked: false, id: null, level: 0 } } as any);
};

describe('round 74: Freight Train on the break only', () => {
  it('a live turnover gives the new offense 2 s; the other side and a made-basket inbound get nothing', () => {
    expect(FREIGHT.secs).toBe(2);
    const g = live();
    const h = g.holder()!, d = g.opp(h.team)[0];
    withNode(d, 'dv_freight', true); withNode(h, 'dv_freight', true);
    g.changePossessionLive(d.team);
    expect(d.freightUntil).toBeCloseTo(g.time + FREIGHT.secs, 5);
    expect(h.freightUntil).toBeLessThan(g.time);
    const g2 = live();
    const o = g2.opp(g2.holder()!.team)[0];
    withNode(o, 'dv_freight', true);
    g2.deadBall(o.team, 1.0); // after a make: the other team inbounds
    for (let t = 0; t < 0.5; t += 1 / 30) g2.update(1 / 30, emptyInput());
    expect(o.freightUntil).toBeLessThan(g2.time);
  });
  it('no break in a half-court game', () => {
    const g = makeGame({ seed: 4, halfCourt: true } as any);
    for (let t = 0; t < 30 && !(g.live && g.holder()); t += 1 / 30) g.update(1 / 30, emptyInput());
    const d = g.opp(g.holder()!.team)[0];
    withNode(d, 'dv_freight', true);
    g.changePossessionLive(d.team);
    expect(d.freightUntil).toBeLessThan(g.time);
  });
});

describe('round 74: ultimates', () => {
  it('Jokić takes the step-back three; other star centers keep the chase-down', () => {
    const den = generateRoster(TEAMS.find((t) => t.id === 'DEN')!, 0);
    expect(cpuUltFor(den.find((p) => p.name === 'Nikola Jokić')!).id).toBe('deepStepback');
    const sas = generateRoster(TEAMS.find((t) => t.id === 'SAS')!, 0);
    expect(cpuUltFor(sas.find((p) => p.name === 'Victor Wembanyama')!).id).toBe('chaseDown');
  });
  const chaser = (g: GameSim) => {
    const h = g.holder()!;
    const d = g.opp(h.team).find((p) => p.pos === 'C')!;
    d.star = true; g.cpuUlts[d.id] = { unlocked: true, id: 'chaseDown', level: 0 };
    return { h, d };
  };
  it('a star big runs down a fast break from behind', () => {
    const g = live();
    const { h, d } = chaser(g);
    const rim = g.rim(h.team), toRim = norm(sub(rim, h.p));
    h.p = add(rim, scale(toRim, -20)); h.vel = scale(toRim, 14);
    d.p = add(h.p, scale(toRim, -6));
    g.transitionUntil = g.time + 5; g.runner.reset(); // a break: no set called yet
    expect(g.inTransition(h.team)).toBe(true);
    thinkDefense(g, d, 1 / 60);
    expect(g.ult.active?.id).toBe('chaseDown');
    expect(g.ult.active?.pid).toBe(d.id);
  });
  it('...and when he gets beaten on a half-court drive', () => {
    const g = live();
    const { h, d } = chaser(g);
    const rim = g.rim(h.team), toRim = norm(sub(rim, h.p));
    h.p = add(rim, scale(toRim, -12)); h.vel = scale(toRim, 12);
    d.p = add(h.p, scale(toRim, -4));
    g.transitionUntil = 0;
    thinkDefense(g, d, 1 / 60);
    expect(g.ult.active?.id).toBe('chaseDown');
  });
});

describe('round 74: star bigs in the post', () => {
  it('the coach feeds the post when the go-to scorer is a big', () => {
    const g = realGame('DEN', 'BOS');
    for (let t = 0; t < 30 && !(g.live && g.holder()); t += 1 / 30) g.update(1 / 30, emptyInput());
    const jok = g.players.find((p) => p.name === 'Nikola Jokić')!;
    expect(isBig(jok)).toBe(true);
    expect(topScorer(g.teams[jok.team].onCourt)).toBe(jok);
    const c = scoreCall(g, 'postSplit', jok, {}, []);
    expect(c.why === 'feed the post' || c.why === 'mismatch' || c.why === 'size mismatch').toBe(true);
    expect(c.score).toBeGreaterThan(scoreCall(g, 'isoTop', jok, {}, []).score);
  });
  const postUp = (star: boolean) => {
    const g = live();
    g.freezeAI = true;
    const h = g.holder()!;
    const rim = g.rim(h.team);
    h.p = add(rim, v(h.team === 0 ? -10 : 10, 0)); h.state = 'idle'; h.deadDribble = false; h.z = 0;
    const d = g.defenderOf(h) ?? g.opp(h.team)[0];
    d.guarding = h.id; d.p = add(h.p, scale(norm(sub(rim, h.p)), 2.2));
    h.star = star; h.sub.post = 60; d.sub.postD = 60; // an even battle: no double on strength alone
    postIntent(h, true, norm(sub(rim, h.p)));
    updatePost(g, 1 / 60);
    return h.post;
  };
  it('a star posting an even matchup draws a double; a role player does not', () => {
    let doubled = 0, plain = 0;
    for (let i = 0; i < 40; i++) { if (postUp(true)?.helpId) doubled++; if (postUp(false)?.helpId) plain++; }
    expect(postUp(true)).toBeTruthy();
    expect(doubled).toBeGreaterThan(10);
    expect(plain).toBe(0);
    expect(POST.HELP_STAR).toBeGreaterThan(POST.HELP_SCORER);
  });
});
