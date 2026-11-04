import { describe, it, expect } from 'vitest';
import { Player } from '../src/sim/player';
import { add, norm, scale, sub, v } from '../src/sim/math';
import { NODES } from '../src/sim/data';
import { evaluateShot, JELLY_HANG } from '../src/sim/shooting';
import { CLIP } from '../src/render/anim';
import { UserInput } from '../src/sim/game';
import { makeGame } from './helpers';

const idle: UserInput = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false };
const core = (n = 90) => ({ shooting: n, finishing: n, strength: n, mobility: n, playmaking: n });
const DT = 1 / 60;

/** Practice: you going up for a dunk 4 ft out, a shot blocker 2.5 ft in front. */
function dunk(nodes: string[], seed = 3, aiShooter = false) {
  const u = new Player({ id: 'USER', name: 'You', team: 0, pos: 'PF', core: core(), nodes, isUser: true });
  const g = makeGame({ seed, mode: 'practice', practice: { defenders: 1, teammates: 0, runPlays: false } }, u);
  const d = g.teams[1].onCourt[0], rim = g.rim(u.team);
  u.p = add(rim, { x: -4, y: 0.3 });
  d.p = add(u.p, scale(norm(sub(rim, u.p)), 2.5)); d.vel = v(); d.sub.block = 95; d.height = 7.2;
  u.dribbledSinceCatch = true;
  if (aiShooter) u.isUser = false;
  g.update(DT, idle);
  g.startShot(u, 'dunk');
  return { g, u, d };
}

describe('Jelly Fake (Finishing ability)', () => {
  it('sits at the far end of the dunk prong', () => {
    expect(NODES.fi_jelly.tree).toBe('finishing');
    expect(NODES.fi_jelly.prereqs).toEqual(['fi_poster']);
    expect(NODES.fi_jelly.type).toBe('ability');
    expect(CLIP.shot_jelly).toBeTruthy();
  });
  it('without it, ✕ again mid-dunk changes nothing', () => {
    const { g, u } = dunk([]);
    const dur = u.stateDur;
    g.update(DT, { ...idle, a: true, aHeld: true });
    expect(u.pendingShot?.type).toBe('dunk');
    expect(u.stateDur).toBe(dur);
  });
  it('with it: the dunk becomes a jelly released JELLY_HANG later, he is still up there at the old release, big penalty', () => {
    const { g, u } = dunk(['fi_jelly']);
    const dur = u.stateDur;
    g.update(DT, { ...idle, a: true, aHeld: true });
    expect(u.pendingShot?.type).toBe('jelly');
    expect(u.stateDur).toBeCloseTo(dur + JELLY_HANG, 5);
    expect(u.anim?.name).toBe('shot_jelly');
    while (u.stateT < dur) g.update(DT, idle);
    expect(u.z).toBeGreaterThan(1); // hanging
    for (let i = 0; i < 60 && !g.lastShot; i++) g.update(DT, idle);
    const ev = g.lastShot!.ev;
    expect(ev.type).toBe('jelly');
    expect(ev.terms.some((t) => t.label === 'Jelly Fake' && t.value < 1)).toBe(true);
    const lay = evaluateShot(u, [], g.side(u.team), 'layup', { now: g.time, clutch: false });
    const jel = evaluateShot(u, [], g.side(u.team), 'jelly', { now: g.time, clutch: false });
    expect(jel.pct).toBeLessThan(lay.pct * 0.7);
  });
  it('a shot blocker who jumped at the dunk gets blocked out of it: far fewer blocks than on the dunk', () => {
    const blocks = (jelly: boolean) => {
      let n = 0;
      for (let seed = 1; seed <= 80; seed++) {
        const { g, u, d } = dunk(['fi_jelly'], seed);
        d.jumpAt = g.time + 0.05; // he goes up at the dunk
        g.update(DT, idle); g.update(DT, idle);
        if (jelly) g.update(DT, { ...idle, a: true, aHeld: true });
        for (let i = 0; i < 90 && !g.lastShot; i++) g.update(DT, idle);
        if (g.lastShot?.blocked) n++;
        void u;
      }
      return n;
    };
    const onDunk = blocks(false), onJelly = blocks(true);
    expect(onDunk).toBeGreaterThan(3);
    expect(onJelly).toBeLessThan(onDunk / 2);
  });
  it('the AI jellies over a jumping shot blocker some of the time', () => {
    let jellies = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { g, u, d } = dunk(['fi_jelly'], seed, true);
      g.freezeAI = true;
      d.z = 1; d.vz = 8; d.lastJumpAt = g.time; d.state = 'jump';
      g.update(DT, idle);
      if (u.pendingShot?.type === 'jelly') jellies++;
    }
    expect(jellies).toBeGreaterThan(8);
    expect(jellies).toBeLessThan(32);
  });
});
