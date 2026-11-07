import { describe, it, expect } from 'vitest';
import { Player } from '../src/sim/player';
import { hc } from '../src/sim/court';
import { UserInput } from '../src/sim/game';
import { canCatch } from '../src/sim/ai/offense';
import { makeGame, simToEnd } from './helpers';

/** Round 61b: passes go to the receiver, not to where he was (or was supposed to be). */
const idle: UserInput = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false };
const core = (n = 70) => ({ shooting: n, finishing: n, strength: n, mobility: n, playmaking: n });

const mk = (seed = 3) => {
  const u = new Player({ id: 'USER', name: 'You', team: 0, pos: 'SG', core: core(), isUser: true });
  const g = makeGame({ seed, mode: 'practice', practice: { defenders: 1, teammates: 1, runPlays: false } }, u);
  g.freezeAI = true;
  const m = g.teams[0].onCourt.find((p) => p !== u)!;
  const d = g.teams[1].onCourt[0];
  d.p = hc(1, 80, 45); // out of the way
  g.giveBall(m); g.possession = 0; g.live = true;
  return { g, u, m, d };
};
/** Play out the pass with this input for the receiver; who has it after. */
/** Throw it from where the passer stands now (the ball follows the holder only on an update). */
const throwIt = (g: ReturnType<typeof mk>['g'], from: Player, to: Player) => { g.giveBall(from); g.ball.p = { ...from.p }; g.pass(from, to); };
const fly = (g: ReturnType<typeof mk>['g'], input: (t: number) => UserInput) => {
  const t0 = g.time;
  for (let i = 0; i < 120 && g.ball.st.kind === 'pass'; i++) g.update(1 / 60, input(g.time - t0));
  return g.holder();
};

describe('round 61b: passes find the receiver', () => {
  it('a long pass to you is caught even when you turn around mid-flight (it used to fly to where you were heading)', () => {
    let caught = 0;
    for (let s = 1; s <= 10; s++) {
      const { g, u, m } = mk(s);
      m.p = hc(1, 70, -18); u.p = hc(1, 30, 5); u.vel = { x: -3, y: 14 }; // ~46 ft away, running across
      throwIt(g, m, u);
      expect((g.ball.st as any).magnet).toBe(false);
      if (fly(g, (t) => ({ ...idle, move: { x: 0, y: t < 0.15 ? 1 : -1 } })) === u) caught++;
    }
    expect(caught).toBe(10);
  });

  it('it is aimed where you will be when it gets there (the flight time), not 0.35 s ahead', () => {
    const { g, u, m } = mk();
    m.p = hc(1, 70, -18); u.p = hc(1, 30, -5); u.vel = { x: 0, y: 12 };
    throwIt(g, m, u);
    const st = g.ball.st as any;
    expect(st.dur).toBeGreaterThan(0.45);
    expect(Math.abs(st.b.y - u.p.y)).toBeGreaterThan(12 * 0.35 + 0.5); // further ahead than the old fixed 0.35 s lead
    expect(Math.abs(st.b.y - u.p.y)).toBeGreaterThan(12 * st.dur * 0.75);
  });

  it('passing to a screener takes him off the screen so he can go get it', () => {
    const { g, u, m } = mk();
    u.p = hc(1, 40, 0); m.p = hc(1, 60, 0);
    m.state = 'screen'; m.stateT = 0; m.stateDur = 1.6;
    throwIt(g, u, m);
    expect(m.state).toBe('idle');
    expect(fly(g, () => idle)).toBe(m);
  });

  it('caught on the way when the ball comes within his reach, not only at the aim point', () => {
    const { g, u, m } = mk();
    m.p = hc(1, 40, -18); u.p = hc(1, 40, 18);
    throwIt(g, m, u);
    const st = g.ball.st as any;
    for (let i = 0; i < 60 && st.t < st.dur * 0.6; i++) g.update(1 / 60, idle);
    u.p = { ...g.ball.p }; u.vel = { x: 0, y: 0 }; // step into the lane
    g.update(1 / 60, idle);
    expect(g.holder()).toBe(u);
  });

  it('the CPU never throws to a teammate who cannot catch (down, rocked, mid-shot); a screener can', () => {
    const { g, m } = mk();
    expect(canCatch(g, m)).toBe(true);
    m.stunnedUntil = g.time + 1; expect(canCatch(g, m)).toBe(false); m.stunnedUntil = -9;
    m.state = 'fallen'; expect(canCatch(g, m)).toBe(false);
    m.state = 'screen'; expect(canCatch(g, m)).toBe(true);
  });

  it('CPU games: no pass (inbounds included) ends loose without a defender touching it', () => {
    for (const seed of [1, 2]) {
      const g = makeGame({ seed });
      simToEnd(g);
      const passes = g.events.filter((e) => e.kind === 'pass').length;
      expect(passes).toBeGreaterThan(200);
      expect(g.events.filter((e) => e.kind === 'passMiss').length).toBeLessThanOrEqual(1);
    }
  });
});
