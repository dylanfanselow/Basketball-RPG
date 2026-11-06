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
  season: { gameNo: number; wins: number; losses: number; schedule: string[] };
  forceStarter: boolean;
  /** Off-court life (round 36): day counter, cash, and the energy / food bars (0-100). Static for now. */
  life: { day: number; money: number; energy: number; food: number };
  /** Skyrim-style skill levels (round 41): each core skill levels on its own XP. Shown on the room HUD's skill cards.
   *  Since round 42 a skill's level IS its `core` rating (kept equal by addSkillXp / setStat / spendStatPoint). */
  skills: Record<CoreStat, { level: number; xp: number }>;
}

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

export interface GameResult { box: BoxScore; won: boolean; grade: { good: number; bad: number; points: number }; milestones: string[] }

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
export function nextKeyGame(c: CareerState): { index: number; opponent: string; daysAway: number; why: string } | null {
  const n = c.season.schedule.length;
  for (let i = c.season.gameNo; i < n; i++) {
    const why = isKeyGame(c, i);
    if (why) return { index: i, opponent: c.season.schedule[i], daysAway: daysUntilGame(c, i), why };
  }
  return null;
}
