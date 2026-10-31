import { TEAMS } from '../src/sim/data';
import { GameSim, GameConfig } from '../src/sim/game';
import { generateRoster } from '../src/career/roster';
import { Player } from '../src/sim/player';

export function makeGame(over: Partial<GameConfig> = {}, user?: Player): GameSim {
  const r0 = generateRoster(TEAMS[0], 0);
  const r1 = generateRoster(TEAMS[1], 1);
  if (user) r0.splice(0, 0, user), r0.splice(r0.findIndex((p, i) => i > 0 && p.pos === user.pos), 1);
  return new GameSim({
    mode: 'game', quarterLen: 180, seed: 7, teams: [TEAMS[0], TEAMS[1]], rosters: [r0, r1],
    userId: user?.id ?? null, trust: { team: 50, coach: 50 }, ult: { unlocked: false, id: null, level: 0 },
    ...over,
  });
}

export function simToEnd(g: GameSim, maxSecs = 3000) {
  const inp = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false };
  const dt = 1 / 30;
  for (let t = 0; t < maxSecs && !g.over; t += dt) g.update(dt, inp);
}
