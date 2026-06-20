/**
 * Gold Standard Management
 *
 * Handles loading gold items from Firestore, injection rate logic,
 * cooldown tracking, and deduplication so students never know which
 * items are gold.
 */

import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';

// ─── Configuration ──────────────────────────────────────────────────────────

export const GOLD_CONFIG = {
  INJECTION_RATE: 0.1, // 10% of tasks are gold items
  COOLDOWN_TASKS: 5, // Minimum regular tasks between gold items
  MAX_GOLD_REPEATS: 0, // How many times the same gold item can be served to one annotator
};

// ─── Gold Item Fetching ─────────────────────────────────────────────────────

/**
 * Fetch all active gold standards for a given task type.
 * @param {string} taskType
 * @returns {Promise<Array>}
 */
async function fetchGoldItems(taskType) {
  const q = query(
    collection(db, 'gold_standards'),
    where('task_type', '==', taskType),
    where('active', '==', true),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ gold_id: d.id, ...d.data() }));
}

/**
 * Pick a random gold item that the annotator hasn't completed yet.
 * @param {string} taskType
 * @param {string[]} completedGoldIds - gold IDs already completed by this annotator
 * @returns {Promise<object|null>}
 */
async function getRandomGoldItem(taskType, completedGoldIds = []) {
  const allGold = await fetchGoldItems(taskType);
  if (allGold.length === 0) return null;

  // Filter out completed ones (unless all exhausted)
  const available = allGold.filter((g) => !completedGoldIds.includes(g.gold_id));
  const pool = available.length > 0 ? available : allGold;

  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Injection Logic ────────────────────────────────────────────────────────

/**
 * Determine whether the next task should be a gold item, and if so, return it.
 * Otherwise returns null (caller should serve a regular prompt).
 *
 * @param {string} taskType
 * @param {string} userEmail
 * @param {object} annotatorProfile - from annotator_profiles/{email}
 * @returns {Promise<{ taskData: object, _is_gold: true, _gold_id: string } | null>}
 */
export async function maybeInjectGold(taskType, userEmail, annotatorProfile) {
  const profile = annotatorProfile || {};

  // Check cooldown — how many tasks since last gold?
  const tasksSinceLastGold = profile.gold_tracking?.tasks_since_last_gold ?? 999;
  if (tasksSinceLastGold < GOLD_CONFIG.COOLDOWN_TASKS) {
    return null; // Too soon for another gold item
  }

  // Roll the dice
  if (Math.random() >= GOLD_CONFIG.INJECTION_RATE) {
    return null; // Regular task this time
  }

  // Fetch a gold item they haven't seen
  const completedGoldIds = profile.gold_tracking?.completed_gold_ids || [];
  const goldItem = await getRandomGoldItem(taskType, completedGoldIds);
  if (!goldItem) return null; // No gold items available for this task type

  // Return the gold item's task data with metadata flags
  // These flags get stripped before rendering but passed through to submission
  return {
    ...goldItem.task_data,
    _is_gold: true,
    _gold_id: goldItem.gold_id,
  };
}

// ─── Gold Tracking Updates ──────────────────────────────────────────────────

/**
 * Update the annotator's gold tracking after a submission.
 * Called from useTaskSubmission after evaluating a gold item.
 *
 * @param {string} userEmail
 * @param {object} existingProfile
 * @param {boolean} wasGold - whether this submission was a gold item
 * @param {string|null} goldId - the gold ID if it was gold
 * @param {number|null} goldAccuracy - accuracy score if it was gold (0-100)
 * @returns {object} - updated gold_tracking object to merge into annotator profile
 */
export function computeUpdatedGoldTracking(existingProfile, wasGold, goldId, goldAccuracy) {
  const existing = existingProfile?.gold_tracking || {
    tasks_since_last_gold: 0,
    completed_gold_ids: [],
    gold_results: [],
    gold_accuracy_avg: 0,
    gold_items_completed: 0,
  };

  if (!wasGold) {
    // Regular task — just increment the counter
    return {
      ...existing,
      tasks_since_last_gold: (existing.tasks_since_last_gold || 0) + 1,
    };
  }

  // Gold task — reset counter, record result
  const newGoldResults = [
    ...(existing.gold_results || []).slice(-49), // Keep last 50 results
    {
      gold_id: goldId,
      accuracy: goldAccuracy,
      completed_at: new Date().toISOString(),
    },
  ];

  const newGoldCount = (existing.gold_items_completed || 0) + 1;
  const newGoldAvg =
    existing.gold_items_completed > 0
      ? (existing.gold_accuracy_avg * existing.gold_items_completed + goldAccuracy) / newGoldCount
      : goldAccuracy;

  return {
    tasks_since_last_gold: 0, // Reset counter
    completed_gold_ids: [...new Set([...(existing.completed_gold_ids || []), goldId])],
    gold_results: newGoldResults,
    gold_accuracy_avg: Math.round(newGoldAvg * 100) / 100,
    gold_items_completed: newGoldCount,
  };
}
