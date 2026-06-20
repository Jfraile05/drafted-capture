import type { Session } from '../shared/types';

/** Build the enrichment map (step index -> thought) from the user's annotations
 *  + segment notes so a later submit/enrich carries the human signal. */
export function buildEnrichment(session: Session): Record<number, { thought?: string }> {
  const map: Record<number, { thought?: string }> = {};
  for (const step of session.steps) {
    const thought = step.annotation?.notes?.trim();
    if (thought) map[step.index] = { thought };
  }
  return map;
}
