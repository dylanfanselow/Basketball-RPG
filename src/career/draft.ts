/**
 * Round 84 (owner): the road to the draft. After the scrimmage and a week of work, Donovan Garcia calls three times,
 * once for a team from each tier (Contender, Playoff, Lottery); each team wants a workout on a random day (two can land
 * on the same day, then you pick one). Each tier tests something different and the three workouts are always
 * different. On draft night the Lottery team that called always picks you, late in the first round (for now).
 * Phaser-free, no state.ts. Imports career.ts types only.
 */
import type { CareerState, Workout, WorkoutKind, CombineTest } from './career';
import { nextKeyGame } from './career';
import { TEAMS, CORE_STATS } from '../sim/data';
import { teamStrength, TIERS, Tier } from './schedule';
import { storyDay, STORY_DATES, dayOf } from './calendar';
import { storyRng, draftClass, Prospect } from './draftClass';
export { storyRng };

/** What each tier can have you do (owner). */
export const WORKOUT_KINDS: Record<Tier, WorkoutKind[]> = {
  Contender: ['scrimmage', 'shooting'],
  Playoff: ['gauntlet', 'shooting'],
  Lottery: ['oneOnOne', 'gauntlet'],
};
export const WORKOUT_NAMES: Record<WorkoutKind, string> = {
  scrimmage: 'Team scrimmage', shooting: 'Shooting drill', gauntlet: 'Pressure drill', oneOnOne: '1-on-1',
};
/** What the team is looking for (owner). */
export const TIER_PITCH: Record<Tier, string> = {
  Contender: 'We want to know if you can be an impact player right out of the gate.',
  Playoff: 'We want to see how flexible you are. Can you adjust when it gets hard?',
  Lottery: 'We\'re building something. We want to know if you can be a foundational piece.',
};

/** One kind per tier, all three different. */
export function assignWorkouts(rnd: () => number): Record<Tier, WorkoutKind> {
  const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length) % a.length];
  const t1 = pick(WORKOUT_KINDS.Contender);
  const t2 = pick(WORKOUT_KINDS.Playoff.filter((k) => k !== t1));
  const t3 = pick(WORKOUT_KINDS.Lottery.filter((k) => k !== t2 && k !== t1));
  return { Contender: t1, Playoff: t2, Lottery: t3 };
}

/** All 30 teams in three tiers of 10 (by roster strength). */
export function leagueTiers(): Record<Tier, string[]> {
  const ranked = TEAMS.map((t) => ({ id: t.id, s: teamStrength(t.id) })).sort((a, b) => b.s - a.s || a.id.localeCompare(b.id));
  const per = Math.ceil(ranked.length / TIERS.length);
  return { Contender: ranked.slice(0, per).map((t) => t.id), Playoff: ranked.slice(per, per * 2).map((t) => t.id), Lottery: ranked.slice(per * 2).map((t) => t.id) };
}


/** Round 84: the story days around the draft. */
export const COMBINE_AFTER = 7;
export const draftDays = () => {
  const agent = storyDay('agent');
  return {
    combine1: agent + COMBINE_AFTER, combine2: agent + COMBINE_AFTER + 1, scrimmage: agent + COMBINE_AFTER + 3,
    montage: dayOf(1, 2, 12), back: dayOf(1, 2, 18), lastWorkout: dayOf(1, 2, 25), draft: storyDay('draft'),
  };
};
void STORY_DATES;

/**
 * The three calls (planned once, deterministic per story): one team per tier in a random order, on three mornings in a
 * row from the day you're back; each one's workout on a random day after its call and no later than Spring 25.
 */
export function planWorkouts(c: Pick<CareerState, 'story'>): Workout[] {
  const rnd = storyRng(c.story, 0x5eed84), tiers = leagueTiers(), kinds = assignWorkouts(rnd), d = draftDays();
  const order = [...TIERS].sort(() => rnd() - 0.5);
  return order.map((tier, i) => {
    const callDay = d.back + i, from = callDay + 1, span = d.lastWorkout - from + 1;
    const team = tiers[tier][Math.floor(rnd() * tiers[tier].length)];
    return { team, tier, kind: kinds[tier], callDay, day: from + Math.floor(rnd() * span) };
  });
}

/** Garcia's lines for a call (and yours). */
export function callLines(c: CareerState, w: Workout, first: boolean): { who: 'agent' | 'me'; text: string }[] {
  const you = c.firstName || c.name.split(' ')[0];
  const t = TEAMS.find((x) => x.id === w.team), name = t ? `${t.city} ${t.name}` : w.team;
  const when = dayLabel(w.day);
  const missed = c.story?.combine?.missed1 || c.story?.combine?.missed2 || c.story?.scrimmage === 'missed';
  const intro: Record<Tier, string> = {
    Contender: `The ${name} called. A contender, ${you}. They're thinking about you.`,
    Playoff: `The ${name} want a look. Playoff team, solid organization.`,
    Lottery: `The ${name} called. Rebuilding. They need pieces, and they like you.`,
  };
  return [
    ...(first ? [{ who: 'agent' as const, text: `${you}. Garcia. Hope you've been staying sharp.` }] : []),
    ...(first && missed ? [{ who: 'agent' as const, text: 'You missed part of the combine. Scouts noticed. Don\'t miss anything else.' }] : []),
    { who: 'agent', text: intro[w.tier] },
    { who: 'agent', text: `They want you in for a workout. ${when}. ${WORKOUT_NAMES[w.kind]}.` },
    { who: 'me', text: `${when}. I'll be there.` },
  ];
}

/** "Spring 23" (calendar.dateLabel without the import cycle). */
const SEASON = ['Fall', 'Winter', 'Spring', 'Summer'];
export function dayLabel(day: number) { const z = day - 1; return `${SEASON[Math.floor((z % 112) / 28)]} ${(z % 28) + 1}`; }

/** The draft ranges (round 85: from the projected pick). */
export type DraftRange = 'lottery' | 'late' | 'second';
export const RANGE_PICKS: Record<DraftRange, [number, number]> = { lottery: [1, 14], late: [15, 30], second: [31, 60] };
export const RANGE_NAMES: Record<DraftRange, string> = { lottery: 'Lottery', late: 'Late first', second: 'Second round' };
export const rangeOf = (pick: number): DraftRange => (pick <= 14 ? 'lottery' : pick <= 30 ? 'late' : 'second');

/** Round 85 (owner): the combine's tests, shuffled per story: day 1 gets three, day 2 the other two. */
export const COMBINE_TESTS: CombineTest[] = ['sprint', 'squat', 'bench', 'jump', 'shoot'];
export function combinePlan(c: Pick<CareerState, 'story'>): { day1: CombineTest[]; day2: CombineTest[] } {
  const rnd = storyRng(c.story, 0xc0b1e), t = [...COMBINE_TESTS];
  for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; }
  return { day1: t.slice(0, 3), day2: t.slice(3) };
}
/** What each test's score is worth, from nothing (0) to the best in the class (1). */
/** Round 86: re-tuned for the harder tests (squat 20 s and heavier every rep, bench heavier every rep, a 2.5 s jump,
 *  shooting in points: a make 1, a perfect 2, the green narrowing after every make). */
export const COMBINE_RANGE: Record<CombineTest, [number, number]> = { sprint: [1.5, 6], squat: [2, 11], bench: [1, 8], jump: [26, 42], shoot: [3, 22] };
export const combineGrade = (t: CombineTest, v: number) => { const [lo, hi] = COMBINE_RANGE[t]; return Math.max(0, Math.min(1, (v - lo) / (hi - lo))); };

/**
 * Round 86 (owner): how you've played on the road to the draft, 0..1: the combine (each test against the class, a
 * missed day counts its tests as nothing) and the scrimmage most, then the national final (won, MVP), then the big game
 * from the start. Anything not played yet counts as average (0.5).
 */
export const PERF_WEIGHTS = { combine: 0.5, scrimmage: 0.25, nationals: 0.17, bigGame: 0.08 };
export function perfParts(c: CareerState): { combine: number; scrimmage: number; nationals: number; bigGame: number } {
  const st = c.story, cb = st?.combine, plan = combinePlan(c);
  const tests = [...(cb?.day1 || cb?.missed1 ? plan.day1 : []), ...(cb?.day2 || cb?.missed2 ? plan.day2 : [])];
  const combine = tests.length ? tests.reduce((s, t) => s + combineGrade(t, cb?.scores?.[t] ?? -1e9), 0) / tests.length : 0.5;
  const scrimmage = st?.scrimmage === 'missed' ? 0 : st?.scrimmage ? Math.max(0, Math.min(1, st.scrimmage.sum / 40)) : 0.5;
  const f = st?.final;
  const nationals = f ? (f.won ? 0.5 : 0) + ((f.mvp ?? f.great) ? 0.5 : 0) : 0.5;
  const b = st?.bigGame;
  const bigGame = b ? (b.great ? 1 : b.won ? 0.6 : 0.2) : 0.5;
  return { combine, scrimmage, nationals, bigGame };
}
export function performance(c: CareerState): number {
  const p = perfParts(c), w = PERF_WEIGHTS;
  return p.combine * w.combine + p.scrimmage * w.scrimmage + p.nationals * w.nationals + p.bigGame * w.bigGame;
}
/** Your stats only nudge it (owner): ±8 at most, 0 at a 260 total. */
export const statNudge = (c: CareerState) => Math.max(-8, Math.min(8, 0.2 * (CORE_STATS.reduce((s, k) => s + c.core[k], 0) - 260)));
/** What the teams think you're worth, on the class's scale (281 = the average drafted player at a 0.5 performance). */
export const yourDraftValue = (c: CareerState) => 236 + 90 * performance(c) + statNudge(c);
/** The class for this story (your position decides the projected top two's). */
export const classOf = (c: CareerState): Prospect[] => draftClass(c.story, c.pos);
/** Where you'd go on value alone: one after everybody worth more. */
export function projectedPick(c: CareerState): number {
  const v = yourDraftValue(c);
  return Math.max(1, Math.min(60, 1 + classOf(c).filter((p) => p.value > v).length));
}

/**
 * Round 85 / 86: where Garcia thinks you go in the draft. Null until the combine or the scrimmage gives him something
 * to go on.
 */
export function draftEstimate(c: CareerState): number | null {
  const st = c.story, cb = st?.combine;
  if (!(cb?.day1 || cb?.day2 || cb?.missed1 || cb?.missed2 || st?.scrimmage)) return null;
  return projectedPick(c);
}
/** Garcia's line for the phone. */
export function estimateLine(c: CareerState): string {
  const e = draftEstimate(c);
  if (e === null) return 'Too early to tell. Show me something at the combine.';
  return `Right now? I've got you going around pick ${e}. ${RANGE_NAMES[rangeOf(e)]}.`;
}
/** Round 86: the projected top two, the way Garcia says it. */
export function topTwoLine(c: CareerState): string {
  const [a, b] = classOf(c).filter((p) => p.proj <= 2).sort((x, y) => x.proj - y.proj);
  return `Everybody's got ${a.name} (${a.pos}) and ${b.name} (${b.pos}) going one-two. Not your problem. The rest of the board is.`;
}
/** The draft range (round 85: wherever the estimate is). */
export const draftRange = (c: CareerState): DraftRange => rangeOf(draftEstimate(c) ?? 45);

/** Round 86 (owner): how a team's tryout went, 0..1 (missed = 0), per kind. */
export function tryoutGrade(w: Workout): number | null {
  if (!w.result) return null;
  if (w.result === 'missed') return 0;
  const s = w.result.score, cl = (v: number) => Math.max(0, Math.min(1, v));
  switch (w.kind) {
    case 'shooting': return cl(s / 20);          // points: a make 1, a perfect 2
    case 'gauntlet': return cl(s / 22);          // reps
    case 'oneOnOne': return s >= 11 ? 0.85 : cl((s / 11) * 0.55); // your score to 11
    case 'scrimmage': return cl(s / 40);         // your weighted night
  }
  return null;
}
export const GOOD_TRYOUT = 0.6, BAD_TRYOUT = 0.3;

/** Round 86 (owner, for now): only bottom-tier teams draft you (later: any tier). */
export const DRAFTS_YOU: Tier[] = ['Lottery'];
/**
 * Round 86: the draft order, 30 picks a round: worst roster first, with a few seeded traded picks so some bottom-tier
 * teams pick in the middle of the round. The second round goes in the same order.
 */
/** The order before any trades: worst roster first. */
export const draftOrderBase = (): string[] => TEAMS.map((t) => ({ id: t.id, s: teamStrength(t.id) })).sort((a, b) => a.s - b.s || a.id.localeCompare(b.id)).map((t) => t.id);
/** Round 88 (owner): the TV's draft board: who owns each pick (and whose pick it was, if it was traded). */
export function draftBoard(c: Pick<CareerState, 'story'>): { pick: number; team: string; via: string | null }[] {
  const base = draftOrderBase(), order = draftOrder(c);
  return order.map((team, i) => ({ pick: i + 1, team, via: base[i % 30] !== team ? base[i % 30] : null }));
}
export function draftOrder(c: Pick<CareerState, 'story'>): string[] {
  const rnd = storyRng(c.story, 0x0dde7), order = draftOrderBase();
  for (let k = 0; k < 5; k++) { // traded picks: a lottery pick swapped with one further down
    const i = Math.floor(rnd() * 10), j = 10 + Math.floor(rnd() * 15);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return [...order, ...order];
}
export interface DraftPick { pick: number; team: string; who: string; you?: boolean }
/**
 * Round 86 (owner): draft night. Each team takes the best available on value (a little noise). Only a bottom-tier
 * team takes you: when you're the best available it's likely, close to it a chance. A team that worked you out is more
 * likely to take you (and might reach) after a good tryout, and likely to pass after a bad or missed one; the tryout
 * doesn't move your projection. You always go: the last bottom-tier pick of the second round takes you.
 */
export function runDraft(c: CareerState): { picks: DraftPick[]; you: { team: string; pick: number }; passedBy: string[] } {
  const rnd = storyRng(c.story, 0xd4af86), order = draftOrder(c), tiers = leagueTiers();
  const bottom = new Set(DRAFTS_YOU.flatMap((t) => tiers[t]));
  const pool = classOf(c).map((p) => ({ id: p.id, name: p.name, v: p.value + (rnd() * 2 - 1) * 3 }));
  const me = yourDraftValue(c), meName = c.name;
  const lastBottom = order.reduce((last, t, i) => (bottom.has(t) ? i : last), -1);
  const grade = (team: string) => { const w = c.story?.workouts?.find((x) => x.team === team); return w ? tryoutGrade(w) : null; };
  const picks: DraftPick[] = [], passedBy: string[] = [];
  let taken = false, you = { team: order[lastBottom], pick: lastBottom + 1 };
  order.forEach((team, i) => {
    pool.sort((a, b) => b.v - a.v);
    if (!taken && bottom.has(team)) {
      const ahead = pool.filter((p) => p.v > me).length, g = grade(team);
      let chance = ahead === 0 ? 0.85 : ahead <= 3 ? 0.3 : 0;
      if (g !== null && g >= GOOD_TRYOUT) chance = ahead <= 6 ? Math.max(chance + 0.25, 0.35) : chance;
      if (g !== null && g < BAD_TRYOUT) chance *= 0.4;
      const take = i === lastBottom || rnd() < Math.min(0.97, chance);
      if (take) { taken = true; you = { team, pick: i + 1 }; picks.push({ pick: i + 1, team, who: meName, you: true }); return; }
      if (ahead === 0 && g !== null && g < BAD_TRYOUT) passedBy.push(team);
    }
    const p = pool.shift();
    if (p) picks.push({ pick: i + 1, team, who: p.name });
  });
  return { picks, you, passedBy };
}

/** Draft night: the team and the pick (round 86: from the real draft). */
export function draftResult(c: CareerState): { team: string; pick: number } { return runDraft(c).you; }

/**
 * Round 86 (owner): on an event day, before you've gone, you can't work out: you need to be ready for it. Returns what
 * you're getting ready for, or null.
 */
export function readyFor(c: CareerState): string | null {
  const ev = todaysEvents(c);
  if (ev.length) return eventName(c, ev[0]);
  if (!c.story || c.story.stage === 'done') {
    const k = c.story?.drafted || !c.story ? nextKeyGame(c) : null;
    if (k && k.daysAway === 0) { const t = TEAMS.find((x) => x.id === k.opponent); return `the game against ${t ? t.name : k.opponent}`; }
  }
  return null;
}

/** A story event you go to (combine days, the scrimmage, a workout). */
export type GoEvent = { kind: 'combine1' | 'combine2' | 'scrimmage' } | { kind: 'workout'; index: number };
/** Everything you could go to today (not done, not missed). */
export function todaysEvents(c: CareerState): GoEvent[] {
  const st = c.story, d = st?.draft, day = c.life.day;
  if (!st || !d || st.stage !== 'draftWeek') return [];
  const out: GoEvent[] = [];
  if (day === d.combine1 && !st.combine?.day1 && !st.combine?.missed1) out.push({ kind: 'combine1' });
  if (day === d.combine2 && !st.combine?.day2 && !st.combine?.missed2) out.push({ kind: 'combine2' });
  if (day === d.scrimmage && !st.scrimmage) out.push({ kind: 'scrimmage' });
  (st.workouts ?? []).forEach((w, index) => { if (w.day === day && !w.result) out.push({ kind: 'workout', index }); });
  return out;
}
/** The name of an event (the door label, the HUD). */
export function eventName(c: CareerState, e: GoEvent): string {
  if (e.kind !== 'workout') return e.kind === 'combine1' ? 'the combine (day 1)' : e.kind === 'combine2' ? 'the combine (day 2)' : 'the scrimmage';
  const w = c.story!.workouts![e.index], t = TEAMS.find((x) => x.id === w.team);
  return `the ${t?.city ?? w.team} workout`;
}

/** After a night: anything from an earlier day you didn't go to is missed. */
export function markMissed(c: CareerState) {
  const st = c.story, d = st?.draft, day = c.life.day;
  if (!st || !d) return;
  if (day > d.combine1 && !st.combine?.day1) (st.combine ??= {}).missed1 = true;
  if (day > d.combine2 && !st.combine?.day2) (st.combine ??= {}).missed2 = true;
  if (day > d.scrimmage && !st.scrimmage) st.scrimmage = 'missed';
  for (const w of st.workouts ?? []) if (day > w.day && !w.result) w.result = 'missed';
}

/** The next thing coming up for the top bar: { what, days } (0 = today). Story events first, then key games. */
export function nextEvent(c: CareerState, nextKey: { opponent: string; daysAway: number } | null): { what: string; days: number } | null {
  const st = c.story, day = c.life.day;
  if (st && st.stage !== 'done') {
    const ev: { what: string; at: number }[] = [];
    const d = st.draft;
    if (d) {
      if (!st.combine?.day1 && !st.combine?.missed1) ev.push({ what: 'Combine', at: d.combine1 });
      if (!st.combine?.day2 && !st.combine?.missed2) ev.push({ what: 'Combine', at: d.combine2 });
      if (!st.scrimmage) ev.push({ what: 'Scrimmage', at: d.scrimmage });
      for (const w of st.workouts ?? []) if (!w.result) ev.push({ what: `${w.team} workout`, at: w.day });
      if (!st.drafted) ev.push({ what: 'The draft', at: d.draft });
    } else if (['tutorial', 'ones', 'night'].includes(st.stage)) ev.push({ what: 'Big game', at: 2 });
    else if (st.stage === 'bigGame') ev.push({ what: 'Big game', at: day });
    else if (['paper', 'snow', 'bus', 'final'].includes(st.stage)) ev.push({ what: 'National final', at: storyDay('final') });
    const next = ev.filter((e) => e.at >= day).sort((a, b) => a.at - b.at)[0];
    return next ? { what: next.what, days: next.at - day } : null;
  }
  return nextKey ? { what: `Key game vs ${nextKey.opponent}`, days: nextKey.daysAway } : null;
}
/** "Combine in 7 days" / "Combine today". */
export const eventLine = (e: { what: string; days: number } | null) => (!e ? '' : e.days <= 0 ? `${e.what} today` : `${e.what} in ${e.days} day${e.days === 1 ? '' : 's'}`);

/**
 * Round 89b (owner): lose the scrimmage and, back home that day, the landline rings: an unknown number telling you to
 * give up on basketball (it's Dragić; nobody knows that yet). Once per story.
 */
export function mysteryCallDue(c: CareerState): boolean {
  const st = c.story, s = st?.scrimmage;
  return !!st?.draft && !st.anonCall && !!s && s !== 'missed' && !s.won && c.life.day === st.draft.scrimmage;
}

/** A random one of these. */
export const pickOne = <T>(a: T[], rnd: () => number = Math.random): T => a[Math.floor(rnd() * a.length) % a.length];
/** Round 85 (owner): what Mom says when you call (it keeps you going), by where you are on the road to the draft. */
export function momLine(c: CareerState, rnd: () => number = Math.random): string {
  const st = c.story, d = st?.draft, day = c.life.day, est = draftEstimate(c);
  if (d && day >= d.draft - 4) return pickOne(['Whatever happens on draft night, you\'re already my hero.', 'I bought a dress for draft night. Don\'t you dare laugh.', 'Breathe, baby. You did the work. Now let it come to you.'], rnd);
  if (est !== null && est > 40) return pickOne(['One bad day doesn\'t write your story, baby. You write it.', 'They don\'t know you yet. They will.', 'Your daddy used to say pressure is a privilege. Act like it.'], rnd);
  if (!st?.combine?.day1) return pickOne(['You\'ve been working for this since you were a little boy. Go show them.', 'Eat something green. And sleep. Champions sleep.', 'I put your name on the prayer list at church. The whole list.'], rnd);
  return pickOne(['I\'m proud of you. Now go to bed early.', 'The generator\'s humming, the lights are on. Don\'t you worry about us.', 'Keep your head down and keep working. That\'s how we do it.'], rnd);
}
/** Round 85 (owner): Garcia on the phone: where he thinks you go right now, and what's moving it. */
export function garciaLines(c: CareerState): string[] {
  const st = c.story, cb = st?.combine, out = [estimateLine(c)];
  if (!cb?.day1 && !cb?.day2) out.push(topTwoLine(c)); // round 86: the projected top two, before the combine
  if (cb?.missed1 || cb?.missed2) out.push('You missed part of the combine. That\'s costing you. Don\'t miss anything else.');
  if (st?.scrimmage === 'missed') out.push('And skipping the scrimmage? Scouts talk.');
  else if (st?.scrimmage && st.scrimmage.sum >= 30) out.push('That scrimmage got people talking. Good talking.');
  if (!st?.scrimmage && cb?.day1) out.push('The scrimmage is where you can move up. Play your game.');
  return out;
}
