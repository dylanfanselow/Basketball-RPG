import { TEAMS } from '../sim/data';
import { GameSim } from '../sim/game';
import { generateRoster } from '../career/roster';
import { careerPlayer, careerUlt } from '../career/career';
import { planRotation } from '../sim/rotation';
import { app } from '../state';

export type Mode = 'practice' | 'quick' | 'career';

export function createSim(mode: Mode): GameSim {
  const c = app.career;
  const myTeam = TEAMS.find((t) => t.id === c.teamId) ?? TEAMS[13];
  const oppId = mode === 'career' ? c.season.schedule[c.season.gameNo % c.season.schedule.length] : TEAMS[(TEAMS.indexOf(myTeam) + 1) % TEAMS.length].id;
  const oppTeam = TEAMS.find((t) => t.id === oppId)!;
  const user = careerPlayer(c, 0);
  const mine = generateRoster(myTeam, 0);
  const theirs = generateRoster(oppTeam, 1);

  if (mode === 'quick' || mode === 'practice') {
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
