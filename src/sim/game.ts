import { TeamDef, SHOT_TYPES, MOVES, PLAYS } from './data';
import { Player } from './player';
import { Side, rimPos, hc, spot, clampToCourt, inFrontcourt, isThree, RESTRICTED_R, COURT_W } from './court';
import { Vec, v, add, sub, scale, norm, len, dist, dot, lerpV, clamp, clamp01, Rng, cross, perp } from './math';
import { ShotEval, evaluateShot, selectShotType, formatEquation, bitOnFake } from './shooting';
import { resolveMove, moveDirection, sideOf } from './moves';
import { PlayRunner } from './plays/runner';
import { TrustState, applyTrust, TrustReason } from './ai/trust';
import { RotationPlan, shouldBeOn } from './rotation';
import { thinkOffense, offBallTarget } from './ai/offense';
import { thinkDefense } from './ai/defense';
import { UltState, UltRuntime, tryActivateUlt, tickUlt, ULT_GAINS } from './ultimates';
import { PlayRole } from './data';
import { RimPath, pickSeq, buildPath, sampleRim, pathEnd } from './rim';

export interface UserInput {
  move: Vec; sprint: boolean; // sprint = tap (edge) for a burst
  a: boolean; b: boolean; x: boolean; y: boolean; // edge-triggered this tick
  aHeld: boolean; bHeld: boolean;
}
/** ✕ taps shorter than this are pump fakes; ○ taps shorter than this with no direction are jab steps. */
export const TAP_S = 0.18;
/** Length of the pump-fake sell (state and animation). A shot pressed during it cuts it short. */
export const PUMP_FAKE_S = 0.42;
/** Step-Through: share of the gather spent striding on the floor before lifting off, and stride length (ft). */
export const STEP_LIFT = 0.55, STEP_STRIDE_FT = 5.5;
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
  /** half-court 1v1, make it take it (mode must be 'practice') */
  oneOnOne?: { target: number; scoring: '1s2s' | '2s3s'; winBy2: boolean };
  featureUser?: boolean;
}

export type BallState =
  | { kind: 'held'; holder: Player }
  | { kind: 'pass'; from: Player; to: Player; a: Vec; b: Vec; t: number; dur: number; lob: boolean; risky: boolean; checked: Set<string>; inbound?: boolean }
  | { kind: 'shot'; shooter: Player; a: Vec; z0: number; t: number; dur: number; made: boolean; pts: number; ev: ShotEval; foul: boolean;
      /** live-rim sequence played after the ball reaches the hoop */ rim?: RimPath; rimT?: number; rimKey?: number;
      airball?: boolean; target?: Vec; exit?: { vel: Vec; vz: number } }
  | { kind: 'loose'; vel: Vec; vz: number; lastTeam: 0 | 1 }
  | { kind: 'dead' };

/** quiet events drive audio/animation only and never show in the on-screen feed */
export interface GameEvent { t: number; kind: string; text: string; team?: 0 | 1; pid?: string; big?: boolean; good?: boolean; quiet?: boolean; data?: Record<string, any> }

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
  trust: TrustState;
  ult: UltRuntime;
  grade = { good: 0, bad: 0, points: 0 };
  milestones: string[] = [];
  lastGoAhead: { pid: string; clock: number; quarter: number } | null = null;
  phaseStartedAt = 0;
  freezeAI = false;
  forceClutch = false;
  switchAll: boolean;
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
  emit(e: Omit<GameEvent, 't'>) { this.events.push({ t: this.time, ...e }); }
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
      // keep roles 1..5 matching on-court positions
      const order = ['PG', 'SG', 'SF', 'PF', 'C'];
      const sorted = [...t.onCourt].sort((a, b) => order.indexOf(a.pos) - order.indexOf(b.pos));
      sorted.forEach((p, i) => (p.role = String(i + 1)));
    }
  }

  assignMatchups() {
    for (const t of [0, 1] as const) {
      const opps = this.opp(t);
      for (const d of this.teams[t].onCourt) {
        const m = opps.find((o) => o.role === d.role) ?? opps[0] ?? null;
        d.guarding = m ? m.id : null;
      }
    }
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
    const off = this.teams[team].onCourt[0], def = this.teams[1 - team].onCourt[0];
    for (const p of [off, def]) {
      p.vel = v(); p.state = 'idle'; p.z = 0; p.vz = 0; p.staggerUntil = 0; p.screenedUntil = 0; p.bumpedUntil = -9;
      p.move = null; p.pendingShot = null; p.liftAt = 0; p.jumpAt = 0;
    }
    off.p = hc(this.side(team), 30, 0);
    this.assignMatchups();
    def.p = add(off.p, scale(norm(sub(this.rim(team), off.p)), 4));
    off.face = norm(sub(this.rim(team), off.p)); def.face = scale(off.face, -1);
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
    this.ball.st = { kind: 'dead' };
    if (this.cfg.mode !== 'practice') this.startInbound(next, delay, where, ballAt);
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
      this.ball.p = { ...rimPos(-side as Side) }; this.ball.z = 9; // drops through the net
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
    if (b.z > 0.4) { b.z = Math.max(0.4, b.z - 20 * (1 / 60)); }
    if (!s.hasBall && dist(s.inbounder.p, b.p) < 2.6 && b.z < 5) s.hasBall = true;
    if (s.hasBall) { b.p = add(s.inbounder.p, scale(s.inbounder.face, 0.6)); b.z = 6.2; }
    const atSpot = dist(s.inbounder.p, s.spot) < 1.3;
    const recvReady = dist(s.receiver.p, s.recv) < 3.5 || this.time - s.start > 4.5;
    if (s.hasBall && atSpot && recvReady && this.time >= s.minPassAt) {
      this.inb = null;
      this.live = true;
      this.pendingInbound = null;
      this.shotClock = 24;
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

  changePossessionLive(newTeam: 0 | 1) {
    this.possession = newTeam;
    this.shotClock = 24;
    this.runner.reset();
    this.assignMatchups();
    if (this.cfg.oneOnOne) this.deadBall(newTeam, 1.0); // take it back: new offense checks it up top
    else if (this.cfg.mode === 'practice') this.deadBall(0, 1.0);
    else this.transitionUntil = this.time + 5; // live turnover / defensive board: read the break
  }

  callPlay() {
    // "feature me equally" (testing): rotate who the set is run for across all five, including the user
    const off = this.offense();
    let id = PlayRunner.pick(this.rng, this.cfg.allowedPlays, this.runner.lastPlayId);
    let swap: [string, string] | null = null;
    let focus: Player | null = null;
    if (this.featureUser && this.user && this.userOnCourt && this.user.team === this.possession && off.length === 5) {
      if (!this.focusQueue.length) this.focusQueue = off.map((p) => p.id).sort(() => this.rng.next() - 0.5);
      const fid = this.focusQueue.shift()!;
      focus = off.find((p) => p.id === fid) ?? null;
      if (focus) {
        const fits = Object.keys(PLAYS).filter((pid) => PLAYS[pid].focus === focus!.role && pid !== this.runner.lastPlayId && (!this.cfg.allowedPlays?.length || this.cfg.allowedPlays.includes(pid)));
        if (fits.length) id = this.rng.pick(fits);
        else if (focus === this.user && PLAYS[id].focus) swap = [PLAYS[id].focus!, focus.role]; // run any set for the user by swapping roles
        else if (focus !== this.user) focus = null;
      }
    }
    this.runner.call(id, swap, focus?.id ?? null);
    this.phaseStartedAt = this.time;
    this.emit({ kind: 'play', text: `Coach: "${this.runner.play!.name}"`, team: this.possession });
  }

  // ---------- main tick ----------
  update(dt: number, input: UserInput, input2?: UserInput) {
    if (this.over) return;
    this.time += dt;
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
    if (!this.freezeAI) {
      for (const p of this.players) if (this.isAI(p) || this.inb?.inbounder === p) this.think(p, dt);
    } else for (const p of this.players) if (this.isAI(p)) p.target = { ...p.p };

    tickUlt(this, dt);
    this.physics(dt);
    this.collisions();
    this.updateBall(dt);
    this.updatePlay(dt);
    this.rules();
    this.updatePreview();
  }

  private resume() {
    if (this.cfg.mode === 'practice') { this.practiceReset(); return; }
    // substitutions happen at dead balls
    if (this.user && this.cfg.rotation) {
      const on = shouldBeOn(this.cfg.rotation, this.elapsed);
      if (on && !this.userOnCourt) this.putUserOnCourt();
      else if (!on && this.userOnCourt) this.benchUser();
      this.refreshOnCourt();
    }
    this.inbound(this.pendingInbound ?? (1 - this.possession) as 0 | 1);
  }

  private rules() {
    if (!this.live) return;
    const hd = this.holder();
    if (hd && hd.deadDribble && this.time - hd.deadDribbleAt > 5 && hd.state !== 'shoot') {
      hd.box.tov++; hd.deadDribble = false;
      this.emit({ kind: 'violation', text: '5-second violation (held the ball)', team: this.possession });
      if (hd === this.user) applyTrust(this.trust, 'turnover');
      this.deadBall((1 - this.possession) as 0 | 1);
      return;
    }
    if (this.shotClock <= 0 && this.ball.st.kind !== 'shot' && this.ball.st.kind !== 'loose') {
      const h = this.holder(); if (h) h.box.tov++;
      this.emit({ kind: 'violation', text: 'Shot clock violation', team: this.possession });
      if (h === this.user) applyTrust(this.trust, 'turnover');
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
      this.gainUlt(u, ULT_GAINS.playExec);
      this.emit({ kind: 'grade', text: `✓ Ran your ${a.act} (${this.runner.play?.name})`, good: true, pid: u.id });
    } else {
      this.grade.bad++; this.grade.points -= 1;
      applyTrust(this.trust, 'playMiss');
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
    const max = (urgent || d > 6 ? this.topSpeed(p) : p.walkSpeed) * (hasBall ? p.ballSpeedMult : 1) * speedMult;
    const sp = Math.min(max, d * 3.2);
    p.want = scale(norm(to), sp);
  }

  // ---------- user ----------
  private handleUser(u: Player, inp: UserInput, ux: GameSim['ux']) {
    if (this.inb?.inbounder === u) return; // walking it out of bounds is automatic
    const primary = u === this.user;
    if (primary) this.stick = inp.move; else this.stick2 = inp.move;
    const hasBall = this.holder() === u;
    const onO = u.team === this.possession;
    if (inp.sprint && this.live) {
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
    if (!this.live) return;

    if (inp.x) tryActivateUlt(this, u);
    const shotUp = this.ball.st.kind === 'shot';
    u.boxOutHeld = shotUp && inp.bHeld; // ○ held while a shot is in the air = box out (either side)
    u.boxingOut = u.boxOutHeld && u.z === 0;
    if (hasBall) {
      // ✕: tap = pump fake (repeatable), hold past TAP_S = shoot
      if (inp.a) { ux.aDownAt = this.time; ux.aPending = true; }
      if (ux.aPending) {
        if (inp.aHeld && this.time - ux.aDownAt >= TAP_S) { ux.aPending = false; this.startShot(u, selectShotType(u, this.side(u.team), inp.move, this.time)); }
        else if (!inp.aHeld) { ux.aPending = false; this.pumpFake(u); }
      }
      if (inp.y && passTarget && !ux.aPending) this.pass(u, passTarget);
      // ○: press with the stick pushed = move now; hold ○ and drag = move per flick; quick neutral tap = jab step
      if (inp.b) {
        ux.bDownAt = this.time; ux.bMoved = false;
        if (len(inp.move) > 0.35) { this.dribbleMove(u, inp.move); ux.bMoved = true; ux.bNeedNeutral = true; } else ux.bNeedNeutral = false;
      } else if (inp.bHeld) {
        if (!ux.bNeedNeutral && len(inp.move) > 0.5) { this.dribbleMove(u, inp.move); ux.bMoved = true; ux.bNeedNeutral = true; }
        else if (ux.bNeedNeutral && len(inp.move) < 0.25) ux.bNeedNeutral = false;
      } else if (ux.bWasHeld && !ux.bMoved && this.time - ux.bDownAt < TAP_S) this.dribbleMove(u, v());
    } else {
      ux.aPending = false;
      if (onO) {
        if (inp.y) { u.callForBallUntil = this.time + 1.4; this.emit({ kind: 'call', text: 'Calling for the ball…', pid: u.id }); }
        if (inp.b && !shotUp) this.setScreen(u);
        if (inp.a && this.ball.st.kind === 'loose') this.jump(u, 1);
      } else {
        if (inp.a) this.jump(u, 1);
        if (inp.y) this.swipe(u);
        if (inp.b && !shotUp) this.takeCharge(u);
      }
    }
    ux.bWasHeld = inp.bHeld;
  }

  /** Per-user button timing state (tap vs hold). */
  ux = { aDownAt: 0, aPending: false, bDownAt: 0, bMoved: false, bNeedNeutral: false, bWasHeld: false };
  ux2 = { aDownAt: 0, aPending: false, bDownAt: 0, bMoved: false, bNeedNeutral: false, bWasHeld: false };

  /** Pump fake: picks up the dribble (if still dribbling), ball up, defenders may bite. Repeatable. */
  pumpFake(p: Player) {
    if (this.holder() !== p || p.busy) return;
    if (!p.deadDribble) { p.deadDribble = true; p.deadDribbleAt = this.time; p.deadWarned = false; }
    p.pumpFakeAt = this.time;
    p.anim = { name: 'pumpfake', start: this.time, dur: PUMP_FAKE_S };
    p.state = 'dribbleMove'; p.stateT = 0; p.stateDur = PUMP_FAKE_S; p.moveVel = v(); p.move = { id: 'pumpfake', dir: v(), t: 0 };
    this.emit({ kind: 'move', text: 'Pump Fake', pid: p.id });
    for (const def of this.opp(p.team)) {
      const dd = dist(def.p, p.p);
      if (dd > 6 || def.z > 0 || def.state === 'fallen') continue;
      const ratio = (p.sub.ankleBreak + 20) / (def.sub.ankleResist + 20);
      const prox = clamp01(1 - (dd - 2) / 4);
      if (this.isAI(def) && this.rng.chance((0.22 + 0.3 * ratio * prox) * (def.lastBitAt && this.time - def.lastBitAt < 2 ? 0.4 : 1))) {
        def.lastBitAt = this.time; this.jump(def, 0.9);
        this.emit({ kind: 'move', text: `${def.name} bit on the pump fake`, pid: def.id });
      }
    }
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
    const jumper = ['mid', 'three', 'deep3'].includes(type);
    const windMult = jumper ? p.mods.pMult('release') : p.mods.pMult('gather');
    if (p.move?.id === 'pumpfake') p.move = null; // a shot cuts the fake short
    p.state = 'shoot'; p.stateT = 0; p.stateDur = def.windup * windMult;
    p.pendingShot = { type, override };
    p.anim = { name: `shot_${type}`, start: this.time, release: this.time + p.stateDur };
    this.quiet('gather', { type }, p.id);
    const rim = this.rim(p.team);
    const d = dist(p.p, rim);
    if (def.contact || type === 'floater' || type === 'stepThrough') {
      const travel = Math.max(0, d - (type === 'dunk' ? 1.2 : type === 'floater' ? d * 0.6 : 2.5));
      p.vel = scale(norm(sub(rim, p.p)), Math.min(type === 'stepThrough' ? 9 : 16, travel / Math.max(0.1, p.stateDur)));
      if (type === 'euro') p.vel = add(p.vel, scale({ x: -p.vel.y, y: p.vel.x }, 0.35 * (this.rng.chance(0.5) ? 1 : -1)));
    } else {
      p.vel = scale(p.vel, 0.25);
    }
    p.vz = type === 'dunk' ? p.jumpVel * 0.95 : jumper ? 8 : 9.5;
    p.face = norm(sub(rim, p.p));
    if (type === 'stepThrough') this.stepThrough(p, rim, d);
    // defenders react
    for (const d2 of this.opp(p.team)) {
      if (this.isAI(d2) && dist(d2.p, p.p) < 7.5 && d2.z === 0 && !d2.busy) {
        d2.jumpAt = this.time + this.rng.range(0.1, 0.28) * (1.4 - d2.sub.block / 99 * 0.6);
      }
    }
  }

  /**
   * Step-Through: one long grounded stride past the defender (angled away from his side), then lift off.
   * A defender who jumped on the fake can't contest or block it.
   */
  private stepThrough(p: Player, rim: Vec, d: number) {
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
    const stride = Math.min(STEP_STRIDE_FT, Math.max(1, d - 2.5));
    p.vel = scale(dir, stride / strideT / 0.9); // /0.9: shoot-state drag over the stride
    p.vz = 0; p.liftAt = this.time + strideT;
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
    const ev = evaluateShot(p, this.opp(p.team), side, ps.type, { now: this.time, clutch: this.clutch, override: ps.override });
    const rim = this.rim(p.team);
    if (p.anim) p.anim.release = this.time;
    this.quiet('release', { type: ps.type }, p.id);

    // blocks
    for (const d of this.opp(p.team)) {
      if (d.z < 0.6 || d.state === 'fallen') continue;
      if (ps.type === 'stepThrough' && bitOnFake(d, p, this.time)) continue; // still coming down from the fake
      const dd = dist(d.p, p.p);
      if (dd > 4.8) continue;
      const toRim = norm(sub(rim, p.p));
      const along = dot(norm(sub(d.p, p.p)), toRim);
      const chase = this.ult.active?.id === 'chaseDown' && this.ult.active.pid === d.id;
      let posF = along > 0.4 ? 1 : along > -0.2 ? 0.55 : 0.1;
      const close = !['mid', 'three', 'deep3'].includes(ps.type);
      let chance = (0.04 + 0.2 * d.sub.block / 99) * posF * d.mods.pMult('blockMult') * (close ? 1 : 0.4) * clamp(0.8 + (d.height - p.height) * 0.4, 0.5, 1.4);
      if (ps.type === 'dunk') chance *= 0.6;
      if (ps.override?.contestMult !== undefined) chance *= ps.override.contestMult;
      if (chase && along < 0.4) chance = Math.max(chance, this.ult.active!.level.blockChance);
      if (this.rng.chance(chance)) {
        d.box.blk++; p.box.fga++;
        if (ev.pts === 3) p.box.tpa++;
        this.lastShot = { ev, made: false, name: p.name, user: p === this.user, blocked: true, at: this.time };
        this.emit({ kind: 'block', text: `${chase ? 'CHASE-DOWN! ' : ''}BLOCKED by ${d.name}!`, team: d.team, pid: d.id, big: true });
        this.gainUlt(d, ULT_GAINS.block);
        if (d === this.user) applyTrust(this.trust, 'stop');
        if (chase && this.ult.active!.level.keepPossession) {
          this.giveBall(d); this.changePossessionLive(d.team);
        } else {
          this.ball.st = { kind: 'loose', vel: add(scale(norm(sub(p.p, d.p)), 14), v(this.rng.range(-4, 4), this.rng.range(-4, 4))), vz: 4, lastTeam: d.team };
          this.ball.z = p.z + p.height + 1;
        }
        if (chase) this.ult.active = null;
        return;
      }
    }

    const def = SHOT_TYPES[ps.type];
    const foul = (!!def.contact || ps.type === 'floater') && ev.contest > 0.3 && this.rng.chance(0.06 + 0.16 * ev.contest);
    const made = this.rng.next() < ev.pct;
    const d = ev.dist;
    const dur = ps.type === 'dunk' ? 0.16 : 0.6 + d * 0.03; // slower flight = more time to fight for rebounding position
    const jumper = ['mid', 'three', 'deep3'].includes(ps.type);
    // bad enough shots can airball (never touches iron)
    const bad = (ev.pct < 0.25 && ev.contest > 0.4) || d > 30;
    const airball = !made && !foul && bad && ps.type !== 'dunk' && this.rng.chance(0.1 + Math.max(0, 0.25 - ev.pct) * 0.8);
    const toShooter = norm(sub(p.p, rim));
    const target = airball ? add(rim, scale(toShooter, this.rng.chance(0.6) ? 3 + this.rng.range(0, 2.5) : -(2 + this.rng.range(0, 2)))) : undefined;
    const rimPath = airball ? undefined : ps.type === 'dunk' ? buildPath(made ? 'kissIn' : this.rng.pick(['frontRim', 'backIron'] as const), this.rng) : buildPath(pickSeq(made, jumper, ev.contest, this.rng), this.rng);
    this.ball.st = { kind: 'shot', shooter: p, a: { ...this.ball.p }, z0: p.z + p.height + 0.8, t: 0, dur, made, pts: ev.pts, ev, foul, rim: rimPath, rimT: 0, rimKey: 0, airball, target };
    // decide who crashes the offensive glass on this shot
    for (const m of this.teams[p.team].onCourt) {
      const crashP = m.role === '5' ? 0.95 : m.role === '4' ? (m.sub.three < 65 ? 0.85 : 0.2) : m.sub.finishing > m.sub.three + 8 ? 0.2 : 0.05;
      m.crashing = m !== p && this.rng.chance(crashP);
    }
    this.lastShot = { ev, made, name: p.name, user: p === this.user, at: this.time };
    p.box.usage++;
    if (p === this.user && !this.cfg.oneOnOne) {
      if (ev.pct < 0.28 && ev.contest > 0.3 && this.shotClock > 4) { applyTrust(this.trust, 'badShot'); this.emit({ kind: 'grade', text: '✗ Forced a bad shot', good: false, pid: p.id }); }
      else if (ev.pct >= 0.45 || ev.conds.has('open')) applyTrust(this.trust, 'goodShot');
    }
  }

  pass(from: Player, to: Player) {
    if (this.holder() !== from || from.busy) return;
    const lead = clampToCourt(add(to.p, scale(to.vel, 0.35)));
    const d = dist(from.p, lead);
    const driving = len(from.vel) > 9 || from.state === 'dribbleMove';
    const speed = from.passSpeed * (driving ? from.mods.pMult('drivePass') : 1);
    const lob = from.mods.pAdd('lob') > 0 && dist(lead, this.rim(from.team)) < 10 && len(to.vel) > 4;
    const dur = (d / speed) * (lob ? 1.6 : 1) + 0.06;
    this.ball.st = { kind: 'pass', from, to, a: { ...this.ball.p }, b: lead, t: 0, dur, lob, risky: d > from.safePassDist, checked: new Set() };
    this.lastPasser = from; this.lastPassAt = this.time;
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
  topSpeed(p: Player) { return this.time < p.burstUntil ? p.burstSpeed : p.runSpeed; }
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

    // ankle check vs the closest defender
    if (nd.d && nd.dist < 5.5 && nd.d.state !== 'fallen') {
      const def = nd.d;
      const prox = clamp01(1 - (nd.dist - 2) / 3.5);
      const ratio = Math.pow((p.sub.ankleBreak + 20) / (def.sub.ankleResist + 20), 2);
      const chance = m.ankle * p.mods.pMult('ankleMult') * (isCross ? p.mods.pMult('crossAnkle') : 1) * ratio * prox;
      if (m.pumpFake) {
        if (this.rng.chance(0.25 + 0.3 * ratio * prox)) { this.jump(def, 0.9); this.emit({ kind: 'move', text: `${def.name} bit on the pump fake`, pid: def.id }); }
      } else if (this.rng.chance(chance)) {
        this.knockDown(def, 1.3, 'ankles');
        this.emit({ kind: 'ankles', text: `ANKLES! ${def.name} hits the floor`, big: true, pid: p.id, team: p.team });
        this.gainUlt(p, ULT_GAINS.ankles);
      } else {
        def.staggerUntil = this.time + m.stagger * clamp(ratio, 0.5, 1.8) * prox;
      }
    }
  }

  setScreen(p: Player) {
    if (p.busy || this.time < p.screenCdUntil || this.holder() === p) return;
    p.state = 'screen'; p.stateT = 0; p.stateDur = 1.1; p.want = v(); p.vel = v();
    p.screenCdUntil = this.time + 1.6 * p.mods.pMult('screenCd');
    p.screenHit = false;
  }

  jump(p: Player, power: number) {
    if (p.z > 0 || p.busy) return;
    if (this.time < p.blockCdUntil) return;
    p.vz = p.jumpVel * power; p.state = 'jump'; p.lastJumpAt = this.time;
    p.blockCdUntil = this.time + 0.9;
  }

  swipe(p: Player) {
    if (this.time < p.swipeCdUntil || p.busy) return;
    p.swipeCdUntil = this.time + 0.8;
    p.swipingUntil = this.time + 0.3;
    const h = this.holder();
    if (!h || h.team === p.team) return;
    const dd = dist(h.p, p.p);
    if (dd > 4) return;
    const front = dot(norm(sub(p.p, h.p)), h.face) > -0.2 ? 1 : 0.4;
    const security = 0.6 + (h.sub.ballSpeed / 99) * 0.6;
    const chance = (0.06 + 0.16 * p.sub.steal / 99) * p.mods.pMult('stealChance') * front / security * (h.state === 'dribbleMove' ? 1.4 : 1);
    if (this.rng.chance(chance)) {
      p.box.stl++; h.box.tov++;
      this.emit({ kind: 'steal', text: `STEAL by ${p.name}!`, team: p.team, pid: p.id, big: true });
      this.gainUlt(p, ULT_GAINS.steal * p.mods.pMult('hustleBonus'));
      if (p === this.user) applyTrust(this.trust, 'stop', p.mods.pMult('hustleBonus'));
      if (h === this.user) applyTrust(this.trust, 'turnover');
      this.ball.st = { kind: 'loose', vel: scale(norm(sub(p.p, h.p)), 9), vz: 2, lastTeam: p.team };
    } else if (this.rng.chance(0.05)) {
      this.emit({ kind: 'foul', text: `Reach-in foul on ${p.name}`, team: p.team });
      this.shotClock = Math.max(this.shotClock, 14);
      this.deadBall(h.team, 1.0);
    }
  }

  takeCharge(p: Player) {
    if (p.busy || p.z > 0) return;
    p.state = 'charge'; p.stateT = 0; p.stateDur = 0.9; p.chargeSetAt = this.time; p.want = v(); p.vel = v();
  }

  /** Put a player on the floor (ankle break, charge, screen, poster). */
  knockDown(p: Player, dur: number, how: string) {
    p.state = 'fallen'; p.stateT = 0; p.stateDur = dur;
    p.anim = { name: how === 'ankles' ? 'ankleFall' : 'fall', start: this.time, dur };
  }

  /** Audio/animation-only event. */
  quiet(kind: string, data: Record<string, any> = {}, pid?: string) { this.emit({ kind, text: '', quiet: true, data, pid }); }

  gainUlt(p: Player, amount: number) {
    if (p !== this.user || !this.ult.state.unlocked) return;
    p.ultCharge = Math.min(100, p.ultCharge + amount);
  }

  // ---------- physics ----------
  private physics(dt: number) {
    for (const p of this.players) {
      p.stateT += dt;
      // timed states
      if (p.state === 'shoot' && p.stateT >= p.stateDur) this.releaseShot(p);
      if ((p.state === 'screen' || p.state === 'charge' || p.state === 'fallen' || p.state === 'dribbleMove') && p.stateT >= p.stateDur) {
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
        if (p.state === 'shoot') { p.vz = 9.5; p.vel = scale(p.vel, 0.45); } // plant the stride foot and rise
      }

      let want = p.want;
      if (p.deadDribble && this.holder() === p && p.state !== 'shoot') want = v();
      if (this.time < p.staggerUntil) want = scale(want, 0.25);
      if (this.time < p.screenedUntil) want = scale(want, 0.15);
      if (this.time < p.bumpedUntil) want = scale(want, 0.12);
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
        default: {
          const accel = p.z > 0 ? 1.5 : p === this.user && p.isUser ? 14 : 9;
          p.vel = add(p.vel, scale(sub(want, p.vel), Math.min(1, dt * accel)));
        }
      }
      p.p = this.clampFor(p, add(p.p, scale(p.vel, dt)));
      if (p.z > 0 || p.vz > 0) {
        p.vz -= 32 * dt; p.z += p.vz * dt;
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
    const stun = clamp((0.4 + (scr.sub.screen - def.sub.driveStability) / 99 * 0.8) * scr.mods.pMult('screenStun'), 0.15, 1.4);
    def.screenedUntil = this.time + stun;
    // knocked back off the screen: same stumble as losing a box-out
    def.p = this.clampFor(def, add(def.p, scale(norm(sub(def.p, scr.p)), this.rng.range(0.8, 1.4))));
    def.bumpedUntil = this.time + Math.min(stun, 0.6);
    def.anim = { name: 'bumped', start: this.time, dur: Math.min(stun, 0.6) };
    scr.lastScreenAt = this.time;
    this.quiet('screenHit', { stun }, scr.id);
    if (!scr.screenHit) {
      scr.screenHit = true;
      if (scr === this.user) { applyTrust(this.trust, 'screen'); this.gainUlt(scr, ULT_GAINS.screen); this.emit({ kind: 'screen', text: `Screen! ${def.name} is stuck`, good: true, pid: scr.id }); }
      if (scr.mods.pMult('screenStun') > 1.3 && this.rng.chance(0.2)) { this.knockDown(def, 1.0, 'screen'); this.emit({ kind: 'screen', text: `${def.name} flattened by the screen`, big: true }); }
    }
    if (this.switchAll) {
      const scrDef = this.defenderOf(scr);
      if (scrDef && scrDef !== def) { const g = def.guarding; def.guarding = scrDef.guarding; scrDef.guarding = g; }
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
      this.gainUlt(def, ULT_GAINS.charge * def.mods.pMult('hustleBonus'));
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
      case 'held': {
        const h = st.holder;
        b.p = add(h.p, scale(h.face, 0.9));
        b.z = h.state === 'shoot' ? h.z + h.height + 0.5 : 2.5 + Math.abs(Math.sin(this.time * 9)) * 1.2;
        break;
      }
      case 'pass': {
        st.t += dt;
        const k = clamp01(st.t / st.dur);
        b.p = lerpV(st.a, st.b, k);
        b.z = 4.5 + (st.lob ? 7 : 1.2) * Math.sin(Math.PI * k);
        for (const d of this.opp(st.from.team)) {
          if (st.checked.has(d.id) || d.state === 'fallen') continue;
          const swiping = this.time < (d.swipingUntil ?? 0);
          const r = 1.3 * d.mods.pMult('deflect') + (swiping ? 1.4 : 0);
          if (dist(d.p, b.p) < r && b.z < d.reach + d.z + 0.5) {
            st.checked.add(d.id);
            const chance = (st.inbound ? 0.4 : 1) * (0.04 + 0.16 * d.sub.steal / 99) * (st.risky ? 1.8 : 1) * (st.lob ? 0.25 : 1) * (swiping ? 1.8 : 1) * (this.time < d.staggerUntil ? 0.3 : 1);
            if (this.rng.chance(chance)) {
              d.box.stl++; st.from.box.tov++;
              this.emit({ kind: 'steal', text: `Picked off by ${d.name}!`, team: d.team, pid: d.id, big: true });
              this.gainUlt(d, ULT_GAINS.steal);
              if (d === this.user) applyTrust(this.trust, 'stop');
              if (st.from === this.user) applyTrust(this.trust, 'turnover');
              if (this.rng.chance(0.55)) { this.giveBall(d); this.changePossessionLive(d.team); }
              else b.st = { kind: 'loose', vel: scale(norm(sub(st.b, st.a)), 6), vz: 3, lastTeam: d.team };
              return;
            }
          }
        }
        if (k >= 1) {
          if (dist(st.to.p, b.p) < 3.5 && st.to.state !== 'fallen') {
            this.giveBall(st.to);
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
    let cands: { p: Player; score: number }[] = [];
    for (const p of this.players) {
      if (p.state === 'fallen' || p.state === 'shoot') continue;
      const r = (1.8 + p.sub.rebound / 99 * 0.9) * p.mods.pMult('grabRadius');
      if (dist(p.p, b.p) < r && b.z < p.reach + p.z) cands.push({ p, score: p.sub.rebound + this.rng.range(0, 45) + (p.boxedOut ? -15 : 0) });
    }
    if (!cands.length) return;
    cands.sort((a, c) => c.score - a.score);
    const g = cands[0].p;
    g.anim = { name: 'rebound', start: this.time, dur: 0.7 };
    if (g.z === 0 && g.state !== 'fallen') { g.vz = Math.max(g.vz, 7); g.state = 'jump'; }
    const wasShot = this.wasShotRebound;
    this.wasShotRebound = false;
    if (wasShot) {
      g.box.reb++;
      this.gainUlt(g, ULT_GAINS.rebound);
      if (g === this.user && g.team === this.possession) applyTrust(this.trust, 'offReb');
    }
    this.giveBall(g);
    if (g.team !== this.possession) {
      if (wasShot && this.user && this.userOnCourt && this.user.team === g.team) { this.gainUlt(this.user, ULT_GAINS.stop); }
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
      type: st.ev.type, swish: st.made && (st.rim ? st.rim.seq === 'swish' : st.ev.contest < 0.2 && ['mid', 'three', 'deep3'].includes(st.ev.type)), seq: st.rim?.seq,
      // cosmetic only: must not consume sim RNG
      board: !st.made && ((st.ev.dist * 7.13 + this.time * 3.7) % 1) < 0.3, pts: st.pts, team,
    }, s.id);
    if (st.made) {
      const before = t.score - this.teams[1 - team].score;
      const val = this.scoreValue(st.pts);
      t.score += val;
      s.box.pts += val; s.box.fgm++; if (st.pts === 3) s.box.tpm++;
      const after = t.score - this.teams[1 - team].score;
      if (before <= 0 && after > 0) this.lastGoAhead = { pid: s.id, clock: this.clock, quarter: this.quarter };
      const ast = this.assistCand && this.assistCand.receiver === s && this.time - this.assistCand.at < 5 ? this.assistCand.passer : null;
      if (ast) { ast.box.ast++; this.gainUlt(ast, ULT_GAINS.assist); if (ast === this.user) applyTrust(this.trust, 'assist'); }
      this.gainUlt(s, ULT_GAINS.score + (st.pts === 3 ? 4 : 0));
      if (s === this.user) applyTrust(this.trust, 'madeShot');
      const name = SHOT_TYPES[st.ev.type].name;
      this.emit({ kind: 'score', text: `${s.name} ${name}${ast ? ` (ast ${ast.name})` : ''} +${val}`, team, pid: s.id, big: st.ev.type === 'dunk' || st.pts === 3, good: true });
      if (st.ev.type === 'dunk' && st.ev.conds.has('contested') && s.mods.pAdd('posterize') > 0) {
        const nd = this.nearestDefender(s).d;
        if (nd && dist(nd.p, s.p) < 4) { this.knockDown(nd, 1.2, 'poster'); this.emit({ kind: 'poster', text: `POSTERIZED ${nd.name}!`, big: true }); }
      }
      this.checkLeftMan(s);
      this.assistCand = null;
      if (this.cfg.oneOnOne) {
        // make it, take it: scorer checks it again (fouls just count the bucket, no free throws)
        if (st.foul) this.emit({ kind: 'foul', text: 'Foul — bucket counts', team });
        if (this.checkWin()) return;
        this.deadBall(team, 1.1);
        return;
      }
      if (st.foul) { this.emit({ kind: 'foul', text: 'And-one!', team, big: true }); this.freeThrows(s, 1); }
      this.deadBall((1 - team) as 0 | 1, 1.1, 'baseline');
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
  }

  private freeThrows(p: Player, n: number): boolean {
    const pct = clamp(0.45 + p.sub.mid / 99 * 0.45, 0.4, 0.95);
    let made = 0; let last = false;
    for (let i = 0; i < n; i++) { last = this.rng.chance(pct); if (last) made++; }
    this.teams[p.team].score += made; p.box.pts += made;
    this.emit({ kind: 'ft', text: `${p.name} ${made}/${n} FT`, team: p.team });
    return last;
  }

  private checkLeftMan(scorer: Player) {
    const u = this.user;
    if (this.cfg.oneOnOne) return; // no team trust in 1v1
    if (!u || !this.userOnCourt || u.team === scorer.team || u.guarding !== scorer.id) return;
    if (dist(u.p, scorer.p) > 10) { applyTrust(this.trust, 'leftMan'); this.emit({ kind: 'grade', text: '✗ Your man scored — you left him', good: false, pid: u.id }); }
  }

  // ---------- HUD support ----------
  private updatePreview() {
    const h = this.holder();
    const u = h && this.isHuman(h) && (h === this.user || h === this.user2) ? h : null;
    if (u && u.state !== 'shoot') {
      const type = selectShotType(u, this.side(u.team), u === this.user ? this.stick : this.stick2, this.time);
      const ov = this.ult.active && this.ult.active.pid === u.id ? this.ult.active.shotOverride : undefined;
      this.preview = evaluateShot(u, this.opp(u.team), this.side(u.team), type, { now: this.time, clutch: this.clutch, override: ov });
    } else this.preview = null;
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

