import { startCapture } from './capture';
import { createOverlay, destroyOverlay } from './overlay';
import { findSensitiveRegions } from './sensitiveRegions';

type CleanupFn = () => void;

let captureCleanup: CleanupFn | null = null;
let isCapturing = false;

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

function handleSetCapture(capturing: boolean): void {
  if (capturing === isCapturing) return;

  isCapturing = capturing;

  if (capturing) {
    captureCleanup = startCapture();
    withBody(createOverlay);
  } else {
    if (captureCleanup) {
      captureCleanup();
      captureCleanup = null;
    }
    destroyOverlay();
  }
}

// Register the message listener SYNCHRONOUSLY at document_start so a
// SET_CAPTURE broadcast can never race ahead of us and get dropped.
function initContentScript(): void {
  try {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      try {
        if (message?.type === 'SET_CAPTURE') {
          handleSetCapture(Boolean(message.payload?.capturing));
          sendResponse({ ok: true });
          return true;
        }

        if (message?.type === 'GET_SENSITIVE_REGIONS') {
          sendResponse(findSensitiveRegions(Boolean(message.payload?.maskAllInputs)));
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

    // While the popup or side panel is open, it asks for the cursor position
    // here so the Sidekick mascot's eyes can follow it across the page.
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name !== 'sidekick-cursor') return;
      let frame = 0;
      let last: PointerEvent | null = null;
      const send = () => {
        frame = 0;
        if (!last) return;
        port.postMessage({
          sx: last.screenX,
          sy: last.screenY,
          ox: last.screenX - last.clientX,
          oy: last.screenY - last.clientY,
          w: window.innerWidth,
        });
      };
      const onMove = (e: PointerEvent) => {
        last = e;
        if (!frame) frame = requestAnimationFrame(send);
      };
      window.addEventListener('pointermove', onMove, { capture: true, passive: true });
      port.onDisconnect.addListener(() => {
        window.removeEventListener('pointermove', onMove, { capture: true });
        cancelAnimationFrame(frame);
      });
    });

    // The worker replies with a CaptureState string ('idle' | 'capturing' |
    // 'paused'). If this page loaded while capture is already running, self
    // start so capture stays continuous across every tab.
    chrome.runtime.sendMessage({ type: 'GET_CAPTURE_STATE' }, (response?: string) => {
      if (chrome.runtime.lastError) return;
      if (response === 'capturing') handleSetCapture(true);
    });
  } catch (err) {
    console.warn('[drafted.capture] content script init failed', err);
  }
}

initContentScript();
