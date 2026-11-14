import { TEAMS } from '../sim/data';
import { GameSim } from '../sim/game';
import { generateRoster } from '../career/roster';
import { careerPlayer, careerUlt } from '../career/career';
import { planRotation } from '../sim/rotation';
import { app } from '../state';
import { OneOnOneSetup, DEFAULT_1V1, buildOneOnOne } from '../sim/oneOnOne';
import { ThreeSetup, buildThrees } from '../sim/threes';
import { buildTutorial, buildOnes, buildBigGame, buildVisit, buildFinal, newStory } from '../sim/story';
import { buildDraftScrimmage, buildStarterOnes, buildTeamScrimmage } from '../sim/draftGames';
import { TutorialDirector } from '../sim/tutorial';
import type { StoryStage, CareerState } from '../career/career';
export type { ThreeSetup } from '../sim/threes';
export type { OneOnOneSetup } from '../sim/oneOnOne';
export { DEFAULT_1V1 } from '../sim/oneOnOne';

export type Mode = 'practice' | 'quick' | 'quick3' | 'career' | 'oneOnOne' | 'story';
/** Round 60: the prologue's games. */
export type StoryGame = 'tutorial' | 'ones' | 'bigGame' | 'kingston' | 'final'
  /** round 84: the draft scrimmage and the teams' game workouts (round 85: shooting is in the arena gym) */
  | 'scrimmage' | 'wk1v1' | 'wkTeam';

/** Quick-game choices from the setup screen. playAs: 0-4 = that starter, 'me' = your created player. */
export interface MatchSetup { myTeam: string; oppTeam: string; playAs: number | 'me' }

/** Data the Game scene starts with (kept so Restart/Rematch can rebuild the same game). */
export interface GameInit { mode: Mode; setup?: MatchSetup; oneOnOne?: OneOnOneSetup; three?: ThreeSetup; /** round 56: where it's played (story events); else the dev setting */ venue?: import('../sim/game').Venue; /** round 60: a prologue game */ story?: StoryGame; /** round 80i: reopen a finished game (the final's after-scene) */ reuse?: GameSim }

export function createSim(mode: Mode, setupOpts?: MatchSetup, oneOnOne?: OneOnOneSetup, three?: ThreeSetup, story?: StoryGame): GameSim {
  if (mode === 'story') return createStorySim(story ?? 'tutorial');
  if (mode === 'oneOnOne') return buildOneOnOne(oneOnOne ?? DEFAULT_1V1, Math.floor(Math.random() * 1e9));
  const c = app.career;
  if (mode === 'quick3' && three) {
    // 3v3 with real rosters; sandbox trust like Quick 5v5, your ultimate if you play as your own player
    return buildThrees(three, Math.floor(Math.random() * 1e9), { me: careerPlayer(c, 0), quarterLen: app.settings.quarterLen, ult: three.playAs === 'me' ? careerUlt(c) : undefined });
  }
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

  // your player earns star status (iso sets) with the coach's trust and a top-two rating on the team
  if (mode === 'career' && c.trust.coach >= 85) {
    const better = mine.filter((p) => p !== user && p.overall > user.overall).length;
    if (better < 2) {
      user.star = true;
      const others = mine.filter((p) => p.star && p !== user).sort((a, b) => a.overall - b.overall);
      if (others.length >= 2) others[0].star = false;
    }
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
    bigGame: app.settings.bigGame,
    rotation: mode === 'career' ? planRotation(c.trust.coach, app.settings.quarterLen, c.forceStarter) : undefined,
  });
  if (mode === 'career') sim.applyScouting(c.scout ?? []); // round 49: they've seen your last games
  return sim;
}

/** Round 60: build a prologue game (the tutorial gets its director). */
export function createStorySim(which: StoryGame, c: CareerState = app.career): GameSim {
  const seed = Math.floor(Math.random() * 1e9);
  ensureStory(c);
  if (which === 'ones') return buildOnes(c, seed);
  if (which === 'bigGame') return buildBigGame(c, seed);
  if (which === 'kingston') return buildVisit(c, seed);
  if (which === 'final') return buildFinal(c, seed);
  // round 84: the road to the draft
  const w = c.story?.workouts?.[c.story.going ?? -1];
  if (which === 'scrimmage') return buildDraftScrimmage(c, seed);
  if (which === 'wk1v1') return buildStarterOnes(c, w?.team ?? 'MEM', seed);
  if (which === 'wkTeam') return buildTeamScrimmage(c, w?.team ?? 'OKC', seed);
  const sim = buildTutorial(c, seed);
  sim.director = new TutorialDirector(sim);
  return sim;
}

/** A story (with Kingston) on the current career, for dev shortcuts on older saves. */
export function ensureStory(c: CareerState = app.career) {
  if (!c.story) c.story = { stage: 'done', rival: null, home: 'apartment' };
  if (!c.story.rival) c.story.rival = newStory(c).rival;
  if (c.story.squadSeed === undefined) c.story.squadSeed = Math.floor(Math.random() * 1e9); // round 80
}

/** Round 60: where the story continues for a stage (New Game, Load Save, dev menu). */
export function storyScene(stage: StoryStage): [string, object | undefined] {
  const c = app.career;
  switch (stage) {
    case 'tutorial': return ['Game', { mode: 'story', story: 'tutorial', venue: 'schoolRain' }];
    case 'ones': return ['Game', { mode: 'story', story: 'ones', venue: 'schoolRain' }];
    case 'night': return ['Trailer', { night: true, story: 'night' }];
    case 'bigGame': return ['Game', { mode: 'story', story: 'bigGame', venue: 'school' }];
    case 'after': return ['Trailer', { story: 'after' }]; // round 60d: Mom, the day of the big game
    // round 80: Kingston at the court, three months later, the snowy morning, the bus, the national final
    case 'kingston': return ['Game', { mode: 'story', story: 'kingston', venue: 'school' }];
    case 'paper': return ['Paper', undefined];
    case 'snow': return ['Trailer', { story: 'snow' }];
    case 'bus': return ['Bus', undefined];
    case 'final': return ['Game', { mode: 'story', story: 'final', venue: 'arena' }];
    // round 81: home to the wrecked trailer, the letter, the agent, the draft week
    case 'homecoming': return ['Trailer', { night: true, story: 'homecoming' }];
    case 'letter': return ['Trailer', { story: 'letter' }];
    case 'agent': return ['Apartment', { story: 'agent' }];
    case 'agentGarage': return ['Garage', { story: 'agent', at: 'apartment' }]; // round 81b: in through the apartment door
    case 'draftWeek': return ['Apartment', undefined];
    case 'montage': return ['Montage', undefined]; // round 84: the week after the scrimmage
    default: return c.story?.home === 'trailer' ? ['Trailer', undefined] : ['Apartment', undefined];
  }
}
/** Set the story stage (and save). */
export function setStage(stage: StoryStage) {
  ensureStory();
  app.career.story!.stage = stage;
  app.changed();
}
