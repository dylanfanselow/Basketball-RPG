import { describe, it, expect } from 'vitest';
import { CLIPS, JOINTS, sampleClip } from '../src/render/anim';
import { lift, view, toRad, SHOULDER_HALF } from '../src/render/pose3d';

describe('pose3d (multi-angle players)', () => {
  const poses = CLIPS.flatMap((c) => c.keys.map((k) => k.pose)).filter((p) => !p.open);
  it('yaw 0 is exactly the authored side view', () => {
    for (const p of poses) {
      const v = view(p, 0).pose;
      for (const j of JOINTS) { expect(v[j][0]).toBeCloseTo(p[j][0], 9); expect(v[j][1]).toBeCloseTo(p[j][1], 9); }
    }
  });
  it('yaw 180 mirrors it, and 3D bone lengths are the same at every yaw', () => {
    const p = sampleClip(CLIPS.find((c) => c.name === 'jog')!, 0.3);
    const m = view(p, Math.PI).pose;
    for (const j of JOINTS) expect(m[j][0]).toBeCloseTo(-p[j][0], 9);
    const p3 = lift(p), len3 = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    expect(len3(p3.sF, p3.eF)).toBeCloseTo(Math.hypot(p.sF[0] - p.eF[0], p.sF[1] - p.eF[1]), 9);
  });
  it('near-side limbs are in front at yaw 0; facing the camera puts both shoulders level in depth', () => {
    const p = CLIPS[0].keys[0].pose;
    const d0 = view(p, 0).depth;
    expect(d0.sF).toBeGreaterThan(d0.sB);
    const v90 = view(p, toRad(90));
    expect(v90.pose.sF[0]).toBeCloseTo(p.sF[0] * 0 - SHOULDER_HALF, 6); // the player's right side is on screen-left
  });
  it('lateral spread (lat) is invisible from the side but shows when turned', () => {
    const p = { ...CLIPS[0].keys[0].pose, lat: { fF: 12, fB: -12 } };
    expect(view(p, 0).pose.fF[0]).toBeCloseTo(p.fF[0], 9);
    const f = view(p, toRad(90)).pose;
    expect(Math.abs(f.fF[0] - f.fB[0])).toBeCloseTo(24, 6);
  });
});
