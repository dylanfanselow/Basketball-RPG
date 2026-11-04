import { describe, it, expect } from 'vitest';
import { Player } from '../src/sim/player';
import { add, norm, scale, sub, Vec } from '../src/sim/math';
import { selectShotType, postShotType, fakeClipFor } from '../src/sim/shooting';
import { rimPos, Side } from '../src/sim/court';
import { NODES } from '../src/sim/data';
import { GameSim, UserInput } from '../src/sim/game';
import { makeGame } from './helpers';

const idle: UserInput = { move: { x: 0, y: 0 }, sprint: false, a: false, b: false, x: false, y: false, aHeld: false, bHeld: false };
const core = (n = 70) => ({ shooting: n, finishing: n, strength: n, mobility: n, playmaking: n });
const DT = 1 / 60;

/** Practice: you `ft` out with a live dribble, a defender 3.5 ft in front (on the rim side). */
function setup(nodes: string[], ft = 9, seed = 7) {
  const u = new Player({ id: 'USER', name: 'You', team: 0, pos: 'PF', core: core(), nodes, isUser: true });
  const g = makeGame({ seed, mode: 'practice', practice: { defenders: 1, teammates: 0, runPlays: false } }, u);
  const d = g.teams[1].onCourt[0];
  const rim = g.rim(u.team);
  u.p = add(rim, { x: -ft, y: 0.5 });
  const toRim = norm(sub(rim, u.p));
  d.p = add(u.p, scale(toRim, 3.5)); d.vel = { x: 0, y: 0 };
  u.dribbledSinceCatch = true;
  g.update(DT, idle);
  return { g, u, d, toRim, lat: { x: -toRim.y, y: toRim.x } as Vec, away: scale(toRim, -1) };
}
/** ✕ tap with the stick held: press then release before TAP_S. */
const tap = (g: GameSim, move: Vec) => { g.update(DT, { ...idle, move, a: true, aHeld: true }); g.update(DT, { ...idle, move }); };

describe('Dreamer (Finishing ability): shot-specific pump fakes', () => {
  it('is an ability in the Finishing tree', () => {
    expect(NODES.fi_dreamer).toBeTruthy();
    expect(NODES.fi_dreamer.tree).toBe('finishing');
    expect(NODES.fi_dreamer.type).toBe('ability');
  });
  it('the stick picks the fake: sideways = hook, away = floater, toward = layup; jumpers keep the pump fake', () => {
    for (const [stick, clip] of [['lat', 'fake_hook'], ['away', 'fake_floater'], ['toRim', 'fake_layup'], ['none', 'fake_layup']] as const) {
      const s = setup(['fi_dreamer']);
      g_tap(s, stick);
      expect(s.u.anim?.name, stick).toBe(clip);
      expect(s.u.state).toBe('dribbleMove'); // still a pump fake underneath (Step-Through window, dead dribble)
    }
    const far = setup(['fi_dreamer'], 20);
    tap(far.g, { x: 0, y: 0 });
    expect(far.u.anim?.name).toBe('pumpfake');
  });
  it('without Dreamer every tap is the one generic pump fake', () => {
    for (const stick of ['lat', 'away', 'toRim'] as const) {
      const s = setup([]);
      g_tap(s, stick);
      expect(s.u.anim?.name).toBe('pumpfake');
    }
  });
  it('Step-Through still works off a Dreamer fake', () => {
    const s = setup(['fi_dreamer']);
    g_tap(s, 'lat');
    for (let i = 0; i < 30; i++) s.g.update(DT, idle);
    s.g.update(DT, { ...idle, move: s.toRim, a: true, aHeld: true });
    for (let i = 0; i < 14 && s.u.state !== 'shoot'; i++) s.g.update(DT, { ...idle, move: s.toRim, aHeld: true });
    expect(s.u.pendingShot?.type).toBe('stepThrough');
  });
  it('Dreamer fakes fool defenders more often', () => {
    const rate = (nodes: string[]) => {
      let bit = 0;
      for (let seed = 1; seed <= 120; seed++) {
        const s = setup(nodes, 9, seed);
        g_tap(s, 'lat');
        if (s.d.lastBitAt > 0) bit++;
      }
      return bit / 120;
    };
    expect(rate(['fi_dreamer'])).toBeGreaterThan(rate([]) + 0.05);
  });
  it('a post-locked defender never bites', () => {
    let bit = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = setup(['fi_dreamer'], 9, seed);
      s.d.postLockUntil = s.g.time + 2;
      g_tap(s, 'lat');
      if (s.d.lastBitAt > 0) bit++;
    }
    expect(bit).toBe(0);
  });
  it('fakeClipFor maps shot types', () => {
    expect(fakeClipFor('hook')).toBe('fake_hook'); expect(fakeClipFor('floater')).toBe('fake_floater');
    for (const t of ['layup', 'push', 'euro', 'dunk']) expect(fakeClipFor(t)).toBe('fake_layup');
    for (const t of ['mid', 'three', 'fade', 'deep3']) expect(fakeClipFor(t)).toBe('pumpfake');
  });
});

/** Run a tap with one of the named sticks from a setup. */
function g_tap(s: ReturnType<typeof setup>, stick: 'lat' | 'away' | 'toRim' | 'none') {
  tap(s.g, stick === 'none' ? { x: 0, y: 0 } : s[stick]);
}

describe('close shots follow the stick: away = floater, toward = layup / push, perpendicular = hook', () => {
  const side: Side = 1, rim = rimPos(side);
  const me = (nodes: string[] = []) => new Player({ id: 'U', name: 'U', team: 0, pos: 'SF', core: core(50), nodes });
  const at = (p: Player, ft: number) => { p.p = add(rim, { x: -ft, y: 0 }); return p; };
  const toRim = { x: 1, y: 0 }, away = { x: -1, y: 0 }, lat = { x: 0, y: 1 };
  it('at 5 ft and 10 ft', () => {
    const p5 = at(me(), 5), p10 = at(me(), 10);
    expect(selectShotType(p5, side, away, 100)).toBe('floater');
    expect(selectShotType(p5, side, toRim, 100)).toBe('layup');
    expect(selectShotType(p5, side, lat, 100)).toBe('hook');
    expect(selectShotType(p10, side, away, 100)).toBe('floater');
    expect(selectShotType(p10, side, toRim, 100)).toBe('push');
    expect(selectShotType(p10, side, lat, 100)).toBe('hook');
  });
  it('Euro Step owners: hook standing, Euro on a drive', () => {
    const p = at(me(['fi_euro']), 5);
    expect(selectShotType(p, side, lat, 100)).toBe('hook');
    p.vel = { x: 12, y: 0 };
    expect(selectShotType(p, side, lat, 100)).toBe('euro');
  });
  it('post: toward the rim from 9 ft = push shot', () => {
    expect(postShotType(at(me(), 9), side, toRim)).toBe('push');
    expect(postShotType(at(me(), 5), side, toRim)).toBe('layup');
  });
});
