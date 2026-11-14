import { CLIP, sampleClip } from '../src/render/anim';
import { describe, it, expect } from 'vitest';
import { ORBS, DRIBBLE_MOVES, POUND, MiniInput, NO_INPUT, SquatGame, TreadmillGame, DribbleGame, ShootGame, BenchGame, makeMiniGame } from '../src/world/minigames';

const DT = 1 / 60;
const inp = (p: Partial<MiniInput> = {}): MiniInput => ({ ...NO_INPUT, ...p });
const seeded = (s = 7) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };

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

describe('dribbling mat', () => {
  it('the right button fills; a wrong one locks for a second; full = a rep', () => {
    const g = new DribbleGame(seeded());
    for (let i = 0; i < 4; i++) { g.update(DT, inp({ [g.want]: true })); }
    expect(g.reps).toBe(1); // easier: four right buttons
    const h = new DribbleGame(seeded(3));
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
  for (const id of ['squat', 'treadmill', 'dribble', 'shoot', 'bench']) expect(makeMiniGame(id)?.id).toBe(id);
  expect(makeMiniGame('rope')).toBeNull();
});

describe('round 39b: shot jump + events', () => {
  it('you rise with the meter (top of the jump at a full meter) and land after the release', () => {
    const g = new ShootGame();
    g.update(DT, inp());
    for (let i = 0; i < 20; i++) g.update(DT, inp({ aHeld: true }));
    const mid = g.jumpFt();
    for (let i = 0; i < 30; i++) g.update(DT, inp({ aHeld: true }));
    expect(g.jumpFt()).toBeGreaterThan(mid);
    expect(g.jumpFt()).toBeLessThanOrEqual(ShootGame.JUMP + 1e-9);
    g.update(DT, inp());
    expect(g.takeEvents()).toEqual(expect.arrayContaining(['release']));
    for (let i = 0; i < 30; i++) g.update(DT, inp());
    expect(g.jumpFt()).toBe(0);
  });
  it('games report what happened for the sounds', () => {
    const sq = new SquatGame();
    for (let i = 0; i < 12; i++) sq.update(DT, inp(i % 2 ? { r2: true } : { l2: true }));
    const ev = sq.takeEvents();
    expect(ev).toContain('press'); expect(ev).toContain('rep');
    expect(sq.takeEvents()).toEqual([]);
    const tm = new TreadmillGame();
    while (Math.abs(tm.dot) < 0.5) tm.update(DT, inp());
    tm.update(DT, inp({ b: true }));
    expect(tm.takeEvents()).toContain('miss');
  });
});

describe('round 39c: perfect release', () => {
  const release = (g: ShootGame, target: number) => {
    g.update(DT, inp());
    g.update(DT, inp({ aHeld: true }));
    // hold until just past the target (the meter rises 1/FILL per second)
    while (g.meter < target) g.update(Math.min(DT, (target - g.meter) * ShootGame.FILL + 1e-4), inp({ aHeld: true }));
    g.update(1e-4, inp());
    return g.takeEvents();
  };
  it('the red slice in the middle of the green = perfect (a make too)', () => {
    const g = new ShootGame();
    const ev = release(g, (ShootGame.PERFECT[0] + ShootGame.PERFECT[1]) / 2);
    expect(ev).toContain('perfect'); expect(g.made).toBe(true); expect(g.perfect).toBe(true);
  });
  it('green outside the red = a make without the perfect', () => {
    const g = new ShootGame();
    const ev = release(g, 0.82);
    expect(ev).toContain('green'); expect(ev).not.toContain('perfect'); expect(g.made).toBe(true);
  });
});

describe('round 40: dribble moves', () => {
  it('each right button plays its move, then back to the pound dribble', () => {
    const g = new DribbleGame(seeded(9));
    expect(g.clip().clip).toBe(POUND.clip);
    const b = g.want;
    g.update(DT, inp({ [b]: true }));
    expect(g.clip().clip).toBe(DRIBBLE_MOVES[b].clip);
    for (let t = 0; t < DRIBBLE_MOVES[b].dur + 0.05; t += DT) g.update(DT, inp());
    expect(g.clip()).toEqual({ clip: POUND.clip, u: expect.any(Number) });
    expect(g.clip().u).toBeLessThan(0.3); // the pound restarts as the move ends
  });
  it('every dribble clip exists, faces us from a wide stance and starts / ends with the ball in the right hand', () => {
    for (const c of [POUND.clip, ...Object.values(DRIBBLE_MOVES).map((m) => m.clip)]) {
      const cl = CLIP[c]; expect(cl).toBeTruthy();
      for (const u of [0, 1]) { const p = sampleClip(cl, u); expect(p.ballLat).toBeGreaterThan(15); expect(p.lat!.fF! - p.lat!.fB!).toBeGreaterThan(30); }
      expect(Math.min(...cl.keys.map((k) => k.pose.ball![1]))).toBeLessThan(6); // it hits the floor
    }
  });
});

describe('round 42: workout orbs', () => {
  it('each station sends the owner\'s orbs', () => {
    // round 85: doubled
    expect(ORBS).toEqual({
      treadmill: ['mobility', 'mobility', 'mobility', 'mobility'], squat: ['strength', 'mobility', 'strength', 'mobility'], shoot: ['shooting', 'finishing', 'shooting', 'finishing'],
      bench: ['strength', 'finishing', 'strength', 'finishing'], dribble: ['playmaking', 'shooting', 'playmaking', 'shooting'],
    });
  });
  it('a full bar sends an orb (squat), the treadmill every 5 hits', () => {
    const sq = new SquatGame(seeded(1));
    let orbs = 0;
    for (let i = 0; i < 200 && sq.reps < 1; i++) { sq.update(DT, inp(i % 2 ? { l2: true } : { r2: true })); orbs += sq.takeEvents().filter((e) => e === 'orb').length; }
    expect(sq.reps).toBe(1); expect(orbs).toBe(1);
    const tm = new TreadmillGame(seeded(2));
    orbs = 0;
    for (let i = 0; i < 20000 && tm.reps < 10; i++) {
      const press = Math.abs(tm.dot) < 0.05;
      tm.update(DT, inp(press ? { b: true } : {}));
      orbs += tm.takeEvents().filter((e) => e === 'orb').length;
    }
    expect(tm.reps).toBe(10); expect(orbs).toBe(2);
  });
});
