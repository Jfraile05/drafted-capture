import type { Session } from './types';

export function submissionLabelFields(session: Session) {
  const first = session.segments[0];
  return {
    instruction:
      first?.label.trim() || session.intent?.trim() || 'Ambient browser capture (unlabeled)',
    category: first?.category ?? null,
    summary: first?.notes.trim() || '',
  };
}

export function patchStepThoughts<T extends { step_index: number }>(
  existing: T[],
  session: Session,
  enrichment: Record<number, { thought?: string }>,
) {
  const recorded = new Set(session.steps.map((step) => step.index));
  return existing.map((step) =>
    recorded.has(step.step_index)
      ? { ...step, thought: enrichment[step.step_index]?.thought?.trim() || '' }
      : step,
  );
}
