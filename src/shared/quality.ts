import { earningsForSession } from './earnings';
import type { Session } from './types';

/** A step the review agent says raised or lowered the recording's quality. */
export interface StepNote {
  step: number;
  effect: 'up' | 'down';
  note: string;
}

/** The part of the Drafted review agent's result that the student sees. */
export interface QualityReview {
  quality_score: number;
  overview: string;
  went_well: string[];
  hurt_quality: string[];
  step_notes: StepNote[];
}

export interface QualitySummary {
  /** Average score weighted by recorded time, or null before any review. */
  average: number | null;
  reviewed: number;
  /** Uploaded sessions that have no review yet. */
  waiting: number;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/** Validates `agent_review` from the task document. Failed reviews return null. */
export function parseQualityReview(raw: unknown): QualityReview | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const score = value.quality_score;
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  const notes = Array.isArray(value.step_notes) ? value.step_notes : [];
  return {
    quality_score: Math.max(0, Math.min(100, Math.round(score))),
    overview: typeof value.overview === 'string' ? value.overview : '',
    went_well: strings(value.went_well),
    hurt_quality: strings(value.hurt_quality),
    step_notes: notes.filter(
      (note): note is StepNote =>
        Number.isInteger(note?.step) &&
        (note.effect === 'up' || note.effect === 'down') &&
        typeof note.note === 'string',
    ),
  };
}

/** Uses the same sessions as the earnings total, so the three numbers agree. */
export function summarizeQuality(
  sessions: Session[],
  reviews: Record<string, QualityReview>,
  uid: string,
  localOnly: boolean,
): QualitySummary {
  let weighted = 0;
  let weight = 0;
  let reviewed = 0;
  let waiting = 0;
  for (const session of sessions) {
    if (!uid || session.metadata.owner_uid !== uid) continue;
    if (!!session.metadata.workflow?.local_only !== localOnly) continue;
    const taskId = session.submission?.drafted_task_id;
    if (!taskId) continue;
    const review = reviews[taskId];
    if (!review) {
      waiting++;
      continue;
    }
    const ms = earningsForSession(session)?.active_ms ?? 0;
    weighted += review.quality_score * ms;
    weight += ms;
    reviewed++;
  }
  return { average: weight > 0 ? Math.round(weighted / weight) : null, reviewed, waiting };
}

/** Green when strong, red when it's costing the student. */
export function qualityColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'text-text-muted';
  if (score >= 70) return 'text-green';
  if (score < 50) return 'text-coral';
  return 'text-text';
}
