import { describe, it, expect } from 'vitest';
import { REAL_ROSTERS, generateRoster } from '../src/career/roster';
import { TEAMS, NODES, CORE_STATS } from '../src/sim/data';
import { HAIR_STYLES } from '../src/render/appearance';
import { makeGame } from './helpers';
import { PLAYS } from '../src/sim/data';

describe('real rosters', () => {
  it('cover all 30 teams with at least 10 valid players each', () => {
    expect(Object.keys(REAL_ROSTERS).sort()).toEqual(TEAMS.map((t) => t.id).sort());
    const names = new Set<string>();
    for (const [team, players] of Object.entries(REAL_ROSTERS)) {
      expect(players.length, team).toBeGreaterThanOrEqual(10);
      expect(new Set(players.slice(0, 5).map((p) => p.pos)).size, `${team} starters`).toBeGreaterThanOrEqual(4);
      for (const p of players) {
        expect(names.has(p.name), `${p.name} on two teams`).toBe(false);
        names.add(p.name);
        expect(['PG', 'SG', 'SF', 'PF', 'C']).toContain(p.pos);
        expect(p.heightFt).toBeGreaterThan(5.7); expect(p.heightFt).toBeLessThan(7.6);
        for (const s of CORE_STATS) { expect(p.core[s]).toBeGreaterThanOrEqual(25); expect(p.core[s]).toBeLessThanOrEqual(99); }
        for (const n of p.perks) expect(NODES[n], `${p.name}: ${n}`).toBeDefined();
        expect(HAIR_STYLES).toContain(p.appearance.hair);
      }
    }
  });
  it('builds players with real names', () => {
    const lal = generateRoster(TEAMS.find((t) => t.id === 'LAL')!, 0);
    expect(lal[0].name).toBe('Luka Dončić');
    expect(lal[0].number).toBe(77);
  });
});

describe('play reset', () => {
  function runUntilReset(shotClock: number) {
    const g = makeGame({ seed: 9 });
    g.inbound(0);
    const h = g.holder()!;
    // pretend the offense is set and a play just finished with time left
    g.runner.call('highPnR');
    g.runner.done = true;
    g.shotClock = shotClock;
    g.freezeAI = true;
    const first = g.runner.lastPlayId;
    const idle = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false };
    for (let i = 0; i < 100; i++) { g.update(1 / 60, idle); g.shotClock = Math.max(g.shotClock, shotClock - 1.5); if (g.holder() !== h) g.giveBall(h); }
    return { g, first };
  }
  it('calls a different play after a reset when there is time', () => {
    const { g, first } = runUntilReset(15);
    expect(g.events.some((e) => e.text.includes('Reset'))).toBe(true);
    expect(g.runner.playId).not.toBeNull();
    expect(g.runner.playId).not.toBe(first);
    expect(PLAYS[g.runner.playId!]).toBeDefined();
  });
  it('does not call another play late in the shot clock', () => {
    const { g } = runUntilReset(6);
    expect(g.events.some((e) => e.text.includes('Reset'))).toBe(false);
    expect(g.runner.done).toBe(true);
  });
});
