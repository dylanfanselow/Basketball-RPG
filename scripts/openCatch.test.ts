import { it } from 'vitest';
import { makeGame } from '../tests/helpers';
import { evaluateShot, selectShotType } from '../src/sim/shooting';
import { inFrontcourt } from '../src/sim/court';

/** Round 89: AIs catching it wide open (nobody in the cone) and not shooting: how often, which shots, what they did. */
it('open catches', () => {
  const out: Record<string, { n: number; shot: number; pass: number; drive: number; other: number }> = {};
  const misses: string[] = []; const reasons: Record<string, number> = {};
  for (let s = 1; s <= Number(process.env.SEEDS ?? 3); s++) {
    const g = makeGame({ seed: s });
    const inp = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false };
    const pend: { pid: string; t: number; key: string; recv: number; pct: number }[] = [];
    for (let t = 0; t < 3000 && !g.over; t += 1 / 30) {
      g.update(1 / 30, inp as any);
      for (const e of g.drainEvents()) if (e.kind === 'catch' && e.pid) {
        const p = g.players.find((q) => q.id === e.pid)!, side = g.side(p.team), rim = g.rim(p.team);
        const d = Math.hypot(p.p.x - rim.x, p.p.y - rim.y);
        if (!inFrontcourt(side, p.p) || d > 26 || g.inTransition(p.team)) continue;
        const type = selectShotType(p, side, { x: 0, y: 0 }, g.time);
        const ev = evaluateShot(p, g.opp(p.team), side, type, { now: g.time, clutch: false });
        if (!ev.conds.has('open') || g.nearestDefender(p).dist < 6 || !['mid', 'three', 'deep3'].includes(type)) continue;
        const b = ev.pct < 0.3 ? '<30' : ev.pct < 0.36 ? '30-36' : ev.pct < 0.42 ? '36-42' : '42+';
        pend.push({ pid: p.id, t: g.time, key: `${type} ${b}`, recv: p.receivedAt, pct: ev.pct });
      }
      for (let i = pend.length - 1; i >= 0; i--) {
        const c = pend[i], p = g.players.find((q) => q.id === c.pid)!, st = g.ball.st as any;
        const o = (out[c.key] ??= { n: 0, shot: 0, pass: 0, drive: 0, other: 0 });
        let res: 'shot' | 'pass' | 'drive' | 'other' | null = null;
        if (p.state === 'shoot' || (st.kind === 'shot' && st.shooter === p)) res = 'shot';
        else if (st.kind === 'pass' && st.from === p) res = 'pass';
        else if (p.dribbledSinceCatch && g.time - c.t > 0.8) res = 'drive';
        else if (p.receivedAt !== c.recv || g.time - c.t > 2.5 || !(st.kind === 'held' && st.holder === p)) res = 'other';
        if (res) { o.n++; o[res]++; if (res !== 'shot') { const iso = !!g.runner.play?.tags.includes('iso') && g.runner.focusPid === p.id; const side2 = g.side(p.team), ev2 = evaluateShot(p, g.opp(p.team), side2, selectShotType(p, side2, { x: 0, y: 0 }, g.time), { now: g.time, clutch: false }); const why = `${res} age=${(g.time - c.t).toFixed(1).slice(0, 3)} cNow=${ev2.contest < 0.1 ? "open" : ev2.contest < 0.3 ? "mid" : "hi"} iso=${iso} looked=${p.openLookFor === c.recv} plan=${g.clockPlan(p.team) ?? ""}`; reasons[why] = (reasons[why] ?? 0) + 1; } pend.splice(i, 1); }
      }
    }
  }
  for (const [k, o] of Object.entries(out).sort()) console.log(`OPEN ${k.padEnd(14)} n=${o.n} shot ${(100 * o.shot / o.n).toFixed(0)}% pass ${o.pass} drive ${o.drive} other ${o.other}`);
  for (const [k, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) console.log('WHY', n, k);
}, 600000);
