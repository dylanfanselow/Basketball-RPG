import { TEAMS } from '../src/sim/data';
import { MOVES } from '../src/sim/data';
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

/** Round 61: per-team numbers from a headless 1v1 (CPU vs CPU). */
export interface IsoStats {
  shots: number; makes: number; contest: number; open: number; clockAt: number[]; violations: number;
  moves: Record<string, number>; reasons: Record<string, number>; chains: number; sprints: number; stepThroughs: number; posts: number; fakes: number; wins: number; pts: number;
}
export const emptyIsoStats = (): IsoStats => ({ shots: 0, makes: 0, contest: 0, open: 0, clockAt: [], violations: 0, moves: {}, reasons: {}, chains: 0, sprints: 0, stepThroughs: 0, posts: 0, fakes: 0, wins: 0, pts: 0 });

/** Play a CPU-vs-CPU 1v1 to the end and add each side's numbers into out[0] / out[1]. */
export function run1v1(g: GameSim, out: [IsoStats, IsoStats], maxSecs = 1200) {
  const inp = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false };
  const teamOf = (pid?: string) => g.players.find((p) => p.id === pid)?.team;
  const chainNames = new Set(Object.values(MOVES).filter((m) => m.chainFrom).map((m) => m.name));
  let last = g.lastShot, cur = 0;
  const lastMoveAt: Record<string, number> = {};
  const dt = 1 / 60;
  for (let t = 0; t < maxSecs && !g.over; t += dt) {
    const clock = g.shotClock;
    g.update(dt, inp as any);
    if (g.lastShot && g.lastShot !== last) {
      last = g.lastShot;
      const team = g.possession; // shots are the offense's (names repeat in a mirror match)
      const s = out[team];
      s.shots++; if (last.made) s.makes++;
      s.contest += last.ev.contest; if (last.ev.contest < 0.12) s.open++;
      s.clockAt.push(clock);
      if (last.ev.type === 'stepThrough' || last.ev.type === 'stepThroughJumper') s.stepThroughs++;
      const shooter = g.teams[team].onCourt[0];
      const why = (shooter?.aiNote ?? '').split(' → ')[0].replace(/[\d.]+ s/, '').replace(/\(.*\)/, '').replace(/^.* bit$/, 'bit').trim() || '?';
      s.reasons[why] = (s.reasons[why] ?? 0) + 1;
    }
    for (; cur < g.events.length; cur++) {
      const e = g.events[cur];
      if (e.kind === 'violation' && e.team !== undefined) out[e.team].violations++;
      const tm = teamOf(e.pid);
      if (tm === undefined) continue;
      if (e.kind === 'burst' && g.possession === tm) out[tm].sprints++;
      if (e.kind === 'post' && /POST UP/.test(e.text)) out[tm].posts++;
      if (e.kind === 'move') {
        if (/Fake/.test(e.text) && !/bit/.test(e.text)) out[tm].fakes++;
        else if (!/bit|STEP|Dive/i.test(e.text)) {
          out[tm].moves[e.text] = (out[tm].moves[e.text] ?? 0) + 1;
          // a combo link: a move straight out of the last one (or a real chain move)
          if (chainNames.has(e.text) || g.time - (lastMoveAt[e.pid!] ?? -9) < 0.75) out[tm].chains++;
          lastMoveAt[e.pid!] = g.time;
        }
      }
    }
  }
  out[0].pts += g.teams[0].score; out[1].pts += g.teams[1].score;
  if (g.over) out[g.teams[0].score > g.teams[1].score ? 0 : 1].wins++;
}
