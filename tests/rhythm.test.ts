import { describe, it, expect } from 'vitest';
import { makeGame } from './helpers';
import { emptyInput } from '../src/sim/game';
import { Player } from '../src/sim/player';
import { methodKey, scoreGain, rhythmBoost, notchOf, gainScale, AFTER_ULT, POINT_GAIN, REPEAT_DECAY, RHYTHM_GAIN } from '../src/sim/rhythm';
import { tryActivateUlt } from '../src/sim/ultimates';
import { rimPos } from '../src/sim/court';

const live = (u?: Player, over: any = {}) => {
  const g = makeGame({ seed: 7, ...over }, u);
  const inp = emptyInput();
  for (let t = 0; t < 30 && !(g.live && g.holder()); t += 1 / 30) g.update(1 / 30, inp);
  return g;
};
const mkUser = () => new Player({ id: 'U', name: 'Rookie', team: 0, pos: 'SG', height: 6.4, core: { shooting: 80, finishing: 70, strength: 50, mobility: 75, playmaking: 60 } as any, isUser: true });

describe('round 51: rhythm', () => {
  it('scoring methods: how the basket was made', () => {
    expect(methodKey('three', new Set(['catchShoot']))).toBe('three|catch');
    expect(methodKey('three', new Set(['pullUp']))).toBe('three|dribble');
    expect(methodKey('mid', new Set(['pullUp']), { stepback: true })).toBe('mid|stepback');
    expect(methodKey('layup', new Set(['drive']))).toBe('layup|drive');
    expect(methodKey('dunk', new Set(), { transition: true })).toBe('dunk|transition');
    expect(methodKey('hook', new Set(['post']))).toBe('hook|post');
    expect(methodKey('alleyOop', new Set(['drive']))).toBe('alleyOop|lob');
  });
  it('the same method again gives less each time (×0.6 per repeat)', () => {
    expect(REPEAT_DECAY).toBe(0.6);
    expect(scoreGain(2, 0)).toBeCloseTo(2 * POINT_GAIN, 5);
    expect(scoreGain(2, 1)).toBeCloseTo(2 * POINT_GAIN * 0.6, 5);
    expect(scoreGain(2, 2)).toBeCloseTo(2 * POINT_GAIN * 0.36, 5);
    expect(scoreGain(3, 0)).toBeCloseTo(3 * POINT_GAIN, 5);
  });
  it('notch boosts: bigger for lower stats, applied when you pass a notch and removed when you drop below', () => {
    const b = rhythmBoost({ shooting: 90, finishing: 40, strength: 60, mobility: 70, playmaking: 80 }, 3);
    expect(b.finishing!).toBeGreaterThan(b.shooting! * 2);
    expect(b.shooting).toBe(3);
    const u = mkUser(), g = live(u);
    const before = u.sub.layup;
    g.setRhythm(u, 50);
    expect(notchOf(u.rhythm)).toBe(2);
    expect(u.sub.layup).toBeGreaterThan(before);
    expect(u.core.finishing).toBe(70); // the career stats themselves never change
    g.setRhythm(u, 10);
    expect(u.sub.layup).toBeCloseTo(before, 5);
  });
  it('gains scale with the game length (longer quarters, smaller gains); losses floor at 0', () => {
    expect(gainScale(600)).toBeLessThan(gainScale(150));
    const u = mkUser(), g = live(u, { quarterLen: 300 });
    g.rhythmGain(u, 'assist');
    expect(u.rhythm).toBeCloseTo(RHYTHM_GAIN.assist * gainScale(300), 5);
    g.rhythmLoss(u, 'posterized');
    expect(u.rhythm).toBe(0);
  });
  it('a steal builds the stealer\'s rhythm and costs the handler', () => {
    const g = live();
    const h = g.holder()!, d = g.opp(h.team)[0];
    g.setRhythm(h, 40);
    d.sub.steal = 99; h.sub.ballSpeed = 1;
    for (let i = 0; i < 200 && g.holder() === h; i++) {
      d.p = { x: h.p.x + 2, y: h.p.y }; h.face = { x: 1, y: 0 }; d.swipeCdUntil = 0; d.state = 'idle'; g.swipe(d);
    }
    expect(d.rhythm).toBeGreaterThan(0);
    expect(h.rhythm).toBeLessThan(40);
  });
  it('the ultimate needs a full meter, works once a game, and drops you to the 3rd notch', () => {
    const u = mkUser(), g = live(u, { ult: { unlocked: true, id: 'deepStepback', level: 0 } });
    const rim = rimPos(g.side(u.team));
    g.possession = u.team; g.live = true; g.giveBall(u); u.state = 'idle';
    u.p = { x: rim.x - Math.sign(rim.x - 47) * 22, y: 25 };
    g.setRhythm(u, 60);
    expect(tryActivateUlt(g, u)).toBe(false);
    g.setRhythm(u, 100);
    expect(tryActivateUlt(g, u)).toBe(true);
    expect(u.rhythm).toBe(AFTER_ULT);
    expect(notchOf(u.rhythm)).toBe(3);
    g.ult.active = null; u.state = 'idle'; g.setRhythm(u, 100);
    expect(tryActivateUlt(g, u)).toBe(false); // one per game
    expect(g.events.some((e) => e.text === 'Ultimate used this game')).toBe(true);
  });
  it('CPU stars have a fitting ultimate (role players have none) and use it in full rhythm', () => {
    const g = live();
    const stars = g.players.filter((p) => p.star && g.isAI(p));
    expect(stars.length).toBeGreaterThan(0);
    for (const s of stars) expect(['chaseDown', 'deepStepback', 'ftTakeoff']).toContain(g.ultOf(s)!.id);
    const role = g.players.find((p) => !p.star)!;
    expect(g.ultOf(role)).toBeNull();
    // a shooter star in full rhythm with the ball out deep pulls the Deep Step-Back
    const s = stars[0];
    g.cpuUlts[s.id] = { unlocked: true, id: 'deepStepback', level: 0 };
    const rim = rimPos(g.side(s.team));
    g.possession = s.team; g.transitionUntil = 0; g.shotClock = 24; g.live = true;
    s.p = { x: rim.x - Math.sign(rim.x - 47) * 22, y: 25 }; s.vel = { x: 0, y: 0 };
    g.giveBall(s); g.setRhythm(s, 100);
    for (const d of g.opp(s.team)) d.sub.steal = 0;
    const inp = emptyInput();
    for (let t = 0; t < 3 && !g.ultsUsed[s.id]; t += 1 / 30) { if (g.holder() === s) s.aiNextThink = 0; g.update(1 / 30, inp); }
    expect(g.ultsUsed[s.id]).toBe(1);
  });
});
