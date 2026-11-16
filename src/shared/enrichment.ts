import type { Session } from './types';

/** Build the enrichment map (step index -> thought) from the user's annotations
 *  + segment notes so a later submit/enrich carries the human signal. */
export function buildEnrichment(session: Session): Record<number, { thought?: string }> {
  const map: Record<number, { thought?: string }> = {};
  for (const segment of session.segments) {
    if (!session.steps.some((step) => step.index === segment.start_index)) continue;
    const context = [segment.label.trim(), segment.notes.trim()].filter(Boolean).join('\n');
    if (context) {
      map[segment.start_index] = {
        thought: [map[segment.start_index]?.thought, context].filter(Boolean).join('\n\n'),
      };
    }
  }
  for (const step of session.steps) {
    const thought = step.annotation?.notes?.trim();
    if (thought) {
      map[step.index] = {
        thought: [map[step.index]?.thought, thought].filter(Boolean).join('\n\n'),
      };
    }
  }
  return map;
}
