import { CareerState, loadCareer, newCareer, saveCareer } from './career/career';
import type { GameSim } from './sim/game';

/** Global app state shared by scenes and the dev panel. */
export const app = {
  career: (loadCareer() ?? newCareer('Rookie', 'SG')) as CareerState,
  sim: null as GameSim | null,
  settings: {
    quarterLen: 180,
    practice: { defenders: 1, teammates: 0, runPlays: false },
    debug: { cone: true, lanes: false, paths: true, hitboxes: false, aiTargets: false },
    timeScale: 1,
    benchSpeed: 6,
    /** dev: treat the next game as a big game (playoffs) — home crowd in team colors */
    bigGame: false,
    /** multi-angle players: force every player to one drawn view (dev), plus a live cache readout */
    angles: { force: null as number | null, flip: false, readout: '' },
  },
  save() { saveCareer(this.career); },
  listeners: new Set<() => void>(),
  changed() { this.save(); for (const l of this.listeners) l(); },
};
(window as any).__app = app;
