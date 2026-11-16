import { earningsForSession } from '../shared/earnings';
import type { EnrichmentMap, SubmitResult } from '../shared/submitToDrafted';
import type { Session } from '../shared/types';
import { DEMO, DEMO_WORKFLOWS } from './config';
export type { EnrichmentMap } from '../shared/submitToDrafted';

export interface SyntheticReceipt {
  id: string;
  sessionId: string;
  projectId: string;
  revision: number;
  steps: number;
  labels: string[];
  thoughts: EnrichmentMap;
  earnings: ReturnType<typeof earningsForSession>;
  receivedAt: string;
}

export function makeReceipt(session: Session, thoughts: EnrichmentMap = {}): SyntheticReceipt {
  const projectId = session.metadata.drafted_project_id;
  if (
    !projectId ||
    session.metadata.owner_uid !== DEMO.uid ||
    !DEMO_WORKFLOWS.some(
      (w) =>
        w.project_id === session.metadata.drafted_project_id &&
        w.id === session.metadata.workflow?.id,
    )
  )
    throw new Error('Only synthetic projects are accepted.');
  return {
    id: `synthetic-receipt:${session.id}`,
    sessionId: session.id,
    projectId,
    revision: session.sync?.revision ?? 1,
    steps: session.steps.length,
    labels: session.segments.map((s) => s.label),
    thoughts,
    earnings: earningsForSession(session),
    receivedAt: new Date().toISOString(),
  };
}

export async function readReceipts(): Promise<Record<string, SyntheticReceipt>> {
  return (await chrome.storage.local.get(DEMO.ledgerKey))[DEMO.ledgerKey] ?? {};
}

export async function submitSessionToDrafted(
  session: Session,
  enrich?: EnrichmentMap,
): Promise<SubmitResult> {
  const receipt = makeReceipt(session, enrich);
  if ((await chrome.storage.local.get(DEMO.offlineKey))[DEMO.offlineKey] || !navigator.onLine)
    throw new Error('Synthetic receiver offline. Retained for retry.');
  await new Promise((resolve) => setTimeout(resolve, DEMO.latencyMs));
  if ((await chrome.storage.local.get(DEMO.offlineKey))[DEMO.offlineKey] || !navigator.onLine)
    throw new Error('Synthetic receiver went offline.');
  await navigator.locks.request('synthetic-ledger', async () => {
    const receipts = await readReceipts();
    if ((receipts[receipt.id]?.revision ?? 0) <= receipt.revision) receipts[receipt.id] = receipt;
    await chrome.storage.local.set({ [DEMO.ledgerKey]: receipts });
  });
  return {
    taskId: receipt.id,
    qualityScore: 0,
    badgeEarned: false,
    badgeLevel: null,
    captureRevision: receipt.revision,
  };
}
export async function enrichSubmittedSession(
  session: Session,
  taskId: string,
  enrich?: EnrichmentMap,
) {
  if (taskId !== `synthetic-receipt:${session.id}`) throw new Error('Not a synthetic receipt.');
  await submitSessionToDrafted(session, enrich);
}
export async function submittedSessionOwner(session: Session) {
  return (await readReceipts())[`synthetic-receipt:${session.id}`] ? DEMO.uid : null;
}
