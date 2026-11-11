/**
 * Round 78: how much each Lethal Shooter / Chef tuning option moves the shooting GOATs. Plays every game of the teams
 * with a Lethal Shooter (each against every other team once, the same seeds for every option) under each option.
 *   npx vitest run scripts/goatTune.test.ts --dir . --config /dev/null      (GOAT_OUT=<file> also writes JSON)
 */
import { it } from 'vitest';
import { writeFileSync } from 'fs';
import { GameSim, emptyInput } from '../src/sim/game';
import { SHOOT_TUNE } from '../src/sim/shooting';
import { TEAMS } from '../src/sim/data';
import { generateRoster } from '../src/career/roster';

const OPTIONS: { id: string; label: string; tune: typeof SHOOT_TUNE }[] = [
  { id: 'base', label: 'Now: Lethal every 2nd green miss, Chef windup x0.80', tune: { lethalEvery: 2, lethalChance: 1, chefWindup: 0.8 } },
  { id: 'A', label: 'A: Lethal every 3rd green miss', tune: { lethalEvery: 3, lethalChance: 1, chefWindup: 0.8 } },
  { id: 'B', label: 'B: Chef windup x0.88', tune: { lethalEvery: 2, lethalChance: 1, chefWindup: 0.88 } },
  { id: 'C', label: 'C: Lethal 40% of green misses + Chef x0.85', tune: { lethalEvery: 2, lethalChance: 0.4, chefWindup: 0.85 } },
];

it('goat tuning', async () => {
  const lethalTeams = TEAMS.filter((t) => generateRoster(t, 0).some((p) => p.nodes.has('sh_lethal'))).map((t) => t.id);
  const pairs: [number, number][] = [];
  TEAMS.forEach((a, i) => TEAMS.forEach((b, j) => { if (i < j && (lethalTeams.includes(a.id) || lethalTeams.includes(b.id))) pairs.push([i, j]); }));
  const out: any[] = [];
  for (const opt of OPTIONS) {
    Object.assign(SHOOT_TUNE, opt.tune);
    const who: Record<string, { team: string; gp: number; pts: number; tpm: number; tpa: number; fgm: number; fga: number; saves: number; w: number }> = {};
    let otherTpm = 0, otherTpa = 0;
    for (const [k, [i, j]] of pairs.entries()) {
      await new Promise((r) => setImmediate(r));
      const home = TEAMS[i], away = TEAMS[j];
      const g = new GameSim({ mode: 'game', quarterLen: 180, seed: 5000 + k, teams: [home, away], rosters: [generateRoster(home, 0), generateRoster(away, 1)], userId: null, trust: { team: 50, coach: 50 }, ult: { unlocked: false, id: null, level: 0 } } as any);
      const inp = emptyInput();
      for (let t = 0; t < 3000 && !g.over; t += 1 / 30) g.update(1 / 30, inp);
      const won = g.teams[0].score > g.teams[1].score ? 0 : 1;
      for (const p of g.players) {
        const tid = p.team === 0 ? home.id : away.id;
        if (p.nodes.has('sh_lethal')) {
          const r = (who[p.name] ??= { team: tid, gp: 0, pts: 0, tpm: 0, tpa: 0, fgm: 0, fga: 0, saves: 0, w: 0 });
          r.gp++; r.pts += p.box.pts; r.tpm += p.box.tpm; r.tpa += p.box.tpa; r.fgm += p.box.fgm; r.fga += p.box.fga; if (p.team === won) r.w++;
          r.saves += g.events.filter((e) => e.kind === 'move' && e.text === 'Lethal shooter' && e.pid === p.id).length;
        } else { otherTpm += p.box.tpm; otherTpa += p.box.tpa; }
      }
    }
    out.push({ option: opt.id, label: opt.label, players: who, othersTp: otherTpm / Math.max(1, otherTpa) });
    console.log(`\n${opt.label}`);
    for (const [n, r] of Object.entries(who)) console.log(`  ${n.padEnd(26)} 3P ${(100 * r.tpm / r.tpa).toFixed(1)}% (${r.tpm}/${r.tpa})  FG ${(100 * r.fgm / r.fga).toFixed(1)}%  ${(r.pts / r.gp).toFixed(1)} ppg  saves ${r.saves}  team ${r.w}-${r.gp - r.w}`);
    console.log(`  everyone else 3P ${(100 * otherTpm / Math.max(1, otherTpa)).toFixed(1)}%`);
  }
  Object.assign(SHOOT_TUNE, OPTIONS[1].tune); // the game's setting since round 78 (option A)
  if (process.env.GOAT_OUT) writeFileSync(process.env.GOAT_OUT, JSON.stringify(out));
}, 3_600_000);
