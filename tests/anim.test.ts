import { describe, it, expect } from 'vitest';
import { CLIPS, CLIP, SHOT_CLIP, sampleClip, frameAt, shotU, JOINTS, rigArms, grippingHands, SHOULDER_DROP, UPPER_ARM, FOREARM, HOLD_NEAR } from '../src/render/anim';
import { randomAppearance } from '../src/render/appearance';
import { migrateCareer, newCareer } from '../src/career/career';
import { SHOT_TYPES, MOVES } from '../src/sim/data';
import { Rng } from '../src/sim/math';
import { Player } from '../src/sim/player';
import { makeGame, simToEnd } from './helpers';

describe('arm rig', () => {
  const d = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  it('lowers the shoulders and keeps ball-holding hands exactly on their keyed spot', () => {
    for (const c of CLIPS) for (const k of c.keys) {
      const r = rigArms(k.pose);
      // shoulders slide SHOULDER_DROP toward the hips (straight down when upright, sideways in falls)
      expect(d(r.sF, k.pose.sF)).toBeCloseTo(SHOULDER_DROP, 5);
      expect(d(r.sF, k.pose.hip)).toBeLessThan(d(k.pose.sF, k.pose.hip));
      for (const h of ['hF', 'hB'] as const) if (k.pose.ball && d(k.pose[h], k.pose.ball) < HOLD_NEAR) {
        expect(r[h][0]).toBeCloseTo(k.pose[h][0], 5); expect(r[h][1]).toBeCloseTo(k.pose[h][1], 5);
      }
    }
  });
  it('free arms (defense, off-ball) are full length and keep their shape', () => {
    const def = CLIP.defend.keys[0].pose, r = rigArms(def);
    for (const [s, e, h] of [['sF', 'eF', 'hF'], ['sB', 'eB', 'hB']] as const) {
      expect(d(r[s], r[e]) + d(r[e], r[h])).toBeGreaterThanOrEqual(UPPER_ARM + FOREARM - 0.01);
      expect(d(r[s], r[h])).toBeGreaterThan(d(def[s], def[h]));
    }
  });
  it('reports gripping hands only while the ball is in them', () => {
    expect(grippingHands(rigArms(CLIP.hold.keys[0].pose)).some(Boolean)).toBe(true);
    expect(grippingHands(rigArms(CLIP.defend.keys[0].pose))).toEqual([null, null]);
  });
});

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
  it('every dribble move has its own clip with at least 8 frames', () => {
    for (const id of Object.keys(MOVES)) {
      const c = CLIP[`move_${id}`];
      expect(c, id).toBeDefined();
      expect(c.frames, id).toBeGreaterThanOrEqual(8);
    }
  });
  it('the spin turns its back to the camera mid-move', () => {
    const c = CLIP.move_spin;
    expect(sampleClip(c, 0).backView).toBe(false);
    expect(sampleClip(c, 0.5).backView).toBe(true);
    expect(sampleClip(c, 1).backView).toBe(false);
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
    g.freezeAI = true; g.inb = null; g.live = true;
    const idle = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false };
    for (let i = 0; i < 90; i++) g.update(1 / 60, idle);
    expect(g.events.filter((e) => e.kind === 'bounce').length).toBeGreaterThanOrEqual(2);
  });
  it('shots and moves set the animation record the renderer reads', () => {
    const u = new Player({ id: 'USER', name: 'You', team: 0, pos: 'SG', core: { shooting: 70, finishing: 70, strength: 70, mobility: 70, playmaking: 70 }, nodes: ['dr_cross'], isUser: true });
    const g = makeGame({ mode: 'practice', practice: { defenders: 1, teammates: 0, runPlays: false } }, u);
    const idle = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false };
    for (let i = 0; i < 20; i++) g.update(1 / 60, { ...idle, move: { x: 0, y: 1 } });
    g.update(1 / 60, { ...idle, move: { x: 0, y: -1 }, b: true });
    expect(u.anim?.name).toBe('move_crossover');
    for (let i = 0; i < 40; i++) g.update(1 / 60, idle);
    g.update(1 / 60, { ...idle, a: true, aHeld: true });
    for (let i = 0; i < 12; i++) g.update(1 / 60, { ...idle, aHeld: true });
    expect(u.anim?.name.startsWith('shot_')).toBe(true);
    for (let i = 0; i < 60; i++) g.update(1 / 60, idle);
    expect(u.anim?.release).toBeDefined();
  });
});

describe('round 6 animation', () => {
  it('the crossover has at least 14 frames and Catmull-Rom still hits every key', () => {
    expect(CLIP.move_crossover.frames).toBeGreaterThanOrEqual(14);
    for (const name of ['move_crossover', 'boxout', 'rebound', 'dribbleReady']) {
      const c = CLIP[name];
      for (const k of c.keys) { const p = sampleClip(c, k.t); expect(p.hF[0]).toBeCloseTo(k.pose.hF[0], 5); expect(p.hF[1]).toBeCloseTo(k.pose.hF[1], 5); }
    }
  });
});

describe('pump fake + step-through animation', () => {
  it('both clips are smooth (14+ frames) and the fake starts/ends exactly on the hold pose', () => {
    expect(CLIP.pumpfake.frames).toBe(14);
    expect(CLIP.shot_stepThrough.frames).toBeGreaterThanOrEqual(14);
    const hold = sampleClip(CLIP.hold, 0);
    for (const u of [0, 1]) {
      const p = sampleClip(CLIP.pumpfake, u);
      for (const j of JOINTS) expect(p[j]).toEqual(hold[j]);
    }
    expect(sampleClip(CLIP.shot_stepThrough, 0).ball).toEqual(hold.ball);
  });
  it('the fake sells high (ball above the head at the top) and no joint jumps between frames', () => {
    const top = sampleClip(CLIP.pumpfake, 0.5);
    expect(top.ball![1]).toBeGreaterThan(top.head[1]);
    for (const name of ['pumpfake', 'shot_stepThrough']) {
      const c = CLIP[name];
      for (let i = 1; i < c.frames; i++) {
        const a = sampleClip(c, (i - 1) / (c.frames - 1)), b = sampleClip(c, i / (c.frames - 1));
        for (const j of JOINTS) expect(Math.hypot(a[j][0] - b[j][0], a[j][1] - b[j][1])).toBeLessThan(14);
      }
    }
  });
  it('the step-through stays on the floor through the stride (feet down until lift-off)', () => {
    const c = CLIP.shot_stepThrough;
    for (const u of [0.26, 0.37]) {
      const p = sampleClip(c, u);
      expect(Math.min(p.fF[1], p.fB[1])).toBeLessThanOrEqual(4);
    }
  });
});
