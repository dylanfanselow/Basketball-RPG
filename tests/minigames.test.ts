import { describe, it, expect } from 'vitest';
import { MiniInput, NO_INPUT, JumpRopeGame, SquatGame, TreadmillGame, PushupGame, ShootGame, BenchGame, makeMiniGame } from '../src/world/minigames';

const DT = 1 / 60;
const inp = (p: Partial<MiniInput> = {}): MiniInput => ({ ...NO_INPUT, ...p });
const seeded = (s = 7) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };

describe('jump rope', () => {
  // spin the stick one notch per frame (counter-clockwise), press ○ as the rope reaches the bottom
  const spinStep = 0.12;
  const play = (g: JumpRopeGame, frames: number, press: (g: JumpRopeGame) => boolean) => {
    let ang = 0;
    for (let i = 0; i < frames; i++) { ang += spinStep; g.update(DT, inp({ stick: { x: Math.cos(ang), y: Math.sin(ang) }, b: press(g) })); }
  };
  it('spinning + ○ when the rope is under you = hops (reps)', () => {
    const g = new JumpRopeGame();
    play(g, 600, (g) => !g.cleared && Math.abs(g.theta - Math.PI) < 0.3);
    expect(g.reps).toBeGreaterThan(5);
    expect(g.missing).toBe(false);
  });
  it('letting it pass under you trips (red ✗ for a second, rope back to the top)', () => {
    const g = new JumpRopeGame();
    play(g, 120, () => false);
    expect(g.reps).toBe(0);
    expect(g.missUntil).toBeGreaterThan(0);
  });
  it('○ at the wrong time trips; no spin = no rope', () => {
    const g = new JumpRopeGame();
    g.update(DT, inp({ b: true }));
    expect(g.missing).toBe(true);
    const h = new JumpRopeGame();
    for (let i = 0; i < 100; i++) h.update(DT, inp());
    expect(h.theta).toBe(0);
  });
});

describe('squat', () => {
  it('alternating L2 / R2 fills the bar to a rep; the same button twice does nothing; idle drains', () => {
    const g = new SquatGame();
    for (let i = 0; i < 12; i++) { g.update(DT, inp(i % 2 ? { r2: true } : { l2: true })); g.update(DT * 4, inp()); }
    expect(g.reps).toBe(1);
    const h = new SquatGame();
    for (let i = 0; i < 12; i++) h.update(DT, inp({ l2: true }));
    expect(h.fill).toBeLessThan(0.12);
    h.update(DT, inp({ r2: true })); const f = h.fill;
    for (let i = 0; i < 60; i++) h.update(DT, inp());
    expect(h.fill).toBeLessThan(f);
  });
  it('the body rises with the bar', () => {
    const g = new SquatGame(); const u0 = g.animU();
    g.update(DT, inp({ l2: true })); g.update(DT, inp({ r2: true }));
    expect(g.animU()).toBeGreaterThan(u0);
  });
});

describe('treadmill', () => {
  it('○ in the square = hit and faster; outside = ✗ and slower', () => {
    const g = new TreadmillGame();
    let hits = 0;
    for (let i = 0; i < 600 && hits < 3; i++) {
      const press = Math.abs(g.dot) < 0.05;
      const before = g.reps;
      g.update(DT, inp({ b: press }));
      if (g.reps > before) hits++;
    }
    expect(g.reps).toBe(3);
    expect(g.speed).toBeCloseTo(TreadmillGame.BASE * 1.1 ** 3, 5);
    const fast = g.speed;
    while (Math.abs(g.dot) < 0.5) g.update(DT, inp());
    g.update(DT, inp({ b: true }));
    expect(g.missing).toBe(true);
    expect(g.speed).toBeLessThan(fast);
  });
});

describe('push-ups', () => {
  it('the right button fills; a wrong one locks for a second; full = a rep', () => {
    const g = new PushupGame(seeded());
    for (let i = 0; i < 6; i++) { g.update(DT, inp({ [g.want]: true })); }
    expect(g.reps).toBe(1);
    const h = new PushupGame(seeded(3));
    const wrong = (['a', 'b', 'x', 'y'] as const).find((b) => b !== h.want)!;
    h.update(DT, inp({ [wrong]: true }));
    expect(h.missing).toBe(true);
    const f = h.fill;
    h.update(DT, inp({ [h.want]: true }));      // locked: ignored
    expect(h.fill).toBeLessThanOrEqual(f);
    for (let i = 0; i < 62; i++) h.update(DT, inp());
    expect(h.missing).toBe(false);
  });
});

describe('shooting', () => {
  const shoot = (g: ShootGame, holdFrames: number) => {
    g.update(DT, inp());                                  // let go of the ✕ that started it
    for (let i = 0; i < holdFrames; i++) g.update(DT, inp({ aHeld: true }));
    g.update(DT, inp());
    for (let i = 0; i < 140; i++) g.update(DT, inp());   // ball flight
  };
  it('release in the green = make; early / late = miss; the meter falls back after the top', () => {
    const g = new ShootGame();
    shoot(g, Math.round(0.87 * ShootGame.FILL * 60));
    expect(g.attempts).toBe(1); expect(g.reps).toBe(1);
    shoot(g, Math.round(0.3 * ShootGame.FILL * 60));
    expect(g.attempts).toBe(2); expect(g.reps).toBe(1);
    shoot(g, Math.round(1.6 * ShootGame.FILL * 60));      // over the top and back down past the green
    expect(g.attempts).toBe(3); expect(g.reps).toBe(1);
  });
  it('the ✕ that started it must be released first', () => {
    const g = new ShootGame();
    for (let i = 0; i < 30; i++) g.update(DT, inp({ aHeld: true }));
    expect(g.state).toBe('idle');
  });
});

describe('bench press', () => {
  it('holding ✕ while countering the wobble makes a rep; ignoring it drops the bar', () => {
    const g = new BenchGame(seeded());
    for (let i = 0; i < 60 * 8 && g.reps === 0; i++) g.update(DT, inp({ aHeld: true, stick: { x: Math.max(-1, Math.min(1, -g.tilt * 6)), y: 0 } }));
    expect(g.reps).toBe(1);
    const h = new BenchGame(seeded(5));
    for (let i = 0; i < 60 * 4; i++) h.update(DT, inp({ aHeld: true }));
    expect(h.missUntil).toBeGreaterThan(0);
    expect(h.reps).toBe(0);
  });
});

it('every garage station has its mini-game', () => {
  for (const id of ['rope', 'squat', 'treadmill', 'pushup', 'shoot', 'bench']) expect(makeMiniGame(id)?.id).toBe(id);
});
