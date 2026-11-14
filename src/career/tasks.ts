/**
 * Round 91 (owner): the to-do list (top right of the room HUD). Each task has a goal you work toward on your own
 * time; reaching it pays out once, the next time you're in a room. The first: watch the starter film courses.
 */
import type { CareerState } from './career';
import { setStat, SKILL_MAX } from './career';
import { CORE_STATS } from '../sim/data';
import { OPEN_COURSES, filmDone } from '../sim/film';

/** Skill levels the film task gives in every skill. */
export const FILM_TASK_LEVELS = 1;

export interface Task {
  id: string;
  /** the row on the list */
  text: string;
  /** what finishing it pays */
  reward: string;
  goal: number;
  progress: (c: CareerState) => number;
  /** is it on your list yet? */
  shown: (c: CareerState) => boolean;
  pay: (c: CareerState) => void;
}

export const TASKS: Task[] = [
  {
    id: 'film', text: 'Watch film', reward: `+${FILM_TASK_LEVELS} every skill`, goal: OPEN_COURSES.length,
    progress: (c) => OPEN_COURSES.filter((id) => filmDone(c).includes(id)).length,
    // the TV is in the apartment: on the list once that's home
    shown: (c) => !c.story || c.story.home === 'apartment',
    pay: (c) => { for (const st of CORE_STATS) setStat(c, st, Math.min(SKILL_MAX, c.skills[st].level + FILM_TASK_LEVELS)); },
  },
];

export const claimed = (c: CareerState) => c.tasks?.claimed ?? [];
/** The tasks on your list right now (shown, not paid out yet). */
export function openTasks(c: CareerState): Task[] { return TASKS.filter((t) => t.shown(c) && !claimed(c).includes(t.id)); }
/** Pay out every finished task (once). Returns the ones paid now. */
export function claimTasks(c: CareerState): Task[] {
  const out: Task[] = [];
  for (const t of openTasks(c)) {
    if (t.progress(c) < t.goal) continue;
    c.tasks ??= { claimed: [] };
    c.tasks.claimed.push(t.id);
    t.pay(c);
    out.push(t);
  }
  return out;
}
