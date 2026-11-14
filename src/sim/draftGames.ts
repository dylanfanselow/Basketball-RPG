/**
 * Round 84 (owner): the games on the road to the draft (Phaser-free; no state.ts): the scrimmage in front of the
 * scouts, and two team workouts: a 1v1 against one of their starters (not their stars) and a scrimmage with their
 * whole team (you run with their bench against their starters). Your real ratings play here: what you trained in the
 * garage counts. Round 85: the shooting tests are the shooting mini-game in the arena gym (ArenaGymScene).
 */
import { GameSim } from './game';
import { Player } from './player';
import { TeamDef, TEAMS } from './data';
import { Position } from './attributes';
import { Rng } from './math';
import { generateRoster } from '../career/roster';
import { CareerState, careerPlayer } from '../career/career';
import { extraPlayer } from './story';
import { AI_PERKS } from '../career/roster';
import { topTwo, prospectLook, Prospect, TOP_PERKS, withPrereqs } from '../career/draftClass';

/** The combine's colors (navy + silver) and the scrimmage's two sides. */
export const COMBINE: TeamDef = { id: 'CMB', city: 'Draft', name: 'Prospects', colors: ['#1d2b5a', '#c0c6cf'], seed: 8401 };
export const PROSPECTS_W: TeamDef = { id: 'PRW', city: 'Team', name: 'White', colors: ['#2a2f3a', '#ffffff'], seed: 8402 };
export const PROSPECTS_B: TeamDef = { id: 'PRB', city: 'Team', name: 'Blue', colors: ['#1f4fa0', '#e8eefc'], seed: 8403 };

/** Round 87: the projected top two in the scrimmage (#1 with you, #2 against you). */
export const TOP1_ID = 'TOP1', TOP2_ID = 'TOP2';
/** Round 88 (owner): the share of their team's sets called as their iso (#1, #2), and #1's ball-hog chance per touch. */
export const TOP_ISO: [number, number] = [0.5, 0.55];
export const TOP1_HOG = 0.6;
/** A prospect from the class as a player (his stats, height and face). */
export function prospectPlayer(p: Prospect, id: string, team: 0 | 1, number: number): Player {
  // round 88: the pair get their extra starter perks
  const extra = p.id === 'P1' ? TOP_PERKS[0] : p.id === 'P2' ? TOP_PERKS[1] : [];
  const nodes = withPrereqs([...AI_PERKS[p.pos], ...extra]);
  return new Player({ id, name: p.name, team, pos: p.pos, core: { ...p.core }, nodes, number, skin: prospectLook(p).skin, height: p.heightIn / 12, appearance: prospectLook(p) });
}

/**
 * The draft scrimmage: you + four prospects vs five prospects (~56), two 4-minute halves, the scouts watching. Round
 * 87 (owner): the projected #1 plays with you and #2 against you (their real stats from the class).
 */
export function buildDraftScrimmage(c: CareerState, seed: number): GameSim {
  const rng = new Rng(seed ^ 0x5c41);
  const me = careerPlayer(c, 0);
  me.star = true;
  const { first, second } = topTwo(c.story, c.pos);
  const one = prospectPlayer(first, TOP1_ID, 0, 1), two = prospectPlayer(second, TOP2_ID, 1, 0);
  one.ballHog = TOP1_HOG; // round 88 (owner): #1 is a bit of a ball hog
  const order: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
  const mine = [me, one, ...order.filter((p) => p !== c.pos && p !== first.pos).map((pos, i) => extraPlayer(`PRW-${i}`, 0, pos, rng, 56))];
  const theirs = [...order.filter((p) => p !== second.pos).map((pos, i) => extraPlayer(`PRB-${i}`, 1, pos, rng, 56)), two];
  return new GameSim({
    mode: 'game', quarterLen: 240, periods: 2, seed,
    teams: [PROSPECTS_W, PROSPECTS_B], rosters: [mine, theirs], userId: me.id,
    trust: { team: 65, coach: 65 }, ult: { unlocked: false, id: null, level: 0 }, featureUser: true, venue: 'arena',
    scoutsOnly: true, courtColors: [COMBINE.colors[0], COMBINE.colors[0]], // round 85: an empty arena, scouts on the benches
    isoStars: [{ pid: TOP1_ID, chance: TOP_ISO[0] }, { pid: TOP2_ID, chance: TOP_ISO[1] }], // round 88: their numbers get called
  });
}

/** A team's best starter who isn't one of their stars (the 1v1 workout). */
export function starterFor(teamId: string): Player {
  const team = TEAMS.find((t) => t.id === teamId) ?? TEAMS[0];
  const roster = generateRoster(team, 1);
  const starters = roster.slice(0, 5), pool = starters.filter((p) => !p.star);
  return [...(pool.length ? pool : starters)].sort((a, b) => b.overall - a.overall)[0];
}

/** The 1v1 workout: you against one of their starters, to 11 by 1s and 2s, make it take it, on their practice court. */
export function buildStarterOnes(c: CareerState, teamId: string, seed: number): GameSim {
  const team = TEAMS.find((t) => t.id === teamId) ?? TEAMS[0];
  const me = careerPlayer(c, 0), them = starterFor(teamId);
  return new GameSim({
    mode: 'practice', quarterLen: 180, seed,
    teams: [COMBINE, team], rosters: [[me], [them]], userId: me.id,
    trust: { team: 60, coach: 60 }, ult: { unlocked: false, id: null, level: 0 }, featureUser: false, venue: 'arena',
    scoutsOnly: true, courtColors: [team.colors[0], team.colors[0]], // round 85: their arena, empty, scouts watching
    oneOnOne: { target: 11, scoring: '1s2s', winBy2: true, cpu: 'medium' },
  });
}

/** The full-team workout: you run with their bench against their starters, two 3-minute halves (you in their colors as
 *  the second unit, the starters in white). */
export function buildTeamScrimmage(c: CareerState, teamId: string, seed: number): GameSim {
  const team = TEAMS.find((t) => t.id === teamId) ?? TEAMS[0];
  const roster = generateRoster(team, 1);
  const me = careerPlayer(c, 0);
  const bench = roster.slice(5).filter((p) => p.pos !== c.pos).slice(0, 4);
  while (bench.length < 4) bench.push(roster[roster.length - 1 - bench.length]);
  for (const p of bench) { p.team = 0; p.id = `${p.id}-B`; }
  return new GameSim({
    mode: 'game', quarterLen: 180, periods: 2, seed,
    teams: [{ ...team, id: '2ND', city: team.city, name: 'Second Unit' }, team], rosters: [[me, ...bench], roster.slice(0, 5)], userId: me.id,
    trust: { team: 60, coach: 60 }, ult: { unlocked: false, id: null, level: 0 }, featureUser: true, venue: 'arena',
    scoutsOnly: true, courtColors: [team.colors[0], team.colors[0]], // round 85: their arena, empty, scouts watching
  });
}
