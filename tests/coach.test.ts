import { describe, it, expect } from 'vitest';
import { makeGame } from './helpers';
import { emptyInput } from '../src/sim/game';
import { scoreCall, chooseCall, baseValue } from '../src/sim/plays/coach';
import { PLAYS } from '../src/sim/data';

const live = () => {
  const g = makeGame({ seed: 4 });
  const inp = emptyInput();
  for (let t = 0; t < 30 && !(g.live && g.holder()); t += 1 / 30) g.update(1 / 30, inp);
  return g;
};

describe('round 49: the CPU coach', () => {
  it('uses the play lab values as the base (with a fallback)', () => {
    expect(baseValue('pnrLob', 'creator')).toBeGreaterThan(baseValue('motion5out', 'creator'));
    expect(baseValue('nope', 'post')).toBe(0.75);
  });
  it('a bigger matchup edge makes the iso for that player worth more', () => {
    const g = live(), off = g.offense(), f = off[0];
    const man = g.defenderOf(f)!;
    const before = scoreCall(g, 'isoTop', f, {}, []).score;
    man.sub.perimD = 20; man.sub.speed = 20; // a turnstile on him
    const after = scoreCall(g, 'isoTop', f, {}, []);
    expect(after.score).toBeGreaterThan(before + 0.1);
    expect(after.why).toBe('mismatch');
  });
  it('a post scorer with a smaller man gets the post call flagged as a size mismatch', () => {
    const g = live(), f = g.offense().find((p) => p.role === '5')!, man = g.defenderOf(f)!;
    man.height = f.height - 0.6;
    expect(scoreCall(g, 'postSplit', f, {}, []).why).toMatch(/mismatch/);
  });
  it('what works tonight gets called more; the last call is never repeated', () => {
    const g = live(), f = g.offense()[1];
    const base = scoreCall(g, 'floppy', f, {}, []).score;
    expect(scoreCall(g, 'floppy', f, { floppy: { runs: 6, pts: 12 } }, []).score).toBeGreaterThan(base + 0.2);
    expect(scoreCall(g, 'floppy', f, { floppy: { runs: 6, pts: 0 } }, []).score).toBeLessThan(base - 0.1);
    const plays = Object.keys(PLAYS).filter((p) => !PLAYS[p].tags.includes('3v3'));
    for (let i = 0; i < 30; i++) {
      const c = chooseCall(g, plays, g.offense(), {}, ['highPnR'], () => true, () => true)!;
      expect(c.play).not.toBe('highPnR');
    }
  });
  it('a 5v5 game logs its calls and the coach names its targets', () => {
    const g = makeGame({ seed: 9, quarterLen: 120 });
    const inp = emptyInput();
    for (let t = 0; t < 1500 && !g.over; t += 1 / 30) g.update(1 / 30, inp);
    const runs = Object.values(g.playLog[0]).reduce((n, l) => n + l.runs, 0) + Object.values(g.playLog[1]).reduce((n, l) => n + l.runs, 0);
    expect(runs).toBeGreaterThan(20);
    expect(g.events.filter((e) => e.kind === 'play').some((e) => /—/.test(e.text))).toBe(true);
    for (const e of g.events.filter((e) => e.kind === 'play')) expect(e.text).not.toMatch(/3v3/);
  });
});
