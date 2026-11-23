import { type EarningsClock, earningsClock } from '../shared/liveEarnings';
import type { PrivacyGate } from '../shared/privacy';
import type { LiveSession } from '../shared/types';
import { watchActivity } from './activity';
import { startCapture } from './capture';
import { createOverlay } from './overlay';
import { showPrivacyGate, watchPrivacy } from './privacyOverlay';
import { startScreenshotHeartbeat } from './screenshotHeartbeat';
import { findSensitiveRegions } from './sensitiveRegions';

type CleanupFn = () => void;

let captureCleanup: CleanupFn | null = null;
let heartbeatCleanup: CleanupFn | null = null;
let privacyCleanup: CleanupFn | null = null;
let isCapturing = false;
let activitySessionId: string | undefined;
let activityCleanup: CleanupFn | undefined;
let latestClock: EarningsClock | null = null;
let captureUpdateReceived = false;
// Bumped by every broadcast, so a slower resync read never undoes a newer one.
let captureUpdateVersion = 0;

// Overlay needs document.body, which may not exist yet at document_start.
// Defer just the overlay paint until the body is available; capture listeners
// attach to `document` and are safe immediately.
function withBody(fn: () => void): void {
  if (document.body) {
    fn();
  } else {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  }
}

function handleSetCapture(
  capturing: boolean,
  gate: PrivacyGate | null = null,
  clock: EarningsClock | null = null,
): void {
  showPrivacyGate(gate);
  latestClock = clock;
  if (activitySessionId !== clock?.id) {
    activityCleanup?.();
    activitySessionId = clock?.id;
    activityCleanup = clock ? watchActivity(clock.id) : undefined;
  }
  withBody(() => createOverlay(latestClock));
  if (capturing === isCapturing) return;

  isCapturing = capturing;

  if (capturing) {
    captureCleanup = startCapture();
    heartbeatCleanup = startScreenshotHeartbeat();
    privacyCleanup = watchPrivacy();
  } else {
    heartbeatCleanup?.();
    heartbeatCleanup = null;
    privacyCleanup?.();
    privacyCleanup = null;
    if (captureCleanup) {
      captureCleanup();
      captureCleanup = null;
    }
  }
}

// Register the message listener SYNCHRONOUSLY at document_start so a
// SET_CAPTURE broadcast can never race ahead of us and get dropped.
function initContentScript(): void {
  try {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      try {
        if (message?.type === 'SET_CAPTURE') {
          captureUpdateReceived = true;
          captureUpdateVersion++;
          handleSetCapture(
            Boolean(message.payload?.capturing),
            message.payload?.privacyGate ?? null,
            message.payload?.clock ?? null,
          );
          sendResponse({ ok: true });
          return true;
        }

        if (message?.type === 'GET_SENSITIVE_REGIONS') {
          const ownTerms = message.payload?.ownTerms;
          sendResponse(
            findSensitiveRegions(
              Boolean(message.payload?.maskAllInputs),
              Array.isArray(ownTerms) ? ownTerms.filter((t) => typeof t === 'string') : [],
            ),
          );
          return true;
        }

        if (message?.type === 'PING_CONTENT') {
          sendResponse({ capturing: isCapturing });
          return true;
        }
      } catch (err) {
        console.warn('[drafted.capture] onMessage handler error', err);
      }
      return false;
    });

    // Restore the clock on navigation without letting an older read undo a broadcast.
    chrome.runtime.sendMessage({ type: 'GET_LIVE_SESSION' }, (response?: LiveSession) => {
      if (chrome.runtime.lastError || captureUpdateReceived) return;
      handleSetCapture(
        response?.state === 'capturing',
        response?.privacy_gate ?? null,
        earningsClock(response ?? null),
      );
    });

    // Frozen background tabs and pages restored from the back/forward cache
    // miss broadcasts (like Stop or a new task). Re-read the session when the
    // page is shown so the pill never keeps an old task's time.
    const resync = () => {
      if (document.hidden || !chrome.runtime?.id) return;
      const version = captureUpdateVersion;
      chrome.runtime.sendMessage({ type: 'GET_LIVE_SESSION' }, (response?: LiveSession) => {
        if (chrome.runtime.lastError || version !== captureUpdateVersion) return;
        handleSetCapture(
          response?.state === 'capturing',
          response?.privacy_gate ?? null,
          earningsClock(response ?? null),
        );
      });
    };
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) resync();
    });
  } catch (err) {
    console.warn('[drafted.capture] content script init failed', err);
  }
}

initContentScript();
