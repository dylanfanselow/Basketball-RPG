import { it } from 'vitest';
import { TEAMS } from '../src/sim/data';
import { GameSim } from '../src/sim/game';
import { generateRoster } from '../src/career/roster';
import { simToEnd } from '../tests/helpers';
import { ATT } from '../src/sim/attention';
import { OPEN_COURT } from '../src/sim/ai/offense';

/** Round 47: how the top scorers do over several full sim games (real rosters), and how often defenses key in. */
for (const mode of (process.env.MODES ?? 'off,matchups,full').split(',')) it(`scoring ${mode}`, () => {
  const pairs = [['LAL', 'NYK'], ['DAL', 'OKC'], ['DEN', 'MIL'], ['BOS', 'PHI']];
  const lines: string[] = [];
  let stars = { pts: 0, fga: 0, fgm: 0, n: 0 }, rest = { pts: 0, fga: 0, fgm: 0 }, ast = 0;
  const tiers = [0, 0, 0, 0]; let traps = 0, teamPts = 0, share = 0; const hg = { pts: 0, fga: 0, fgm: 0, share: 0, n: 0, tiers: [0, 0, 0, 0] }; const con: Record<string, any> = {};
  for (const [a, b] of pairs) for (let seed = 1; seed <= 3; seed++) {
    const ta = TEAMS.find((t) => t.id === a)!, tb = TEAMS.find((t) => t.id === b)!;
    const g = new GameSim({ mode: 'game', quarterLen: 300, seed, teams: [ta, tb], rosters: [generateRoster(ta, 0), generateRoster(tb, 1)], userId: null, trust: { team: 50, coach: 50 }, ult: { unlocked: false, id: null, level: 0 } });
    const no = mode.startsWith('no-') ? mode.slice(3) : '';
    const only = mode.startsWith('only-') ? mode.slice(5) : '';
    for (const k of Object.keys(ATT)) (ATT as any)[k] = mode === 'bare' ? false : only ? k === only : k !== no;
    // ball-hog scenario (HOG=1): the home team's best scorer gets every pass and never gives it up
    const hog = process.env.HOG ? g.teams[0].onCourt.slice().sort((x, y) => y.overall - x.overall)[0] : null;
    if (hog) {
      const orig = g.pass.bind(g);
      (g as any).pass = (from: any, to: any) => { if (from === hog) return; return orig(from, from.team === hog.team && hog.team === g.possession && g.teams[0].onCourt.includes(hog) ? hog : to); };
    }
    OPEN_COURT.on = !process.env.NO_OPEN;
    g.attentionOff = mode === 'off'; g.tiersOff = mode === 'matchups'; g.assignMatchups();
    const inp = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false };
    let seen: any = null, lastMove = -9;
    for (let tt = 0; tt < 5000 && !g.over; tt += 1 / 30) {
      g.update(1 / 30, inp);
      // DRIVER=1: the hog attacks with a crossover every ~1.2 s when he has it in the frontcourt (like a player spamming moves)
      if (hog && process.env.DRIVER && g.holder() === hog && hog.state === 'idle' && g.time - lastMove > 1.2 && Math.abs(hog.p.x - 47) > 3) {
        lastMove = g.time; g.dribbleMove(hog, { x: 0, y: (Math.floor(g.time) % 2 ? 1 : -1) });
      }
      const ls = g.lastShot;
      if (ls && ls !== seen) {
        seen = ls;
        const sh = g.players.find((p) => p.name === ls.name);
        const tier = sh ? g.tierOf(sh) : 0;
        const k = `${tier}`; (con[k] ??= { n: 0, c: 0, m: 0, open: 0, types: {} as Record<string, number> });
        con[k].n++; con[k].c += ls.ev.contest; if (ls.made) con[k].m++; if (ls.ev.contest < 0.1) con[k].open++;
        con[k].types[ls.ev.type] = (con[k].types[ls.ev.type] ?? 0) + 1;
        if (sh && tier >= 2) {
          const since = g.time - sh.receivedAt;
          const b = since < 0.7 ? 'quick<0.7s' : since < 1.5 ? 'mid<1.5s' : 'late';
          const tr = g.trap?.holderId === sh.id ? 'trap' : 'notrap';
          const trans = g.inTransition(sh.team) ? 'trans' : 'half';
          const key = `${b}/${tr}/${trans}`; (con[k].when ??= {})[key] = (con[k].when[key] ?? 0) + 1;
        }
      }
    }
    traps += g.trapCount[2] + g.trapCount[3];
    if (hog) {
      const ps0 = [...new Set(g.teams[0].roster)], tf0 = ps0.reduce((n, p) => n + p.box.fga, 0);
      hg.pts += hog.box.pts; hg.fga += hog.box.fga; hg.fgm += hog.box.fgm; hg.share += hog.box.fga / Math.max(1, tf0); hg.n++; hg.tiers[g.heat[hog.id]?.tier ?? 0]++;
    }
    for (const t of [0, 1] as const) {
      const ps = [...new Set(g.teams[t].roster)].sort((x, y) => y.box.pts - x.box.pts);
      const top = hog && t === 0 ? hog : ps[0];
      const tf = ps.reduce((n, p) => n + p.box.fga, 0);
      share += top.box.fga / Math.max(1, tf);
      teamPts += g.teams[t].score; stars.pts += top.box.pts; stars.fga += top.box.fga; stars.fgm += top.box.fgm; stars.n++;
      for (const p of ps.slice(1)) { rest.pts += p.box.pts; rest.fga += p.box.fga; rest.fgm += p.box.fgm; }
      ast += ps.reduce((s, p) => s + p.box.ast, 0);
      for (const p of ps) tiers[g.heat[p.id]?.tier ?? 0]++;
      const heat = g.heat[top.id];
      lines.push(`${a}-${b} s${seed} ${g.teams[t].def.id} ${g.teams[t].score}: top ${top.name} ${top.box.pts}pts ${top.box.fgm}/${top.box.fga}${heat ? ` tier ${heat.tier}` : ''}`);
    }
  }
  { const sd = OPEN_COURT.startD; const b = [0, 20, 40, 60, 80].map((lo) => sd.filter((x) => x >= lo && x < lo + 20).length); console.log(`OPEN [${mode}] runs/g ${(OPEN_COURT.runs / 12).toFixed(1)} halfcourt ${(OPEN_COURT.half / 12).toFixed(1)} shots/g ${(OPEN_COURT.shots / 12).toFixed(1)} start-dist buckets 0-20/20-40/40-60/60-80: ${b.join('/')}`); OPEN_COURT.runs = 0; OPEN_COURT.shots = 0; OPEN_COURT.startD = []; OPEN_COURT.half = 0; }
  if (hg.n) console.log(`HOGLINE [${mode}] ${(hg.pts / hg.n).toFixed(1)} pts on ${(hg.fga / hg.n).toFixed(1)} FGA (${(100 * hg.share / hg.n).toFixed(0)}% of team shots), FG ${(100 * hg.fgm / hg.fga).toFixed(1)}%, ended at tier 0/1/2/3: ${hg.tiers.join('/')}`);
  for (const [k, v] of Object.entries(con)) console.log(`  [${mode}] tier ${k}: ${v.n} shots, avg contest ${(100 * v.c / v.n).toFixed(0)}%, open ${(100 * v.open / v.n).toFixed(0)}%, FG ${(100 * v.m / v.n).toFixed(0)}% ${JSON.stringify(v.when ?? {})}`);
  if (process.env.LINES) console.log(lines.join('\n'));
  console.log(`[${mode}] traps/g ${(traps / 12).toFixed(1)} team PPG ${(teamPts / stars.n).toFixed(1)} TOP SCORERS avg ${(stars.pts / stars.n).toFixed(1)} pts (${(100 * share / stars.n).toFixed(0)}% of team FGA), FG ${(100 * stars.fgm / stars.fga).toFixed(1)}% on ${(stars.fga / stars.n).toFixed(1)} FGA | REST FG ${(100 * rest.fgm / rest.fga).toFixed(1)}% | team AST/g ${(ast / stars.n).toFixed(1)} | players ending at tier 0/1/2/3: ${tiers.join('/')}`);
}, 600000);
