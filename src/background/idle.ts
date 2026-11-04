// ════════════════════════════════════════════════════════════════════════
//  Idle auto-pause.
//
//  If the student walks away, capture pauses itself instead of quietly
//  recording an idle screen. It never resumes on its own: coming back to a
//  capture that restarted without being asked would record pages the student
//  did not choose to share. They resume from the popup or the shortcut.
//
//  chrome.idle only sees keyboard and mouse input, so reading or watching a
//  video without touching anything counts as idle after the timeout.
// ════════════════════════════════════════════════════════════════════════

import { getSettings } from '../shared/storage/live';
import { pauseCapture } from './session';

// Chrome rejects detection intervals under 15 seconds.
const MIN_IDLE_SECONDS = 15;

/** Tell Chrome how long to wait before reporting 'idle'. Safe to call often. */
export async function applyIdleDetection(): Promise<void> {
  const { idle_timeout_ms } = await getSettings();
  const seconds = Math.max(MIN_IDLE_SECONDS, Math.round(idle_timeout_ms / 1000));
  chrome.idle.setDetectionInterval(seconds);
}

/** 'idle' and 'locked' pause a capturing session. 'active' does nothing. */
export async function pauseIfIdle(state: string): Promise<void> {
  if (state === 'active') return;
  // pauseCapture is a no-op unless the session is currently capturing.
  await pauseCapture();
}
