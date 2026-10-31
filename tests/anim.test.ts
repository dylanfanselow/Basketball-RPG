import { describe, it, expect } from 'vitest';
import { CLIPS, CLIP, SHOT_CLIP, sampleClip, frameAt, shotU, JOINTS } from '../src/render/anim';
import { randomAppearance } from '../src/render/appearance';
import { migrateCareer, newCareer } from '../src/career/career';
import { SHOT_TYPES } from '../src/sim/data';
import { Rng } from '../src/sim/math';
import { Player } from '../src/sim/player';
import { makeGame, simToEnd } from './helpers';

describe('keyframe animation', () => {
  it('sampling at a key time returns that key exactly', () => {
    for (const c of CLIPS) for (const k of c.keys) {
      const p = sampleClip(c, k.t);
      for (const j of JOINTS) { expect(p[j][0]).toBeCloseTo(k.pose[j][0], 5); expect(p[j][1]).toBeCloseTo(k.pose[j][1], 5); }
    }
  });
  it('in-betweens differ from both neighbouring keys (smooth motion)', () => {
    const c = CLIP.shot_jumper;
    const mid = sampleClip(c, (c.keys[1].t + c.keys[2].t) / 2);
    expect(mid.hF[1]).toBeGreaterThan(c.keys[1].pose.hF[1]);
    expect(mid.hF[1]).toBeLessThan(c.keys[2].pose.hF[1]);
  });
  it('every sim shot type has its own clip, and floaters/jumpers/hooks/layups/dunks are distinct', () => {
    for (const t of Object.keys(SHOT_TYPES)) expect(CLIP[SHOT_CLIP[t]]).toBeDefined();
    const five = ['mid', 'floater', 'hook', 'layup', 'dunk'].map((t) => SHOT_CLIP[t]);
    expect(new Set(five).size).toBe(5);
  });
  it('shot windup walks frames forward from 0 up to the release frame', () => {
    const c = CLIP.shot_jumper;
    const start = 10, release = 10.5;
    let last = -1;
    for (let t = start; t <= release; t += 0.02) {
      const f = frameAt(c, shotU(c, t, start, release));
      expect(f).toBeGreaterThanOrEqual(last);
      last = f;
    }
    expect(frameAt(c, shotU(c, start, start, release))).toBe(0);
    expect(last).toBe(frameAt(c, c.release!));
    expect(frameAt(c, shotU(c, release + 5, start, release))).toBe(c.frames - 1);
  });
  it('dribble clips carry the ball to the floor at their bounce point', () => {
    for (const name of ['dribble', 'dribbleRun']) {
      const c = CLIP[name];
      for (const b of c.bounce!) expect(sampleClip(c, b).ball![1]).toBeLessThan(6);
    }
  });
});

describe('appearance', () => {
  it('is deterministic per seed and varied across seeds', () => {
    const a = (s: number) => { const r = new Rng(s); return randomAppearance(() => r.next()); };
    expect(a(5)).toEqual(a(5));
    const looks = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify([a(i).hair, a(i).skin, a(i).socks])));
    expect(looks.size).toBeGreaterThan(15);
  });
  it('old v1 saves migrate and get an appearance', () => {
    const old: any = { ...newCareer('Old', 'PG'), version: 1 };
    delete old.appearance;
    const m = migrateCareer(old)!;
    expect(m.version).toBe(2);
    expect(m.appearance.hair).toBeDefined();
  });
});

describe('audio/animation events from the sim', () => {
  it('a full game emits rim, net, bounce, pass, catch, screen and release events', () => {
    const kinds = new Set<string>();
    let swish = false;
    for (const seed of [3, 4, 5]) {
      const g = makeGame({ seed });
      simToEnd(g);
      for (const e of g.events) if (e.quiet) kinds.add(e.kind);
      swish ||= g.events.some((e) => e.kind === 'net' && e.data?.swish);
    }
    for (const k of ['rim', 'net', 'pass', 'catch', 'screenHit', 'release', 'gather']) expect(kinds).toContain(k);
    expect(swish).toBe(true);
  });
  it('a loose ball nobody reaches bounces on the floor', () => {
    const g = makeGame({ seed: 1 });
    for (const p of g.players) p.p = { x: 80, y: 40 };
    g.ball.st = { kind: 'loose', vel: { x: 0, y: 0 }, vz: 0, lastTeam: 0 };
    g.ball.p = { x: 20, y: 10 }; g.ball.z = 8;
    g.freezeAI = true;
    const idle = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false };
    for (let i = 0; i < 90; i++) g.update(1 / 60, idle);
    expect(g.events.filter((e) => e.kind === 'bounce').length).toBeGreaterThanOrEqual(2);
  });
  it('shots and moves set the animation record the renderer reads', () => {
    const u = new Player({ id: 'USER', name: 'You', team: 0, pos: 'SG', core: { shooting: 70, finishing: 70, strength: 70, mobility: 70, playmaking: 70 }, nodes: ['dr_cross'], isUser: true });
    const g = makeGame({ mode: 'practice', practice: { defenders: 1, teammates: 0, runPlays: false } }, u);
    const idle = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false };
    g.update(1 / 60, { ...idle, move: { x: 0, y: -1 }, b: true });
    expect(u.anim?.name).toBe('move_crossover');
    for (let i = 0; i < 40; i++) g.update(1 / 60, idle);
    g.update(1 / 60, { ...idle, a: true });
    expect(u.anim?.name.startsWith('shot_')).toBe(true);
    for (let i = 0; i < 60; i++) g.update(1 / 60, idle);
    expect(u.anim?.release).toBeDefined();
  });
});
