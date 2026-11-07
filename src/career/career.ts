import { CoreStat, CoreStats, CORE_STATS, TEAMS, BACKSTORIES } from '../sim/data';
import { Position, HEIGHTS } from '../sim/attributes';
import { Player } from '../sim/player';
import { ModSource } from '../sim/modifiers';
import { TrustState } from '../sim/ai/trust';
import { UltState, ULT_MILESTONES } from '../sim/ultimates';
import type { BoxScore } from '../sim/player';
import { Appearance, defaultAppearance, withDefaults } from '../render/appearance';

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
  season: { gameNo: number; wins: number; losses: number; schedule: string[] };
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
export type StoryStage = 'tutorial' | 'ones' | 'night' | 'bigGame' | 'after' | 'done';
export interface RivalInfo { first: string; last: string; pos: Position; number: number; heightIn: number; appearance: Appearance }
export interface StoryState {
  stage: StoryStage; rival: RivalInfo | null; home: 'trailer' | 'apartment';
  /** round 60d: how the big game went (Mom's scene after it) */
  bigGame?: BigGameResult;
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
  const others = TEAMS.filter((t) => t.id !== teamId).map((t) => t.id);
  const schedule = Array.from({ length: 10 }, (_, i) => others[(i * 7) % others.length]);
  return {
    version: SAVE_VERSION, name, pos, height: HEIGHTS[pos], number: 7, skin: 2, appearance: defaultAppearance(),
    core, level: 1, xp: 0, statPoints: 5, perkPoints: 2, nodes: [], traits: [], backstory: null,
    flags: { ult_unlocked: false }, ult: { id: null, level: 0, evoPoints: 0, seenMilestones: [] },
    trust: { team: 20, coach: 20 }, teamId,
    season: { gameNo: 0, wins: 0, losses: 0, schedule }, forceStarter: false, life: newLife(), skills: newSkills(),
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

export interface GameResult { box: BoxScore; won: boolean; grade: { good: number; bad: number; points: number }; milestones: string[]; scout?: ScoutGame }
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
  c.life.day = Math.max(c.life.day, gameDay(c.season.gameNo)); // the game was played on its day
  c.season.gameNo++;
  if (r.won) c.season.wins++; else c.season.losses++;
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
  if (c.version !== SAVE_VERSION) return null;
  c.appearance = withDefaults(c.appearance);
  if (!c.story) c.story = { stage: 'done', rival: null, home: 'apartment' }; // round 60: saves from before the prologue
  syncSkillsToCore(c as CareerState); // the cards show the real ratings
  return c as CareerState;
}

/**
 * Key games (round 36, placeholder until real calendars): the season opener, the finale, games against the team's
 * rivals, and a national-TV game every 4th game. Games are every other day, the next one tomorrow.
 */
export const RIVALS: Record<string, string[]> = {
  LAL: ['BOS', 'LAC', 'GSW'], BOS: ['LAL', 'NYK', 'PHI'], NYK: ['BKN', 'BOS', 'MIA'], BKN: ['NYK'], LAC: ['LAL'],
  GSW: ['LAL', 'CLE'], CLE: ['GSW'], MIA: ['NYK', 'BOS'], PHI: ['BOS'], CHI: ['DET'], DET: ['CHI'], DAL: ['HOU', 'SAS'],
  HOU: ['DAL', 'SAS'], SAS: ['DAL', 'HOU'], OKC: ['DEN'], DEN: ['OKC'],
};
export function isKeyGame(c: CareerState, i: number): string | null {
  const n = c.season.schedule.length, opp = c.season.schedule[i % n];
  if (i === 0) return 'Opener';
  if (i === n - 1) return 'Finale';
  if ((RIVALS[c.teamId] ?? []).includes(opp)) return 'Rivalry';
  if (i % 4 === 3) return 'National TV';
  return null;
}
/** Games are on the calendar (round 43): game i is on day 2 + 2i (the opener is tomorrow from day 1). */
export const gameDay = (i: number) => 2 + 2 * i;
/** Days from today until game i (0 = today). */
export const daysUntilGame = (c: CareerState, i: number) => Math.max(0, gameDay(i) - c.life.day);
/** Sleeping refills energy with orbs worth this much each. */
export const ENERGY_ORB = 10, ENERGY_MAX = 100;
/** How many energy orbs a night's sleep sends (enough to refill the bar). */
export const sleepPlan = (c: CareerState) => Math.ceil(Math.max(0, ENERGY_MAX - c.life.energy) / ENERGY_ORB);
/** Add energy (capped). */
export function addEnergy(c: CareerState, n: number) { c.life.energy = Math.min(ENERGY_MAX, Math.max(0, c.life.energy + n)); }
/** Sleep: the next day starts (energy comes back through the orbs the room sends). */
export function advanceDay(c: CareerState) { c.life.day++; }
/**
 * Round 60b: the schedule card while you're in high school, the big game against Jefferson (tomorrow until the
 * night before, today on game day, played after). Null once the story isn't in the prologue (the NBA schedule).
 */
export function storyKeyGame(c: CareerState): { when: string; what: string } | null {
  const st = c.story;
  if (!st) return null;
  const what = 'Big game vs JEF';
  if (st.stage === 'bigGame') return { when: 'TODAY', what };
  if (st.stage === 'after') return { when: 'PLAYED', what };
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
