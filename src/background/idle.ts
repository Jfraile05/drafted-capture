import { IDLE_CONFIG, idleThreshold } from '../config/idle';
import { getLiveSession, getSettings, setLiveSession, withLiveLock } from '../shared/storage/live';
import { pauseCapture } from './session';

export async function initializeIdleClock(): Promise<void> {
  await withLiveLock(async () => {
    const live = await getLiveSession();
    if (!live || live.last_activity_at !== undefined) return;
    // An older extension did not track input time. Preserve its accrued time.
    live.last_activity_at = Date.now();
    await setLiveSession(live);
  });
}

export async function applyIdleDetection(): Promise<void> {
  chrome.idle.setDetectionInterval(
    Math.round(idleThreshold((await getSettings()).idle_timeout_ms) / 1000),
  );
}

export async function scheduleIdleCheck(): Promise<void> {
  const live = await getLiveSession();
  if (!live || live.state !== 'capturing') {
    await chrome.alarms.clear(IDLE_CONFIG.alarmName);
    return;
  }
  const threshold = idleThreshold((await getSettings()).idle_timeout_ms);
  await chrome.alarms.create(IDLE_CONFIG.alarmName, {
    when: (live.last_activity_at ?? live.started_at) + threshold,
  });
}

export async function checkInputIdle(): Promise<void> {
  await initializeIdleClock();
  const live = await getLiveSession();
  if (!live || live.state !== 'capturing') return;
  const last = live.last_activity_at ?? live.started_at;
  if (Date.now() - last >= idleThreshold((await getSettings()).idle_timeout_ms)) {
    await pauseCapture({ session_id: live.id, requested_at: last }, { lastActivity: last });
  } else await scheduleIdleCheck();
}

export async function recordActivity(
  sessionId: string,
  timestamp: number,
  sender: chrome.runtime.MessageSender,
): Promise<void> {
  if (sender.tab?.id === undefined || sender.tab.incognito || !Number.isFinite(timestamp)) return;
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (active?.id !== sender.tab.id) return;
  await checkInputIdle();
  await withLiveLock(async () => {
    const live = await getLiveSession();
    if (!live || live.id !== sessionId || live.privacy_gate) return false;
    if (live.state !== 'capturing') return false;
    const at = Math.min(Date.now(), timestamp);
    if (at < (live.last_activity_at ?? live.started_at) || at < (live.pauses?.at(-1)?.[1] ?? 0))
      return false;
    live.last_activity_at = at;
    await setLiveSession(live);
  });
  await scheduleIdleCheck();
}

/** System activity never grants consent to resume a paused page. */
export async function pauseIfIdle(state: string): Promise<void> {
  if (state === 'locked') {
    const live = await getLiveSession();
    if (live?.state === 'capturing')
      await pauseCapture(
        { session_id: live.id, requested_at: live.last_activity_at ?? live.started_at },
        { lastActivity: live.last_activity_at ?? live.started_at },
      );
  } else if (state === 'idle') await checkInputIdle();
}
