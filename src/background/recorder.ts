// ════════════════════════════════════════════════════════════════════════
//  Screen-recording controller (worker side).
//
//  Orchestrates the offscreen MediaRecorder:
//   - prompts the user once (desktopCapture) for a screen to record,
//   - spins up the offscreen document,
//   - tells it to start, pause, resume, or stop for the capture session.
//
//  Recording is BEST-EFFORT and never blocks capture: if the user dismisses
//  the screen picker or the API is unavailable, screenshots + events still
//  record exactly as before. Video is an enrichment, not a requirement.
// ════════════════════════════════════════════════════════════════════════

import { PRIVACY_CONFIG } from '../config/privacy';
import { ensureOffscreen } from './offscreen';

let recording = false;
let requestVersion = 0;

/** Prompt for a screen and begin recording into the given session. Resolves
 *  true if recording started, false if unavailable or user-cancelled. */
export async function startRecording(sessionId: string): Promise<boolean> {
  if (!PRIVACY_CONFIG.continuousVideoEnabled) return false;
  if (recording) return true;
  if (!chrome.desktopCapture?.chooseDesktopMedia) return false;
  const version = ++requestVersion;

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

  const streamId = await new Promise<string>((resolve) => {
    try {
      chrome.desktopCapture.chooseDesktopMedia(
        ['screen', 'window', 'tab'],
        tab as chrome.tabs.Tab,
        (id) => resolve(id || ''),
      );
    } catch {
      resolve('');
    }
  });

  if (!streamId || version !== requestVersion) return false;

  await ensureOffscreen();
  if (version !== requestVersion) return false;

  await chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'START_RECORDING',
    streamId,
    sessionId,
  });
  if (version !== requestVersion) return false;
  recording = true;
  return true;
}

/** Pause an existing recording, including after the worker wakes from eviction. */
export async function pauseRecording(): Promise<void> {
  await chrome.runtime
    .sendMessage({ target: 'offscreen', type: 'PAUSE_RECORDING' })
    .catch(() => {});
}

/** Resume only the existing recording. Never opens a new screen picker. */
export async function resumeRecording(): Promise<void> {
  if (!PRIVACY_CONFIG.continuousVideoEnabled) return;
  await chrome.runtime
    .sendMessage({ target: 'offscreen', type: 'RESUME_RECORDING' })
    .catch(() => {});
}

/** Stop recording. The offscreen doc persists the webm to IndexedDB on stop. */
export async function stopRecording(): Promise<void> {
  // No early return on the in-memory flag: it resets to false whenever the
  // worker is evicted mid-session, which left the offscreen recorder running
  // after Stop. The offscreen doc ignores STOP when it is not recording, and
  // both calls below already tolerate there being no offscreen document.
  recording = false;
  ++requestVersion;
  await chrome.runtime.sendMessage({ target: 'offscreen', type: 'STOP_RECORDING' }).catch(() => {});
  // Keep the shared offscreen page alive for pending uploads.
}

export function isRecording(): boolean {
  return recording;
}
