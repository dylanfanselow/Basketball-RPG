import { describe, it, expect } from 'vitest';
import { createCareer } from '../src/career/career';
import { buildBigGame, bigGameVerdict, BIG_GAME_HALF } from '../src/sim/story';
import { NODES } from '../src/sim/data';
import { emptyInput } from '../src/sim/game';
import { emptyBox } from '../src/sim/player';
import { defaultAppearance } from '../src/render/appearance';

const career = () => createCareer({ name: 'Test', pos: 'SG', heightIn: 77, number: 7, appearance: defaultAppearance() } as any);

describe('round 66', () => {
  it('Bang! boosts clutch threes', () => {
    const e = NODES.sh_pullup3.effects[0] as any;
    expect(NODES.sh_pullup3.name).toBe('Bang!');
    expect(e).toMatchObject({ t: 'shot', cond: 'clutch', mult: 1.15 });
    expect(e.types).toEqual(['three', 'deep3']);
  });
  it('the big game is two 4-minute halves: H1, H2, then it ends (or OT on a tie)', () => {
    const sim = buildBigGame(career(), 5);
    expect(sim.cfg.quarterLen).toBe(BIG_GAME_HALF);
    expect(sim.periods).toBe(2);
    expect(sim.periodLabel()).toBe('H1');
    const inp = emptyInput(); let guard = 0;
    while (!sim.over && guard++ < 60 * 60 * 20) sim.update(1 / 60, inp);
    expect(sim.over).toBe(true);
    const ends = sim.events.filter((e) => e.kind === 'period').map((e) => e.text);
    expect(ends[0]).toBe('End of H1');
    expect(ends[1]).toBe('End of H2');
    for (const t of ends.slice(2)) expect(t).toBe('End of OT');
    expect(sim.events.some((e) => /Q[1-4]/.test(e.text) && e.kind === 'period')).toBe(false);
  });
  it('clutch counts in the last half', () => {
    const sim = buildBigGame(career(), 5);
    sim.quarter = 2; sim.clock = 20; sim.teams[0].score = 30; sim.teams[1].score = 29;
    expect(sim.clutch).toBe(true);
    sim.quarter = 1;
    expect(sim.clutch).toBe(false);
  });
  it('the scout weighs a block more than a point', () => {
    const sim = buildBigGame(career(), 5);
    const me = sim.user!, other = sim.players.find((p) => p.team !== me.team)!;
    for (const p of sim.players) p.box = emptyBox();
    me.box.blk = 3; other.box.pts = 3;
    const v = bigGameVerdict(sim);
    expect(v.mine).toBe(9);
    expect(v.best).toBe(9);
    me.box.blk = 1; other.box.pts = 2;
    const v2 = bigGameVerdict(sim);
    expect(v2.mine).toBeGreaterThan(2);
    expect(v2.best).toBe(v2.mine);
  });
});
