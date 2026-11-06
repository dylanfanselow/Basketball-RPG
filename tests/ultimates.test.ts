import { describe, it, expect } from 'vitest';
import { makeGame } from './helpers';
import { emptyInput, GameSim } from '../src/sim/game';
import { Player } from '../src/sim/player';
import { tryActivateUlt, ultAction, cpuUltFor, posterLane, STALL_S, AURA_COLOR } from '../src/sim/ultimates';
import { ULTIMATES } from '../src/sim/data';
import { dist } from '../src/sim/math';

const core = (n = 85) => ({ shooting: n, finishing: n, strength: n, mobility: n, playmaking: n }) as any;
const mkUser = (pos: string, id: string, level: number) => new Player({ id: 'U', name: 'Rookie', team: 0, pos: pos as any, height: pos === 'C' ? 6.11 : 6.5, core: core(), isUser: true });
function game(pos: string, ult: string, level: number, seed = 7): { g: GameSim; u: Player } {
  const u = mkUser(pos, ult, level);
  const g = makeGame({ seed, ult: { unlocked: true, id: ult, level } }, u);
  const inp = emptyInput();
  for (let t = 0; t < 30 && !(g.live && g.holder()); t += 1 / 30) g.update(1 / 30, inp);
  g.freezeAI = true;
  return { g, u };
}
/** you with the ball, `d` ft from the rim you attack, straight out */
function withBall(g: GameSim, u: Player, d: number) {
  const rim = g.rim(u.team), dir = Math.sign(47 - rim.x);
  g.possession = u.team; g.live = true; g.transitionUntil = 0;
  u.p = { x: rim.x + dir * d, y: rim.y }; u.vel = { x: -dir * 8, y: 0 }; u.state = 'idle';
  g.giveBall(u); g.setRhythm(u, 100);
  return { rim, dir };
}
const step = (g: GameSim, secs: number) => { const inp = emptyInput(); for (let t = 0; t < secs; t += 1 / 60) g.update(1 / 60, inp); };

describe('round 55: ultimates', () => {
  it('positions follow the owner\'s map; CPU stars get theirs by position', () => {
    expect(ULTIMATES.deepStepback.positions).toEqual(['PG', 'SG']);
    expect(ULTIMATES.ftTakeoff.positions).toEqual(['SG', 'SF', 'PF']);
    expect(ULTIMATES.chaseDown.positions).toEqual(['PF', 'C']);
    const p = (pos: string, o: Record<string, number> = {}) => { const q = new Player({ id: pos, name: pos, team: 1, pos: pos as any, core: core(80) }); Object.assign(q.sub, o); return q; };
    expect(cpuUltFor(p('PG')).id).toBe('deepStepback');
    expect(cpuUltFor(p('SF')).id).toBe('ftTakeoff');
    expect(cpuUltFor(p('C')).id).toBe('chaseDown');
    expect(cpuUltFor(p('SG', { three: 90, mid: 85, dunk: 50, layup: 60 })).id).toBe('deepStepback');
    expect(cpuUltFor(p('SG', { three: 50, mid: 55, dunk: 90, layup: 80 })).id).toBe('ftTakeoff');
    expect(cpuUltFor(p('PF', { block: 90, dunk: 60 })).id).toBe('chaseDown');
    expect(Object.keys(AURA_COLOR).sort()).toEqual(['C', 'PF', 'PG', 'SF', 'SG']);
  });

  it('Double Step-Back: two step-backs away from the rim, then the deep three is barely contested', () => {
    const { g, u } = game('PG', 'deepStepback', 0);
    const { rim } = withBall(g, u, 23);
    expect(tryActivateUlt(g, u)).toBe(true);
    step(g, 0.8);
    expect(dist(u.p, rim)).toBeGreaterThan(23 + 8); // ~5.5 ft twice
    expect(g.events.some((e) => e.text === 'Double step-back!')).toBe(true);
    const terms = u.mods.contestInTerms({ type: 'deep3', conds: new Set() } as any);
    expect(terms.some((t) => t.label.startsWith('ULT'))).toBe(true);
  });

  it('Lv2: the ult button again = a fake everyone near bites on; the Step-Through out of it is boosted', () => {
    const { g, u } = game('PG', 'deepStepback', 1);
    withBall(g, u, 23);
    for (const d of g.opp(u.team).slice(0, 2)) { d.p = { x: u.p.x + 3, y: u.p.y + (d === g.opp(u.team)[0] ? 1 : -1) }; d.z = 0; d.state = 'idle'; }
    expect(tryActivateUlt(g, u)).toBe(true);
    step(g, 0.1);
    for (const d of g.opp(u.team).slice(0, 2)) d.p = { x: u.p.x + 3, y: u.p.y }; // stay up on him
    expect(ultAction(g, u, 'fake')).toBe(true);
    step(g, 0.15);
    expect(g.opp(u.team).slice(0, 2).every((d) => d.z > 0 || d.state === 'jump')).toBe(true);
    expect(u.mods.shotTerms({ type: 'stepThrough', conds: new Set() } as any).some((t) => t.label.startsWith('ULT'))).toBe(true);
    // Lv1 has no fake: the ult button does nothing more
    const b = game('PG', 'deepStepback', 0, 9); withBall(b.g, b.u, 23); tryActivateUlt(b.g, b.u); step(b.g, 0.1);
    expect(ultAction(b.g, b.u, 'fake')).toBe(false);
  });

  it('Free-Throw-Line Dunk: everyone in his lane gets posterized; Lv2 stall = hang time with the contest wiped', () => {
    const { g, u } = game('SF', 'ftTakeoff', 1);
    const { rim, dir } = withBall(g, u, 15);
    const [d1, d2, d3] = g.opp(u.team);
    d1.p = { x: rim.x + dir * 8, y: rim.y + 1 }; d2.p = { x: rim.x + dir * 3, y: rim.y - 2 }; d3.p = { x: rim.x + dir * 8, y: rim.y + 15 };
    expect(tryActivateUlt(g, u)).toBe(true);
    const lane = posterLane(g, u);
    expect(lane).toContain(d1); expect(lane).toContain(d2); expect(lane).not.toContain(d3);
    step(g, 0.2);
    expect(u.state).toBe('shoot');
    expect(ultAction(g, u, 'fake')).toBe(true);
    expect(u.hangUntil).toBeGreaterThan(g.time + STALL_S * 0.5);
    expect(u.pendingShot?.override?.contestMult).toBeLessThan(0.1);
    expect(u.anim?.name).toBe('shot_dunk_clutch');
    expect(ultAction(g, u, 'fake')).toBe(false); // one stall
  });

  it('Lv3: △ in the air passes out right before the slam; the receiver is wide open', () => {
    const { g, u } = game('SF', 'ftTakeoff', 2);
    withBall(g, u, 15);
    const mate = g.teams[u.team].onCourt.find((p) => p !== u)!;
    mate.p = { x: u.p.x, y: u.p.y + 14 };
    expect(tryActivateUlt(g, u)).toBe(true);
    step(g, 0.25);
    expect(u.z).toBeGreaterThan(0);
    expect(ultAction(g, u, 'pass', mate)).toBe(true);
    expect(u.pendingShot).toBeNull();
    expect(g.ball.st.kind).toBe('pass');
    expect(mate.mods.contestInTerms({ type: 'three', conds: new Set() } as any).some((t) => t.label === 'ULT kick-out')).toBe(true);
  });

  it('Chase-Down: blocks almost no matter what (even from in front); Lv3 Swat & Go keeps it and runs', () => {
    let blocks = 0, n = 0, swatGo = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { g, u } = game('C', 'chaseDown', 2, seed);
      const sh = g.opp(u.team)[0], rim = g.rim(sh.team), dir = Math.sign(47 - rim.x);
      g.possession = sh.team; g.live = true; g.giveBall(sh); g.setRhythm(u, 100);
      sh.p = { x: rim.x + dir * 4, y: rim.y }; u.p = { x: rim.x + dir * 1.5, y: rim.y }; // right in front of him
      expect(tryActivateUlt(g, u)).toBe(true);
      sh.pendingShot = { type: 'layup' } as any; u.z = 2;
      (g as any).releaseShot(sh);
      n++;
      if (g.events.some((e) => e.kind === 'block')) {
        blocks++;
        if (g.possession === u.team && g.holder() === u && g.transitionUntil > g.time && u.mods.shotTerms({ type: 'layup', conds: new Set() } as any).some((t) => t.label === 'ULT Swat & Go')) swatGo++;
      }
    }
    expect(blocks / n).toBeGreaterThan(0.8);
    expect(swatGo).toBe(blocks);
  });

  it('the cinematic (slow-mo, dark, quiet) is for your ult and ones against you, not a CPU teammate\'s', () => {
    const { g, u } = game('PG', 'deepStepback', 0);
    withBall(g, u, 23);
    tryActivateUlt(g, u);
    expect(g.ult.active?.cinematic).toBe(true);
    const ev = g.events.filter((e) => e.kind === 'ult').pop()!;
    expect(ev.data).toMatchObject({ id: 'deepStepback', pos: 'PG', cinematic: true });
    const check = (team: 0 | 1) => {
      const b = game('PG', 'deepStepback', 0, 11);
      const p = b.g.teams[team].onCourt.find((q) => q !== b.u)!;
      p.star = true; b.g.cpuUlts[p.id] = { unlocked: true, id: 'deepStepback', level: 0 };
      withBall(b.g, p, 23);
      expect(tryActivateUlt(b.g, p)).toBe(true);
      return b.g.ult.active!.cinematic;
    };
    expect(check(1)).toBe(true);  // against you
    expect(check(0)).toBe(false); // your CPU teammate: aura + banner only
  });
});
