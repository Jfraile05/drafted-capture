import { IDLE_CONFIG } from '../config/idle';

export function watchActivity(sessionId: string): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let latest = 0;
  let lastSent = 0;
  const send = () => {
    timer = undefined;
    lastSent = Date.now();
    void chrome.runtime
      .sendMessage({ type: 'USER_ACTIVITY', payload: { sessionId, timestamp: latest } })
      .catch(() => {});
  };
  const input = (event: Event) => {
    if (!event.isTrusted) return;
    latest = Date.now();
    if (latest - lastSent >= IDLE_CONFIG.activityReportMs) {
      clearTimeout(timer);
      send();
    } else if (!timer) timer = setTimeout(send, IDLE_CONFIG.activityReportMs - (latest - lastSent));
  };
  const events = ['pointermove', 'pointerdown', 'click', 'keydown', 'scroll'];
  for (const type of events)
    document.addEventListener(type, input, { capture: true, passive: true });
  return () => {
    clearTimeout(timer);
    for (const type of events) document.removeEventListener(type, input, true);
  };
}
