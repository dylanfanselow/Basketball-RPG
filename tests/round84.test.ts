import { describe, it, expect } from 'vitest';
import { createCareer, draftWeek, migrateCareer, newCareer } from '../src/career/career';
import { storyDay, dateLabel } from '../src/career/calendar';
import {
  assignWorkouts, WORKOUT_KINDS, planWorkouts, leagueTiers, draftResult, draftDays, todaysEvents, markMissed,
  nextEvent, eventLine, callLines, RANGE_PICKS, draftRange,
} from '../src/career/draft';
import { GauntletGame, NO_INPUT, MiniInput } from '../src/world/minigames';
import { starterFor, buildStarterOnes, buildTeamScrimmage, buildDraftScrimmage } from '../src/sim/draftGames';
import { TIERS } from '../src/career/schedule';
import { defaultAppearance } from '../src/render/appearance';
import { newStory } from '../src/sim/story';

function career(seed = 42) {
  const c = createCareer({ firstName: 'Dee', lastName: 'Jones', number: 8, pos: 'SG', heightIn: 77, appearance: defaultAppearance() });
  let s = seed; c.story = newStory(c, () => ((s = (s * 16807) % 2147483647) / 2147483647));
  c.story.stage = 'draftWeek'; c.story.draft = draftWeek(storyDay('agent'), storyDay('draft'));
  return c;
}

describe('round 84: the road to the draft', () => {
  it('the three workouts are always different, and each is one its tier can ask for', () => {
    for (let k = 0; k < 200; k++) {
      let s = k * 7 + 1; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      const w = assignWorkouts(rnd);
      expect(new Set(Object.values(w)).size).toBe(3);
      for (const t of TIERS) expect(WORKOUT_KINDS[t]).toContain(w[t]);
    }
  });
  it('Garcia calls three mornings from Spring 18, one team from each tier; workouts land after the call and by Spring 25', () => {
    let overlaps = 0;
    for (let seed = 1; seed < 60; seed++) {
      const c = career(seed), plan = planWorkouts(c), tiers = leagueTiers();
      expect(plan.map((w) => w.tier).sort()).toEqual([...TIERS].sort());
      for (const w of plan) {
        expect(tiers[w.tier]).toContain(w.team);
        expect(w.day).toBeGreaterThan(w.callDay);
        expect(w.day).toBeLessThanOrEqual(draftDays().lastWorkout);
      }
      expect(plan.map((w) => dateLabel(w.callDay))).toEqual(['Spring 18', 'Spring 19', 'Spring 20']);
      expect(planWorkouts(c)).toEqual(plan);
      if (new Set(plan.map((w) => w.day)).size < 3) overlaps++;
    }
    expect(overlaps).toBeGreaterThan(0); // two on the same day happens
  });
  it('draft night: always the Lottery team that called (round 85: at about Garcia\'s estimate)', () => {
    for (let seed = 1; seed < 30; seed++) {
      const c = career(seed); c.story!.workouts = planWorkouts(c);
      const r = draftResult(c), lottery = c.story!.workouts.find((w) => w.tier === 'Lottery')!;
      expect(r.team).toBe(lottery.team);
      expect(r.pick).toBeGreaterThanOrEqual(1); expect(r.pick).toBeLessThanOrEqual(60);
      expect(RANGE_PICKS[draftRange(c)][0]).toBeLessThanOrEqual(r.pick + 2);
    }
  });
  it('today\'s events, missed ones, and the top bar\'s next event', () => {
    const c = career(), d = draftDays(), st = c.story!;
    c.life.day = storyDay('agent');
    expect(eventLine(nextEvent(c, null))).toBe('Combine in 7 days');
    c.life.day = d.combine1;
    expect(todaysEvents(c).map((e) => e.kind)).toEqual(['combine1']);
    expect(eventLine(nextEvent(c, null))).toBe('Combine today');
    c.life.day = d.combine2; markMissed(c);
    expect(st.combine?.missed1).toBe(true);
    expect(todaysEvents(c).map((e) => e.kind)).toEqual(['combine2']);
    c.life.day = d.scrimmage + 1; markMissed(c);
    expect(st.scrimmage).toBe('missed');
    st.workouts = planWorkouts(c);
    const w = st.workouts[0]; c.life.day = w.day;
    expect(todaysEvents(c).some((e) => e.kind === 'workout')).toBe(true);
    expect(callLines(c, w, true).some((l) => /missed part of the combine/.test(l.text))).toBe(true);
    // the draft last
    for (const x of st.workouts) x.result = 'missed';
    c.life.day = d.draft - 2;
    expect(eventLine(nextEvent(c, null))).toBe('The draft in 2 days');
    // in the league: key games
    const k = newCareer('A', 'PG'); expect(eventLine(nextEvent(k, { opponent: 'MEM', daysAway: 3 }))).toBe('Key game vs MEM in 3 days');
  });
  it('the pressure drill: the window shrinks every rep, three strikes ends it', () => {
    const g = new GauntletGame(() => 0.3);
    const press = (b: 'a' | 'b' | 'x' | 'y'): MiniInput => ({ ...NO_INPUT, [b]: true });
    const w0 = g.window;
    g.update(0.1, press(g.want)); expect(g.reps).toBe(1); expect(g.window).toBeLessThan(w0);
    for (let i = 0; i < 3; i++) { const wrong = (['a', 'b', 'x', 'y'] as const).find((b) => b !== g.want)!; g.update(0.1, press(wrong)); g.update(1.1, NO_INPUT); }
    expect(g.strikes).toBe(3); expect(g.over).toBe(true);
    // running out of time is a strike too
    const t = new GauntletGame(() => 0.6); t.update(GauntletGame.START + 0.05, NO_INPUT); expect(t.strikes).toBe(1);
  });
  it('the team workouts: a starter who isn\'t a star; you with their bench vs their starters; the prospects\' scrimmage', () => {
    const c = career();
    const s = starterFor('MEM'); expect(s.star).toBeFalsy();
    const ones = buildStarterOnes(c, 'MEM', 3); expect(ones.cfg.oneOnOne).toBeTruthy(); expect(ones.teams[1].onCourt[0].name).toBe(s.name);
    const team = buildTeamScrimmage(c, 'OKC', 4); expect(team.teams[0].roster.length).toBe(5); expect(team.teams[1].roster.length).toBe(5);
    expect(team.teams[0].roster.some((p) => p.isUser)).toBe(true);
    const scr = buildDraftScrimmage(c, 5); expect(scr.teams[0].roster.length).toBe(5); expect(scr.cfg.periods).toBe(2);
  });
  it('old saves: the agent is Donovan Garcia now', () => {
    const c: any = newCareer('Old', 'PG'); c.story = { stage: 'draftWeek', rival: null, home: 'apartment', agent: 'Victor Hale' };
    expect(migrateCareer(JSON.parse(JSON.stringify(c)))!.story!.agent).toBe('Donovan Garcia');
  });
});
