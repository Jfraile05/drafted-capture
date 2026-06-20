/**
 * Event taxonomy for /tasks and /nova telemetry.
 *
 * Naming convention: `<surface>_<object>_<verb>` — past tense, snake_case.
 * Every event carries the shared context in lib/telemetry/index.js.
 *
 * Events are grouped by surface so PostHog dashboards can use prefix filters.
 */

// --- Training Lab (/tasks) ---
export const TASK_EVENTS = {
  HUB_VIEWED: 'tasks_hub_viewed',
  HUB_DWELL: 'tasks_hub_dwell',
  HUB_CARD_CLICKED: 'tasks_hub_card_clicked',
  HUB_CONSENT_SAVED: 'tasks_hub_consent_saved',

  TASK_STARTED: 'task_started',
  TASK_PROMPT_LOADED: 'task_prompt_loaded',
  TASK_SECTION_ENTERED: 'task_section_entered',
  TASK_FIELD_CHANGED: 'task_field_changed',
  TASK_PREFERENCE_CHANGED: 'task_preference_changed',
  TASK_RATING_CHANGED: 'task_rating_changed',
  TASK_RATIONALE_EDITED: 'task_rationale_edited',
  TASK_PASTE_DETECTED: 'task_paste_detected',
  TASK_FLAGGED: 'task_flagged',
  TASK_SUBMITTED: 'task_submitted',
  TASK_SUBMIT_FAILED: 'task_submit_failed',
  TASK_ABANDONED: 'task_abandoned',
  TASK_BADGE_EARNED: 'task_badge_earned',
};

// --- Nova (/nova) ---
export const NOVA_EVENTS = {
  LANDING_VIEWED: 'nova_landing_viewed',
  BUILD_VIEWED: 'nova_build_viewed',
  AGENT_AWAKENED: 'nova_agent_awakened',
  AGENT_RENAMED: 'nova_agent_renamed',

  TRAIN_VIEWED: 'nova_train_viewed',
  TRAIN_TASK_SELECTED: 'nova_train_task_selected',
  TRAIN_PROMPT_LOADED: 'nova_train_prompt_loaded',
  TRAIN_TASK_SUBMITTED: 'nova_train_task_submitted',
  TRAIN_LEVEL_UP: 'nova_train_level_up',
  TRAIN_SESSION_ENDED: 'nova_train_session_ended',

  LEADERBOARD_VIEWED: 'nova_leaderboard_viewed',
  TEACHING_TOAST_SHOWN: 'nova_teaching_toast_shown',
};

// --- Trajectory & interaction (shared across /tasks and /nova) ---
export const TRAJECTORY_EVENTS = {
  TRAJECTORY_CHUNK: 'trajectory_chunk',
  SESSION_STARTED: 'telemetry_session_started',
  SESSION_ENDED: 'telemetry_session_ended',
  VIEWPORT_RESIZED: 'viewport_resized',
  TAB_VISIBILITY_CHANGED: 'tab_visibility_changed',
  IDLE_DETECTED: 'idle_detected',
};

export const ALL_EVENTS = {
  ...TASK_EVENTS,
  ...NOVA_EVENTS,
  ...TRAJECTORY_EVENTS,
};
