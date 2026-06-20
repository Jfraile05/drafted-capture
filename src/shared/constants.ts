import type { AnnotationTag, Settings, TaskCategory } from './types';

export const EXTENSION_VERSION = '1.0.0';

// ── Storage keys ──────────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  /** Live session lives in chrome.storage.session (cleared on browser close). */
  LIVE_SESSION: 'live_session',
  /** Settings live in chrome.storage.local (persistent). */
  SETTINGS: 'settings',
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
export const SCREENSHOT_INTERVAL_MS = 2500;

/** Longest edge a stored/exported screenshot may have (Anthropic's limit). */
export const SCREENSHOT_MAX_DIMENSION = 1568;

/** Collapse rapid keystrokes into one `type` action after this idle gap. */
export const KEYSTROKE_DEBOUNCE_MS = 600;

/** One scroll event per window of this size. */
export const SCROLL_THROTTLE_MS = 150;

/** How many recent step summaries to keep on the live session for the popup. */
export const LIVE_RECENT_LIMIT = 8;

/** Alarm name for the periodic screenshot tick. */
export const ALARM_SCREENSHOT = 'screenshot-tick';

// ── Brand ─────────────────────────────────────────────────────────────────

export const BADGE_ON_COLOR = '#4DFFA0';
export const BADGE_PAUSED_COLOR = '#F5A623';

// ── Defaults ──────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: Settings = {
  drafted_api_key: '',
  screenshot_on_action: true,
  record_video: false,
  screenshot_interval_ms: SCREENSHOT_INTERVAL_MS,
  domain_blocklist: [],
  mask_all_inputs: false,
  max_steps: 5000,
  max_duration_ms: 4 * 60 * 60 * 1000,
  drafted_org_id: '',
  drafted_project_id: '',
  export_formats: {
    anthropic: true,
    openai: true,
    universal: true,
    trajectory: true,
  },
  onboarding_complete: false,
  consent_accepted: false,
  consent_accepted_at: null,
};

// ── UI vocab ──────────────────────────────────────────────────────────────

export const TASK_CATEGORIES: { value: TaskCategory; label: string }[] = [
  { value: 'browse', label: 'Browse' },
  { value: 'form_fill', label: 'Form Fill' },
  { value: 'research', label: 'Research' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'workflow', label: 'Workflow' },
  { value: 'communication', label: 'Communication' },
  { value: 'data_entry', label: 'Data Entry' },
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
