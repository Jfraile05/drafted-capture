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
import { getSettings } from '../storage/live';
import type { ScreenshotRef } from '../types';
import { sha256 } from './crypto';
import { getImageDimensions } from './screenshot';
import { type Rect, maskScreenshotBlob } from './screenshotMask';

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
  /** The tab being captured. When set, sensitive regions on its page are masked
   *  first, and the screenshot is dropped if they cannot be determined. */
  tabId?: number;
}

/** Ask the page which regions to mask. Null when the page does not answer, so
 *  the caller can drop the screenshot instead of storing it unmasked. */
async function getSensitiveRegions(
  tabId: number,
): Promise<{ rects: Rect[]; viewportWidth: number } | null> {
  const { mask_all_inputs } = await getSettings();
  try {
    const answer = (await Promise.race([
      chrome.tabs.sendMessage(
        tabId,
        { type: 'GET_SENSITIVE_REGIONS', payload: { maskAllInputs: mask_all_inputs } },
        { frameId: 0 },
      ),
      sleep(1000).then(() => null),
    ])) as { rects?: Rect[]; viewportWidth?: number } | null;
    if (!answer || !Array.isArray(answer.rects) || !answer.viewportWidth) return null;
    return { rects: answer.rects, viewportWidth: answer.viewportWidth };
  } catch {
    return null;
  }
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

      // Ask first, capture right after, so the regions match what is on screen.
      const regions = opts.tabId !== undefined ? await getSensitiveRegions(opts.tabId) : null;
      if (opts.tabId !== undefined && !regions) return null;

      const dataUrl =
        opts.windowId !== undefined
          ? await chrome.tabs.captureVisibleTab(opts.windowId, { format: 'png' })
          : await chrome.tabs.captureVisibleTab({ format: 'png' });
      lastCaptureAt = Date.now();

      if (!dataUrl) return null;

      let blob = await (await fetch(dataUrl)).blob();
      if (regions) blob = await maskScreenshotBlob(blob, regions.rects, regions.viewportWidth);
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
