import { describe, it, expect } from 'vitest';
import { makeGame } from './helpers';
import { emptyInput } from '../src/sim/game';
import { Player } from '../src/sim/player';
import { methodKey, scoreGain, scoreMath, quarterGain, QUARTER_GAIN, rhythmBoost, notchOf, gainScale, AFTER_ULT, POINT_GAIN, REPEAT_DECAY, RHYTHM_GAIN, RHYTHM_LOSS } from '../src/sim/rhythm';
import { evaluateShot } from '../src/sim/shooting';
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
    expect(u.rhythm).toBeCloseTo(RHYTHM_GAIN.assist * gainScale(300) * quarterGain(1), 5); // Q1 multiplier (round 53)
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
    for (const d of g.opp(s.team)) d.sub.steal = 0;
    const inp = emptyInput();
    // a few tries: it's a chance per think, and he may just drive and score first
    for (let tries = 0; tries < 8 && !g.ultsUsed[s.id]; tries++) {
      g.possession = s.team; g.transitionUntil = 0; g.shotClock = 24; g.live = true;
      s.p = { x: rim.x - Math.sign(rim.x - 47) * 22, y: 25 }; s.vel = { x: 0, y: 0 }; s.state = 'idle';
      g.giveBall(s); g.setRhythm(s, 100);
      for (let t = 0; t < 3 && !g.ultsUsed[s.id] && g.holder() === s; t += 1 / 30) { s.aiNextThink = 0; g.update(1 / 30, inp); }
    }
    expect(g.ultsUsed[s.id]).toBe(1);
  });
});

describe('round 53: rhythm tuning', () => {
  // a made basket resolved directly (no flight): `shooter` scores 2, optionally off `passer`'s pass
  const make = (g: any, shooter: Player, passer?: Player, contest = 0) => {
    const ev = evaluateShot(shooter, g.opp(shooter.team), g.side(shooter.team), 'layup', { now: g.time, clutch: false });
    ev.contest = contest;
    if (passer) g.assistCand = { passer, receiver: shooter, at: g.time };
    g.resolveShot({ kind: 'shot', shooter, made: true, pts: 2, ev, foul: false });
  };
  it('gains grow each quarter (low in Q1); losses do not; practice is flat', () => {
    expect(QUARTER_GAIN[0]).toBeLessThan(QUARTER_GAIN[3]);
    expect(quarterGain(1)).toBe(QUARTER_GAIN[0]);
    expect(quarterGain(5)).toBe(QUARTER_GAIN[3]); // OT = Q4
    expect(quarterGain(1, true)).toBe(1);
    const u = mkUser(), g = live(u, { quarterLen: 300 });
    g.quarter = 4; g.rhythmGain(u, 'assist');
    expect(u.rhythm).toBeCloseTo(RHYTHM_GAIN.assist * gainScale(300) * QUARTER_GAIN[3], 5);
    g.setRhythm(u, 40); const r = u.rhythm; g.rhythmLoss(u, 'turnover');
    expect(u.rhythm).toBeCloseTo(r - RHYTHM_LOSS.turnover * gainScale(300), 5);
  });
  it('rhythm pops carry the scoring math', () => {
    expect(scoreMath(2, 0)).toBe(`2pts ×${POINT_GAIN}`);
    expect(scoreMath(3, 1)).toBe(`3pts ×${POINT_GAIN} ×0.6`);
    expect(scoreMath(2, 2)).toBe(`2pts ×${POINT_GAIN} ×0.6²`);
    const u = mkUser(), g = live(u);
    g.possession = u.team; make(g, u);
    const pop = g.events.find((e) => e.kind === 'rhythmDelta');
    expect(pop?.data?.math).toBe(`2pts ×${POINT_GAIN}`);
    // round 54: fresh / stale is carried separately for the HUD pop
    expect(pop?.data?.times).toBe(0); expect(pop?.data?.decay).toBe(1);
    g.possession = u.team; make(g, u);
    const pops = g.events.filter((e) => e.kind === 'rhythmDelta');
    expect(pops[pops.length - 1].data?.times).toBe(1);
    expect(pops[pops.length - 1].data?.decay).toBeCloseTo(REPEAT_DECAY, 5);
  });
  it('a missed play assignment costs no rhythm', () => {
    expect('playMiss' in RHYTHM_LOSS).toBe(false);
  });
  it('ran your part of the play and a teammate scored: rhythm (no shot or assist needed), once', () => {
    const u = mkUser(), g = live(u);
    g.possession = u.team;
    const mate = g.teams[u.team].onCourt.find((p) => p !== u)!, other = g.teams[u.team].onCourt.find((p) => p !== u && p !== mate)!;
    g.setRhythm(u, 0);
    g.ranPlay = { team: u.team };
    make(g, mate, other);
    expect(u.rhythm).toBeGreaterThan(0);
    expect(g.ranPlay).toBeNull();
    // didn't run it: nothing
    g.setRhythm(u, 0); g.possession = u.team;
    make(g, mate, other);
    expect(u.rhythm).toBe(0);
  });
  it('"left your man" costs rhythm only when nobody contested the shot', () => {
    const u = mkUser(), g = live(u);
    const opp = g.opp(u.team)[0];
    g.possession = opp.team; u.guarding = opp.id; g.update(1 / 30, emptyInput()); g.time += 3; // not a fresh switch
    u.p = { x: opp.p.x + 30, y: opp.p.y };
    g.setRhythm(u, 40);
    make(g, opp, undefined, 0.5);
    expect(u.rhythm).toBe(40); // contested by a teammate: no loss
    g.possession = opp.team; u.guarding = opp.id;
    make(g, opp, undefined, 0);
    expect(u.rhythm).toBeLessThan(40);
  });
  it('fast break: defenders cross-match to the nearest man, you included, and the HUD is told', () => {
    const u = mkUser(), g = live(u);
    const off = g.opp(u.team), defs = g.teams[u.team].onCourt;
    g.possession = off[0].team; g.live = true; g.transitionUntil = g.time + 5; g.runner.reset();
    const mate = defs.find((d) => d !== u)!;
    const a = off[0], b = off[1];
    u.guarding = a.id; mate.guarding = b.id;
    g.update(1 / 30, emptyInput()); // settle the tracked assignment
    a.p = { x: 20, y: 10 }; b.p = { x: 60, y: 40 };
    u.p = { x: 60, y: 38 }; mate.p = { x: 20, y: 12 };
    (g as any).nextXMatchAt = 0;
    g.update(1 / 30, emptyInput());
    expect(u.guarding).toBe(b.id);
    expect(g.events.some((e) => e.kind === 'switch' && e.data?.to === b.name)).toBe(true);
  });
});
