import { it } from 'vitest';
import { buildOneOnOne, DEFAULT_1V1 } from '../src/sim/oneOnOne';
import { CpuLevel } from '../src/sim/ai/levels';
import { run1v1, emptyIsoStats, IsoStats } from '../tests/helpers';

/**
 * Round 61: headless 1v1 CPU numbers by level. Run:
 *   npx vitest run scripts/oneOnOne.test.ts --dir . --config /dev/null
 * SEEDS=n games per pairing; PAIRS=hard-easy,medium-medium (P1 level-P2 level); MATCH=LAL0-BOS0 (team+roster index).
 */
const SEEDS = Number(process.env.SEEDS ?? 6);
const PAIRS = (process.env.PAIRS ?? 'easy-easy,medium-medium,hard-hard,hard-easy,hard-medium').split(',');
const [m1, m2] = (process.env.MATCH ?? 'LAL0-BOS0').split('-').map((s) => ({ team: s.slice(0, 3), idx: Number(s.slice(3) || 0) }));

function line(tag: string, s: IsoStats, games: number) {
  const c = s.clockAt;
  const late = c.filter((x) => x < 2).length, early = c.filter((x) => x > 7).length;
  const topMoves = Object.entries(s.moves).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} ${n}`).join(', ');
  console.log(`${tag.padEnd(8)} wins ${s.wins}/${games}  pts ${(s.pts / games).toFixed(1)}  FG ${s.makes}/${s.shots} (${(100 * s.makes / Math.max(1, s.shots)).toFixed(0)}%)  contest@rel ${(100 * s.contest / Math.max(1, s.shots)).toFixed(0)}%  open ${(100 * s.open / Math.max(1, s.shots)).toFixed(0)}%  clock: <2s ${(100 * late / Math.max(1, c.length)).toFixed(0)}% >7s ${(100 * early / Math.max(1, c.length)).toFixed(0)}%  viol ${s.violations}  sprints ${s.sprints}  chains ${s.chains}  fakes ${s.fakes}  step-thru ${s.stepThroughs}  posts ${s.posts}`);
  console.log(`         moves: ${topMoves}`);
  console.log(`         why: ${Object.entries(s.reasons).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}`);
}

it('1v1 CPU levels', () => {
  for (const pair of PAIRS) {
    const [a, b] = pair.split('-') as [CpuLevel, CpuLevel];
    const out: [IsoStats, IsoStats] = [emptyIsoStats(), emptyIsoStats()];
    for (let s = 1; s <= SEEDS; s++) {
      const g = buildOneOnOne({ ...DEFAULT_1V1, p1Team: m1.team, p1Idx: m1.idx, p2Team: m2.team, p2Idx: m2.idx, cpuLevel: b }, s * 101, false, a);
      run1v1(g, out);
    }
    console.log(`\n== ${pair} (${m1.team}${m1.idx} vs ${m2.team}${m2.idx}, ${SEEDS} games)`);
    line(`P1 ${a}`, out[0], SEEDS);
    line(`P2 ${b}`, out[1], SEEDS);
  }
}, 600000);
