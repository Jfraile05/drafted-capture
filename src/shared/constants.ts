import type { AnnotationTag, Settings, TaskCategory } from './types';

import { IDLE_CONFIG } from '../config/idle';

export const EXTENSION_VERSION = '1.0.22';
/** Shows the Beta tag next to the wordmark and in the version line. */
export const IS_BETA = true;

// ── Storage keys ──────────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  /** Live session lives in chrome.storage.session (cleared on browser close). */
  LIVE_SESSION: 'live_session',
  /** Settings live in chrome.storage.local (persistent). */
  SETTINGS: 'settings',
  /** Copy of the live session in chrome.storage.local. Chrome clears session storage
   *  when it closes, so this is what lets a session left open still be submitted. */
  LIVE_BACKUP: 'live_session_backup',
} as const;

// ── IndexedDB stores ─────────────────────────────────────────────────────────

/** Blob store: hash -> PNG Blob. */
export const DB_SCREENSHOTS = 'drafted-capture-screenshots';
/** Session video recordings: sessionId -> webm Blob. */
export const DB_RECORDINGS = 'drafted-capture-recordings';
/** Steps store: `${sessionId}` -> Step[] for the live session (chunked appends). */
export const DB_STEPS = 'drafted-capture-steps';
/** Archive store: sessionId -> Session (full, with steps + segments). */
export const DB_SESSIONS = 'drafted-capture-sessions';

// ── Capture tuning ───────────────────────────────────────────────────────────

/** chrome.tabs.captureVisibleTab is hard-capped at ~2 calls/sec per the
 *  MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota. We serialize every capture
 *  through a queue and enforce a floor of 520ms between calls to stay under it. */
export const SCREENSHOT_MIN_INTERVAL_MS = 520;

/** Default periodic screenshot cadence (catches passive state changes). */
export const SCREENSHOT_INTERVAL_MS = 2000;

/** Collapse rapid keystrokes into one `type` action after this idle gap. */
export const KEYSTROKE_DEBOUNCE_MS = 600;

/** One scroll event per window of this size. */
export const SCROLL_THROTTLE_MS = 150;

/** How many recent step summaries to keep on the live session for the popup. */
export const LIVE_RECENT_LIMIT = 8;

/** Recovery tick when no visible page can send screenshot heartbeats. */
export const ALARM_SCREENSHOT = 'screenshot-tick';

/** Alarm that force-stops a session at its time limit. Wall clock, so it also
 *  fires on a paused session. */
export const ALARM_SESSION_CAP = 'session-cap';

/** Alarm that ends a session left inactive too long. */
export const ALARM_ABANDONED = 'session-abandoned';

/** A session with no activity for this long is stopped and submitted. */
export const ABANDONED_AFTER_MS = 20 * 60 * 1000;

/** Hard ceiling on one session. No saved setting can raise it. */
export const MAX_SESSION_MS = 24 * 60 * 60 * 1000;

/** The previous defaults. Installs that saved them without choosing them are
 *  moved to the new defaults on update (see migrateLegacyLimits). */
export const LEGACY_MAX_STEPS = 5000;
export const LEGACY_MAX_DURATION_MS = 4 * 60 * 60 * 1000;

// ── Brand ─────────────────────────────────────────────────────────────────

export const BADGE_ON_COLOR = '#4DFFA0';
export const BADGE_PAUSED_COLOR = '#F5A623';

// ── Defaults ──────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: Settings = {
  screenshot_on_action: true,
  allowlist_only: false,
  domain_allowlist: [],
  mask_all_inputs: false,
  // A full day of 2s interval screenshots is 43,200 steps by itself.
  max_steps: 50_000,
  max_duration_ms: MAX_SESSION_MS,
  idle_timeout_ms: IDLE_CONFIG.defaultMs,
  show_page_earnings: true,
  celebrate_saves: true,
  start_nudges: true,
  drafted_org_id: '',
  drafted_project_id: '',
  onboarding_complete: false,
  guide_seen: false,
  consent_accepted: false,
  consent_accepted_at: null,
};

// ── UI vocab ──────────────────────────────────────────────────────────────

export const TASK_CATEGORIES: { value: TaskCategory; label: string }[] = [
  { value: 'browse', label: 'Browse' },
  { value: 'form_fill', label: 'Form fill' },
  { value: 'research', label: 'Research' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'workflow', label: 'Workflow' },
  { value: 'communication', label: 'Communication' },
  { value: 'data_entry', label: 'Data entry' },
  { value: 'other', label: 'Other' },
];

export const ANNOTATION_TAGS: { value: AnnotationTag; label: string }[] = [
  { value: 'wrong_target', label: 'Wrong target' },
  { value: 'missed_step', label: 'Missed step' },
  { value: 'unnecessary_step', label: 'Unnecessary step' },
  { value: 'typing_error', label: 'Typing error' },
  { value: 'navigation_error', label: 'Navigation error' },
  { value: 'scroll_overshoot', label: 'Scroll overshoot' },
  { value: 'excellent', label: 'Excellent' },
];

// ── Endpoints ─────────────────────────────────────────────────────────────

export const DRAFTED_API_BASE = 'https://api.joindrafted.com/v1';
