// ════════════════════════════════════════════════════════════════════════
//  IndexedDB layer — three independent stores.
//
//  IMPORTANT: idb-keyval's createStore() only creates its object store during
//  the version-1 onupgradeneeded of the named database. Calling createStore()
//  three times with the SAME db name creates ONLY the first store; the other
//  two object stores never exist, and any transaction on them throws
//  "One of the specified object stores was not found." So each logical store
//  gets its OWN database. Correct and simple.
// ════════════════════════════════════════════════════════════════════════

import {
  createStore,
  clear as idbClear,
  del as idbDel,
  get as idbGet,
  keys as idbKeys,
  set as idbSet,
  update as idbUpdate,
} from 'idb-keyval';
import { DB_RECORDINGS, DB_SCREENSHOTS, DB_SESSIONS, DB_STEPS } from '../constants';
import type { Session, Step } from '../types';
import { notifySessionUpdate } from './sessionUpdates';
import { createStepLog } from './stepChunks';

const screenshotStore = createStore(`drafted-capture-${DB_SCREENSHOTS}`, DB_SCREENSHOTS);
const stepsStore = createStore(`drafted-capture-${DB_STEPS}`, DB_STEPS);
const sessionsStore = createStore(`drafted-capture-${DB_SESSIONS}`, DB_SESSIONS);
const recordingStore = createStore(`drafted-capture-${DB_RECORDINGS}`, DB_RECORDINGS);

// ── Recordings (sessionId -> webm Blob) ─────────────────────────────────────

export function putRecording(sessionId: string, blob: Blob): Promise<void> {
  return idbSet(sessionId, blob, recordingStore);
}

export function getRecording(sessionId: string): Promise<Blob | undefined> {
  return idbGet<Blob>(sessionId, recordingStore);
}

export function deleteRecording(sessionId: string): Promise<void> {
  return idbDel(sessionId, recordingStore);
}

// ── Screenshots (hash -> Blob) ──────────────────────────────────────────────

export function putScreenshot(hash: string, blob: Blob): Promise<void> {
  return idbSet(hash, blob, screenshotStore);
}

export function getScreenshot(hash: string): Promise<Blob | undefined> {
  return idbGet<Blob>(hash, screenshotStore);
}

// ── Live steps (sessionId -> Step[]) ────────────────────────────────────────
//
//  The live session's steps are persisted here so they survive service-worker
//  restarts mid-capture. They are kept in chunks (see stepChunks.ts) so a
//  session of any length costs the same to add one step to.

const stepLog = createStepLog({
  get: (key) => idbGet(key, stepsStore),
  set: (key, value) => idbSet(key, value, stepsStore),
  del: (key) => idbDel(key, stepsStore),
});

export const getSteps = stepLog.get;
export const appendStep = stepLog.append;
export const setSteps = stepLog.set;
export const clearSteps = stepLog.clear;

// ── Archived sessions (sessionId -> Session) ────────────────────────────────

export async function putSession(session: Session): Promise<void> {
  await idbSet(session.id, session, sessionsStore);
  await notifySessionUpdate(session.id);
}

/** Keep edits and submission receipts in the same atomic archive update. */
export async function updateSession(
  sessionId: string,
  updater: (session: Session) => Session,
): Promise<Session> {
  let updated!: Session;
  await idbUpdate<Session>(
    sessionId,
    (current) => {
      if (!current) throw new Error('Session not found');
      updated = updater(current);
      return updated;
    },
    sessionsStore,
  );
  await notifySessionUpdate(sessionId);
  return updated;
}

export function getSession(sessionId: string): Promise<Session | undefined> {
  return idbGet<Session>(sessionId, sessionsStore);
}

export async function listSessions(): Promise<Session[]> {
  const ids = (await idbKeys(sessionsStore)) as string[];
  const sessions = await Promise.all(ids.map((id) => idbGet<Session>(id, sessionsStore)));
  return sessions
    .filter((s): s is Session => Boolean(s))
    .sort((a, b) => b.started_at - a.started_at);
}

export async function deleteSession(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  await idbDel(sessionId, sessionsStore);
  await notifySessionUpdate(sessionId);
  // Best-effort: drop screenshots referenced only by this session.
  if (session) {
    const used = new Set(session.steps.map((s) => s.screenshot?.hash).filter(Boolean));
    const remaining = await listSessions();
    const stillUsed = new Set(
      remaining.flatMap((s) => s.steps.map((st) => st.screenshot?.hash).filter(Boolean)),
    );
    for (const hash of used) {
      if (hash && !stillUsed.has(hash)) await idbDel(hash, screenshotStore);
    }
  }
}

export function clearAllScreenshots(): Promise<void> {
  return idbClear(screenshotStore);
}
