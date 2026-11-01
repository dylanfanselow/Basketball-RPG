import { describe, it, expect } from 'vitest';
import { FrameCache, yawFor } from '../src/render/frameCache';

const mk = (slotsPerPage = 2, maxPages = 2) => {
  const draws: string[] = [], pages: number[] = [];
  const c = new FrameCache({ newPage: (n) => pages.push(n), draw: (key) => { draws.push(key); return { ball: null, ballBehind: false }; } }, slotsPerPage, maxPages);
  return { c, draws, pages };
};

describe('FrameCache (on-demand angled frames)', () => {
  it('draws a key once and serves it after', () => {
    const { c, draws } = mk();
    expect(c.get('a')).toBeNull();
    c.request('a'); c.request('a');
    c.drain(5);
    expect(draws).toEqual(['a']);
    expect(c.get('a')).not.toBeNull();
    c.request('a'); c.drain(5);
    expect(draws).toEqual(['a']);
  });
  it('caps draws per drain and reports each dirty page once', () => {
    const { c, draws } = mk(2, 2);
    for (const k of ['a', 'b', 'c']) c.request(k);
    const dirty = c.drain(2);
    expect(draws.length).toBe(2);
    expect([...dirty]).toEqual([0]);
    expect([...c.drain(5)]).toEqual([1]);
  });
  it('allocates pages lazily and reuses the least recently used slot when full', () => {
    const { c, pages } = mk(1, 2);
    c.request('a'); c.request('b'); c.drain(5);
    expect(pages).toEqual([0, 1]);
    c.get('a'); // a is now more recent than b
    c.request('c'); c.drain(5);
    expect(c.get('b')).toBeNull();
    expect(c.get('a')).not.toBeNull();
    expect(c.get('c')!.page).toBe(1);
  });
  it('urgent requests jump the queue', () => {
    const { c, draws } = mk(4, 1);
    c.request('slow'); c.request('now', true); c.drain(1);
    expect(draws).toEqual(['now']);
  });
});

describe('yawFor (facing angle -> drawn view)', () => {
  it('snaps to the 5 drawn yaws and mirrors the left half', () => {
    expect(yawFor(0)).toEqual({ yaw: 0, flip: false });
    expect(yawFor(40)).toEqual({ yaw: 45, flip: false });
    expect(yawFor(90)).toEqual({ yaw: 90, flip: false });
    expect(yawFor(180)).toEqual({ yaw: 0, flip: true });
    expect(yawFor(135)).toEqual({ yaw: 45, flip: true });
    expect(yawFor(-135)).toEqual({ yaw: -45, flip: true });
    expect(yawFor(-80)).toEqual({ yaw: -90, flip: false });
  });
  it('holds the previous view near a boundary', () => {
    const prev = { yaw: 0, flip: false };
    expect(yawFor(25, prev)).toBe(prev); // 25 deg would snap to 45 fresh, but 0 is held within the band
    expect(yawFor(40, prev)).toEqual({ yaw: 45, flip: false });
  });
});
