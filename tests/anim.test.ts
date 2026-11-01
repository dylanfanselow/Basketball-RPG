import { describe, it, expect } from 'vitest';
import { CLIPS, CLIP, SHOT_CLIP, sampleClip, frameAt, shotU, JOINTS, rigArms, ARM_DROP, UPPER_ARM, FOREARM, HOLD_NEAR, limb, ARM_U, ARM_F, THIGH, SHIN, shuffleState } from '../src/render/anim';
import { randomAppearance } from '../src/render/appearance';
import { migrateCareer, newCareer } from '../src/career/career';
import { SHOT_TYPES, MOVES } from '../src/sim/data';
import { Rng } from '../src/sim/math';
import { Player } from '../src/sim/player';
import { makeGame, simToEnd } from './helpers';

describe('arm rig', () => {
  const d = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const ARMS = [['sF', 'eF', 'hF'], ['sB', 'eB', 'hB']] as const;
  const isBallClip = (c: (typeof CLIPS)[number]) => c.keys.some((k) => !!k.pose.ball);
  it('lowers the arm sockets ARM_DROP toward the hips in every clip', () => {
    for (const c of CLIPS) for (const k of c.keys) {
      const r = rigArms(k.pose, isBallClip(c));
      expect(d(r.sF, k.pose.sF)).toBeCloseTo(ARM_DROP, 5);
      expect(d(r.sF, k.pose.hip)).toBeLessThan(d(k.pose.sF, k.pose.hip));
    }
  });
  it('ball clips (dribbles, moves, shots) move arms rigidly: same keyed lengths and shape', () => {
    for (const c of CLIPS.filter(isBallClip)) for (const k of c.keys) {
      const r = rigArms(k.pose, true);
      for (const [s, e, h] of ARMS) {
        expect(d(r[s], r[e])).toBeCloseTo(d(k.pose[s], k.pose[e]), 5);
        expect(d(r[e], r[h])).toBeCloseTo(d(k.pose[e], k.pose[h]), 5);
        expect(d(r[s], r[h])).toBeCloseTo(d(k.pose[s], k.pose[h]), 5);
      }
    }
  });
  it('a held ball moves with the hands; a dribbled ball on the floor stays put', () => {
    for (const pose of [CLIP.hold.keys[0].pose, CLIP.shot_jumper.keys[1].pose]) {
      const r = rigArms(pose, true);
      expect(d(r.hF, r.ball!)).toBeCloseTo(d(pose.hF, pose.ball!), 5);
      expect(d(pose.hF, pose.ball!)).toBeLessThan(HOLD_NEAR);
    }
    const low = CLIP.dribble.keys.find((k) => k.pose.ball![1] < 10)!.pose, r = rigArms(low, true);
    expect(r.ball).toEqual(low.ball);
  });
  it('free clips (off-ball) get full-length arms with the same shape', () => {
    expect(isBallClip(CLIP.jog)).toBe(false);
    const def = CLIP.jog.keys[0].pose, r = rigArms(def, false);
    for (const [s, e, h] of ARMS) {
      expect(d(r[s], r[e]) + d(r[e], r[h])).toBeGreaterThanOrEqual(UPPER_ARM + FOREARM - 0.01);
      expect(d(r[s], r[h])).toBeGreaterThan(d(def[s], def[h]));
    }
  });
});

describe('round 12 clips', () => {
  const d = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  it('limb keeps its bone lengths and reaches the target when it can', () => {
    const r = limb([0, 0], [10, -15], ARM_U, ARM_F, -1);
    expect(d([0, 0], r.mid)).toBeCloseTo(ARM_U, 5); expect(d(r.mid, r.end)).toBeCloseTo(ARM_F, 5);
    expect(r.end).toEqual([10, -15]);
    const far = limb([0, 0], [0, -80], ARM_U, ARM_F, -1);
    expect(d([0, 0], far.end)).toBeCloseTo(ARM_U + ARM_F, 5);
  });
  it('dribbling arms keep a constant length (the ball comes up to the hand)', () => {
    for (const name of ['dribble', 'dribbleRun', 'dribbleReady']) {
      const c = CLIP[name];
      for (let i = 0; i < c.frames; i++) {
        const p = sampleClip(c, i / c.frames);
        expect(d(p.sF, p.eF) + d(p.eF, p.hF)).toBeGreaterThan(ARM_U + ARM_F - 1);
        expect(d(p.sF, p.eF) + d(p.eF, p.hF)).toBeLessThan(ARM_U + ARM_F + 0.5);
        expect(p.hF[1]).toBeGreaterThan(36); // hand stays around the hip, never down at the knee
      }
    }
  });
  it('jumper: ball rises from the dribble through a pocket in front of the chest to the release', () => {
    const c = CLIP.shot_jumper, keys = c.keys.filter((k) => k.pose.ball);
    for (let i = 1; i < keys.length; i++) expect(keys[i].pose.ball![1]).toBeGreaterThan(keys[i - 1].pose.ball![1]);
    const pocket = keys.find((k) => k.pose.ball![1] > 62 && k.pose.ball![1] < 76)!;
    expect(pocket.pose.ball![0]).toBeGreaterThan(6);
    expect(keys[keys.length - 1].t).toBe(c.release);
  });
  it('defense is a slight squat: hips below standing and both knees bent', () => {
    const p = CLIP.defend.keys[0].pose;
    expect(p.hip[1]).toBeLessThan(47); // standing hip is 51
    const ang = (a: number[], b: number[], c: number[]) => {
      const u = [a[0] - b[0], a[1] - b[1]], v = [c[0] - b[0], c[1] - b[1]];
      return (Math.acos((u[0] * v[0] + u[1] * v[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]))) * 180) / Math.PI;
    };
    expect(ang(p.hip, p.kF, p.fF)).toBeLessThan(165);
    expect(ang(p.hip, p.kB, p.fB)).toBeLessThan(165);
  });
});

describe('round 13 clips', () => {
  const d = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  it('side drive and dribbling burst keep the dribbling arm at a fixed length, hand at the hip', () => {
    for (const name of ['move_lateral', 'dribbleBurst']) {
      const c = CLIP[name];
      for (let i = 0; i < c.frames; i++) {
        const p = sampleClip(c, i / c.frames);
        expect(Math.abs(d(p.sF, p.eF) + d(p.eF, p.hF) - (ARM_U + ARM_F))).toBeLessThan(1.5); // in-betweens drift ~1 unit
        expect(p.hF[1]).toBeGreaterThan(40);
      }
    }
  });
  it('sprint burst leans further and strides longer than the normal sprint', () => {
    const b = CLIP.burst.keys[0].pose, s = CLIP.sprint.keys[0].pose;
    expect(b.neck[0]).toBeGreaterThan(s.neck[0] + 3);
    expect(b.fF[0] - b.fB[0]).toBeGreaterThan(s.fF[0] - s.fB[0] + 5);
  });
});

describe('round 14: defensive shuffle', () => {
  const d = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  it('steps with one foot planted at a time and is widest mid-cycle', () => {
    const c = CLIP.slide, at = (t: number) => sampleClip(c, t);
    expect(at(0.25).fF[1]).toBeGreaterThan(2); expect(at(0.25).fB[1]).toBeLessThan(0.5);
    expect(at(0.75).fB[1]).toBeGreaterThan(2); expect(at(0.75).fF[1]).toBeLessThan(0.5);
    const w = (t: number) => at(t).lat!.fF! - at(t).lat!.fB!; // the shuffle steps sideways
    expect(w(0.5)).toBeGreaterThan(w(0) + 10);
    for (let i = 0; i < c.frames; i++) {
      const p = at(i / c.frames);
      for (const [k, f] of [['kF', 'fF'], ['kB', 'fB']] as const) expect(Math.abs(d(p.hip, p[k]) + d(p[k], p[f]) - (THIGH + SHIN))).toBeLessThan(1.5);
    }
  });
});

describe('round 16: defensive stance spreads sideways for multi-angle drawing', () => {
  it('defend and slide carry a lat spread: feet wide, knees out over them, arms out to the sides', () => {
    for (const name of ['defend', 'slide']) for (const k of CLIP[name].keys) {
      const l = k.pose.lat!;
      expect(l.fF! - l.fB!).toBeGreaterThan(20);
      expect(Math.abs(l.kF!)).toBeLessThan(Math.abs(l.fF!)); expect(l.hF!).toBeGreaterThan(20); expect(l.hB!).toBeLessThan(-20);
    }
  });
  it('the idle stance is alive: bounce and moving hands', () => {
    const ks = CLIP.defend.keys.map((k) => k.pose);
    expect(new Set(ks.map((p) => p.hip[1])).size).toBeGreaterThan(1);
    expect(new Set(ks.map((p) => p.hF[1])).size).toBeGreaterThan(2);
  });
});

describe('round 17: calm defensive stance', () => {
  it('defend hands drift only slightly across the loop (no shaking)', () => {
    const ys = CLIP.defend.keys.map((k) => k.pose.hF[1]), xs = CLIP.defend.keys.map((k) => k.pose.hF[0]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(3);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(1.5);
  });
  it('stance/shuffle switch has hysteresis', () => {
    expect(shuffleState(0.45, false)).toBe(false); // not enough to start
    expect(shuffleState(0.7, false)).toBe(true);
    expect(shuffleState(0.45, true)).toBe(true); // keeps shuffling
    expect(shuffleState(0.2, true)).toBe(false);
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
