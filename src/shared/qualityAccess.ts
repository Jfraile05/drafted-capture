import { doc, getDoc } from 'firebase/firestore';
// @ts-expect-error - vendored JS module, no types
import { db } from '../vendor/seeker/firebaseInit.js';
import { type QualityReview, reviewForStudent } from './quality';

/** Reads each uploaded task's review, with any admin hand score. Runs in the offscreen document. */
export async function loadQualityReviews(
  taskIds: string[],
): Promise<Record<string, QualityReview | null>> {
  const entries = await Promise.all(
    taskIds.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, 'credential_tasks', id));
        const data = snap.exists() ? snap.data() : null;
        return [
          id,
          data ? reviewForStudent(data.agent_review, data.review_override) : null,
        ] as const;
      } catch {
        return [id, null] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}
