import { TeamDef, CoreStats } from '../sim/data';
import { Player } from '../sim/player';
import { Rng, clamp } from '../sim/math';
import { POSITIONS, Position, HEIGHTS } from '../sim/attributes';

const FIRST = ['Marcus', 'Jalen', 'Tyrese', 'Devin', 'Malik', 'Andre', 'Isaiah', 'Kobe', 'Darius', 'Trey', 'Luka', 'Nikola', 'Jaylen', 'Cade', 'Zion', 'Bam', 'Rudy', 'Khalil', 'Omari', 'Dante', 'Xavier', 'Cam', 'Jordan', 'Miles', 'Evan', 'Theo', 'Amari', 'Quentin', 'Rashad', 'Elijah', 'Bo', 'Kendrick', 'Shai', 'Victor', 'Ty', 'Reggie'];
const LAST = ['Carter', 'Brooks', 'Hayes', 'Mitchell', 'Coleman', 'Price', 'Ward', 'Bryant', 'Okafor', 'Diallo', 'Novak', 'Petrovic', 'Simmons', 'Banks', 'Reed', 'Fields', 'Holloway', 'Jennings', 'Lowe', 'Moss', 'Pierce', 'Grant', 'Vance', 'Stone', 'Booker', 'Rivers', 'Hart', 'Knox', 'Silva', 'Adebayo', 'Fox', 'Duke', 'Wells', 'Payne', 'Shaw', 'Cross'];

/** Archetype biases per position so rosters feel like basketball teams. */
const BIAS: Record<Position, Partial<CoreStats>> = {
  PG: { playmaking: 12, mobility: 8, shooting: 4, strength: -10 },
  SG: { shooting: 10, mobility: 5, playmaking: 2, strength: -6 },
  SF: { shooting: 3, finishing: 4, mobility: 3 },
  PF: { strength: 8, finishing: 5, playmaking: -6, mobility: -3 },
  C: { strength: 14, finishing: 6, shooting: -12, playmaking: -10, mobility: -6 },
};

/** Default perks AI players get so their moves/defense aren't totally vanilla. */
const AI_PERKS: Record<Position, string[]> = {
  PG: ['dr_handle', 'dr_cross', 'pa_root', 'pd_root'],
  SG: ['sh_root', 'sh_catch', 'dr_handle', 'dr_cross'],
  SF: ['sh_root', 'fi_root', 'pd_root'],
  PF: ['fi_root', 'sc_root', 'in_root'],
  C: ['sc_root', 'in_root', 'in_wall', 'fi_root'],
};

export function generateRoster(team: TeamDef, teamIdx: 0 | 1, strength = 0, size = 10): Player[] {
  const rng = new Rng(team.seed * 7919 + 13);
  const out: Player[] = [];
  for (let i = 0; i < size; i++) {
    const pos = POSITIONS[i % 5];
    const starter = i < 5;
    const base = (starter ? 62 : 54) + strength + rng.range(-4, 4);
    const core = {} as CoreStats;
    for (const k of ['shooting', 'finishing', 'strength', 'mobility', 'playmaking'] as const) {
      core[k] = clamp(Math.round(base + (BIAS[pos][k] ?? 0) + rng.range(-7, 7)), 30, 95);
    }
    const name = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
    out.push(new Player({
      id: `${team.id}-${i}`, name, team: teamIdx, pos, core, nodes: AI_PERKS[pos],
      number: Math.floor(rng.range(0, 55)), skin: Math.floor(rng.range(0, 5)),
      height: HEIGHTS[pos] + rng.range(-0.15, 0.15),
    }));
  }
  return out;
}
