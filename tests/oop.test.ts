import { describe, it, expect } from 'vitest';
import { Player } from '../src/sim/player';
import { add, dist, norm, scale, sub, v } from '../src/sim/math';
import { GameSim, UserInput, OOP_CATCH_Z } from '../src/sim/game';
import { makeGame, simToEnd } from './helpers';
import { PLAYS } from '../src/sim/data';
import { REAL_ROSTERS } from '../src/career/roster';
import { buildThrees, defaultLineup } from '../src/sim/threes';

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


describe('lob sets in the playbook (5v5 and 3v3)', () => {
  it('every lob phase names a role that is cutting to the rim in that play', () => {
    const lobPlays = Object.entries(PLAYS).filter(([, pl]) => pl.phases.some((ph) => ph.lob));
    expect(lobPlays.filter(([, pl]) => pl.tags.includes('3v3')).length).toBeGreaterThanOrEqual(2);
    expect(lobPlays.filter(([, pl]) => !pl.tags.includes('3v3')).length).toBeGreaterThanOrEqual(2);
    for (const [id, pl] of lobPlays) {
      expect(pl.tags, id).toContain('lob');
      for (const ph of pl.phases) if (ph.lob) expect(ph.roles[ph.lob], id).toEqual({ to: 'rim', act: 'cut' });
    }
  });

  const runGame = (g: GameSim) => {
    const lobSets = new Set<string>(); let lobsInSet = 0;
    const o = g.emit.bind(g);
    g.emit = (e) => { if (e.text === 'Lob!' && g.runner.play?.tags.includes('lob')) lobsInSet++; o(e); };
    const tick = g.update.bind(g);
    g.update = (dt, i1, i2) => { tick(dt, i1, i2); if (g.runner.playId && PLAYS[g.runner.playId].tags.includes('lob')) lobSets.add(g.runner.playId); };
    simToEnd(g);
    return { lobSets, lobsInSet };
  };

  it('5v5: the coach calls lob sets and the handler throws them', () => {
    let calls = 0, lobs = 0;
    for (const seed of [2, 7, 11]) {
      const g = makeGame({ seed, quarterLen: 150 });
      for (const t of g.teams) for (const p of t.onCourt) if (p.role === '5' || p.role === '3') { p.sub.dunk = 95; }
      const r = runGame(g);
      calls += r.lobSets.size; lobs += r.lobsInSet;
      for (const id of r.lobSets) expect(PLAYS[id].tags).not.toContain('3v3');
    }
    expect(calls).toBeGreaterThan(0);
    expect(lobs).toBeGreaterThan(0);
  }, 40000);

  it('no lob sets for a team without a leaper', () => {
    const g = makeGame({ seed: 4, quarterLen: 100 });
    for (const t of g.teams) for (const p of [...t.roster]) { p.sub.dunk = 10; p.height = 6.0; }
    // re-derive each tick (recompute would restore the ratings)
    const tick = g.update.bind(g); let lobSet = false;
    g.update = (dt, i1, i2) => { for (const t of g.teams) for (const p of t.onCourt) p.sub.dunk = 10; tick(dt, i1, i2); if (g.runner.play?.tags.includes('lob')) lobSet = true; };
    simToEnd(g);
    expect(lobSet).toBe(false);
  }, 30000);

  it('3v3: only 3v3 lob sets, and they produce lobs', () => {
    let calls = 0, lobs = 0;
    for (const seed of [3, 8]) for (const court of ['full', 'half'] as const) {
      const g = buildThrees({ myTeam: 'MIN', oppTeam: 'NOP', mine: defaultLineup(REAL_ROSTERS.MIN), theirs: defaultLineup(REAL_ROSTERS.NOP), playAs: 0, court }, seed, { cpuOnly: true, quarterLen: 120 });
      for (const t of g.teams) for (const p of t.onCourt) p.sub.dunk = 95;
      const r = runGame(g);
      calls += r.lobSets.size; lobs += r.lobsInSet;
      for (const id of r.lobSets) expect(PLAYS[id].tags).toContain('3v3');
    }
    expect(calls).toBeGreaterThan(0);
    expect(lobs).toBeGreaterThan(0);
  }, 40000);
});

describe('round 54: oops get dunked, each with its own slam; a bit less automatic', () => {
  it('a 6\'5" with a modest Dunk rating dunks the lob now; a small non-leaper still lays it in', async () => {
    const { canOopDunk, OOP_DUNKS, DUNK, pickOopDunk } = await import('../src/sim/dunks');
    const mk = (h: number, dunk: number) => { const p = new Player({ id: 'x', name: 'X', team: 0, pos: 'SG', core: core(60) }); p.height = h; p.sub.dunk = dunk; return p; };
    expect(canOopDunk(mk(6.42, 56))).toBe(true); // used to need ~67
    expect(canOopDunk(mk(6.0, 50))).toBe(false);
    for (const d of OOP_DUNKS) expect(DUNK[d.id]).toBe(d);
    // styles respect the Dunk rating minimums
    const { Rng } = await import('../src/sim/math');
    const rng = new Rng(5), low = mk(6.8, 50), high = mk(6.8, 99);
    const lowIds = new Set(Array.from({ length: 60 }, () => pickOopDunk(low, rng).id));
    expect([...lowIds].every((id) => DUNK[id].min <= 50)).toBe(true);
    const highIds = new Set(Array.from({ length: 200 }, () => pickOopDunk(high, rng).id));
    expect(highIds.has('oopWindmill') && highIds.has('oopReverse') && highIds.has('oopTomahawk')).toBe(true);
  });
  it('the oop dunk plays its own slam clip and names it', async () => {
    const { DUNK } = await import('../src/sim/dunks');
    const { CLIP } = await import('../src/render/anim');
    let seen = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = setup({ seed, mate: { finishing: 70, mobility: 70 }, mateHeight: 6.42 });
      s.g.lobPass(s.u, s.m);
      for (let i = 0; i < 120 && !(s.m.state === 'shoot' && s.m.pendingShot); i++) run(s.g, s.m, s.rim, 1);
      const ps = s.m.pendingShot;
      if (ps?.type !== 'alleyOop') continue;
      seen++;
      expect(DUNK[ps.dunk!]).toBeTruthy();
      expect(s.m.anim?.name).toBe(DUNK[ps.dunk!].clip);
      expect(CLIP[s.m.anim!.name]).toBeTruthy();
    }
    expect(seen).toBeGreaterThan(4);
  });
  it('lobs are less automatic: lower base for oop dunks and layups', async () => {
    const { SHOT_TYPES } = await import('../src/sim/data');
    expect((SHOT_TYPES.alleyOop as any).base[0][1]).toBeLessThan(0.9);
    expect((SHOT_TYPES.alleyOopLayup as any).base[0][1]).toBeLessThan(0.78);
  });
});
