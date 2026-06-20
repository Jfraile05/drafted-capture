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
import { getSession, listSessions, putSession } from './storage/db';
import {
  type EnrichmentMap,
  enrichSubmittedSession,
  submitSessionToDrafted,
} from './submitToDrafted';

export interface SubmitOutcome {
  ok: boolean;
  reason?: 'not_signed_in' | 'not_found' | 'already_submitted' | 'error';
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

  try {
    const result = await submitSessionToDrafted(session, enrich);
    session.submission = {
      drafted_task_id: result.taskId,
      submitted_at: new Date().toISOString(),
      quality_score: result.qualityScore ?? null,
      last_enriched_at: null,
    };
    await putSession(session);
    return { ok: true, draftedTaskId: result.taskId, qualityScore: result.qualityScore ?? null };
  } catch (err) {
    console.error('[submit] failed:', err);
    return { ok: false, reason: 'error', error: String(err) };
  }
}

/** Auto-submit the most recent archived session if it has not been submitted
 *  yet. Used by the popup right after a capture stops. No-ops silently when
 *  signed out (the user can still submit later from the panel). */
export async function submitLatestUnsubmitted(): Promise<SubmitOutcome> {
  const sessions = await listSessions(); // newest first
  const latest = sessions[0];
  if (!latest) return { ok: false, reason: 'not_found' };
  if (latest.submission?.drafted_task_id) {
    return {
      ok: true,
      reason: 'already_submitted',
      draftedTaskId: latest.submission.drafted_task_id,
    };
  }
  return submitArchivedSession(latest.id);
}

/** Enrich (patch) an already-submitted session's record with the user's
 *  per-step thoughts and segment-derived instruction. If the session was
 *  never submitted, submits it fresh (with the enrichment) instead. */
export async function enrichArchivedSession(
  sessionId: string,
  enrich: EnrichmentMap,
): Promise<SubmitOutcome> {
  const session = await getSession(sessionId);
  if (!session) return { ok: false, reason: 'not_found' };

  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: 'not_signed_in' };

  // Not yet submitted -> submit fresh with the enrichment baked in.
  if (!session.submission?.drafted_task_id) {
    return submitArchivedSession(sessionId, enrich);
  }

  try {
    await enrichSubmittedSession(session, session.submission.drafted_task_id, enrich);
    session.submission.last_enriched_at = new Date().toISOString();
    await putSession(session);
    return { ok: true, draftedTaskId: session.submission.drafted_task_id };
  } catch (err) {
    console.error('[enrich] failed:', err);
    return { ok: false, reason: 'error', error: String(err) };
  }
}
