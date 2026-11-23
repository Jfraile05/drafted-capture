import { SCREENSHOT_INTERVAL_MS } from '../shared/constants';
import { earningsClock } from '../shared/liveEarnings';
import { checkInputIdle } from './idle';
// ════════════════════════════════════════════════════════════════════════
//  Coordinator — capture event handling, screenshots, tab events.
//
//  Enforces blocklists, guards (max_steps, max_duration), screenshots on
//  action + interval, maps RawEvent -> Action, assembles Step, updates
//  LiveSession stats/recent, updates badge.
// ════════════════════════════════════════════════════════════════════════

import { LIVE_RECENT_LIMIT } from '../shared/constants';
import type { PrivacyPermit } from '../shared/privacy';
import { appendStep } from '../shared/storage/db';
import { getLiveSession, getSettings, setLiveSession, withLiveLock } from '../shared/storage/live';
import { getOwnTerms } from '../shared/storage/ownTerms';
import type {
  Action,
  CaptureEventPayload,
  LiveSession,
  ModifierKey,
  RawEvent,
  Step,
  StepOrigin,
} from '../shared/types';
import { classifyUrl } from '../shared/urlCategories';
import { captureVisible } from '../shared/utils/captureQueue';
import { actionLabel } from '../shared/utils/format';
import { ownPattern, redactStep } from '../shared/utils/redact';
import { siteAllowed } from '../shared/utils/siteAccess';
import { capturePermit, checkCurrentScreen, validatePermit } from './privacy';
import { sessionCapMs, stopCapture } from './session';

// ── Commit a step ─────────────────────────────────────────────────────────

// Every handler builds its step (including the slow screenshot) with no lock
// held, then commits it here. The commit re-reads the live session under the
// lock and drops the step if the session was paused, stopped, or replaced while
// the screenshot was in flight. It also assigns the index and writes only the
// fields it owns, so it can never overwrite a Pause or Stop with a stale copy.
async function commitStep(
  liveId: string,
  step: Step,
  opts: { label?: string; bump?: (live: LiveSession) => void; permit?: PrivacyPermit },
): Promise<boolean> {
  if (opts.permit && !(await validatePermit(opts.permit))) return false;
  // Redact before anything is stored or shown. The label is derived from the
  // redacted action so typed text never reaches the live feed either.
  const settings = await getSettings();
  redactStep(step, {
    maskAllInputs: settings.mask_all_inputs,
    own: ownPattern(await getOwnTerms()),
  });
  step.origin.site = classifyUrl(step.origin.url);
  const label = opts.label ?? actionLabel(step.action, step.dom);

  return withLiveLock(async () => {
    const cur = await getLiveSession();
    if (!cur || cur.id !== liveId || cur.state !== 'capturing') return false;
    if (cur.privacy_gate || (opts.permit && (cur.privacy_epoch ?? 0) !== opts.permit.epoch))
      return false;

    step.index = cur.step_count;
    const newCount = await appendStep(cur.id, step);

    opts.bump?.(cur);
    cur.recent.push({
      index: step.index,
      type: step.action.type,
      label,
      url: step.origin.url,
      timestamp: step.timestamp,
    });
    if (cur.recent.length > LIVE_RECENT_LIMIT) cur.recent.shift();

    cur.step_count = newCount;
    await setLiveSession(cur);
    // Inside the lock so a Stop that follows cannot be undone by a late badge write.
    await chrome.action.setBadgeText({ text: String(newCount) });
    return true;
  });
}

// ── Capture event (from content) ──────────────────────────────────────────

export async function handleCaptureEvent(
  payload: CaptureEventPayload,
  sender: chrome.runtime.MessageSender,
): Promise<{ ok: boolean }> {
  const live = await getLiveSession();
  if (!live || live.state !== 'capturing') return { ok: false };

  const settings = await getSettings();

  // Enforce allowlist, blocklist, and incognito.
  const url = sender.tab?.url ?? sender.url ?? '';
  if (!siteAllowed(url, settings, { incognito: sender.tab?.incognito })) {
    return { ok: false };
  }

  // Guard: max steps.
  if (live.step_count >= settings.max_steps) {
    console.log('[coordinator] max_steps reached, stopping');
    await stopCapture();
    return { ok: false };
  }

  // Guard: max duration.
  const elapsed = Date.now() - live.started_at;
  if (elapsed >= sessionCapMs(settings)) {
    console.log('[coordinator] max_duration reached, stopping');
    await stopCapture();
    return { ok: false };
  }

  await checkInputIdle();
  if (payload.event.timestamp < (live.pauses?.at(-1)?.[1] ?? 0)) return { ok: false };
  const permit = await capturePermit(sender.tab?.id, url);
  if (!permit) return { ok: false };
  // Capture screenshot if settings demand it.
  const screenshot =
    settings.screenshot_on_action && sender.tab?.windowId !== undefined
      ? await captureVisible({
          windowId: sender.tab.windowId,
          dpr: payload.dpr,
          tabId: sender.tab.id,
          url,
          privacyPermit: permit,
          validate: () => validatePermit(permit),
        })
      : null;

  // Build the action from the raw event.
  const action = mapRawEventToAction(payload.event);

  // Build origin from sender context.
  const origin: StepOrigin = {
    tab_id: sender.tab?.id ?? -1,
    frame_id: sender.frameId ?? 0,
    url: sender.tab?.url ?? sender.url ?? '',
    title: sender.tab?.title ?? '',
  };

  const step: Step = {
    index: live.step_count,
    timestamp: payload.event.timestamp,
    duration_to_next: null,
    action,
    screenshot,
    dom: payload.dom,
    origin,
    annotation: null,
  };

  const ok = await commitStep(live.id, step, {
    permit,
    bump: (cur) => incrementStats(cur, action.type),
  });
  return { ok };
}

// ── Interval screenshot ───────────────────────────────────────────────────

let intervalInFlight = false;
let lastInterval: { sessionId: string; timestamp: number } | null = null;

export async function handleIntervalScreenshot(
  sender?: chrome.runtime.MessageSender,
): Promise<{ interval_ms: number; next_capture_at?: number }> {
  const settings = await getSettings();
  const response: { interval_ms: number; next_capture_at?: number } = {
    interval_ms: SCREENSHOT_INTERVAL_MS,
  };
  if (sender && (sender.frameId !== 0 || sender.tab?.id === undefined)) return response;
  if (intervalInFlight) return response;
  intervalInFlight = true;
  try {
    const live = await getLiveSession();
    if (!live || live.state !== 'capturing') return response;

    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const activeTab = tabs[0];
    if (activeTab?.id === undefined || activeTab.windowId === undefined) return response;
    if (sender && sender.tab?.id !== activeTab.id) return response;

    const url = activeTab.url ?? '';
    if (!siteAllowed(url, settings, { incognito: activeTab.incognito })) return response;
    if (
      live.step_count >= settings.max_steps ||
      Date.now() - live.started_at >= sessionCapMs(settings)
    ) {
      await stopCapture();
      return response;
    }

    // Heartbeats from different tabs and the recovery alarm can land together.
    // Only one periodic screenshot may start per configured interval.
    await checkInputIdle();
    const now = Date.now();
    if (lastInterval?.sessionId === live.id) {
      response.next_capture_at = lastInterval.timestamp + SCREENSHOT_INTERVAL_MS;
      if (now < response.next_capture_at) return response;
    }
    lastInterval = { sessionId: live.id, timestamp: now };
    response.next_capture_at = now + SCREENSHOT_INTERVAL_MS;

    const permit = await capturePermit(activeTab.id, url);
    if (!permit) return response;
    const screenshot = await captureVisible({
      windowId: activeTab.windowId,
      dpr: 1,
      tabId: activeTab.id,
      url,
      privacyPermit: permit,
      validate: () => validatePermit(permit),
    });
    if (!screenshot) return response;

    const action: Action = { type: 'screenshot' };
    const origin: StepOrigin = {
      tab_id: activeTab.id,
      frame_id: 0,
      url: activeTab.url ?? '',
      title: activeTab.title ?? '',
    };

    const step: Step = {
      index: live.step_count,
      timestamp: Date.now(),
      duration_to_next: null,
      action,
      screenshot,
      dom: null,
      origin,
      annotation: null,
    };

    await commitStep(live.id, step, {
      permit,
      label: 'Screen state',
      bump: (cur) => {
        cur.stats.screenshots++;
      },
    });
    return response;
  } finally {
    intervalInFlight = false;
  }
}

// ── Tab events ────────────────────────────────────────────────────────────

export async function handleTabActivated(activeInfo: chrome.tabs.TabActiveInfo): Promise<void> {
  await checkCurrentScreen(activeInfo.tabId);
  const live = await getLiveSession();
  if (!live || live.state !== 'capturing') return;

  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (!tab.url) return;

  const settings = await getSettings();
  if (!siteAllowed(tab.url, settings, { incognito: tab.incognito })) return;
  const permit = await capturePermit(activeInfo.tabId, tab.url);
  if (!permit) return;

  const screenshot =
    activeInfo.windowId !== undefined
      ? await captureVisible({
          windowId: activeInfo.windowId,
          dpr: 1,
          tabId: activeInfo.tabId,
          url: tab.url,
          privacyPermit: permit,
          validate: () => validatePermit(permit),
        })
      : null;

  const action: Action = { type: 'tab_switch', url: tab.url };
  const origin: StepOrigin = {
    tab_id: tab.id ?? -1,
    frame_id: 0,
    url: tab.url,
    title: tab.title ?? '',
  };

  const step: Step = {
    index: live.step_count,
    timestamp: Date.now(),
    duration_to_next: null,
    action,
    screenshot,
    dom: null,
    origin,
    annotation: null,
  };

  await commitStep(live.id, step, { permit });
}

export async function handleTabUpdated(
  tabId: number,
  changeInfo: chrome.tabs.TabChangeInfo,
  tab: chrome.tabs.Tab,
): Promise<void> {
  await checkCurrentScreen(changeInfo.url || changeInfo.status === 'complete' ? tabId : undefined);
  const live = await getLiveSession();
  if (!live || live.state !== 'capturing') return;

  const url = changeInfo.url ?? tab.url ?? '';
  const settings = await getSettings();
  if (!siteAllowed(url, settings, { incognito: tab.incognito })) return;

  // Completion often arrives separately from the URL change.
  if (changeInfo.status === 'complete') {
    await withLiveLock(async () => {
      const current = await getLiveSession();
      if (current?.id !== live.id || current.state !== 'capturing') return;
      // Dispatch in state order without waiting on a page while holding the lock.
      void chrome.tabs
        .sendMessage(tabId, {
          type: 'SET_CAPTURE',
          payload: { capturing: true, clock: earningsClock(current) },
        })
        .catch(() => {});
    });
  }
  if (!changeInfo.url) return;
  const permit = await capturePermit(tabId, url);
  if (!permit) return;

  const screenshot =
    tab.windowId !== undefined && (changeInfo.status ?? tab.status) === 'complete'
      ? await captureVisible({
          windowId: tab.windowId,
          dpr: 1,
          tabId,
          url,
          privacyPermit: permit,
          validate: () => validatePermit(permit),
        })
      : null;

  const action: Action = { type: 'navigate', url: changeInfo.url };
  const origin: StepOrigin = {
    tab_id: tabId,
    frame_id: 0,
    url,
    title: tab.title ?? '',
  };

  const step: Step = {
    index: live.step_count,
    timestamp: Date.now(),
    duration_to_next: null,
    action,
    screenshot,
    dom: null,
    origin,
    annotation: null,
  };

  await commitStep(live.id, step, {
    permit,
    bump: (cur) => incrementStats(cur, 'navigate'),
  });
}

export async function handleTabCreated(tab: chrome.tabs.Tab): Promise<void> {
  await checkCurrentScreen(tab.active ? tab.id : undefined);
  const live = await getLiveSession();
  if (!live || live.state !== 'capturing') return;

  const url = tab.url ?? tab.pendingUrl ?? '';
  const settings = await getSettings();
  if (!siteAllowed(url, settings, { incognito: tab.incognito })) return;
  const permit = await capturePermit(tab.id, url);
  if (!permit) return;

  const action: Action = { type: 'tab_open', url };
  const origin: StepOrigin = {
    tab_id: tab.id ?? -1,
    frame_id: 0,
    url,
    title: tab.title ?? '',
  };

  const step: Step = {
    index: live.step_count,
    timestamp: Date.now(),
    duration_to_next: null,
    action,
    screenshot: null,
    dom: null,
    origin,
    annotation: null,
  };

  await commitStep(live.id, step, { permit });
}

export async function handleTabRemoved(
  tabId: number,
  removeInfo: chrome.tabs.TabRemoveInfo,
): Promise<void> {
  const live = await getLiveSession();
  if (!live || live.state !== 'capturing') return;

  const action: Action = { type: 'tab_close' };
  const origin: StepOrigin = {
    tab_id: tabId,
    frame_id: 0,
    url: '',
    title: '',
  };

  const step: Step = {
    index: live.step_count,
    timestamp: Date.now(),
    duration_to_next: null,
    action,
    screenshot: null,
    dom: null,
    origin,
    annotation: null,
  };

  await commitStep(live.id, step, { label: 'Close tab' });
}

// ── Helpers ───────────────────────────────────────────────────────────────

function mapRawEventToAction(raw: RawEvent): Action {
  const coord: [number, number] = [raw.client_x, raw.client_y];
  const mods = raw.modifiers;

  switch (raw.type) {
    case 'click':
      return {
        type: 'click',
        coordinate: coord,
        button: mapButton(raw.button),
        modifier_keys: mods.length > 0 ? mods : undefined,
      };

    case 'double_click':
      return {
        type: 'double_click',
        coordinate: coord,
        button: mapButton(raw.button),
        modifier_keys: mods.length > 0 ? mods : undefined,
      };

    case 'right_click':
      return {
        type: 'right_click',
        coordinate: coord,
        modifier_keys: mods.length > 0 ? mods : undefined,
      };

    case 'type':
      return {
        type: 'type',
        coordinate: coord,
        text: raw.text ?? '',
      };

    case 'key':
      return {
        type: 'key',
        key: raw.key ?? raw.code ?? 'unknown',
        modifier_keys: mods.length > 0 ? mods : undefined,
      };

    case 'scroll': {
      const dx = raw.scroll_delta_x ?? 0;
      const dy = raw.scroll_delta_y ?? 0;
      const direction =
        Math.abs(dy) > Math.abs(dx) ? (dy > 0 ? 'down' : 'up') : dx > 0 ? 'right' : 'left';
      const amount = Math.abs(dy) > Math.abs(dx) ? Math.abs(dy) : Math.abs(dx);
      return {
        type: 'scroll',
        scroll_direction: direction,
        scroll_amount: amount,
      };
    }

    case 'drag':
      return {
        type: 'drag',
        coordinate: coord,
        modifier_keys: mods.length > 0 ? mods : undefined,
      };

    case 'navigate':
      return { type: 'navigate', url: raw.url };

    case 'tab_open':
      return { type: 'tab_open', url: raw.url };

    case 'tab_close':
      return { type: 'tab_close' };

    case 'tab_switch':
      return { type: 'tab_switch', url: raw.url };

    case 'wait':
      return { type: 'wait' };

    case 'screenshot':
      return { type: 'screenshot' };

    default: {
      const exhaustive: never = raw.type;
      console.warn('[coordinator] unhandled raw event type:', exhaustive);
      return { type: 'wait' };
    }
  }
}

function mapButton(code?: number): 'left' | 'right' | 'middle' {
  if (code === 2) return 'right';
  if (code === 1) return 'middle';
  return 'left';
}

function incrementStats(
  live: {
    stats: {
      clicks: number;
      keystrokes: number;
      scrolls: number;
      navigations: number;
      screenshots: number;
    };
  },
  type: string,
): void {
  if (type === 'click' || type === 'double_click' || type === 'right_click') {
    live.stats.clicks++;
  } else if (type === 'type' || type === 'key') {
    live.stats.keystrokes++;
  } else if (type === 'scroll') {
    live.stats.scrolls++;
  } else if (type === 'navigate') {
    live.stats.navigations++;
  } else if (type === 'screenshot') {
    live.stats.screenshots++;
  }
}
