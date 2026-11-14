/**
 * Round 84 (owner): the road to the draft. After the scrimmage and a week of work, Donovan Garcia calls three times,
 * once for a team from each tier (Contender, Playoff, Lottery); each team wants a workout on a random day (two can land
 * on the same day, then you pick one). Each tier tests something different and the three workouts are always
 * different. On draft night the Lottery team that called always picks you, late in the first round (for now).
 * Phaser-free, no state.ts. Imports career.ts types only.
 */
import type { CareerState, StoryState, Workout, WorkoutKind, CombineTest } from './career';
import { TEAMS } from '../sim/data';
import { teamStrength, TIERS, Tier } from './schedule';
import { storyDay, STORY_DATES, dayOf } from './calendar';

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

/** The story's seeded random (stable for a given story). */
export function storyRng(st: Pick<StoryState, 'squadSeed'> | undefined, salt: number): () => number {
  let s = (((st?.squadSeed ?? 12345) ^ salt) >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
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
export const COMBINE_RANGE: Record<CombineTest, [number, number]> = { sprint: [1.5, 6], squat: [1, 10], bench: [0, 7], jump: [22, 42], shoot: [2, 13] };
export const combineGrade = (t: CombineTest, v: number) => { const [lo, hi] = COMBINE_RANGE[t]; return Math.max(0, Math.min(1, (v - lo) / (hi - lo))); };

/**
 * Round 85 (owner): where Garcia thinks you go in the draft, from the combine (each test against the class; a missed
 * day counts its tests as nothing) and the scrimmage (your weighted night). Null until there's something to go on.
 */
export function draftEstimate(c: CareerState): number | null {
  const st = c.story, cb = st?.combine, plan = combinePlan(c);
  const tests = [...(cb?.day1 || cb?.missed1 ? plan.day1 : []), ...(cb?.day2 || cb?.missed2 ? plan.day2 : [])];
  const hasScrim = !!st?.scrimmage;
  if (!tests.length && !hasScrim) return null;
  const comb = tests.length ? tests.reduce((s, t) => s + combineGrade(t, cb?.scores?.[t] ?? -1e9), 0) / tests.length : 0.5;
  const scrim = st?.scrimmage && st.scrimmage !== 'missed' ? Math.max(0, Math.min(1, st.scrimmage.sum / 40)) : st?.scrimmage === 'missed' ? 0 : 0.5;
  const w = hasScrim ? (tests.length ? 0.45 : 1) : 0, total = (1 - w) * comb + w * scrim;
  return Math.max(1, Math.min(60, Math.round(60 - 59 * total)));
}
/** Garcia's line for the phone. */
export function estimateLine(c: CareerState): string {
  const e = draftEstimate(c);
  if (e === null) return 'Too early to tell. Show me something at the combine.';
  return `Right now? I've got you going around pick ${e}. ${RANGE_NAMES[rangeOf(e)]}.`;
}
/** The draft range (round 85: wherever the estimate is). */
export const draftRange = (c: CareerState): DraftRange => rangeOf(draftEstimate(c) ?? 45);

/** Draft night (round 85: the pick follows Garcia's estimate, give or take two): the Lottery team that called you. */
export function draftResult(c: CareerState): { team: string; pick: number } {
  const st = c.story, w = st?.workouts?.find((x) => x.tier === 'Lottery') ?? planWorkouts(c).find((x) => x.tier === 'Lottery')!;
  const rnd = storyRng(st, 0xd4af7), est = draftEstimate(c) ?? 45;
  return { team: w.team, pick: Math.max(1, Math.min(60, est + Math.floor(rnd() * 5) - 2)) };
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
  if (cb?.missed1 || cb?.missed2) out.push('You missed part of the combine. That\'s costing you. Don\'t miss anything else.');
  if (st?.scrimmage === 'missed') out.push('And skipping the scrimmage? Scouts talk.');
  else if (st?.scrimmage && st.scrimmage.sum >= 30) out.push('That scrimmage got people talking. Good talking.');
  if (!st?.scrimmage && cb?.day1) out.push('The scrimmage is where you can move up. Play your game.');
  return out;
}
