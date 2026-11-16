// ════════════════════════════════════════════════════════════════════════
//  Reactive hooks shared by popup, panel, and options.
//
//  Read once, then subscribe to chrome.storage.onChanged. When the service
//  worker writes the live session or settings, React re-renders. No store,
//  no sync layer, no serialization bugs.
// ════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from './constants';
import { observeLiveSession } from './observeLiveSession';
import { currentSettings } from './storage/live';
import type { LiveSession, Settings } from './types';

export function useLiveSession(): LiveSession | null {
  return useLiveSessionState().session;
}

export function useLiveSessionState(): { session: LiveSession | null; loaded: boolean } {
  const [session, setSession] = useState<LiveSession | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(
    () =>
      observeLiveSession((value) => {
        setSession(value);
        setLoaded(true);
      }),
    [],
  );

  return { session, loaded };
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEYS.SETTINGS, (r) => {
      setSettings(currentSettings(r[STORAGE_KEYS.SETTINGS]));
    });
    const listener = (changes: { [k: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === 'local' && changes[STORAGE_KEYS.SETTINGS]) {
        setSettings(currentSettings(changes[STORAGE_KEYS.SETTINGS].newValue));
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const update = (patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = currentSettings({ ...prev, ...patch });
      chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: next });
      return next;
    });
  };

  return [settings, update];
}

/** Tiny typed wrapper around chrome.runtime.sendMessage. The worker answers a
 *  failure with `{ error }` instead of rejecting; that is turned into a thrown
 *  error so callers never treat it as a real result. */
export async function sendMessage<R = unknown>(type: string, payload?: unknown): Promise<R> {
  const res = await chrome.runtime.sendMessage({ type, payload });
  if (
    res &&
    typeof res === 'object' &&
    !Array.isArray(res) &&
    Object.keys(res).length === 1 &&
    'error' in res
  ) {
    throw new Error(String((res as { error: unknown }).error));
  }
  return res as R;
}
