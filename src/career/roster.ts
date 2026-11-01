import { TeamDef, CoreStats } from '../sim/data';
import { Player } from '../sim/player';
import { Rng, clamp } from '../sim/math';
import { POSITIONS, Position, HEIGHTS } from '../sim/attributes';
import { randomAppearance, withDefaults, Appearance } from '../render/appearance';
import rostersRaw from '../data/rosters.json';

export interface RosterEntry { name: string; number: number; pos: Position; heightFt: number; tier: number; archetype: string; core: CoreStats; perks: string[]; appearance: Partial<Appearance> }
export const REAL_ROSTERS: Record<string, RosterEntry[]> = (rostersRaw as any).teams;

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

/** Real roster from rosters.json when the team has one, otherwise a generated one. */
export function generateRoster(team: TeamDef, teamIdx: 0 | 1, strength = 0, size = 10): Player[] {
  const real = REAL_ROSTERS[team.id];
  if (real && real.length >= 5) {
    const out = real.map((e, i) => new Player({
      id: `${team.id}-${i}`, name: e.name, team: teamIdx, pos: e.pos, core: { ...e.core }, nodes: e.perks,
      number: e.number, skin: e.appearance.skin ?? 2, height: e.heightFt, appearance: withDefaults(e.appearance),
    }));
    markStars(out, real.map((e) => e.tier));
    return out;
  }
  const gen = generatedRoster(team, teamIdx, strength, size);
  markStars(gen);
  return gen;
}

/**
 * Designated stars (iso sets get run for them): roster tier 4-5 players, at most two, best first; a team with none
 * gets its single best player. Generated rosters (no tiers): the best overall.
 */
export function markStars(players: Player[], tiers?: number[]) {
  const rank = players.map((p, i) => ({ p, tier: tiers?.[i] ?? 0 })).sort((a, b) => b.tier - a.tier || b.p.overall - a.p.overall);
  const picked = rank.filter((r) => r.tier >= 4).slice(0, 2);
  for (const r of picked.length ? picked : rank.slice(0, 1)) r.p.star = true;
}

export function generatedRoster(team: TeamDef, teamIdx: 0 | 1, strength = 0, size = 10): Player[] {
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
    const skin = Math.floor(rng.range(0, 5));
    out.push(new Player({
      appearance: randomAppearance(() => rng.next(), skin),
      id: `${team.id}-${i}`, name, team: teamIdx, pos, core, nodes: AI_PERKS[pos],
      number: Math.floor(rng.range(0, 55)), skin,
      height: HEIGHTS[pos] + rng.range(-0.15, 0.15),
    }));
  }
  return out;
}
