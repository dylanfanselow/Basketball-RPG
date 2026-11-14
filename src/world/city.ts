/**
 * Round 92 (owner): the city map. A one-screen isometric town in a river valley under a snow-capped ridge (the ridge
 * names Ridgemont Academy): the river falls off the ridge, runs down through the middle and fills a reservoir behind a
 * dam. Pure (no Phaser): the places, what a trip costs, and how the stick moves between them. Art coordinates are the
 * map's 960x540 art canvas (the room art's grid: 0.75 art px per scene unit).
 */
import type { CareerState } from '../career/career';

export type PlaceId = 'home' | 'arena' | 'gym' | 'trailer' | 'lincoln' | 'burger' | 'park' | 'gas' | 'cabin' | 'highway';

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

/**
 * Round 93 (owner): the hills north of the arena (nice houses, a few mansions), downtown with the arena, the big gym
 * and Burger Barn, the trailer park across most of the south (Mom's is one of the trailers, Lincoln High and the gas
 * station are down there too), the suburbs in the southwest, a cabin up the mountain, the interstate east.
 */
export const PLACES: Place[] = [
  { id: 'home', name: 'Home', blurb: 'Your place on Cedar Street, at the bottom of the hills. The garage gym is out back.', at: { x: 812, y: 214 }, open: true },
  { id: 'arena', name: 'The Arena', blurb: 'Downtown on the river. Combine days, the scrimmage and team workouts happen here.', at: { x: 612, y: 292 }, open: true },
  { id: 'gym', name: 'Iron Works Gym', blurb: 'The big gym downtown. Better machines: twice the gains for the same sweat.', at: { x: 712, y: 238 }, open: true },
  { id: 'trailer', name: 'Mom\'s Trailer', blurb: 'Pine Flats trailer park, lot 14. Where you grew up.', at: { x: 372, y: 478 }, open: true },
  { id: 'lincoln', name: 'Lincoln High Court', blurb: 'The outdoor court behind your old school. Get some shots up.', at: { x: 476, y: 446 }, open: true },
  { id: 'burger', name: 'Burger Barn', blurb: 'Your old register, a block off the towers. They still owe you a free meal.', at: { x: 744, y: 322 }, open: false },
  { id: 'park', name: 'Riverside Park', blurb: 'A court by the water. Pickup games on weekends.', at: { x: 470, y: 238 }, open: false },
  { id: 'gas', name: 'Gas \'n Go', blurb: 'The gas station on the south road. Snacks, gas, lottery tickets.', at: { x: 588, y: 492 }, open: false },
  { id: 'cabin', name: 'The Cabin', blurb: 'A cabin up the mountain, past the falls. Nobody\'s been up there in a while.', at: { x: 318, y: 150 }, open: false },
  { id: 'highway', name: 'Interstate East', blurb: 'The highway out of town. After the draft, it\'s your road to work.', at: { x: 848, y: 340 }, open: false },
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

/** Round 93 (owner): the big gym costs money to get in (a day pass), and its machines give more per energy. */
export const GYM_DAY_PASS = 25, GYM_XP_MULT = 2;
/** Paid today already, can pay, or can't afford it. */
export function gymPass(c: CareerState): 'paid' | 'pay' | 'broke' {
  if (c.life.gymPass === c.life.day) return 'paid';
  return c.life.money >= GYM_DAY_PASS ? 'pay' : 'broke';
}
/** Buy today's pass (once a day). False if you can't afford it. */
export function buyGymPass(c: CareerState): boolean {
  const s = gymPass(c);
  if (s === 'paid') return true;
  if (s === 'broke') return false;
  c.life.money -= GYM_DAY_PASS; c.life.gymPass = c.life.day;
  return true;
}

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
