import { assignGuards, threatWeight, scorerRep, Heat, newHeat, afterShot, tierCap, TIER_NAME, Tier, HEAT_AT, ATT, coverage, Coverage, COVERAGE_NAME, guardFit, screenCoverage, ScreenCov, SCREEN_COV_TEXT } from './attention';
import { TeamDef, SHOT_TYPES, MOVES, PLAYS } from './data';
import { Player } from './player';
import { rmap } from './attributes';
import { Side, rimPos, hc, spot, clampToCourt, inFrontcourt, isThree, RESTRICTED_R, COURT_W } from './court';
import { Vec, v, add, sub, scale, norm, len, dist, dot, lerpV, clamp, clamp01, Rng, cross, perp } from './math';
import { ShotEval, evaluateShot, selectShotType, formatEquation, bitOnFake, isStepThrough, stepStride, fakeClipFor, FAKE_NAMES, computeContest, windmillGather, WINDMILL_BLOCK, JELLY_HANG, crowdAt } from './shooting';
import { pickDunk, pickOopDunk, canOopDunk, DUNK } from './dunks';
import { resolveMove, moveDirection, sideOf } from './moves';
import { PlayRunner } from './plays/runner';
import { RHYTHM_GAIN, RHYTHM_LOSS, RhythmGain, RhythmLoss, gainScale, quarterGain, POINT_GAIN, REPEAT_DECAY, notchOf, rhythmBoost, methodKey, scoreGain, scoreMath, methodLabel } from './rhythm';
import { endgame, topScorer, chooseCall } from './plays/coach';
import { TrustState, applyTrust, TrustReason } from './ai/trust';
import { RotationPlan, shouldBeOn } from './rotation';
import { thinkOffense, offBallTarget } from './ai/offense';
import { thinkDefense } from './ai/defense';
import { UltState, UltRuntime, tryActivateUlt, tickUlt, cpuUltFor, ultAction, posterLane } from './ultimates';
import { PlayRole } from './data';
import { RimPath, buildPath, sampleRim, pathEnd } from './rim';
import { updatePost, onPostShot, postLocked, postIntent, POST } from './post';
import { ShotPlan, planShot, samplePlan } from './ballPhysics';

export interface UserInput {
  move: Vec; sprint: boolean; // sprint = tap (edge) for a burst
  a: boolean; b: boolean; x: boolean; y: boolean; // edge-triggered this tick
  aHeld: boolean; bHeld: boolean;
  /** △ held (tap = pass, hold = lob) */
  yHeld?: boolean;
  /** R1 held: icon pass (face buttons pass to the teammate wearing that icon) */
  iconHeld?: boolean;
  /** L2 held: post up (back the defender down; the stick only goes toward / away from the rim) */
  postHeld?: boolean;
}
export type IconBtn = 'a' | 'b' | 'x' | 'y';
/** Icon-pass button order: teammates sorted by role get ✕, ○, □, △. */
export const ICON_ORDER: IconBtn[] = ['a', 'b', 'x', 'y'];
/** ✕ taps shorter than this are pump fakes; ○ taps shorter than this with no direction are jab steps. */
export const TAP_S = 0.18;
/** Length of the pump-fake sell (state and animation). A shot pressed during it cuts it short. */
export const PUMP_FAKE_S = 0.42;
/** Step-Through: share of the gather spent striding on the floor before lifting off, and stride length (ft). */
export const STEP_LIFT = 0.55;
/** Fade Away: backward drift (ft/s) through the shot. */
export const FADE_DRIFT = 4;
/** Loose-ball dive: how long it lasts (launch, slide, get up), the launch (ft/s), and how low the ball must be (ft). */
/** Alley-oop: catch height (ft), lob arc (ft), range (ft; Lob City), landing spot max distance from the rim. */
export const OOP_CATCH_Z = 10.2, OOP_ARC = 5, OOP_RANGE = 35, OOP_RANGE_LOBCITY = 50, OOP_SPOT_R = 4;
/** With the ball the sprint burst gives this share of its gain. */
export const BALL_BURST = 0.5;
/** 8-second rule (full-court games): time to get the ball past half court. */
export const BACKCOURT_S = 8;
export const DIVE_S = 0.9, DIVE_LAUNCH_S = 0.3, DIVE_SPEED = 17, DIVE_BALL_Z = 3;
export const emptyInput = (): UserInput => ({ move: v(), sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false });

export interface TeamState { def: TeamDef; side: Side; score: number; roster: Player[]; onCourt: Player[] }

export interface GameConfig {
  mode: 'practice' | 'game';
  quarterLen: number;
  seed?: number;
  teams: [TeamDef, TeamDef];
  rosters: [Player[], Player[]];
  userId: string | null;
  trust: TrustState;
  ult: UltState;
  practice?: { defenders: number; teammates: number; runPlays: boolean };
  rotation?: RotationPlan;
  autopilotUser?: boolean;
  switchAll?: boolean;
  allowedPlays?: string[];
  /** second human (two-player 1v1) */
  user2Id?: string;
  /**
   * Half court (3v3, mode 'game'): both teams attack the same hoop; after a score, a stop, a turnover or any dead ball
   * the team with the ball checks it at the top (no inbounds, no transition). Game clock and quarters as usual.
   */
  halfCourt?: boolean;
  /** half-court 1v1, make it take it (mode must be 'practice') */
  oneOnOne?: { target: number; scoring: '1s2s' | '2s3s'; winBy2: boolean };
  featureUser?: boolean;
  /** big game (playoffs): the home crowd dresses in team colors */
  bigGame?: boolean;
  /** round 56: where it's played (cosmetic): the arena, the school court, or the school court on a rainy night */
  venue?: Venue;
  /**
   * Round 60 story games (the prologue tutorial): every shot goes in (the real chance is still computed and shown),
   * no blocks / fouls, CPU defenders don't reach or help (softD).
   */
  story?: { forceMake?: boolean; noBlocks?: boolean; noFouls?: boolean; softD?: boolean };
}
export type Venue = 'arena' | 'school' | 'schoolRain';

/**
 * Round 60: a script that runs a story game (the tutorial). `think` returns true when it drove that player this tick
 * (the AI is skipped); `onReset` returns true when it set up the next possession itself (instead of practiceReset).
 */
export interface Director {
  tick(sim: GameSim, dt: number): void;
  think?(sim: GameSim, p: Player, dt: number): boolean;
  onReset?(sim: GameSim): boolean;
  onEvent?(sim: GameSim, e: GameEvent): void;
}

export type BallState =
  | { kind: 'held'; holder: Player }
  | { kind: 'pass'; from: Player; to: Player; a: Vec; b: Vec; t: number; dur: number; lob: boolean; risky: boolean; checked: Set<string>; inbound?: boolean;
      /** short pass: bends toward the receiver every tick and almost never gets picked */
      magnet?: boolean;
      /** alley-oop lob: comes down at the rim at catchZ (from z0) for the receiver to catch in the air */
      oop?: { z0: number; catchZ: number };
      /** interception multiplier from the pass length (short ≪ medium < long) */
      riskMult?: number;
      /** overhead lead pass over the defense (transition / to a runner): high arc, only catchable near the ends */
      overhead?: boolean }
  | { kind: 'shot'; shooter: Player; a: Vec; z0: number; t: number; dur: number; made: boolean; pts: number; ev: ShotEval; foul: boolean;
      /** live-rim sequence played after the ball reaches the hoop */ rim?: RimPath; rimT?: number; rimKey?: number;
      airball?: boolean; target?: Vec; exit?: { vel: Vec; vz: number };
      /** physical flight + rim/glass/net contacts planned at release (every shot but dunks); ci = next contact */
      plan?: ShotPlan; ci?: number }
  | { kind: 'loose'; vel: Vec; vz: number; lastTeam: 0 | 1;
      /** nobody can grab it before this (a swatted ball sails first) */
      noGrabUntil?: number;
      /** the player who just lost it can't grab it back before noGrabPidUntil */
      noGrabPid?: string; noGrabPidUntil?: number }
  /** dead ball; with vel/vz it is still falling/bouncing/rolling (through the net after a make), nobody can grab it */
  | { kind: 'dead'; vel?: Vec; vz?: number };

/** quiet events drive audio/animation only and never show in the on-screen feed */
export interface GameEvent { t: number; kind: string; text: string; team?: 0 | 1; pid?: string; big?: boolean; good?: boolean; quiet?: boolean; data?: Record<string, any> }

/** Longest a held screen lasts (s). */
export const SCREEN_HOLD_MAX = 6;

/**
 * How hard a screen lands: stun (s) and knock-back (ft). Grows with the screener's screen rating and strength over
 * the defender's, and with a less mobile defender; Brick Wall / Screen Assassin (screenStun) and Screen Navigator
 * (screenStunTaken, screenKnock) scale it.
 */
export function screenImpact(scr: Player, def: Player): { stun: number; knock: number } {
  const str = (scr.core.strength - def.core.strength) / 99;
  const base = 0.6 + (scr.sub.screen - def.sub.driveStability) / 99 * 0.8 + str * 0.9 - (def.core.mobility - 60) / 99 * 0.7;
  const stun = clamp(base * scr.mods.pMult('screenStun') * def.mods.pMult('screenStunTaken'), 0.3, 2.4);
  const knock = clamp(1.0 + str * 2.0 + (stun - 0.6) * 0.6, 0.6, 2.8) * def.mods.pMult('screenKnock');
  return { stun, knock };
}

export class GameSim {
  cfg: GameConfig;
  rng: Rng;
  time = 0;
  quarter = 1;
  clock: number;
  shotClock = 24;
  possession: 0 | 1 = 0;
  teams: [TeamState, TeamState];
  players: Player[] = [];
  ball: { p: Vec; z: number; st: BallState } = { p: v(47, 25), z: 3, st: { kind: 'dead' } };
  runner = new PlayRunner();
  live = false;
  deadUntil = 0;
  pendingInbound: 0 | 1 | null = 0;
  over = false;
  events: GameEvent[] = [];
  private evCursor = 0;
  user: Player | null = null;
  /** second human player (two-player 1v1); null otherwise */
  user2: Player | null = null;
  userOnCourt = false;
  preview: ShotEval | null = null;
  lastShot: { ev: ShotEval; made: boolean; name: string; user: boolean; blocked?: boolean; at: number } | null = null;
  passTarget: Player | null = null;
  assistCand: { passer: Player; receiver: Player; at: number } | null = null;
  lastPasser: Player | null = null; lastPassAt = -99;
  /** the last pass was a kick-out from a post (round 44: drawn with the `postPass` clip) */
  lastPostPassAt = -99;
  trust: TrustState;
  ult: UltRuntime;
  grade = { good: 0, bad: 0, points: 0 };
  milestones: string[] = [];
  lastGoAhead: { pid: string; clock: number; quarter: number } | null = null;
  phaseStartedAt = 0;
  freezeAI = false;
  /** Round 60: the story script running this game (the prologue tutorial), if any. */
  director: Director | null = null;
  forceClutch = false;
  switchAll: boolean;
  /** Round 47: each offensive player's heat (keyed in → doubles → triples), by player id. */
  heat: Record<string, Heat> = {};
  /** Round 49: each team's results per play this game (the coach calls more of what works). */
  playLog: [Record<string, { runs: number; pts: number }>, Record<string, { runs: number; pts: number }>] = [{}, {}];
  /** The last few calls per team (newest last) and the call in progress (to score it when it ends). */
  recentCalls: [string[], string[]] = [[], []];
  curCall: { team: 0 | 1; play: string; score0: number } | null = null;
  /** Dev / A-B stats: this team's coach calls random sets (the pre-round-49 behaviour). */
  randomCalls: [boolean, boolean] = [false, false];
  /**
   * Round 49: the ball screen being defended with a coverage (for you, or a hot handler): who's screening for whom,
   * how (under / blitz / switch / over) and since when. Picked once per screen; announced once per possession.
   */
  screenCov: { handlerId: string; screenerId: string; kind: ScreenCov; at: number } | null = null;
  private screenCovSaid = -1;
  /** After a switch: a mismatch the offense goes after (the big on a small, or a guard on a slow big). */
  mismatch: { pid: string; until: number } | null = null;
  /** The coverage for the screen coming for this handler right now, if the defense cares about him. */
  screenFor(h: Player): GameSim['screenCov'] {
    const sc = this.screenCov;
    if (sc && sc.handlerId === h.id && this.time - sc.at < 2.5) return sc;
    if (!(h.isUser || this.tierOf(h) >= 1) || this.attentionOff) return (this.screenCov = null);
    const scr = this.mates(h).find((m) => (m.state === 'screen' || (m.screenFor?.pid === h.id && this.time < m.screenFor.until)) && dist(m.p, h.p) < 7);
    if (!scr) return (this.screenCov = null);
    const kind = screenCoverage(h, this.defenderOf(h), this.defenderOf(scr), this.heat[h.id]);
    this.screenCov = { handlerId: h.id, screenerId: scr.id, kind, at: this.time };
    if (this.screenCovSaid !== this.phaseStartedAt && kind !== 'over') {
      this.screenCovSaid = this.phaseStartedAt;
      this.emit({ kind: 'coverage', text: `${this.teams[1 - h.team].def.id} ${SCREEN_COV_TEXT[kind]} on ${h.name}'s screens`, team: (1 - h.team) as 0 | 1 });
    }
    return this.screenCov;
  }
  /** Round 49: a human player's recent dribble moves (the defense learns them). */
  moveLog: Record<string, { id: string; side: number; at: number }[]> = {};
  private readSaid: Record<string, number> = {};
  /** How fresh this move still is against this defense: the 3rd+ use in 45 s works less (×0.8 each, floor 0.35). */
  moveRead(p: Player, id: string): number {
    const n = (this.moveLog[p.id] ?? []).filter((m) => m.id === id && this.time - m.at < 45).length;
    return Math.max(0.35, 0.8 ** Math.max(0, n - 2));
  }
  /** His favourite side to go (−1…1 along perp(toRim)) from his last 8 moves; 0 until there are 3. */
  favoriteSide(p: Player): number {
    const log = (this.moveLog[p.id] ?? []).slice(-8);
    return log.length >= 3 ? log.reduce((a, m) => a + m.side, 0) / log.length : 0;
  }
  /**
   * Round 49: a CPU team (no human on it) down 15+ turns up the pressure until it's within 10: a step quicker,
   * tighter on the ball, more swipes, more bodies on the offensive glass. No rating changes.
   */
  effort: [boolean, boolean] = [false, false];
  private updateEffort() {
    if (this.cfg.mode !== 'game' || this.cfg.oneOnOne) return;
    for (const t of [0, 1] as const) {
      if (this.teams[t].onCourt.some((p) => !this.isAI(p))) { this.effort[t] = false; continue; }
      const down = this.teams[1 - t].score - this.teams[t].score;
      if (!this.effort[t] && down >= 15) { this.effort[t] = true; this.emit({ kind: 'effort', text: `${this.teams[t].def.name} turn up the pressure`, team: t, big: true }); }
      else if (this.effort[t] && down < 10) this.effort[t] = false;
    }
  }
  /** Close the call in progress: its points go into the play log. */
  closeCall() {
    const c = this.curCall; if (!c) return;
    const L = (this.playLog[c.team][c.play] ??= { runs: 0, pts: 0 });
    L.runs++; L.pts += this.teams[c.team].score - c.score0;
    this.curCall = null;
  }
  /** Round 47: dev switch — no smart matchups and no extra attention (old role-based matchups). */
  attentionOff = false;
  /** Dev / stats: smart matchups only, no keyed in / doubles / triples. */
  tiersOff = false;
  /** Stats: trap activations this game (a new double or triple on a catch). */
  trapCount = [0, 0, 0, 0];
  /** testing: coach features the user as often as anyone else, and teammates trust them */
  featureUser: boolean;
  focusQueue: string[] = [];
  /** user's last stick for previews */
  stick: Vec = v();
  stick2: Vec = v();

  constructor(cfg: GameConfig) {
    this.cfg = cfg;
    this.rng = new Rng(cfg.seed ?? 12345);
    this.clock = cfg.quarterLen;
    this.trust = cfg.trust;
    this.switchAll = !!cfg.switchAll;
    this.featureUser = !!cfg.featureUser;
    this.ult = { state: cfg.ult, active: null };
    this.teams = [0, 1].map((i) => ({
      def: cfg.teams[i], side: (i === 0 ? 1 : -1) as Side, score: 0,
      roster: cfg.rosters[i], onCourt: cfg.rosters[i].slice(0, 5),
    })) as [TeamState, TeamState];
    if (cfg.halfCourt) this.teams[1].side = this.teams[0].side; // one basket
    this.user = cfg.userId ? [...cfg.rosters[0], ...cfg.rosters[1]].find((p) => p.id === cfg.userId) ?? null : null;
    if (this.user) this.user.isUser = !cfg.autopilotUser;

    if (cfg.mode === 'practice' && cfg.oneOnOne) {
      this.teams[0].onCourt = cfg.rosters[0].slice(0, 1);
      this.teams[1].onCourt = cfg.rosters[1].slice(0, 1);
      this.teams[1].side = this.teams[0].side; // both attack the same hoop
      this.user2 = cfg.user2Id ? cfg.rosters[1].find((p) => p.id === cfg.user2Id) ?? null : null;
      if (this.user2) this.user2.isUser = true;
    } else if (cfg.mode === 'practice') {
      const pr = cfg.practice ?? { defenders: 1, teammates: 0, runPlays: false };
      const off = this.teams[0];
      const user = this.user!;
      const mates = off.roster.filter((p) => p !== user).slice(0, pr.teammates);
      off.onCourt = [user, ...mates];
      this.teams[1].onCourt = this.teams[1].roster.slice(0, pr.defenders);
    } else if (this.user && cfg.rotation && !shouldBeOn(cfg.rotation, 0)) {
      this.benchUser();
    } else if (this.user) {
      this.putUserOnCourt();
    }
    this.refreshOnCourt();
    this.assignMatchups();
    if (cfg.oneOnOne) {
      this.pendingInbound = this.rng.chance(0.5) ? 0 : 1;
      this.practiceReset();
      this.emit({ kind: 'period', text: `${this.teams[this.possession].onCourt[0].name} has the ball first`, big: true });
    } else if (cfg.mode === 'practice') this.practiceReset();
    else this.startGame();
  }

  // ---------- helpers ----------
  side(team: 0 | 1): Side { return this.teams[team].side; }
  rim(team: 0 | 1): Vec { return rimPos(this.side(team)); }
  offense(): Player[] { return this.teams[this.possession].onCourt; }
  defense(): Player[] { return this.teams[1 - this.possession].onCourt; }
  opp(team: 0 | 1): Player[] { return this.teams[1 - team].onCourt; }
  mates(p: Player): Player[] { return this.teams[p.team].onCourt.filter((q) => q !== p); }
  holder(): Player | null { return this.ball.st.kind === 'held' ? this.ball.st.holder : null; }
  byRole(team: 0 | 1, role: string) { return this.teams[team].onCourt.find((p) => p.role === role) ?? null; }
  /** The role a player has in the current play (roles can be swapped so a set is run for someone). */
  /**
   * The set the offense is running and who it's for (High IQ shows it to a defender): the focus player the coach named
   * (isos, featured sets), else whoever is in the play's focus role (after any role swap).
   */
  playTarget(): { play: string; target: Player | null } | null {
    const pl = this.runner.play;
    if (!pl || this.runner.done || !this.live) return null;
    const named = this.runner.focusPid ? this.players.find((p) => p.id === this.runner.focusPid) ?? null : null;
    return { play: pl.name, target: named ?? (pl.focus ? this.byPlayRole(this.possession, pl.focus) : null) };
  }

  playRole(p: Player): string {
    const sw = this.runner.roleSwap;
    if (!sw || p.team !== this.possession) return p.role;
    return p.role === sw[0] ? sw[1] : p.role === sw[1] ? sw[0] : p.role;
  }
  byPlayRole(team: 0 | 1, role: string) { return this.teams[team].onCourt.find((p) => this.playRole(p) === role) ?? null; }
  get clutch() { return this.forceClutch || (this.cfg.mode === 'game' && this.quarter >= 4 && this.clock < this.cfg.quarterLen * 0.17 && Math.abs(this.teams[0].score - this.teams[1].score) <= 5); }
  get elapsed() { return Math.min(4, this.quarter - 1) * this.cfg.quarterLen + (this.cfg.quarterLen - this.clock); }
  isAI(p: Player) { return !((p === this.user && this.user.isUser) || (p === this.user2 && this.user2.isUser)); }
  /** Is this player controlled by a person (P1 or P2)? */
  isHuman(p: Player | null) { return !!p && !this.isAI(p); }
  emit(e: Omit<GameEvent, 't'>) { const ev = { t: this.time, ...e }; this.events.push(ev); this.director?.onEvent?.(this, ev); }
  drainEvents(): GameEvent[] { const out = this.events.slice(this.evCursor); this.evCursor = this.events.length; return out; }
  defenderOf(p: Player): Player | null { return this.opp(p.team).find((d) => d.guarding === p.id) ?? null; }
  nearestDefender(p: Player): { d: Player | null; dist: number } {
    let best: Player | null = null, bd = 1e9;
    for (const d of this.opp(p.team)) { const dd = dist(d.p, p.p); if (dd < bd) { bd = dd; best = d; } }
    return { d: best, dist: bd };
  }
  openness(p: Player): number { return clamp01((this.nearestDefender(p).dist - 2) / 8); }

  refreshOnCourt() {
    this.players = [...this.teams[0].onCourt, ...this.teams[1].onCourt];
    this.userOnCourt = !!this.user && this.players.includes(this.user);
    for (const t of this.teams) {
      // keep roles 1..5 matching on-court positions; three-man teams (3v3) are guard / wing / big = roles 1 / 3 / 5
      // (so the guard, wing and big logic and the 3v3 plays line up); ties go to the taller player as the bigger role
      const order = ['PG', 'SG', 'SF', 'PF', 'C'];
      const sorted = [...t.onCourt].sort((a, b) => order.indexOf(a.pos) - order.indexOf(b.pos) || a.height - b.height);
      const roles = sorted.length === 3 ? ['1', '3', '5'] : sorted.length === 2 ? ['1', '5'] : ['1', '2', '3', '4', '5']; // round 60: 2v2 = guard + big
      sorted.forEach((p, i) => (p.role = roles[i] ?? String(i + 1)));
    }
  }

  /**
   * Who guards whom (round 47): the best-fitting defender on the biggest threat (reputation + heat), the weakest
   * defender hidden on the least dangerous man (attention.ts `assignGuards`). Role matching when attention is off.
   */
  assignMatchups(live = false) {
    for (const t of [0, 1] as const) {
      const opps = this.opp(t), defs = this.teams[t].onCourt;
      if (!this.attentionOff && defs.length >= 2 && opps.length >= 2) {
        const pick = assignGuards(defs, opps, (o) => threatWeight(scorerRep(o), this.heat[o.id]?.score ?? 0), live ? 4 : 0);
        for (const d of defs) d.guarding = pick.get(d.id) ?? null;
        continue;
      }
      for (const d of defs) {
        const m = opps.find((o) => o.role === d.role) ?? opps[0] ?? null;
        d.guarding = m ? m.id : null;
      }
    }
  }

  /** The attention a player draws right now (0 normal … 3 triple teams). */
  tierOf(p: Player): Tier { return this.attentionOff ? 0 : (this.heat[p.id]?.tier ?? 0); }
  /** The highest tier this game allows (triples in 5v5, doubles in 3v3, none in 1v1 / small practice). */
  get tierCap(): Tier { return this.cfg.oneOnOne || this.tiersOff ? 0 : tierCap(Math.min(this.teams[0].onCourt.length, this.teams[1].onCourt.length)); }
  /** After a field-goal attempt: heat up the shooter; a higher tier is announced. */
  private heatAfterShot(s: Player, made: boolean, ev?: ShotEval) {
    if (this.attentionOff || this.tierCap === 0) return;
    const h = (this.heat[s.id] ??= newHeat());
    const teamFga = [...new Set(this.teams[s.team].roster)].reduce((n, p) => n + p.box.fga, 0);
    const shot = ev ? { type: ev.type, post: ev.conds.has('post'), pts: ev.pts } : undefined;
    const up = afterShot(h, scorerRep(s), s.box, { fga: teamFga, pts: this.teams[s.team].score }, made, this.tierCap, shot);
    if (up) {
      // the new matchups (his weight went up) take over at the next inbound / change of possession
      const how = up >= 2 ? ` — ${COVERAGE_NAME[coverage(s, h)]}` : '';
      this.emit({ kind: 'attention', text: `${TIER_NAME[up]} on ${s.name}${how}`, team: s.team, pid: s.id, big: up >= 2, data: { tier: up } });
    }
  }
  /**
   * Round 47: the double / triple team on the ball. Helpers are picked once per catch (the defenders whose own men
   * matter least, nearest first) and leave after a short read; the rest rotate: each abandoned man gets a defender
   * splitting the difference between him and his own man. Null when nobody is trapping.
   */
  trap: { holderId: string; key: string; helpers: string[]; start: number; rotate: Map<string, string>; scheme: Coverage } | null = null;
  /** How the defense helps on this player now (round 48: from how he's scoring). */
  coverageOf(p: Player): Coverage { return coverage(p, this.heat[p.id]); }
  /** How much the man this defender guards matters (reputation + heat). */
  manWeight(d: Player): number {
    const m = this.players.find((q) => q.id === d.guarding);
    return m ? threatWeight(scorerRep(m), this.heat[m.id]?.score ?? 0) : 0;
  }
  /** Helpers for a double / triple on h: the defenders whose own men matter least, nearest first; the rim protector
   *  stays home unless the ball is close to the rim; a round 44 post double counts as the first. */
  pickHelpers(h: Player, n: number, pool: Player[]): Player[] {
    const helpers: Player[] = [];
    const postHelp = h.post?.helpId ? pool.find((d) => d.id === h.post!.helpId) : undefined;
    if (postHelp) helpers.push(postHelp);
    const rimGuard = this.opp(h.team).slice().sort((a, b) => b.sub.block + b.height * 10 - (a.sub.block + a.height * 10))[0];
    const farOut = dist(h.p, this.rim(h.team)) > 12;
    const cost = (d: Player) => this.manWeight(d) * 12 + dist(d.p, h.p) * 0.5 + (farOut && d === rimGuard ? 12 : 0);
    for (const d of pool.filter((x) => x !== postHelp).sort((a, b) => cost(a) - cost(b))) { if (helpers.length >= n) break; helpers.push(d); }
    return helpers;
  }
  /**
   * Loading up (round 47): while a scorer the defense doubles (tier 2+) is off the ball in the half court, his
   * would-be helpers already sit in the gap toward him, so the double lands on the catch. Picked once per possession.
   */
  load: { key: string; hotId: string; helpers: string[] } | null = null;
  loadFor(): { hot: Player; helpers: string[]; scheme: Coverage } | null {
    if (!this.live || this.tierCap < 2 || this.trap) { this.load = null; return null; }
    const off = this.offense(), side = this.side(this.possession);
    const hot = off.filter((p) => this.tierOf(p) >= 2 && inFrontcourt(side, p.p)).sort((a, b) => this.tierOf(b) - this.tierOf(a) || (this.heat[b.id]?.score ?? 0) - (this.heat[a.id]?.score ?? 0))[0];
    if (!hot || this.inTransition(this.possession) || this.holder() === hot) { this.load = null; return null; }
    const key = `${hot.id}|${this.tierOf(hot)}|${this.possession}|${this.phaseStartedAt}`;
    if (this.load?.key !== key) {
      const own = this.defenderOf(hot);
      const pool = this.opp(hot.team).filter((d) => d !== own && this.isAI(d) && d.state !== 'fallen' && d !== this.defenderOf(this.holder() ?? hot));
      this.load = { key, hotId: hot.id, helpers: this.pickHelpers(hot, this.tierOf(hot) - 1, pool).map((d) => d.id) };
    }
    return { hot, helpers: this.load.helpers, scheme: this.coverageOf(hot) };
  }
  /** Who a trap would be on: the ball handler, or a hot scorer the ball is being passed to (doubles come on the catch). */
  trapTarget(): Player | null {
    const st = this.ball.st;
    if (st.kind === 'held') return st.holder;
    if (st.kind === 'pass' && !st.oop) return st.to;
    return null;
  }
  trapFor(h: Player | null): GameSim['trap'] {
    const tier = h ? this.tierOf(h) : 0;
    const side = h ? this.side(h.team) : 1;
    const on = !!h && tier >= 2 && this.live && h.team === this.possession && inFrontcourt(side, h.p) && dist(h.p, this.rim(h.team)) < (this.trap?.holderId === h.id ? 31 : 28) && !this.inTransition(h.team) && h.state !== 'shoot';
    if (!on) { this.trap = null; return null; }
    // one trap per stint with the ball (it starts while the pass is on its way and stays on him until he gives it up)
    const key = `${h!.id}|${tier}`;
    if (this.trap?.key === key) return this.trap;
    const onBall = this.defenderOf(h!);
    const w = (d: Player) => this.manWeight(d);
    const pool = this.opp(h!.team).filter((d) => d !== onBall && this.isAI(d) && d.state !== 'fallen');
    const helpers = this.pickHelpers(h!, tier - 1, pool);
    // rotation: each man left open gets the nearest remaining defender whose own man matters least
    const rotate = new Map<string, string>();
    const rest = pool.filter((d) => !helpers.includes(d));
    const open = helpers.map((d) => this.players.find((q) => q.id === d.guarding)).filter((m): m is Player => !!m && m !== h)
      .sort((a, b) => scorerRep(b) - scorerRep(a));
    for (const m of open) {
      const c = rest.filter((d) => !rotate.has(d.id) && d.guarding !== m.id).sort((a, b) => dist(a.p, m.p) + w(a) * 6 - (dist(b.p, m.p) + w(b) * 6))[0];
      if (c) rotate.set(c.id, m.id);
    }
    const start = this.time + (this.ball.st.kind === 'pass' ? this.rng.range(0.05, 0.25) : this.rng.range(0.3, 0.6));
    this.trap = { holderId: h!.id, key, helpers: helpers.map((d) => d.id), start, rotate, scheme: this.coverageOf(h!) };
    this.trapCount[tier]++;
    return this.trap;
  }
  /**
   * A pass out of a trap: the scramble. The closest defender closes out on the catch (swapping men with the
   * receiver's own defender when he's well behind the play).
   */
  private scrambleOnCatch(from: Player, to: Player) {
    if (!ATT.scramble || !this.trap || this.trap.holderId !== from.id) return;
    this.trap = null;
    const own = this.defenderOf(to);
    const near = this.opp(to.team).filter((d) => this.isAI(d) && d.state !== 'fallen').sort((a, b) => dist(a.p, to.p) - dist(b.p, to.p))[0];
    if (!near || near === own || !own || !this.isAI(own)) return;
    if (dist(near.p, to.p) + 4 < dist(own.p, to.p)) { const g = near.guarding; near.guarding = to.id; own.guarding = g; }
  }

  /**
   * Round 49 scouting report (career): from your last 3 games, a big scorer (30+ a night or 40%+ of the shots) starts
   * keyed in, a known ball hog (55%+ of the shots) starts at doubles; how you scored carries over at half weight.
   */
  applyScouting(games: { pts: number; fga: number; teamFga: number; rim: number; jumper: number; post: number }[]) {
    const u = this.user; if (!u || this.attentionOff) return;
    const last = games.slice(-3); if (!last.length) return;
    const avg = (f: (g: typeof last[number]) => number) => last.reduce((a, g) => a + f(g), 0) / last.length;
    const pts = avg((g) => g.pts), share = avg((g) => (g.teamFga > 0 ? g.fga / g.teamFga : 0));
    const tier = Math.min(this.tierCap, share >= 0.55 ? 2 : pts >= 30 || share >= 0.4 ? 1 : 0) as Tier;
    if (!tier) return;
    const h = (this.heat[u.id] ??= newHeat());
    h.tier = tier; h.score = Math.max(h.score, HEAT_AT[tier]);
    h.buckets = { rim: avg((g) => g.rim) * 0.5, jumper: avg((g) => g.jumper) * 0.5, post: avg((g) => g.post) * 0.5 };
    this.assignMatchups();
    const opp = this.teams[1 - u.team].def;
    this.emit({ kind: 'attention', text: `Scouting report: ${opp.name} ${tier >= 2 ? 'will double' : 'are keyed in on'} ${u.name} (${pts.toFixed(0)} pts, ${(share * 100).toFixed(0)}% of the shots lately)`, team: (1 - u.team) as 0 | 1, big: true, data: { tier } });
  }

  /** Dev: force a player's tier (heat follows so it doesn't drop back). */
  forceTier(p: Player, tier: Tier) {
    const h = (this.heat[p.id] ??= newHeat());
    h.tier = tier; h.score = Math.max(h.score, HEAT_AT[tier]); h.since = { fga: p.box.fga, fgm: p.box.fgm, pts: p.box.pts };
    this.assignMatchups();
  }

  private benchUser() {
    const t = this.teams[this.user!.team];
    if (!t.onCourt.includes(this.user!)) return;
    const sub = t.roster.find((p) => !t.onCourt.includes(p) && p.pos === this.user!.pos) ?? t.roster.find((p) => !t.onCourt.includes(p) && p !== this.user);
    if (!sub) return;
    sub.p = { ...this.user!.p };
    t.onCourt = t.onCourt.map((p) => (p === this.user ? sub : p));
    this.emit({ kind: 'sub', text: `${this.user!.name} to the bench`, team: this.user!.team });
  }
  private putUserOnCourt() {
    const u = this.user!;
    const t = this.teams[u.team];
    if (t.onCourt.includes(u)) return;
    let idx = t.onCourt.findIndex((p) => p.pos === u.pos);
    if (idx < 0) idx = t.onCourt.length - 1;
    u.p = { ...t.onCourt[idx].p };
    t.onCourt[idx] = u;
    this.emit({ kind: 'sub', text: `${u.name} checks in`, team: u.team, big: true });
  }

  // ---------- flow ----------
  startGame() {
    if (this.cfg.halfCourt) { this.deadBall(this.rng.chance(0.5) ? 0 : 1, 1.0, 'mid'); return; } // coin flip: they check it up top
    for (const t of [0, 1] as const) {
      const side = this.side(t);
      this.teams[t].onCourt.forEach((p, i) => { p.p = hc(side, 52 + i * 2, (i - 2) * 6); p.vel = v(); });
    }
    this.ball.p = v(47, 25);
    this.deadBall(0, 1.0, 'mid');
  }

  /** Instant inbound (practice resets, tests). Games use the walk-out inbound from deadBall(). */
  inbound(team: 0 | 1) {
    this.inb = null;
    this.possession = team;
    this.shotClock = 24;
    this.runner.reset();
    const side = this.side(team);
    const pg = this.byRole(team, '1') ?? this.teams[team].onCourt[0];
    pg.p = hc(side, 80, 4);
    this.giveBall(pg);
    this.live = true;
    this.pendingInbound = null;
    this.assignMatchups();
  }

  /** 1v1 check ball: the team with the ball checks it at the top of the key, defender 4 ft off toward the rim. */
  checkBall(team: 0 | 1) {
    this.possession = team;
    this.shotClock = 14;
    this.runner.reset();
    this.inb = null;
    this.transitionUntil = 0;
    const side = this.side(team), rim = this.rim(team);
    const offs = this.teams[team].onCourt, defs = this.teams[1 - team].onCourt;
    const off = this.byRole(team, '1') ?? offs[0];
    for (const p of [...offs, ...defs]) {
      p.vel = v(); p.state = 'idle'; p.z = 0; p.vz = 0; p.staggerUntil = 0; p.screenedUntil = 0; p.bumpedUntil = -9;
      p.move = null; p.pendingShot = null; p.liftAt = 0; p.jumpAt = 0; p.stunnedUntil = -9; p.post = null; p.postedBy = null;
    }
    // the checker at the top; teammates (3v3) spread to a wing and a block
    off.p = hc(side, 30, 0);
    const rest = offs.filter((p) => p !== off);
    const wingY = this.rng.chance(0.5) ? 1 : -1;
    rest.forEach((p, i) => { p.p = p.role === '5' || (i === 1 && !rest.some((q) => q.role === '5')) ? spot(side, wingY > 0 ? 'lb' : 'rb') : spot(side, wingY > 0 ? 'rw' : 'lw'); });
    this.assignMatchups();
    for (const d of defs) {
      const m = offs.find((o) => o.id === d.guarding) ?? off;
      d.p = add(m.p, scale(norm(sub(rim, m.p)), m === off ? 4 : 3.5));
      d.face = norm(sub(m.p, d.p));
    }
    off.face = norm(sub(rim, off.p));
    this.giveBall(off);
    this.live = true;
    this.pendingInbound = null;
  }

  /** Points a make is worth (1v1 "1s & 2s": inside the arc = 1, three = 2). */
  scoreValue(pts: number): number {
    if (this.cfg.oneOnOne?.scoring === '1s2s') return pts >= 3 ? 2 : 1;
    return pts;
  }

  /** 1v1: end the game when someone reaches the target (and leads by 2 if win-by-2 is on). */
  private checkWin(): boolean {
    const o = this.cfg.oneOnOne;
    if (!o) return false;
    const [a, b] = [this.teams[0].score, this.teams[1].score];
    const hi = Math.max(a, b), lead = Math.abs(a - b);
    if (hi >= o.target && (!o.winBy2 || lead >= 2)) { this.finish(); return true; }
    return false;
  }

  practiceReset() {
    if (this.director?.onReset?.(this)) return;
    if (this.cfg.oneOnOne) { this.checkBall(this.pendingInbound ?? this.possession); return; }
    const side = this.side(0);
    this.possession = 0;
    this.shotClock = 24;
    this.runner.reset();
    const user = this.user!;
    const spots = ['top', 'lw', 'rw', 'lc', 'rc'];
    const off = this.teams[0].onCourt;
    off.forEach((p, i) => { p.p = p === user ? spot(side, 'top') : spot(side, spots[i] ?? 'rim'); p.vel = v(); p.state = 'idle'; p.z = 0; p.vz = 0; });
    user.p = hc(side, 30, 0);
    this.assignMatchups();
    for (const d of this.teams[1].onCourt) {
      const m = off.find((o) => o.id === d.guarding) ?? user;
      const r = this.rim(0);
      d.p = add(m.p, scale(norm(sub(r, m.p)), 4)); d.vel = v(); d.state = 'idle'; d.z = 0; d.vz = 0; d.staggerUntil = 0; d.screenedUntil = 0;
    }
    this.giveBall(user);
    this.live = true;
    this.pendingInbound = null;
    if (this.cfg.practice?.runPlays) this.callPlay();
  }

  giveBall(p: Player) {
    for (const q of this.players) { q.deadDribble = false; q.flickDir = 0; }
    this.ball.st = { kind: 'held', holder: p };
    p.receivedAt = this.time; p.dribbledSinceCatch = false; p.box.touches++;
  }

  /**
   * Dead ball. In games nobody teleports: an inbounder walks out of bounds (baseline after a make,
   * otherwise the sideline where the ball went out) and passes it in to the point guard.
   */
  deadBall(next: 0 | 1, delay = 1.1, where: 'baseline' | 'sideline' | 'mid' = 'sideline') {
    this.live = false;
    this.deadUntil = this.time + delay;
    this.pendingInbound = next;
    this.runner.reset();
    this.transitionUntil = 0;
    const ballAt = { ...this.ball.p };
    if (this.ball.st.kind !== 'dead' || this.ball.st.vz === undefined) this.ball.st = { kind: 'dead' };
    if (this.cfg.mode !== 'practice' && !this.cfg.halfCourt) this.startInbound(next, delay, where, ballAt);
  }

  inb: { team: 0 | 1; inbounder: Player; receiver: Player; spot: Vec; recv: Vec; minPassAt: number; start: number; hasBall: boolean } | null = null;
  transitionUntil = 0;

  private startInbound(team: 0 | 1, delay: number, where: 'baseline' | 'sideline' | 'mid', ballAt: Vec) {
    // substitutions happen at dead balls
    if (this.user && this.cfg.rotation) {
      const on = shouldBeOn(this.cfg.rotation, this.elapsed);
      if (on && !this.userOnCourt) this.putUserOnCourt();
      else if (!on && this.userOnCourt) this.benchUser();
      this.refreshOnCourt();
    }
    this.possession = team;
    this.shotClock = 24;
    this.assignMatchups();
    const side = this.side(team);
    const crew = this.teams[team].onCourt;
    let spot: Vec, recv: Vec, inbounder: Player;
    if (where === 'baseline') {
      // under the basket that was just scored on = this team's own baseline
      spot = hc(side, 94 + 2.5, 4);
      recv = hc(side, 82, 9);
      const bigs = crew.filter((p) => p.role === '5' || p.role === '4');
      inbounder = (bigs.length ? bigs : crew).slice().sort((a, b) => dist(a.p, spot) - dist(b.p, spot))[0];
      const rimAt = rimPos(-side as Side);
      if (this.ball.st.kind !== 'dead' || this.ball.st.vz === undefined || dist(this.ball.p, rimAt) > 4) {
        this.ball.p = { ...rimAt }; this.ball.z = 8.4; this.ball.st = { kind: 'dead', vel: v(0, 0), vz: -6 }; // drops through the net
      }
    } else {
      const x = where === 'mid' ? 47 : clamp(ballAt.x, 6, 88);
      const top = where === 'mid' ? true : ballAt.y < 25;
      spot = v(x, top ? -2.5 : 52.5);
      recv = v(clamp(x + (side === 1 ? 6 : -6), 4, 90), top ? 9 : 41);
      inbounder = crew.filter((p) => p.role !== '1').slice().sort((a, b) => dist(a.p, spot) - dist(b.p, spot))[0] ?? crew[0];
      this.ball.p = { ...spot }; this.ball.z = 3;
    }
    const receiver = crew.find((p) => p.role === '1' && p !== inbounder) ?? crew.find((p) => p !== inbounder) ?? inbounder;
    this.inb = { team, inbounder, receiver, spot, recv, minPassAt: this.time + Math.max(0.6, delay), start: this.time, hasBall: false };
  }

  /** Walk out, pick up the ball, wait for the PG, pass it in. */
  private updateInbound() {
    const s = this.inb;
    if (!s) return;
    const b = this.ball;
    // he picks it up once it has come down (off the bounce), not out of the net
    const vz = b.st.kind === 'dead' ? b.st.vz : undefined;
    if (!s.hasBall && dist(s.inbounder.p, b.p) < 2.6 && (vz !== undefined ? vz >= 0 && b.z < 3 : b.z < 5)) { s.hasBall = true; b.st = { kind: 'dead' }; }
    if (s.hasBall) { b.p = add(s.inbounder.p, scale(s.inbounder.face, 0.6)); b.z = 6.2; }
    const atSpot = dist(s.inbounder.p, s.spot) < 1.3;
    const recvReady = dist(s.receiver.p, s.recv) < 3.5 || this.time - s.start > 4.5;
    if (s.hasBall && atSpot && recvReady && this.time >= s.minPassAt) {
      this.inb = null;
      this.live = true;
      this.pendingInbound = null;
      this.shotClock = 24;
      this.newPossession(this.time - this.lastMadeAt < 8);
      s.inbounder.allowOobUntil = this.time + 2.5;
      s.inbounder.face = norm(sub(s.receiver.p, s.inbounder.p));
      this.ball.st = { kind: 'held', holder: s.inbounder };
      this.pass(s.inbounder, s.receiver);
      const bs = this.ball.st as BallState;
      if (bs.kind === 'pass') bs.inbound = true;
    }
  }

  /** Position targets while the ball is being inbounded. */
  private thinkInbound(p: Player) {
    const s = this.inb!;
    if (p === s.inbounder) { this.steer(p, s.hasBall ? s.spot : this.ball.p, false, 0.8); p.face = norm(sub(s.recv, p.p)); return; }
    if (p === s.receiver) { this.steer(p, s.recv, false, 0.9); return; }
    if (p.team === s.team) {
      const t = offBallTarget(this, p);
      this.steer(p, t.pos, false, 0.75);
    } else thinkDefense(this, p, 1 / 60);
  }

  /** Inbounders (and players just stepping back in) may stand out of bounds. */
  clampFor(p: Player, pos: Vec): Vec {
    if (this.inb?.inbounder === p || this.time < p.allowOobUntil) return v(clamp(pos.x, -8, 102), clamp(pos.y, -5, 55));
    return clampToCourt(pos);
  }

  inTransition(team: 0 | 1) { return this.possession === team && this.time < this.transitionUntil && !this.runner.playId; }

  // ---------- bringing it up: the press and the 8-second rule (full-court games) ----------
  /** the defending team is pressing full court (until the ball crosses half court + 2 s) */
  pressing: [boolean, boolean] = [false, false];
  pressEndsAt = -1;
  /** dev / tests: every possession is pressed */
  forcePress = false;
  lastMadeAt = -99;
  /** 8-second clock: time in the backcourt this possession, and whether the ball has crossed */
  backcourtT = 0; crossed = true;
  get fullCourt() { return this.cfg.mode === 'game' && !this.cfg.halfCourt && !this.cfg.oneOnOne; }

  /** A team just got the ball (inbound completed, live turnover, defensive board): start the 8 seconds, maybe press. */
  newPossession(afterMake: boolean) {
    if (!this.fullCourt) return;
    const off = this.possession, def = (1 - off) as 0 | 1;
    this.backcourtT = 0;
    this.crossed = inFrontcourt(this.side(off), this.ball.p);
    this.pressEndsAt = -1;
    this.pressing = [false, false];
    if (this.crossed) return;
    let press = this.forcePress;
    const lead = this.teams[def].score - this.teams[off].score;
    if (!press && this.quarter >= 4 && this.clock < this.cfg.quarterLen * 0.25 && lead <= -3 && lead >= -15) press = true; // late and trailing
    if (!press && afterMake) {
      const pd = this.teams[def].onCourt.reduce((a, p) => a + p.sub.perimD, 0) / Math.max(1, this.teams[def].onCourt.length);
      press = this.rng.chance(clamp(0.06 + 0.1 * (pd - 50) / 50, 0.03, 0.18));
    }
    if (press) {
      this.pressing[def] = true;
      this.emit({ kind: 'press', text: 'FULL-COURT PRESS', team: def });
    }
  }

  /** Is this ball handler under pressure bringing it up (a defender in his face going up court, or a trap)? */
  pressured(h: Player): { pressured: boolean; trapped: boolean } {
    const toFront = norm(sub(this.rim(h.team), h.p));
    const nd = this.nearestDefender(h);
    const pressured = !!nd.d && nd.dist < 4 && dot(sub(nd.d.p, h.p), toFront) > 0;
    const trapped = this.opp(h.team).filter((o) => dist(o.p, h.p) < 6).length >= 2;
    return { pressured, trapped };
  }

  /**
   * Help for a pressured ball handler in the backcourt (AI or you): after 1.2 s of pressure a big comes up to set a
   * screen on his man (the press outlet is in offBallTarget).
   */
  private pressHelp() {
    const h = this.holder();
    if (!h || !this.fullCourt || this.crossed || h.team !== this.possession) { if (h) h.pressedSince = -9; return; }
    const pr = this.pressured(h);
    if (!pr.pressured && !pr.trapped) { h.pressedSince = -9; return; }
    if (h.pressedSince < 0) h.pressedSince = this.time;
    if (this.time - h.pressedSince > (this.pressing[(1 - h.team) as 0 | 1] ? 1.2 : 2.0)) this.callScreenFor(h); // sooner against a press
  }

  /** Call the nearest big (not you) up to screen for this ball handler. */
  callScreenFor(h: Player) {
    if (this.mates(h).some((m) => m.screenFor?.pid === h.id && this.time < m.screenFor.until)) return;
    const s = this.mates(h).filter((m) => (m.role === '5' || m.role === '4' || m.role === '3') && this.isAI(m) && m.state !== 'fallen')
      .sort((a, b) => Number(b.role) - Number(a.role) || dist(a.p, h.p) - dist(b.p, h.p))[0];
    if (!s) return;
    s.screenFor = { pid: h.id, until: this.time + 3.5 };
    this.emit({ kind: 'call', text: `${s.name}: "Screen!"`, team: h.team, pid: s.id });
  }

  /** The 8-second count (and the press ending once the ball crosses). Returns true on a violation. */
  private backcourtRule(dt: number): boolean {
    if (!this.fullCourt) return false;
    const off = this.possession, st = this.ball.st;
    const controlled = (st.kind === 'held' && st.holder.team === off) || (st.kind === 'pass' && st.from.team === off);
    if (!this.crossed && controlled) {
      if (inFrontcourt(this.side(off), this.ball.p)) { this.crossed = true; this.pressEndsAt = this.time + 2; }
      else {
        this.backcourtT += dt;
        if (this.backcourtT > BACKCOURT_S && st.kind === 'held') {
          const h = st.holder; h.box.tov++;
          this.emit({ kind: 'violation', text: '8-second violation', team: off });
          if (h === this.user) applyTrust(this.trust, 'turnover');
          this.rhythmLoss(h, 'turnover');
          this.crossed = true;
          this.deadBall((1 - off) as 0 | 1);
          return true;
        }
      }
    }
    if (this.pressEndsAt > 0 && this.time > this.pressEndsAt) { this.pressing = [false, false]; this.pressEndsAt = -1; }
    return false;
  }

  changePossessionLive(newTeam: 0 | 1) {
    this.possession = newTeam;
    this.shotClock = 24;
    this.runner.reset();
    // live turnover / board in a full-court game: pick up the nearest man (the scouting matchups return at a dead ball)
    this.assignMatchups(!(this.cfg.oneOnOne || this.cfg.halfCourt || this.cfg.mode === 'practice'));
    if (this.cfg.oneOnOne || this.cfg.halfCourt) this.deadBall(newTeam, 1.0); // take it back: new offense checks it up top
    else if (this.cfg.mode === 'practice') this.deadBall(0, 1.0);
    else { this.transitionUntil = this.time + 5; this.newPossession(false); } // live turnover / defensive board: read the break
  }

  callPlay() {
    // "feature me equally" (testing): rotate who the set is run for across all five, including the user
    const off = this.offense();
    // three a side (3v3) runs the 3v3 playbook (roles 1 / 3 / 5); five a side never sees it
    const small = off.length <= 3;
    const allowed = (pid: string) => PLAYS[pid].tags.includes('3v3') === small && (!PLAYS[pid].tags.includes('tutorial') || !!this.cfg.allowedPlays?.includes(pid)) && (!this.cfg.allowedPlays?.length || this.cfg.allowedPlays.includes(pid));
    const isIso = (pid: string) => PLAYS[pid].tags.includes('iso');
    // iso sets are only for designated stars; everything else is the regular playbook
    // lob sets only when the player they're for can finish above the rim; a good lob passer calls them more
    const isLob = (pid: string) => PLAYS[pid].tags.includes('lob');
    const canOop = (pid: string) => { const f = PLAYS[pid].focus, m = f ? this.byRole(this.possession, f) : null; return !!m && canOopDunk(m); };
    const regular = Object.keys(PLAYS).filter((pid) => !isIso(pid) && allowed(pid) && (!isLob(pid) || canOop(pid)));
    const lobber = off.some((p) => p.sub.lob >= 75 || p.mods.pAdd('lob') > 0);
    const pool = regular;
    const isos = Object.keys(PLAYS).filter((pid) => isIso(pid) && allowed(pid) && pid !== this.runner.lastPlayId);
    let id = PlayRunner.pick(this.rng, pool.length ? pool : isos.length ? isos : this.cfg.allowedPlays, this.runner.lastPlayId);
    // lob sets are a wrinkle, not the base offense: usually re-pick (less often with a good lob passer on the floor)
    const nonLob = pool.filter((pid) => !isLob(pid));
    if (isLob(id) && nonLob.length && this.rng.chance(lobber ? 0.45 : 0.7)) id = PlayRunner.pick(this.rng, nonLob, this.runner.lastPlayId);
    let swap: [string, string] | null = null;
    let focus: Player | null = null;
    let why = '';
    this.closeCall();
    const isoFor = (star: Player) => { id = this.rng.pick(isos); swap = PLAYS[id].focus ? [PLAYS[id].focus!, star.role] : null; focus = star; };
    if (this.featureUser && this.user && this.userOnCourt && this.user.team === this.possession && off.length >= 3) {
      if (!this.focusQueue.length) this.focusQueue = off.map((p) => p.id).sort(() => this.rng.next() - 0.5);
      const fid = this.focusQueue.shift()!;
      focus = off.find((p) => p.id === fid) ?? null;
      if (focus && (focus.star || small) && isos.length && this.rng.chance(small ? 0.35 : 0.4)) isoFor(focus); // 3v3: anyone can get an iso
      else if (focus) {
        const fits = regular.filter((pid) => PLAYS[pid].focus === focus!.role && pid !== this.runner.lastPlayId);
        if (fits.length) id = this.rng.pick(fits);
        else if (focus === this.user && PLAYS[id].focus) swap = [PLAYS[id].focus!, focus.role]; // run any set for the user by swapping roles
        else if (focus !== this.user) focus = null;
      }
    } else if (!this.randomCalls[this.possession] && endgame(this) && isos.length && this.user && this.userOnCourt && topScorer(off) === this.user && this.trust.coach >= 60 && this.rng.chance(0.6)) {
      // round 54: you're the go-to scorer and the coach trusts you: your number gets called at closing time
      isoFor(this.user); why = 'closing time';
    } else if (!this.randomCalls[this.possession]) {
      // round 49: the coach scores every (play, focus) and picks one — lab values + matchups + what's working tonight
      const best = small ? [...off].sort((a, b) => b.overall - a.overall)[0] : null;
      const avgUse = off.reduce((a, q) => a + q.box.usage, 0) / Math.max(1, off.length);
      const plays = Object.keys(PLAYS).filter((pid) => allowed(pid));
      const focuses = off.filter((p) => this.isAI(p) && p.state !== 'fallen');
      const pick = chooseCall(this, plays, focuses, this.playLog[this.possession], this.recentCalls[this.possession],
        (pid, f) => canOopDunk(f) && !!PLAYS[pid].focus,
        (f) => ((f.star || f === best) && f.box.usage <= avgUse * 1.8 + 2) || (endgame(this) && f === topScorer(off))); // round 54: the closer gets his iso late
      if (pick) {
        id = pick.play; focus = pick.focus;
        swap = PLAYS[id].focus && PLAYS[id].focus !== pick.focus.role ? [PLAYS[id].focus!, pick.focus.role] : null;
        why = pick.why;
      }
    } else {
      // stars get their number called: about 30% of sets (half in the clutch) are an iso for one of them
      // ...but not when he's already taking more than his share
      const avgUse = off.reduce((a, q) => a + q.box.usage, 0) / Math.max(1, off.length);
      // 3v3 is iso ball too: no designated star needed, the team's best player (or a star) gets his number called
      const best = small ? [...off].sort((a, b) => b.overall - a.overall)[0] : null;
      const stars = off.filter((p) => (p.star || p === best) && p.box.usage <= avgUse * 1.8 + 2);
      const closer = endgame(this) ? topScorer(off) : null; // round 54: the last few possessions go to the top scorer
      if (closer && isos.length && this.rng.chance(0.75)) isoFor(closer);
      else if (stars.length && isos.length && this.rng.chance(this.clutch ? 0.5 : small ? 0.35 : 0.3)) isoFor(this.rng.pick(stars));
    }
    this.runner.call(id, swap, focus?.id ?? null);
    this.phaseStartedAt = this.time;
    const fp = focus as Player | null;
    const tail = (fp && !isIso(id) && PLAYS[id].focus && this.byRole(this.possession, PLAYS[id].focus!) !== fp ? ` for ${fp.name}` : '') + (why ? ` — ${why}` : '');
    this.emit({ kind: 'play', text: isIso(id) && fp ? `Coach: "Iso for ${fp.name}"${why ? ` — ${why}` : ''}` : `Coach: "${this.runner.play!.name}"${tail}`, team: this.possession });
    this.curCall = { team: this.possession, play: id, score0: this.teams[this.possession].score };
    const rc = this.recentCalls[this.possession]; rc.push(id); if (rc.length > 3) rc.shift();
  }

  // ---------- main tick ----------
  update(dt: number, input: UserInput, input2?: UserInput) {
    if (this.over) return;
    this.time += dt;
    if (this.curCall && this.curCall.team !== this.possession) this.closeCall();
    this.updateEffort();
    for (const p of this.players) p.mods.expire(this.time);

    if (!this.live) {
      if (this.cfg.mode === 'practice') { if (this.time >= this.deadUntil) this.resume(); }
      else if (this.inb) this.updateInbound();
      else if (this.time >= this.deadUntil) this.resume();
    } else {
      if (this.cfg.mode === 'game' && this.ball.st.kind !== 'shot') this.clock -= dt;
      if (this.ball.st.kind !== 'shot' && this.ball.st.kind !== 'loose') this.shotClock -= dt;
      for (const p of this.players) p.box.secs += dt;
    }

    if (this.user && this.userOnCourt && this.user.isUser) this.handleUser(this.user, input, this.ux);
    if (this.user2 && this.user2.isUser && this.players.includes(this.user2)) this.handleUser(this.user2, input2 ?? emptyInput(), this.ux2);
    this.director?.tick(this, dt);
    if (!this.freezeAI) {
      for (const p of this.players) if ((this.isAI(p) || this.inb?.inbounder === p) && !this.director?.think?.(this, p, dt)) this.think(p, dt);
    } else for (const p of this.players) if (this.isAI(p)) p.target = { ...p.p };

    this.pressHelp(); // a pressured handler in the backcourt gets a screen
    updatePost(this, dt); // after think, before physics: the posting pair's positions
    tickUlt(this, dt);
    this.physics(dt);
    this.collisions();
    this.updateBall(dt);
    this.updatePlay(dt);
    this.rules(dt);
    this.transitionMatchups();
    this.trackUserMatchup();
    this.updatePreview();
  }

  /** Round 53: you ran your part of this possession's play (rhythm when the team scores off it). */
  ranPlay: { team: 0 | 1 } | null = null;
  private ranPlayPoss: 0 | 1 = 0;
  /** When your defensive assignment last changed (a switch), and who it was. */
  userGuardChangedAt = -9;
  private lastUserGuarding: string | null = null;
  private nextXMatchAt = 0;
  /**
   * Round 53: fast-break cross-matching. While a team is in transition defense, two defenders swap men when each is
   * clearly closer to the other's man (sum of distances 6 ft shorter). Includes you, so your circle / cone move to
   * the man you're actually picking up; the switch sticks after the break, like a real one.
   */
  private transitionMatchups() {
    if (!this.live || this.time < this.nextXMatchAt || !this.inTransition(this.possession)) return;
    if (this.cfg.oneOnOne || this.cfg.halfCourt || this.cfg.mode === 'practice') return;
    this.nextXMatchAt = this.time + 0.25;
    const defs = this.defense(), byId = (id: string | null) => (id ? this.players.find((q) => q.id === id) : undefined);
    for (let i = 0; i < defs.length; i++) for (let j = i + 1; j < defs.length; j++) {
      const a = defs[i], b = defs[j], ma = byId(a.guarding), mb = byId(b.guarding);
      if (!ma || !mb || a.state === 'fallen' || b.state === 'fallen') continue;
      if (dist(a.p, mb.p) + dist(b.p, ma.p) + 6 < dist(a.p, ma.p) + dist(b.p, mb.p)) { a.guarding = mb.id; b.guarding = ma.id; }
    }
  }
  /** Notice your assignment changing during live play (any switch) and tell the HUD; reset the ran-the-play mark. */
  private trackUserMatchup() {
    if (this.possession !== this.ranPlayPoss) { this.ranPlay = null; this.ranPlayPoss = this.possession; }
    const u = this.user;
    if (!u) return;
    if (u.guarding !== this.lastUserGuarding) {
      const prev = this.lastUserGuarding;
      this.lastUserGuarding = u.guarding;
      this.userGuardChangedAt = this.time;
      const m = u.guarding ? this.players.find((q) => q.id === u.guarding) : null;
      if (prev && m && this.live && this.userOnCourt && u.team !== this.possession) this.quiet('switch', { to: m.name }, u.id);
    }
  }

  private resume() {
    if (this.cfg.mode === 'practice') { this.practiceReset(); return; }
    if (this.cfg.halfCourt) { this.checkBall(this.pendingInbound ?? (1 - this.possession) as 0 | 1); return; } // check it up top
    // substitutions happen at dead balls
    if (this.user && this.cfg.rotation) {
      const on = shouldBeOn(this.cfg.rotation, this.elapsed);
      if (on && !this.userOnCourt) this.putUserOnCourt();
      else if (!on && this.userOnCourt) this.benchUser();
      this.refreshOnCourt();
    }
    this.inbound(this.pendingInbound ?? (1 - this.possession) as 0 | 1);
  }

  private rules(dt = 0) {
    if (!this.live) return;
    if (this.backcourtRule(dt)) return;
    const hd = this.holder();
    if (hd && hd.deadDribble && this.time - hd.deadDribbleAt > 5 && hd.state !== 'shoot') {
      hd.box.tov++; hd.deadDribble = false;
      this.emit({ kind: 'violation', text: '5-second violation (held the ball)', team: this.possession });
      if (hd === this.user) applyTrust(this.trust, 'turnover');
      this.rhythmLoss(hd, 'turnover');
      this.deadBall((1 - this.possession) as 0 | 1);
      return;
    }
    if (this.shotClock <= 0 && this.ball.st.kind !== 'shot' && this.ball.st.kind !== 'loose') {
      const h = this.holder(); if (h) h.box.tov++;
      this.emit({ kind: 'violation', text: 'Shot clock violation', team: this.possession });
      if (h === this.user) applyTrust(this.trust, 'turnover');
      this.rhythmLoss(h, 'turnover');
      this.deadBall((1 - this.possession) as 0 | 1);
    }
    if (this.cfg.mode === 'game' && this.clock <= 0 && this.ball.st.kind !== 'shot') this.endPeriod();
  }

  private endPeriod() {
    const [a, b] = [this.teams[0].score, this.teams[1].score];
    this.emit({ kind: 'period', text: `End of ${this.quarter <= 4 ? 'Q' + this.quarter : 'OT'}`, big: true });
    if (this.quarter >= 4 && a !== b) { this.finish(); return; }
    this.quarter++;
    this.clock = this.quarter > 4 ? this.cfg.quarterLen / 2 : this.cfg.quarterLen;
    this.deadBall((this.quarter % 2 === 0 ? 1 : 0) as 0 | 1, 2.0, 'mid');
  }

  private finish() {
    this.over = true; this.live = false;
    const u = this.user;
    if (u) {
      const b = u.box;
      if (b.pts >= 50) this.milestones.push('fiftyBall');
      const dbl = [b.pts, b.reb, b.ast, b.stl, b.blk].filter((x) => x >= 10).length;
      if (dbl >= 3) this.milestones.push('tripleDouble');
      const won = this.teams[u.team].score > this.teams[1 - u.team].score;
      if (won && this.lastGoAhead?.pid === u.id && this.lastGoAhead.quarter >= 4 && this.lastGoAhead.clock < 5) this.milestones.push('gameWinner');
    }
    const nm = (i: 0 | 1) => (this.cfg.oneOnOne ? this.teams[i].onCourt[0].name : this.teams[i].def.name);
    this.emit({ kind: 'final', text: `FINAL ${nm(0)} ${this.teams[0].score} - ${this.teams[1].score} ${nm(1)}`, big: true });
  }

  // ---------- play calling & grading ----------
  private updatePlay(dt: number) {
    if (!this.live) return;
    const h = this.holder();
    const side = this.side(this.possession);
    if (this.cfg.mode === 'practice' && !this.cfg.practice?.runPlays) return;
    if (!this.runner.playId && h && h.team === this.possession) {
      const set = this.offense().filter((p) => inFrontcourt(side, p.p)).length;
      if (inFrontcourt(side, h.p) && set >= Math.min(4, this.offense().length)) this.callPlay();
      return;
    }
    const r = this.runner.tick(dt);
    if (r.advanced && r.prev) {
      this.gradeUserPhase(r.prev.roles);
      this.phaseStartedAt = this.time;
    }
    // the set ran out without a shot: swing it, re-space, call something else (unless the clock is short)
    const rn = this.runner;
    if (rn.done && rn.resetUntil === -1 && h && h.team === this.possession) {
      if (this.shotClock > 7) {
        rn.resetUntil = this.time + 1.2;
        this.emit({ kind: 'play', text: 'Coach: "Reset — swing it!"', team: this.possession });
      } else rn.resetUntil = -2;
    }
    if (rn.resetUntil > 0 && this.time >= rn.resetUntil) {
      if (this.shotClock > 6 && h && h.team === this.possession) this.callPlay();
      else rn.resetUntil = -2;
    }
  }

  private gradeUserPhase(roles: Record<string, PlayRole>) {
    const u = this.user;
    if (!u || !this.userOnCourt || u.team !== this.possession || !u.isUser) return;
    const a = roles[this.playRole(u)];
    if (!a) return;
    let ok: boolean;
    if (a.act === 'screen') ok = u.lastScreenAt >= this.phaseStartedAt;
    else if (a.act === 'handle' && this.holder() === u) ok = true;
    else ok = dist(u.p, this.assignmentPos(u, a)) < 5;
    if (ok) {
      this.grade.good++; this.grade.points += 1;
      applyTrust(this.trust, 'playExec');
      this.ranPlay = { team: u.team };
      this.emit({ kind: 'grade', text: `✓ Ran your ${a.act} (${this.runner.play?.name})`, good: true, pid: u.id });
    } else {
      this.grade.bad++; this.grade.points -= 1;
      applyTrust(this.trust, 'playMiss'); // round 53: no rhythm loss for a missed assignment
      this.emit({ kind: 'grade', text: `✗ Missed your ${a.act} assignment`, good: false, pid: u.id });
    }
  }

  /** Where a play assignment wants this player to be. */
  assignmentPos(p: Player, a: PlayRole): Vec {
    const side = this.side(p.team);
    if (a.to.startsWith('screen:')) {
      const target = this.byPlayRole(p.team, a.to.split(':')[1]);
      if (!target) return p.p;
      const d = this.defenderOf(target);
      const anchor = d ?? target;
      // set the screen on the side of the defender away from the rim the handler attacks
      const away = norm(sub(anchor.p, this.rim(p.team)));
      const lateral = norm(sub(p.p, anchor.p));
      return clampToCourt(add(anchor.p, scale(norm(add(scale(away, 0.4), lateral)), 2.0)));
    }
    return spot(side, a.to);
  }

  // ---------- AI ----------
  private think(p: Player, dt: number) {
    p.boxingOut = false;
    if (p.state === 'fallen' || p.state === 'shoot') return;
    if (this.time < p.stunnedUntil) { p.want = v(); return; } // rocked: no decisions until he shakes it off
    const bs = this.ball.st;
    if (bs.kind === 'loose' || (bs.kind === 'shot' && bs.t > bs.dur * 0.35)) { this.chaseBall(p); return; }
    if (!this.live) {
      if (this.inb) { this.thinkInbound(p); return; }
      p.target = { ...p.p }; this.steer(p, p.target, false); return;
    }
    if (p.team === this.possession) thinkOffense(this, p, dt);
    else thinkDefense(this, p, dt);
  }

  /**
   * Rebounding. While the shot is up (or on the rim): the shooting team's crashers go to the glass,
   * everyone else on that team gets back; defenders find a body and box out. Once it's loose, the
   * players near it (and the two closest per team) go get it.
   */
  private chaseBall(p: Player) {
    const bs = this.ball.st;
    const shooters = bs.kind === 'shot' ? bs.shooter.team : this.possession;
    const rim = this.rim(shooters);
    if (bs.kind === 'shot') {
      if (p.team === shooters) {
        if (p.crashing) {
          const ang = Math.atan2(p.p.y - rim.y, p.p.x - rim.x);
          this.steer(p, add(rim, v(Math.cos(ang) * 5, Math.sin(ang) * 5)), true);
        } else this.steer(p, hc(this.side(shooters), 62, (p.p.y - 25) * 0.5), false, 0.8);
        return;
      }
      // defense: seal the nearest crasher (or your man) between him and the rim
      const opps = this.opp(p.team);
      let tgt = opps.find((o) => o.id === p.guarding) ?? null;
      const crasher = opps.filter((o) => o.crashing && dist(o.p, rim) < 14).sort((a, b) => dist(a.p, p.p) - dist(b.p, p.p))[0];
      if (crasher && (!tgt || !tgt.crashing) && dist(crasher.p, p.p) < 8) tgt = crasher;
      if (tgt && dist(tgt.p, rim) < 18) {
        const pos = add(tgt.p, scale(norm(sub(rim, tgt.p)), 1.9));
        this.steer(p, pos, true);
        if (dist(p.p, pos) < 1.6) { p.boxingOut = true; p.face = norm(sub(tgt.p, p.p)); }
      } else this.steer(p, add(rim, scale(norm(sub(p.p, rim)), 6)), false);
      return;
    }
    const landing = this.ball.p;
    const mates = this.teams[p.team].onCourt.slice().sort((a, b) => dist(a.p, landing) - dist(b.p, landing));
    const rank = mates.indexOf(p);
    if (rank < 2 || dist(p.p, landing) < 9) {
      this.steer(p, landing, true);
      if (dist(p.p, this.ball.p) < 3 && this.ball.z > p.reach - 1 && p.z === 0 && this.rng.chance(0.08)) this.jump(p, 0.85);
      // a 50/50 ball on the floor with an opponent closing on it: hustle players dive
      const dd = dist(p.p, this.ball.p);
      if (this.diveable() && dd > 2.5 && dd < 6.5 && this.opp(p.team).some((o) => dist(o.p, this.ball.p) < dd + 1.5) && this.rng.chance(0.06 + p.mods.pMult('hustleBonus') * 0.03)) this.dive(p);
    } else {
      const back = hc(this.side(p.team), 40, 0);
      this.steer(p, lerpV(p.p, back, 0.15), false);
    }
  }

  /** Point the player's desired velocity at a target. */
  steer(p: Player, target: Vec, urgent: boolean, speedMult = 1) {
    p.target = target;
    const to = sub(target, p.p);
    const d = len(to);
    if (d < 0.35) { p.want = v(); return; }
    const hasBall = this.holder() === p;
    if (urgent && d > 20 && this.live) this.startBurst(p); // AI uses the same burst + cooldown rules (long sprints only)
    const max = (urgent || d > 6 ? this.topSpeed(p) : p.walkSpeed) * (hasBall ? p.ballSpeedMult : 1) * speedMult * (this.effort[p.team] ? 1.06 : 1);
    const sp = Math.min(max, d * 3.2);
    p.want = scale(norm(to), sp);
  }

  // ---------- user ----------
  private handleUser(u: Player, inp: UserInput, ux: GameSim['ux']) {
    if (this.inb?.inbounder === u) return; // walking it out of bounds is automatic
    const primary = u === this.user;
    if (primary) this.stick = inp.move; else this.stick2 = inp.move;
    postIntent(u, !!inp.postHeld, inp.move); // L2: post up (updatePost takes over the movement)
    if (this.time < u.stunnedUntil) { u.want = v(); if (primary) this.passTarget = null; return; } // rocked: wait it out
    const hasBall = this.holder() === u;
    const onO = u.team === this.possession;
    if (inp.sprint && this.live && !(hasBall && (u.post || inp.postHeld))) { // no sprinting out of a post
      if (!this.startBurst(u) && this.time - this.lastRechargeMsg > 1) { this.lastRechargeMsg = this.time; this.emit({ kind: 'sprint', text: `Sprint recharging… ${(u.burstCdUntil - this.time).toFixed(1)}s`, pid: u.id }); }
    }
    u.want = scale(inp.move, this.topSpeed(u) * (hasBall ? u.ballSpeedMult : 1));
    u.sprinting = this.time < u.burstUntil && len(inp.move) > 0.2;
    // dribble picked up after a pump fake: planted
    if (hasBall && u.deadDribble) u.want = v();
    // flick-cross: while side-driving (and just after), snapping the stick the other way crosses over, no button
    u.bHolding = hasBall && inp.bHeld && !u.deadDribble;
    if (hasBall && this.live && u.flickDir && this.time < u.flickUntil) {
      const lat = cross(norm(sub(this.rim(u.team), u.p)), inp.move);
      if (lat * u.flickDir < -0.6) this.flickCross(u, Math.sign(lat));
    }

    const passTarget = hasBall ? this.pickPassTarget(u, inp.move) : null;
    if (primary) this.passTarget = passTarget;
    // R1 icon pass: while held, each teammate wears a button; pressing it passes to him (no other actions)
    const iconList = hasBall && inp.iconHeld ? this.iconTargetsFor(u) : null;
    const icons = iconList && iconList.length ? iconList : null; // nobody to pass to (1v1): R1 does nothing
    if (primary) this.iconTargets = icons;
    if (!this.live) return;
    if (icons) {
      ux.aPending = false; ux.bWasHeld = false;
      const hit = icons.find((t) => inp[t.btn]);
      if (hit) { const m = this.players.find((q) => q.id === hit.pid); if (m) { this.pass(u, m); this.quiet('iconPass', { to: m.id }, u.id); } }
      return;
    }

    // round 55: □ = the ult; while it's active, □ again = its fake (step-back fake / hang-time stall), △ = pass out (Lv3)
    const myUlt = this.ult.active && this.ult.active.pid === u.id ? this.ult.active : null;
    if (inp.x) { if (myUlt) ultAction(this, u, 'fake'); else tryActivateUlt(this, u); }
    if (inp.y && myUlt?.level.passOut && ultAction(this, u, 'pass', passTarget)) { ux.yPending = false; ux.aPending = false; return; }
    const shotUp = this.ball.st.kind === 'shot';
    u.boxOutHeld = shotUp && inp.bHeld; // ○ held while a shot is in the air = box out (either side)
    u.boxingOut = u.boxOutHeld && u.z === 0;
    if (hasBall) {
      // ✕ again while going up for a dunk = Jelly Fake (owners)
      if (inp.a && this.jellyFake(u)) { ux.aPending = false; return; }
      // ✕: tap = pump fake (repeatable), hold past TAP_S = shoot
      if (inp.a) { ux.aDownAt = this.time; ux.aPending = true; }
      if (ux.aPending) {
        if (inp.aHeld && this.time - ux.aDownAt >= TAP_S) { ux.aPending = false; this.startShot(u, selectShotType(u, this.side(u.team), inp.move, this.time)); }
        else if (!inp.aHeld) { ux.aPending = false; this.pumpFake(u, inp.move); }
      }
      // △: tap = pass (on release), hold past TAP_S = lob (an alley-oop when he's heading to the rim)
      if (inp.y && passTarget && !ux.aPending) { ux.yDownAt = this.time; ux.yPending = true; }
      if (ux.yPending) {
        if (!passTarget) ux.yPending = false;
        else if (inp.yHeld && this.time - ux.yDownAt >= TAP_S) { ux.yPending = false; this.lobPass(u, passTarget); }
        else if (!inp.yHeld) { ux.yPending = false; this.pass(u, passTarget); }
      }
      // ○: press with the stick pushed = move now; hold ○ and drag = move per flick; quick neutral tap = jab step
      if (inp.b) {
        ux.bDownAt = this.time; ux.bMoved = false;
        if (len(inp.move) > 0.35) { this.dribbleMove(u, inp.move); ux.bMoved = true; ux.bNeedNeutral = true; } else ux.bNeedNeutral = false;
      } else if (inp.bHeld) {
        if (!ux.bNeedNeutral && len(inp.move) > 0.5) { this.dribbleMove(u, inp.move); ux.bMoved = true; ux.bNeedNeutral = true; }
        else if (ux.bNeedNeutral && len(inp.move) < 0.25) ux.bNeedNeutral = false;
      } else if (ux.bWasHeld && !ux.bMoved && this.time - ux.bDownAt < TAP_S) this.dribbleMove(u, v());
    } else {
      ux.aPending = false; ux.yPending = false;
      if (onO) {
        // a lob is coming down to you: ✕ = go up and get it (timing matters)
        const bsl = this.ball.st;
        if (inp.a && bsl.kind === 'pass' && bsl.oop && bsl.to === u) this.jump(u, 1);
        if (inp.y) { u.callForBallUntil = this.time + 1.4; this.emit({ kind: 'call', text: 'Calling for the ball…', pid: u.id }); }
        if (inp.b && !shotUp) this.setScreen(u);
        // hold ○ = keep screening until released (capped so a stuck button can't freeze you)
        if (inp.bHeld && u.state === 'screen') u.stateDur = Math.max(u.stateDur, Math.min(u.stateT + 0.15, SCREEN_HOLD_MAX));
        if (inp.a && this.ball.st.kind === 'loose') { if (this.diveable()) this.dive(u); else this.jump(u, 1); }
      } else {
        if (inp.a) { if (this.diveable()) this.dive(u); else this.jump(u, 1); } // loose on the floor: dive for it
        if (inp.y) this.swipe(u);
        if (inp.b && !shotUp) this.takeCharge(u);
        // hold ○ = stay set for the charge until released (like holding a screen)
        if (inp.bHeld && u.state === 'charge') u.stateDur = Math.max(u.stateDur, Math.min(u.stateT + 0.15, SCREEN_HOLD_MAX));
      }
    }
    ux.bWasHeld = inp.bHeld;
  }

  /** Per-user button timing state (tap vs hold). */
  ux = { aDownAt: 0, aPending: false, bDownAt: 0, bMoved: false, bNeedNeutral: false, bWasHeld: false, yDownAt: 0, yPending: false };
  ux2 = { aDownAt: 0, aPending: false, bDownAt: 0, bMoved: false, bNeedNeutral: false, bWasHeld: false, yDownAt: 0, yPending: false };

  /**
   * Pump fake: ball up, defenders may bite. Repeatable. It picks up the dribble once you've dribbled; a fake on the
   * catch (before the first dribble) keeps it, so you can still put it on the floor and attack the closeout.
   */
  pumpFake(p: Player, stick: Vec = v()) {
    if (this.holder() !== p || p.busy) return;
    // Dreamer: sell the shot that's lined up (hook / floater / layup fake); everyone else has the one pump fake
    const clip = p.mods.pAdd('dreamer') > 0 ? fakeClipFor(selectShotType(p, this.side(p.team), stick, this.time)) : 'pumpfake';
    if (!p.deadDribble && p.dribbledSinceCatch) { p.deadDribble = true; p.deadDribbleAt = this.time; p.deadWarned = false; }
    p.pumpFakeAt = this.time;
    p.anim = { name: clip, start: this.time, dur: PUMP_FAKE_S };
    p.state = 'dribbleMove'; p.stateT = 0; p.stateDur = PUMP_FAKE_S; p.moveVel = v(); p.move = { id: 'pumpfake', dir: v(), t: 0 };
    this.emit({ kind: 'move', text: FAKE_NAMES[clip] ?? 'Pump Fake', pid: p.id, data: { clip } });
    const sell = clip === 'pumpfake' ? 1 : p.mods.pMult('fakeBite'); // Dreamer fakes fool them more
    for (const def of this.opp(p.team)) {
      const dd = dist(def.p, p.p);
      if (dd > 6 || def.z > 0 || def.state === 'fallen' || postLocked(this, def) || this.time < def.stunnedUntil) continue;
      const ratio = (p.sub.ankleBreak + 20) / (def.sub.ankleResist + 20);
      const prox = clamp01(1 - (dd - 2) / 4);
      if (this.isAI(def) && this.rng.chance(Math.min(0.95, (0.22 + 0.3 * ratio * prox) * sell) * (def.lastBitAt && this.time - def.lastBitAt < 2 ? 0.4 : 1))) {
        def.lastBitAt = this.time; this.jump(def, 0.9);
        this.emit({ kind: 'move', text: `${def.name} bit on the pump fake`, pid: def.id });
      }
    }
  }

  /** Icon pass: teammates (by role) wearing ✕ ○ □ △. Shown while L2 is held. */
  iconTargets: { pid: string; btn: IconBtn }[] | null = null;
  iconTargetsFor(p: Player): { pid: string; btn: IconBtn }[] {
    return this.mates(p).slice().sort((a, b) => a.role.localeCompare(b.role)).slice(0, 4).map((m, i) => ({ pid: m.id, btn: ICON_ORDER[i] }));
  }

  pickPassTarget(from: Player, stick: Vec): Player | null {
    const dir = len(stick) > 0.3 ? norm(stick) : from.face;
    let best: Player | null = null, bs = -1e9;
    for (const m of this.mates(from)) {
      const rel = sub(m.p, from.p);
      const d = len(rel);
      const ang = Math.acos(clamp(dot(norm(rel), dir), -1, 1));
      const score = -ang * 3 - d * 0.02;
      if (score > bs) { bs = score; best = m; }
    }
    return best;
  }

  // ---------- actions (shared by user + AI) ----------
  startShot(p: Player, type: string, override?: { base?: number; label?: string; contestMult?: number }) {
    if (this.holder() !== p || p.busy) return;
    const def = SHOT_TYPES[type];
    const jumper = ['mid', 'three', 'deep3', 'fade', 'stepThroughJumper'].includes(type);
    const windMult = jumper ? p.mods.pMult('release') : p.mods.pMult('gather');
    if (p.move?.id === 'pumpfake') p.move = null; // a shot cuts the fake short
    p.state = 'shoot'; p.stateT = 0; p.stateDur = def.windup * windMult;
    // dunk style (unlocks with the Dunk rating: power when contested, flashy when open) and the Windmill Gather
    const speedToRim = dot(p.vel, norm(sub(this.rim(p.team), p.p)));
    const dunk = type === 'dunk' ? pickDunk(p, { contested: computeContest(p, this.opp(p.team), this.side(p.team), 'dunk', this.time).raw > 0.25, speedToRim, d: dist(p.p, this.rim(p.team)) }, this.rng)
      : type === 'alleyOop' ? pickOopDunk(p, this.rng) : null; // round 54: oops have their own slams
    const windmill = windmillGather(p, type, speedToRim);
    p.pendingShot = { type, override, dunk: dunk?.id, windmill };
    if (type === 'dunk') p.dunkStartAt = this.time;
    onPostShot(this, p, this.time + p.stateDur); // out of the post: the defender stays locked / sealed through the release
    p.anim = { name: (dunk ? dunk.clip : `shot_${type}`) + (windmill ? '_wm' : ''), start: this.time, release: this.time + p.stateDur };
    this.quiet('gather', { type }, p.id);
    const rim = this.rim(p.team);
    const d = dist(p.p, rim);
    if (def.contact || type === 'floater' || type === 'stepThrough') {
      const travel = Math.max(0, d - (type === 'dunk' ? 1.2 : type === 'floater' ? d * 0.6 : 2.5));
      p.vel = scale(norm(sub(rim, p.p)), Math.min(type === 'stepThrough' ? 9 : 16, travel / Math.max(0.1, p.stateDur)));
      if (type === 'euro') p.vel = add(p.vel, scale({ x: -p.vel.y, y: p.vel.x }, 0.35 * (this.rng.chance(0.5) ? 1 : -1)));
    } else if (type === 'fade') {
      p.vel = scale(norm(sub(p.p, rim)), FADE_DRIFT); // fade away: drift back from the rim through the shot
    } else {
      p.vel = scale(p.vel, 0.25);
    }
    const oop = type === 'alleyOop' || type === 'alleyOopLayup';
    if (oop) { p.vz = Math.max(p.vz, 1.5); p.vel = scale(p.vel, 0.5); } // caught in the air: finish on the way down
    else p.vz = type === 'dunk' ? p.jumpVel * 0.95 : jumper ? 8 : 9.5;
    p.face = norm(sub(rim, p.p));
    if (isStepThrough(type)) this.stepThrough(p, rim, d, jumper ? 8 : 9.5);
    // defenders react
    for (const d2 of this.opp(p.team)) {
      if (this.isAI(d2) && dist(d2.p, p.p) < 7.5 && d2.z === 0 && !d2.busy && !postLocked(this, d2)) {
        d2.jumpAt = this.time + this.rng.range(0.1, 0.28) * (1.4 - d2.sub.block / 99 * 0.6);
      }
    }
  }

  /**
   * Step-Through: one long grounded stride past the defender (angled away from his side), then lift off.
   * A defender who jumped on the fake can't contest or block it.
   */
  private stepThrough(p: Player, rim: Vec, d: number, liftVz: number) {
    const toRim = norm(sub(rim, p.p));
    const nd = this.nearestDefender(p);
    let dir = toRim;
    if (nd.d && nd.dist < 7) {
      const lat = cross(toRim, sub(nd.d.p, p.p));
      // angle to the open side: enough to clear his body (~2.4 ft), 20°-50°
      const a = (lat >= 0 ? -1 : 1) * clamp(Math.asin(Math.min(0.95, 2.4 / Math.max(1, nd.dist))), 0.35, 0.87);
      dir = { x: toRim.x * Math.cos(a) - toRim.y * Math.sin(a), y: toRim.x * Math.sin(a) + toRim.y * Math.cos(a) };
    }
    const strideT = Math.max(0.1, p.stateDur * STEP_LIFT);
    const stride = Math.min(stepStride(p), Math.max(1, d - 2.5));
    p.vel = scale(dir, stride / strideT / 0.9); // /0.9: shoot-state drag over the stride
    p.vz = 0; p.liftAt = this.time + strideT; p.liftVz = liftVz;
    const bit = this.opp(p.team).find((q) => bitOnFake(q, p, this.time));
    if (bit) this.emit({ kind: 'move', text: `STEP-THROUGH! ${bit.name} bit`, pid: p.id, big: true, good: true });
    else this.emit({ kind: 'move', text: 'Step-Through', pid: p.id });
  }

  private releaseShot(p: Player) {
    const ps = p.pendingShot!;
    p.pendingShot = null;
    p.deadDribble = false;
    p.state = 'idle';
    const side = this.side(p.team);
    const ev = evaluateShot(p, this.opp(p.team), side, ps.type, { now: this.time, clutch: this.clutch, override: ps.override, dunk: ps.dunk, windmill: ps.windmill, oopTiming: ps.oopTiming });
    const rim = this.rim(p.team);
    if (p.anim) p.anim.release = this.time;
    this.quiet('release', { type: ps.type }, p.id);

    // blocks
    for (const d of this.cfg.story?.noBlocks ? [] : this.opp(p.team)) {
      if (d.z < 0.6 || d.state === 'fallen' || postLocked(this, d)) continue;
      if (isStepThrough(ps.type) && bitOnFake(d, p, this.time)) continue; // still coming down from the fake
      const dd = dist(d.p, p.p);
      if (dd > 4.8) continue;
      const toRim = norm(sub(rim, p.p));
      const along = dot(norm(sub(d.p, p.p)), toRim);
      const chase = this.ult.active?.id === 'chaseDown' && this.ult.active.pid === d.id;
      let posF = along > 0.4 ? 1 : along > -0.2 ? 0.55 : 0.1;
      const close = !['mid', 'three', 'deep3', 'fade'].includes(ps.type);
      let chance = (0.04 + 0.2 * d.sub.block / 99) * posF * d.mods.pMult('blockMult') * (close ? 1 : 0.4) * clamp(0.8 + (d.height - p.height) * 0.4, 0.5, 1.4);
      if (ps.type === 'dunk') chance *= [0.6, 0.6, 0.8, 1][Math.min(3, crowdAt('dunk', ev.contestBy))]; // a dunk into a crowd gets blocked like any finish (round 48)
      if (ps.windmill) chance *= WINDMILL_BLOCK; // the ball swung away from him
      if (ps.override?.contestMult !== undefined) chance *= ps.override.contestMult;
      if (chase) chance = Math.max(chance, this.ult.active!.level.blockChance); // round 55: from any angle, almost no matter what
      if (this.rng.chance(chance)) {
        d.box.blk++; p.box.fga++; this.heatAfterShot(p, false, ev);
        if (ev.pts === 3) p.box.tpa++;
        this.lastShot = { ev, made: false, name: p.name, user: p === this.user, blocked: true, at: this.time };
        this.emit({ kind: 'block', text: `${chase ? 'CHASE-DOWN! ' : ''}BLOCKED by ${d.name}!`, team: d.team, pid: d.id, big: true });
        this.rhythmGain(d, 'block'); this.rhythmLoss(p, 'blocked');
        if (d === this.user) applyTrust(this.trust, 'stop');
        if (chase && this.ult.active!.level.keepPossession) {
          const go = !!this.ult.active!.level.swatAndGo;
          this.giveBall(d); this.changePossessionLive(d.team);
          if (go) {
            // Swat & Go: grab it and run — the break is on, and his next finish is boosted
            this.transitionUntil = Math.max(this.transitionUntil, this.time + 5);
            d.mods.removeHooks('swatGo');
            d.mods.addHook('shot', 'swatGo', (c) => (['layup', 'dunk', 'euro', 'floater', 'alleyOop', 'alleyOopLayup', 'push'].includes(c.type) ? { label: 'ULT Swat & Go', mult: 1.2 } : null), this.time + 6);
            this.emit({ kind: 'move', text: 'SWAT & GO!', pid: d.id, big: true });
          } else this.emit({ kind: 'move', text: 'Pinned to the glass!', pid: d.id });
        } else {
          // swatted: the ball sails away hard and high, nobody can touch it for a moment, the shooter is rocked
          const away = norm(add(norm(sub(p.p, d.p)), v(this.rng.range(-0.6, 0.6), this.rng.range(-0.6, 0.6))));
          this.ball.st = { kind: 'loose', vel: scale(away, this.rng.range(20, 26)), vz: this.rng.range(9, 12), lastTeam: d.team, noGrabUntil: this.time + 0.7, noGrabPid: p.id, noGrabPidUntil: this.time + 1.0 };
          this.ball.z = p.z + p.height + 1;
          this.stun(p, 1.0, 'blockedLand');
        }
        if (chase) this.ult.active = null;
        return;
      }
    }

    const def = SHOT_TYPES[ps.type];
    const foul = (!!def.contact || ps.type === 'floater') && ev.contest > 0.3 && this.rng.chance(0.06 + 0.16 * ev.contest) && !this.cfg.story?.noFouls;
    const roll = this.rng.next(); // rolled either way, so a forced make doesn't change the rest of the game's RNG
    const made = !!this.cfg.story?.forceMake || roll < ev.pct;
    const d = ev.dist;
    const dur = ps.type === 'dunk' ? 0.16 : 0.6 + d * 0.03; // slower flight = more time to fight for rebounding position
    const jumper = ['mid', 'three', 'deep3', 'stepThroughJumper'].includes(ps.type);
    // bad enough shots can airball (never touches iron)
    const bad = (ev.pct < 0.25 && ev.contest > 0.4) || d > 30;
    const airball = !made && !foul && bad && ps.type !== 'dunk' && this.rng.chance(0.1 + Math.max(0, 0.25 - ev.pct) * 0.8);
    const z0 = p.z + p.height + 0.8;
    if (ps.type === 'dunk') {
      // dunks are thrown down through the rim: short scripted path
      const rimPath = buildPath(made ? 'kissIn' : this.rng.pick(['frontRim', 'backIron'] as const), this.rng);
      this.ball.st = { kind: 'shot', shooter: p, a: { ...this.ball.p }, z0, t: 0, dur, made, pts: ev.pts, ev, foul, rim: rimPath, rimT: 0, rimKey: 0, airball: false };
    } else {
      // everything else is a real physical shot that produces the decided result (see ballPhysics.ts)
      const plan = planShot({ release: { x: this.ball.p.x, y: this.ball.p.y, z: z0 }, hoop: { x: rim.x, y: rim.y, dir: side }, type: ps.type, made, airball, dist: d, contest: ev.contest }, this.rng);
      const first = plan.contacts[0]?.t ?? plan.end.t;
      this.ball.st = { kind: 'shot', shooter: p, a: { ...this.ball.p }, z0, t: 0, dur: first, made, pts: ev.pts, ev, foul, airball: plan.airball, plan, ci: 0 };
    }
    void jumper;
    // decide who crashes the offensive glass on this shot
    for (const m of this.teams[p.team].onCourt) {
      const crashP = (m.role === '5' ? 0.95 : m.role === '4' ? (m.sub.three < 65 ? 0.85 : 0.2) : m.sub.finishing > m.sub.three + 8 ? 0.2 : 0.05) + (this.effort[m.team] ? 0.2 : 0);
      m.crashing = m !== p && this.rng.chance(crashP);
    }
    this.lastShot = { ev, made, name: p.name, user: p === this.user, at: this.time };
    p.box.usage++;
    if (p === this.user && !this.cfg.oneOnOne) {
      if (ev.pct < 0.28 && ev.contest > 0.3 && this.shotClock > 4) { applyTrust(this.trust, 'badShot'); this.rhythmLoss(p, 'badShot'); this.emit({ kind: 'grade', text: '✗ Forced a bad shot', good: false, pid: p.id }); }
      else if (ev.pct >= 0.45 || ev.conds.has('open')) applyTrust(this.trust, 'goodShot');
    }
  }

  /**
   * Where a pass from -> to would go and whether it's within the passer's safe range. Long balls to a teammate running
   * the floor (in transition, or cutting to the rim with space) go overhead: led further, safe range x1.35.
   */
  passSafety(from: Player, to: Player): { lead: Vec; d: number; safe: number; overhead: boolean; ok: boolean } {
    const toRim = norm(sub(this.rim(to.team), to.p));
    const raw = dist(from.p, to.p);
    const running = dot(to.vel, toRim) > 8;
    const overhead = raw > 18 && (this.inTransition(from.team) || (running && this.openness(to) > 0.35));
    const lead = clampToCourt(add(to.p, scale(to.vel, overhead ? Math.min(1.2, raw / from.passSpeed * 0.9 + 0.2) : 0.35)));
    const d = dist(from.p, lead);
    const safe = from.safePassDist * (overhead ? 1.35 : 1);
    return { lead, d, safe, overhead, ok: d <= safe };
  }

  /** Is this teammate a good alley-oop target (heading to the rim, landing spot in lob range)? */
  lobTarget(from: Player, to: Player): boolean {
    const rim = this.rim(from.team);
    const dRim = dist(to.p, rim), toRim = norm(sub(rim, to.p));
    const range = from.mods.pAdd('lob') > 0 ? OOP_RANGE_LOBCITY : OOP_RANGE;
    return dRim < 18 && (dot(to.vel, toRim) > 4 || dRim < 8) && dist(from.p, rim) < range + OOP_SPOT_R && to.state !== 'fallen' && to.state !== 'screen';
  }

  /**
   * Hold △: a lob. To a teammate heading to the rim it's an alley-oop: it comes down at rim height just in front of the
   * rim on his line, for him to catch in the air (accuracy from the lob rating; Lob City tighter, longer, harder to
   * tip). Otherwise it's a high, soft pass he catches on the floor.
   */
  lobPass(from: Player, to: Player) {
    if (this.holder() !== from || from.busy) return;
    if (!this.lobTarget(from, to)) {
      this.pass(from, to);
      const st = this.ball.st;
      if (st.kind === 'pass') { st.lob = true; st.magnet = false; st.dur *= 1.35; }
      return;
    }
    const rim = this.rim(from.team), lobCity = from.mods.pAdd('lob') > 0;
    const lead = add(to.p, scale(to.vel, 0.6));
    const dl = dist(lead, rim);
    let spot = dl > OOP_SPOT_R ? add(rim, scale(norm(sub(lead, rim)), OOP_SPOT_R)) : lead;
    const d = dist(from.p, spot);
    // accuracy: the lob rating, Lob City, and the length of the throw
    const err = rmap(from.sub.lob, 2.6, 0.6) * (lobCity ? 0.6 : 1) * (1 + Math.max(0, d - 20) / 30);
    const ang = this.rng.next() * Math.PI * 2, mag = err * Math.sqrt(this.rng.next());
    spot = clampToCourt(add(spot, v(Math.cos(ang) * mag, Math.sin(ang) * mag)));
    const dur = 0.55 + d / (from.passSpeed * 0.6);
    this.ball.st = { kind: 'pass', from, to, a: { ...this.ball.p }, b: spot, t: 0, dur, lob: true, risky: false, checked: new Set(), riskMult: lobCity ? 0.6 : 1, oop: { z0: Math.max(4.5, this.ball.z), catchZ: OOP_CATCH_Z } };
    this.lastPasser = from; this.lastPassAt = this.time; this.lastLobAt = this.time;
    from.deadDribble = false;
    from.state = from.state === 'dribbleMove' ? from.state : 'idle';
    from.face = norm(sub(spot, from.p));
    this.quiet('pass', { lob: true, dist: d }, from.id);
    this.emit({ kind: 'move', text: 'Lob!', pid: from.id });
    // a lob set, and you threw it to the lob man: that's running the play
    const ph = this.runner.cur;
    if (ph?.lob && this.playRole(to) === ph.lob) {
      this.runner.lobPhase = this.runner.phase;
      if (from === this.user && from.isUser) {
        this.grade.good++; this.grade.points += 1;
        applyTrust(this.trust, 'playExec');
        this.emit({ kind: 'grade', text: `✓ Threw the lob (${this.runner.play?.name})`, good: true, pid: from.id });
      }
    }
    // the AI receiver times his leap so his apex meets it (better leapers time it better); rim protectors go up too
    const arrive = this.time + dur;
    if (this.isAI(to)) {
      const tApex = (to.jumpVel * 0.9) / 32;
      to.jumpAt = Math.max(this.time + 0.05, arrive - tApex + this.rng.range(-1, 1) * 0.14 * (1.2 - to.sub.jump / 99));
      to.blockCdUntil = 0;
    }
    for (const o of this.opp(from.team)) {
      if (this.isAI(o) && dist(o.p, spot) < 4.5 && o.z === 0 && !o.busy) o.jumpAt = arrive - (o.jumpVel * 0.9) / 32 + this.rng.range(0, 0.15);
    }
  }
  lastLobAt = -9;

  /** The lob arrives: catch it in the air = alley-oop (dunk if he can, else a layup off the glass). */
  private oopArrive(st: Extract<BallState, { kind: 'pass' }>) {
    const to = st.to, b = this.ball;
    const r = 3.0 + to.mods.pAdd('oopCatch'); // catch window (Lob Threat widens it)
    const near = dist(to.p, b.p) < r && to.state !== 'fallen';
    if (near && to.z > 1.5) {
      // timing: catching it at the top of the leap is clean; on the way up or down it's harder
      const q = clamp01(1 - Math.abs(to.vz) / Math.max(1, to.jumpVel * 0.9));
      this.giveBall(to);
      this.assistCand = { passer: st.from, receiver: to, at: this.time };
      to.state = 'idle';
      this.startShot(to, canOopDunk(to) ? 'alleyOop' : 'alleyOopLayup');
      if (to.pendingShot) to.pendingShot.oopTiming = 0.65 + 0.35 * q; // round 54: timing matters more
      this.emit({ kind: 'move', text: 'Alley-oop!', pid: to.id, big: true });
      return;
    }
    if (dist(to.p, b.p) < 3.5 && to.state !== 'fallen') {
      // caught it on the way down (no leap): a normal catch under the rim
      this.giveBall(to);
      this.quiet('catch', {}, to.id);
      this.assistCand = { passer: st.from, receiver: to, at: this.time };
      return;
    }
    // overthrown / nobody there: it comes down loose by the rim
    b.st = { kind: 'loose', vel: scale(norm(sub(st.b, st.a)), 4), vz: -2, lastTeam: st.from.team };
  }

  pass(from: Player, to: Player, force = false) {
    if (this.holder() !== from || (from.busy && !force)) return; // force: an ult kick-out (mid-air)
    const ps = this.passSafety(from, to);
    const { lead, d, safe, overhead } = ps;
    const driving = len(from.vel) > 9 || from.state === 'dribbleMove';
    const speed = from.passSpeed * (driving ? from.mods.pMult('drivePass') : 1);
    const lob = from.mods.pAdd('lob') > 0 && dist(lead, this.rim(from.team)) < 10 && len(to.vel) > 4;
    const dur = (d / speed) * (lob ? 1.6 : overhead ? 1.15 : 1) + 0.06;
    const magnet = !lob && !overhead && d <= safe * 0.6;
    const riskMult = magnet ? 0.15 : d <= safe ? (overhead ? 0.5 : 0.6) : 1.8 + (d - safe) / 20;
    this.ball.st = { kind: 'pass', from, to, a: { ...this.ball.p }, b: lead, t: 0, dur, lob, risky: d > safe, checked: new Set(), magnet, riskMult, overhead };
    this.lastPasser = from; this.lastPassAt = this.time;
    if (from.post || this.time < from.postWindowUntil) this.lastPostPassAt = this.time; // kicked out of the post: its own animation
    from.deadDribble = false;
    this.quiet('pass', { lob, dist: d }, from.id);
    from.state = from.state === 'dribbleMove' ? from.state : 'idle';
    from.face = norm(sub(lead, from.p));
  }

  /** Tap sprint: a timed speed burst, then a cooldown. Returns false while recharging. */
  startBurst(p: Player): boolean {
    if (this.time < p.burstCdUntil || p.stamina < 0.05) return false;
    p.burstUntil = this.time + p.burstDur;
    p.burstCdUntil = p.burstUntil + p.burstCd;
    p.burstStartAt = this.time;
    this.quiet('burst', {}, p.id);
    return true;
  }
  /** Top speed now: the sprint burst gives half its gain with the ball (handlers are slower than cutters / defenders). */
  topSpeed(p: Player, hasBall = this.holder() === p) {
    if (this.time >= p.burstUntil) return p.runSpeed;
    return hasBall ? p.runSpeed + (p.burstSpeed - p.runSpeed) * BALL_BURST : p.burstSpeed;
  }
  lastRechargeMsg = -9;

  /** Crossover fired by flicking the stick across the hoop line, the other way, during a side drive. side = the new side (±1). */
  flickCross(p: Player, side: number) {
    p.flickDir = 0;
    const toRim = norm(sub(this.rim(p.team), p.p));
    const pr = perp(toRim);
    if (p.state === 'dribbleMove' && p.move) { p.lastMove = { id: p.move.id, endAt: this.time, dir: p.move.dir }; p.move = null; p.state = 'idle'; }
    p.vel = scale(pr, -side * Math.max(5, Math.abs(cross(toRim, p.vel)))); // still moving the old way, so the stick reads as a change of direction
    this.dribbleMove(p, scale(pr, side));
  }
  lastUserMove: { id: string; dir: Vec; at: number } | null = null;

  dribbleMove(p: Player, stick: Vec) {
    if (this.holder() !== p || p.busy) return;
    if (p.deadDribble) {
      if (!p.deadWarned) { p.deadWarned = true; this.emit({ kind: 'dead', text: 'Dribble picked up — pass or shoot', pid: p.id }); }
      return;
    }
    // input buffer: pressing during a move queues the next one (makes chains feel responsive)
    if (p.state === 'dribbleMove') { p.bufferedMove = { stick: { ...stick }, at: this.time }; return; }
    const rim = this.rim(p.team);
    const toRim = norm(sub(rim, p.p));
    const nd = this.nearestDefender(p);
    const id = resolveMove(p, stick, toRim, this.time, nd.dist);
    const m = MOVES[id];
    const dir = moveDirection(id, p, stick, toRim, nd.d?.p ?? null);
    const isCross = id === 'crossover' || id === 'doubleCross';
    // fixed distance: plant during the sell, then cover `dist` in the burst. Perks/ratings make the burst quicker, not longer.
    const plantAt = m.plantAt ?? 0.3;
    const quick = (dot(dir, toRim) > 0.5 ? p.mods.pMult('firstStep') : 1) * (isCross ? p.mods.pMult('crossBurst') : 1) * (0.85 + 0.3 * (p.sub.ballSpeed / 99));
    const burstT = Math.max(0.1, (m.dur * (1 - plantAt)) / quick);
    p.state = 'dribbleMove'; p.stateT = 0; p.stateDur = m.dur * plantAt + burstT;
    p.anim = { name: `move_${id}`, start: this.time, dur: p.stateDur };
    if (p === this.user) this.lastUserMove = { id, dir, at: this.time };
    p.move = { id, dir, t: 0 };
    p.dribbledSinceCatch = true;
    p.moveVel = scale(dir, (m.dist ?? m.burst * m.dur * 0.6) / burstT);
    p.movePlantAt = (m.dur * plantAt) / p.stateDur; p.movePlanted = false;
    if (m.pumpFake) { p.pumpFakeAt = this.time; p.deadDribble = true; p.deadDribbleAt = this.time; p.deadWarned = false; }
    if (id === 'lateral') { p.flickDir = sideOf(toRim, dir) || 0; p.flickUntil = this.time + p.stateDur + 0.3; } else p.flickDir = 0;
    if (m.openShot) { p.openShotUntil = this.time + 1.0; p.openShotMult = 1 - m.openShot * 0.6; }
    this.emit({ kind: 'move', text: m.name, pid: p.id });

    // round 49: the defense learns a human's moves — the same move again and again works less, and they shade his side
    const human = !this.isAI(p) && !this.attentionOff;
    const read = human ? this.moveRead(p, id) : 1;
    if (human) {
      const log = (this.moveLog[p.id] ??= []);
      log.push({ id, side: sideOf(toRim, dir), at: this.time }); if (log.length > 30) log.shift();
      if (read < 0.8 && this.time - (this.readSaid[id] ?? -99) > 20) { this.readSaid[id] = this.time; this.emit({ kind: 'read', text: `They're reading your ${m.name}`, pid: p.id, team: (1 - p.team) as 0 | 1 }); }
    }
    // ankle check vs the closest defender
    if (nd.d && nd.dist < 5.5 && nd.d.state !== 'fallen') {
      const def = nd.d;
      const prox = clamp01(1 - (nd.dist - 2) / 3.5);
      const ratio = Math.pow((p.sub.ankleBreak + 20) / (def.sub.ankleResist + 20), 2);
      const chance = m.ankle * p.mods.pMult('ankleMult') * (isCross ? p.mods.pMult('crossAnkle') : 1) * ratio * prox * read;
      if (m.pumpFake) {
        if (this.rng.chance(0.25 + 0.3 * ratio * prox)) { this.jump(def, 0.9); this.emit({ kind: 'move', text: `${def.name} bit on the pump fake`, pid: def.id }); }
      } else if (this.rng.chance(chance)) {
        this.knockDown(def, 1.3, 'ankles');
        this.emit({ kind: 'ankles', text: `ANKLES! ${def.name} hits the floor`, big: true, pid: p.id, team: p.team });
        this.rhythmLoss(def, 'ankles');
      } else {
        def.staggerUntil = this.time + m.stagger * clamp(ratio, 0.5, 1.8) * prox * read;
      }
    }
  }

  setScreen(p: Player) {
    if (p.busy || this.time < p.screenCdUntil || this.holder() === p) return;
    // AI screens hold 1.6 s; the user's screen lasts while ○ is held (see handleUser), at least 1.1 s
    p.state = 'screen'; p.stateT = 0; p.stateDur = p.isUser ? 1.1 : 1.6; p.want = v(); p.vel = v();
    p.screenCdUntil = this.time + 1.6 * p.mods.pMult('screenCd');
    p.screenHit = false;
  }

  /** Jelly Fake possible right now? Owner, mid-dunk, before the release, not already jellied. */
  canJelly(p: Player): boolean {
    return p.state === 'shoot' && p.pendingShot?.type === 'dunk' && p.stateT < p.stateDur && p.mods.pAdd('jelly') > 0;
  }

  /**
   * Jelly Fake (Finishing ability): abort the dunk in the air, hang, and flick a jelly layup JELLY_HANG later. Shot
   * blockers who jumped at the dunk come down first (no block, contest x0.3); the jelly itself is a hard shot.
   */
  jellyFake(p: Player): boolean {
    if (!this.canJelly(p)) return false;
    const ps = p.pendingShot!;
    p.pendingShot = { type: 'jelly', override: ps.override };
    p.stateDur += JELLY_HANG;
    const release = this.time + (p.stateDur - p.stateT);
    p.anim = { name: 'shot_jelly', start: this.time, release };
    p.hangUntil = release;
    p.vz = Math.max(p.vz, 3); // keep rising a touch, then float
    p.vel = scale(p.vel, 0.6); // drift under the rim
    this.quiet('jelly', {}, p.id);
    this.emit({ kind: 'move', text: 'Jelly Fake!', pid: p.id });
    return true;
  }

  /** Is the ball loose and on (or just off) the floor? Then ✕ is a dive. */
  diveable(): boolean { return this.live && this.ball.st.kind === 'loose' && this.ball.z < DIVE_BALL_Z; }

  /** Dive on the floor for a loose ball: launch toward where it's going, slide, get up. Reaches further for it. */
  dive(p: Player) {
    if (p.busy || p.z > 0) return;
    const st = this.ball.st;
    const lead = st.kind === 'loose' ? scale(st.vel, 0.15) : v();
    const dir = norm(sub(add(this.ball.p, lead), p.p));
    p.state = 'dive'; p.stateT = 0; p.stateDur = DIVE_S;
    p.vel = scale(dir, Math.max(DIVE_SPEED, len(p.vel)));
    p.face = dir; p.move = null; p.jumpAt = 0;
    p.anim = { name: 'dive', start: this.time, dur: DIVE_S };
    this.quiet('dive', {}, p.id);
    this.emit({ kind: 'move', text: 'Dive!', pid: p.id });
  }

  jump(p: Player, power: number) {
    if (p.z > 0 || p.busy) return;
    if (this.time < p.blockCdUntil) return;
    p.vz = p.jumpVel * power; p.state = 'jump'; p.lastJumpAt = this.time;
    p.blockCdUntil = this.time + 0.9;
  }

  /** Rocked by a block or a strip: no actions, barely moving, plays a recoil animation. */
  stun(p: Player, secs: number, anim: 'stripped' | 'blockedLand' | 'postBumpedBack') {
    p.stunnedUntil = this.time + secs;
    p.anim = { name: anim, start: this.time, dur: secs };
    p.deadDribble = false; p.move = null; p.bufferedMove = null;
    if (p.state === 'dribbleMove' || p.state === 'jump') p.state = 'idle';
    if (p === this.user) this.ux.aPending = false; else if (p === this.user2) this.ux2.aPending = false;
  }

  swipe(p: Player) {
    if (this.time < p.swipeCdUntil || p.busy) return;
    if (this.cfg.story?.softD && this.isAI(p)) return; // round 60 tutorial: CPU defenders don't reach
    p.swipeCdUntil = this.time + 0.8;
    p.swipingUntil = this.time + 0.3;
    const h = this.holder();
    if (!h || h.team === p.team) return;
    const dd = dist(h.p, p.p);
    if (dd > 4) return;
    // backing down exposes the ball (round 44): swipes on a post are likelier, and even the man on your back can reach in
    const posting = !!h.post;
    const front = posting ? (h.post!.defId === p.id ? 0.8 : 1) : dot(norm(sub(p.p, h.p)), h.face) > -0.2 ? 1 : 0.4;
    const security = 0.6 + (h.sub.ballSpeed / 99) * 0.6;
    const windmill = h.state === 'shoot' && !!h.pendingShot?.windmill; // Windmill Gather: the ball is swung away, no strip
    const chance = windmill ? 0 : (0.06 + 0.16 * p.sub.steal / 99) * p.mods.pMult('stealChance') * front / security * (h.state === 'dribbleMove' ? 1.4 : 1) * (posting ? POST.STEAL_MULT : 1);
    if (this.rng.chance(chance)) {
      p.box.stl++; h.box.tov++;
      this.emit({ kind: 'steal', text: `STEAL by ${p.name}!`, team: p.team, pid: p.id, big: true });
      this.rhythmGain(p, 'steal', p.mods.pMult('hustleBonus')); this.rhythmLoss(h, 'turnover');
      if (p === this.user) applyTrust(this.trust, 'stop', p.mods.pMult('hustleBonus'));
      if (h === this.user) applyTrust(this.trust, 'turnover');
      // stripped: the ball pops out past the stealer; the ball handler is left spinning
      const pop = norm(add(norm(sub(p.p, h.p)), v(this.rng.range(-0.3, 0.3), this.rng.range(-0.3, 0.3))));
      this.ball.st = { kind: 'loose', vel: scale(pop, this.rng.range(10, 13)), vz: 3, lastTeam: p.team, noGrabUntil: this.time + 0.25, noGrabPid: h.id, noGrabPidUntil: this.time + 1.0 };
      this.stun(h, 0.8, 'stripped');
    } else if (this.rng.chance(0.05)) {
      this.emit({ kind: 'foul', text: `Reach-in foul on ${p.name}`, team: p.team });
      this.shotClock = Math.max(this.shotClock, 14);
      this.deadBall(h.team, 1.0);
    } else if (p.mods.pAdd('killDribble') > 0 && this.liveDribble(h) && this.rng.chance(this.pickUpChance(p, h) * front)) {
      // Pick-Up Pressure (round 50): no steal, but he's so tight the dribbler has to pick it up — pass or shoot
      h.deadDribble = true; h.deadDribbleAt = this.time; h.deadWarned = true;
      if (h.state === 'dribbleMove') { h.state = 'idle'; h.move = null; h.bufferedMove = null; }
      h.flickDir = 0;
      this.emit({ kind: 'pickup', text: `${p.name} kills the dribble — ${h.name} has to pick it up`, team: p.team, pid: p.id, big: p === this.user || h === this.user, good: p.team === this.user?.team });
      if (p === this.user) applyTrust(this.trust, 'stop', 0.5);
      this.rhythmGain(p, 'pickup');
    }
  }

  /** Round 50: is he still dribbling (so Pick-Up Pressure can kill it)? Not already picked up, shooting or posting. */
  liveDribble(h: Player): boolean { return !h.deadDribble && h.state !== 'shoot' && !h.pendingShot && !h.post; }
  /** Pick-Up Pressure: the separate chance (after a missed swipe) that the dribbler has to pick it up. */
  pickUpChance(p: Player, h: Player): number {
    const security = 0.6 + (h.sub.ballSpeed / 99) * 0.6; // 0.6 (shaky) … 1.2 (elite handle)
    return clamp((0.12 + 0.3 * p.sub.perimD / 99) / security * (h.state === 'dribbleMove' ? 0.7 : 1), 0, 0.5);
  }

  takeCharge(p: Player) {
    if (p.busy || p.z > 0) return;
    if (this.cfg.story?.softD && this.isAI(p)) return;
    p.state = 'charge'; p.stateT = 0; p.stateDur = 0.9; p.chargeSetAt = this.time; p.want = v(); p.vel = v();
  }

  /** Put a player on the floor (ankle break, charge, screen, poster). */
  knockDown(p: Player, dur: number, how: string) {
    p.state = 'fallen'; p.stateT = 0; p.stateDur = dur;
    p.anim = { name: how === 'ankles' ? 'ankleFall' : 'fall', start: this.time, dur };
  }

  /** Audio/animation-only event. */
  quiet(kind: string, data: Record<string, any> = {}, pid?: string) { this.emit({ kind, text: '', quiet: true, data, pid }); }

  /**
   * Round 51: rhythm for any player (gains scale with the game length so a strong night fills it around the 4th
   * quarter; losses too; round 53: gains × the quarter multiplier). Crossing a notch re-applies the stat boost; your changes pop on the HUD meter.
   */
  addRhythm(p: Player | null | undefined, amount: number, why = '', math = '', extra: Record<string, unknown> = {}) {
    if (!p || !amount) return;
    const before = notchOf(p.rhythm);
    // round 53: gains also grow each quarter (hidden from the pops' math)
    const applied = amount * gainScale(this.cfg.quarterLen) * (amount > 0 && why !== 'dev' ? quarterGain(this.quarter, this.cfg.mode === 'practice') : 1);
    p.rhythm = Math.max(0, Math.min(100, p.rhythm + applied));
    const after = notchOf(p.rhythm);
    if (after !== before) {
      p.boost = rhythmBoost(p.core, after); p.recompute();
      if (after > before) this.emit({ kind: 'rhythm', text: `RHYTHM ${after} — ${p.name} ${['', 'is warming up', 'is heating up', 'is on fire'][after]}`, pid: p.id, team: p.team, quiet: !this.isHuman(p), data: { notch: after } });
    }
    if (p.rhythm >= 100 && amount > 0 && !this.ultsUsed[p.id] && this.ultOf(p) && !this.rhythmReadySaid[p.id]) {
      this.rhythmReadySaid[p.id] = true;
      this.emit({ kind: 'rhythm', text: this.isHuman(p) ? 'RHYTHM MAXED — ultimate ready (□)' : `${p.name} is in full rhythm`, pid: p.id, team: p.team, big: this.isHuman(p), data: { ready: true } });
    }
    if (this.isHuman(p)) this.quiet('rhythmDelta', { amount: applied, why, math, ...extra }, p.id);
  }
  /** Set rhythm directly (dev tools / ultimates), re-applying the notch boost. */
  setRhythm(p: Player, v: number) {
    const before = notchOf(p.rhythm);
    p.rhythm = Math.max(0, Math.min(100, v));
    if (notchOf(p.rhythm) !== before) { p.boost = rhythmBoost(p.core, notchOf(p.rhythm)); p.recompute(); }
  }
  rhythmGain(p: Player | null | undefined, k: RhythmGain, mult = 1) { this.addRhythm(p, RHYTHM_GAIN[k] * mult, k); }
  rhythmLoss(p: Player | null | undefined, k: RhythmLoss) { this.addRhythm(p, -RHYTHM_LOSS[k], k); }
  /** CPU stars' ultimates (round 51), by player id. */
  cpuUlts: Record<string, UltState> = {};
  /** A player's ultimate: yours from the career (when unlocked), a CPU star's fitted one, else none. */
  ultOf(p: Player): UltState | null {
    if (this.cfg.oneOnOne) return null; // 1v1: no ultimates (rhythm still builds and boosts)
    if (p === this.user) return this.ult.state.unlocked && this.ult.state.id ? this.ult.state : null;
    if (this.isHuman(p)) return null;
    if (!p.star || this.cfg.mode === 'practice') return null;
    return (this.cpuUlts[p.id] ??= cpuUltFor(p));
  }
  /** Ultimates used this game per player (one each). */
  ultsUsed: Record<string, number> = {};
  private rhythmReadySaid: Record<string, boolean> = {};

  // ---------- physics ----------
  private physics(dt: number) {
    for (const p of this.players) {
      p.stateT += dt;
      // timed states
      // AI Jelly Fake: a shot blocker left his feet at the dunk -> hang and jelly it (about half the time)
      if (p.state === 'shoot' && p.pendingShot?.type === 'dunk' && !p.pendingShot.jellyRead && this.isAI(p) && this.canJelly(p)) {
        const jumper = this.opp(p.team).find((o) => o.z > 0.5 && dist(o.p, p.p) < 5);
        if (jumper) { p.pendingShot.jellyRead = true; if (this.rng.chance(0.5)) this.jellyFake(p); }
      }
      if (p.state === 'shoot' && p.stateT >= p.stateDur) this.releaseShot(p);
      if ((p.state === 'screen' || p.state === 'charge' || p.state === 'fallen' || p.state === 'dribbleMove' || p.state === 'dive') && p.stateT >= p.stateDur) {
        const wasMove = p.state === 'dribbleMove';
        if (wasMove && p.move) { p.lastMove = { id: p.move.id, endAt: this.time, dir: p.move.dir }; p.move = null; p.vel = scale(p.vel, 0.3); } // moves end where they're meant to
        p.state = 'idle';
        if (wasMove && p.bufferedMove) {
          const b = p.bufferedMove; p.bufferedMove = null;
          if (this.time - b.at < 0.35) this.dribbleMove(p, b.stick);
        }
      }
      if (p.jumpAt && this.time >= p.jumpAt) { p.jumpAt = 0; this.jump(p, 0.9); }
      if (p.liftAt && this.time >= p.liftAt) {
        p.liftAt = 0;
        // plant the stride foot and rise (a pull-up stops on a dime, a finish keeps some carry)
        if (p.state === 'shoot') { p.vz = p.liftVz; p.vel = scale(p.vel, p.liftVz < 9 ? 0.15 : 0.45); }
      }

      let want = p.want;
      if (p.deadDribble && this.holder() === p && p.state !== 'shoot') want = v();
      if (this.time < p.staggerUntil) want = scale(want, 0.25);
      if (this.time < p.screenedUntil) want = scale(want, 0.15);
      if (this.time < p.bumpedUntil) want = scale(want, 0.12);
      if (this.time < p.stunnedUntil) want = scale(want, 0.1);
      if (p.boxingOut) want = scale(want, 0.35); // low, wide shuffle
      if (p.boxedOut) { want = scale(want, p.boxedOut); p.boxedOut = 0; }

      switch (p.state) {
        case 'screen': case 'charge': case 'fallen': p.vel = v(); break;
        case 'dribbleMove':
          // sell first (slow down / shift weight), then plant and burst
          if (p.stateT < p.movePlantAt * p.stateDur) p.vel = v(); // planted while selling
          else { p.vel = p.moveVel; if (!p.movePlanted) { p.movePlanted = true; this.quiet('plant', { move: p.move?.id }, p.id); } }
          break;
        case 'shoot': p.vel = scale(p.vel, 0.985); break;
        // dive: the launch carries him, then he slides out on the floor and gets up
        case 'dive': if (p.stateT > DIVE_LAUNCH_S) p.vel = scale(p.vel, Math.max(0, 1 - dt * 6)); break;
        default: {
          // knocked back (screens, box-outs): low grip, the push slides him back instead of stopping at once
          const accel = p.z > 0 ? 1.5 : this.time < p.bumpedUntil ? 3 : p === this.user && p.isUser ? 14 : 9;
          p.vel = add(p.vel, scale(sub(want, p.vel), Math.min(1, dt * accel)));
        }
      }
      p.p = this.clampFor(p, add(p.p, scale(p.vel, dt)));
      if (p.z > 0 || p.vz > 0) {
        p.vz -= 32 * dt * (this.time < p.hangUntil ? 0.25 : 1); p.z += p.vz * dt; // Jelly Fake: hang time
        if (p.z <= 0) { p.z = 0; p.vz = 0; if (p.state === 'jump') p.state = 'idle'; }
      }
      const sp = len(p.vel);
      if (sp > 1.5 && p.state !== 'shoot') p.face = norm(p.vel);
      if (this.holder() === p && sp > 2) p.dribbledSinceCatch = p.dribbledSinceCatch || this.time - p.receivedAt > 0.5;
      // stamina
      const sprinting = this.time < p.burstUntil && sp > p.runSpeed * 0.9;
      const stamMult = 1 - p.sub.stamina / 99 * 0.5;
      p.stamina = clamp(p.stamina + (sprinting ? -0.07 * stamMult : 0.04) * dt, 0, 1);
    }
  }

  private collisions() {
    const ps = this.players;
    const bs = this.ball.st;
    const reboundPhase = bs.kind === 'loose' || bs.kind === 'shot';
    const h = this.holder();
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j];
      const rel = sub(b.p, a.p);
      const d = len(rel);
      const minD = 2.2;
      if (d >= minD + 0.8 || d < 1e-4) continue;
      if (a.postedBy === b.id || b.postedBy === a.id) continue; // a post up: the post keeps them in contact
      const n = scale(rel, 1 / d);
      if (a.team !== b.team) {
        this.screenContact(a, b, d); this.screenContact(b, a, d);
        if (h && d < minD + 0.2) { if (a === h) this.chargeContact(b, a); else if (b === h) this.chargeContact(a, b); }
        if (reboundPhase) this.boxOut(a, b, d);
      }
      if (d >= minD) continue;
      const fixedA = a.state === 'screen' || a.state === 'charge';
      const fixedB = b.state === 'screen' || b.state === 'charge';
      const ma = fixedA ? 1e6 : 1 + a.sub.driveStability / 99;
      const mb = fixedB ? 1e6 : 1 + b.sub.driveStability / 99;
      const overlap = minD - d;
      a.p = this.clampFor(a, sub(a.p, scale(n, overlap * mb / (ma + mb))));
      b.p = this.clampFor(b, add(b.p, scale(n, overlap * ma / (ma + mb))));
      // drive contact: ball handler bumped by a defender
      if (h && (a === h || b === h) && a.team !== b.team && len(h.vel) > 8) {
        const def = a === h ? b : a;
        const ratio = (h.sub.driveStability + 20) / (def.sub.postD * 0.5 + def.sub.perimD * 0.5 + 20);
        h.vel = scale(h.vel, clamp(0.45 + 0.4 * ratio, 0.4, 0.95));
        if (this.time - this.lastContactAt > 0.6) { this.lastContactAt = this.time; this.quiet('contact', { hard: false }, h.id); }
      }
    }
  }

  private screenContact(scr: Player, def: Player, d: number) {
    if (scr.state !== 'screen' || d > 2.6 || this.time < def.screenedUntil + 0.6) return;
    const h = this.holder();
    const sc = h && h.team === scr.team && def.guarding === h.id ? this.screenFor(h) : null;
    if (sc?.kind === 'under') return; // he went under the screen: nothing to run into
    let { stun, knock } = screenImpact(scr, def);
    if (sc?.kind === 'blitz') { stun *= 0.6; knock *= 0.6; } // fighting over the top while the big jumps out
    def.screenedUntil = this.time + stun;
    // knocked back off the screen (same stumble as losing a box-out): part of it at once, the rest as a slide
    const away = norm(sub(def.p, scr.p));
    const kd = knock * this.rng.range(0.85, 1.15);
    def.p = this.clampFor(def, add(def.p, scale(away, kd * 0.4)));
    def.vel = scale(away, kd * 0.6 / 0.3);
    def.bumpedUntil = this.time + stun;
    def.anim = { name: 'bumped', start: this.time, dur: stun };
    scr.lastScreenAt = this.time;
    this.quiet('screenHit', { stun }, scr.id);
    if (!scr.screenHit) {
      scr.screenHit = true;
      if (scr === this.user) { applyTrust(this.trust, 'screen'); this.emit({ kind: 'screen', text: `Screen! ${def.name} is stuck`, good: true, pid: scr.id }); }
      if (scr.mods.pMult('screenStun') > 1.3 && this.rng.chance(0.2)) { this.knockDown(def, 1.0, 'screen'); this.emit({ kind: 'screen', text: `${def.name} flattened by the screen`, big: true }); }
    }
    if (this.switchAll || sc?.kind === 'switch') {
      const scrDef = this.defenderOf(scr);
      if (scrDef && scrDef !== def) {
        const g = def.guarding; def.guarding = scrDef.guarding; scrDef.guarding = g;
        if (h && h.team === scr.team && def.guarding === scr.id) this.attackSwitch(h, scr, scrDef, def);
      }
    }
  }

  /**
   * Round 49: a switch left a mismatch — go at it. A slow or much worse defender now on the handler: the AI handler
   * drives. A big now guarded by a small: he's the mismatch (teammates look for him, and he posts once he has it).
   */
  private attackSwitch(h: Player, scr: Player, onH: Player, onScr: Player) {
    if (this.isAI(h) && (guardFit(onH, h) < guardFit(onScr, h) - 10 || onH.sub.speed < h.sub.speed - 8)) {
      h.aiMode = 'drive'; h.aiModeUntil = this.time + 1.6;
      this.emit({ kind: 'move', text: `Switch! ${h.name} attacks ${onH.name}`, pid: h.id, team: h.team });
    }
    if (scr.height - onScr.height > 0.4) {
      this.mismatch = { pid: scr.id, until: this.time + 3 };
      this.emit({ kind: 'move', text: `Mismatch: ${scr.name} has ${onScr.name} on him`, pid: scr.id, team: scr.team });
    }
  }

  private chargeContact(def: Player, h: Player) {
    if (def.state !== 'charge' || len(h.vel) < 6) return;
    const setTime = 0.28 * def.mods.pMult('chargeSet');
    const rimD = dist(def.p, this.rim(h.team));
    this.knockDown(def, 0.9, 'charge');
    this.quiet('contact', { hard: true }, def.id);
    if (this.time - def.chargeSetAt >= setTime && rimD > RESTRICTED_R && this.rng.chance(0.5 + def.sub.charge / 99 * 0.4)) {
      h.box.tov++;
      this.emit({ kind: 'charge', text: `CHARGE! ${def.name} takes it`, team: def.team, pid: def.id, big: true });
      this.rhythmGain(def, 'charge', def.mods.pMult('hustleBonus')); this.rhythmLoss(h, 'turnover');
      if (def === this.user) applyTrust(this.trust, 'stop', 1.5 * def.mods.pMult('hustleBonus'));
      if (h === this.user) applyTrust(this.trust, 'turnover');
      this.deadBall(def.team);
    } else {
      this.emit({ kind: 'foul', text: `Blocking foul on ${def.name}`, team: def.team });
      this.shotClock = Math.max(this.shotClock, 14);
      this.deadBall(h.team);
    }
  }

  /**
   * Box-outs. The player closer to the ball slows whoever is behind him. If he's in a box-out stance
   * and the man behind tries to go through him, it's a strength battle: the loser gets knocked back
   * (bumped animation) or slides around.
   */
  private boxOut(a: Player, b: Player, d: number) {
    if (d > 3) return;
    const st = this.ball.st;
    const target = st.kind === 'shot' ? this.rim(st.shooter.team) : this.ball.p;
    const [front, back] = dist(a.p, target) < dist(b.p, target) ? [a, b] : [b, a];
    const power = 0.35 + 0.25 * front.mods.pAdd('boxOut') + front.sub.rebound / 400;
    back.boxedOut = clamp(1 - power, 0.2, 0.9);
    if (!front.boxingOut || d > 2.7 || this.time < back.bumpedUntil + 0.35 || this.time - back.lastBumpAt < 0.8) return;
    const toT = norm(sub(target, back.p));
    if (dot(back.want, toT) < 3 && dot(back.vel, toT) < 2) return; // not trying to get past
    back.lastBumpAt = this.time;
    front.leanedUntil = this.time + 0.5;
    const boxer = front.core.strength + front.sub.rebound / 2 + 25 * front.mods.pAdd('boxOut') + 10;
    const mover = back.core.strength + back.sub.driveStability / 2 + this.rng.range(0, 20);
    const away = norm(sub(back.p, front.p));
    if (boxer >= mover) {
      back.p = this.clampFor(back, add(back.p, scale(away, this.rng.range(1.5, 2.5))));
      back.vel = scale(away, 5);
      back.bumpedUntil = this.time + 0.5;
      back.anim = { name: 'bumped', start: this.time, dur: 0.5 };
      this.quiet('contact', { hard: true }, back.id);
      if (front === this.user || back === this.user) this.emit({ kind: 'boxout', text: front === this.user ? `Boxed out ${back.name}!` : `${front.name} boxed you out`, pid: front.id, good: front === this.user });
    } else {
      const side = cross(toT, away) > 0 ? 1 : -1;
      back.p = this.clampFor(back, add(back.p, scale(v(-away.y, away.x), 0.9 * side)));
    }
  }

  // ---------- ball ----------
  private updateBall(dt: number) {
    const b = this.ball;
    const st = b.st;
    switch (st.kind) {
      case 'dead': {
        if (st.vz === undefined || !st.vel) break;
        // falling out of the net: gravity, a few bounces, then it rolls to a stop
        b.p = add(b.p, scale(st.vel, dt));
        st.vz -= 32 * dt; b.z += st.vz * dt;
        if (b.z <= 0.4) {
          b.z = 0.4; const impact = Math.abs(st.vz); st.vz = impact * 0.58;
          if (impact > 2.5) this.quiet('bounce', { v: impact });
          if (st.vz < 1.6) st.vz = 0;
          st.vel = scale(st.vel, 0.8);
        }
        if (b.z <= 0.4 && st.vz === 0) st.vel = scale(st.vel, Math.max(0, 1 - dt * 1.5));
        b.p = v(clamp(b.p.x, -4, 98), clamp(b.p.y, -3, 53));
        break;
      }
      case 'held': {
        const h = st.holder;
        b.p = add(h.p, scale(h.face, 0.9));
        b.z = h.state === 'shoot' ? h.z + h.height + 0.5 : 2.5 + Math.abs(Math.sin(this.time * 9)) * 1.2;
        break;
      }
      case 'pass': {
        st.t += dt;
        const k = clamp01(st.t / st.dur);
        // short passes home in on the receiver (re-aim at where he is now)
        if (st.magnet && st.to.state !== 'fallen') st.b = lerpV(st.b, add(st.to.p, scale(st.to.vel, 0.05)), Math.min(1, dt * 12));
        b.p = lerpV(st.a, st.b, k);
        b.z = st.oop ? st.oop.z0 + (st.oop.catchZ - st.oop.z0) * k + OOP_ARC * Math.sin(Math.PI * k) : 4.5 + (st.lob ? 7 : st.overhead ? 5.8 : 1.2) * Math.sin(Math.PI * k);
        const passLen = dist(st.a, st.b);
        for (const d of this.opp(st.from.team)) {
          if (st.checked.has(d.id) || d.state === 'fallen' || (this.cfg.story?.softD && this.isAI(d))) continue;
          const swiping = this.time < (d.swipingUntil ?? 0);
          // long balls hang in the lanes: a bigger window to get a hand on them
          const r = (1.3 + clamp((passLen - 20) / 25, 0, 1) * 0.9) * d.mods.pMult('deflect') + (swiping ? 1.4 : 0);
          if (dist(d.p, b.p) < r && b.z < d.reach + d.z + 0.5) {
            st.checked.add(d.id);
            const chance = (st.inbound ? 0.4 : 1) * (0.04 + 0.16 * d.sub.steal / 99) * (st.riskMult ?? (st.risky ? 1.8 : 1)) * (st.lob ? 0.25 : 1) * (swiping ? 1.8 : 1) * (this.time < d.staggerUntil ? 0.3 : 1);
            if (this.rng.chance(chance)) {
              d.box.stl++; st.from.box.tov++;
              this.emit({ kind: 'steal', text: `Picked off by ${d.name}!`, team: d.team, pid: d.id, big: true });
              this.rhythmGain(d, 'steal'); this.rhythmLoss(st.from, 'turnover');
              if (d === this.user) applyTrust(this.trust, 'stop');
              if (st.from === this.user) applyTrust(this.trust, 'turnover');
              if (this.rng.chance(0.55)) { this.giveBall(d); this.changePossessionLive(d.team); }
              else b.st = { kind: 'loose', vel: scale(norm(sub(st.b, st.a)), 6), vz: 3, lastTeam: d.team, noGrabUntil: this.time + 0.2 };
              return;
            }
          }
        }
        if (k >= 1 && st.oop) { this.oopArrive(st); break; }
        if (k >= 1) {
          if (dist(st.to.p, b.p) < (st.magnet ? 4.5 : 3.5) && st.to.state !== 'fallen') {
            this.giveBall(st.to);
            this.scrambleOnCatch(st.from, st.to);
            this.quiet('catch', {}, st.to.id);
            this.assistCand = { passer: st.from, receiver: st.to, at: this.time };
            if (this.runner.cur?.options?.includes(this.playRole(st.to))) st.to.receivedAt = this.time;
          } else {
            b.st = { kind: 'loose', vel: scale(norm(sub(st.b, st.a)), 8), vz: 0, lastTeam: st.from.team };
          }
        }
        break;
      }
      case 'shot': {
        st.t += dt;
        if (st.plan) {
          // physical shot: play the planned flight, sound each contact as it happens, then hand the ball back to the sim
          const pl = st.plan;
          const pos = st.t >= pl.end.t ? pl.end.p : samplePlan(pl, st.t);
          b.p = v(pos.x, pos.y); b.z = pos.z;
          while ((st.ci ?? 0) < pl.contacts.length && pl.contacts[st.ci!].t <= st.t) {
            const c = pl.contacts[st.ci!];
            if (c.kind === 'board') this.quiet('rimHit', { kind: 'board' });
            else if (c.kind === 'rim') this.quiet('rimHit', { kind: c.speed > 7 ? 'clank' : 'tick' });
            st.ci = st.ci! + 1;
          }
          if (st.t >= pl.end.t) {
            if (st.airball) this.emit({ kind: 'airball', text: 'AIR BALL', team: st.shooter.team, pid: st.shooter.id, big: true });
            if (!st.made) st.exit = { vel: v(pl.end.v.x, pl.end.v.y), vz: pl.end.v.z };
            this.resolveShot(st);
          }
          break;
        }
        const k = clamp01(st.t / st.dur);
        const rim = this.rim(st.shooter.team);
        if (k < 1 || !st.rim) {
          const end = st.target ?? rim;
          b.p = lerpV(st.a, end, k);
          const apex = st.ev.type === 'dunk' ? 0 : Math.min(9, 3 + st.ev.dist * 0.22);
          b.z = st.z0 + ((st.airball ? 8.6 : 10) - st.z0) * k + apex * Math.sin(Math.PI * k);
        }
        if (k < 1) break;
        if (st.airball) {
          const dir = norm(sub(st.target!, st.a));
          st.exit = { vel: scale(dir, 9), vz: -4 };
          this.emit({ kind: 'airball', text: 'AIR BALL', team: st.shooter.team, pid: st.shooter.id, big: true });
          this.resolveShot(st);
          break;
        }
        if (!st.rim) { this.resolveShot(st); break; }
        // live rim: follow the scripted bounce/roll, play each contact, then score or come off as a rebound
        st.rimT = (st.rimT ?? 0) + dt;
        const along = this.side(st.shooter.team); // +dx = toward the backboard = toward the baseline
        const sp = sampleRim(st.rim, st.rimT);
        b.p = v(rim.x + sp.dx * along, rim.y + sp.dy);
        b.z = sp.z;
        while ((st.rimKey ?? 0) < st.rim.keys.length && st.rim.keys[st.rimKey!].t <= st.rimT) {
          const key = st.rim.keys[st.rimKey!];
          if (key.sound && key.sound !== 'net') this.quiet('rimHit', { kind: key.sound });
          st.rimKey = st.rimKey! + 1;
        }
        if (st.rimT >= pathEnd(st.rim)) {
          if (st.rim.exit) {
            const e = st.rim.exit;
            st.exit = { vel: scale(norm(v(e.dx * along, e.dy)), e.speed), vz: e.vz };
          }
          this.resolveShot(st);
        }
        break;
      }
      case 'loose': {
        b.p = add(b.p, scale(st.vel, dt));
        st.vel = scale(st.vel, 1 - dt * 0.8);
        st.vz -= 32 * dt; b.z += st.vz * dt;
        if (b.z <= 0.4) { b.z = 0.4; const impact = Math.abs(st.vz); st.vz = impact * 0.55; if (st.vz < 1.5) st.vz = 0; if (impact > 2.5) this.quiet('bounce', { v: impact }); }
        if (b.p.x < 0 || b.p.x > 94 || b.p.y < 0 || b.p.y > COURT_W) {
          this.emit({ kind: 'oob', text: 'Out of bounds' });
          this.deadBall((1 - st.lastTeam) as 0 | 1);
          b.p = clampToCourt(b.p);
          break;
        }
        this.tryGrab();
        break;
      }
    }
  }

  private tryGrab() {
    const b = this.ball;
    const st = b.st;
    if (st.kind === 'loose' && st.noGrabUntil && this.time < st.noGrabUntil) return;
    let cands: { p: Player; score: number }[] = [];
    for (const p of this.players) {
      if (p.state === 'fallen' || p.state === 'shoot' || this.time < p.stunnedUntil) continue;
      if (st.kind === 'loose' && st.noGrabPid === p.id && this.time < (st.noGrabPidUntil ?? 0)) continue;
      const diving = p.state === 'dive';
      const r = (1.8 + p.sub.rebound / 99 * 0.9) * p.mods.pMult('grabRadius') + (diving ? 1.6 : 0); // a dive stretches out for it
      if (dist(p.p, b.p) < r && b.z < p.reach + p.z) cands.push({ p, score: p.sub.rebound + this.rng.range(0, 45) + (p.boxedOut ? -15 : 0) + (diving ? 35 : 0) });
    }
    if (!cands.length) return;
    cands.sort((a, c) => c.score - a.score);
    const g = cands[0].p;
    // how he takes it depends on where the ball is: off the floor, at the chest, or up high (jumping only when it's
    // above his standing reach)
    const zRel = this.ball.z - g.z;
    if (g.state === 'dive') { /* keeps the dive animation; secured below */ }
    else if (zRel < 2.8) g.anim = { name: 'scoop', start: this.time, dur: 0.55 };
    else if (zRel < g.height + 0.6) g.anim = { name: 'reboundChest', start: this.time, dur: 0.35 };
    else {
      g.anim = { name: 'rebound', start: this.time, dur: 0.7 };
      if (g.z === 0 && g.state !== 'fallen' && this.ball.z > g.reach) { g.vz = Math.max(g.vz, Math.min(9, 4 + (this.ball.z - g.reach) * 4)); g.state = 'jump'; }
    }
    const wasShot = this.wasShotRebound;
    this.wasShotRebound = false;
    if (wasShot) {
      g.box.reb++;
      if (g === this.user) this.quiet('rebound', { off: g.team === this.possession }, g.id);
      if (g === this.user && g.team === this.possession) applyTrust(this.trust, 'offReb');
    }
    this.giveBall(g);
    if (g.state === 'dive') { g.deadDribble = true; g.deadDribbleAt = this.time + DIVE_S; g.deadWarned = false; } // secured on the floor: pass it (or shoot)
    if (g.team !== this.possession) {
      // a stop: the man guarding the shooter who missed gets a little rhythm
      if (wasShot) { const sh = this.players.find((q) => q.name === this.lastShot?.name); if (sh && sh.team !== g.team) this.rhythmGain(this.defenderOf(sh), 'stop'); }
      this.changePossessionLive(g.team);
    } else if (wasShot) {
      this.shotClock = Math.max(this.shotClock, 14);
      this.runner.reset();
    }
  }
  wasShotRebound = false;
  lastContactAt = -9;

  private resolveShot(st: Extract<BallState, { kind: 'shot' }>) {
    const s = st.shooter;
    const team = s.team;
    const t = this.teams[team];
    if (!st.foul || st.made) { s.box.fga++; if (st.pts === 3) s.box.tpa++; }
    if (!st.airball) this.quiet(st.made ? 'net' : 'rim', {
      type: st.ev.type, flash: !!st.ev.dunk && DUNK[st.ev.dunk]?.kind === 'flash', swish: st.made && (st.plan ? st.plan.swish : st.rim ? st.rim.seq === 'swish' : st.ev.contest < 0.2 && ['mid', 'three', 'deep3', 'fade'].includes(st.ev.type)),
      seq: st.rim?.seq ?? (st.plan ? 'physics' : undefined), // live rims already played their contacts
      // cosmetic only: must not consume sim RNG
      board: !st.made && ((st.ev.dist * 7.13 + this.time * 3.7) % 1) < 0.3, pts: st.pts, team,
    }, s.id);
    if (st.made) {
      // the ball drops out of the bottom of the net with a little drift toward the baseline, then bounces and rolls
      const pe = st.plan?.end;
      if (pe) {
        // physical shot: keep falling from where it dropped through the ring, slowed and centered by the net
        this.ball.p = v(pe.p.x, pe.p.y); this.ball.z = pe.p.z;
        this.ball.st = { kind: 'dead', vel: v(pe.v.x * 0.22 + this.side(team) * 0.8, pe.v.y * 0.22), vz: Math.min(-3, pe.v.z * 0.6) };
      } else {
        const along = this.side(team), wob = ((this.time * 7.31) % 1) - 0.5; // cosmetic: no sim RNG
        this.ball.p = { ...this.rim(team) }; this.ball.z = Math.min(this.ball.z, 8.4);
        this.ball.st = { kind: 'dead', vel: v(along * (1.2 + Math.abs(wob)), wob * 2.4), vz: -7 };
      }
      const before = t.score - this.teams[1 - team].score;
      const val = this.scoreValue(st.pts);
      t.score += val;
      s.box.pts += val; s.box.fgm++; if (st.pts === 3) s.box.tpm++;
      const after = t.score - this.teams[1 - team].score;
      if (before <= 0 && after > 0) this.lastGoAhead = { pid: s.id, clock: this.clock, quarter: this.quarter };
      const ast = this.assistCand && this.assistCand.receiver === s && this.time - this.assistCand.at < 5 ? this.assistCand.passer : null;
      if (ast) { ast.box.ast++; this.rhythmGain(ast, 'assist'); if (ast === this.user) applyTrust(this.trust, 'assist'); }
      const dk = st.ev.dunk ? DUNK[st.ev.dunk] : null;
      // rhythm: points × 4, less each time you score the same way tonight (round 51)
      const mk = methodKey(st.ev.type, st.ev.conds, { stepback: s.lastMove?.id === 'stepback' && this.time - s.lastMove.endAt < 1.2, transition: this.inTransition(team) });
      const used = s.methods.get(mk) ?? 0; s.methods.set(mk, used + 1);
      const flash = dk && dk.kind === 'flash';
      this.addRhythm(s, scoreGain(val, used) * (flash ? 1.15 : 1), methodLabel(mk), scoreMath(val, used) + (flash ? ' ×1.15' : ''),
        { base: `${val}pts ×${POINT_GAIN}${flash ? ' ×1.15' : ''}`, times: used, decay: REPEAT_DECAY ** used }); // round 54: the pop shows fresh / stale clearly
      // round 53: you ran your part of the play and the team scored off it (no shot or assist needed)
      const u = this.user;
      if (u && this.ranPlay && this.ranPlay.team === team && u.team === team && s !== u && ast !== u && this.userOnCourt) this.addRhythm(u, RHYTHM_GAIN.playRun, 'ran the play');
      this.ranPlay = null;
      if (s === this.user) applyTrust(this.trust, 'madeShot');
      const name = (dk ? (dk.id === 'flush' ? 'Dunk' : dk.id === 'twoHand' || /Dunk|Alley-Oop/.test(dk.name) ? dk.name : `${dk.name} Dunk`) : SHOT_TYPES[st.ev.type].name) + (st.ev.windmill ? ' (windmill gather)' : '');
      this.lastMadeAt = this.time;
      this.emit({ kind: 'score', text: `${s.name} ${name}${ast ? ` (ast ${ast.name})` : ''} +${val}`, team, pid: s.id, big: st.ev.type === 'dunk' || st.pts === 3, good: true });
      if (st.ev.type === 'dunk' && st.ev.conds.has('contested') && s.mods.pAdd('posterize') > 0) {
        const nd = this.nearestDefender(s).d;
        if (nd && dist(nd.p, s.p) < 4) { this.knockDown(nd, 1.2, 'poster'); this.rhythmLoss(nd, 'posterized'); this.emit({ kind: 'poster', text: `POSTERIZED ${nd.name}!`, big: true }); }
      }
      // round 55: the Free-Throw-Line Dunk posterizes everyone in front of him
      const lane = posterLane(this, s);
      if (lane.length) {
        for (const nd of lane) { this.knockDown(nd, 1.2, 'poster'); this.rhythmLoss(nd, 'posterized'); }
        this.emit({ kind: 'poster', text: `POSTERIZED ${lane.length > 1 ? `${lane.length} OF THEM` : lane[0].name}!`, big: true });
      }
      this.checkLeftMan(s, st.ev.contest);
      this.assistCand = null;
      if (this.cfg.oneOnOne) {
        // make it, take it: scorer checks it again (fouls just count the bucket, no free throws)
        if (st.foul) this.emit({ kind: 'foul', text: 'Foul — bucket counts', team });
        if (this.checkWin()) return;
        this.deadBall(team, 1.1);
        return;
      }
      if (st.foul) { this.emit({ kind: 'foul', text: 'And-one!', team, big: true }); this.freeThrows(s, 1); }
      this.deadBall((1 - team) as 0 | 1, this.cfg.mode === 'practice' ? 1.8 : 1.1, 'baseline');
    } else if (st.foul && this.cfg.oneOnOne) {
      this.emit({ kind: 'foul', text: 'Foul — ball back', team });
      this.deadBall(team, 1.1);
    } else if (st.foul) {
      this.emit({ kind: 'foul', text: `Shooting foul — ${st.pts} free throws`, team });
      const made = this.freeThrows(s, st.pts);
      this.deadBall((1 - team) as 0 | 1, made ? 1.1 : 1.4, 'baseline');
    } else {
      const rim = this.rim(team);
      if (st.exit) {
        // ball keeps going from wherever the rim sequence (or airball) left it
        this.ball.st = { kind: 'loose', vel: st.exit.vel, vz: st.exit.vz, lastTeam: team };
      } else {
        const out = norm(add(sub(s.p, rim), v(this.rng.range(-8, 8), this.rng.range(-8, 8))));
        this.ball.st = { kind: 'loose', vel: scale(out, this.rng.range(6, 13)), vz: this.rng.range(3, 8), lastTeam: team };
        this.ball.p = add(rim, scale(out, 0.8));
        this.ball.z = 10;
      }
      this.wasShotRebound = true;
      this.assistCand = null;
    }
    if (!st.foul || st.made) this.heatAfterShot(s, st.made, st.ev);
  }

  private freeThrows(p: Player, n: number): boolean {
    const pct = clamp(0.45 + p.sub.mid / 99 * 0.45, 0.4, 0.95);
    let made = 0; let last = false;
    for (let i = 0; i < n; i++) { last = this.rng.chance(pct); if (last) made++; }
    this.teams[p.team].score += made; p.box.pts += made;
    this.emit({ kind: 'ft', text: `${p.name} ${made}/${n} FT`, team: p.team });
    return last;
  }

  /** Round 53: only a real lapse — nobody contested the shot, and not right after a switch. */
  private checkLeftMan(scorer: Player, contest = 0) {
    const u = this.user;
    if (this.cfg.oneOnOne) return; // no team trust in 1v1
    if (!u || !this.userOnCourt || u.team === scorer.team || u.guarding !== scorer.id) return;
    if (contest >= 0.2 || this.time - this.userGuardChangedAt < 1.5) return;
    if (dist(u.p, scorer.p) > 10) { applyTrust(this.trust, 'leftMan'); this.rhythmLoss(u, 'leftMan'); this.emit({ kind: 'grade', text: '✗ Your man scored — you left him', good: false, pid: u.id }); }
  }

  // ---------- HUD support ----------
  private updatePreview() {
    const h = this.holder();
    const u = h && this.isHuman(h) && (h === this.user || h === this.user2) ? h : null;
    if (u && u.state !== 'shoot') {
      const type = selectShotType(u, this.side(u.team), u === this.user ? this.stick : this.stick2, this.time);
      const ov = this.ult.active && this.ult.active.pid === u.id ? this.ult.active.shotOverride : undefined;
      const windmill = windmillGather(u, type, dot(u.vel, norm(sub(this.rim(u.team), u.p))));
      this.preview = evaluateShot(u, this.opp(u.team), this.side(u.team), type, { now: this.time, clutch: this.clutch, override: ov, windmill });
    } else this.preview = null;
  }

  /** HUD: would ✕ right now be a step-through (recent fake + stick toward the rim)? */
  stepThroughReady(p: Player): boolean {
    if (this.holder() !== p) return false;
    return isStepThrough(selectShotType(p, this.side(p.team), p === this.user ? this.stick : this.stick2, this.time));
  }

  equationText(): string { return this.preview ? formatEquation(this.preview) : ''; }

  /** Current play assignment for the user (for the on-court marker). */
  userAssignment(): { pos: Vec; act: string; play: string } | null {
    const u = this.user;
    if (!u || !this.userOnCourt || u.team !== this.possession) return null;
    const a = this.runner.roleAssignment(this.playRole(u));
    if (!a || !this.runner.play) return null;
    return { pos: this.assignmentPos(u, a), act: a.act, play: this.runner.play.name };
  }
}

