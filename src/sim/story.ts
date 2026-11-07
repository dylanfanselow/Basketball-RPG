/**
 * Round 60: the prologue's games (Phaser-free; no state.ts). You're in high school: a rainy-night 2v2 with your best
 * friend Kingston Williams (the starter at your position) that doubles as the tutorial, then 1s against him with his
 * offense maxed out, then the next day's big game on the school court with a scout watching — Kingston is out sick
 * and you start.
 */
import { GameSim } from './game';
import { Player } from './player';
import { TeamDef, CoreStats, CORE_STATS } from './data';
import { Position, HEIGHTS } from './attributes';
import { Rng, clamp } from './math';
import { randomAppearance, Appearance } from '../render/appearance';
import { AI_PERKS, BIAS, FIRST, LAST } from '../career/roster';
import { CareerState, RivalInfo, StoryState, STARTER_CORE, HEIGHT_RANGE, careerPlayer } from '../career/career';

/** Lincoln High (the school on the court): maroon + gold. The 2v2 is two Lincoln sides (team 1 wears white). */
export const LINCOLN: TeamDef = { id: 'LIN', city: 'Lincoln', name: 'Lions', colors: ['#7a1f2b', '#e0b33a'], seed: 6001 };
/** The rival school in the big game (they wear white with navy trim). */
export const JEFFERSON: TeamDef = { id: 'JEF', city: 'Jefferson', name: 'Jaguars', colors: ['#1f3a7a', '#ffffff'], seed: 6002 };

export const RIVAL_ID = 'KINGSTON';
/** Tutorial: everyone plays as an average player (your builder stats stay as they are) — the starter spread +12. */
export const AVG_BONUS = 12;
/** Kingston is a little better than you in the tutorial. */
export const RIVAL_EDGE = 6;
/** The big game: the scout's in the stands and you're locked in. */
export const LOCKED_IN = 10;
const OFFENSE: (keyof CoreStats)[] = ['shooting', 'finishing', 'mobility', 'playmaking'];

/** An average player's spread for a position (the builder's starter spread, +12 on every stat: ~60 average). */
export function avgSpread(pos: Position, plus = 0): CoreStats {
  const out = {} as CoreStats;
  for (const s of CORE_STATS) out[s] = clamp(STARTER_CORE[pos][s] + AVG_BONUS + plus, 1, 99);
  return out;
}

/** The other guys in the 2v2 complement you: guards get a center, wings and bigs get a point guard. */
export const complementPos = (pos: Position): Position => (pos === 'PG' || pos === 'SG' ? 'C' : 'PG');

/** A new story for a fresh career: the prologue starts at the tutorial; Kingston plays your position. */
export function newStory(c: Pick<CareerState, 'pos' | 'number' | 'height'>, rnd: () => number = Math.random): StoryState {
  const [lo, hi] = HEIGHT_RANGE[c.pos];
  const heightIn = clamp(Math.round(c.height * 12) + 1, lo, hi); // an inch taller, if the position allows
  const nums = [0, 1, 2, 3, 4, 5, 10, 11, 12, 13, 15, 21, 22, 23, 24, 30, 32, 33, 34, 35].filter((n) => n !== c.number);
  const rival: RivalInfo = {
    first: 'Kingston', last: 'Williams', pos: c.pos, heightIn,
    number: nums[Math.floor(rnd() * nums.length)], appearance: kingstonLook(randomAppearance(rnd), rnd() < 0.5 ? 3 : 4),
  };
  return { stage: 'tutorial', rival, home: 'trailer' };
}

/** Round 60c (owner): Kingston is Black and wears goggles. Applied to new and already-saved rivals alike. */
export function kingstonLook(a: Appearance, skin = Math.max(3, a.skin)): Appearance {
  const dark = ['#141010', '#2b1d14', '#4a3020'];
  return { ...a, skin: Math.max(3, skin), hairColor: dark.includes(a.hairColor) ? a.hairColor : '#141010', goggles: true, mask: false };
}

function fallbackRival(c: CareerState): RivalInfo {
  return newStory(c, mulberry(c.name.length * 97 + 7)).rival!;
}
function mulberry(seed: number) { const r = new Rng(seed); return () => r.next(); }

/** Kingston as a Player: a little better than your tutorial self, or (1s) every offensive stat at 99. */
export function rivalPlayer(c: CareerState, mode: 'tutorial' | 'ones', team: 0 | 1 = 1): Player {
  const r = c.story?.rival ?? fallbackRival(c);
  const core = avgSpread(r.pos, RIVAL_EDGE);
  if (mode === 'ones') for (const s of OFFENSE) core[s] = 99;
  const nodes = [...new Set([...AI_PERKS[r.pos], 'dr_handle', 'dr_cross', 'sh_root', 'fi_root'])];
  return new Player({
    id: RIVAL_ID, name: `${r.first} ${r.last}`, team, pos: r.pos, core, nodes, number: r.number,
    skin: Math.max(3, r.appearance.skin), height: r.heightIn / 12, appearance: kingstonLook(r.appearance),
  });
}

/** You for a story game: your look, height, number and perks, with a story stat line (career stats untouched). */
export function storyMe(c: CareerState, plus = 0): Player {
  const me = careerPlayer(c, 0);
  me.core = avgSpread(c.pos, plus);
  me.recompute();
  return me;
}

/** A pickup / high-school player: generated look and name, ratings around `base` shaped by position. */
export function extraPlayer(id: string, team: 0 | 1, pos: Position, rng: Rng, base: number, spread = 5): Player {
  const core = {} as CoreStats;
  for (const s of CORE_STATS) core[s] = clamp(Math.round(base + (BIAS[pos][s] ?? 0) * 0.6 + rng.range(-spread, spread)), 30, 95);
  const skin = Math.floor(rng.range(0, 5));
  return new Player({
    id, name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`, team, pos, core, nodes: AI_PERKS[pos],
    number: Math.floor(rng.range(0, 45)), skin, height: HEIGHTS[pos] + rng.range(-0.15, 0.1),
    appearance: randomAppearance(() => rng.next(), skin),
  });
}

/**
 * The tutorial: a 2v2 on one basket (half-court practice; the TutorialDirector runs every possession). You + a
 * complementary teammate vs Kingston + another complementary guy. Every shot falls (the chance is still computed and
 * shown), no blocks, no fouls, the CPU doesn't reach.
 */
export function buildTutorial(c: CareerState, seed: number): GameSim {
  const rng = new Rng(seed);
  const me = storyMe(c);
  const cp = complementPos(c.pos);
  const mate = extraPlayer('T-MATE', 0, cp, rng, 58);
  const king = rivalPlayer(c, 'tutorial', 1);
  const other = extraPlayer('T-OTHER', 1, cp, rng, 58);
  return new GameSim({
    mode: 'practice', quarterLen: 180, seed,
    teams: [LINCOLN, LINCOLN], rosters: [[me, mate], [king, other]], userId: me.id,
    trust: { team: 80, coach: 60 }, ult: { unlocked: false, id: null, level: 0 },
    practice: { defenders: 2, teammates: 1, runPlays: false },
    halfCourt: true, featureUser: true, venue: 'schoolRain',
    story: { forceMake: true, noBlocks: true, noFouls: true, softD: true },
  });
}

/** The 1s: you vs Kingston, make it take it, 1s & 2s to 11, win by 2. Real odds — and his offense is all 99s. */
export function buildOnes(c: CareerState, seed: number): GameSim {
  const me = storyMe(c);
  const king = rivalPlayer(c, 'ones', 1);
  return new GameSim({
    mode: 'practice', quarterLen: 180, seed,
    teams: [LINCOLN, LINCOLN], rosters: [[me], [king]], userId: me.id,
    trust: { team: 60, coach: 60 }, ult: { unlocked: false, id: null, level: 0 },
    featureUser: false, venue: 'schoolRain',
    oneOnOne: { target: 11, scoring: '1s2s', winBy2: true },
  });
}

/**
 * The big game (school court, day): Lincoln (you + four high-schoolers) vs Jefferson. High-school players are rated
 * ~38-52; you're locked in (+10 on your average spread), so you're clearly the best player on the floor. No benches.
 */
export function buildBigGame(c: CareerState, seed: number, quarterLen = 180): GameSim {
  const rng = new Rng(seed ^ 0x5eed);
  const me = storyMe(c, LOCKED_IN);
  const order: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
  const mine = [me, ...order.filter((p) => p !== c.pos).map((pos, i) => extraPlayer(`LIN-${i}`, 0, pos, rng, 45))];
  const theirs = order.map((pos, i) => extraPlayer(`JEF-${i}`, 1, pos, rng, 46));
  me.star = true;
  return new GameSim({
    mode: 'game', quarterLen, seed,
    teams: [LINCOLN, JEFFERSON], rosters: [mine, theirs], userId: me.id,
    trust: { team: 70, coach: 70 }, ult: { unlocked: false, id: null, level: 0 },
    featureUser: true, venue: 'school',
  });
}
