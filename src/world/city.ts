/**
 * Round 92 (owner): the city map. A one-screen isometric town in a river valley under a snow-capped ridge (the ridge
 * names Ridgemont Academy): the river falls off the ridge, runs down through the middle and fills a reservoir behind a
 * dam. Pure (no Phaser): the places, what a trip costs, and how the stick moves between them. Art coordinates are the
 * map's 960x540 art canvas (the room art's grid: 0.75 art px per scene unit).
 */
import type { CareerState } from '../career/career';

export type PlaceId = 'home' | 'trailer' | 'lincoln' | 'arena' | 'ridgemont' | 'crestview' | 'burger' | 'park' | 'trailhead';

export interface Place {
  id: PlaceId;
  name: string;
  /** one line on the card */
  blurb: string;
  /** the art px the place stands on (its sprite's foot, the pedestal, the selection ring) */
  at: { x: number; y: number };
  /** works today? (else the card says "Coming later") */
  open: boolean;
}

export const PLACES: Place[] = [
  { id: 'home', name: 'Home', blurb: 'Your place on Cedar Street. The garage gym is out back.', at: { x: 812, y: 214 }, open: true },
  { id: 'arena', name: 'The Arena', blurb: 'Downtown on the river. Combine days, the scrimmage and team workouts happen here.', at: { x: 612, y: 292 }, open: true },
  { id: 'trailer', name: 'Mom\'s Trailer', blurb: 'Pine Flats, by the tracks. Where you grew up.', at: { x: 300, y: 432 }, open: true },
  { id: 'lincoln', name: 'Lincoln High Court', blurb: 'The outdoor court behind your old school. Get some shots up.', at: { x: 448, y: 454 }, open: true },
  { id: 'ridgemont', name: 'Ridgemont Academy', blurb: 'The prep school on the ridge that took a chance on you.', at: { x: 382, y: 170 }, open: false },
  { id: 'crestview', name: 'Crestview Prep', blurb: 'Across the river and up the hill. Kingston\'s school now.', at: { x: 128, y: 452 }, open: false },
  { id: 'burger', name: 'Burger Barn', blurb: 'Your old register. They still owe you a free meal.', at: { x: 600, y: 468 }, open: false },
  { id: 'park', name: 'Riverside Park', blurb: 'A court by the water. Pickup games on weekends.', at: { x: 470, y: 238 }, open: false },
  { id: 'trailhead', name: 'Ridge Trailhead', blurb: 'The trail up the mountain to the falls. Good for a run.', at: { x: 150, y: 262 }, open: false },
];
export const PLACE: Record<PlaceId, Place> = Object.fromEntries(PLACES.map((p) => [p.id, p])) as Record<PlaceId, Place>;

/** Energy for a trip by distance (art px): across the neighbourhood, across town, the far side. Home is free. */
export const TRIP_ENERGY = [4, 6, 8] as const;
export function travelCost(from: PlaceId, to: PlaceId): number {
  if (to === 'home' || from === to) return 0;
  const a = PLACE[from].at, b = PLACE[to].at, d = Math.hypot(a.x - b.x, a.y - b.y);
  return d < 220 ? TRIP_ENERGY[0] : d < 420 ? TRIP_ENERGY[1] : TRIP_ENERGY[2];
}
/** Can you make the trip? (an event trip is free: they send a car) */
export function canTravel(c: CareerState, cost: number): boolean { return c.life.energy >= cost; }

/**
 * The stick: the place that best lies in that direction from `from` (within ±70°, nearer and straighter wins), or
 * null if there's nothing that way.
 */
export function placeToward(from: PlaceId, dir: { x: number; y: number }): PlaceId | null {
  const l = Math.hypot(dir.x, dir.y);
  if (l < 0.3) return null;
  const ux = dir.x / l, uy = dir.y / l, a = PLACE[from].at;
  let best: PlaceId | null = null, bs = Infinity;
  for (const p of PLACES) {
    if (p.id === from) continue;
    const dx = p.at.x - a.x, dy = p.at.y - a.y, d = Math.hypot(dx, dy);
    const cos = (dx * ux + dy * uy) / d;
    if (cos < Math.cos((70 * Math.PI) / 180)) continue;
    const score = d * (1 + 2.2 * (1 - cos));
    if (score < bs) { bs = score; best = p.id; }
  }
  return best;
}
