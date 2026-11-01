import { TEAMS } from '../sim/data';
import { GameSim } from '../sim/game';
import { generateRoster } from '../career/roster';
import { careerPlayer, careerUlt } from '../career/career';
import { planRotation } from '../sim/rotation';
import { app } from '../state';
import { OneOnOneSetup, DEFAULT_1V1, buildOneOnOne } from '../sim/oneOnOne';
export type { OneOnOneSetup } from '../sim/oneOnOne';
export { DEFAULT_1V1 } from '../sim/oneOnOne';

export type Mode = 'practice' | 'quick' | 'career' | 'oneOnOne';

/** Quick-game choices from the setup screen. playAs: 0-4 = that starter, 'me' = your created player. */
export interface MatchSetup { myTeam: string; oppTeam: string; playAs: number | 'me' }

/** Data the Game scene starts with (kept so Restart/Rematch can rebuild the same game). */
export interface GameInit { mode: Mode; setup?: MatchSetup; oneOnOne?: OneOnOneSetup }

export function createSim(mode: Mode, setupOpts?: MatchSetup, oneOnOne?: OneOnOneSetup): GameSim {
  if (mode === 'oneOnOne') return buildOneOnOne(oneOnOne ?? DEFAULT_1V1, Math.floor(Math.random() * 1e9));
  const c = app.career;
  const myTeam = TEAMS.find((t) => t.id === (setupOpts?.myTeam ?? c.teamId)) ?? TEAMS[13];
  const oppId = setupOpts?.oppTeam ?? (mode === 'career' ? c.season.schedule[c.season.gameNo % c.season.schedule.length] : TEAMS[(TEAMS.indexOf(myTeam) + 1) % TEAMS.length].id);
  const oppTeam = TEAMS.find((t) => t.id === oppId)!;
  let user = careerPlayer(c, 0);
  const mine = generateRoster(myTeam, 0);
  const theirs = generateRoster(oppTeam, 1);

  if (mode === 'quick' && setupOpts && setupOpts.playAs !== 'me') {
    // control a real starter: his own ratings, perks and look
    user = mine[setupOpts.playAs];
    user.isUser = true;
  } else if (mode === 'quick' && setupOpts && setupOpts.playAs === 'me') {
    const idx = Math.max(0, mine.findIndex((p) => p.pos === user.pos));
    mine.splice(idx < 5 ? idx : 0, 1, user);
  } else if (mode === 'quick' || mode === 'practice') {
    // user starts in place of the same-position starter
    const idx = mine.findIndex((p) => p.pos === user.pos);
    mine.splice(idx, 1, user);
  } else {
    mine.push(user); // rookie: on the bench, rotation decides
  }

  const sim = new GameSim({
    mode: mode === 'practice' ? 'practice' : 'game',
    quarterLen: app.settings.quarterLen,
    seed: Math.floor(Math.random() * 1e9),
    teams: [myTeam, oppTeam],
    rosters: [mine, theirs],
    userId: user.id,
    // career games use (and change) your real trust; quick games/practice use a sandbox copy
    trust: mode === 'career' ? c.trust : { team: 60, coach: 60 },
    ult: careerUlt(c),
    practice: app.settings.practice,
    featureUser: mode !== 'career',
    rotation: mode === 'career' ? planRotation(c.trust.coach, app.settings.quarterLen, c.forceStarter) : undefined,
  });
  return sim;
}
