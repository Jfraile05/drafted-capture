import { STORAGE_KEYS } from './constants';
import type { LiveSession } from './types';

/** Reads the live session and follows its storage updates until unsubscribed. */
export function observeLiveSession(onChange: (session: LiveSession | null) => void): () => void {
  let active = true;
  let changed = false;
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
    if (active && area === 'session' && changes[STORAGE_KEYS.LIVE_SESSION]) {
      changed = true;
      onChange(changes[STORAGE_KEYS.LIVE_SESSION].newValue ?? null);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  chrome.storage.session.get(STORAGE_KEYS.LIVE_SESSION, (values) => {
    if (active && !changed) onChange(values[STORAGE_KEYS.LIVE_SESSION] ?? null);
  });
  return () => {
    active = false;
    chrome.storage.onChanged.removeListener(listener);
  };
}
