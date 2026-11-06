import { it } from 'vitest';
import { writeFileSync } from 'fs';
import { TEAMS, PLAYS } from '../src/sim/data';
import { GameSim, emptyInput } from '../src/sim/game';
import { generateRoster } from '../src/career/roster';
import { buildThrees } from '../src/sim/threes';
import { scorerStyle, bucketOf } from '../src/sim/attention';

/**
 * Round 49 play lab: sim every play and measure what works. For each play, headless games where the offense may only
 * call that play; the focus player rotates through the whole lineup (role swaps), so each play is measured with
 * every style of focus player (creator / catch / post). Per run (a call until the next call, a score or a change of
 * possession): points, turnover, shot mix, contest, whether the focus took the shot.
 *
 *   npx vitest run scripts/playLab.test.ts --dir . --config /dev/null          (prints the table)
 *   WRITE=1 … writes src/data/plays/playValues.json (the CPU coach's base values)
 *   PLAYS=floppy,chicago … only those plays; GAMES=n games per play (default 8)
 */
interface Run { team: 0 | 1; play: string; focus: string; style: string; score0: number; tov0: number; shots: { type: string; c: number; focus: boolean }[] }
type Agg = { n: number; pts: number; tov: number; shots: number; focusShots: number; contest: number; rim: number; jumper: number; post: number };
const agg = (): Agg => ({ n: 0, pts: 0, tov: 0, shots: 0, focusShots: 0, contest: 0, rim: 0, jumper: 0, post: 0 });

const PAIRS = [['LAL', 'NYK'], ['DAL', 'OKC'], ['DEN', 'MIL'], ['BOS', 'PHI'], ['GSW', 'CLE'], ['MIA', 'HOU'], ['SAS', 'IND'], ['MIN', 'PHX']];

function labGame(play: string, k: number): GameSim {
  const [a, b] = PAIRS[k % PAIRS.length], seed = 1000 + k;
  const ta = TEAMS.find((t) => t.id === a) ?? TEAMS[0], tb = TEAMS.find((t) => t.id === b) ?? TEAMS[1];
  const small = PLAYS[play].tags.includes('3v3');
  const g = small
    ? buildThrees({ myTeam: ta.id, oppTeam: tb.id, mine: [0, 2, 4], theirs: [0, 2, 4], playAs: 0, court: 'half' } as any, seed, { cpuOnly: true, quarterLen: 240 })
    : new GameSim({ mode: 'game', quarterLen: 240, seed, teams: [ta, tb], rosters: [generateRoster(ta, 0), generateRoster(tb, 1)], userId: null, trust: { team: 50, coach: 50 }, ult: { unlocked: false, id: null, level: 0 } });
  g.cfg.allowedPlays = [play];
  return g;
}

it('play lab', () => {
  const only = process.env.PLAYS?.split(',');
  const games = Number(process.env.GAMES ?? 8);
  const ids = Object.keys(PLAYS).filter((id) => !only || only.includes(id));
  const table: Record<string, Record<string, Agg>> = {};
  for (const play of ids) {
    const T = (table[play] = { all: agg(), creator: agg(), catch: agg(), post: agg() });
    for (let k = 0; k < games; k++) {
      const g = labGame(play, k), inp = emptyInput();
      let ev = g.events.length, run: Run | null = null, seen: unknown = null, rot = k;
      const close = () => {
        if (!run) return;
        const team = g.teams[run.team], pts = team.score - run.score0;
        const tov = [...new Set(team.roster)].reduce((n, p) => n + p.box.tov, 0) - run.tov0;
        for (const A of [T.all, T[run.style as keyof typeof T]]) {
          A.n++; A.pts += pts; A.tov += tov > 0 ? 1 : 0;
          for (const s of run.shots) { A.shots++; A.contest += s.c; if (s.focus) A.focusShots++; A[bucketOf(s.type, false)]++; }
        }
        run = null;
      };
      for (let t = 0; t < 4000 && !g.over; t += 1 / 30) {
        g.update(1 / 30, inp);
        // a new call: close the last run, (re)aim the set at the next player in the rotation, open a run
        for (; ev < g.events.length; ev++) {
          const e = g.events[ev];
          if (e.kind !== 'play' || g.runner.playId !== play) continue;
          close();
          const off = g.teams[g.possession].onCourt, def = PLAYS[play];
          const focus = off[rot++ % off.length];
          if (def.focus) g.runner.call(play, [def.focus, g.playRole(focus)], focus.id);
          const team = g.teams[g.possession];
          run = { team: g.possession, play, focus: focus.id, style: scorerStyle(focus), score0: team.score, tov0: [...new Set(team.roster)].reduce((n, p) => n + p.box.tov, 0), shots: [] };
        }
        if (run && g.possession !== run.team) close();
        const ls = g.lastShot;
        if (run && ls && ls !== seen) {
          seen = ls;
          const shooter = g.players.find((p) => p.name === ls.name);
          if (shooter?.team === run.team) run.shots.push({ type: ls.ev.type, c: ls.ev.contest, focus: shooter.id === run.focus });
        }
      }
      close();
    }
  }
  // the table: points per run, turnovers, shots, how often the focus shoots, contest, shot mix
  const f = (x: number, d = 2) => x.toFixed(d);
  const line = (id: string, s: string, A: Agg) => A.n ? `${id.padEnd(15)} ${s.padEnd(8)} n ${String(A.n).padStart(4)}  pts/run ${f(A.pts / A.n)}  TO ${f(100 * A.tov / A.n, 0).padStart(3)}%  focus shot ${f(100 * A.focusShots / Math.max(1, A.shots), 0).padStart(3)}%  contest ${f(100 * A.contest / Math.max(1, A.shots), 0).padStart(3)}%  rim/jump/post ${[A.rim, A.jumper, A.post].map((x) => f(100 * x / Math.max(1, A.shots), 0)).join('/')}` : '';
  const rows = ids.sort((x, y) => table[y].all.pts / Math.max(1, table[y].all.n) - table[x].all.pts / Math.max(1, table[x].all.n));
  console.log(rows.map((id) => [line(id, 'ALL', table[id].all), ...(['creator', 'catch', 'post'] as const).map((s) => line('', s, table[id][s]))].filter(Boolean).join('\n')).join('\n\n'));
  if (process.env.WRITE) {
    const out: Record<string, Record<string, { ppr: number; n: number }>> = {};
    for (const id of ids) {
      out[id] = {};
      for (const s of ['all', 'creator', 'catch', 'post'] as const) { const A = table[id][s]; if (A.n) out[id][s] = { ppr: +(A.pts / A.n).toFixed(3), n: A.n }; }
    }
    writeFileSync('src/data/plays/playValues.json', JSON.stringify({ _doc: 'Generated by scripts/playLab.test.ts (round 49): points per run of each play by focus-player style. The CPU coach uses these as base values. Re-run with WRITE=1 after changing plays.', plays: out }, null, 1) + '\n');
    console.log('wrote src/data/plays/playValues.json');
  }
}, 3600000);
