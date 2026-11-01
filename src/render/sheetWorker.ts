/// <reference lib="webworker" />
// Builds player sprite sheets off the main thread (OffscreenCanvas) so several can be drawn in parallel.
import { buildSheet, Kit } from './sprites';
import type { Appearance } from './appearance';

self.onmessage = (e: MessageEvent<{ id: number; heightFt: number; a: Appearance; kit: Kit }>) => {
  const { id, heightFt, a, kit } = e.data;
  try {
    const sh = buildSheet(heightFt, a, kit);
    const bmp = (sh.canvas as unknown as OffscreenCanvas).transferToImageBitmap();
    (self as unknown as Worker).postMessage({ id, bmp, index: sh.index, ball: sh.ball, total: sh.total }, [bmp]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
