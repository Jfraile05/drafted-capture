// ════════════════════════════════════════════════════════════════════════
//  Live session + settings accessors.
//
//  The LiveSession is a small object (no full step array) kept in
//  chrome.storage.session so every UI context can subscribe to it cheaply
//  via chrome.storage.onChanged. Full steps live in IndexedDB (see db.ts).
// ════════════════════════════════════════════════════════════════════════

import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../constants';
import type { LiveSession, Settings } from '../types';

export async function getLiveSession(): Promise<LiveSession | null> {
  const r = await chrome.storage.session.get(STORAGE_KEYS.LIVE_SESSION);
  return r[STORAGE_KEYS.LIVE_SESSION] ?? null;
}

export async function setLiveSession(session: LiveSession | null): Promise<void> {
  if (session === null) {
    await chrome.storage.session.remove(STORAGE_KEYS.LIVE_SESSION);
  } else {
    await chrome.storage.session.set({ [STORAGE_KEYS.LIVE_SESSION]: session });
  }
}

export async function getSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(r[STORAGE_KEYS.SETTINGS] ?? {}) };
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: next });
  return next;
}
