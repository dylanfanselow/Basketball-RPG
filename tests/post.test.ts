import { describe, it, expect } from 'vitest';
import { Player } from '../src/sim/player';
import { add, dist, norm, scale, sub } from '../src/sim/math';
import { computeContest, postShotType, selectShotType } from '../src/sim/shooting';
import { POST, postGap, postMode } from '../src/sim/post';
import { GameSim, UserInput } from '../src/sim/game';
import { makeGame, simToEnd } from './helpers';

const idle: UserInput = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false };
const core = (n = 60, strength = n) => ({ shooting: n, finishing: n, strength, mobility: n, playmaking: n });
const DT = 1 / 60;

/** Practice 1-on-1: you 14 ft out with a live dribble, your defender on your rim side. AI frozen (no swipes). */
function setup(myStr: number, hisStr: number, nodes: string[] = []) {
  const u = new Player({ id: 'USER', name: 'You', team: 0, pos: 'PF', core: core(70, myStr), nodes, isUser: true });
  const g = makeGame({ mode: 'practice', practice: { defenders: 1, teammates: 0, runPlays: false } }, u);
  g.freezeAI = true;
  const d = g.teams[1].onCourt[0];
  d.core.strength = hisStr; d.recompute();
  const rim = g.rim(u.team);
  u.p = add(rim, { x: -14, y: 3 });
  const toRim = norm(sub(rim, u.p));
  d.p = add(u.p, scale(toRim, 2.4));
  u.dribbledSinceCatch = true;
  g.update(DT, idle);
  return { g, u, d, rim, toRim };
}
const post = (g: GameSim, move: { x: number; y: number }, secs: number, each?: () => void) => {
  for (let i = 0; i < Math.round(secs / DT); i++) { g.update(DT, { ...idle, move, postHeld: true }); each?.(); }
};

describe('post up (L2)', () => {
  it('strength gap picks the mode', () => {
    expect(postMode(12)).toBe('stronger'); expect(postMode(0)).toBe('even'); expect(postMode(-12)).toBe('weaker');
    const { u, d } = setup(95, 35);
    expect(postMode(postGap(u, d))).toBe('stronger');
  });

  it('stronger: discrete bumps toward the rim that stun-lock the defender (no contest)', () => {
    const { g, u, d, rim, toRim } = setup(95, 35);
    const d0 = dist(u.p, rim);
    let still = 0, moving = 0, prev = dist(u.p, rim), lockedTicks = 0;
    post(g, toRim, 2.5, () => {
      const r = dist(u.p, rim);
      if (prev - r > 1e-4) moving++; else still++;
      prev = r;
      if (g.time < d.postLockUntil) lockedTicks++;
    });
    expect(u.post?.mode).toBe('stronger');
    const gained = d0 - dist(u.p, rim);
    expect(gained).toBeGreaterThan(POST.BUMP_STEP * 2.5); // ~3 bumps
    expect(still).toBeGreaterThan(moving); // steps, not a glide
    expect(lockedTicks / Math.round(2.5 / DT)).toBeGreaterThan(0.8); // stun-locked while you keep bumping
    expect(dist(d.p, u.p)).toBeCloseTo(POST.GAP, 1); // on your back
    expect(computeContest(u, [d], g.side(u.team), 'hook', g.time).raw).toBe(0);
    expect(d.postedBy).toBe(u.id);
  });

  it('even: a slow continuous push; his contest is lower than a true contest', () => {
    const { g, u, d, rim, toRim } = setup(70, 70);
    const d0 = dist(u.p, rim);
    let still = 0;
    let prev = d0;
    post(g, toRim, 2, () => { const r = dist(u.p, rim); if (prev - r < 1e-4) still++; prev = r; });
    expect(u.post?.mode).toBe('even');
    expect(d0 - dist(u.p, rim)).toBeCloseTo(POST.EVEN_SPEED * 2, 0);
    expect(still).toBeLessThan(25); // continuous (just the start-up)
    const side = g.side(u.team);
    const leaned = computeContest(u, [d], side, 'hook', g.time).raw;
    d.postedBy = null;
    const full = computeContest(u, [d], side, 'hook', g.time).raw;
    d.postedBy = u.id;
    expect(leaned).toBeGreaterThan(0);
    expect(leaned).toBeLessThan(full * 0.7);
  });

  it('weaker: he bumps you back and stuns you for about a second', () => {
    const { g, u, rim, toRim } = setup(30, 99);
    let maxBack = 0, prev = dist(u.p, rim), stunnedAt = -1;
    post(g, toRim, 6, () => {
      const r = dist(u.p, rim);
      maxBack = Math.max(maxBack, r - prev); prev = r;
      if (stunnedAt < 0 && g.time < u.stunnedUntil) stunnedAt = g.time;
    });
    expect(stunnedAt).toBeGreaterThan(0);
    expect(u.stunnedUntil - u.postBumpedBackAt).toBeCloseTo(POST.BACK_STUN, 1);
    expect(maxBack).toBeGreaterThan(0); // pushed away from the rim
  });

  it('the stick only goes straight toward / away from the rim', () => {
    const { g, u, rim, toRim } = setup(70, 70);
    const lateral = { x: -toRim.y, y: toRim.x };
    const r0 = dist(u.p, rim), p0 = { ...u.p };
    post(g, lateral, 1.5);
    expect(dist(u.p, p0)).toBeLessThan(0.05); // sideways does nothing
    post(g, scale(toRim, -1), 1);
    expect(dist(u.p, rim)).toBeGreaterThan(r0 + POST.AWAY_SPEED * 0.8); // backing out
    expect(u.post).not.toBeNull();
  });

  it('letting go opens a window: the defender stays locked through a post hook (contest 0)', () => {
    const { g, u, d, toRim } = setup(95, 35);
    post(g, toRim, 1.2);
    g.update(DT, idle); // let go of L2 and the stick
    expect(u.post).toBeNull();
    expect(u.postWindowUntil).toBeGreaterThan(g.time);
    expect(d.postLockUntil).toBeGreaterThanOrEqual(u.postWindowUntil);
    const lateral = { x: -toRim.y, y: toRim.x };
    g.update(DT, { ...idle, move: lateral, a: true, aHeld: true });
    for (let i = 0; i < 14 && u.state !== 'shoot'; i++) g.update(DT, { ...idle, move: lateral, aHeld: true });
    expect(u.pendingShot?.type).toBe('hook');
    for (let i = 0; i < 60 && g.ball.st.kind !== 'shot'; i++) g.update(DT, idle);
    expect(g.ball.st.kind).toBe('shot');
    expect((g.ball.st as any).ev.contest).toBe(0);
  });

  it('even: the window seals him (reduced contest through the release)', () => {
    const { g, u, d, toRim } = setup(70, 70);
    post(g, toRim, 1);
    g.update(DT, idle);
    expect(d.postSealUntil).toBeGreaterThan(g.time);
    g.update(DT, { ...idle, a: true, aHeld: true });
    for (let i = 0; i < 14 && u.state !== 'shoot'; i++) g.update(DT, { ...idle, aHeld: true });
    expect(g.time < d.postSealUntil).toBe(true);
    for (let i = 0; i < 60 && g.ball.st.kind !== 'shot'; i++) g.update(DT, idle);
    const ev = (g.ball.st as any).ev;
    expect(ev.terms.find((t: any) => t.kind === 'contest').label).toMatch(/sealed/);
  });

  it('post shots: sideways hook, toward layup/push, away fade (if unlocked) or floater, neutral layup/hook', () => {
    const { g, u, rim, toRim } = setup(70, 70);
    const side = g.side(u.team), lat = { x: -toRim.y, y: toRim.x }, away = scale(toRim, -1), none = { x: 0, y: 0 };
    u.p = add(rim, scale(toRim, -10));
    expect(postShotType(u, side, lat)).toBe('hook');
    expect(postShotType(u, side, toRim)).toBe('push');
    expect(postShotType(u, side, away)).toBe('floater');
    expect(postShotType(u, side, none)).toBe('hook');
    u.p = add(rim, scale(toRim, -5));
    expect(postShotType(u, side, toRim)).toBe('layup');
    expect(postShotType(u, side, none)).toBe('layup');
    const f = setup(70, 70, ['sh_fade']);
    expect(postShotType(f.u, side, scale(f.toRim, -1))).toBe('fade');
    // the normal picker uses them while posting / in the window
    post(g, toRim, 0.3);
    expect(selectShotType(u, side, lat, g.time)).toBe('hook');
  });

  it('AI bigs post up in real games', () => {
    let posts = 0;
    for (const seed of [3, 5]) {
      const g = makeGame({ seed, quarterLen: 90 });
      const orig = g.emit.bind(g);
      g.emit = (e) => { if (e.kind === 'post') posts++; orig(e); };
      simToEnd(g);
    }
    expect(posts).toBeGreaterThan(1);
  }, 20000);
});
