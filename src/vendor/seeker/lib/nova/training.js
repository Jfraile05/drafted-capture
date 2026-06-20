/**
 * Nova training — tracks training sessions, XP, levels, leaderboard state.
 *
 * Every task completed (whether via /nova/train or a /tasks/* page for a
 * user with a Nova agent) updates nova_agents/{uid}. The leaderboard reads
 * the same collection, keeping the data model flat and query-friendly.
 *
 * XP is monotonic — never decreases — so a bad task never undoes progress.
 * See lib/nova/levels.js for the XP formula + level table.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { computeTaskXp, didLevelUp, levelForXp } from './levels';

const LOG = '[Nova:Training]';
const TASK_XP_HISTORY_CAP = 30;

const TASK_COLORS = {
  rlhf_preference_ranking: 'amber',
  creative_writing: 'lime',
  tool_call_evaluation: 'violet',
  agent_workflow_evaluation: 'fuchsia',
};

/**
 * Record a completed task on the agent doc.
 *
 * Returns null (no-op) when the user has no agent — this lets /tasks/* pages
 * blindly call this without first checking for agent existence.
 *
 * Returns an XP result object on success:
 *   {
 *     total_xp, level, xpGained, xpBreakdown,
 *     leveledUp, newLevel, prevLevel,
 *     levelState: { level, name, color, progress, ... },
 *     training_score, training_examples_count, best_score,  // legacy fields
 *   }
 */
export async function recordTrainingTask(uid, { taskType, qualityScore, isGold, goldAccuracy }) {
  if (!uid) return null;

  const ref = doc(db, 'nova_agents', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    // Graceful no-op — user has no Nova agent yet (hasn't completed /nova/build)
    return null;
  }

  const agent = snap.data();
  const prevCount = agent.training_examples_count || 0;
  const prevScore = agent.training_score || 0;
  const prevRlhf = agent.training_tasks_rlhf || 0;
  const prevWriting = agent.training_tasks_writing || 0;
  const prevToolCalls = agent.training_tasks_tool_calls || 0;
  const prevXp = agent.total_xp || 0;
  const prevTypeCounts = agent.type_counts || {};
  const prevTypeCount = prevTypeCounts[taskType] || 0;
  const prevHistory = Array.isArray(agent.task_xp_history) ? agent.task_xp_history : [];

  // ── XP computation ───────────────────────────────────────────
  const { taskXp, breakdown } = computeTaskXp({
    qualityScore,
    isGold,
    goldAccuracy,
    isFirstOfType: prevTypeCount === 0,
    taskType,
  });

  const nextXp = prevXp + taskXp; // monotonic — always increases
  const levelTransition = didLevelUp(prevXp, nextXp);
  const levelState = levelForXp(nextXp);

  // ── Legacy fields (kept for backwards compat / buyer dashboards) ──
  const effectiveScore =
    isGold && goldAccuracy != null ? goldAccuracy * 0.6 + qualityScore * 0.4 : qualityScore;

  const newCount = prevCount + 1;
  const newAvg =
    prevCount > 0 ? (prevScore * prevCount + effectiveScore) / newCount : effectiveScore;

  // ── History entry (capped) ──────────────────────────────────
  const historyEntry = {
    ts: new Date().toISOString(),
    task_type: taskType,
    task_xp: taskXp,
    quality_score: Math.round((Number(qualityScore) || 0) * 100) / 100,
    level_after: levelState.level,
  };
  const nextHistory = [...prevHistory, historyEntry].slice(-TASK_XP_HISTORY_CAP);

  // ── Type counts ─────────────────────────────────────────────
  const nextTypeCounts = { ...prevTypeCounts, [taskType]: prevTypeCount + 1 };

  // ── Build update payload ────────────────────────────────────
  const updates = {
    status: 'training',
    total_xp: nextXp,
    level: levelState.level,
    task_xp_history: nextHistory,
    type_counts: nextTypeCounts,
    training_examples_count: newCount,
    training_score: Math.round(newAvg * 100) / 100,
    best_score: Math.max(agent.best_score || 0, effectiveScore),
    updated_at: serverTimestamp(),
  };

  if (taskType === 'rlhf_preference_ranking') {
    updates.training_tasks_rlhf = prevRlhf + 1;
  } else if (taskType === 'creative_writing') {
    updates.training_tasks_writing = prevWriting + 1;
  } else if (taskType === 'tool_call_evaluation') {
    updates.training_tasks_tool_calls = prevToolCalls + 1;
  }

  await updateDoc(ref, updates);

  console.log(`${LOG} Recorded task`, {
    uid,
    taskType,
    qualityScore,
    xpGained: taskXp,
    totalXp: nextXp,
    level: levelState.level,
    leveledUp: levelTransition.leveledUp,
  });

  return {
    total_xp: nextXp,
    level: levelState.level,
    xpGained: taskXp,
    xpBreakdown: breakdown,
    leveledUp: levelTransition.leveledUp,
    newLevel: levelTransition.newLevel,
    prevLevel: levelTransition.prevLevel,
    levelState,
    // Legacy fields (kept so existing callers keep working)
    training_score: updates.training_score,
    training_examples_count: newCount,
    best_score: updates.best_score,
  };
}

// Legacy university entries were stored as "School Name (Add as custom university)"
// when the College Scorecard API didn't find a match. Strip that suffix on read
// so existing dirty data displays cleanly without a backfill migration.
function cleanUniversity(name) {
  if (typeof name !== 'string') return name;
  return name.replace(/\s*\(Add as custom university\)\s*$/i, '').trim() || null;
}

/**
 * Subscribe to the leaderboard — all agents that have completed at least
 * one task (total_xp > 0, or legacy training_examples_count > 0).
 *
 * Ranked by total_xp DESC. Falls back to training_score for agents that
 * predate the XP rollout (no total_xp field yet).
 *
 * Returns an unsubscribe function.
 */
export function subscribeLeaderboard(callback, maxResults = 10) {
  // Order by total_xp DESC server-side so the top-XP agents are returned —
  // without this, Firestore returns the first 50 docs by ID and a high-XP
  // user whose doc ID sorts late is invisible on the leaderboard.
  const q = query(collection(db, 'nova_agents'), orderBy('total_xp', 'desc'), limit(50));

  return onSnapshot(q, async (snapshot) => {
    const agents = snapshot.docs
      .map((d) => {
        const data = d.data();
        return { id: d.id, ...data, university: cleanUniversity(data.university) };
      })
      .filter((a) => (a.total_xp || 0) > 0 || (a.training_examples_count || 0) > 0)
      .sort((a, b) => {
        const axp = a.total_xp || 0;
        const bxp = b.total_xp || 0;
        if (bxp !== axp) return bxp - axp;
        // Tie-break: running quality avg, then best single-task score
        const aq = a.training_score || 0;
        const bq = b.training_score || 0;
        if (bq !== aq) return bq - aq;
        return (b.best_score || 0) - (a.best_score || 0);
      })
      .slice(0, maxResults);

    // Enrich missing universities from drafted-accounts
    const needsEnrich = agents.filter((a) => !a.university && a.user_email);
    if (needsEnrich.length > 0) {
      const enriched = await Promise.all(
        needsEnrich.map(async (a) => {
          try {
            const snap = await getDoc(doc(db, 'drafted-accounts', a.user_email.toLowerCase()));
            return {
              id: a.id,
              university: snap.exists() ? cleanUniversity(snap.data().university) : null,
            };
          } catch {
            return { id: a.id, university: null };
          }
        }),
      );
      const uniMap = Object.fromEntries(enriched.map((e) => [e.id, e.university]));
      callback(agents.map((a) => ({ ...a, university: a.university || uniMap[a.id] || null })));
    } else {
      callback(agents);
    }
  });
}

export { TASK_COLORS };
