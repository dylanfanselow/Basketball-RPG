import { describe, it, expect } from 'vitest';
import { Player } from '../src/sim/player';
import { Rng, add, norm, scale, sub, v } from '../src/sim/math';
import { DUNKS, unlockedDunks, nextDunk, pickDunk } from '../src/sim/dunks';
import { CLIP } from '../src/render/anim';
import { NODES } from '../src/sim/data';
import { GameSim, UserInput } from '../src/sim/game';
import { makeGame } from './helpers';

const idle: UserInput = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false };
const core = (n = 70) => ({ shooting: n, finishing: n, strength: n, mobility: n, playmaking: n });
const DT = 1 / 60;
const withDunk = (rating: number) => { const p = new Player({ id: 'P', name: 'P', team: 0, pos: 'SF', core: core() }); p.sub.dunk = rating; return p; };

describe('dunk package: unlocks with the Dunk rating', () => {
  it('every dunk has a clip (and a Windmill Gather variant)', () => {
    for (const d of DUNKS) { expect(CLIP[d.clip], d.id).toBeTruthy(); expect(CLIP[`${d.clip}_wm`], d.id).toBeTruthy(); expect(CLIP[d.clip].release).toBe(0.7); }
  });
  it('unlocks follow the rating', () => {
    expect(unlockedDunks(withDunk(50)).map((d) => d.id)).toEqual(['flush', 'twoHand']);
    expect(unlockedDunks(withDunk(85)).map((d) => d.id)).toEqual(['flush', 'twoHand', 'tomahawk', 'hammer', 'cockBack', 'reverse', 'windmill']);
    expect(unlockedDunks(withDunk(99))).toHaveLength(DUNKS.length);
    expect(nextDunk(withDunk(80))?.id).toBe('windmill');
    expect(nextDunk(withDunk(99))).toBeNull();
  });
  it('contested = power dunks only; open and moving = flashy ones often; never a locked one', () => {
    const rng = new Rng(3), star = withDunk(99), low = withDunk(55);
    let flash = 0;
    for (let i = 0; i < 300; i++) {
      expect(pickDunk(star, { contested: true, speedToRim: 12, d: 4 }, rng).kind).toBe('power');
      if (pickDunk(star, { contested: false, speedToRim: 12, d: 4 }, rng).kind === 'flash') flash++;
      expect(pickDunk(low, { contested: false, speedToRim: 12, d: 4 }, rng).min).toBeLessThanOrEqual(55);
    }
    expect(flash).toBeGreaterThan(150);
  });
});

/** Practice: you driving at the rim from `ft` out (or standing), defender `defFt` in front. */
function drive(nodes: string[], ft = 7, speed = 14, defFt = 3, seed = 3) {
  const u = new Player({ id: 'USER', name: 'You', team: 0, pos: 'SF', core: core(90), nodes, isUser: true });
  const g = makeGame({ seed, mode: 'practice', practice: { defenders: 1, teammates: 0, runPlays: false } }, u);
  g.freezeAI = true;
  const d = g.teams[1].onCourt[0], rim = g.rim(u.team);
  u.p = add(rim, { x: -ft, y: 0.4 });
  const toRim = norm(sub(rim, u.p));
  d.p = add(u.p, scale(toRim, defFt)); d.vel = v();
  u.dribbledSinceCatch = true;
  g.update(DT, idle);
  u.vel = scale(toRim, speed);
  return { g, u, d, toRim };
}

describe('dunks and the Windmill Gather in the sim', () => {
  it('a dunk start picks a style clip; flashy dunks put their x term in the equation', () => {
    let flashTerm = false, styles = new Set<string>();
    for (let seed = 1; seed < 40; seed++) {
      const { g, u } = drive([], 4, 14, 9, seed);
      u.sub.dunk = 99;
      g.startShot(u, 'dunk');
      expect(CLIP[u.anim!.name], u.anim!.name).toBeTruthy();
      styles.add(u.anim!.name);
      for (let i = 0; i < 60 && !g.lastShot; i++) g.update(DT, idle);
      const ev = g.lastShot?.ev;
      if (ev?.terms.some((t: any) => /Windmill|360|Reverse/.test(t.label) && t.value < 1)) flashTerm = true;
    }
    expect(styles.size).toBeGreaterThan(3);
    expect(flashTerm).toBe(true);
  });
  it('Windmill Gather: driving layups get the _wm gather and x0.85 contest; standing still does not', () => {
    expect(NODES.dv_windmill.tree).toBe('driving');
    const a = drive(['dv_windmill']);
    a.g.startShot(a.u, 'layup');
    expect(a.u.anim!.name).toBe('shot_layup_wm');
    for (let i = 0; i < 60 && !a.g.lastShot; i++) a.g.update(DT, idle);
    expect(a.g.lastShot!.ev.terms.find((t) => t.kind === 'contest')!.label).toMatch(/Windmill Gather/);
    const b = drive(['dv_windmill'], 7, 0);
    b.g.startShot(b.u, 'layup');
    expect(b.u.anim!.name).toBe('shot_layup');
    const c = drive([]);
    c.g.startShot(c.u, 'layup');
    expect(c.u.anim!.name).toBe('shot_layup');
  });
  it('Windmill Gather: no strips during the gather', () => {
    let strips = 0, plain = 0;
    for (let seed = 1; seed <= 150; seed++) {
      for (const nodes of [['dv_windmill'], []]) {
        const { g, u, d } = drive(nodes, 7, 14, 2, seed);
        g.startShot(u, 'layup');
        d.sub.steal = 99; d.swipeCdUntil = 0;
        g.swipe(d);
        if (g.ball.st.kind === 'loose') { if (nodes.length) strips++; else plain++; }
      }
    }
    expect(strips).toBe(0);
    expect(plain).toBeGreaterThan(0);
  });
});

describe('High IQ (Perimeter D)', () => {
  it('playTarget names the set and the player it is for', () => {
    expect(NODES.pd_iq.tree).toBe('perimeter');
    const g = makeGame({ seed: 9, quarterLen: 120 });
    for (let i = 0; i < 60 * 40 && !g.playTarget(); i++) g.update(DT, idle);
    const pt = g.playTarget()!;
    expect(pt).toBeTruthy();
    expect(pt.play).toBe(g.runner.play!.name);
    expect(pt.target?.team).toBe(g.possession);
    if (g.runner.focusPid) expect(pt.target?.id).toBe(g.runner.focusPid);
    else expect(g.playRole(pt.target!)).toBe(g.runner.play!.focus);
  });
});

describe('loose ball: ✕ = dive', () => {
  const loose = (g: GameSim, at: { x: number; y: number }) => { g.ball.p = { ...at }; g.ball.z = 0.4; g.ball.st = { kind: 'loose', vel: v(), vz: 0, lastTeam: 1 }; };
  it('a loose ball on the floor turns ✕ into a dive that reaches it from further away and secures it', () => {
    const u = new Player({ id: 'USER', name: 'You', team: 0, pos: 'SF', core: core(70), isUser: true });
    const g = makeGame({ mode: 'practice', practice: { defenders: 1, teammates: 0, runPlays: false } }, u);
    g.freezeAI = true;
    const d = g.teams[1].onCourt[0]; d.p = { x: 10, y: 45 };
    loose(g, add(u.p, { x: 5.5, y: 0 }));
    expect(g.diveable()).toBe(true);
    g.update(DT, { ...idle, a: true, aHeld: true });
    expect(u.state).toBe('dive');
    expect(u.anim?.name).toBe('dive');
    for (let i = 0; i < 70 && g.holder() !== u; i++) g.update(DT, idle);
    expect(g.holder()).toBe(u);
    expect(u.deadDribble).toBe(true); // secured on the floor: pass it
    for (let i = 0; i < 70; i++) g.update(DT, idle);
    expect(u.state).toBe('idle');
  });
  it('a high bouncing ball is still a jump', () => {
    const u = new Player({ id: 'USER', name: 'You', team: 0, pos: 'SF', core: core(70), isUser: true });
    const g = makeGame({ mode: 'practice', practice: { defenders: 1, teammates: 0, runPlays: false } }, u);
    loose(g, add(u.p, { x: 8, y: 0 })); g.ball.z = 6;
    expect(g.diveable()).toBe(false);
  });
});
