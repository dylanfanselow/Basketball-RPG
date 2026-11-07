import { describe, it, expect } from 'vitest';
import { Player } from '../src/sim/player';
import { add, dist, norm, scale, sub } from '../src/sim/math';
import { computeContest, postShotType, selectShotType } from '../src/sim/shooting';
import { POST, postGap, postMode, helpChance } from '../src/sim/post';
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
    expect(lockedTicks / Math.round((2.5 - POST.FIRST_BUMP) / DT)).toBeGreaterThan(0.95); // stun-locked from the first bump on (round 44: it comes after FIRST_BUMP)
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

  it('round 44: a post is a commitment, mashing L2 gets no window, and you can\'t re-post right away', () => {
    const { g, u, d, toRim } = setup(95, 35);
    post(g, toRim, 0.15);              // tap
    g.update(DT, idle);                 // let go at once
    expect(u.post).not.toBeNull();      // still committed
    for (let i = 0; i < Math.round(POST.COMMIT / DT); i++) g.update(DT, idle);
    expect(u.post).toBeNull();
    expect(u.postWindowUntil).toBeLessThan(g.time); // no bump landed: no window, no lock
    expect(g.time < d.postLockUntil).toBe(false);
    post(g, toRim, 0.3);                // mash again: still recovering
    expect(u.post).toBeNull();
    for (let i = 0; i < Math.round(POST.REPOST_CD / DT); i++) g.update(DT, idle);
    post(g, toRim, 0.2);
    expect(u.post).not.toBeNull();      // ready again
  });

  it('round 44: posting exposes the ball (likelier steals) and big mismatches draw a double team', () => {
    expect(helpChance(0)).toBe(0); expect(helpChance(POST.HELP_GAP)).toBeCloseTo(POST.HELP_MIN); expect(helpChance(15)).toBeGreaterThan(helpChance(7));
    expect(helpChance(60)).toBe(POST.HELP_MAX);
    // steals: the chance a swipe gets (read off the rng call), posting vs facing him
    const chanceOf = (posting: boolean) => {
      const { g, d, toRim } = setup(70, 70);
      if (posting) post(g, toRim, 0.3);
      let seen = 0; const rng = (g as any).rng; const orig = rng.chance.bind(rng);
      rng.chance = (c: number) => { if (!seen) seen = c; return false; };
      d.swipeCdUntil = 0; d.stunnedUntil = -9; g.swipe(d);
      rng.chance = orig;
      return seen;
    };
    const rate = (posting: boolean) => chanceOf(posting);
    expect(rate(true)).toBeGreaterThan(rate(false) * 1.2); // even the man on your back gets a better reach-in (helpers more)
  });

  it('round 44: a kick-out from the post is marked for its own animation', () => {
    const u = new Player({ id: 'USER', name: 'You', team: 0, pos: 'PF', core: core(70, 95), isUser: true });
    const g = makeGame({ mode: 'practice', practice: { defenders: 1, teammates: 1, runPlays: false } }, u);
    g.freezeAI = true;
    const d = g.teams[1].onCourt[0], mate = g.teams[0].onCourt.find((q) => q !== u)!;
    d.core.strength = 35; d.recompute();
    const rim = g.rim(u.team);
    u.p = add(rim, { x: -12, y: 3 }); const toRim = norm(sub(rim, u.p));
    d.p = add(u.p, scale(toRim, 2.4)); mate.p = add(rim, { x: -20, y: -14 });
    u.dribbledSinceCatch = true; g.update(DT, idle);
    post(g, toRim, 0.6);
    expect(u.post).not.toBeNull();
    g.pass(u, mate);
    expect(g.lastPostPassAt).toBe(g.lastPassAt);
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

  it('round 44: in real games the defense doubles mismatched posts and the AI kicks it out', () => {
    let doubles = 0, kicks = 0, posts = 0;
    // round 51: rhythm notch boosts lift the lower stats most, so big strength gaps (and post doubles) are rarer: sample more games
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const g = makeGame({ seed, quarterLen: 120 });
      const orig = g.emit.bind(g);
      g.emit = (e) => { if (e.kind === 'post' && /DOUBLE TEAM/.test(e.text)) doubles++; if (e.kind === 'post' && /^POST UP/.test(e.text)) posts++; orig(e); };
      let lastKick = g.lastPostPassAt;
      const origUpdate = g.update.bind(g);
      g.update = (dt: number, inp: UserInput) => { origUpdate(dt, inp); if (g.lastPostPassAt !== lastKick) { kicks++; lastKick = g.lastPostPassAt; } };
      simToEnd(g);
    }
    console.log(`posts ${posts}, doubles ${doubles}, kick-outs ${kicks}`);
    expect(doubles).toBeGreaterThan(0);
    expect(kicks).toBeGreaterThan(0);
  }, 180000);
});

describe('round 63: no hooks from three', () => {
  it('a post shot from beyond the arc is a jumper (three / deep three, or a fade if owned and stick away)', () => {
    const { g, u, rim, toRim } = setup(95, 35);
    u.p = sub(rim, scale(toRim, 24));
    const lateral = { x: -toRim.y, y: toRim.x };
    u.postWindowUntil = g.time + 1; // still in the post window
    for (const stick of [lateral, toRim, { x: 0, y: 0 }]) expect(selectShotType(u, g.side(u.team), stick, g.time)).toBe('three');
    const fader = setup(95, 35, ['sh_root', 'sh_midrhythm', 'sh_fade']);
    fader.u.p = sub(fader.rim, scale(fader.toRim, 24)); fader.u.postWindowUntil = fader.g.time + 1;
    expect(selectShotType(fader.u, fader.g.side(fader.u.team), scale(fader.toRim, -1), fader.g.time)).toBe('fade');
    // inside the arc the post hook is still there
    u.p = sub(rim, scale(toRim, 13));
    expect(selectShotType(u, g.side(u.team), lateral, g.time)).toBe('hook');
  });
});
