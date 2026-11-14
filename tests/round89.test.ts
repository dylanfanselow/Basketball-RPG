import { describe, it, expect } from 'vitest';
import { makeGame } from './helpers';
import { MID_X } from '../src/sim/court';
import { OPEN_LOOK } from '../src/sim/ai/offense';

const inp = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false } as any;

describe('round 89: open looks, backcourt violations', () => {
  it('the AI never commits a backcourt violation, and open looks get shot', () => {
    let bc = 0, open = 0, eight = 0;
    for (let s = 1; s <= 2; s++) {
      const g = makeGame({ seed: s });
      for (let t = 0; t < 3000 && !g.over; t += 1 / 30) {
        g.update(1 / 30, inp);
        for (const e of g.drainEvents()) { if (e.text === 'Backcourt violation') bc++; if (e.text === '8-second violation') eight++; }
        for (const p of g.players) if (p.aiNote === 'open look: shoot' && g.time - p.aiNoteAt < 1 / 30) open++;
      }
    }
    expect(bc).toBe(0);
    expect(open).toBeGreaterThan(10);
    expect(eight).toBeLessThan(4);
    expect(OPEN_LOOK.contest).toBeGreaterThan(0);
  }, 120000);
  it('bringing it back over half court is a violation (the ball goes the other way)', () => {
    const g = makeGame({ seed: 3 });
    let fired = false;
    for (let t = 0; t < 400 && !fired; t += 1 / 30) {
      g.update(1 / 30, inp);
      const st = g.ball.st as any;
      if (g.live && g.crossed && st.kind === 'held' && st.holder.team === g.possession && st.holder.state !== 'shoot' && g.time > 5) {
        const off = g.possession, h = st.holder;
        h.p = { x: g.side(off) === 1 ? MID_X - 6 : MID_X + 6, y: 20 }; // he's back in the backcourt (as if you dribbled back)
        expect((g as any).backcourtRule(1 / 30)).toBe(true);
        const ev = g.drainEvents().find((e) => e.text === 'Backcourt violation');
        expect(ev?.team).toBe(off); expect(h.box.tov).toBeGreaterThan(0);
        fired = true;
      } else g.drainEvents();
    }
    expect(fired).toBe(true);
  });
  it('an AI pass to a teammate standing in the backcourt is refused', () => {
    const g = makeGame({ seed: 4 });
    for (let t = 0; t < 400; t += 1 / 30) {
      g.update(1 / 30, inp); g.drainEvents();
      const st = g.ball.st as any;
      if (g.live && g.crossed && st.kind === 'held' && st.holder.team === g.possession && st.holder.state !== 'shoot' && g.time > 5) {
        const h = st.holder, m = g.mates(h)[0];
        m.p = { x: g.side(g.possession) === 1 ? MID_X - 8 : MID_X + 8, y: 30 };
        g.pass(h, m);
        expect((g.ball.st as any).kind).toBe('held');
        return;
      }
    }
    throw new Error('never set up');
  });
});
