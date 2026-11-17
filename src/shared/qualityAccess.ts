import { doc, getDoc } from 'firebase/firestore';
// @ts-expect-error - vendored JS module, no types
import { db } from '../vendor/seeker/firebaseInit.js';
import { type QualityReview, parseQualityReview } from './quality';

/** Reads the review agent's result from each uploaded task. Runs in the offscreen document. */
export async function loadQualityReviews(
  taskIds: string[],
): Promise<Record<string, QualityReview | null>> {
  const entries = await Promise.all(
    taskIds.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, 'credential_tasks', id));
        return [id, snap.exists() ? parseQualityReview(snap.data().agent_review) : null] as const;
      } catch {
        return [id, null] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}
