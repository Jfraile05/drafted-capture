// ════════════════════════════════════════════════════════════════════════
//  drafted. Capture — Shared Type Contract
//
//  This file is the single source of truth for every execution context
//  (service worker, content script, popup, side panel, options page).
//
//  Mental model: this extension is AMBIENT. There is no "task" to describe
//  up front. The user flips capture ON and everything they do across every
//  tab streams into one continuous Session as an ordered list of Steps.
//  Tasks are recovered AFTERWARD by drawing Segments over the timeline.
// ════════════════════════════════════════════════════════════════════════

// ── Actions ───────────────────────────────────────────────────────────────

export type ActionType =
  | 'click'
  | 'double_click'
  | 'right_click'
  | 'type'
  | 'key'
  | 'scroll'
  | 'drag'
  | 'navigate'
  | 'tab_open'
  | 'tab_close'
  | 'tab_switch'
  | 'wait'
  | 'screenshot';

export interface Action {
  type: ActionType;
  /** Viewport pixel coordinate [x, y] in CSS pixels (not device pixels). */
  coordinate?: [number, number];
  /** Drag end coordinate. */
  end_coordinate?: [number, number];
  /** Accumulated text for a `type` action. */
  text?: string;
  /** Canonical key string for a `key` action, e.g. "Enter", "ctrl+c". */
  key?: string;
  button?: 'left' | 'right' | 'middle';
  scroll_direction?: 'up' | 'down' | 'left' | 'right';
  scroll_amount?: number;
  modifier_keys?: ModifierKey[];
  /** Destination URL for navigate / tab_open. */
  url?: string;
  /** Seconds, for `wait`. */
  duration?: number;
}

export type ModifierKey = 'ctrl' | 'shift' | 'alt' | 'meta';

// ── DOM Context ─────────────────────────────────────────────────────────────

export interface DOMContext {
  selector: string;
  xpath: string;
  tag: string;
  text: string | null;
  aria_role: string | null;
  aria_label: string | null;
  /** Bounding rect in CSS pixels, relative to the top-level viewport. */
  rect: { x: number; y: number; width: number; height: number };
  visible: boolean;
  interactive: boolean;
  input_type: string | null;
  /** Masked to bullets for password fields. */
  input_value: string | null;
}

// ── Screenshot ──────────────────────────────────────────────────────────────

export interface ScreenshotRef {
  /** SHA-256 of the PNG bytes; also the IndexedDB blob key. */
  hash: string;
  /** Intrinsic pixel width of the captured PNG (device pixels). */
  width: number;
  /** Intrinsic pixel height of the captured PNG (device pixels). */
  height: number;
  /** devicePixelRatio at capture time. CSS coord * dpr = device pixel. */
  dpr: number;
  size: number;
  timestamp: number;
}

// ── Origin (which tab / frame / url a step came from) ────────────────────────

export interface StepOrigin {
  tab_id: number;
  /** 0 is the top-level frame. */
  frame_id: number;
  url: string;
  title: string;
}

// ── Step ──────────────────────────────────────────────────────────────────

export interface Step {
  /** 0-based, monotonically increasing across the whole session. */
  index: number;
  timestamp: number;
  /** ms until the next step (null for the last/live step). */
  duration_to_next: number | null;
  action: Action;
  /** State of the screen when this action was taken. May be null if a
   *  capture was dropped (rate limit / protected page) — the action is
   *  still recorded so the trajectory stays complete. */
  screenshot: ScreenshotRef | null;
  dom: DOMContext | null;
  origin: StepOrigin;
  annotation: Annotation | null;
}

// ── Segments (post-hoc task labeling over the timeline) ──────────────────────

export interface Segment {
  id: string;
  /** Inclusive start step index. */
  start_index: number;
  /** Inclusive end step index. */
  end_index: number;
  label: string;
  category: TaskCategory | null;
  notes: string;
  created_at: string;
}

export type TaskCategory =
  | 'browse'
  | 'form_fill'
  | 'research'
  | 'purchase'
  | 'workflow'
  | 'communication'
  | 'data_entry'
  | 'other';

// ── Annotation ──────────────────────────────────────────────────────────────

export type AnnotationRating = 'correct' | 'suboptimal' | 'incorrect' | 'unclear';

export type AnnotationTag =
  | 'wrong_target'
  | 'missed_step'
  | 'unnecessary_step'
  | 'typing_error'
  | 'navigation_error'
  | 'scroll_overshoot'
  | 'excellent';

export interface Annotation {
  rating: AnnotationRating;
  tags: AnnotationTag[];
  notes: string;
  annotator: string;
}

// ── Session ─────────────────────────────────────────────────────────────────

export type CaptureState = 'idle' | 'capturing' | 'paused';

/** The live, in-progress session held in chrome.storage.session. Steps are
 *  stored separately in IndexedDB and referenced by count for performance. */
export interface LiveSession {
  id: string;
  state: CaptureState;
  started_at: number;
  /** Optional free-text the user typed before starting ("what are you about
   *  to do"). Becomes the instruction / first segment label on submit. */
  intent?: string;
  /** Bumped on every appended step so UIs can react cheaply. */
  step_count: number;
  /** Last few step summaries for the popup live feed (not the full array). */
  recent: StepSummary[];
  environment: Environment;
  metadata: SessionMetadata;
  stats: CaptureStats;
}

/** The complete, archived session written to IndexedDB on stop. */
export interface Session {
  id: string;
  source: 'human';
  started_at: number;
  ended_at: number;
  /** Optional intent the user declared before capturing. */
  intent?: string | null;
  environment: Environment;
  steps: Step[];
  segments: Segment[];
  outcome: {
    total_steps: number;
    total_duration_ms: number;
    tabs_touched: number;
    domains_touched: string[];
  };
  metadata: SessionMetadata;
  /** Submission state to Drafted (credential_tasks). Set after a successful
   *  submit so the UI can show status and so a later enrich updates the
   *  right doc rather than creating a duplicate. */
  submission?: {
    drafted_task_id: string;
    submitted_at: string;
    quality_score: number | null;
    last_enriched_at: string | null;
  } | null;
}

export interface Environment {
  display_width: number;
  display_height: number;
  device_pixel_ratio: number;
  user_agent: string;
  browser: string;
  browser_version: string;
  os: string;
  locale: string;
  timezone: string;
}

export interface SessionMetadata {
  extension_version: string;
  drafted_org_id: string | null;
  drafted_project_id: string | null;
  created_at: string;
  exported_at: string | null;
}

export interface CaptureStats {
  clicks: number;
  keystrokes: number;
  scrolls: number;
  navigations: number;
  screenshots: number;
}

/** Lightweight step preview for live UIs (avoids shipping screenshots around). */
export interface StepSummary {
  index: number;
  type: ActionType;
  label: string;
  url: string;
  timestamp: number;
}

// ── Settings ────────────────────────────────────────────────────────────────

export interface Settings {
  drafted_api_key: string;
  /** Capture a screenshot on every discrete action. */
  screenshot_on_action: boolean;
  /** Record a screen video for the whole session (prompts for a screen on
   *  start). Off by default since it requires a one-time picker each session. */
  record_video: boolean;
  /** Periodic screenshot cadence in ms to catch passive state changes. */
  screenshot_interval_ms: number;
  /** Domains to never capture on (privacy). Wildcards supported. */
  domain_blocklist: string[];
  /** Mask all text input values, not just passwords. */
  mask_all_inputs: boolean;
  /** Cap session size so storage stays bounded. */
  max_steps: number;
  max_duration_ms: number;
  drafted_org_id: string;
  drafted_project_id: string;
  export_formats: ExportFormatFlags;
  onboarding_complete: boolean;
  /** One-time legal consent captured on first run. */
  consent_accepted: boolean;
  consent_accepted_at: string | null;
}

export interface ExportFormatFlags {
  anthropic: boolean;
  openai: boolean;
  universal: boolean;
  trajectory: boolean;
}

// ── Export converters ────────────────────────────────────────────────────────

export interface FormatConverter {
  /** Registry key + base filename. */
  key: keyof ExportFormatFlags;
  /** Human label for the UI. */
  name: string;
  filename: string;
  convert(session: Session, screenshots: Map<string, Blob>): Promise<string>;
}

// ── Message protocol (content/UI → service worker) ───────────────────────────

export type MessageType =
  | 'TOGGLE_CAPTURE'
  | 'START_CAPTURE'
  | 'PAUSE_CAPTURE'
  | 'RESUME_CAPTURE'
  | 'STOP_CAPTURE'
  | 'CAPTURE_EVENT'
  | 'GET_LIVE_SESSION'
  | 'GET_CAPTURE_STATE'
  | 'LIST_SESSIONS'
  | 'GET_SESSION'
  | 'DELETE_SESSION'
  | 'EXPORT_SESSION'
  | 'SAVE_SEGMENT'
  | 'DELETE_SEGMENT'
  | 'UPDATE_ANNOTATION'
  | 'PING_CONTENT';

export interface ExtensionMessage<P = unknown> {
  type: MessageType;
  payload?: P;
}

/** Raw interaction event emitted by the content script. The service worker
 *  pairs it with a screenshot and assembles the final Step. */
export interface CaptureEventPayload {
  event: RawEvent;
  dom: DOMContext | null;
  /** devicePixelRatio in the frame at capture time. */
  dpr: number;
}

export interface RawEvent {
  type: ActionType;
  /** CSS-pixel viewport coordinate. */
  client_x: number;
  client_y: number;
  button?: number;
  key?: string;
  code?: string;
  text?: string;
  modifiers: ModifierKey[];
  scroll_x?: number;
  scroll_y?: number;
  scroll_delta_x?: number;
  scroll_delta_y?: number;
  url?: string;
  timestamp: number;
}
