import { describe, it, expect } from 'vitest';
import { makeGame } from './helpers';
import { emptyInput } from '../src/sim/game';
import { tryActivateUlt, OFFENSIVE_ULTS } from '../src/sim/ultimates';
import { Player } from '../src/sim/player';

const live = (seed = 6, u?: Player, over: any = {}) => {
  const g = makeGame({ seed, ...over }, u);
  const inp = emptyInput();
  for (let t = 0; t < 30 && !(g.live && g.holder()); t += 1 / 30) g.update(1 / 30, inp);
  return g;
};

describe('round 69: CPU star ultimates', () => {
  it('a CPU star can ult with an empty rhythm meter; the user still needs a full one', () => {
    const g = live();
    const sh = g.holder()!;
    sh.star = true; g.cpuUlts[sh.id] = { unlocked: true, id: 'deepStepback', level: 0 };
    g.setRhythm(sh, 0);
    expect(g.ultReady(sh)).toBe(true);
    const rim = g.rim(sh.team), dir = Math.sign(47 - rim.x);
    sh.p = { x: rim.x + dir * 23, y: rim.y }; sh.state = 'idle'; sh.deadDribble = false;
    expect(tryActivateUlt(g, sh)).toBe(true);
    expect(sh.rhythm).toBe(0); // never raised by the ult
    expect(g.ultReady(sh)).toBe(false); // once a game

    const u = new Player({ id: 'U', name: 'Me', team: 0, pos: 'PG', isUser: true, core: { shooting: 70, finishing: 70, strength: 60, mobility: 70, playmaking: 70 } as any });
    const g2 = live(6, u, { ult: { unlocked: true, id: 'deepStepback', level: 0 } });
    g2.setRhythm(u, 60);
    expect(g2.ultReady(u)).toBe(false);
    g2.setRhythm(u, 100);
    expect(g2.ultReady(u)).toBe(true);
  });

  it('only in the last period: the coach calls an iso for a CPU star with his offensive ult', () => {
    const g = live();
    const off = g.offense();
    const s = off[0]; s.star = true; g.cpuUlts[s.id] = { unlocked: true, id: 'deepStepback', level: 0 };
    for (const p of off) if (p !== s) p.star = false;
    g.quarter = 1;
    expect(g.ultIsoCandidate(off)).toBeNull();
    g.quarter = 4;
    expect(g.ultIsoCandidate(off)).toBe(s);
    g.clock = 5; // endgame: always called
    g.callPlay();
    expect(g.ultIso).toBe(s.id);
    expect(g.events.some((e) => e.kind === 'play' && e.text.includes(`Iso for ${s.name}`) && e.text.includes('ultimate'))).toBe(true);
    g.ultsUsed[s.id] = 1;
    expect(g.ultIsoCandidate(off)).toBeNull();
  });

  it('headless games: CPU offensive ults happen, and only in the 4th / OT', () => {
    let offensive = 0;
    for (const seed of [3, 11, 21]) {
      const g = makeGame({ seed });
      const inp = emptyInput();
      let seen = 0;
      for (let t = 0; t < 3000 && !g.over; t += 1 / 30) {
        g.update(1 / 30, inp);
        for (; seen < g.events.length; seen++) {
          const e = g.events[seen];
          if (e.kind === 'ult' && OFFENSIVE_ULTS.includes(e.data?.id)) { offensive++; expect(g.quarter).toBeGreaterThanOrEqual(4); }
        }
      }
    }
    expect(offensive).toBeGreaterThan(0);
  }, 15000); // full headless games: slow under the parallel suite
});
