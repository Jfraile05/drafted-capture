import type { QualityReview } from '../shared/quality';
import { ensureOffscreen } from './offscreen';

const CACHE_KEY = 'quality_reviews';
/** Keeps one popup open from reading hundreds of task documents at once. */
const MAX_FETCH = 50;

/** Reviews are written once per upload, so a saved review never goes stale. */
export async function qualityReviews(taskIds: string[]): Promise<Record<string, QualityReview>> {
  const stored = await chrome.storage.local.get(CACHE_KEY);
  const cache: Record<string, QualityReview> = stored[CACHE_KEY] ?? {};
  const missing = taskIds.filter((id) => !cache[id]).slice(0, MAX_FETCH);
  if (missing.length) {
    try {
      await ensureOffscreen();
      const fetched: Record<string, QualityReview | null> | undefined =
        await chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'QUALITY_REVIEWS',
          taskIds: missing,
        });
      let changed = false;
      for (const id of missing) {
        const review = fetched?.[id];
        if (review) {
          cache[id] = review;
          changed = true;
        }
      }
      if (changed) await chrome.storage.local.set({ [CACHE_KEY]: cache });
    } catch {
      // Offline or signed out. Show what is already saved.
    }
  }
  return Object.fromEntries(taskIds.filter((id) => cache[id]).map((id) => [id, cache[id]]));
}
