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
} from 'idb-keyval';
import { DB_SCREENSHOTS, DB_SESSIONS, DB_STEPS } from '../constants';
import type { Session, Step } from '../types';

const screenshotStore = createStore(`drafted-capture-${DB_SCREENSHOTS}`, DB_SCREENSHOTS);
const stepsStore = createStore(`drafted-capture-${DB_STEPS}`, DB_STEPS);
const sessionsStore = createStore(`drafted-capture-${DB_SESSIONS}`, DB_SESSIONS);

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
//  restarts mid-capture. We read-modify-write the array; appends are cheap
//  relative to capture cadence (≤ a couple writes/sec) and survive eviction.

export async function getSteps(sessionId: string): Promise<Step[]> {
  return (await idbGet<Step[]>(sessionId, stepsStore)) ?? [];
}

export async function appendStep(sessionId: string, step: Step): Promise<number> {
  const steps = await getSteps(sessionId);
  // Stamp the previous step's duration now that we know when the next arrived.
  if (steps.length > 0) {
    const prev = steps[steps.length - 1];
    prev.duration_to_next = step.timestamp - prev.timestamp;
  }
  steps.push(step);
  await idbSet(sessionId, steps, stepsStore);
  return steps.length;
}

export function setSteps(sessionId: string, steps: Step[]): Promise<void> {
  return idbSet(sessionId, steps, stepsStore);
}

export function clearSteps(sessionId: string): Promise<void> {
  return idbDel(sessionId, stepsStore);
}

// ── Archived sessions (sessionId -> Session) ────────────────────────────────

export function putSession(session: Session): Promise<void> {
  return idbSet(session.id, session, sessionsStore);
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
