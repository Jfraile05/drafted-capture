// ════════════════════════════════════════════════════════════════════════
//  Session lifecycle — start, pause, resume, stop.
//
//  Creates/updates the LiveSession in chrome.storage.session, sets badge,
//  manages alarms. On stop, assembles the full archived Session and writes
//  it to IndexedDB.
// ════════════════════════════════════════════════════════════════════════

import {
  ALARM_SCREENSHOT,
  BADGE_ON_COLOR,
  BADGE_PAUSED_COLOR,
  EXTENSION_VERSION,
} from '../shared/constants';
import { clearSteps, getSteps, putSession } from '../shared/storage/db';
import { getLiveSession, getSettings, setLiveSession } from '../shared/storage/live';
import type {
  CaptureState,
  CaptureStats,
  Environment,
  LiveSession,
  Session,
  SessionMetadata,
} from '../shared/types';
import { resetCaptureQueue } from '../shared/utils/captureQueue';

// ── Start ─────────────────────────────────────────────────────────────────

export async function startCapture(intent?: string): Promise<LiveSession> {
  const settings = await getSettings();

  const environment = await snapshotEnvironment();
  const metadata: SessionMetadata = {
    extension_version: EXTENSION_VERSION,
    drafted_org_id: settings.drafted_org_id || null,
    drafted_project_id: settings.drafted_project_id || null,
    created_at: new Date().toISOString(),
    exported_at: null,
  };

  const live: LiveSession = {
    id: crypto.randomUUID(),
    state: 'capturing',
    started_at: Date.now(),
    intent: intent?.trim() || undefined,
    step_count: 0,
    recent: [],
    environment,
    metadata,
    stats: { clicks: 0, keystrokes: 0, scrolls: 0, navigations: 0, screenshots: 0 },
  };

  await setLiveSession(live);
  resetCaptureQueue();

  await chrome.action.setBadgeText({ text: '0' });
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_ON_COLOR });

  await chrome.alarms.create(ALARM_SCREENSHOT, {
    periodInMinutes: settings.screenshot_interval_ms / 60000,
  });

  await broadcastCaptureState(true);

  console.log('[session] started:', live.id);
  return live;
}

// ── Pause ─────────────────────────────────────────────────────────────────

export async function pauseCapture(): Promise<LiveSession | null> {
  const live = await getLiveSession();
  if (!live || live.state !== 'capturing') return live;

  live.state = 'paused';
  await setLiveSession(live);

  await chrome.action.setBadgeBackgroundColor({ color: BADGE_PAUSED_COLOR });
  await chrome.alarms.clear(ALARM_SCREENSHOT);
  await broadcastCaptureState(false);

  console.log('[session] paused:', live.id);
  return live;
}

// ── Resume ────────────────────────────────────────────────────────────────

export async function resumeCapture(): Promise<LiveSession | null> {
  const live = await getLiveSession();
  if (!live || live.state !== 'paused') return live;

  live.state = 'capturing';
  await setLiveSession(live);

  await chrome.action.setBadgeBackgroundColor({ color: BADGE_ON_COLOR });

  const settings = await getSettings();
  await chrome.alarms.create(ALARM_SCREENSHOT, {
    periodInMinutes: settings.screenshot_interval_ms / 60000,
  });

  await broadcastCaptureState(true);

  console.log('[session] resumed:', live.id);
  return live;
}

// ── Stop ──────────────────────────────────────────────────────────────────

// Returns the archived session id (so the caller can auto-submit), or null
// if there was nothing to stop.
export async function stopCapture(): Promise<string | null> {
  const live = await getLiveSession();
  if (!live) return null;

  const steps = await getSteps(live.id);

  const uniqueTabs = new Set(steps.map((s) => s.origin.tab_id));
  const uniqueDomains = Array.from(
    new Set(
      steps
        .map((s) => {
          try {
            return new URL(s.origin.url).hostname;
          } catch {
            return '';
          }
        })
        .filter(Boolean),
    ),
  );

  const totalDuration = steps.length > 0 ? Date.now() - live.started_at : 0;

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
    ended_at: Date.now(),
    intent: live.intent,
    environment: live.environment,
    steps,
    segments: seededSegments,
    outcome: {
      total_steps: steps.length,
      total_duration_ms: totalDuration,
      tabs_touched: uniqueTabs.size,
      domains_touched: uniqueDomains,
    },
    metadata: live.metadata,
  };

  await putSession(session);
  await clearSteps(live.id);
  await setLiveSession(null);

  await chrome.action.setBadgeText({ text: '' });
  await chrome.alarms.clear(ALARM_SCREENSHOT);
  await broadcastCaptureState(false);

  console.log('[session] stopped + archived:', session.id, session.outcome.total_steps, 'steps');
  return session.id;
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
  const live = await getLiveSession();
  await broadcastCaptureState(live?.state === 'capturing');
}

// Tell one tab to start/stop. If the tab has no content script yet (it was
// already open before the extension loaded, so the declared script never
// injected), inject it on the fly, then deliver the message. This is what
// makes capture work the instant you turn it on, with no "reload your tabs".
async function setTabCapture(tab: chrome.tabs.Tab, capturing: boolean): Promise<void> {
  if (tab.id === undefined) return;
  const tabId = tab.id;
  const msg = { type: 'SET_CAPTURE', payload: { capturing } };

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
