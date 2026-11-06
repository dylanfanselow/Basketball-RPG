import { SHOT_TYPES } from './data';
import { DUNK } from './dunks';
import { statFactor } from './attributes';
import { Player } from './player';
import { Side, rimPos, isThree, isCorner } from './court';
import { Vec, dist, sub, norm, dot, cross, clamp, clamp01, curve, len } from './math';

export interface EqTerm { label: string; value: number; kind: 'base' | 'stat' | 'contest' | 'fatigue' | 'perk' | 'contact' | 'ult' | 'fade' }
export interface ShotEval {
  type: string; dist: number; pts: number; pct: number; contest: number;
  terms: EqTerm[]; conds: Set<string>; contestBy: { name: string; dist: number; c: number }[];
  /** dunk style id (dunks.ts) and whether it came off a Windmill Gather */
  dunk?: string; windmill?: boolean;
}

/** Post up, even battle: share of a true contest a leaned-on / sealed defender still gets. */
export const POST_EVEN_CONTEST = 0.55;
export const CONE_HALF = 0.7; // ~40 degrees
/** Fade Away: a narrower cone (the shooter leans away from the contest). */
export const FADE_CONE_HALF = 0.45;
/** Fade Away accuracy falls off exponentially past FADE_FREE_FT: x exp(-(d - 8) / 16). */
export const FADE_FREE_FT = 8, FADE_FALLOFF_FT = 16;
export const fadeFalloff = (d: number) => Math.exp(-Math.max(0, d - FADE_FREE_FT) / FADE_FALLOFF_FT);

/** Half-angle (rad) of the contest cone for this shot type. */
export const coneHalf = (type: string) => (type === 'fade' ? FADE_CONE_HALF : CONE_HALF);

/** Distance (ft) at which a defender stops contesting this shot type. Also the drawn cone length. */
export function contestReach(type: string): number {
  if (type === 'fade') return 3.5;
  if (type === 'mid' || type === 'three' || type === 'deep3') return 5.5;
  if (type === 'floater') return 4;
  return 6;
}

/** Seconds after a pump fake in which stick-toward-rim + shoot is a Step-Through. */
export const STEP_THROUGH_WINDOW = 1.5;
/** Step-Through stride length (ft); the Step-Through perk lengthens it. */
export const stepStride = (p: Player) => (p.hasShot('stepThrough') ? 7 : 5.5);
/** Both step-through finishes (close one-hand finish, or stride into a pull-up jumper). */
export const isStepThrough = (type: string) => type === 'stepThrough' || type === 'stepThroughJumper';
/** After the stride, farther than this from the rim = pull-up jumper instead of a finish. */
export const STEP_FINISH_FT = 11;

/** Did this defender leave his feet on the shooter's most recent pump fake (and is still paying for it)? */
/** Jelly Fake: did this defender jump at the dunk and is he coming down already? */
export function bitOnDunk(def: Player, shooter: Player, now: number): boolean {
  return shooter.dunkStartAt > -5 && def.lastJumpAt >= shooter.dunkStartAt - 0.05 && def.z < 0.6 && now - def.lastJumpAt < 1.6;
}
/** Jelly Fake: the hang (s) it adds before the release, and its make-chance term. */
export const JELLY_HANG = 0.5, JELLY_MULT = 0.85;

export function bitOnFake(def: Player, shooter: Player, now: number): boolean {
  return shooter.pumpFakeAt > -50 && def.lastJumpAt >= shooter.pumpFakeAt - 0.05 && now - def.lastJumpAt < 1.2;
}

/** Pick a shot type from location + stick (Dunk City style: hold back = floater, sideways = hook / euro). */
export function selectShotType(p: Player, side: Side, stick: Vec, now: number): string {
  const rim = rimPos(side);
  const d = dist(p.p, rim);
  const toRim = norm(sub(rim, p.p));
  const sl = len(stick);
  const toward = sl > 0.3 ? dot(stick, toRim) / sl : 0;
  const lateral = sl > 0.3 ? Math.abs(cross(toRim, stick)) / sl : 0;
  const back = toward < -0.45;
  const side_ = lateral > 0.65 && Math.abs(toward) < 0.6;
  const speedToRim = dot(p.vel, toRim);

  // out of a post up (or its window after letting go): post shots
  if (p.post || now < p.postWindowUntil) return postShotType(p, side, stick);
  // Step-Through (everyone): right after a pump fake, hold the stick toward the rim and shoot.
  // Close in it's a one-hand finish; from mid-range or the arc it's a stride into a pull-up jumper.
  if (now - p.pumpFakeAt < STEP_THROUGH_WINDOW && d <= 28 && toward > 0.5) return d - stepStride(p) > STEP_FINISH_FT ? 'stepThroughJumper' : 'stepThrough';
  // Fade Away (unlockable): stick away from the rim + shoot, at any distance (replaces the floater)
  if (back && p.hasShot('fade')) return 'fade';
  // close shots follow the stick: away = floater, toward = layup (push farther out), perpendicular = hook
  // (a Euro Step owner driving at the rim gets the Euro instead of the hook)
  const driving = speedToRim > 6;
  if (d <= 6.5) {
    if (back && d >= 3) return 'floater';
    if (side_) return p.hasShot('euro') && driving && d >= 2.5 ? 'euro' : 'hook';
    const canDunk = p.sub.dunk >= 50 + (7 - p.height) * 30; // taller players dunk with lower ratings
    if (canDunk && (speedToRim > 4 || d < 3.2)) return 'dunk';
    return 'layup';
  }
  if (d <= 12) {
    if (back) return 'floater';
    if (side_) return p.hasShot('euro') && driving && d <= 9 ? 'euro' : 'hook';
    if (d <= 9 && driving) return 'layup';
    return 'push';
  }
  if (isThree(side, p.p)) return d >= 27.5 ? 'deep3' : 'three';
  return 'mid';
}

/**
 * Post shots: stick sideways = hook, toward the rim = layup (close) or push shot, away = fade (if unlocked) or floater,
 * neutral = layup (close) or hook.
 */
export function postShotType(p: Player, side: Side, stick: Vec): string {
  const rim = rimPos(side), d = dist(p.p, rim), toRim = norm(sub(rim, p.p)), sl = len(stick);
  const toward = sl > 0.3 ? dot(stick, toRim) / sl : 0;
  const lateral = sl > 0.3 ? Math.abs(cross(toRim, stick)) / sl : 0;
  if (lateral > 0.65 && Math.abs(toward) < 0.6) return 'hook';
  if (toward > 0.45) return d <= 6.5 ? 'layup' : 'push';
  if (toward < -0.45) return p.hasShot('fade') ? 'fade' : 'floater';
  return d <= 6.5 ? 'layup' : 'hook';
}

/**
 * Dreamer (Finishing ability): the pump fake sells the shot that's lined up, with its own animation. Close finishes
 * get a hook / floater / layup fake; jumpers (and the fade) keep the regular pump fake.
 */
export function fakeClipFor(type: string): string {
  if (type === 'hook') return 'fake_hook';
  if (type === 'floater') return 'fake_floater';
  if (type === 'layup' || type === 'push' || type === 'euro' || type === 'dunk' || type === 'stepThrough') return 'fake_layup';
  return 'pumpfake';
}
export const FAKE_NAMES: Record<string, string> = { fake_hook: 'Hook Fake', fake_floater: 'Floater Fake', fake_layup: 'Layup Fake', pumpfake: 'Pump Fake' };

export interface ShotContext {
  now: number; clutch: boolean;
  override?: { base?: number; label?: string; contestMult?: number };
  /** dunk style (dunks.ts): flash dunks add their make-chance term */
  dunk?: string;
  /** Windmill Gather (Driving ability): contest x WINDMILL_CONTEST */
  windmill?: boolean;
  /** alley-oop catch timing (1 = caught at the top of the leap) */
  oopTiming?: number;
}

/** Windmill Gather: contest and block multipliers on the finish. */
export const WINDMILL_CONTEST = 0.85, WINDMILL_BLOCK = 0.6;
/** Does this finish come off a Windmill Gather? Owners, layups / Euro Steps / dunks, on a drive. */
export function windmillGather(p: Player, type: string, speedToRim: number): boolean {
  return p.mods.pAdd('windmill') > 0 && (type === 'layup' || type === 'euro' || type === 'dunk') && speedToRim > 6;
}

/** Round 48: per extra contester at the rim (finishes), and again on a dunk over them (a poster attempt). */
export const CROWD_MULT = 0.88, POSTER_MULT = 0.85;
/** A defender counts toward the crowd when his own contest is at least this much. */
export const CROWD_MIN_C = 0.08;
/** How many real contesters a close finish goes through (0 for jumpers). */
export function crowdAt(type: string, by: { c: number }[]): number {
  const close = SHOT_TYPES[type].contact || type === 'floater' || type === 'hook' || type === 'push' || type === 'jelly';
  return close ? by.filter((b) => b.c >= CROWD_MIN_C).length : 0;
}

/** Compute the contest from all defenders using the cone that points from shooter to rim. */
export function computeContest(shooter: Player, defenders: Player[], side: Side, type: string, now: number) {
  const rim = rimPos(side);
  const dir = norm(sub(rim, shooter.p));
  const close = SHOT_TYPES[type].contact || type === 'floater' || type === 'hook' || type === 'push';
  const reachFt = contestReach(type);
  let keep = 1;
  const by: { name: string; dist: number; c: number }[] = [];
  const notes: string[] = [];
  for (const d of defenders) {
    if (d.state === 'fallen') continue;
    const rel = sub(d.p, shooter.p);
    const r = len(rel);
    if (r > reachFt) continue;
    const along = dot(rel, dir);
    const lat = Math.abs(cross(dir, rel));
    const ang = Math.atan2(lat, along);
    const half = coneHalf(type);
    let angF = ang <= half ? 1 : clamp01(1 - (ang - half) / 0.8) * 0.55;
    if (r < 2.2) angF = Math.max(angF, 0.5); // bodies right on you still bother you
    const closeness = clamp01(1 - (r - 1.5) / Math.max(0.5, reachFt - 1.5));
    const heightF = clamp(0.8 + (d.height - shooter.height) * 0.3, 0.6, 1.35);
    const handUp = d.z > 0.4 ? 1.3 : 1;
    const rating = close ? (d.sub.block + d.sub.postD) / 2 : d.sub.perimD;
    const skill = 0.7 + (rating / 99) * 0.6;
    let state = 1;
    if (d.state === 'stagger' || now < d.staggerUntil) state = 0.35;
    if (now < d.screenedUntil) state = Math.min(state, 0.5);
    if (isStepThrough(type) && bitOnFake(d, shooter, now)) state = Math.min(state, 0.15); // bit on the fake: stepped right past him
    if (type === 'jelly' && bitOnDunk(d, shooter, now)) { state = Math.min(state, 0.3); notes.push(`${d.name} bit on the dunk`); }
    // post up: a defender stun-locked by bumps can't contest; one leaned on / sealed (even battle) only half-contests
    if (now < d.postLockUntil) { state = 0; notes.push(`${d.name} bumped`); }
    else if (now < d.postSealUntil || d.postedBy === shooter.id) { state = Math.min(state, POST_EVEN_CONTEST); notes.push(`${d.name} sealed`); }
    const c = 0.62 * closeness * angF * heightF * handUp * skill * state * d.mods.contestOutMult(type);
    if (c > 0.01) { by.push({ name: d.name, dist: r, c }); keep *= 1 - clamp(c, 0, 0.95); }
  }
  by.sort((a, b) => b.c - a.c);
  return { raw: 1 - keep, by, notes };
}

export function shotConditions(p: Player, side: Side, type: string, now: number, clutch: boolean): Set<string> {
  const c = new Set<string>();
  const rim = rimPos(side);
  if (isCorner(side, p.p)) c.add('corner');
  if (now - p.receivedAt < 1.2 && !p.dribbledSinceCatch) c.add('catchShoot');
  if (p.dribbledSinceCatch) c.add('pullUp');
  if (dot(p.vel, norm(sub(rim, p.p))) > 8) c.add('drive');
  if (clutch) c.add('clutch');
  if (p.lastMove && now - p.lastMove.endAt < 0.8) c.add('afterMove');
  if (now - p.lastScreenAt < 2.5) c.add('afterScreen');
  if (p.post || now < p.postWindowUntil) c.add('post');
  return c;
}

/** The full shot equation. Every term is returned so the HUD can print it. */
export function evaluateShot(shooter: Player, defenders: Player[], side: Side, type: string, ctx: ShotContext): ShotEval {
  const def = SHOT_TYPES[type];
  const rim = rimPos(side);
  const d = dist(shooter.p, rim);
  const terms: EqTerm[] = [];
  const conds = shotConditions(shooter, side, type, ctx.now, ctx.clutch);
  const pts = def.pts === 3 && isThree(side, shooter.p) ? 3 : 2;

  const base = ctx.override?.base ?? curve(def.base, d);
  terms.push({ label: `${def.name} ${d.toFixed(0)}ft`, value: base, kind: 'base' });
  if (type === 'fade') terms.push({ label: `fade ${d.toFixed(0)}ft`, value: fadeFalloff(d), kind: 'fade' });
  if (type === 'jelly') terms.push({ label: 'Jelly Fake', value: JELLY_MULT, kind: 'perk' }); // finger-roll at the top of a hang
  if (ctx.oopTiming !== undefined && ctx.oopTiming < 0.995) terms.push({ label: 'oop timing', value: ctx.oopTiming, kind: 'perk' });
  const dk = type === 'dunk' && ctx.dunk ? DUNK[ctx.dunk] : null;
  if (dk && dk.mult !== 1) terms.push({ label: dk.name, value: dk.mult, kind: 'perk' }); // flashy dunks are riskier

  const rating = shooter.sub[def.sub];
  terms.push({ label: `${def.sub} ${rating.toFixed(0)}`, value: statFactor(rating), kind: 'stat' });

  const con = computeContest(shooter, defenders, side, type, ctx.now);
  let contest = con.raw * def.contestW;
  if (con.raw < 0.1) conds.add('open');
  if (con.raw > 0.3) conds.add('contested');
  const ctxForMods = { type, conds };
  const cin = [...shooter.mods.contestInTerms(ctxForMods)];
  if (ctx.windmill) cin.push({ label: 'Windmill Gather', mult: WINDMILL_CONTEST });
  for (const t of cin) contest *= t.mult;
  if (ctx.now < shooter.openShotUntil) contest *= shooter.openShotMult;
  if (ctx.override?.contestMult !== undefined) contest *= ctx.override.contestMult;
  contest = clamp(contest, 0, 0.9);
  const top = con.by[0];
  const cinLabel = cin.length ? ` (${cin.map((t) => t.label).join(', ')})` : '';
  const noteLabel = con.notes.length ? ` (${con.notes.join(', ')})` : '';
  terms.push({ label: top ? `contest ${(contest * 100).toFixed(0)}%: ${top.name} ${top.dist.toFixed(1)}ft${cinLabel}${noteLabel}` : con.notes.length ? `contest 0%: ${con.notes.join(', ')}` : 'open', value: 1 - contest, kind: 'contest' });

  // round 48: finishing through a crowd — every real contester past the first makes it harder (and a dunk over a
  // crowd is a poster attempt, harder still). On screen like every other term.
  const crowd = crowdAt(type, con.by);
  if (crowd >= 2) {
    terms.push({ label: `crowd at the rim (${crowd})`, value: CROWD_MULT ** (crowd - 1), kind: 'contest' });
    if (type === 'dunk') terms.push({ label: `poster over ${crowd}`, value: POSTER_MULT ** (crowd - 1), kind: 'contest' });
  }

  if (contest > 0.25) {
    const contactKey = def.contact ? 'contactFinish' : 'contactShot';
    const cf = 0.9 + (shooter.sub[contactKey] / 99) * 0.2;
    terms.push({ label: `${contactKey} ${shooter.sub[contactKey].toFixed(0)}`, value: cf, kind: 'contact' });
  }

  terms.push({ label: `fatigue ${(shooter.stamina * 100).toFixed(0)}%`, value: 0.85 + 0.15 * shooter.stamina, kind: 'fatigue' });

  for (const t of shooter.mods.shotTerms(ctxForMods)) terms.push({ label: t.label, value: t.mult, kind: t.label.startsWith('ULT') ? 'ult' : 'perk' });
  if (ctx.override?.label) terms.push({ label: ctx.override.label, value: 1, kind: 'ult' });

  const pct = clamp(terms.reduce((acc, t) => acc * t.value, 1), 0.01, 0.97);
  return { type, dist: d, pts, pct, contest, terms, conds, contestBy: con.by, dunk: ctx.dunk, windmill: ctx.windmill };
}

export function formatEquation(e: ShotEval): string {
  const parts = e.terms.map((t) => t.kind === 'base' ? `${(t.value * 100).toFixed(0)}% [${t.label}]` : `×${t.value.toFixed(2)} [${t.label}]`);
  return `${parts.join(' ')} = ${(e.pct * 100).toFixed(1)}%`;
}
