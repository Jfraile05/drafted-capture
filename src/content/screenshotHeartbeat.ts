import { SCREENSHOT_INTERVAL_MS } from '../shared/constants';

/** Page messages wake an evicted worker without relying on sub-minute alarms. */
export function startScreenshotHeartbeat(): () => void {
  if (window.top !== window) return () => {};

  let stopped = false;
  const interval = SCREENSHOT_INTERVAL_MS;
  let timer: ReturnType<typeof setTimeout>;

  const tick = async (): Promise<void> => {
    const startedAt = Date.now();
    let nextAt = startedAt + interval;
    if (document.visibilityState === 'visible') {
      try {
        const result = await chrome.runtime.sendMessage({ type: 'SCREENSHOT_TICK' });

        nextAt = Number.isFinite(result?.next_capture_at)
          ? result.next_capture_at
          : startedAt + interval;
      } catch {
        // Navigation or extension reload can invalidate the content context.
      }
    }
    // Pause may have arrived while the worker was capturing the screen.
    if (!stopped) timer = setTimeout(tick, Math.max(0, nextAt - Date.now()));
  };

  timer = setTimeout(tick, interval);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
