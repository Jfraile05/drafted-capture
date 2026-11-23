// ════════════════════════════════════════════════════════════════════════
//  Screenshot capture queue.
//
//  chrome.tabs.captureVisibleTab throws once you exceed
//  MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND (~2/sec). In an ambient recorder
//  a burst of clicks would blow straight past that. So every capture request
//  funnels through ONE serial queue that:
//
//    1. spaces calls at least SCREENSHOT_MIN_INTERVAL_MS apart,
//    2. coalesces requests for the same tab and URL while one is in flight,
//    3. hashes + dedups so identical frames are stored once,
//    4. never throws: a failed capture resolves to null and the step is
//       still recorded (screenshot: null) so the trajectory stays complete.
// ════════════════════════════════════════════════════════════════════════

import { SCREENSHOT_MIN_INTERVAL_MS } from '../constants';
import type { PrivacyPermit } from '../privacy';
import { putScreenshot } from '../storage/db';
import { getLiveSession, getSettings, withLiveLock } from '../storage/live';
import { getOwnTerms } from '../storage/ownTerms';
import type { ScreenshotRef } from '../types';
import { sha256 } from './crypto';
import { getImageDimensions } from './screenshot';
import { type Rect, maskScreenshotBlob } from './screenshotMask';

let lastCaptureAt = 0;
let inFlight: Promise<ScreenshotRef | null> | null = null;
let inFlightKey = '';
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
  /** URL associated with the step. Drop the frame if navigation has occurred. */
  url?: string;
  privacyPermit?: PrivacyPermit;
  validate?: () => Promise<boolean>;
}

async function matchesTarget(opts: CaptureOpts): Promise<boolean> {
  if (opts.tabId === undefined) return false;
  const [active] = await chrome.tabs.query({
    active: true,
    ...(opts.windowId === undefined ? { currentWindow: true } : { windowId: opts.windowId }),
  });
  return (
    active?.id === opts.tabId &&
    active.status !== 'loading' &&
    (!active.pendingUrl || active.pendingUrl === active.url) &&
    (opts.url === undefined || active.url === opts.url)
  );
}

/** Ask the page which regions to mask. Null when the page does not answer or
 *  could not check everything in time, so the caller can drop the screenshot
 *  instead of storing it unmasked. */
async function getSensitiveRegions(
  tabId: number,
): Promise<{ rects: Rect[]; viewportWidth: number } | null> {
  const [{ mask_all_inputs }, ownTerms] = await Promise.all([getSettings(), getOwnTerms()]);
  try {
    const answer = (await Promise.race([
      chrome.tabs.sendMessage(
        tabId,
        { type: 'GET_SENSITIVE_REGIONS', payload: { maskAllInputs: mask_all_inputs, ownTerms } },
        { frameId: 0 },
      ),
      sleep(1000).then(() => null),
    ])) as { rects?: Rect[]; viewportWidth?: number; complete?: boolean } | null;
    if (!answer || !Array.isArray(answer.rects) || !answer.viewportWidth) return null;
    if (answer.complete !== true) return null;
    return { rects: answer.rects, viewportWidth: answer.viewportWidth };
  } catch {
    return null;
  }
}

/** Capture the visible tab, rate-limited and deduplicated. Resolves to a
 *  ScreenshotRef, or null if capture was not possible (protected page, no
 *  active tab, quota). Concurrent callers only share frames for the same page. */
export async function captureVisible(opts: CaptureOpts): Promise<ScreenshotRef | null> {
  const key = JSON.stringify([opts.windowId, opts.tabId, opts.url, opts.privacyPermit]);
  if (inFlight) return key === inFlightKey ? inFlight : null;
  inFlightKey = key;

  const capture = (async () => {
    try {
      const wait = SCREENSHOT_MIN_INTERVAL_MS - (Date.now() - lastCaptureAt);
      if (wait > 0) await sleep(wait);
      if (!(await matchesTarget(opts))) return null;

      // Ask first, capture right after, so the regions match what is on screen.
      const regions = opts.tabId !== undefined ? await getSensitiveRegions(opts.tabId) : null;
      if (opts.tabId !== undefined && !regions) return null;
      if (!(await matchesTarget(opts))) return null;
      if (opts.validate && !(await opts.validate())) return null;

      const dataUrl =
        opts.windowId !== undefined
          ? await chrome.tabs.captureVisibleTab(opts.windowId, { format: 'png' })
          : await chrome.tabs.captureVisibleTab({ format: 'png' });
      lastCaptureAt = Date.now();

      if (!dataUrl || !(await matchesTarget(opts))) return null;

      let blob = await (await fetch(dataUrl)).blob();
      if (regions) blob = await maskScreenshotBlob(blob, regions.rects, regions.viewportWidth);
      const buffer = await blob.arrayBuffer();
      const hash = await sha256(buffer);
      if (opts.validate && !(await opts.validate())) return null;

      if (hash === lastHash && lastRef) return lastRef;

      const { width, height } = await getImageDimensions(blob);
      const stored = await withLiveLock(async () => {
        const permit = opts.privacyPermit;
        if (permit) {
          const live = await getLiveSession();
          if (
            live?.id !== permit.session_id ||
            live.state !== 'capturing' ||
            live.privacy_gate ||
            (live.privacy_epoch ?? 0) !== permit.epoch
          )
            return false;
        }
        await putScreenshot(hash, blob);
        return true;
      });
      if (!stored) return null;

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
    }
  })();
  inFlight = capture;
  try {
    return await capture;
  } finally {
    if (inFlight === capture) {
      inFlight = null;
      inFlightKey = '';
    }
  }
}

export function resetCaptureQueue(): void {
  lastCaptureAt = 0;
  inFlight = null;
  inFlightKey = '';
  lastHash = '';
  lastRef = null;
}
