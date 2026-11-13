import type { V } from './apartment';

/**
 * Round 81b: where Victor Hale and you walk in his scenes (feet), as waypoints around the furniture (never straight
 * through the kitchen island or the treadmill). Phaser-free so the tests can walk them with the real collision.
 */
export const AGENT_PATHS = {
  apartment: {
    /** Hale starts in front of the island's end */
    haleStart: { x: 17.6, y: 13.6 } as V,
    /** to the calendar, around the island's front end */
    haleToCalendar: [{ x: 14.0, y: 12.8 }, { x: 11.1, y: 5.4 }] as V[],
    /** you, from the room's spawn, the same way round */
    youToCalendar: [{ x: 20.0, y: 13.0 }, { x: 14.5, y: 13.0 }, { x: 9.5, y: 4.8 }] as V[],
    /** then both to the garage door (on the left wall) */
    haleToGarage: [{ x: 8.4, y: 8.6 }] as V[],
    youToGarage: [{ x: 9.0, y: 7.0 }, { x: 7.0, y: 9.4 }] as V[],
  },
  garage: {
    /** Hale waits mid-garage while you come in through the apartment door */
    haleStart: { x: 22.5, y: 9.0 } as V,
    youIn: [{ x: 31.2, y: 8.8 }, { x: 25.0, y: 9.4 }] as V[],
    /** he walks out the side door (the outside door on the left wall) */
    haleOut: [{ x: 9.6, y: 8.4 }, { x: 7.6, y: 5.6 }] as V[],
  },
};
