import { describe, it, expect } from 'vitest';
import { Player } from '../src/sim/player';
import { add, dist, norm, scale, sub, v } from '../src/sim/math';
import { GameSim, UserInput, OOP_CATCH_Z } from '../src/sim/game';
import { makeGame, simToEnd } from './helpers';

const idle: UserInput = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false };
const core = (n = 80, o: Partial<Record<string, number>> = {}) => ({ shooting: n, finishing: n, strength: n, mobility: n, playmaking: n, ...o });
const DT = 1 / 60;

/** Practice: you (handler) on the wing, one teammate cutting from the dunker spot to the rim. No defenders. */
function setup(o: { nodes?: string[]; mate?: Partial<Record<string, number>>; mateHeight?: number; userIsReceiver?: boolean; seed?: number } = {}) {
  const u = new Player({ id: 'USER', name: 'You', team: 0, pos: o.userIsReceiver ? 'PF' : 'PG', core: core(80), nodes: o.nodes ?? [], isUser: true });
  const g = makeGame({ seed: o.seed ?? 3, mode: 'practice', practice: { defenders: 0, teammates: 1, runPlays: false } }, u);
  g.freezeAI = true;
  const m = g.teams[0].onCourt.find((p) => p !== u)!;
  m.core = core(85, o.mate ?? {}); if (o.mateHeight) m.height = o.mateHeight; m.recompute();
  const rim = g.rim(0);
  const passer = o.userIsReceiver ? m : u, recv = o.userIsReceiver ? u : m;
  passer.p = add(rim, { x: -22, y: -12 });
  recv.p = add(rim, { x: -12, y: 8 });
  g.giveBall(passer);
  recv.vel = scale(norm(sub(rim, recv.p)), 12);
  return { g, u, m, rim, passer, recv };
}
/** keep the receiver running at the rim (frozen AI won't) until the lob arrives */
function run(g: GameSim, p: Player, rim: { x: number; y: number }, ticks: number, input = idle) {
  for (let i = 0; i < ticks; i++) {
    const st = g.ball.st;
    if (st.kind === 'pass' && p.state !== 'shoot') p.want = scale(norm(sub(st.b, p.p)), Math.min(14, dist(st.b, p.p) * 4));
    g.update(DT, input);
    void rim;
  }
}

describe('alley-oops: hold △ to lob', () => {
  it('tap △ = normal pass; hold △ = a lob that comes down at rim height near the rim', () => {
    const a = setup();
    a.g.update(DT, { ...idle, y: true, yHeld: false });
    expect(a.g.ball.st.kind).toBe('pass');
    expect((a.g.ball.st as any).oop).toBeUndefined();
    const b = setup();
    const keepRunning = () => { b.m.want = scale(norm(sub(b.rim, b.m.p)), 12); b.m.vel = { ...b.m.want }; };
    keepRunning(); b.g.update(DT, { ...idle, y: true, yHeld: true, move: { x: 1, y: 1 } });
    for (let i = 0; i < 12 && b.g.ball.st.kind === 'held'; i++) { keepRunning(); b.g.update(DT, { ...idle, yHeld: true, move: { x: 1, y: 1 } }); }
    const st = b.g.ball.st as any;
    expect(st.kind).toBe('pass');
    expect(st.oop).toBeTruthy();
    expect(dist(st.b, b.rim)).toBeLessThan(7);
    while ((b.g.ball.st as any).kind === 'pass' && (b.g.ball.st as any).t < (b.g.ball.st as any).dur - DT) b.g.update(DT, idle);
    expect(b.g.ball.z).toBeGreaterThan(OOP_CATCH_Z - 1.5);
  });

  it('an AI dunker goes up and throws it down (assist to the passer); a non-dunker lays it in', () => {
    let oops = 0, layups = 0, assists = 0;
    for (let seed = 1; seed <= 20; seed++) {
      for (const dunker of [true, false]) {
        const s = setup({ seed, mate: dunker ? { finishing: 95, mobility: 90 } : { finishing: 30, mobility: 40 }, mateHeight: dunker ? 6.9 : 6.1 });
        s.g.lobPass(s.u, s.m);
        run(s.g, s.m, s.rim, 120);
        const ls = s.g.lastShot;
        if (ls?.ev.type === 'alleyOop') oops++;
        if (ls?.ev.type === 'alleyOopLayup') layups++;
        if (s.u.box.ast > 0) assists++;
      }
    }
    expect(oops).toBeGreaterThan(8);
    expect(layups).toBeGreaterThan(8);
    expect(assists).toBeGreaterThan(8);
  });

  it('as the receiver: ✕ at the top = clean alley-oop, bad timing = a timing penalty, no ✕ = a floor catch', () => {
    const go = (jumpAtFrac: number | null) => {
      const s = setup({ userIsReceiver: true, nodes: [] });
      s.g.lobPass(s.m, s.u);
      const st = s.g.ball.st as any;
      const tApex = (s.u.jumpVel) / 32;
      const jumpTick = jumpAtFrac === null ? -1 : Math.max(0, Math.round((st.dur - tApex * jumpAtFrac) / DT));
      for (let i = 0; i < 150; i++) {
        const cur = s.g.ball.st as any;
        const want = cur.kind === 'pass' ? scale(norm(sub(cur.b, s.u.p)), Math.min(1, dist(cur.b, s.u.p) / 3)) : v();
        s.g.update(DT, { ...idle, move: s.u.z > 0 ? v() : want, a: i === jumpTick, aHeld: i === jumpTick });
      }
      return s.g.lastShot?.ev ?? null;
    };
    const clean = go(1);
    expect(clean?.type).toMatch(/alleyOop/);
    expect(clean?.terms.find((t) => t.label === 'oop timing')).toBeUndefined();
    const late = go(0.35);
    expect(late?.type).toMatch(/alleyOop/);
    expect(late!.terms.find((t) => t.label === 'oop timing')!.value).toBeLessThan(0.95);
    const none = go(null);
    expect(none?.type ?? 'none').not.toMatch(/alleyOop/);
  });

  it('better lob passers (and Lob City) overthrow less', () => {
    const overs = (nodes: string[], play: number) => {
      let n = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const s = setup({ seed, nodes });
        s.u.core.playmaking = play; s.u.recompute();
        s.g.lobPass(s.u, s.m);
        const st = s.g.ball.st as any;
        const ideal = add(s.g.rim(0), scale(norm(sub(add(s.m.p, scale(s.m.vel, 0.6)), s.g.rim(0))), 4));
        if (dist(st.b, ideal) > 1.8) n++;
      }
      return n;
    };
    const bad = overs([], 40), good = overs([], 95), city = overs(['pa_lob'], 95);
    expect(good).toBeLessThan(bad);
    expect(city).toBeLessThanOrEqual(good);
  });

  it('the AI throws alley-oops in real games', () => {
    let oops = 0;
    for (const seed of [1, 2]) {
      const g = makeGame({ seed, quarterLen: 150 });
      const o = g.emit.bind(g); g.emit = (e) => { if (e.text === 'Alley-oop!') oops++; o(e); };
      simToEnd(g);
    }
    expect(oops).toBeGreaterThan(0);
  }, 30000);
});
