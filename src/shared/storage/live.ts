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

// ── Serialized access ────────────────────────────────────────────────────
//
// The live session is read, changed, and written back by many handlers (events,
// tab listeners, alarms, and the popup's Pause/Stop). Each one used to write
// back the whole object after awaiting a slow screenshot, so a Pause or Stop
// that landed in between was silently overwritten and capture kept running.
// Every read-modify-write of the live session (and the step append that goes
// with it) now runs through this one queue. Not reentrant: never call a function
// that takes the lock from inside `fn`.
let liveTail: Promise<unknown> = Promise.resolve();

export function withLiveLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = liveTail.then(fn, fn);
  liveTail = run.catch(() => undefined);
  return run;
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
