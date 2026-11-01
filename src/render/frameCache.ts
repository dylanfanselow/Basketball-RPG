/**
 * On-demand cache of angled (multi-angle) player frames.
 *
 * Side-view frames for every clip are pre-built in the sheet workers. Angled frames (yaw != 0) are only drawn the
 * first time they're needed: `request` queues a key, `drain` draws up to `budget` queued frames into fixed-size
 * slots on texture pages, and `get` returns a slot once drawn (the scene shows the side-view frame until then).
 * Pages are allocated lazily up to `maxPages`; when full, the least recently used slot is reused.
 * Phaser-free: drawing and page creation are callbacks supplied by the scene, so this is unit-testable.
 */
import type { J } from './anim';

export interface Slot { key: string; page: number; index: number; ball: J | null; ballBehind: boolean; used: number }
export interface CacheIO {
  /** create page n (a canvas texture) */
  newPage(n: number): void;
  /** draw `key` into slot `index` of page `page`; returns the ball offset and whether it's behind the body */
  draw(key: string, page: number, index: number): { ball: J | null; ballBehind: boolean };
}

export class FrameCache {
  private slots = new Map<string, Slot>();
  private free: { page: number; index: number }[] = [];
  private queue: string[] = [];
  private queued = new Set<string>();
  private clock = 0;
  pages = 0;
  /** total frames drawn (for the dev readout) */
  drawn = 0;

  constructor(private io: CacheIO, readonly slotsPerPage = 48, readonly maxPages = 4) {}

  /** The drawn slot for a key, or null. Marks it recently used. */
  get(key: string): Slot | null {
    const s = this.slots.get(key);
    if (s) s.used = ++this.clock;
    return s ?? null;
  }

  /** Queue a key for drawing (no-op if drawn or already queued). `urgent` puts it at the front. */
  request(key: string, urgent = false) {
    if (this.slots.has(key) || this.queued.has(key)) return;
    this.queued.add(key);
    if (urgent) this.queue.unshift(key); else this.queue.push(key);
  }

  get pending() { return this.queue.length; }
  get size() { return this.slots.size; }

  /** Draw up to `budget` queued frames. Returns the pages that changed (refresh each once). */
  drain(budget: number): Set<number> {
    const dirty = new Set<number>();
    while (budget-- > 0 && this.queue.length) {
      const key = this.queue.shift()!;
      this.queued.delete(key);
      if (this.slots.has(key)) continue;
      const at = this.alloc();
      const r = this.io.draw(key, at.page, at.index);
      this.slots.set(key, { key, page: at.page, index: at.index, ball: r.ball, ballBehind: r.ballBehind, used: ++this.clock });
      this.drawn++;
      dirty.add(at.page);
    }
    return dirty;
  }

  private alloc(): { page: number; index: number } {
    if (!this.free.length && this.pages < this.maxPages) {
      this.io.newPage(this.pages);
      for (let i = 0; i < this.slotsPerPage; i++) this.free.push({ page: this.pages, index: i });
      this.pages++;
    }
    if (this.free.length) return this.free.shift()!;
    // full: reuse the least recently used slot
    let lru: Slot | null = null;
    for (const s of this.slots.values()) if (!lru || s.used < lru.used) lru = s;
    this.slots.delete(lru!.key);
    return { page: lru!.page, index: lru!.index };
  }
}

/** Snap a facing angle (deg, 0 = screen-right, +90 = toward the camera) to a drawn yaw + mirror, with hysteresis. */
export const YAWS = [-90, -45, 0, 45, 90];
export function yawFor(angleDeg: number, prev?: { yaw: number; flip: boolean }, hold = 10): { yaw: number; flip: boolean } {
  let a = ((angleDeg + 540) % 360) - 180; // (-180, 180]
  const flip = Math.abs(a) > 90;
  if (flip) a = Math.sign(a) * (180 - Math.abs(a));
  let best = YAWS[0];
  for (const y of YAWS) if (Math.abs(a - y) < Math.abs(a - best)) best = y;
  // hysteresis: keep the previous view while the angle is still within its band (+ hold degrees)
  if (prev && prev.flip === flip && Math.abs(a - prev.yaw) <= 22.5 + hold) return prev;
  if (prev && prev.flip !== flip && Math.abs(Math.abs(angleDeg) - 90) < hold && Math.abs(prev.yaw) === 90) return prev;
  return { yaw: best, flip };
}
