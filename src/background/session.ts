// ════════════════════════════════════════════════════════════════════════
//  Session lifecycle — start, pause, resume, stop.
//
//  Creates/updates the LiveSession in chrome.storage.session, sets badge,
//  manages alarms. On stop, assembles the full archived Session and writes
//  it to IndexedDB.
// ════════════════════════════════════════════════════════════════════════

import { IDLE_CONFIG, idleThreshold } from '../config/idle';
import { activeOffset, pauseTimestamp } from '../shared/activeTime';
import {
  ALARM_SCREENSHOT,
  ALARM_SESSION_CAP,
  BADGE_ON_COLOR,
  BADGE_PAUSED_COLOR,
  EXTENSION_VERSION,
  MAX_SESSION_MS,
} from '../shared/constants';
import { earningsClock } from '../shared/liveEarnings';
import { clearSteps, getSteps, putSession } from '../shared/storage/db';
import { getLiveSession, getSettings, setLiveSession, withLiveLock } from '../shared/storage/live';
import type {
  CaptureControlRequest,
  CaptureState,
  CaptureStats,
  Environment,
  LiveSession,
  Session,
  SessionMetadata,
  Settings,
} from '../shared/types';
import { tagSegment } from '../shared/urlCategories';
import { resetCaptureQueue } from '../shared/utils/captureQueue';
import { selectWorkflow, selectedWorkflow, workflowSnapshot } from '../shared/workflows';
import { scheduleIdleCheck } from './idle';
import { clearIdleNotices, showIdleNotice } from './idleNotice';
import { checkCurrentScreen, prepareResume } from './privacy';
import { pauseRecording, resumeRecording, stopRecording } from './recorder';
import { wakeSync } from './sync';
import { setRecordingIcon } from './toolbarIcon';
import { getWorkflowAccess } from './workflows';

// State writes stay immediate. Slow tab, video and alarm updates run in order,
// so a late Resume broadcast cannot undo a newer Pause.
let effectsTail: Promise<unknown> = Promise.resolve();
let stopInFlight: Promise<unknown> = Promise.resolve();
export async function waitForCaptureStop(): Promise<void> {
  await stopInFlight;
}
function withCaptureEffects(fn: () => Promise<void>): Promise<void> {
  const run = effectsTail.then(fn, fn);
  effectsTail = run.catch(() => undefined);
  return run;
}

function controlTime(live: LiveSession, requestedAt: number): number {
  const lastTransition =
    live.state === 'paused' ? pauseTimestamp(live) : (live.pauses?.at(-1)?.[1] ?? live.started_at);
  const now = Date.now();
  return Math.max(lastTransition, Math.min(Number.isFinite(requestedAt) ? requestedAt : now, now));
}

function syncCaptureEffects(): Promise<void> {
  return withCaptureEffects(async () => {
    const live = await getLiveSession();
    if (!live) return;
    const capturing = live.state === 'capturing';
    // The idle question is answered once recording resumes or the pause becomes manual.
    if (live.pause_reason !== 'idle') await clearIdleNotices().catch(() => {});
    await chrome.action.setBadgeText({ text: String(live.step_count) });
    await chrome.action.setBadgeBackgroundColor({
      color: capturing ? BADGE_ON_COLOR : BADGE_PAUSED_COLOR,
    });
    await setRecordingIcon(capturing);
    if (capturing) {
      // Visible pages drive the fast cadence. Alarms are only a recovery path;
      // Chrome 116 requires a full minute between packaged-extension alarms.
      await chrome.alarms.create(ALARM_SCREENSHOT, {
        periodInMinutes: 1,
      });
      await resumeRecording();
    } else {
      await chrome.alarms.clear(ALARM_SCREENSHOT);
      await pauseRecording();
    }
    await broadcastCaptureState(capturing);
  });
}

// ── Session time limit ────────────────────────────────────────────────────

/** The limit for one session: the saved setting, never above the 24 hour ceiling. */
export function sessionCapMs(settings: Pick<Settings, 'max_duration_ms'>): number {
  return Math.min(settings.max_duration_ms, MAX_SESSION_MS);
}

/** Stops the session if it has run to its limit. Called by the cap alarm.
 *  Returns true when it stopped one. The clock is wall time from the start, so
 *  a session left paused is stopped too. */
export async function enforceSessionCap(): Promise<boolean> {
  const live = await getLiveSession();
  if (!live) return false;
  const cap = sessionCapMs(await getSettings());
  // Small tolerance so an alarm that lands a moment early still counts, while
  // a stale alarm cannot stop a session that just started.
  if (Date.now() - live.started_at < cap - 5000) return false;
  console.log('[session] time limit reached, stopping:', live.id);
  await stopCapture();
  return true;
}

// ── Start ─────────────────────────────────────────────────────────────────

export async function startCapture(
  intent?: string,
  workflowId?: string,
  annotationOptIn = false,
): Promise<LiveSession> {
  await stopInFlight;
  const settings = await getSettings();

  const access = await getWorkflowAccess();
  const selectedId = workflowId ?? (await selectedWorkflow(access.uid));
  const workflow = access.workflows.find((item) => item.id === selectedId);
  if (!workflow) throw new Error('Choose a workflow assigned to you before starting a task.');
  const environment = await snapshotEnvironment();
  const metadata: SessionMetadata = {
    extension_version: EXTENSION_VERSION,
    drafted_org_id: workflow.org_id,
    drafted_project_id: workflow.project_id,
    created_at: new Date().toISOString(),
    owner_uid: access.uid,
    workflow: workflowSnapshot(workflow, annotationOptIn),
  };

  const live: LiveSession = {
    id: crypto.randomUUID(),
    state: 'capturing',
    started_at: Date.now(),
    last_activity_at: Date.now(),
    intent: intent?.trim() || workflow.name,
    step_count: 0,
    recent: [],
    environment,
    metadata,
    stats: { clicks: 0, keystrokes: 0, scrolls: 0, navigations: 0, screenshots: 0 },
  };

  const started = await withLiveLock(async () => {
    const current = await getLiveSession();
    if (current) return current;
    await setLiveSession(live);
    return live;
  });
  if (started.id !== live.id) return started;
  await selectWorkflow(access.uid, workflow.id).catch(() => {});
  resetCaptureQueue();

  await chrome.alarms.create(ALARM_SESSION_CAP, { when: live.started_at + sessionCapMs(settings) });
  await syncCaptureEffects();
  await checkCurrentScreen();
  await scheduleIdleCheck();
  console.log('[session] started:', live.id);
  return (await getLiveSession()) ?? live;
}

// ── Pause ─────────────────────────────────────────────────────────────────

export async function pauseCapture(
  request: CaptureControlRequest = {},
  idle?: { lastActivity: number },
): Promise<LiveSession | null> {
  const requestedAt = request.requested_at ?? Date.now();
  const { live, changed } = await withLiveLock(async () => {
    const cur = await getLiveSession();
    if (request.session_id && cur?.id !== request.session_id) return { live: cur, changed: false };
    if (!cur) return { live: cur, changed: false };
    if (!idle && cur.state === 'paused') {
      cur.pause_reason = undefined;
      cur.privacy_gate = undefined;
      cur.privacy_approvals = undefined;
      cur.privacy_epoch = (cur.privacy_epoch ?? 0) + 1;
      await setLiveSession(cur);
      return { live: cur, changed: true };
    }
    if (cur.state !== 'capturing') return { live: cur, changed: false };
    if (idle && (cur.last_activity_at ?? cur.started_at) !== idle.lastActivity)
      return { live: cur, changed: false };
    cur.pause_reason = idle ? 'idle' : undefined;
    const lastActivity = cur.last_activity_at ?? requestedAt;
    const overdue =
      requestedAt - lastActivity >= idleThreshold((await getSettings()).idle_timeout_ms);
    cur.paused_at = controlTime(cur, overdue ? Math.min(requestedAt, lastActivity) : requestedAt);
    cur.state = 'paused';
    cur.privacy_epoch = (cur.privacy_epoch ?? 0) + 1;
    await setLiveSession(cur);
    return { live: cur, changed: true };
  });
  if (!changed || !live) return live;

  await syncCaptureEffects();
  if (live.state === 'paused' && live.pause_reason === 'idle')
    await showIdleNotice(live.id).catch(() => {});

  console.log('[session] paused:', live.id);
  return live;
}

// ── Resume ────────────────────────────────────────────────────────────────

export async function resumeCapture(
  request: CaptureControlRequest = {},
  privacyGateId?: string,
  idleOnly = false,
  automaticGateId?: string,
): Promise<LiveSession | null> {
  const before = await getLiveSession();
  if (!before || before.state !== 'paused') return before;
  if (idleOnly && before.pause_reason !== 'idle') return before;
  if (automaticGateId && before.privacy_gate?.id !== automaticGateId) return before;
  if (request.session_id && before.id !== request.session_id) return before;
  if (!(await prepareResume(before.id, privacyGateId, automaticGateId))) return getLiveSession();
  const requestedAt = request.requested_at ?? Date.now();
  const { live, changed } = await withLiveLock(async () => {
    const cur = await getLiveSession();
    if (request.session_id && cur?.id !== request.session_id) return { live: cur, changed: false };
    if (!cur || cur.state !== 'paused' || cur.privacy_gate) return { live: cur, changed: false };
    if (idleOnly && cur.pause_reason !== 'idle') return { live: cur, changed: false };
    if (automaticGateId && (cur.privacy_epoch ?? 0) !== (before.privacy_epoch ?? 0) + 1)
      return { live: cur, changed: false };
    cur.pauses = [...(cur.pauses ?? []), [pauseTimestamp(cur), controlTime(cur, requestedAt)]];
    cur.state = 'capturing';
    cur.paused_at = undefined;
    cur.pause_reason = undefined;
    cur.last_activity_at = Date.now();
    await setLiveSession(cur);
    return { live: cur, changed: true };
  });
  if (!changed || !live) return live;

  await syncCaptureEffects();

  console.log('[session] resumed:', live.id);
  await scheduleIdleCheck();
  return live;
}

// ── Stop ──────────────────────────────────────────────────────────────────

// Returns the archived session id (so the caller can auto-submit), or null
// if there was nothing to stop.
export function stopCapture(request: CaptureControlRequest = {}): Promise<string | null> {
  const stopped = finishCapture({ ...request, requested_at: request.requested_at ?? Date.now() });
  // A reopened popup must not start a new session during the old cleanup.
  stopInFlight = Promise.all([stopInFlight, stopped]).catch(() => undefined);
  return stopped;
}

async function finishCapture(request: CaptureControlRequest): Promise<string | null> {
  const requestedAt = request.requested_at ?? Date.now();
  // CRITICAL ORDERING: clear the live session and stop capture FIRST, before
  // any operation that can throw (IndexedDB archive). If archiving failed
  // first, the UI would never transition out of "paused/capturing" and Stop
  // would appear broken. Capture must always stop the instant Stop is pressed.
  // Clearing happens under the live lock, so no in-flight step can write the
  // session back afterwards; steps that finish later see no session and drop.
  const stopped = await withLiveLock(async () => {
    const cur = await getLiveSession();
    if (!cur || (request.session_id && cur.id !== request.session_id)) return null;
    const endedAt = controlTime(cur, requestedAt);
    await setLiveSession(null);
    return { live: cur, endedAt };
  });
  if (!stopped) return null;
  const { live, endedAt } = stopped;
  // Every way a session ends (Stop, time limit, step limit) runs through here,
  // so the screen recording stops with it.
  await withCaptureEffects(async () => {
    await stopRecording().catch(() => {});
    await chrome.action.setBadgeText({ text: '' }).catch(() => {});
    await setRecordingIcon(false);
    await chrome.alarms.clear(ALARM_SCREENSHOT).catch(() => {});
    await chrome.alarms.clear(ALARM_SESSION_CAP).catch(() => {});
    await chrome.alarms.clear(IDLE_CONFIG.alarmName).catch(() => {});
    await clearIdleNotices().catch(() => {});
    await broadcastCaptureState(false).catch(() => {});
  });

  // Now archive. Wrapped so a storage hiccup never propagates as a failed Stop.
  try {
    const steps = await getSteps(live.id);
    // Stop can wake a suspended worker before its idle alarm is delivered.
    const lastActivity = live.last_activity_at ?? endedAt;
    if (
      live.state === 'capturing' &&
      endedAt - lastActivity >= idleThreshold((await getSettings()).idle_timeout_ms)
    ) {
      live.state = 'paused';
      live.paused_at = controlTime(live, lastActivity);
    }

    const uniqueTabs = new Set(steps.map((s) => s.origin?.tab_id ?? -1));
    const uniqueDomains = Array.from(
      new Set(
        steps
          .map((s) => {
            try {
              return s.origin?.url ? new URL(s.origin.url).hostname : '';
            } catch {
              return '';
            }
          })
          .filter(Boolean),
      ),
    );

    // Stopping while paused ends the session at the moment of the pause.
    const pauses: [number, number][] =
      live.state === 'paused'
        ? [...(live.pauses ?? []), [pauseTimestamp(live), endedAt]]
        : (live.pauses ?? []);
    const totalDuration = activeOffset(live.started_at, pauses, endedAt);

    // If the user declared an intent before capturing, seed a segment spanning
    // the whole session so the intent rides through as the instruction label.
    const seededSegments =
      live.intent && steps.length > 0
        ? [
            {
              id: crypto.randomUUID(),
              start_index: 0,
              end_index: steps.length - 1,
              label: live.intent,
              category: null,
              notes: '',
              created_at: new Date().toISOString(),
            },
          ]
        : [];

    const session: Session = {
      id: live.id,
      source: 'human',
      started_at: live.started_at,
      ended_at: endedAt,
      pauses,
      intent: live.intent ?? null,
      environment: live.environment,
      steps,
      segments: seededSegments.map((segment) => tagSegment(segment, steps)),
      outcome: {
        total_steps: steps.length,
        total_duration_ms: totalDuration,
        tabs_touched: uniqueTabs.size,
        domains_touched: uniqueDomains,
      },
      metadata: live.metadata,
      sync: { revision: 1, synced_revision: 0, attempts: 0, retry_at: 0 },
    };

    await putSession(session);
    wakeSync();
    await clearSteps(live.id);
    console.log('[session] stopped + archived:', session.id, steps.length, 'steps');
    return session.id;
  } catch (err) {
    // Capture already stopped above; surface the archive failure but do not
    // throw, so the popup still transitions to idle.
    console.error('[session] archive failed after stop:', err);
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

export async function getCaptureState(): Promise<CaptureState> {
  const live = await getLiveSession();
  return live?.state ?? 'idle';
}

async function snapshotEnvironment(): Promise<Environment> {
  const ua = navigator.userAgent;
  const browserMatch = ua.match(/(Chrome|Edg|Brave|Opera)\/([\d.]+)/);
  const browser = browserMatch?.[1] ?? 'Chrome';
  const browserVersion = browserMatch?.[2] ?? 'unknown';

  const osMatch = ua.match(/(Windows|Mac|Linux|CrOS)/);
  const os = osMatch?.[0] ?? 'unknown';

  // Service workers have no `screen` / `devicePixelRatio` / window globals.
  // Derive the display size from the active tab's window; per-event DPR is
  // captured separately from each content frame (that is what the crosshair
  // math uses), so 1 is a safe nominal default here.
  let width = 0;
  let height = 0;
  try {
    const win = await chrome.windows.getCurrent();
    width = win.width ?? 0;
    height = win.height ?? 0;
  } catch {
    // ignore — fall back to zeros
  }

  return {
    display_width: width,
    display_height: height,
    device_pixel_ratio: 1,
    user_agent: ua,
    browser,
    browser_version: browserVersion,
    os,
    locale: navigator.language ?? 'en',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

// The content-script file path as it appears in the FINAL built manifest.
// (CRXJS rewrites src/content/index.ts to a hashed loader; reading it at
// runtime means we inject exactly what is declared, no hardcoded hash.)
function contentScriptFiles(): string[] {
  const cs = chrome.runtime.getManifest().content_scripts?.[0]?.js ?? [];
  return cs as string[];
}

async function broadcastCaptureState(capturing: boolean): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => setTabCapture(tab, capturing)));
}

// Public: re-assert the current capture state to every tab. Used by the worker
// recovery path after eviction, where state is already 'capturing' (so
// resumeCapture would no-op) but tab listeners may have been lost.
export async function rebroadcastCaptureState(): Promise<void> {
  await syncCaptureEffects();
}

// Tell one tab to start/stop. If the tab has no content script yet (it was
// already open before the extension loaded, so the declared script never
// injected), inject it on the fly, then deliver the message. This is what
// makes capture work the instant you turn it on, with no "reload your tabs".
async function setTabCapture(tab: chrome.tabs.Tab, capturing: boolean): Promise<void> {
  if (tab.id === undefined) return;
  const tabId = tab.id;
  const live = await getLiveSession();
  const gate = live?.privacy_gate;
  const privacyGate = gate?.tab_id === tabId ? gate : null;
  const msg = {
    type: 'SET_CAPTURE',
    payload: { capturing, privacyGate, clock: earningsClock(live) },
  };

  try {
    await chrome.tabs.sendMessage(tabId, msg);
    return; // content script present and handled it
  } catch {
    // No receiver. Only worth injecting when turning capture ON, and only on
    // http/https pages (chrome://, the Web Store, and file:// are off limits).
    if (!capturing) return;
    const url = tab.url ?? '';
    if (!/^https?:\/\//.test(url)) return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: contentScriptFiles(),
    });
    // Give the freshly injected listener a tick, then deliver the message.
    await chrome.tabs.sendMessage(tabId, msg).catch(() => {});
  } catch {
    // Page forbids injection (e.g. PDF viewer, restricted host). Skip quietly.
  }
}
