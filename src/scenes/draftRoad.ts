import Phaser from 'phaser';
import { app } from '../state';
import { sfx } from '../audio/sfx';
import { GoEvent } from '../career/draft';

/**
 * Round 84: going to a draft event from the apartment's front door: the combine's two days (round 85: in the arena
 * gym), the scrimmage, or a team's workout (by its kind; the games in an empty arena, the drills in the arena gym).
 */
export function goTo(scene: Phaser.Scene, e: GoEvent) {
  const st = app.career.story!;
  sfx.doorOpen();
  scene.cameras.main.fadeOut(500, 0, 0, 0);
  const start = (key: string, data: object) => scene.time.delayedCall(550, () => scene.scene.start(key, data));
  // round 85: the combine and the shooting / pressure-drill tryouts are in the arena gym; the games in an empty arena
  if (e.kind !== 'workout') {
    if (e.kind === 'combine1' || e.kind === 'combine2') return start('ArenaGym', { test: 'combine', day: e.kind === 'combine1' ? 1 : 2 });
    return start('Game', { mode: 'story', story: 'scrimmage', venue: 'arena' });
  }
  const w = st.workouts![e.index];
  st.going = e.index; app.changed();
  if (w.kind === 'gauntlet' || w.kind === 'shooting') return start('ArenaGym', { test: w.kind });
  return start('Game', { mode: 'story', story: w.kind === 'oneOnOne' ? 'wk1v1' : 'wkTeam', venue: 'arena' });
}
