// System notification for idle pauses. The on-page prompt is invisible while
// the student is in another window or app, so this asks in the OS instead.

const PREFIX = 'sidekick-idle:';

export function idleNoticeSession(notificationId: string): string | null {
  return notificationId.startsWith(PREFIX) ? notificationId.slice(PREFIX.length) : null;
}

export async function showIdleNotice(sessionId: string): Promise<void> {
  if (!chrome.notifications) return;
  await chrome.notifications.create(`${PREFIX}${sessionId}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title: 'Sidekick paused',
    message:
      "You were inactive, so recording paused. Paused time isn't counted. Continue recording? Opening a new page also resumes it.",
    buttons: [{ title: 'Continue recording' }, { title: 'Keep paused' }],
    requireInteraction: true,
    priority: 2,
  });
}

export async function clearIdleNotices(): Promise<void> {
  if (!chrome.notifications) return;
  const open = await new Promise<object>((resolve) => chrome.notifications.getAll(resolve));
  await Promise.all(
    Object.keys(open)
      .filter((id) => id.startsWith(PREFIX))
      .map((id) => chrome.notifications.clear(id)),
  );
}
