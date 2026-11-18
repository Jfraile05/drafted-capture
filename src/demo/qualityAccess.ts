import type { QualityReview } from '../shared/quality';

// The synthetic lab has no review agent, so no task has a review.
export async function loadQualityReviews(
  taskIds: string[],
): Promise<Record<string, QualityReview | null>> {
  return Object.fromEntries(taskIds.map((id) => [id, null]));
}
