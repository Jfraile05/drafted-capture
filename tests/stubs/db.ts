import { notifySessionUpdate } from '../../src/shared/storage/sessionUpdates';
// In-memory stand-in for shared/storage/db. appendStep deliberately mimics the
// real read, await, write shape (idb-keyval get then set) so concurrent calls
// can lose updates the same way they can in the extension.
import type { Session, Step } from '../../src/shared/types';

const steps = new Map<string, Step[]>();
const sessions = new Map<string, Session>();
export const __screenshots = new Map<string, Blob>();
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export const __steps = steps;
export const __sessions = sessions;
export const __reset = () => {
  steps.clear();
  sessions.clear();
  __screenshots.clear();
};

export async function getSteps(id: string): Promise<Step[]> {
  await tick();
  return [...(steps.get(id) ?? [])];
}
export async function appendStep(id: string, step: Step): Promise<number> {
  const cur = await getSteps(id);
  cur.push(step);
  await tick();
  steps.set(id, cur);
  return cur.length;
}
export async function clearSteps(id: string): Promise<void> {
  await tick();
  steps.delete(id);
}
export async function putSession(s: Session): Promise<void> {
  await tick();
  sessions.set(s.id, structuredClone(s));
  await notifySessionUpdate(s.id);
}
export async function getSession(id: string) {
  return structuredClone(sessions.get(id));
}
export async function updateSession(id: string, updater: (session: Session) => Session) {
  const current = sessions.get(id);
  if (!current) throw new Error('Session not found');
  const updated = updater(structuredClone(current));
  sessions.set(id, structuredClone(updated));
  await notifySessionUpdate(id);
  return updated;
}
export async function listSessions() {
  return structuredClone([...sessions.values()]);
}
export async function deleteSession(id: string) {
  sessions.delete(id);
}
export async function getScreenshot(hash: string) {
  return __screenshots.get(hash);
}
export async function putScreenshot(hash: string, blob: Blob) {
  __screenshots.set(hash, blob);
}
export async function putRecording() {}

export async function getRecording() { return undefined; }
