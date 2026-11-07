import { it } from 'vitest';
import { makeGame } from '../tests/helpers';
import { buildThrees, defaultLineup } from '../src/sim/threes';
import { REAL_ROSTERS } from '../src/career/roster';
import { GameSim } from '../src/sim/game';
import { Player } from '../src/sim/player';

const makeUser = () => new Player({ id: 'USER', name: 'You', team: 0, pos: 'SG', core: { shooting: 70, finishing: 70, strength: 60, mobility: 70, playmaking: 65 }, nodes: [], isUser: true });

/**
 * Round 61b: how passes end (caught / picked off / missed with nobody touching it), headless. Run:
 *   npx vitest run scripts/passing.test.ts --dir . --config /dev/null      (SEEDS=n)
 */
const SEEDS = Number(process.env.SEEDS ?? 3);
const inp = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false } as any;

/** A stand-in human: wanders (new direction every ~1 s), never runs to the ball, never touches buttons. */
function humanInput(g: GameSim) {
  let dir = { x: 0, y: 0 }, next = 0;
  return () => {
    if (g.time > next) { next = g.time + 0.6 + Math.random() * 0.8; const a = Math.random() * Math.PI * 2, m = Math.random() < 0.25 ? 0 : 1; dir = { x: Math.cos(a) * m, y: Math.sin(a) * m }; }
    // stay near the action: pull toward the ball's half
    const u = g.user!; const pull = { x: (g.ball.p.x - u.p.x) / 40, y: (25 - u.p.y) / 40 };
    return { ...inp, move: { x: Math.max(-1, Math.min(1, dir.x + pull.x)), y: Math.max(-1, Math.min(1, dir.y + pull.y)) } };
  };
}

function run(tag: string, make: (s: number) => GameSim, human = false) {
  const t = { passes: 0, catches: 0, picks: 0, misses: 0, inbMiss: 0, inb: 0, tov: 0, games: 0, toUser: 0, userMiss: 0, staleePicks: 0 };
  const why: Record<string, number> = {};
  const picks: any[] = [];
  for (let s = 1; s <= SEEDS; s++) {
    const g = make(s);
    const h = human ? humanInput(g) : null;
    for (let x = 0; x < 3000 && !g.over; x += 1 / 30) {
      const bs = g.ball.st;
      const before = bs.kind === 'pass' ? bs : null;
      g.update(1 / 30, h ? h() : inp);
      if (before && g.ball.st.kind !== 'pass' && before.to === g.user) t.toUser++;
    }
    t.games++;
    for (const e of g.events) {
      if (e.kind === 'pass') t.passes++;
      if (e.kind === 'catch') t.catches++;
      if (e.kind === 'steal' && /Picked off/.test(e.text)) { t.picks++; picks.push(e.data ?? {}); if ((e.data?.recvOff ?? 0) > 4) t.staleePicks++; }
      if (e.kind === 'passMiss') {
        t.misses++; if (e.data!.inbound) t.inbMiss++; if (e.data!.human) t.userMiss++;
        const k = `${e.data!.inbound ? 'inbound' : e.data!.magnet ? 'short' : e.data!.overhead ? 'overhead' : e.data!.lob ? 'lob' : 'normal'}/${e.data!.state}`;
        why[k] = (why[k] ?? 0) + 1;
      }
    }
    const uniq = new Set([...g.teams[0].roster, ...g.teams[1].roster]);
    for (const p of uniq) t.tov += p.box.tov;
  }
  const pg = (n: number) => (n / t.games).toFixed(1);
  if (process.env.PICKS) console.log(tag, 'picks (k, len, recvOff):', picks.map((x) => `${x.k.toFixed(2)}/${x.len.toFixed(0)}/${x.recvOff.toFixed(1)}${x.inbound ? 'I' : ''}`).join(' '));
  console.log(`${tag.padEnd(10)} per game: passes ${pg(t.passes)}  caught ${pg(t.catches)}  picked ${pg(t.picks)} (receiver >4 ft off the aim ${pg(t.staleePicks)})  to user ${pg(t.toUser)} (missed ${pg(t.userMiss)})  MISSED ${pg(t.misses)} (inbound ${pg(t.inbMiss)})  tov ${pg(t.tov)}   misses by kind: ${JSON.stringify(why)}`);
}

it('passing', () => {
  run('5v5', (s) => makeGame({ seed: s }));
  run('5v5 +you', (s) => makeGame({ seed: s, featureUser: true }, makeUser()), true);
  const three = (court: 'full' | 'half') => (s: number) => buildThrees({ myTeam: 'LAL', oppTeam: 'BOS', mine: defaultLineup(REAL_ROSTERS.LAL), theirs: defaultLineup(REAL_ROSTERS.BOS), playAs: 0, court }, s, { cpuOnly: true, quarterLen: 120 });
  run('3v3 full', three('full'));
  run('3v3 half', three('half'));
}, 600000);
