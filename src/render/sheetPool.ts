/**
 * Sprite sheets are expensive to draw (~0.4 s each), so they are built in a small pool of Web Workers in parallel.
 * Falls back to drawing on the main thread when workers / OffscreenCanvas aren't available (or a worker fails).
 */
import { buildSheet, Kit, Sheet } from './sprites';
import type { Appearance } from './appearance';
import SheetWorker from './sheetWorker?worker&inline';

type Job = { id: number; msg: { heightFt: number; a: Appearance; kit: Kit }; resolve: (s: Sheet) => void };
const pending = new Map<number, Job>();
const queue: Job[] = [];
let workers: { w: Worker; busy: boolean }[] | null = null;
let disabled = typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined';
let nextId = 1;

function pool() {
  if (workers || disabled) return workers;
  try {
    const n = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
    workers = Array.from({ length: n }, () => ({ w: new SheetWorker() as Worker, busy: false }));
    for (const slot of workers) {
      slot.w.onmessage = (e) => {
        slot.busy = false;
        const d = e.data, job = pending.get(d.id);
        pending.delete(d.id);
        if (job) {
          if (d.error) job.resolve(buildSheet(job.msg.heightFt, job.msg.a, job.msg.kit));
          else {
            const canvas = document.createElement('canvas');
            canvas.width = d.bmp.width; canvas.height = d.bmp.height;
            canvas.getContext('2d')!.drawImage(d.bmp, 0, 0); d.bmp.close();
            job.resolve({ canvas, index: d.index, ball: d.ball, total: d.total });
          }
        }
        pump();
      };
      slot.w.onerror = () => { disabled = true; flushOnMainThread(); };
    }
  } catch { disabled = true; workers = null; }
  return workers;
}

function flushOnMainThread() {
  for (const job of [...queue, ...pending.values()]) job.resolve(buildSheet(job.msg.heightFt, job.msg.a, job.msg.kit));
  queue.length = 0; pending.clear();
}

function pump() {
  const ws = pool();
  if (!ws) { flushOnMainThread(); return; }
  for (const slot of ws) {
    if (slot.busy || !queue.length) continue;
    const job = queue.shift()!;
    slot.busy = true; pending.set(job.id, job);
    slot.w.postMessage({ id: job.id, ...job.msg });
  }
}

/** Build a player's sheet in the background. */
export function requestSheet(heightFt: number, a: Appearance, kit: Kit): Promise<Sheet> {
  return new Promise((resolve) => {
    queue.push({ id: nextId++, msg: { heightFt, a: JSON.parse(JSON.stringify(a)), kit: { ...kit } }, resolve });
    if (disabled) setTimeout(flushOnMainThread, 0); else pump();
  });
}
