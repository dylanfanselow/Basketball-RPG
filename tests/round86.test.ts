import { describe, it, expect } from 'vitest';
import { createCareer, draftWeek, drainEnergy } from '../src/career/career';
import { storyDay } from '../src/career/calendar';
import { draftClass, CLASS_MEAN, CLASS_SIZE, TOP_BOOST } from '../src/career/draftClass';
import { projectedPick, runDraft, draftOrder, leagueTiers, planWorkouts, yourDraftValue, readyFor, draftDays, tryoutGrade, topTwoLine, garciaLines, performance } from '../src/career/draft';
import { CORE_STATS } from '../src/sim/data';
import { ShootGame, SquatGame, BenchGame, JumpGame, NO_INPUT, MiniInput } from '../src/world/minigames';
import { defaultAppearance } from '../src/render/appearance';
import { newStory } from '../src/sim/story';
import type { Position } from '../src/sim/attributes';

function career(seed = 42, pos: Position = 'SG') {
  const c = createCareer({ firstName: 'Dee', lastName: 'Jones', number: 8, pos, heightIn: 77, appearance: defaultAppearance() });
  let s = seed; c.story = newStory(c, () => ((s = (s * 16807) % 2147483647) / 2147483647));
  c.story.stage = 'draftWeek'; c.story.draft = draftWeek(storyDay('agent'), storyDay('draft')); c.story.agent = 'Donovan Garcia';
  return c;
}
const held: MiniInput = { ...NO_INPUT, aHeld: true };
const G = (p: Position) => p === 'PG' || p === 'SG', F = (p: Position) => p === 'SF' || p === 'PF';

describe('round 86: the draft class', () => {
  it('60 prospects averaging 281 (before the top two\'s boost), best first, stats adding up to the totals', () => {
    for (let seed = 1; seed < 20; seed++) {
      const k = draftClass(career(seed).story, 'SG');
      expect(k.length).toBe(CLASS_SIZE);
      const mean = (k.reduce((s, p) => s + p.total, 0) - 2 * TOP_BOOST) / k.length;
      expect(Math.abs(mean - CLASS_MEAN)).toBeLessThan(0.6);
      for (const p of k) expect(CORE_STATS.reduce((s, x) => s + p.core[x], 0)).toBe(p.total);
      expect(k[0].total).toBeGreaterThan(k[29].total); expect(k[29].total).toBeGreaterThan(k[59].total);
      expect(k[0].total).toBeGreaterThan(300); expect(k[59].total).toBeLessThan(265);
      k.forEach((p, i) => expect(p.proj).toBe(i + 1));
      expect(draftClass(career(seed).story, 'SG')).toEqual(k);
    }
  });
  it('the projected top two play the positions you don\'t', () => {
    for (let seed = 1; seed < 20; seed++) {
      const g = draftClass(career(seed).story, 'PG').slice(0, 2).map((p) => p.pos);
      expect(g.some(F) && g.includes('C')).toBe(true);
      const f = draftClass(career(seed).story, 'SF').slice(0, 2).map((p) => p.pos);
      expect(f.some(G) && f.includes('C')).toBe(true);
      const c = draftClass(career(seed).story, 'C').slice(0, 2).map((p) => p.pos);
      expect(c.some(G) && c.some(F)).toBe(true);
    }
  });
  it('your slot comes mostly from how you played: the combine, the scrimmage, nationals (won, MVP), the big game', () => {
    const c = career(), st = c.story!;
    const mid = projectedPick(c);
    expect(mid).toBeGreaterThan(18); expect(mid).toBeLessThan(42); // all average: around the middle
    st.combine = { scores: { sprint: 6, squat: 11, bench: 8, jump: 42, shoot: 22 }, day1: true, day2: true };
    st.scrimmage = { pts: 30, reb: 10, ast: 8, sum: 40, won: true };
    const great = projectedPick(c);
    st.final = { great: true, won: true, mvp: true, pts: 30, reb: 8, ast: 6 };
    const champ = projectedPick(c);
    st.final = { great: false, won: false, mvp: false, pts: 8, reb: 2, ast: 1 };
    const lost = projectedPick(c);
    expect(great).toBeLessThan(mid); expect(champ).toBeLessThanOrEqual(great); expect(lost).toBeGreaterThan(champ);
    expect(champ).toBeLessThan(6);
    // stats only nudge it
    const v0 = yourDraftValue(c); for (const k of CORE_STATS) c.core[k] += 20; expect(yourDraftValue(c) - v0).toBeLessThanOrEqual(16.01);
    expect(performance(c)).toBeLessThanOrEqual(1);
    expect(topTwoLine(c)).toMatch(/one-two/); expect(garciaLines(c).length).toBeGreaterThan(0);
  });
  it('the draft order: every team twice, some bottom-tier teams in the middle of the round', () => {
    let mid = 0;
    for (let seed = 1; seed < 20; seed++) {
      const o = draftOrder(career(seed)), lot = new Set(leagueTiers().Lottery);
      expect(o.length).toBe(60); expect(new Set(o.slice(0, 30)).size).toBe(30); expect(o.slice(30)).toEqual(o.slice(0, 30));
      mid += o.slice(10, 25).filter((t) => lot.has(t)).length;
    }
    expect(mid).toBeGreaterThan(0);
  });
  it('draft night: only a bottom-tier team takes you, by the last bottom-tier pick; every prospect goes once', () => {
    for (let seed = 1; seed < 40; seed++) {
      const c = career(seed); c.story!.workouts = planWorkouts(c);
      const d = runDraft(c), lot = new Set(leagueTiers().Lottery);
      expect(lot.has(d.you.team)).toBe(true);
      expect(d.picks.length).toBe(60); expect(d.picks.filter((p) => p.you).length).toBe(1);
      expect(new Set(d.picks.map((p) => p.who)).size).toBe(60);
      const last = draftOrder(c).reduce((l, t, i) => (lot.has(t) ? i + 1 : l), 0);
      expect(d.you.pick).toBeLessThanOrEqual(last);
    }
  });
  it('a good tryout makes that team more likely to take you; a bad one more likely to pass (projection unchanged)', () => {
    let good = 0, bad = 0;
    for (let seed = 1; seed < 120; seed++) {
      const c = career(seed); c.story!.workouts = planWorkouts(c);
      const w = c.story!.workouts.find((x) => x.tier === 'Lottery')!;
      const proj = projectedPick(c);
      w.result = { score: 22, text: '' }; w.kind = 'shooting';
      if (runDraft(c).you.team === w.team) good++;
      expect(projectedPick(c)).toBe(proj);
      w.result = 'missed';
      if (runDraft(c).you.team === w.team) bad++;
    }
    expect(good).toBeGreaterThan(bad);
    expect(tryoutGrade({ team: 'X', tier: 'Lottery', kind: 'oneOnOne', callDay: 1, day: 2, result: { score: 11, text: '' } })).toBeGreaterThan(0.6);
  });
});

describe('round 86: event days, harder tests', () => {
  it('you can\'t work out on an event day before you go; the event drains your energy', () => {
    const c = career(), d = draftDays();
    c.life.day = d.combine1 - 1; expect(readyFor(c)).toBeNull();
    c.life.day = d.combine1; expect(readyFor(c)).toMatch(/combine/);
    c.story!.combine = { day1: true }; expect(readyFor(c)).toBeNull();
    c.life.day = d.scrimmage; expect(readyFor(c)).toMatch(/scrimmage/);
    c.life.energy = 80; drainEnergy(c); expect(c.life.energy).toBe(0);
  });
  it('shooting test: the green narrows after every make, a perfect is worth 2; the garage keeps the plain window', () => {
    const shoot = (g: ShootGame, to: number) => {
      g.update(0.01, NO_INPUT);
      while (g.state !== 'meter') g.update(0.005, held);
      while (g.meter < to) g.update(0.002, held);
      g.update(0.001, NO_INPUT);
      while ((g.state as string) === 'shot') g.update(0.05, NO_INPUT);
    };
    const t = new ShootGame(() => 0.5, { test: true }), w0 = t.green[1] - t.green[0];
    shoot(t, 0.876); expect(t.points).toBe(2); expect(t.perfects).toBe(1);
    expect(t.green[1] - t.green[0]).toBeLessThan(w0);
    shoot(t, t.green[0] + 0.004); expect(t.points).toBe(3);
    for (let i = 0; i < 30; i++) shoot(t, 0.876);
    expect(t.green[1] - t.green[0]).toBeGreaterThanOrEqual(ShootGame.PERFECT[1] - ShootGame.PERFECT[0] + 0.0199);
    expect(t.green[0]).toBeLessThanOrEqual(ShootGame.PERFECT[0]); expect(t.green[1]).toBeGreaterThanOrEqual(ShootGame.PERFECT[1]);
    const g = new ShootGame(() => 0.5); shoot(g, 0.9); expect(g.green).toEqual(ShootGame.GREEN);
  });
  it('squat and bench in a test get heavier every rep; the jump is shorter and each press counts less', () => {
    const sq = new SquatGame(Math.random, { test: true }); sq.reps = 3; expect(sq.ramp).toBeCloseTo(Math.pow(1.15, 3));
    expect(new SquatGame().ramp).toBe(1);
    const b = new BenchGame(Math.random, { test: true }); b.reps = 2; expect(b.ramp).toBeGreaterThan(1); expect(b.press).toBeLessThan(1);
    expect(JumpGame.LOAD).toBe(2.5); expect(JumpGame.PER_PRESS).toBeLessThan(0.045);
  });
});
