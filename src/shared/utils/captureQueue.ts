// ════════════════════════════════════════════════════════════════════════
//  Screenshot capture queue.
//
//  chrome.tabs.captureVisibleTab throws once you exceed
//  MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND (~2/sec). In an ambient recorder
//  a burst of clicks would blow straight past that. So every capture request
//  funnels through ONE serial queue that:
//
//    1. spaces calls at least SCREENSHOT_MIN_INTERVAL_MS apart,
//    2. coalesces requests that pile up while one is in flight (the latest
//       wins — older screen states are stale anyway),
//    3. hashes + dedups so identical frames are stored once,
//    4. never throws: a failed capture resolves to null and the step is
//       still recorded (screenshot: null) so the trajectory stays complete.
// ════════════════════════════════════════════════════════════════════════

import { SCREENSHOT_MIN_INTERVAL_MS } from '../constants';
import { putScreenshot } from '../storage/db';
import type { ScreenshotRef } from '../types';
import { sha256 } from './crypto';
import { getImageDimensions } from './screenshot';

let lastCaptureAt = 0;
let inFlight: Promise<ScreenshotRef | null> | null = null;
let lastHash = '';
let lastRef: ScreenshotRef | null = null;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface CaptureOpts {
  /** windowId to capture; omit for the current window. */
  windowId?: number;
  /** devicePixelRatio reported by the source frame. */
  dpr: number;
}

/** Capture the visible tab, rate-limited and deduplicated. Resolves to a
 *  ScreenshotRef, or null if capture was not possible (protected page, no
 *  active tab, quota). Concurrent callers share the single in-flight capture. */
export async function captureVisible(opts: CaptureOpts): Promise<ScreenshotRef | null> {
  // Coalesce: if a capture is already running, ride along with it. The screen
  // state is effectively the same within a sub-second window.
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const wait = SCREENSHOT_MIN_INTERVAL_MS - (Date.now() - lastCaptureAt);
      if (wait > 0) await sleep(wait);

      const dataUrl =
        opts.windowId !== undefined
          ? await chrome.tabs.captureVisibleTab(opts.windowId, { format: 'png' })
          : await chrome.tabs.captureVisibleTab({ format: 'png' });
      lastCaptureAt = Date.now();

      if (!dataUrl) return null;

      const blob = await (await fetch(dataUrl)).blob();
      const buffer = await blob.arrayBuffer();
      const hash = await sha256(buffer);

      if (hash === lastHash && lastRef) return lastRef;

      await putScreenshot(hash, blob);
      const { width, height } = await getImageDimensions(blob);

      const ref: ScreenshotRef = {
        hash,
        width,
        height,
        dpr: opts.dpr,
        size: blob.size,
        timestamp: Date.now(),
      };
      lastHash = hash;
      lastRef = ref;
      return ref;
    } catch {
      // Protected pages (chrome://, Web Store), quota, or no active tab.
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export function resetCaptureQueue(): void {
  lastCaptureAt = 0;
  inFlight = null;
  lastHash = '';
  lastRef = null;
}
