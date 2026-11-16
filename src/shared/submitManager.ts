// ════════════════════════════════════════════════════════════════════════
//  Worker-side submission orchestration.
//
//  Wraps the Session -> Drafted bridge with auth-readiness handling (a cold
//  service worker may not have auth.currentUser populated until
//  onAuthStateChanged settles) and persists submission state back onto the
//  archived Session so the UI can show status and enrichment can target the
//  right credential_tasks doc.
// ════════════════════════════════════════════════════════════════════════

import { getCurrentUser } from './auth';
import { buildEnrichment } from './enrichment';
import { getSession, updateSession } from './storage/db';
import {
  type EnrichmentMap,
  enrichSubmittedSession,
  submitSessionToDrafted,
} from './submitToDrafted';
import { uploadsWithoutProject } from './workflows';

export interface SubmitOutcome {
  ok: boolean;
  reason?:
    | 'not_signed_in'
    | 'not_found'
    | 'already_submitted'
    | 'wrong_account'
    | 'no_project'
    | 'error';
  draftedTaskId?: string;
  qualityScore?: number | null;
  error?: string;
}

/** Submit an archived session to Drafted. Idempotent: if already submitted,
 *  returns the existing task id instead of creating a duplicate. */
export async function submitArchivedSession(
  sessionId: string,
  enrich?: EnrichmentMap,
): Promise<SubmitOutcome> {
  return navigator.locks.request(`drafted-submit:${sessionId}`, () =>
    submitUnlocked(sessionId, enrich),
  );
}

async function submitUnlocked(sessionId: string, enrich?: EnrichmentMap): Promise<SubmitOutcome> {
  const session = await getSession(sessionId);
  if (!session) return { ok: false, reason: 'not_found' };

  if (session.submission?.drafted_task_id) {
    return {
      ok: true,
      reason: 'already_submitted',
      draftedTaskId: session.submission.drafted_task_id,
      qualityScore: session.submission.quality_score,
    };
  }

  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: 'not_signed_in' };
  if (session.metadata.owner_uid !== user.uid) return { ok: false, reason: 'wrong_account' };
  if (!session.metadata.drafted_project_id && !uploadsWithoutProject(session.metadata.workflow))
    return { ok: false, reason: 'no_project' };

  try {
    const result = await submitSessionToDrafted(session, enrich ?? buildEnrichment(session));
    if (!result.taskId?.trim()) throw new Error('Submission did not return a receipt.');
    const submission = {
      drafted_task_id: result.taskId,
      submitted_at: new Date().toISOString(),
      quality_score: result.qualityScore ?? null,
      last_enriched_at: null,
    };
    await updateSession(sessionId, (current) => ({
      ...current,
      submission,
      sync: current.sync
        ? {
            ...current.sync,
            synced_revision: session.sync?.revision ?? 0,
            attempts: 0,
            retry_at: 0,
          }
        : undefined,
    }));
    return { ok: true, draftedTaskId: result.taskId, qualityScore: result.qualityScore ?? null };
  } catch (err) {
    console.error('[submit] failed:', err);
    return { ok: false, reason: 'error', error: String(err) };
  }
}

/** Enrich (patch) an already-submitted session's record with the user's
 *  per-step thoughts and segment-derived instruction. If the session was
 *  never submitted, submits it fresh (with the enrichment) instead. */
export async function enrichArchivedSession(
  sessionId: string,
  enrich?: EnrichmentMap,
): Promise<SubmitOutcome> {
  return navigator.locks.request(`drafted-submit:${sessionId}`, () =>
    enrichUnlocked(sessionId, enrich),
  );
}

async function enrichUnlocked(sessionId: string, enrich?: EnrichmentMap): Promise<SubmitOutcome> {
  const session = await getSession(sessionId);
  if (!session) return { ok: false, reason: 'not_found' };

  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: 'not_signed_in' };
  if (session.metadata.owner_uid !== user.uid) return { ok: false, reason: 'wrong_account' };

  // Not yet submitted -> submit fresh with the enrichment baked in.
  if (!session.submission?.drafted_task_id) {
    return submitUnlocked(sessionId, enrich);
  }
  const submission = session.submission;

  try {
    await enrichSubmittedSession(
      session,
      submission.drafted_task_id,
      enrich ?? buildEnrichment(session),
    );
    const lastEnrichedAt = new Date().toISOString();
    await updateSession(sessionId, (current) => ({
      ...current,
      sync: current.sync
        ? {
            ...current.sync,
            synced_revision: session.sync?.revision ?? 0,
            attempts: 0,
            retry_at: 0,
          }
        : undefined,
      submission: { ...submission, ...current.submission, last_enriched_at: lastEnrichedAt },
    }));
    return { ok: true, draftedTaskId: submission.drafted_task_id };
  } catch (err) {
    console.error('[enrich] failed:', err);
    return { ok: false, reason: 'error', error: String(err) };
  }
}
