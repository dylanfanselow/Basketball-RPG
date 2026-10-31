/**
 * FUTURE: off-court story + random in-season events. Interfaces only for now, so the game loop
 * has hooks for them later. Effects reuse the perk Effect format (applied as timed ModSources)
 * plus career-level effects below.
 */
import type { CareerState } from './career';

export type CareerEffect =
  | { t: 'trust'; team?: number; coach?: number }
  | { t: 'xp'; amount: number }
  | { t: 'flag'; key: string; value: boolean }
  | { t: 'perkPoints'; amount: number }
  | { t: 'buff'; id: string; label: string; games: number; effects: any[] };

export interface StoryChoice { text: string; effects: CareerEffect[]; next?: string }
export interface StoryNode { id: string; speaker?: string; text: string; choices?: StoryChoice[]; next?: string }
export interface RandomEvent { id: string; weight: number; when?: { minGame?: number }; text: string; choices: StoryChoice[] }

export function applyCareerEffects(c: CareerState, effects: CareerEffect[]) {
  for (const e of effects) {
    if (e.t === 'trust') { c.trust.team = Math.max(0, Math.min(100, c.trust.team + (e.team ?? 0))); c.trust.coach = Math.max(0, Math.min(100, c.trust.coach + (e.coach ?? 0))); }
    if (e.t === 'xp') c.xp += e.amount;
    if (e.t === 'flag') c.flags[e.key] = e.value;
    if (e.t === 'perkPoints') c.perkPoints += e.amount;
  }
}

/** The ultimate-unlock story beat (backstory-specific 1v1 + cutscene + position choice) will set this. */
export function unlockUltimate(c: CareerState, ultId: string) {
  c.flags.ult_unlocked = true;
  c.ult.id = ultId;
  c.ult.level = 0;
}
