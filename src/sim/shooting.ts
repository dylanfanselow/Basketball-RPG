import { SHOT_TYPES } from './data';
import { statFactor } from './attributes';
import { Player } from './player';
import { Side, rimPos, isThree, isCorner } from './court';
import { Vec, dist, sub, norm, dot, cross, clamp, clamp01, curve, len } from './math';

export interface EqTerm { label: string; value: number; kind: 'base' | 'stat' | 'contest' | 'fatigue' | 'perk' | 'contact' | 'ult' }
export interface ShotEval {
  type: string; dist: number; pts: number; pct: number; contest: number;
  terms: EqTerm[]; conds: Set<string>; contestBy: { name: string; dist: number; c: number }[];
}

export const CONE_HALF = 0.7; // ~40 degrees

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

  if (now - p.pumpFakeAt < 0.9 && p.hasShot('stepThrough') && d < 15) return 'stepThrough';
  if (d <= 6.5) {
    if (back && d >= 3) return 'floater';
    if (side_) return p.hasShot('euro') && d >= 2.5 ? 'euro' : 'hook';
    const canDunk = p.sub.dunk >= 50 + (7 - p.height) * 30; // taller players dunk with lower ratings
    if (canDunk && (speedToRim > 4 || d < 3.2)) return 'dunk';
    return 'layup';
  }
  if (d <= 12) {
    if (back) return 'floater';
    if (side_) return 'hook';
    if (d <= 9 && speedToRim > 6) return p.hasShot('euro') && side_ ? 'euro' : 'layup';
    return 'push';
  }
  if (isThree(side, p.p)) return d >= 27.5 ? 'deep3' : 'three';
  return 'mid';
}

export interface ShotContext {
  now: number; clutch: boolean;
  override?: { base?: number; label?: string; contestMult?: number };
}

/** Compute the contest from all defenders using the cone that points from shooter to rim. */
export function computeContest(shooter: Player, defenders: Player[], side: Side, type: string, now: number) {
  const rim = rimPos(side);
  const dir = norm(sub(rim, shooter.p));
  const close = SHOT_TYPES[type].contact || type === 'floater' || type === 'hook' || type === 'push';
  const reachFt = close ? 6 : 8;
  let keep = 1;
  const by: { name: string; dist: number; c: number }[] = [];
  for (const d of defenders) {
    if (d.state === 'fallen') continue;
    const rel = sub(d.p, shooter.p);
    const r = len(rel);
    if (r > reachFt + 1.5) continue;
    const along = dot(rel, dir);
    const lat = Math.abs(cross(dir, rel));
    const ang = Math.atan2(lat, along);
    let angF = ang <= CONE_HALF ? 1 : clamp01(1 - (ang - CONE_HALF) / 0.8) * 0.55;
    if (r < 2.2) angF = Math.max(angF, 0.5); // bodies right on you still bother you
    const closeness = clamp01(1 - (r - 1.5) / reachFt);
    const heightF = clamp(0.8 + (d.height - shooter.height) * 0.3, 0.6, 1.35);
    const handUp = d.z > 0.4 ? 1.3 : 1;
    const rating = close ? (d.sub.block + d.sub.postD) / 2 : d.sub.perimD;
    const skill = 0.7 + (rating / 99) * 0.6;
    let state = 1;
    if (d.state === 'stagger' || now < d.staggerUntil) state = 0.35;
    if (now < d.screenedUntil) state = Math.min(state, 0.5);
    const c = 0.62 * closeness * angF * heightF * handUp * skill * state * d.mods.contestOutMult(type);
    if (c > 0.01) { by.push({ name: d.name, dist: r, c }); keep *= 1 - clamp(c, 0, 0.95); }
  }
  by.sort((a, b) => b.c - a.c);
  return { raw: 1 - keep, by };
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

  const rating = shooter.sub[def.sub];
  terms.push({ label: `${def.sub} ${rating.toFixed(0)}`, value: statFactor(rating), kind: 'stat' });

  const con = computeContest(shooter, defenders, side, type, ctx.now);
  let contest = con.raw * def.contestW;
  if (con.raw < 0.1) conds.add('open');
  if (con.raw > 0.3) conds.add('contested');
  const ctxForMods = { type, conds };
  const cin = shooter.mods.contestInTerms(ctxForMods);
  for (const t of cin) contest *= t.mult;
  if (ctx.now < shooter.openShotUntil) contest *= shooter.openShotMult;
  if (ctx.override?.contestMult !== undefined) contest *= ctx.override.contestMult;
  contest = clamp(contest, 0, 0.9);
  const top = con.by[0];
  const cinLabel = cin.length ? ` (${cin.map((t) => t.label).join(', ')})` : '';
  terms.push({ label: top ? `contest ${(contest * 100).toFixed(0)}%: ${top.name} ${top.dist.toFixed(1)}ft${cinLabel}` : 'open', value: 1 - contest, kind: 'contest' });

  if (contest > 0.25) {
    const contactKey = def.contact ? 'contactFinish' : 'contactShot';
    const cf = 0.9 + (shooter.sub[contactKey] / 99) * 0.2;
    terms.push({ label: `${contactKey} ${shooter.sub[contactKey].toFixed(0)}`, value: cf, kind: 'contact' });
  }

  terms.push({ label: `fatigue ${(shooter.stamina * 100).toFixed(0)}%`, value: 0.85 + 0.15 * shooter.stamina, kind: 'fatigue' });

  for (const t of shooter.mods.shotTerms(ctxForMods)) terms.push({ label: t.label, value: t.mult, kind: t.label.startsWith('ULT') ? 'ult' : 'perk' });
  if (ctx.override?.label) terms.push({ label: ctx.override.label, value: 1, kind: 'ult' });

  const pct = clamp(terms.reduce((acc, t) => acc * t.value, 1), 0.01, 0.97);
  return { type, dist: d, pts, pct, contest, terms, conds, contestBy: con.by };
}

export function formatEquation(e: ShotEval): string {
  const parts = e.terms.map((t) => t.kind === 'base' ? `${(t.value * 100).toFixed(0)}% [${t.label}]` : `×${t.value.toFixed(2)} [${t.label}]`);
  return `${parts.join(' ')} = ${(e.pct * 100).toFixed(1)}%`;
}
