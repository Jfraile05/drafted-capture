// ════════════════════════════════════════════════════════════════════════
//  Service Worker Entry — the brain.
//
//  Registers message handlers, tab/alarm/command listeners, and recovers
//  state when the worker wakes from eviction.
// ════════════════════════════════════════════════════════════════════════

import { IDLE_CONFIG } from '../config/idle';
import { PRIVACY_CONFIG } from '../config/privacy';
import { ALARM_SCREENSHOT, ALARM_SESSION_CAP, STORAGE_KEYS } from '../shared/constants';
import { summarizeEarnings } from '../shared/earnings';
import { summarizeQuality } from '../shared/quality';
import { deleteSession, getSession, listSessions, updateSession } from '../shared/storage/db';
import { getLiveSession, getSettings, migrateLegacyLimits } from '../shared/storage/live';
import { notifySessionUpdate } from '../shared/storage/sessionUpdates';
import { SYNC_CONFIG } from '../shared/syncConfig';
import { markSessionDirty } from '../shared/syncState';
import type {
  Annotation,
  CaptureControlRequest,
  CaptureEventPayload,
  ExtensionMessage,
  LiveSession,
  MessageType,
  Segment,
} from '../shared/types';
import { tagSegment } from '../shared/urlCategories';
import {
  handleCaptureEvent,
  handleIntervalScreenshot,
  handleTabActivated,
  handleTabCreated,
  handleTabRemoved,
  handleTabUpdated,
} from './coordinator';
import {
  applyIdleDetection,
  checkInputIdle,
  pauseIfIdle,
  recordActivity,
  scheduleIdleCheck,
} from './idle';
import { idleNoticeSession } from './idleNotice';
import { checkCurrentScreen, invalidatePrivacyApproval, keepPrivacyPaused } from './privacy';
import { refreshPrivacyPolicy } from './privacyPolicy';
import { qualityReviews } from './quality';
import {
  enforceSessionCap,
  getCaptureState,
  pauseCapture,
  rebroadcastCaptureState,
  resumeCapture,
  startCapture,
  stopCapture,
  waitForCaptureStop,
} from './session';
import { clearStartPrompt, handleStartPromptButton, noteBrowsing } from './startPrompt';
import { initializeSync, wakeSync } from './sync';
import { getWorkflowAccess } from './workflows';

// ── Message router ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  // Offscreen commands have their own receiver. Do not race its response.
  if ('target' in message && message.target === 'offscreen') return;
  if (['RECORDING_SAVED', 'RECORDING_FAILED'].includes(message.type)) return;
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((err) => {
      console.error('[bg] message error:', err);
      sendResponse({ error: String(err) });
    });
  return true; // async
});

// Guards against a double-fire of the toggle (rapid clicks / key + click)
// flipping capturing -> paused in the same instant.
let toggleInFlight = false;

async function handleMessage(
  msg: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  switch (msg.type) {
    case 'GET_WORKFLOWS':
      return getWorkflowAccess();
    case 'WAKE_SYNC':
      wakeSync();
      return { ok: true };
    case 'SESSION_SYNC_CHANGED':
      await notifySessionUpdate((msg.payload as { id: string }).id);
      return { ok: true };
    case 'TOGGLE_CAPTURE': {
      if (toggleInFlight) return getLiveSession();
      toggleInFlight = true;
      try {
        const payload = msg.payload as
          | { intent?: string; workflow_id?: string; annotation_opt_in?: boolean }
          | undefined;
        const live = await getLiveSession();
        if (!live || live.state === 'idle') {
          const started = await startCapture(
            payload?.intent,
            payload?.workflow_id,
            payload?.annotation_opt_in === true,
          );
          void clearStartPrompt();
          return started;
        }
        if (live.state === 'capturing') {
          return await pauseCapture();
        }
        return await resumeCapture();
      } finally {
        toggleInFlight = false;
      }
    }

    case 'START_CAPTURE': {
      const payload = msg.payload as
        | { intent?: string; workflow_id?: string; annotation_opt_in?: boolean }
        | undefined;
      const started = await startCapture(
        payload?.intent,
        payload?.workflow_id,
        payload?.annotation_opt_in === true,
      );
      void clearStartPrompt();
      return started;
    }

    case 'PAUSE_CAPTURE':
      return pauseCapture(msg.payload as CaptureControlRequest | undefined);

    case 'RESUME_CAPTURE':
      return resumeCapture(msg.payload as CaptureControlRequest | undefined);

    case 'USER_ACTIVITY': {
      const { sessionId, timestamp } = msg.payload as { sessionId: string; timestamp: number };
      await recordActivity(sessionId, timestamp, sender);
      return { ok: true };
    }

    case 'PRIVACY_CHECK':
      await checkCurrentScreen();
      return { ok: true };

    case 'CONFIRM_PRIVACY':
    case 'KEEP_PRIVACY_PAUSED': {
      const { gateId, sessionId } = msg.payload as { gateId: string; sessionId?: string };
      const live = await getLiveSession();
      if (!live || live.privacy_gate?.id !== gateId || (sessionId && sessionId !== live.id)) {
        throw new Error('This screen changed. Review the current privacy prompt.');
      }
      if (sender.tab && (sender.frameId !== 0 || sender.tab.id !== live.privacy_gate.tab_id)) {
        throw new Error('Confirm from the current screen or the Sidekick popup.');
      }
      if (msg.type === 'KEEP_PRIVACY_PAUSED') {
        await keepPrivacyPaused(gateId);
        return { ok: true };
      }
      return resumeCapture({ session_id: live.id }, gateId);
    }

    case 'STOP_CAPTURE': {
      // Archive locally and let the durable background queue handle uploads.
      const sessionId = await stopCapture(msg.payload as CaptureControlRequest | undefined);
      return { sessionId };
    }

    case 'CAPTURE_EVENT':
      return handleCaptureEvent(msg.payload as CaptureEventPayload, sender);

    case 'SCREENSHOT_TICK':
      return handleIntervalScreenshot(sender);

    case 'GET_LIVE_SESSION': {
      const live = await getLiveSession();
      if (live && sender.tab && live.privacy_gate?.tab_id !== sender.tab.id) {
        return { ...live, privacy_gate: undefined };
      }
      return live;
    }

    case 'GET_CAPTURE_STATE':
      return getCaptureState();

    case 'LIST_SESSIONS':
      return listSessions();

    case 'GET_EARNINGS': {
      const { uid, localOnly } = msg.payload as { uid: string; localOnly: boolean };
      await waitForCaptureStop();
      return summarizeEarnings(await listSessions(), uid, localOnly);
    }

    case 'GET_QUALITY': {
      const { uid, localOnly } = msg.payload as { uid: string; localOnly: boolean };
      await waitForCaptureStop();
      const sessions = await listSessions();
      const taskIds = sessions.flatMap((s) =>
        s.metadata.owner_uid === uid && s.submission?.drafted_task_id
          ? [s.submission.drafted_task_id]
          : [],
      );
      return summarizeQuality(sessions, await qualityReviews(taskIds), uid, localOnly);
    }

    case 'GET_SESSION_QUALITY': {
      const taskId = (msg.payload as { taskId: string }).taskId;
      return (await qualityReviews([taskId]))[taskId] ?? null;
    }

    case 'GET_SESSION':
      await waitForCaptureStop();
      return getSession((msg.payload as { id: string }).id);

    case 'DELETE_SESSION':
      await deleteSession((msg.payload as { id: string }).id);
      return { ok: true };

    case 'SAVE_SEGMENT': {
      const { sessionId, segment } = msg.payload as {
        sessionId: string;
        segment: Segment;
      };
      const updated = await updateSession(sessionId, (session) => {
        const taggedSegment = tagSegment(segment, session.steps);
        const existing = session.segments.findIndex((s) => s.id === segment.id);
        if (existing >= 0) {
          session.segments[existing] = taggedSegment;
        } else {
          session.segments.push(taggedSegment);
        }
        return markSessionDirty(session);
      });
      wakeSync();
      return updated;
    }

    case 'DELETE_SEGMENT': {
      const { sessionId, segmentId } = msg.payload as {
        sessionId: string;
        segmentId: string;
      };
      const updated = await updateSession(sessionId, (session) => {
        session.segments = session.segments.filter((s) => s.id !== segmentId);
        return markSessionDirty(session);
      });
      wakeSync();
      return updated;
    }

    case 'UPDATE_ANNOTATION': {
      const { sessionId, stepIndex, annotation } = msg.payload as {
        sessionId: string;
        stepIndex: number;
        annotation: Annotation | null;
      };
      const updated = await updateSession(sessionId, (session) => {
        if (stepIndex < 0 || stepIndex >= session.steps.length) {
          throw new Error('Step index out of range');
        }
        session.steps[stepIndex].annotation = annotation;
        return markSessionDirty(session);
      });
      wakeSync();
      return updated;
    }

    case 'PING_CONTENT':
      // Content script pings; not handled by worker.
      return { ok: true };

    default: {
      const exhaustive: never = msg.type;
      throw new Error(`Unknown message type: ${exhaustive}`);
    }
  }
}

// ── Tab listeners ─────────────────────────────────────────────────────────

chrome.tabs.onActivated.addListener((activeInfo) => {
  handleTabActivated(activeInfo).catch((err) => console.error('[bg] tab activated error:', err));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    noteBrowsing(tab.url, tab.incognito).catch((err) =>
      console.warn('[bg] start prompt error:', err),
    );
  }
  handleTabUpdated(tabId, changeInfo, tab).catch((err) =>
    console.error('[bg] tab updated error:', err),
  );
});

chrome.tabs.onCreated.addListener((tab) => {
  handleTabCreated(tab).catch((err) => console.error('[bg] tab created error:', err));
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  handleTabRemoved(tabId, removeInfo).catch((err) => console.error('[bg] tab removed error:', err));
});

// ── Alarm handler ─────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === IDLE_CONFIG.alarmName) {
    void checkInputIdle().catch(() => {});
  } else if (alarm.name === PRIVACY_CONFIG.alarmName) {
    void refreshPrivacyPolicy();
  } else if (alarm.name === SYNC_CONFIG.alarmName) {
    wakeSync();
  } else if (alarm.name === ALARM_SCREENSHOT) {
    handleIntervalScreenshot().catch((err) => console.error('[bg] alarm screenshot error:', err));
  } else if (alarm.name === ALARM_SESSION_CAP) {
    enforceSessionCap().catch((err) => console.error('[bg] session cap error:', err));
  }
});

// ── Idle notification ─────────────────────────────────────────────────────
//
// Continue resumes after the usual privacy check of the current page. Keep
// paused turns it into a manual pause, which stays paused across navigation.

chrome.notifications?.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (handleStartPromptButton(notificationId, buttonIndex)) return;
  const sessionId = idleNoticeSession(notificationId);
  if (!sessionId) return;
  void chrome.notifications.clear(notificationId);
  const request = { session_id: sessionId, requested_at: Date.now() };
  const action = buttonIndex === 0 ? resumeCapture(request) : pauseCapture(request);
  action.catch(async (err) => {
    // Usually the page needs a privacy confirmation. Bring Chrome forward so
    // the student sees the prompt on the page or in the popup.
    console.warn('[bg] idle notice action failed:', err);
    const win = await chrome.windows.getLastFocused().catch(() => null);
    if (win?.id !== undefined) await chrome.windows.update(win.id, { focused: true });
  });
});

chrome.notifications?.onClicked.addListener((notificationId) => {
  if (!idleNoticeSession(notificationId)) return;
  void chrome.windows.getLastFocused().then((win) => {
    if (win.id !== undefined) return chrome.windows.update(win.id, { focused: true });
  });
});

// ── Idle handler ──────────────────────────────────────────────────────────
//
// Registered at the top level so the worker is woken by the event after an
// eviction. Pauses a capturing session when the student walks away.

chrome.idle.onStateChanged.addListener((state) => {
  pauseIfIdle(state).catch((err) => console.error('[bg] idle pause error:', err));
});

applyIdleDetection().catch((err) => console.error('[bg] idle setup error:', err));

// ── Command handler ───────────────────────────────────────────────────────

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-capture') {
    handleMessage({ type: 'TOGGLE_CAPTURE' }, {})
      .then(() => console.log('[bg] toggle-capture command executed'))
      .catch((err) => console.error('[bg] command error:', err));
  }
});

// ── Install handler ───────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  console.log('[bg] Sidekick installed');
  migrateLegacyLimits().catch((err) => console.error('[bg] settings migration error:', err));
});

// ── Service worker recovery ───────────────────────────────────────────────
//
// When the worker wakes from eviction, restore badge + alarm if capturing.

(async () => {
  const live = await getLiveSession();
  if (live) {
    console.log('[bg] recovered live capture session:', live.id);
    // Read the current state inside the same effects queue as Pause/Resume.
    await checkInputIdle();
    await scheduleIdleCheck();
    await rebroadcastCaptureState().catch(() => {});
  }
})().catch((err) => console.error('[bg] recovery error:', err));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEYS.SETTINGS]) wakeSync();
  if (area === 'local' && changes[PRIVACY_CONFIG.cacheKey]) {
    void invalidatePrivacyApproval()
      .then(() => checkCurrentScreen())
      .catch(() => {});
  }
});
chrome.windows.onFocusChanged.addListener(() => {
  void checkCurrentScreen().catch(() => {});
});
void chrome.alarms.create(PRIVACY_CONFIG.alarmName, {
  periodInMinutes: PRIVACY_CONFIG.refreshMinutes,
});
void refreshPrivacyPolicy();
chrome.runtime.onStartup.addListener(() => {
  void initializeSync().catch(() => {});
});
void initializeSync().catch((error) => console.warn('[sync] recovery setup failed', error));
