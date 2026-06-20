// ════════════════════════════════════════════════════════════════════════
//  Reactive hooks shared by popup, panel, and options.
//
//  Read once, then subscribe to chrome.storage.onChanged. When the service
//  worker writes the live session or settings, React re-renders. No store,
//  no sync layer, no serialization bugs.
// ════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from './constants';
import type { LiveSession, Settings } from './types';

export function useLiveSession(): LiveSession | null {
  const [session, setSession] = useState<LiveSession | null>(null);

  useEffect(() => {
    chrome.storage.session.get(STORAGE_KEYS.LIVE_SESSION, (r) => {
      setSession(r[STORAGE_KEYS.LIVE_SESSION] ?? null);
    });
    const listener = (changes: { [k: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === 'session' && changes[STORAGE_KEYS.LIVE_SESSION]) {
        setSession(changes[STORAGE_KEYS.LIVE_SESSION].newValue ?? null);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  return session;
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEYS.SETTINGS, (r) => {
      setSettings({ ...DEFAULT_SETTINGS, ...(r[STORAGE_KEYS.SETTINGS] ?? {}) });
    });
    const listener = (changes: { [k: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === 'local' && changes[STORAGE_KEYS.SETTINGS]) {
        setSettings({ ...DEFAULT_SETTINGS, ...(changes[STORAGE_KEYS.SETTINGS].newValue ?? {}) });
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const update = (patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: next });
      return next;
    });
  };

  return [settings, update];
}

/** Tiny typed wrapper around chrome.runtime.sendMessage. */
export function sendMessage<R = unknown>(type: string, payload?: unknown): Promise<R> {
  return chrome.runtime.sendMessage({ type, payload });
}
