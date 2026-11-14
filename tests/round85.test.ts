import { describe, it, expect } from 'vitest';
import { ORBS, ShootGame, JumpGame, NO_INPUT, MiniInput } from '../src/world/minigames';
import { createCareer, draftWeek } from '../src/career/career';
import { storyDay } from '../src/career/calendar';
import { combinePlan, COMBINE_TESTS, draftEstimate, draftResult, estimateLine, garciaLines, momLine, planWorkouts, rangeOf } from '../src/career/draft';
import { lapPoint, LAP_LEN, LAPS, ARENA_GYM } from '../src/world/arenaGym';
import { buildDraftScrimmage, buildStarterOnes, buildTeamScrimmage } from '../src/sim/draftGames';
import { defaultAppearance } from '../src/render/appearance';
import { newStory } from '../src/sim/story';

function career(seed = 42) {
  const c = createCareer({ firstName: 'Dee', lastName: 'Jones', number: 8, pos: 'SG', heightIn: 77, appearance: defaultAppearance() });
  let s = seed; c.story = newStory(c, () => ((s = (s * 16807) % 2147483647) / 2147483647));
  c.story.stage = 'draftWeek'; c.story.draft = draftWeek(storyDay('agent'), storyDay('draft')); c.story.agent = 'Donovan Garcia';
  return c;
}
const held: MiniInput = { ...NO_INPUT, aHeld: true };

describe('round 85: workouts, shooting streaks, the combine in the arena, the landline', () => {
  it('every workout sends twice the orbs (each orb costs the same energy, so twice the energy)', () => {
    for (const k of Object.keys(ORBS)) expect(ORBS[k].length).toBe(4);
  });
  it('perfects in a row build a streak (anything else resets it) and come back faster', () => {
    const g = new ShootGame(() => 0.5);
    const shoot = (to: number) => {
      g.update(0.01, NO_INPUT); // let go of ✕ first
      while (g.state !== 'meter') g.update(0.005, held);
      while (g.meter < to) g.update(0.002, held);
      g.update(0.001, NO_INPUT);
      expect(g.state as string).toBe('shot');
      const back = g.flight;
      while ((g.state as string) === 'shot') g.update(0.05, NO_INPUT);
      return back;
    };
    expect(shoot(ShootGame.PERFECT[0] + 0.004)).toBe(ShootGame.FLIGHT_PERFECT);
    expect(g.streak).toBe(1);
    shoot(ShootGame.PERFECT[0] + 0.004); expect(g.streak).toBe(2);
    expect(shoot(0.5)).toBe(ShootGame.FLIGHT); expect(g.streak).toBe(0);
    expect(ShootGame.FLIGHT_PERFECT).toBeLessThan(ShootGame.FLIGHT);
  });
  it('the vertical jump: more presses jump higher, three tries, the best counts', () => {
    const jump = (presses: number) => {
      const j = new JumpGame(() => 0.5);
      for (let t = 0; t < 3; t++) {
        for (let i = 0; i < 40; i++) j.update(JumpGame.LOAD / 40, i < presses ? { ...NO_INPUT, a: true } : NO_INPUT);
        while (j.phase === 'load') j.update(0.01, NO_INPUT);
        while (j.phase === 'air' || j.phase === 'rest') j.update(0.05, NO_INPUT);
      }
      return j;
    };
    const lazy = jump(3), hard = jump(30);
    expect(hard.best).toBeGreaterThan(lazy.best);
    expect(hard.tries).toBe(3); expect(hard.over).toBe(true);
    expect(JumpGame.inches(1)).toBeGreaterThan(40); expect(JumpGame.inches(0)).toBeLessThan(20);
  });
  it('the combine: five tests shuffled over two days (three, then two), the same for a story', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed < 40; seed++) {
      const p = combinePlan(career(seed));
      expect(p.day1.length).toBe(3); expect(p.day2.length).toBe(2);
      expect([...p.day1, ...p.day2].sort()).toEqual([...COMBINE_TESTS].sort());
      expect(combinePlan(career(seed))).toEqual(p);
      seen.add(p.day1.join());
    }
    expect(seen.size).toBeGreaterThan(5); // random order
  });
  it('Garcia\'s estimate moves with the combine and the scrimmage; missing costs you; the draft follows it', () => {
    const c = career();
    expect(draftEstimate(c)).toBeNull();
    expect(estimateLine(c)).toMatch(/Too early/);
    const plan = combinePlan(c);
    const set = (scores: Record<string, number>) => { c.story!.combine = { scores, day1: true, day2: true }; };
    set({ sprint: 5.5, squat: 9, bench: 6, jump: 40, shoot: 12 }); const great = draftEstimate(c)!;
    set({ sprint: 2, squat: 2, bench: 1, jump: 24, shoot: 3 }); const poor = draftEstimate(c)!;
    expect(great).toBeLessThan(poor);
    c.story!.combine = { scores: {}, missed1: true, missed2: true }; const missed = draftEstimate(c)!;
    expect(missed).toBeGreaterThanOrEqual(poor);
    set({ sprint: 4, squat: 6, bench: 4, jump: 33, shoot: 8 });
    c.story!.scrimmage = { pts: 20, reb: 6, ast: 5, sum: 36, won: true }; const good = draftEstimate(c)!;
    c.story!.scrimmage = 'missed'; const skip = draftEstimate(c)!;
    expect(good).toBeLessThan(skip);
    expect(estimateLine(c)).toMatch(new RegExp(`pick ${skip}`));
    c.story!.workouts = planWorkouts(c);
    const r = draftResult(c);
    expect(Math.abs(r.pick - skip)).toBeLessThanOrEqual(2);
    expect(r.team).toBe(c.story!.workouts.find((w) => w.tier === 'Lottery')!.team);
    expect(rangeOf(5)).toBe('lottery'); expect(rangeOf(22)).toBe('late'); expect(rangeOf(45)).toBe('second');
    expect(garciaLines(c).some((l) => /scrimmage/.test(l))).toBe(true);
    void plan;
  });
  it('Mom always has something to say', () => {
    const c = career();
    for (let i = 0; i < 5; i++) expect(momLine(c, () => i / 5).length).toBeGreaterThan(10);
  });
  it('the arena gym: the machines where the garage has them, laps around the court', () => {
    expect(ARENA_GYM.stations!.map((s) => s.id).sort()).toEqual(['bench', 'dribble', 'jump', 'laps', 'shoot', 'squat']);
    expect(lapPoint(0).p).toEqual(LAPS[0]);
    const half = lapPoint(LAP_LEN / 2).p;
    expect(half.x).toBeCloseTo(LAPS[2].x, 1); expect(half.y).toBeCloseTo(LAPS[2].y, 1);
    expect(lapPoint(LAP_LEN + 1).p).toEqual(lapPoint(1).p);
  });
  it('the scrimmage and the tryout games are in an empty arena with scouts, on the team\'s court', () => {
    const c = career();
    for (const sim of [buildDraftScrimmage(c, 1), buildStarterOnes(c, 'MEM', 2), buildTeamScrimmage(c, 'OKC', 3)]) {
      expect(sim.cfg.scoutsOnly).toBe(true); expect(sim.cfg.venue).toBe('arena'); expect(sim.cfg.courtColors).toBeTruthy();
    }
  });
});
