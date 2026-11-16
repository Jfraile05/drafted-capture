export const ARCHIVED_SESSION_CHANGE = 'archivedSessionChange';

/** Refresh other extension views only after the archive write succeeds. */
export async function notifySessionUpdate(id: string): Promise<void> {
  try {
    if (!chrome.storage?.session) {
      await chrome.runtime.sendMessage({ type: 'SESSION_SYNC_CHANGED', payload: { id } });
      return;
    }
    await chrome.storage.session.set({
      [ARCHIVED_SESSION_CHANGE]: { id, nonce: crypto.randomUUID() },
    });
  } catch {
    // A missed refresh signal must not turn a successful save into a failure.
  }
}
