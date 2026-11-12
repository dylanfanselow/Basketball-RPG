/**
 * How much Lethal Shooter actually matters: the Lethal teams' games (each against every other team once) under Lethal
 * off / every 3rd green miss (the game) / every 2nd (before round 78), over three seed sets, recording every three the
 * Lethal Shooters take (contest, make chance, rhythm, step-back ult, Chef, saved by Lethal) and their teams' results.
 *   LETHAL_OUT=<file> npx vitest run scripts/lethalStudy.test.ts --dir . --config /dev/null      (~12 min)
 * STUDY=mamba: Mamba saving every 2nd missed three (before round 79) vs every 4th (now) instead (~8 min).
 */
import { it } from 'vitest';
import { writeFileSync } from 'fs';
import { GameSim, emptyInput } from '../src/sim/game';
import { SHOOT_TUNE } from '../src/sim/shooting';
import { TEAMS } from '../src/sim/data';
import { generateRoster } from '../src/career/roster';

const LETHAL_OPTIONS = [
  { id: 'off', label: 'Lethal off', tune: { lethalEvery: 1e9, lethalChance: 1, chefWindup: 0.8, mambaThreeEvery: 4 } },
  { id: 'every3', label: 'Every 3rd green miss (now)', tune: { lethalEvery: 3, lethalChance: 1, chefWindup: 0.8, mambaThreeEvery: 4 } },
  { id: 'every2', label: 'Every 2nd green miss (before)', tune: { lethalEvery: 2, lethalChance: 1, chefWindup: 0.8, mambaThreeEvery: 4 } },
];
// round 79: STUDY=mamba compares Mamba saving every 2nd missed three (before) with every 4th (now)
const MAMBA_OPTIONS = [
  { id: 'mamba2', label: 'Mamba threes every 2nd miss (before)', tune: { lethalEvery: 3, lethalChance: 1, chefWindup: 0.8, mambaThreeEvery: 2 } },
  { id: 'mamba4', label: 'Mamba threes every 4th miss (now)', tune: { lethalEvery: 3, lethalChance: 1, chefWindup: 0.8, mambaThreeEvery: 4 } },
];
const OPTIONS = process.env.STUDY === 'mamba' ? MAMBA_OPTIONS : LETHAL_OPTIONS;
const SEEDS = [5000, 6000, 7000];

it('lethal study', async () => {
  const saved = { ...SHOOT_TUNE };
  const lethalTeams = TEAMS.filter((t) => generateRoster(t, 0).some((p) => p.nodes.has('sh_lethal'))).map((t) => t.id);
  const pairs: [number, number][] = [];
  TEAMS.forEach((a, i) => TEAMS.forEach((b, j) => { if (i < j && (lethalTeams.includes(a.id) || lethalTeams.includes(b.id))) pairs.push([i, j]); }));
  const shots: any[] = [], games: any[] = [], lines: any[] = [];
  for (const opt of OPTIONS) {
    Object.assign(SHOOT_TUNE, opt.tune);
    for (const base of SEEDS) for (const [k, [i, j]] of pairs.entries()) {
      await new Promise((r) => setImmediate(r));
      const home = TEAMS[i], away = TEAMS[j];
      const g = new GameSim({ mode: 'game', quarterLen: 180, seed: base + k, teams: [home, away], rosters: [generateRoster(home, 0), generateRoster(away, 1)], userId: null, trust: { team: 50, coach: 50 }, ult: { unlocked: false, id: null, level: 0 } } as any);
      const lethal = g.players.filter((p) => p.nodes.has('sh_lethal'));
      let last = g.lastShot, seen = 0;
      const inp = emptyInput();
      for (let t = 0; t < 3000 && !g.over; t += 1 / 30) {
        g.update(1 / 30, inp);
        let savedNow: string | null = null, mambaNow: string | null = null;
        for (; seen < g.events.length; seen++) { const e = g.events[seen]; if (e.kind === 'move' && e.text === 'Lethal shooter') savedNow = e.pid ?? null; if (e.kind === 'move' && e.text === 'Mamba') mambaNow = e.pid ?? null; }
        const ls = g.lastShot;
        if (ls && ls !== last) {
          last = ls;
          const p = lethal.find((q) => q.name === ls.name);
          if (p) {
            const ev = ls.ev;
            shots.push({
              opt: opt.id, seed: base, name: p.name, type: ev.type, made: ls.made, blocked: !!ls.blocked, saved: savedNow === p.id, mamba: mambaNow === p.id,
              contest: +ev.contest.toFixed(3), pct: +ev.pct.toFixed(3), rhythm: Math.round(p.rhythm),
              ult: ev.terms.some((tm) => tm.kind === 'ult'), chef: ev.terms.some((tm) => tm.label.startsWith('Chef')), pts: ev.pts,
            });
          }
        }
      }
      for (const p of lethal) {
        const mine = p.team === 0 ? g.teams[0].score - g.teams[1].score : g.teams[1].score - g.teams[0].score;
        lines.push({ opt: opt.id, seed: base, name: p.name, pts: p.box.pts, tpm: p.box.tpm, tpa: p.box.tpa, fgm: p.box.fgm, fga: p.box.fga, margin: mine, won: mine > 0 });
      }
      games.push({ opt: opt.id, seed: base, home: home.id, away: away.id, hs: g.teams[0].score, as: g.teams[1].score });
    }
    const L = lines.filter((l) => l.opt === opt.id), S = shots.filter((s) => s.opt === opt.id);
    const tpm = L.reduce((a, l) => a + l.tpm, 0), tpa = L.reduce((a, l) => a + l.tpa, 0);
    console.log(`${opt.label}: ${L.length} player-games, 3P ${(100 * tpm / tpa).toFixed(1)}%, ${(L.reduce((a, l) => a + l.pts, 0) / L.length).toFixed(1)} ppg, saves ${S.filter((s) => s.saved).length}, won ${L.filter((l) => l.won).length}`);
  }
  Object.assign(SHOOT_TUNE, saved);
  if (process.env.LETHAL_OUT) writeFileSync(process.env.LETHAL_OUT, JSON.stringify({ shots, games, lines }));
}, 7_200_000);
