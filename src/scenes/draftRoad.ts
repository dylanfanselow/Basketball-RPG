import Phaser from 'phaser';
import { app } from '../state';
import { sfx } from '../audio/sfx';
import { GoEvent } from '../career/draft';

/**
 * Round 84: going to a draft event from the apartment's front door: the combine (day 1 in the facility with the
 * stations, day 2 the shooting drill on a court), the scrimmage, or a team's workout (by its kind).
 */
export function goTo(scene: Phaser.Scene, e: GoEvent) {
  const st = app.career.story!;
  sfx.doorOpen();
  scene.cameras.main.fadeOut(500, 0, 0, 0);
  const start = (key: string, data: object) => scene.time.delayedCall(550, () => scene.scene.start(key, data));
  if (e.kind !== 'workout') {
    if (e.kind === 'combine1') return start('Garage', { test: 'combine1' });
    return start('Game', { mode: 'story', story: e.kind === 'combine2' ? 'combineShoot' : 'scrimmage', venue: 'arena' });
  }
  const w = st.workouts![e.index];
  st.going = e.index; app.changed();
  if (w.kind === 'gauntlet') return start('Garage', { test: 'gauntlet' });
  return start('Game', { mode: 'story', story: w.kind === 'shooting' ? 'wkShoot' : w.kind === 'oneOnOne' ? 'wk1v1' : 'wkTeam', venue: 'school' });
}
