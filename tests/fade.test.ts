import { describe, it, expect } from 'vitest';
import { Player } from '../src/sim/player';
import { add, norm, scale, sub } from '../src/sim/math';
import { selectShotType, contestReach, coneHalf, computeContest, evaluateShot, fadeFalloff, CONE_HALF } from '../src/sim/shooting';
import { rimPos, Side } from '../src/sim/court';

const core = (n = 70) => ({ shooting: n, finishing: n, strength: n, mobility: n, playmaking: n });
const side: Side = 1;
const rim = rimPos(side);
const at = (p: Player, ft: number, dir = { x: -1, y: 0 }) => { p.p = add(rim, scale(norm(dir), ft)); return p; };

describe('Fade Away (unlockable)', () => {
  const me = (nodes: string[] = ['sh_fade']) => new Player({ id: 'U', name: 'U', team: 0, pos: 'SF', core: core(), nodes });
  it('stick away + shoot = fade at any distance once unlocked; a floater / normal shot without it', () => {
    for (const ft of [6, 10, 20, 25]) {
      const p = at(me(), ft);
      const away = norm(sub(p.p, rim));
      expect(selectShotType(p, side, away, 100)).toBe('fade');
      const q = at(me([]), ft);
      expect(selectShotType(q, side, away, 100)).not.toBe('fade');
    }
    expect(selectShotType(at(me([]), 10), side, { x: -1, y: 0 }, 100)).toBe('floater');
    // Step-Through still wins right after a pump fake (stick toward the rim)
    const p = at(me(), 14); p.pumpFakeAt = 99.5;
    expect(selectShotType(p, side, { x: 1, y: 0 }, 100)).toBe('stepThrough');
  });
  it('a smaller cone: shorter and narrower than the jumper', () => {
    expect(contestReach('fade')).toBeLessThan(contestReach('mid'));
    expect(coneHalf('fade')).toBeLessThan(CONE_HALF);
    // a defender 4.5 ft out contests a mid but not a fade
    const p = at(me(), 16);
    const d = new Player({ id: 'D', name: 'D', team: 1, pos: 'SF', core: core() });
    d.p = add(p.p, scale(norm(sub(rim, p.p)), 4.5));
    expect(computeContest(p, [d], side, 'mid', 0).raw).toBeGreaterThan(0.05);
    expect(computeContest(p, [d], side, 'fade', 0).raw).toBe(0);
  });
  it('accuracy falls off exponentially with distance (shown as an equation term)', () => {
    expect(fadeFalloff(8)).toBe(1);
    expect(fadeFalloff(24) / fadeFalloff(16)).toBeCloseTo(fadeFalloff(16) / fadeFalloff(8), 6); // constant ratio per 8 ft
    const e12 = evaluateShot(at(me(), 12), [], side, 'fade', { now: 0, clutch: false });
    const e20 = evaluateShot(at(me(), 20), [], side, 'fade', { now: 0, clutch: false });
    const t = (e: typeof e12) => e.terms.find((x) => x.kind === 'fade')!.value;
    expect(t(e20)).toBeLessThan(t(e12));
    expect(t(e20)).toBeCloseTo(Math.exp(-12 / 16), 5);
    const mid20 = evaluateShot(at(me(), 20), [], side, 'mid', { now: 0, clutch: false });
    expect(e20.pct).toBeLessThan(mid20.pct * 0.6); // open, a fade is a worse shot than the jumper
  });
});
