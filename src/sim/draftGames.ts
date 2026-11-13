/**
 * Round 84 (owner): the games on the road to the draft (Phaser-free; no state.ts). The shooting drill (the combine's
 * second day and some workouts), the scrimmage in front of the scouts, and two team workouts: a 1v1 against one of
 * their starters (not their stars) and a scrimmage with their whole team (you run with their bench against their
 * starters). Your real ratings play here: what you trained in the garage counts.
 */
import { GameSim, Director, GameEvent } from './game';
import { Player } from './player';
import { TeamDef, TEAMS } from './data';
import { Position } from './attributes';
import { Rng } from './math';
import { spot } from './court';
import { generateRoster } from '../career/roster';
import { CareerState, careerPlayer } from '../career/career';
import { extraPlayer } from './story';

/** The combine's colors (navy + silver) and the scrimmage's two sides. */
export const COMBINE: TeamDef = { id: 'CMB', city: 'Draft', name: 'Prospects', colors: ['#1d2b5a', '#c0c6cf'], seed: 8401 };
export const PROSPECTS_W: TeamDef = { id: 'PRW', city: 'Team', name: 'White', colors: ['#2a2f3a', '#ffffff'], seed: 8402 };
export const PROSPECTS_B: TeamDef = { id: 'PRB', city: 'Team', name: 'Blue', colors: ['#1f4fa0', '#e8eefc'], seed: 8403 };

/** The drill: five spots around the arc, five shots from each. */
export const DRILL_SPOTS = ['lc', 'lw', 'top', 'rw', 'rc'];
export const DRILL_PER_SPOT = 5;
export const DRILL_SHOTS = DRILL_SPOTS.length * DRILL_PER_SPOT;

/**
 * Round 84: the shooting drill. You start at the first spot with the ball; after every shot (make or miss) the ball
 * comes back to you, five shots a spot, around the arc. The game ends after the last shot lands.
 */
export class ShootingDrill implements Director {
  makes = 0; shots = 0;
  private resetAt = -1;
  private lastFga = 0;
  get spotIndex() { return Math.min(DRILL_SPOTS.length - 1, Math.floor(this.shots / DRILL_PER_SPOT)); }
  get done() { return this.shots >= DRILL_SHOTS; }
  tick(sim: GameSim) {
    const u = sim.user!;
    if (u.box.fga > this.lastFga) { this.shots += u.box.fga - this.lastFga; this.lastFga = u.box.fga; this.resetAt = sim.time + 1.9; }
    if (this.resetAt > 0 && sim.time >= this.resetAt) {
      this.resetAt = -1;
      if (this.done) { sim.over = true; sim.live = false; sim.emit({ kind: 'period', text: `Drill over: ${this.makes}/${this.shots}`, big: true }); return; }
      sim.practiceReset();
    }
  }
  onEvent(sim: GameSim, e: GameEvent) { if (e.kind === 'score' && e.pid === sim.user?.id) this.makes++; }
  /** Back to the current spot with the ball, facing the rim. */
  onReset(sim: GameSim): boolean {
    const u = sim.user!, side = sim.side(0);
    sim.possession = 0; sim.shotClock = 24;
    u.p = spot(side, DRILL_SPOTS[this.spotIndex]); u.vel = { x: 0, y: 0 }; u.state = 'idle'; u.z = 0; u.vz = 0;
    sim.giveBall(u); sim.live = true; sim.pendingInbound = null;
    return true;
  }
}

/** The shooting drill: you alone on a court. */
export function buildShootingDrill(c: CareerState, seed: number, team: TeamDef = COMBINE): GameSim {
  const me = careerPlayer(c, 0);
  const rng = new Rng(seed);
  const rebounder = extraPlayer('DRILL-R', 1, 'C', rng, 40); // never on the floor (no defenders)
  const sim = new GameSim({
    mode: 'practice', quarterLen: 600, seed,
    teams: [team, team], rosters: [[me], [rebounder]], userId: me.id,
    trust: { team: 60, coach: 60 }, ult: { unlocked: false, id: null, level: 0 },
    practice: { defenders: 0, teammates: 0, runPlays: false }, featureUser: true,
  });
  sim.director = new ShootingDrill();
  sim.practiceReset();
  return sim;
}

/** The draft scrimmage: you + four prospects vs five prospects (~56), two 4-minute halves, the scouts watching. */
export function buildDraftScrimmage(c: CareerState, seed: number): GameSim {
  const rng = new Rng(seed ^ 0x5c41);
  const me = careerPlayer(c, 0);
  me.star = true;
  const order: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
  const mine = [me, ...order.filter((p) => p !== c.pos).map((pos, i) => extraPlayer(`PRW-${i}`, 0, pos, rng, 56))];
  const theirs = order.map((pos, i) => extraPlayer(`PRB-${i}`, 1, pos, rng, 56));
  return new GameSim({
    mode: 'game', quarterLen: 240, periods: 2, seed,
    teams: [PROSPECTS_W, PROSPECTS_B], rosters: [mine, theirs], userId: me.id,
    trust: { team: 65, coach: 65 }, ult: { unlocked: false, id: null, level: 0 }, featureUser: true, venue: 'arena',
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
    trust: { team: 60, coach: 60 }, ult: { unlocked: false, id: null, level: 0 }, featureUser: false, venue: 'school',
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
    trust: { team: 60, coach: 60 }, ult: { unlocked: false, id: null, level: 0 }, featureUser: true, venue: 'school',
  });
}
