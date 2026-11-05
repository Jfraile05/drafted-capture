// ════════════════════════════════════════════════════════════════════════
//  Service Worker Entry — the brain.
//
//  Registers message handlers, tab/alarm/command listeners, and recovers
//  state when the worker wakes from eviction.
// ════════════════════════════════════════════════════════════════════════

import { ALARM_SCREENSHOT, ALARM_SESSION_CAP } from '../shared/constants';
import { deleteSession, getSession, listSessions, putSession } from '../shared/storage/db';
import { getLiveSession, getSettings, migrateLegacyLimits } from '../shared/storage/live';
import type {
  Annotation,
  CaptureEventPayload,
  ExportFormatFlags,
  ExtensionMessage,
  LiveSession,
  MessageType,
  Segment,
} from '../shared/types';
import {
  handleCaptureEvent,
  handleIntervalScreenshot,
  handleTabActivated,
  handleTabCreated,
  handleTabRemoved,
  handleTabUpdated,
} from './coordinator';
import { exportSession } from './exporter';
import { applyIdleDetection, pauseIfIdle } from './idle';
import { startRecording } from './recorder';
import {
  enforceSessionCap,
  getCaptureState,
  pauseCapture,
  rebroadcastCaptureState,
  resumeCapture,
  startCapture,
  stopCapture,
} from './session';

// ── Message router ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
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
    case 'TOGGLE_CAPTURE': {
      if (toggleInFlight) return getLiveSession();
      toggleInFlight = true;
      try {
        const intent = (msg.payload as { intent?: string } | undefined)?.intent;
        const live = await getLiveSession();
        if (!live || live.state === 'idle') {
          const started = await startCapture(intent);
          await maybeStartRecording(started.id);
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
      const started = await startCapture((msg.payload as { intent?: string } | undefined)?.intent);
      await maybeStartRecording(started.id);
      return started;
    }

    case 'PAUSE_CAPTURE':
      return pauseCapture();

    case 'RESUME_CAPTURE':
      return resumeCapture();

    case 'STOP_CAPTURE': {
      // Archive only. Submission to Drafted runs in a DOM context (popup/panel)
      // where Firebase auth is reliable; the worker stays Firebase-free so STOP
      // can never hang on auth/network. The popup auto-submits on the
      // capturing/paused -> idle transition.
      const sessionId = await stopCapture();
      return { sessionId };
    }

    case 'CAPTURE_EVENT':
      return handleCaptureEvent(msg.payload as CaptureEventPayload, sender);

    case 'GET_LIVE_SESSION':
      return getLiveSession();

    case 'GET_CAPTURE_STATE':
      return getCaptureState();

    case 'LIST_SESSIONS':
      return listSessions();

    case 'GET_SESSION':
      return getSession((msg.payload as { id: string }).id);

    case 'DELETE_SESSION':
      await deleteSession((msg.payload as { id: string }).id);
      return { ok: true };

    case 'EXPORT_SESSION':
      await exportSession(
        (msg.payload as { id: string; formats: ExportFormatFlags }).id,
        (msg.payload as { id: string; formats: ExportFormatFlags }).formats,
      );
      return { ok: true };

    case 'SAVE_SEGMENT': {
      const { sessionId, segment } = msg.payload as {
        sessionId: string;
        segment: Segment;
      };
      const session = await getSession(sessionId);
      if (!session) throw new Error('Session not found');
      const existing = session.segments.findIndex((s) => s.id === segment.id);
      if (existing >= 0) {
        session.segments[existing] = segment;
      } else {
        session.segments.push(segment);
      }
      await putSession(session);
      return session;
    }

    case 'DELETE_SEGMENT': {
      const { sessionId, segmentId } = msg.payload as {
        sessionId: string;
        segmentId: string;
      };
      const session = await getSession(sessionId);
      if (!session) throw new Error('Session not found');
      session.segments = session.segments.filter((s) => s.id !== segmentId);
      await putSession(session);
      return session;
    }

    case 'UPDATE_ANNOTATION': {
      const { sessionId, stepIndex, annotation } = msg.payload as {
        sessionId: string;
        stepIndex: number;
        annotation: Annotation | null;
      };
      const session = await getSession(sessionId);
      if (!session) throw new Error('Session not found');
      if (stepIndex < 0 || stepIndex >= session.steps.length) {
        throw new Error('Step index out of range');
      }
      session.steps[stepIndex].annotation = annotation;
      await putSession(session);
      return session;
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

// Start screen recording for a session if the setting is on. Best-effort:
// prompts for a screen once; if cancelled, capture proceeds screenshot-only.
async function maybeStartRecording(sessionId: string): Promise<void> {
  try {
    const settings = await getSettings();
    if (!settings.record_video) return;
    await startRecording(sessionId);
  } catch (err) {
    console.warn('[bg] recording start skipped:', err);
  }
}

// ── Tab listeners ─────────────────────────────────────────────────────────

chrome.tabs.onActivated.addListener((activeInfo) => {
  handleTabActivated(activeInfo).catch((err) => console.error('[bg] tab activated error:', err));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
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
  if (alarm.name === ALARM_SCREENSHOT) {
    handleIntervalScreenshot().catch((err) => console.error('[bg] alarm screenshot error:', err));
  } else if (alarm.name === ALARM_SESSION_CAP) {
    enforceSessionCap().catch((err) => console.error('[bg] session cap error:', err));
  }
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
  if (live && live.state === 'capturing') {
    console.log('[bg] recovered live capture session:', live.id);
    await chrome.action.setBadgeText({ text: String(live.step_count) });
    await chrome.action.setBadgeBackgroundColor({ color: '#4DFFA0' });
    const settings = await getSettings();
    await chrome.alarms.create(ALARM_SCREENSHOT, {
      periodInMinutes: settings.screenshot_interval_ms / 60000,
    });
    // Re-assert capture state to all tabs in case listeners were lost while
    // the worker was evicted.
    await rebroadcastCaptureState().catch(() => {});
  }
})().catch((err) => console.error('[bg] recovery error:', err));
