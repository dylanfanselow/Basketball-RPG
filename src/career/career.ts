import { CoreStat, CoreStats, CORE_STATS, TEAMS, BACKSTORIES, NODES } from '../sim/data';
import { Position, HEIGHTS } from '../sim/attributes';
import { Player } from '../sim/player';
import { ModSource } from '../sim/modifiers';
import { TrustState } from '../sim/ai/trust';
import { UltState, ULT_MILESTONES } from '../sim/ultimates';
import type { BoxScore } from '../sim/player';
import { Appearance, defaultAppearance, withDefaults } from '../render/appearance';
import { SeasonState, buildSeason, gameDayOf, nextKeyIndex, settleSeason, nextFall, ROOKIE_SEASON_START, RIVALS } from './schedule';
export { RIVALS };

export const SAVE_VERSION = 4;
export const STAT_POINT_VALUE = 2; // each core-stat point adds this many rating points
export const STAT_MAX = 99;

export interface CareerState {
  version: number;
  name: string; pos: Position; height: number; number: number; skin: number;
  /** round 59b: the builder's first / last name (`name` = both); missing on older saves */
  firstName?: string; lastName?: string;
  appearance: Appearance;
  core: CoreStats;
  level: number; xp: number; statPoints: number; perkPoints: number;
  nodes: string[];
  traits: string[];
  backstory: string | null;
  flags: Record<string, boolean>;
  ult: { id: string | null; level: number; evoPoints: number; seenMilestones: string[] };
  trust: TrustState;
  teamId: string;
  /** Round 49: the scouting report other teams keep on you (your last games, newest last). */
  scout?: ScoutGame[];
  /** round 83: the NBA season (`schedule.ts`): every other team once, key games you play, the rest off-screen */
  season: SeasonState;
  forceStarter: boolean;
  /** Off-court life (round 36): day counter, cash, and the energy / food bars (0-100). Static for now. */
  life: { day: number; money: number; energy: number; food: number };
  /** Skyrim-style skill levels (round 41): each core skill levels on its own XP. Shown on the room HUD's skill cards.
   *  Since round 42 a skill's level IS its `core` rating (kept equal by addSkillXp / setStat / spendStatPoint). */
  skills: Record<CoreStat, { level: number; xp: number }>;
  /**
   * Round 60: the story. `stage` = where the prologue is (tutorial on the rainy court → the 1s → the trailer that
   * night → the big game → done); `rival` = your best friend Kingston (his look is saved so he's the same person when
   * the story brings him back); `home` = where Load Save drops you (older saves keep the apartment).
   */
  story?: StoryState;
}
/** Round 80: after `after` (Mom's talk) the yard is yours (`done` + `checkKingston`); the path end then leads on:
 *  Kingston at the court → three months later (the paper) → the snowy morning → the bus → the national final. */
/** Round 81: after the final: home to the wrecked trailer (`homecoming`), the letter the next morning (`letter`), the
 *  agent at the apartment (`agent`) and in the garage (`agentGarage`), then the week before the draft (`draftWeek`). */
export type StoryStage = 'tutorial' | 'ones' | 'night' | 'bigGame' | 'after' | 'kingston' | 'paper' | 'snow' | 'bus' | 'final'
  | 'homecoming' | 'letter' | 'agent' | 'agentGarage' | 'draftWeek' | 'montage' | 'done';
export interface RivalInfo { first: string; last: string; pos: Position; number: number; heightIn: number; appearance: Appearance }
export interface StoryState {
  stage: StoryStage; rival: RivalInfo | null; home: 'trailer' | 'apartment';
  /** round 60d: how the big game went (Mom's scene after it) */
  bigGame?: BigGameResult;
  /** round 71: Mom said to go check on Kingston (after the big game); until then the trailer door says so */
  checkKingston?: boolean;
  /** round 80: three months later it's winter (the trailer yard is snowy from the snowy morning on) */
  winter?: boolean;
  /** round 80: the Lincoln teammates (same names on the bus and in the national final) */
  squadSeed?: number;
  /** round 80: on the bus, Mom calls (the generator broke): 'go' = you said you'd come home, 'stay' = hold out */
  momCall?: 'go' | 'stay';
  /** round 80: how the national final went */
  final?: BigGameResult;
  /** round 81: the generator blew up during the final and took part of the trailer with it */
  trailerWrecked?: boolean;
  /** round 81: what fixing it put the family in for (taken off your money once) */
  debt?: number;
  /** round 81: the agent who wrote to you after the final (later: he made the generator fail) */
  agent?: string;
  /** round 81: the draft week, career days (set when the agent shows you the calendar) */
  draft?: DraftWeek;
  /** round 82: the last career day the agent called (one call a morning) */
  callDay?: number;
  /** round 84: you called Mom the first night at the apartment */
  momCall2?: boolean;
  /** round 84: the combine (day 1: athletic tests, day 2: the shooting drill), or the days you missed */
  combine?: CombineResult;
  /** round 84: the scrimmage in front of the scouts (your box line), or missed */
  scrimmage?: ScrimmageResult | 'missed';
  /** round 84: the week after the scrimmage (the generator, the register, the workouts) has played */
  montage?: boolean;
  /** round 84: the teams' workouts (one call each, from each tier) */
  workouts?: Workout[];
  /** round 84: the workout you're at (an index into `workouts`) */
  going?: number;
  /** round 84: draft night: who picked you, and where */
  drafted?: { team: string; pick: number };
}
export interface CombineResult {
  day1?: { sprint: number; squat: number; bench: number }; day2?: { makes: number; shots: number };
  missed1?: boolean; missed2?: boolean;
}
export interface ScrimmageResult { pts: number; reb: number; ast: number; sum: number; won: boolean }
export type WorkoutKind = 'scrimmage' | 'shooting' | 'gauntlet' | 'oneOnOne';
/** Round 84: a team's workout: the team, its tier, what they have you do, the day they called, the day of it. */
export interface Workout {
  team: string; tier: 'Contender' | 'Playoff' | 'Lottery'; kind: WorkoutKind; callDay: number; day: number;
  result?: { score: number; text: string } | 'missed';
}
export interface DraftWeek { combine1: number; combine2: number; scrimmage: number; draft: number }
/** Round 81: the debt from fixing the generator and the trailer (owner: your money goes negative). */
export const GENERATOR_DEBT = 15000;
/** Round 81: put the family in debt for the repairs, once. */
export function takeOnDebt(c: CareerState) {
  const st = c.story; if (!st || st.debt) return;
  st.debt = GENERATOR_DEBT; c.life.money -= GENERATOR_DEBT;
}
/** Round 81: the combine and the scrimmage, from the day the agent shows them to you; the draft is its own date
 *  (round 83: Spring 28, see `calendar.STORY_DATES`). */
export function draftWeek(today: number, draft: number): DraftWeek {
  return { combine1: today + 7, combine2: today + 8, scrimmage: today + 10, draft }; // round 81b: 7 days to the combine
}

/** Round 81: the draft week's events by career day (the calendar draws them as tags). */
export function storyEventsByDay(c: CareerState): Map<number, { label: string; color: string }> {
  const out = new Map<number, { label: string; color: string }>(), d = c.story?.draft;
  if (!d) return out;
  out.set(d.combine1, { label: 'COMBINE', color: '#1d428a' });
  out.set(d.combine2, { label: 'COMBINE', color: '#1d428a' });
  out.set(d.scrimmage, { label: 'SCRIMMAGE', color: '#1f5a3a' });
  out.set(d.draft, { label: 'DRAFT', color: '#b8860b' });
  // round 84: the workouts (in the team's colors; two on one day share the tag)
  for (const w of c.story?.workouts ?? []) {
    const t = TEAMS.find((x) => x.id === w.team), had = out.get(w.day);
    out.set(w.day, had?.label.endsWith('WORKOUT') ? { label: `${had.label.split(' ')[0]}+${w.team}`, color: had.color } : { label: `${w.team} WORKOUT`, color: t?.colors[0] ?? '#6a3fa0' });
  }
  return out;
}
export interface BigGameResult { great: boolean; won: boolean; pts: number; reb: number; ast: number }

export const SKILL_START = 40, SKILL_MAX = 99;
export const newSkills = () => Object.fromEntries(CORE_STATS.map((s) => [s, { level: SKILL_START, xp: 0 }])) as CareerState['skills'];
/** XP needed to take a skill from `level` to the next: the higher the level, the more it takes (40 → 6 orbs, 60 → 12,
 *  80 → 18). */
export const skillXpToNext = (level: number) => Math.max(60, (level - 20) * 6);
/** Workout orbs (round 42): each one carries this much skill XP and costs this much energy to send. */
export const ORB_XP = 20, ORB_ENERGY = 2;
/** Pay the energy for one orb; false (and nothing paid) when you're too tired. */
export function takeOrbEnergy(c: CareerState): boolean {
  if (c.life.energy < ORB_ENERGY) return false;
  c.life.energy = Math.max(0, c.life.energy - ORB_ENERGY);
  return true;
}
/** Set a stat: the rating and the skill level move together (the HUD card shows the real rating). */
export function setStat(c: CareerState, stat: CoreStat, v: number) {
  const lv = Math.max(1, Math.min(SKILL_MAX, Math.round(v)));
  c.core[stat] = lv; c.skills[stat].level = lv;
  if (lv >= SKILL_MAX) c.skills[stat].xp = 0;
}
/** Make every skill level equal its rating (old saves, ratings changed elsewhere). */
export function syncSkillsToCore(c: CareerState) {
  for (const st of CORE_STATS) setStat(c, st, c.core[st]);
}
/** Add skill XP (levels up with carry-over, capped at SKILL_MAX). Returns the levels gained. */
export function addSkillXp(c: CareerState, stat: CoreStat, n: number): number {
  const sk = c.skills[stat];
  let gained = 0;
  sk.xp += Math.max(0, n);
  while (sk.level < SKILL_MAX && sk.xp >= skillXpToNext(sk.level)) { sk.xp -= skillXpToNext(sk.level); sk.level++; gained++; }
  if (sk.level >= SKILL_MAX) { sk.level = SKILL_MAX; sk.xp = 0; }
  c.core[stat] = sk.level; // the skill level is the rating
  return gained;
}

export const newLife = () => ({ day: 1, money: 250, energy: 100, food: 100 });

export function newCareer(name: string, pos: Position, teamId = 'LAL'): CareerState {
  const core = Object.fromEntries(CORE_STATS.map((s) => [s, SKILL_START])) as CoreStats;
  return {
    version: SAVE_VERSION, name, pos, height: HEIGHTS[pos], number: 7, skin: 2, appearance: defaultAppearance(),
    core, level: 1, xp: 0, statPoints: 5, perkPoints: 2, nodes: [], traits: [], backstory: null,
    flags: { ult_unlocked: false }, ult: { id: null, level: 0, evoPoints: 0, seenMilestones: [] },
    trust: { team: 20, coach: 20 }, teamId,
    season: buildSeason(teamId, ROOKIE_SEASON_START, name.length * 7919 + 13), forceStarter: false, life: newLife(), skills: newSkills(),
  };
}

/**
 * Round 59: the character builder. Starter skills by position, never below 40 (the baseline), and every position gets
 * the same total, just spread differently: guards lean shooting / playmaking / mobility, bigs lean strength and
 * finishing (a PG has far more playmaking than a C, a C far more strength than a PG).
 */
export const STARTER_CORE: Record<Position, CoreStats> = {
  PG: { shooting: 52, finishing: 44, strength: 40, mobility: 52, playmaking: 52 },
  SG: { shooting: 56, finishing: 46, strength: 40, mobility: 52, playmaking: 46 },
  SF: { shooting: 50, finishing: 50, strength: 44, mobility: 50, playmaking: 46 },
  PF: { shooting: 44, finishing: 50, strength: 54, mobility: 46, playmaking: 46 },
  C: { shooting: 40, finishing: 52, strength: 60, mobility: 44, playmaking: 44 },
};
/**
 * Round 60f (owner): every new career starts with the first perk of the two trees that fit the position (free, no perk
 * points spent). PG: shooting + passing.
 */
export const STARTER_PERKS: Record<Position, string[]> = {
  PG: ['sh_root', 'pa_root'],   // Shooter's Touch, Floor General
  SG: ['sh_root', 'dr_handle'], // Shooter's Touch, Tight Handle
  SF: ['sh_root', 'fi_root'],   // Shooter's Touch, Rim Instincts
  PF: ['fi_root', 'sc_root'],   // Rim Instincts, Brick Wall
  C: ['in_root', 'fi_root'],    // Glass Cleaner, Rim Instincts
};
/** Height range by position, in inches (inclusive). */
export const HEIGHT_RANGE: Record<Position, [number, number]> = { PG: [72, 77], SG: [75, 79], SF: [77, 81], PF: [79, 83], C: [81, 87] };
export const fmtHeight = (inches: number) => `${Math.floor(inches / 12)}'${Math.round(inches % 12)}"`;
/** Round 59b: a name as typed in the builder, letters, spaces, - and ' only, trimmed, at most 12 characters. */
export const NAME_MAX = 12;
export const cleanName = (s: string) => s.replace(/[^A-Za-z '\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();
/**
 * A new career from the builder: your name, look, position, height (clamped to the position's range), jersey number
 * (0-99) and starter skills.
 */
export function createCareer(o: { name?: string; firstName?: string; lastName?: string; number?: number; pos: Position; heightIn: number; appearance: Appearance }): CareerState {
  const first = cleanName(o.firstName ?? ''), last = cleanName(o.lastName ?? '');
  const c = newCareer(first || last ? `${first} ${last}`.trim() : o.name ?? 'Rookie', o.pos);
  if (first) c.firstName = first;
  if (last) c.lastName = last;
  if (o.number !== undefined) c.number = Math.max(0, Math.min(99, Math.round(o.number)));
  const [lo, hi] = HEIGHT_RANGE[o.pos];
  c.height = Math.max(lo, Math.min(hi, Math.round(o.heightIn))) / 12;
  c.appearance = { ...o.appearance }; c.skin = o.appearance.skin;
  for (const s of CORE_STATS) { const v = Math.max(SKILL_START, STARTER_CORE[o.pos][s]); c.skills[s] = { level: v, xp: 0 }; c.core[s] = v; }
  c.nodes = [...STARTER_PERKS[o.pos]];
  return c;
}

export const xpToNext = (level: number) => 120 + level * 45;

/** Backstory + trait effects. Same Effect format as perks, so backstories are pure data. */
export function careerExtraMods(c: CareerState): ModSource[] {
  const out: ModSource[] = [];
  if (c.backstory && BACKSTORIES[c.backstory]) {
    const b = BACKSTORIES[c.backstory];
    out.push({ id: `bs_${c.backstory}`, label: b.name, effects: b.effects });
  }
  return out;
}

export function careerPlayer(c: CareerState, teamIdx: 0 | 1 = 0): Player {
  return new Player({
    id: 'USER', name: c.name, team: teamIdx, pos: c.pos, core: c.core, nodes: c.nodes,
    extra: careerExtraMods(c), isUser: true, number: c.number, skin: c.appearance.skin, height: c.height, appearance: c.appearance,
  });
}

export function careerUlt(c: CareerState): UltState {
  return { unlocked: !!c.flags.ult_unlocked, id: c.ult.id, level: c.ult.level };
}

export function spendStatPoint(c: CareerState, stat: keyof CoreStats): boolean {
  if (c.statPoints <= 0 || c.core[stat] >= STAT_MAX) return false;
  c.statPoints--; setStat(c, stat, Math.min(STAT_MAX, c.core[stat] + STAT_POINT_VALUE));
  return true;
}

export interface GameResult { box: BoxScore; won: boolean; /** round 83: the final score (us, them) */ us?: number; them?: number; grade: { good: number; bad: number; points: number }; milestones: string[]; scout?: ScoutGame }
/** One game in the scouting report: your points and shots, your team's shots, where your points came from. */
export interface ScoutGame { pts: number; fga: number; teamFga: number; rim: number; jumper: number; post: number }

export function computeXP(r: GameResult): number {
  const b = r.box;
  return Math.max(10, Math.round(20 + b.pts * 2 + b.ast * 3 + b.reb * 2 + b.stl * 4 + b.blk * 4 - b.tov * 2 + r.grade.points * 4 + (r.won ? 25 : 0)));
}

/** Apply a finished game to the career. Returns a summary for the post-game screen. */
export function applyGameResult(c: CareerState, r: GameResult) {
  const xp = computeXP(r);
  c.xp += xp;
  let levels = 0;
  while (c.xp >= xpToNext(c.level)) { c.xp -= xpToNext(c.level); c.level++; c.statPoints += 3; c.perkPoints += 1; levels++; }
  const s = c.season, i = s.gameNo;
  c.life.day = Math.max(c.life.day, gameDay(c, i)); // the game was played on its day
  settleSeason(s, c.teamId, gameDay(c, i)); // round 83: the off-screen games before it
  if (s.results) s.results[i] = { won: r.won, us: r.us ?? 0, them: r.them ?? 0 };
  if (r.won) s.wins++; else s.losses++;
  s.gameNo = s.key ? nextKeyIndex(s) : i + 1;
  if (r.scout) { (c.scout ??= []).push(r.scout); if (c.scout.length > 5) c.scout.shift(); }
  const evo: string[] = [];
  if (c.flags.ult_unlocked) {
    for (const m of r.milestones) {
      const def = ULT_MILESTONES[m];
      if (def) { c.ult.evoPoints += def.points; evo.push(`${def.name} (+${def.points} ult evolution)`); }
    }
  }
  return { xp, levels, evo };
}

const KEY = 'hoopcareer.save';
export function saveCareer(c: CareerState) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* ignore */ } }
export function loadCareer(): CareerState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return migrateCareer(JSON.parse(raw));
  } catch { return null; }
}

/** Upgrade older saves in place. v1 -> v2 adds appearance, v2 -> v3 adds the off-court `life` block, v3 -> v4 the skill levels. */
export function migrateCareer(c: any): CareerState | null {
  if (!c || typeof c.version !== 'number') return null;
  if (c.version === 1) { c.appearance = { ...defaultAppearance(), skin: c.skin ?? 2 }; c.version = 2; }
  if (c.version === 2) { c.life = newLife(); c.version = 3; }
  if (c.version === 3) { c.skills = newSkills(); c.version = 4; }
  // round 63: Mid-Range Maestro was removed; owners get Rhythm Shooter (same cost, same slot) instead
  if (Array.isArray(c.nodes)) c.nodes = [...new Set(c.nodes.map((id: string) => (id === 'sh_mid' ? 'sh_midrhythm' : id)))];
  // round 64: Dime Vision merged into Floor General; owners keep the lanes (Floor General) and get the point back if they had both
  if (Array.isArray(c.nodes) && c.nodes.includes('pa_vision')) {
    if (c.nodes.includes('pa_root')) c.perkPoints = (c.perkPoints ?? 0) + 1;
    c.nodes = [...new Set(c.nodes.map((id: string) => (id === 'pa_vision' ? 'pa_root' : id)))];
  }
  // round 65: Lockdown Stance folded into Hand in Face, Swat Team into Anchor, Floor Burn removed (points back)
  if (Array.isArray(c.nodes)) {
    const OLD: Record<string, { cost: number; to: string | null }> = { pd_root: { cost: 1, to: 'pd_contest' }, in_swat: { cost: 2, to: 'in_anchor' }, pd_flop: { cost: 2, to: null } };
    for (const [id, o] of Object.entries(OLD)) {
      if (!c.nodes.includes(id)) continue;
      c.nodes = c.nodes.filter((n: string) => n !== id);
      c.perkPoints = (c.perkPoints ?? 0) + o.cost;
      if (o.to && !c.nodes.includes(o.to)) { c.nodes.push(o.to); c.perkPoints -= NODES[o.to]?.cost ?? 1; }
    }
  }
  if (c.version !== SAVE_VERSION) return null;
  c.appearance = withDefaults(c.appearance);
  if (!c.story) c.story = { stage: 'done', rival: null, home: 'apartment' }; // round 60: saves from before the prologue
  // round 83: the old 10-game placeholder schedules become a real season (record reset): the rookie season while the
  // story's still going, otherwise the next Fall
  if (!c.season?.key) c.season = buildSeason(c.teamId ?? 'LAL', c.story.stage === 'done' ? nextFall(c.life?.day ?? 1) : ROOKIE_SEASON_START, (c.name?.length ?? 5) * 7919 + 13);
  if (c.story.june !== undefined) delete c.story.june; // round 82's June jump is gone
  if (c.story.agent === 'Victor Hale') c.story.agent = 'Donovan Garcia'; // round 84: the agent's new name
  syncSkillsToCore(c as CareerState); // the cards show the real ratings
  return c as CareerState;
}

/**
 * Key games (round 36; round 83, owner: by tiers of team quality, the same number from each tier, see schedule.ts):
 * the opener, the finale, rivals, else the opponent's tier. Off-screen games (`key[i]` false) aren't key: null.
 */
export function isKeyGame(c: CareerState, i: number): string | null {
  const s = c.season, n = s.schedule.length, opp = s.schedule[i % n];
  if (s.key && !s.key[i]) return null;
  if (i === 0) return 'Opener';
  if (i === n - 1) return 'Finale';
  if ((RIVALS[c.teamId] ?? []).includes(opp)) return 'Rivalry';
  if (s.tier?.[i]) return s.tier[i];
  return i % 4 === 3 ? 'National TV' : null;
}
/** The career day of game i (round 83: the season's own dates, Fall 1 to Winter 28). */
export const gameDay = (c: CareerState, i: number) => gameDayOf(c.season, i);
/** Days from today until game i (0 = today). */
export const daysUntilGame = (c: CareerState, i: number) => Math.max(0, gameDay(c, i) - c.life.day);
/** Sleeping refills energy with orbs worth this much each. */
export const ENERGY_ORB = 10, ENERGY_MAX = 100;
/** How many energy orbs a night's sleep sends (enough to refill the bar). */
export const sleepPlan = (c: CareerState) => Math.ceil(Math.max(0, ENERGY_MAX - c.life.energy) / ENERGY_ORB);
/** Add energy (capped). */
export function addEnergy(c: CareerState, n: number) { c.life.energy = Math.min(ENERGY_MAX, Math.max(0, c.life.energy + n)); }
/** Sleep: the next day starts (energy comes back through the orbs the room sends). */
export function advanceDay(c: CareerState) {
  c.life.day++;
  if (!c.story || c.story.stage === 'done') settleSeason(c.season, c.teamId, c.life.day); // round 83: off-screen games resolve
}
/**
 * Round 60b: the schedule card while you're in high school, the big game against Jefferson (tomorrow until the
 * night before, today on game day, played after). Null once the story isn't in the prologue (the NBA schedule).
 */
export function storyKeyGame(c: CareerState): { when: string; what: string } | null {
  const st = c.story;
  if (!st) return null;
  // round 81b: the next draft-week event (the combine, the scrimmage, then the draft)
  if (st.draft && c.life.day <= st.draft.draft) {
    const d = st.draft, day = c.life.day;
    const [at, what] = day <= d.combine2 ? [day <= d.combine1 ? d.combine1 : d.combine2, 'The combine'] : day <= d.scrimmage ? [d.scrimmage, 'The scrimmage'] : [d.draft, 'The draft'];
    const n = at - day;
    return { when: n === 0 ? 'TODAY' : `${n} DAY${n === 1 ? '' : 'S'}`, what };
  }
  // round 80: three months later, the national final against Crestview Prep
  const fin = 'Final vs CRE';
  if (st.stage === 'snow' || st.stage === 'bus' || st.stage === 'final') return { when: 'TODAY', what: fin };
  if (st.stage === 'paper') return { when: 'SOON', what: fin };
  if (st.winter) return { when: 'PLAYED', what: fin };
  const what = 'Big game vs JEF';
  if (st.stage === 'bigGame') return { when: 'TODAY', what };
  if (st.stage === 'after' || st.stage === 'kingston') return { when: 'PLAYED', what };
  if (st.stage === 'done') return st.home === 'trailer' ? { when: 'PLAYED', what } : null;
  return { when: '1 DAY', what };
}

export function nextKeyGame(c: CareerState): { index: number; opponent: string; daysAway: number; why: string } | null {
  const n = c.season.schedule.length;
  for (let i = c.season.gameNo; i < n; i++) {
    const why = isKeyGame(c, i);
    if (why) return { index: i, opponent: c.season.schedule[i], daysAway: daysUntilGame(c, i), why };
  }
  return null;
}
