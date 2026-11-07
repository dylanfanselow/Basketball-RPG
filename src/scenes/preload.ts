import type Phaser from 'phaser';
import type { GameSim } from '../sim/game';
import type { Player } from '../sim/player';
import { Kit, shade } from '../render/sprites';
import { sheetFor as bankSheetFor, playerSheetKey } from '../render/playerBank';
import { app } from '../state';
import { createStorySim, StoryGame } from './setup';
import { roomPlayerKit, roomSheetKey } from './RoomScene';
import type { CareerState } from '../career/career';

/**
 * Round 60c: build what the next scene needs while you're still in this one, so the story moves on without a
 * "Lacing up…" wait or a missing player. Sprite sheets are drawn by the sheet workers in the background and kept in
 * the shared sheet cache (same keys the scenes ask for); a prepared story sim is handed to GameScene once.
 */

/** Team uniform for a player in a game (home = team colours, away = white with team trim). Shared with GameScene. */
export function playerKit(sim: GameSim, p: Player): Kit {
  const t = sim.teams[p.team].def;
  return p.team === 0
    ? { jersey: t.colors[0], jerseyShade: shade(t.colors[0], 0.75), trim: t.colors[1], shorts: shade(t.colors[0], 0.9), number: p.number }
    : { jersey: '#f2f2f2', jerseyShade: '#cfcfcf', trim: t.colors[0], shorts: '#e6e6e6', number: p.number };
}

/** Start drawing every player's sheet for a game (no-op for sheets already cached or on their way). */
export function prewarmSim(scene: Phaser.Scene, sim: GameSim) {
  for (const p of sim.players) {
    const kit = playerKit(sim, p);
    bankSheetFor(scene, playerSheetKey(p.id, p.appearance, p.height, kit), p.height, p.appearance, kit);
  }
}

let pending: { which: StoryGame; sim: GameSim; career: CareerState } | null = null;

/**
 * Build the next story game now (same players GameScene will get) and start drawing its sheets. `c` = the career it's
 * for (the builder prepares the tutorial for the career it's about to create).
 */
export function prepareStory(scene: Phaser.Scene, which: StoryGame, c: CareerState = app.career) {
  if (pending && pending.which === which && pending.career === c) return;
  const sim = createStorySim(which, c);
  pending = { which, sim, career: c };
  prewarmSim(scene, sim);
}

/** The prepared story game, once (null if none was prepared for this career / game). */
export function takeStory(which: StoryGame): GameSim | null {
  const p = pending;
  pending = null;
  return p && p.which === which && p.career === app.career ? p.sim : null;
}

/** Start drawing your room sprite (the trailer / apartment walk). */
export function prewarmRoom(scene: Phaser.Scene) {
  const c = app.career, kit = roomPlayerKit(c);
  bankSheetFor(scene, roomSheetKey(c), c.height, c.appearance, kit);
}
