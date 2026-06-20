/**
 * Central telemetry API used by /tasks and /nova.
 *
 * Design: a tiny singleton wrapped around posthog-js that enriches every
 * event with the shared context (user, surface, task_type, session_id,
 * viewport, device) and owns the trajectory buffer.
 *
 * Consumers import the hooks in hooks/useTaskTelemetry.js or
 * hooks/useNovaTelemetry.js — they should not touch this module directly
 * unless instrumenting a non-hook call site.
 */

import {
  getDeviceType,
  getSharedContext,
  getViewport,
  newSessionId,
  setSharedContext,
} from './context';
import { TRAJECTORY_EVENTS } from './events';
import TrajectoryBuffer from './trajectory';

let _posthog = null;
let _trajectory = null;

function getPostHog() {
  if (_posthog) return _posthog;
  if (typeof window === 'undefined') return null;
  if (window.posthog) {
    _posthog = window.posthog;
    return _posthog;
  }
  return null;
}

export function bindPostHog(posthog) {
  _posthog = posthog;
  if (typeof window !== 'undefined' && posthog) {
    window.posthog = posthog;
  }
}

/**
 * Capture a single event. `extra` is merged into the shared context.
 * All values must be JSON-serializable.
 */
export function capture(event, extra = {}) {
  const ph = getPostHog();
  const props = { ...getSharedContext(), ...extra, captured_at_ms: Date.now() };
  if (!ph) {
    if (typeof window !== 'undefined' && process?.env?.NODE_ENV === 'development') {
      console.debug('[telemetry]', event, props);
    }
    return;
  }
  try {
    ph.capture(event, props);
  } catch (err) {
    console.warn('[telemetry] capture failed', event, err);
  }
}

/**
 * Start a training-session on a given surface. Opens a trajectory buffer
 * and seeds shared context. Returns the session id so callers can include
 * it in their own persistence (e.g. credential_tasks submission).
 */
export function startSession({
  surface,
  taskType = null,
  novaStage = null,
  promptId = null,
  agentId = null,
  user = null,
  profile = null,
}) {
  const sessionId = newSessionId();
  setSharedContext({
    session_id: sessionId,
    surface,
    task_type: taskType,
    nova_stage: novaStage,
    prompt_id: promptId,
    agent_id: agentId,
    user_uid: user?.uid || null,
    user_email: user?.email || null,
    university: profile?.university || null,
    major: profile?.major || null,
    device_type: getDeviceType(),
    viewport: getViewport(),
  });

  if (_trajectory) {
    try {
      _trajectory.stop();
    } catch {
      /* noop */
    }
  }
  _trajectory = new TrajectoryBuffer({
    surface,
    sessionId,
    onFlush: (chunk) => capture(TRAJECTORY_EVENTS.TRAJECTORY_CHUNK, chunk),
  });
  _trajectory.start();
  capture(TRAJECTORY_EVENTS.SESSION_STARTED, { started_at: Date.now() });
  return sessionId;
}

/**
 * Update shared context mid-session — e.g. when a Nova user switches task
 * type without leaving the page.
 */
export function updateContext(partial) {
  setSharedContext(partial);
}

/**
 * Explicit flush, e.g. right before submission so the chunk lands in the
 * same PostHog batch as the submission event.
 */
export function flushTrajectory(reason = 'manual') {
  if (_trajectory) _trajectory.flush(reason);
}

export function getTrajectorySummary() {
  return _trajectory ? _trajectory.summary() : null;
}

export function endSession(extra = {}) {
  const summary = getTrajectorySummary();
  capture(TRAJECTORY_EVENTS.SESSION_ENDED, { ...extra, summary });
  if (_trajectory) {
    try {
      _trajectory.stop();
    } catch {
      /* noop */
    }
    _trajectory = null;
  }
  setSharedContext({
    session_id: null,
    task_type: null,
    nova_stage: null,
    prompt_id: null,
  });
}

export { getSharedContext };
