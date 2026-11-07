/**
 * Quick 3v3: three a side from the real rosters. Slots: Guard (PG/SG), Wing (SG/SF/PF), Big (PF/C), on the court
 * they're roles 1 / 3 / 5 (GameSim.refreshOnCourt), which the 3v3 playbook (plays tagged '3v3') is written for.
 * Full court (like Quick 5v5) or half court (one basket, check it up top after every score / stop / dead ball).
 * Phaser-free; no state.ts.
 */
import { TEAMS } from './data';
import { GameSim } from './game';
import { Player } from './player';
import type { Position } from './attributes';
import type { TrustState } from './ai/trust';
import type { UltState } from './ultimates';
import { generateRoster } from '../career/roster';

export const SLOTS = ['Guard', 'Wing', 'Big'] as const;
export type Slot = 0 | 1 | 2;
export const SLOT_POS: Record<Slot, Position[]> = { 0: ['PG', 'SG'], 1: ['SG', 'SF', 'PF'], 2: ['PF', 'C'] };
export const fitsSlot = (slot: Slot, pos: Position) => SLOT_POS[slot].includes(pos);

export interface ThreeSetup {
  myTeam: string; oppTeam: string;
  /** roster indices for Guard / Wing / Big */
  mine: [number, number, number]; theirs: [number, number, number];
  /** 0-2 = that slot's player, 'me' = your created player takes the slot that fits his position */
  playAs: Slot | 'me';
  court: 'full' | 'half';
}

interface Rated { pos: Position; core: Record<string, number> }
const overall = (e: Rated) => Object.values(e.core).reduce((a, b) => a + b, 0) / Object.values(e.core).length;

/** The best-fitting three (by overall): guard, then big, then the wing from who's left. -1 = nobody fits. */
export function defaultLineup(roster: Rated[]): [number, number, number] {
  const used = new Set<number>();
  const best = (slot: Slot) => {
    let bi = -1;
    roster.forEach((e, i) => { if (!used.has(i) && fitsSlot(slot, e.pos) && (bi < 0 || overall(e) > overall(roster[bi]))) bi = i; });
    if (bi < 0) roster.forEach((e, i) => { if (!used.has(i) && (bi < 0 || overall(e) > overall(roster[bi]))) bi = i; }); // nobody fits: best left
    if (bi >= 0) used.add(bi);
    return bi;
  };
  const g = best(0), b = best(2), w = best(1);
  return [g, w, b];
}

/** Players who can fill a slot (indices into the roster), not already used by the other two slots. */
export function slotChoices(roster: Rated[], lineup: [number, number, number], slot: Slot): number[] {
  const others = new Set(lineup.filter((_, i) => i !== slot));
  const fit = roster.map((e, i) => i).filter((i) => !others.has(i) && fitsSlot(slot, roster[i].pos));
  return fit.length ? fit : roster.map((_, i) => i).filter((i) => !others.has(i));
}

/** The slot your created player takes: guards at Guard, SF at Wing, bigs at Big. */
export const slotForPos = (pos: Position): Slot => (pos === 'PG' || pos === 'SG' ? 0 : pos === 'SF' ? 1 : 2);

/**
 * Build the 3v3 game. `me` = your created player (for playAs 'me'); userless (both CPU) when userTeam is null
 * (headless tests).
 */
export function buildThrees(o: ThreeSetup, seed: number, opts: { me?: Player; trust?: TrustState; ult?: UltState; quarterLen?: number; cpuOnly?: boolean } = {}): GameSim {
  const t1 = TEAMS.find((t) => t.id === o.myTeam) ?? TEAMS[0];
  const t2 = TEAMS.find((t) => t.id === o.oppTeam) ?? TEAMS[1];
  const r1 = generateRoster(t1, 0), r2 = generateRoster(t2, 1);
  const pick = (r: Player[], idx: number[]) => idx.map((i, k) => r[i] ?? r[k]).filter((p, i, a) => a.indexOf(p) === i);
  const mine = pick(r1, o.mine), theirs = pick(r2, o.theirs);
  let user: Player | null = null;
  if (!opts.cpuOnly) {
    if (o.playAs === 'me' && opts.me) { const s = slotForPos(opts.me.pos); mine[s] = opts.me; user = opts.me; }
    else user = mine[o.playAs === 'me' ? 0 : o.playAs];
    user.isUser = true;
  }
  return new GameSim({
    mode: 'game',
    quarterLen: opts.quarterLen ?? 180,
    seed,
    teams: [t1, t2],
    rosters: [mine, theirs], // no bench: the three play the whole game
    userId: user?.id ?? null,
    trust: opts.trust ?? { team: 60, coach: 60 },
    ult: opts.ult ?? { unlocked: false, id: null, level: 0 },
    featureUser: true,
    halfCourt: o.court === 'half',
  });
}
