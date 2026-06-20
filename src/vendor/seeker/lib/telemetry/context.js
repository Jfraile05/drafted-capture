/**
 * Shared context attached to every telemetry event.
 *
 * Keeps PostHog events uniform so we can slice by surface, task_type,
 * session_id, or university without each call site passing the same fields.
 */

let sharedContext = {
  session_id: null,
  surface: null, // 'tasks' | 'nova'
  task_type: null, // e.g. 'rlhf_preference_ranking'
  nova_stage: null, // 'build' | 'train' | 'leaderboard'
  prompt_id: null,
  agent_id: null,
  user_uid: null,
  user_email: null,
  university: null,
  major: null,
  device_type: null,
  viewport: null,
};

export function getSharedContext() {
  return { ...sharedContext };
}

export function setSharedContext(partial) {
  sharedContext = { ...sharedContext, ...partial };
}

export function clearSharedContext(keys) {
  if (!Array.isArray(keys)) {
    sharedContext = {
      session_id: null,
      surface: null,
      task_type: null,
      nova_stage: null,
      prompt_id: null,
      agent_id: null,
      user_uid: null,
      user_email: null,
      university: null,
      major: null,
      device_type: null,
      viewport: null,
    };
    return;
  }
  const next = { ...sharedContext };
  for (const k of keys) next[k] = null;
  sharedContext = next;
}

export function getDeviceType() {
  if (typeof window === 'undefined') return 'server';
  const w = window.innerWidth;
  if (w < 768) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

export function getViewport() {
  if (typeof window === 'undefined') return null;
  return { width: window.innerWidth, height: window.innerHeight };
}

export function newSessionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
