/**
 * Round 77: a headless season. Every team plays every other team once (30 teams: 435 games), CPU vs CPU, real
 * rosters, the game's default 3-minute quarters. Writes everything to one JSON file for the season report.
 *   SEASON_OUT=/path/season.json npx vitest run scripts/season.test.ts --dir . --config /dev/null
 * (SEASON_LIMIT=n plays only the first n games, for a quick check.)
 */
import { it } from 'vitest';
import { writeFileSync } from 'fs';
import { GameSim } from '../src/sim/game';
import { TEAMS, NODES } from '../src/sim/data';
import { generateRoster } from '../src/career/roster';
import { emptyInput } from '../src/sim/game';
import type { Player, BoxScore } from '../src/sim/player';
import rosters from '../src/data/rosters.json';

type Line = BoxScore & { gp: number; dd: number; td: number; best: number; ults: number };
const BOX_KEYS = ['pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'ast', 'reb', 'oreb', 'stl', 'blk', 'tov', 'secs', 'usage', 'touches'] as const;

it('season', async () => {
  const out = process.env.SEASON_OUT;
  const limit = Number(process.env.SEASON_LIMIT ?? 1e9);
  const players: Record<string, { name: string; team: string; pos: string; tier: number; star: boolean; perks: string[]; ult: string | null; line: Line }> = {};
  const teams: Record<string, any> = {};
  const games: any[] = [];
  const bestGames: any[] = [];
  const plays: Record<string, { runs: number; pts: number }> = {};
  const counts: Record<string, number> = {};
  const add = (k: string, n = 1) => { counts[k] = (counts[k] ?? 0) + n; };
  // round 78: the shot diet: attempts / makes / points by shot type, league-wide, per team and per player
  type Diet = Record<string, { fga: number; fgm: number; pts: number }>;
  const shots = { league: {} as Diet, teams: {} as Record<string, Diet>, players: {} as Record<string, Diet> };
  const tally = (d: Diet, type: string, made: boolean, pts: number) => { const r = (d[type] ??= { fga: 0, fgm: 0, pts: 0 }); r.fga++; if (made) { r.fgm++; r.pts += pts; } };
  const ults: { id: string; who: string; team: string; outcome: string }[] = [];
  const clutchShots: { who: string; team: string; made: boolean; pts: number; type: string }[] = [];
  for (const t of TEAMS) teams[t.id] = { id: t.id, city: t.city, name: t.name, w: 0, l: 0, pf: 0, pa: 0, ot: 0, closeW: 0, closeL: 0, results: [] as string[], box: {} as Record<string, number>, plays: {} as Record<string, { runs: number; pts: number }>, posts: 0, doubles: 0 };

  const pairs: [number, number][] = [];
  for (let i = 0; i < TEAMS.length; i++) for (let j = i + 1; j < TEAMS.length; j++) pairs.push((i + j) % 2 ? [i, j] : [j, i]);
  // spread each team's games through the schedule (a deterministic shuffle)
  pairs.sort((a, b) => ((a[0] * 7919 + a[1] * 104729) % 1009) - ((b[0] * 7919 + b[1] * 104729) % 1009));

  let gi = 0;
  for (const [hi, ai] of pairs) {
    if (gi >= limit) break;
    await new Promise((r) => setImmediate(r)); // let vitest's worker breathe between games (a long sync test times its RPC out)
    const home = TEAMS[hi], away = TEAMS[ai];
    const g = new GameSim({ mode: 'game', quarterLen: 180, seed: 1000 + gi, teams: [home, away], rosters: [generateRoster(home, 0), generateRoster(away, 1)], userId: null, trust: { team: 50, coach: 50 }, ult: { unlocked: false, id: null, level: 0 } } as any);
    const tid = (p: Player) => (p.team === 0 ? home.id : away.id);
    const key = (p: Player) => `${tid(p)}|${p.name}`;
    // watch the game tick by tick: events, post-ups and doubles, Freight Train breaks, Gravity screens
    let seen = 0;
    const postSeen = new Set<string>(), helpSeen = new Set<string>();
    const pendingClutch = new Map<string, { type: string; team: string; who: string }>();
    const pendingShot = new Map<string, { type: string; team: string; key: string }>();
    let lastUlt: { id: string; who: string; team: string; at: number } | null = null;
    let lastPostPass = g.lastPostPassAt;
    const freightWas = new Map<string, number>(), screenWas = new Map<string, string>();
    const inp = emptyInput();
    for (let t = 0; t < 3000 && !g.over; t += 1 / 30) {
      g.update(1 / 30, inp);
      for (; seen < g.events.length; seen++) {
        const e = g.events[seen];
        const who = e.pid ? g.players.find((q) => q.id === e.pid) : null;
        add(`event:${e.kind}`);
        if (e.kind === 'release' && e.data?.crunch && who) pendingClutch.set(who.id, { type: e.data.type, team: tid(who), who: who.name });
        if (e.kind === 'release' && who) pendingShot.set(who.id, { type: e.data?.type ?? '?', team: tid(who), key: key(who) });
        if ((e.kind === 'net' || e.kind === 'rim' || e.kind === 'airball' || e.kind === 'block') && pendingShot.size) {
          // a block's pid is the blocker: the shot is the pending one from the other team
          const id = e.kind === 'block' ? [...pendingShot.keys()].find((k) => g.players.find((q) => q.id === k)?.team !== who?.team) : e.pid;
          const ps = id ? pendingShot.get(id) : undefined;
          if (ps) {
            const made = e.kind === 'net', pts = made ? (e.data?.pts ?? 2) : 0;
            tally(shots.league, ps.type, made, pts); tally((shots.teams[ps.team] ??= {}), ps.type, made, pts); tally((shots.players[ps.key] ??= {}), ps.type, made, pts);
            pendingShot.delete(id!);
          }
        }
        if (e.kind === 'steal') add(e.text.startsWith('STEAL') ? 'stealsSwipe' : 'stealsPickOff');
        if ((e.kind === 'net' || e.kind === 'rim' || e.kind === 'airball' || e.kind === 'block') && pendingClutch.size) {
          const shooterId = e.kind === 'block' ? [...pendingClutch.keys()][0] : e.pid ?? [...pendingClutch.keys()][0];
          const pc = pendingClutch.get(shooterId!) ?? [...pendingClutch.values()][0];
          if (pc) { clutchShots.push({ who: pc.who, team: pc.team, made: e.kind === 'net', pts: e.data?.pts ?? 2, type: pc.type }); pendingClutch.clear(); }
        }
        if (e.kind === 'ult' && who) { lastUlt = { id: e.data?.id, who: who.name, team: tid(who), at: g.time }; ults.push({ id: e.data?.id, who: who.name, team: tid(who), outcome: 'used' }); players[key(who)] && (players[key(who)].line.ults++); }
        if (e.kind === 'block' && e.text.startsWith('CHASE')) { add('chaseDownBlocks'); const u = ults.findLast((x) => x.id === 'chaseDown'); if (u) u.outcome = 'blocked'; }
        if (e.kind === 'block' && e.text.startsWith('BLOCK PARTY')) add('blockParty');
        if (e.kind === 'score' && lastUlt && g.time - lastUlt.at < 4 && who && who.name === lastUlt.who) { const u = ults.findLast((x) => x.who === lastUlt!.who); if (u && u.outcome === 'used') u.outcome = 'scored'; }
        if (e.kind === 'move') {
          if (e.text.startsWith('UNSTOPPABLE')) add('unstoppable');
          if (e.text.startsWith('Point God')) add('pointGod');
          if (e.text.startsWith('KICK-OUT')) add('ultKickOut');
          if (e.text.includes('Gimme that')) add('gimmeThat');
          if (e.text.includes('Finger wag')) add('fingerWag');
          if (e.text.startsWith('STEP-THROUGH')) add('stepThroughBit');
          if (e.text.includes('bit on the pump fake')) add('pumpFakeBites');
        }
        if (e.kind === 'call' && e.text.startsWith('Coach')) add(`clock:${e.text.replace(/^Coach: "|"$/g, '')}`);
        if (e.kind === 'ankles') add('ankleBreaks');
        if (e.kind === 'poster') add('posters');
        if (e.kind === 'airball') add('airballs');
        if (e.kind === 'violation') add(`violation:${e.text}`);
      }
      if (g.lastPostPassAt > lastPostPass) { lastPostPass = g.lastPostPassAt; add('postKickOuts'); }
      for (const p of g.players) {
        if (p.post) {
          const k = `${p.id}@${p.post.since.toFixed(2)}`;
          if (!postSeen.has(k)) { postSeen.add(k); add('postUps'); teams[tid(p)].posts++; }
          if (p.post.helpId && !helpSeen.has(k)) { helpSeen.add(k); add('postDoubles'); teams[tid(p)].doubles++; }
        }
        if (p.freightUntil > (freightWas.get(p.id) ?? -99) + 0.5) add('freightTrainBreaks');
        freightWas.set(p.id, p.freightUntil);
        const was = screenWas.get(p.id);
        if (p.state === 'screen' && was !== 'screen' && p.mods.pAdd('gravity') > 0) add('gravityScreens');
        screenWas.set(p.id, p.state);
      }
    }
    // the result
    const hs = g.teams[0].score, as = g.teams[1].score, ot = Math.max(0, g.quarter - g.periods);
    const H = teams[home.id], A = teams[away.id];
    const homeWon = hs > as;
    H.pf += hs; H.pa += as; A.pf += as; A.pa += hs;
    (homeWon ? H : A).w++; (homeWon ? A : H).l++;
    H.results.push(homeWon ? 'W' : 'L'); A.results.push(homeWon ? 'L' : 'W');
    if (ot) { H.ot++; A.ot++; }
    if (Math.abs(hs - as) <= 3) { (homeWon ? H : A).closeW++; (homeWon ? A : H).closeL++; }
    // players
    const lines: any[] = [];
    for (const p of new Set([...g.teams[0].roster, ...g.teams[1].roster])) {
      if (p.box.secs <= 0) continue;
      const k = key(p);
      players[k] ??= { name: p.name, team: tid(p), pos: p.pos, tier: 0, star: p.star, perks: [...p.nodes], ult: p.star ? (g.cpuUlts[p.id]?.id ?? null) : null, line: { ...Object.fromEntries(BOX_KEYS.map((b) => [b, 0])), gp: 0, dd: 0, td: 0, best: 0, ults: 0 } as Line };
      if (p.star && !players[k].ult) players[k].ult = g.cpuUlts[p.id]?.id ?? null;
      const L = players[k].line, b = p.box;
      for (const bk of BOX_KEYS) (L as any)[bk] += (b as any)[bk];
      L.gp++;
      const tens = [b.pts, b.reb, b.ast, b.stl, b.blk].filter((x) => x >= 10).length;
      if (tens >= 2) L.dd++;
      if (tens >= 3) L.td++;
      L.best = Math.max(L.best, b.pts);
      const T = teams[tid(p)].box;
      for (const bk of BOX_KEYS) T[bk] = (T[bk] ?? 0) + (b as any)[bk];
      lines.push({ name: p.name, team: tid(p), pts: b.pts, reb: b.reb, ast: b.ast, stl: b.stl, blk: b.blk, fgm: b.fgm, fga: b.fga, tpm: b.tpm });
    }
    for (const l of lines) bestGames.push({ ...l, game: gi, vs: l.team === home.id ? away.id : home.id });
    // plays called
    for (const side of [0, 1] as const) {
      const T = teams[side === 0 ? home.id : away.id];
      for (const [pid, v] of Object.entries(g.playLog[side] ?? {})) {
        const r = v as { runs: number; pts: number };
        (plays[pid] ??= { runs: 0, pts: 0 }); plays[pid].runs += r.runs; plays[pid].pts += r.pts;
        (T.plays[pid] ??= { runs: 0, pts: 0 }); T.plays[pid].runs += r.runs; T.plays[pid].pts += r.pts;
      }
    }
    const top = lines.slice().sort((a, b) => b.pts - a.pts)[0];
    games.push({ i: gi, home: home.id, away: away.id, hs, as, ot, top: top ? `${top.name} ${top.pts}` : '' });
    gi++;
  }
  // tiers from the rosters (for the report)
  for (const [tid, list] of Object.entries((rosters as any).teams)) for (const e of list as any[]) { const k = `${tid}|${e.name}`; if (players[k]) players[k].tier = e.tier; }
  bestGames.sort((a, b) => b.pts - a.pts);
  const result = { games, teams, players, plays, counts, ults, clutchShots, shots, bestGames: bestGames.slice(0, 40), perkNames: Object.fromEntries(Object.entries(NODES).map(([k, n]) => [k, n.name])) };
  if (out) writeFileSync(out, JSON.stringify(result));
  console.log(`season: ${games.length} games, ${Object.keys(players).length} players with minutes`);
}, 3_600_000);
