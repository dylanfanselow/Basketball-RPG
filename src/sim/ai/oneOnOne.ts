/**
 * Round 61: the 1v1 CPU ball handler. It works the defender with options in a row (dribble combos, sprint drives,
 * the post, pump fakes) and reads him after each one: the moment the forecast says he can't get a real contest up
 * by the release, it shoots. Counters for what the defender does (bit on a fake, shading a side, crowding, sagging,
 * staggered, beaten). The shot clock is used, not burned: open looks go at once, it settles for a contested one at a
 * clock time drawn per possession, and throws one up before the buzzer. The level (ai/levels.ts) sets how fast and
 * how well it reads, never a rating. Phaser-free.
 */
import type { GameSim } from '../game';
import { Player } from '../player';
import { MOVES, SHOT_TYPES } from '../data';
import { COURT_L, COURT_W } from '../court';
import { Vec, v, add, sub, scale, norm, dist, len, dot, cross, clamp } from '../math';
import { bitOnFake, isStepThrough, selectShotType, STEP_THROUGH_WINDOW } from '../shooting';
import { resolveMove, moveDirection, sideOf } from '../moves';
import { canPost, postDefender, postGap, postIntent } from '../post';
import { forecastShot, shotOptions, Forecast, ForecastOpts } from './forecast';
import { CPU_LEVELS, CpuLevelCfg } from './levels';

export type IsoOpt = 'combo' | 'drive' | 'post' | 'fake' | 'reset';
type Sem = 'toward' | 'back' | 'same' | 'cross' | 'neutral';
type Goal = 'drive' | 'space' | 'shake';

/** One possession's plan (reset whenever he gets the ball again). */
export interface IsoState {
  poss: number;
  /** clock left (s) at which he settles for a contested look */
  settle: number;
  tried: IsoOpt[];
  /** options in the current chain (a chain ends when he resets: then a fresh one can start) and when it ran out */
  chain: number; chainOutAt: number;
  opt: IsoOpt | null; optAt: number; optUntil: number;
  /** combo: moves chained so far, its goal and side, the move already linked */
  links: number; goal: Goal; side: number; linkedFor: number;
  /** drive: sprint it, and when it started stalling */
  sprint: boolean; stallAt: number;
  /** post: 'in' (backing down), 'out' (let go) */
  postPhase: 'in' | 'out';
  /** this think's read error */
  noise: number; naive: boolean;
  /** the last move end already read, the fake already scored for bites */
  readEnd: number; fakeRead: number;
  /** moves and options used this possession (credited when the shot goes up) */
  used: string[];
}

/** What a CPU learned about his defender this game. */
export interface IsoMemory {
  opts: Record<string, { n: number; w: number }>;
  fakes: number; bites: number;
}

const memOf = (sim: GameSim, p: Player): IsoMemory => (sim.isoMemory[p.id] ??= { opts: {}, fakes: 0, bites: 0 });
function credit(sim: GameSim, p: Player, key: string, win: boolean) {
  const m = memOf(sim, p), o = (m.opts[key] ??= { n: 0, w: 0 });
  o.n++; if (win) o.w++;
}
/** How well this has worked against him (0..1, starts at 0.5). */
const winRate = (sim: GameSim, p: Player, key: string) => { const o = memOf(sim, p).opts[key]; return o ? (o.w + 1) / (o.n + 2) : 0.5; };

/** The dev overlay line ("1v1 CPU thoughts"). */
function note(sim: GameSim, p: Player, text: string) { p.aiNote = text; p.aiNoteAt = sim.time; }

/** A decent look's worth in this game's scoring (pct x points): a 42% two. */
const par = (sim: GameSim) => 0.42 * sim.scoreValue(2);
const pctStr = (f: Forecast) => `${SHOT_TYPES[f.type]?.name ?? f.type} ${(f.ev.pct * 100).toFixed(0)}%`;
const inBounds = (q: Vec) => q.y > 3 && q.y < COURT_W - 3 && q.x > 2 && q.x < COURT_L - 2;

interface Ctx {
  L: CpuLevelCfg; st: IsoState; side: 1 | -1; rim: Vec; toRim: Vec; pr: Vec; d: number;
  def: Player | null; dd: number; along: number; lat: number;
}

function stateFor(sim: GameSim, p: Player, L: CpuLevelCfg): IsoState {
  if (!p.iso || p.iso.poss !== p.receivedAt) {
    p.iso = {
      poss: p.receivedAt, settle: sim.rng.range(L.settle[0], L.settle[1]), tried: [], chain: 0, chainOutAt: -1, opt: null, optAt: 0, optUntil: 0,
      links: 0, goal: 'shake', side: 1, linkedFor: -1, sprint: false, stallAt: -1, postPhase: 'in',
      noise: 0, naive: false, readEnd: p.lastMove?.endAt ?? -99, fakeRead: -99, used: [],
    };
  }
  return p.iso;
}

function context(sim: GameSim, p: Player, L: CpuLevelCfg, st: IsoState): Ctx {
  const rim = sim.rim(p.team), toRim = norm(sub(rim, p.p)), pr = { x: -toRim.y, y: toRim.x };
  const def = sim.defenderOf(p) ?? sim.nearestDefender(p).d;
  const rel = def ? sub(def.p, p.p) : v(0, 99);
  return { L, st, side: sim.side(p.team), rim, toRim, pr, d: dist(p.p, rim), def, dd: def ? len(rel) : 99, along: dot(rel, toRim), lat: cross(toRim, rel) };
}

const fopts = (c: Ctx): ForecastOpts => ({ lead: 0.02, noise: c.st.noise, naive: c.st.naive });

/** Entry point: the 1v1 CPU with the ball, every tick. */
export function isoThink(sim: GameSim, p: Player, dt: number) {
  const L = sim.cpuCfg(p) ?? CPU_LEVELS.medium;
  const st = stateFor(sim, p, L);
  if (p.state === 'shoot' || p.busy) return;
  const c = context(sim, p, L, st);

  // mid-move: link the next move of the combo near its end (or read the fake)
  if (p.state === 'dribbleMove') {
    if (sim.shotClock < 1.1) { const best = shotOptions(sim, p, fopts(c))[0]; if (best && sim.shotClock <= best.T + L.margin + 0.05) { shoot(sim, p, c, best, `clock ${sim.shotClock.toFixed(1)} s`); return; } }
    if (p.move?.id === 'pumpfake') fakeTick(sim, p, c); else linkAhead(sim, p, c);
    return;
  }
  // every tick: hold the post / steer the drive
  if (st.opt === 'post' && postTick(sim, p, c)) return;
  if (st.opt === 'drive') steerDrive(sim, p, c);

  // a move just ended: Medium / Hard read it right away, Easy on its normal beat
  const moveEnded = !!p.lastMove && p.lastMove.endAt > st.readEnd;
  if (sim.time < p.aiNextThink && !(moveEnded && L.think[0] < 0.3)) return;
  p.aiNextThink = sim.time + sim.rng.range(L.think[0], L.think[1]);
  if (moveEnded) st.readEnd = p.lastMove!.endAt;
  st.noise = (sim.rng.next() * 2 - 1) * L.noise;
  st.naive = L.naive > 0 && sim.rng.chance(L.naive);
  decide(sim, p, c, moveEnded);
  void dt;
}

function shoot(sim: GameSim, p: Player, c: Ctx, f: Forecast, why: string) {
  sim.startShot(p, f.type);
  if (p.state !== 'shoot') return;
  const open = f.contest < c.L.openCut;
  for (const k of new Set(c.st.used)) credit(sim, p, k, open);
  note(sim, p, `${why} → ${pctStr(f)} (contest ${(f.contest * 100).toFixed(0)}%, def ${f.near.toFixed(1)} ft at release)`);
  c.st.opt = null;
}

/** The decision on each think: clock, free look, reactions, settle, options. */
function decide(sim: GameSim, p: Player, c: Ctx, moveEnded: boolean) {
  const { L, st, def } = c;
  const now = sim.time, left = sim.shotClock;
  const shots = shotOptions(sim, p, fopts(c));
  const best = shots[0];
  if (!best) return;

  // 1. the clock is about to run out: throw it up
  if (left <= best.T + L.margin + 0.05) { shoot(sim, p, c, best, `clock ${left.toFixed(1)} s`); return; }

  // 2. the key read: he can't get a real contest up in time = shoot it now
  const thr = par(sim) * (left > st.settle ? 0.8 : 0.6);
  const open = shots.filter((f) => f.contest < L.openCut && f.value >= thr).sort((a, b) => b.value - a.value)[0];
  if (open) {
    // a wide-open lane with only a so-so open jumper: take it to the rim instead
    const jumper = ['mid', 'three', 'deep3', 'fade'].includes(open.type);
    if (jumper && !p.deadDribble && st.opt !== 'drive' && open.value < par(sim) * 1.05 && c.d < 24 && laneOpen(c) && sim.rng.chance(0.6)) { startDrive(sim, p, c, 'lane open', true); return; }
    shoot(sim, p, c, open, 'OPEN: no contest in time'); return;
  }

  // 3. dribble's dead: read the fake for a beat, then the best look
  if (p.deadDribble) {
    if (def && bitStep(sim, p, c)) return;
    if (now - p.deadDribbleAt > 0.3) shoot(sim, p, c, best, 'dead dribble');
    return;
  }

  // 4. he gave something up (bit, down, beaten, the lane opened): take it
  if (def && sim.rng.chance(L.counter) && react(sim, p, c, moveEnded)) return;

  // 5. settle for a contested look once the clock gets there (the bar drops as it drains)
  if (left <= st.settle && best.contest < 0.55 && best.value >= par(sim) * (0.45 + 0.35 * left / Math.max(1, st.settle))) { shoot(sim, p, c, best, `settle (${left.toFixed(1)} s)`); return; }

  // 6. an option in progress keeps going
  if (st.opt === 'drive') { driveRead(sim, p, c); if (st.opt === 'drive' || p.state !== 'idle') return; }
  else if (st.opt === 'post') return;
  else if (st.opt === 'combo' && st.links < L.combo && p.lastMove && now - p.lastMove.endAt < 0.45 && link(sim, p, c)) return;
  else if (st.opt === 'fake' && now - p.pumpFakeAt < 0.6) return;
  if (st.opt) { credit(sim, p, st.opt, false); note(sim, p, `${st.opt} → still contested (${(best.contest * 100).toFixed(0)}%)`); }
  st.opt = null;

  // 7. next option in this chain; a chain that ran out resets (work him a beat) and a new one starts if time allows
  if (st.chain >= 1 + L.followUps) {
    if (st.chainOutAt < 0) st.chainOutAt = now;
    if (now - st.chainOutAt > 0.9 && left > st.settle + 1.5) { st.chain = 0; st.chainOutAt = -1; }
  }
  if (st.chain < 1 + L.followUps && nextOption(sim, p, c)) return;
  probe(sim, p, c);
}

/** Nobody on his line to the rim (or the defender is behind him / on the floor / staggered). */
function laneOpen(c: Ctx): boolean {
  if (!c.def) return true;
  if (c.def.state === 'fallen' || c.along < -0.3) return true;
  return !(c.along > 0 && c.along < Math.min(c.d, 12) && Math.abs(c.lat) < 2.8);
}

/** The defender jumped on the fake: step through in the window. */
function bitStep(sim: GameSim, p: Player, c: Ctx): boolean {
  const d = c.def!;
  const now = sim.time;
  if (now - p.pumpFakeAt > STEP_THROUGH_WINDOW || p.pumpFakeAt < p.receivedAt) return false;
  const bit = bitOnFake(d, p, now) || d.z > 0.3;
  if (!bit) return false;
  if (c.st.fakeRead !== p.pumpFakeAt) { c.st.fakeRead = p.pumpFakeAt; memOf(sim, p).bites++; credit(sim, p, 'fake', true); }
  const type = selectShotType(p, c.side, c.toRim, now);
  if (!isStepThrough(type)) return false;
  shoot(sim, p, c, forecastShot(sim, p, type, fopts(c)), `${d.name} bit → Step-Through`);
  return true;
}

/**
 * Reactions: the defender gave something up, take it now (these don't use up an option). Bit on a fake = step
 * through; in the air = go by him; on the floor, staggered, beaten or the lane opened off a move = sprint downhill;
 * a side drive he recovered on = snap it back; flying at the catch = pump fake.
 */
function react(sim: GameSim, p: Player, c: Ctx, moveEnded: boolean): boolean {
  const { def, dd, lat, d, st } = c;
  const now = sim.time;
  if (!def) return false;
  if (bitStep(sim, p, c)) return true;
  if (st.opt === 'drive') return false; // already attacking
  if (def.z > 0.3) { startDrive(sim, p, c, `${def.name} left his feet`, true); return true; }
  const down = def.state === 'fallen' || now < def.staggerUntil - 0.05;
  const beaten = c.along < -0.3 || dist(def.p, c.rim) > d + 0.5;
  if (d > 5 && (down || beaten || (moveEnded && laneOpen(c)))) {
    if (moveEnded && p.lastMove) credit(sim, p, `mv:${p.lastMove.id}`, true);
    startDrive(sim, p, c, down ? `${def.name} rocked` : beaten ? 'beat him' : 'lane opened', true); return true;
  }
  if (st.opt === 'combo' && st.links < c.L.combo && p.flickDir && now < p.flickUntil && dd < 4.5 && Math.sign(lat) === p.flickDir) {
    sim.flickCross(p, -p.flickDir);
    if (p.state === 'dribbleMove') { st.links++; st.used.push(`mv:${p.move?.id}`); note(sim, p, 'he recovered → snap it back'); return true; }
  }
  const closing = dot(def.vel, norm(sub(p.p, def.p)));
  if (!p.dribbledSinceCatch && !st.used.includes('fake') && closing > 7 && dd > 2 && dd < 7) { startFake(sim, p, c, 'closeout'); return true; }
  return false;
}

/**
 * Score the options and start the best (randomness and memory by level). How he's being guarded shapes it: shading
 * a side = attack the other side, crowding = blow-by, sagging = a shooter walks into the jumper, anyone else drives.
 */
function nextOption(sim: GameSim, p: Player, c: Ctx): boolean {
  const { L, st, def, dd, along, d, lat } = c;
  if (sim.shotClock < 1.6) return false;
  if (!def) { startDrive(sim, p, c, 'nobody home', true); return true; }
  const spd = (p.sprintSpeed - def.sprintSpeed) / 3;
  const strGap = postGap(p, def), hGap = p.height - def.height;
  const mem = memOf(sim, p);
  const biteRate = (mem.bites + 1) / (mem.fakes + 3);
  const shooter = p.sub.three >= 65 || p.sub.mid >= 68;
  const shading = dd < 6 && Math.abs(lat) > 1.2 && along > 0 && len(def.vel) < 4 ? -Math.sign(lat) : 0;
  const crowding = dd < 2.3 && along > 0;
  const sagging = along > 5 && d > 10;
  const postable = canPost(sim, p) && d >= 6 && d <= 18 && !!postDefender(sim, p) && (strGap >= -4 || (L.followUps >= 4 && p.sub.mid >= 65));
  const score: Record<IsoOpt, number> = {
    combo: 0.55 + (p.sub.ankleBreak - 60) / 80 + (p.sub.ballSpeed - 60) / 100 + spd * 0.2 + (crowding ? 0.3 : 0) + (shading ? 0.2 : 0),
    drive: 0.4 + ((p.sub.layup + p.sub.dunk) / 2 - 60) / 80 + spd * 0.35 + (d < 20 ? 0.15 : 0) - (crowding ? 0.2 : 0) + (sagging && !shooter ? 0.5 : 0) + (shading ? 0.15 : 0),
    post: postable ? 0.25 + clamp(strGap / 16, -0.5, 0.8) + hGap * 0.25 + (p.sub.post - 60) / 80 : -9,
    fake: dd > 2 && dd < 5.5 && along > 0 ? 0.2 + biteRate * 0.7 + (p.dribbledSinceCatch ? -0.15 : 0.15) : -9,
    reset: st.chain >= 2 && d < 15 ? 0.15 : -9,
  };
  let bestO: IsoOpt | null = null, bs = -1;
  for (const o of Object.keys(score) as IsoOpt[]) {
    let s = score[o];
    if (s < -1) continue;
    if (st.tried.includes(o)) s *= 0.45;
    s *= 1 - L.memory + L.memory * (0.5 + winRate(sim, p, o));
    s += sim.rng.next() * L.whim;
    if (s > bs) { bs = s; bestO = o; }
  }
  if (!bestO) return false;
  const why = (st.chain ? 'next option' : st.tried.length ? 'new look' : 'opener') + (shading ? `, he's shading ${lat > 0 ? 'left' : 'right'}` : crowding ? ", he's crowding" : sagging ? ", he's sagging" : '');
  // a sagging defender and a shooter: walk into the jumper first (the forecast shoots it if he doesn't come)
  if (sagging && shooter && bestO !== 'post' && !st.used.includes('stepIn')) {
    st.used.push('stepIn'); st.tried.push('combo'); st.chain++;
    sim.steer(p, add(p.p, scale(c.toRim, 3)), false, 0.8); note(sim, p, `${why} → step into it`); return true;
  }
  switch (bestO) {
    case 'combo': {
      const goal: Goal = crowding ? 'drive' : shooter && sim.rng.chance(0.5) ? 'space' : sim.rng.chance(0.5) ? 'drive' : 'shake';
      return startCombo(sim, p, c, goal, shading, `${why}: combo (${goal})`);
    }
    case 'drive': startDrive(sim, p, c, `${why}: drive`, false, shading); return true;
    case 'post': return startPost(sim, p, c, `${why}: post up`);
    case 'fake': startFake(sim, p, c, `${why}: fake`); return true;
    case 'reset': {
      begin(c, 'reset'); sim.dribbleMove(p, scale(c.toRim, -1)); note(sim, p, `${why}: back it out`);
      return p.state === 'dribbleMove';
    }
  }
  return false;
}

function begin(c: Ctx, o: IsoOpt) {
  c.st.opt = o; c.st.optAt = -1; c.st.tried.push(o); c.st.used.push(o); c.st.chain++;
}

/** Which side to attack: away from his lean, else toward the middle, never into a sideline. */
function pickSide(sim: GameSim, p: Player, c: Ctx, forced: number): number {
  let s = forced || (Math.abs(c.lat) > 0.4 ? -Math.sign(c.lat) : Math.sign(dot(sub({ x: p.p.x, y: 25 }, p.p), c.pr)) || (sim.rng.chance(0.5) ? 1 : -1));
  if (!inBounds(add(p.p, scale(c.pr, s * 9)))) s = -s;
  return s;
}

// ---------------------------------------------------------------- combos

/** The stick for a semantic direction (cross = against the way he's going across the hoop line). */
function semStick(p: Player, c: Ctx, sem: Sem): Vec {
  const moving = cross(c.toRim, p.vel);
  const ms = Math.abs(moving) > 1 ? Math.sign(moving) : c.st.side;
  switch (sem) {
    case 'toward': return c.toRim;
    case 'back': return scale(c.toRim, -1);
    case 'neutral': return v();
    case 'same': return scale(c.pr, ms);
    case 'cross': return scale(c.pr, -ms);
  }
}

/**
 * The best next move for this goal: what the stick resolves to with the moves he owns (chains included), how much it
 * shakes a defender, where it takes him (never out of bounds), variety and what has worked on this defender.
 */
function chooseLink(sim: GameSim, p: Player, c: Ctx, forcedSide: number): { stick: Vec; id: string } | null {
  const { L, st, toRim, def } = c;
  const now = sim.time;
  let best: { stick: Vec; id: string } | null = null, bs = -1e9;
  for (const sem of ['same', 'cross', 'toward', 'back', 'neutral'] as Sem[]) {
    const stick = semStick(p, c, sem);
    const id = resolveMove(p, stick, toRim, now, c.dd);
    const m = MOVES[id];
    if (!m) continue;
    const dir = moveDirection(id, p, stick, toRim, def?.p ?? null);
    if (!inBounds(add(p.p, scale(dir, (m.dist ?? 4) + 1)))) continue;
    let s = m.ankle * 4 + m.stagger * 1.5 + (m.chainFrom ? 0.3 : 0);
    if (st.goal === 'drive') s += dot(dir, toRim) * 0.5;
    if (st.goal === 'space') s += (m.openShot ?? 0) * 1.2 + (dot(dir, toRim) < -0.5 ? 0.3 : 0);
    if (id === 'retreat' || id === 'jab') s -= 0.45;
    if (p.lastMove && id === p.lastMove.id && !m.chainFrom && now - p.lastMove.endAt < 2) s -= 0.3;
    const sd = sideOf(toRim, dir);
    if (forcedSide && sd) s += sd === forcedSide ? 0.45 : -0.45;
    if (def && c.dd < 3 && id !== 'spin' && dot(dir, norm(sub(def.p, p.p))) > 0.8) s -= 0.3; // straight into him
    s += L.memory * (winRate(sim, p, `mv:${id}`) - 0.5) * 0.6;
    s += sim.rng.next() * L.whim * 0.5;
    if (s > bs) { bs = s; best = { stick, id }; }
  }
  return best;
}

function startCombo(sim: GameSim, p: Player, c: Ctx, goal: Goal, forcedSide: number, why: string): boolean {
  if (p.deadDribble || sim.shotClock < 1.8) return false;
  const st = c.st;
  st.goal = goal; st.side = pickSide(sim, p, c, forcedSide); st.links = 0;
  const l = chooseLink(sim, p, c, forcedSide ? st.side : 0);
  if (!l) return false;
  sim.dribbleMove(p, l.stick);
  if (p.state !== 'dribbleMove') return false;
  begin(c, 'combo'); st.links = 1; st.used.push(`mv:${l.id}`);
  note(sim, p, `${why} → ${MOVES[l.id].name}`);
  return true;
}

/** Chain the next move straight out of this one (stays in its chain window). */
function link(sim: GameSim, p: Player, c: Ctx): boolean {
  if (sim.shotClock < 1.8) return false;
  const l = chooseLink(sim, p, c, 0);
  if (!l) return false;
  sim.dribbleMove(p, l.stick);
  if (p.state !== 'dribbleMove' && !p.bufferedMove) return false;
  c.st.links++; c.st.used.push(`mv:${l.id}`);
  note(sim, p, `still on him → ${MOVES[l.id].name}`);
  return true;
}

/** Near the end of a combo move: read him; still in front and no look = buffer the next link of the chain. */
function linkAhead(sim: GameSim, p: Player, c: Ctx) {
  const { st, L, def } = c;
  if (st.opt !== 'combo' || st.links >= L.combo || p.bufferedMove || p.stateDur - p.stateT > 0.1 || sim.shotClock < 1.8) return;
  const key = p.anim?.start ?? sim.time;
  if (st.linkedFor === key) return;
  st.linkedFor = key;
  if (!def || def.state === 'fallen' || sim.time < def.staggerUntil || c.along < 0) return; // he's beaten: attack after the move
  const look = shotOptions(sim, p, fopts(c))[0];
  if (look && look.contest < L.openCut) return; // a look is there: shoot it after the move
  // preview the chain as it will resolve when this move ends
  const saved = { last: p.lastMove, vel: p.vel };
  if (p.move) p.lastMove = { id: p.move.id, endAt: sim.time, dir: p.move.dir };
  p.vel = scale(p.vel, 0.3);
  const l = chooseLink(sim, p, c, 0);
  p.lastMove = saved.last; p.vel = saved.vel;
  if (!l) return;
  sim.dribbleMove(p, l.stick); // buffered: fires as this move ends
  if (p.bufferedMove) { st.links++; st.used.push(`mv:${l.id}`); note(sim, p, `still on him → ${MOVES[l.id].name}`); }
}

// ---------------------------------------------------------------- drives

function startDrive(sim: GameSim, p: Player, c: Ctx, why: string, burst = false, forcedSide = 0) {
  const st = c.st;
  if (st.opt !== 'drive') { begin(c, 'drive'); st.used.push('drive'); }
  st.optAt = sim.time; st.optUntil = sim.time + 1.8; st.stallAt = -1;
  st.side = pickSide(sim, p, c, forcedSide);
  st.sprint = sim.rng.chance(c.L.sprint) && (p.stamina > 0.3 || sim.shotClock < 5);
  if (burst && st.sprint) sim.startBurst(p);
  note(sim, p, `${why} → drive${st.sprint ? ' + sprint' : ''}`);
  steerDrive(sim, p, c);
}

/** Go to the rim around his side (aim past his shoulder until clear of him), sprinting when the read says so. */
function steerDrive(sim: GameSim, p: Player, c: Ctx) {
  const { st, def, rim } = c;
  if (sim.time > st.optUntil) { st.opt = null; return; }
  let aim = rim;
  if (def && c.along > -0.5 && c.dd < 6) aim = add(def.p, add(scale(c.pr, st.side * 2.6), scale(c.toRim, 1)));
  if (!inBounds(aim)) aim = rim;
  sim.steer(p, aim, true);
  if (st.sprint && len(p.vel) > 4 && sim.time >= p.burstCdUntil) sim.startBurst(p);
}

/** On a think during a drive (or a post): finish at the rim, fake him, or call it stalled. */
function driveRead(sim: GameSim, p: Player, c: Ctx) {
  const { st, L, def, d } = c;
  if (st.opt === 'post') return; // postTick handles it
  const now = sim.time;
  if (d <= 8.5) {
    // the rim: a fake when he's set right in front (then step through if he bites), else the best finish
    const mem = memOf(sim, p), biteRate = (mem.bites + 1) / (mem.fakes + 3);
    if (def && L.rimFake > 0 && c.along > 0.5 && Math.abs(c.lat) < 2 && c.dd < 4 && def.z === 0 && !st.used.includes('rimFake') && sim.rng.chance(L.rimFake * clamp(biteRate * 2.5, 0.3, 1.5))) {
      st.used.push('rimFake'); startFake(sim, p, c, 'set in front at the rim'); return;
    }
    const fin = shotOptions(sim, p, fopts(c))[0];
    if (!fin) return;
    // walled up at the rim with time left: don't force it, back it out and go again
    if (fin.contest > 0.33 && fin.value < par(sim) * 0.9 && L.followUps >= 2 && sim.shotClock > st.settle + 1.5 && !p.deadDribble) {
      credit(sim, p, 'drive', false); st.opt = null; begin(c, 'reset');
      sim.dribbleMove(p, scale(c.toRim, -1)); note(sim, p, `walled up at the rim (${(fin.contest * 100).toFixed(0)}%) → back it out`); return;
    }
    shoot(sim, p, c, fin, 'finish');
    return;
  }
  // stalled: he's in front and we're not getting downhill
  const speedToRim = dot(p.vel, c.toRim);
  const walled = !!def && c.along > 0.5 && Math.abs(c.lat) < 2.2 && c.dd < 3.5;
  if (walled && speedToRim < 4 && now - st.optAt > 0.5) {
    if (st.stallAt < 0) st.stallAt = now;
    if (now - st.stallAt > 0.25) { credit(sim, p, 'drive', false); st.opt = null; note(sim, p, 'drive walled off → next option'); }
  } else st.stallAt = -1;
}

// ---------------------------------------------------------------- post

function startPost(sim: GameSim, p: Player, c: Ctx, why: string): boolean {
  begin(c, 'post'); c.st.postPhase = 'in'; c.st.optAt = sim.time; c.st.optUntil = sim.time + sim.rng.range(2.2, 3.4);
  postIntent(p, true, c.toRim);
  note(sim, p, why);
  return true;
}

/** Every tick while posting. Returns true when it handled the tick. */
function postTick(sim: GameSim, p: Player, c: Ctx): boolean {
  const { st, L, toRim, d, def } = c;
  const now = sim.time;
  if (st.postPhase === 'in') {
    if (!p.post) {
      // never got into it (cooldown, he stepped off): drop it after a beat
      if (now - st.optAt > 0.4) { st.opt = null; return false; }
      postIntent(p, true, toRim); return true;
    }
    const since = now - p.post.since, mode = p.post.mode;
    const locked = !!def && now < def.postLockUntil;
    const release = d <= 7 || now > st.optUntil || sim.shotClock < 3 || (locked && since > 0.9) || (mode === 'even' && since > 1.5) || (mode === 'weaker' && since > 1.0);
    postIntent(p, !release, toRim);
    if (release) { st.postPhase = 'out'; note(sim, p, `post (${mode}) → let go`); }
    return true;
  }
  if (p.post) { postIntent(p, false, v()); return true; } // still letting go (commit time)
  // out of the post: a window shot, or step back into the jumper (the owner's chain)
  if (sim.time < p.aiNextThink && now < p.postWindowUntil) return false;
  const shots = shotOptions(sim, p, fopts(c));
  const best = shots[0];
  if (now < p.postWindowUntil && best && (best.contest < L.openCut * 2 || p.sub.mid < 60 || p.deadDribble)) { shoot(sim, p, c, best, 'out of the post'); return true; }
  st.opt = null;
  if (!p.deadDribble) {
    sim.dribbleMove(p, scale(toRim, -1));
    if (p.state === 'dribbleMove') {
      begin(c, 'combo'); st.goal = 'space'; st.links = 1; st.used.push(`mv:${p.move?.id}`);
      credit(sim, p, 'post', false);
      note(sim, p, `post contested → ${MOVES[p.move!.id]?.name ?? 'step back'}`);
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- fakes / probing

function startFake(sim: GameSim, p: Player, c: Ctx, why: string) {
  begin(c, 'fake');
  memOf(sim, p).fakes++;
  sim.pumpFake(p, c.toRim);
  c.st.optAt = sim.time;
  note(sim, p, `${why} → pump fake`);
}

/** During the fake: the moment he leaves his feet (after this level's reaction), step through. */
function fakeTick(sim: GameSim, p: Player, c: Ctx) {
  const def = c.def;
  if (!def) return;
  if ((def.z > 0.3 || bitOnFake(def, p, sim.time)) && sim.time - def.lastJumpAt > c.L.think[0]) bitStep(sim, p, c);
}

/** Nothing better yet: work toward a good spot (~21 ft) and jab now and then to make him move. */
function probe(sim: GameSim, p: Player, c: Ctx) {
  const { rim, d } = c;
  const want = clamp(d, 17, 23);
  const spot = add(rim, scale(norm(sub(p.p, rim)), want));
  sim.steer(p, spot, false, 0.6);
  if (!p.deadDribble && c.dd < 5 && sim.rng.chance(0.2)) { sim.dribbleMove(p, v()); note(sim, p, 'jab, read him'); }
  else note(sim, p, `probing (${sim.shotClock.toFixed(1)} s, settles at ${c.st.settle.toFixed(1)})`);
}
