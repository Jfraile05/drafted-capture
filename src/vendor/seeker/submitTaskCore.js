// ════════════════════════════════════════════════════════════════════════
//  submitTaskCore — plain-async extraction of useTaskSubmission's submitTask.
//  Mechanically lifted from useTaskSubmission.js (same orchestration, minus
//  the React useState/useCallback shell) so it runs in the extension's
//  service worker. Keep in sync when the seeker hook changes.
// ════════════════════════════════════════════════════════════════════════

import { addDoc, collection, doc, getDoc, increment, setDoc, updateDoc } from 'firebase/firestore';
import { ensureAccountDocument } from './lib/accountSelfHeal';
import { issueEarnedCertificates } from './lib/certificates/issuance';
import { auth, db, ref, storage, uploadBytes } from './lib/firebase';
import { recordTrainingTask } from './lib/nova/training';
import { checkBadgeEarned, computeBadgeLevel } from './lib/tasks/badgeComputation';
import {
  CONSENT_VERSION,
  DEFAULT_RELEASE_ID,
  buildAnnotatorBlock,
  buildResponsesProvenance,
} from './lib/tasks/datasetProvenance';
import { evaluateGoldSubmission } from './lib/tasks/goldEvaluation';
import { computeUpdatedGoldTracking } from './lib/tasks/goldStandards';
import { computeQualityScore } from './lib/tasks/qualityScoring';
import {
  flushTrajectory,
  getTrajectorySummary,
  capture as telemetryCapture,
} from './lib/telemetry';
import { TASK_EVENTS } from './lib/telemetry/events';

const TASK_TYPE_CONFIG = {
  rlhf_preference_ranking: {
    badge_type: 'RLHF Evaluator',
    field_key: 'rlhf_preference_ranking',
  },
  computer_use_trajectory: {
    badge_type: 'Computer Use Demonstrator',
    field_key: 'computer_use_trajectory',
  },
  multilingual_evaluation: {
    badge_type: 'Multilingual Evaluator',
    field_key: 'multilingual_evaluation',
  },
  process_supervision: {
    badge_type: 'Reasoning Verifier',
    field_key: 'process_supervision',
  },
  red_teaming: {
    badge_type: 'Red Team Analyst',
    field_key: 'red_teaming',
  },
  tool_call_evaluation: {
    badge_type: 'Agentic Trace Evaluator',
    field_key: 'tool_call_evaluation',
  },
  code_review: {
    badge_type: 'Code Reviewer',
    field_key: 'code_review',
  },
  creative_writing: {
    badge_type: 'Creative Writer',
    field_key: 'creative_writing',
  },
  agent_workflow_evaluation: {
    badge_type: 'Agent Workflow Evaluator',
    field_key: 'agent_workflow_evaluation',
  },
};

/**
 * Strip and upload base64 screenshots from computer_use trajectories.
 * Returns a cleaned taskData with screenshot URLs instead of base64 blobs.
 */
async function processComputerUseScreenshots(taskData, userId, taskId) {
  if (!taskData.trajectory?.steps) {
    return taskData;
  }

  const cleanedSteps = await Promise.all(
    taskData.trajectory.steps.map(async (step) => {
      if (!step.screenshot?.startsWith('data:image')) {
        return step; // Not a base64 image, return as-is
      }

      try {
        // Convert base64 to blob
        const arr = step.screenshot.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        const n = bstr.length;
        const u8arr = new Uint8Array(n);
        for (let i = 0; i < n; i++) u8arr[i] = bstr.charCodeAt(i);
        const blob = new Blob([u8arr], { type: mime });

        // Upload to storage
        const filename = `${step.step_index}.jpg`;
        const path = `annotated-screenshots/${userId}/${taskId}/${filename}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, blob, {
          contentType: 'image/jpeg',
          customMetadata: { owner: userId, task_id: taskId, step_index: step.step_index },
        });

        // Return step with URL instead of base64
        return {
          ...step,
          screenshot: path, // store the path reference, not the blob
          screenshot_storage_path: path,
        };
      } catch (err) {
        console.error(
          `[processComputerUseScreenshots] Failed to upload step ${step.step_index}:`,
          err,
        );
        // On failure, strip the image entirely rather than failing submission
        return {
          ...step,
          screenshot: undefined,
          screenshot_upload_error: err.message,
        };
      }
    }),
  );

  return {
    ...taskData,
    trajectory: {
      ...taskData.trajectory,
      steps: cleanedSteps,
    },
  };
}


export async function submitTaskCore(taskType, taskData, behavioralData) {
  try {
    // --- Pre-submission size check ---
    const taskDataSize = new Blob([JSON.stringify(taskData)]).size;
    if (taskDataSize > 500_000) {
      // 500KB threshold
      console.warn(`[useTaskSubmission] Task data ${taskDataSize} bytes exceeds 500KB threshold`, {
        taskType,
        taskDataSize,
      });
    }

    // --- 1. Generate task ID and get current user ---
    const taskId = crypto.randomUUID();
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User must be signed in to submit a task.');
    }
    const userEmail = user.email.toLowerCase();
    const userId = user.uid;

    // --- 2. Fetch annotator profile from drafted-accounts ---
    // If the doc is missing (rare, but possible if a signup partially failed
    // or an account was provisioned by a script that didn't write Firestore),
    // self-heal a minimal stub so the submission can still go through.
    const accountDocRef = doc(db, 'drafted-accounts', userEmail);
    let accountSnap = await getDoc(accountDocRef);
    if (!accountSnap.exists()) {
      console.warn(
        `[useTaskSubmission] No profile doc for ${userEmail} — running self-heal before submit.`,
      );
      const healResult = await ensureAccountDocument(user, { source: 'task_submission' });
      if (!healResult.healed && !healResult.data) {
        throw new Error(
          'User account not found and self-heal failed. Please refresh and try again.',
        );
      }
      accountSnap = await getDoc(accountDocRef);
      if (!accountSnap.exists()) {
        throw new Error('User account not found. Please refresh and try again.');
      }
    }
    const accountData = accountSnap.data();

    // Pseudonymous annotator block — no PII (no email).
    // Firebase UID is the stable cross-record identifier, matching the
    // pattern used by Anthropic's HH-RLHF and OpenAI Summarize-from-Feedback.
    const annotator = buildAnnotatorBlock({ userId, accountData });

    // Snapshot the consent state at the moment of submission so the
    // record carries proof of what the annotator agreed to. Records
    // submitted before consent decision land with granted=null and
    // are excluded from any commercial release.
    const consentSnapshot = {
      version: CONSENT_VERSION,
      granted:
        typeof accountData.data_commercialization_consent === 'boolean'
          ? accountData.data_commercialization_consent
          : null,
      accepted_at: accountData.data_commercialization_consented_at || null,
    };

    // --- 3. Compute quality score ---
    const qualityScore = computeQualityScore(taskType, taskData, behavioralData);

    // --- 4. Determine badge type ---
    const config = TASK_TYPE_CONFIG[taskType];
    if (!config) {
      throw new Error(`Unknown task type: ${taskType}`);
    }

    // --- 4.5 Gold Standard Evaluation (if this is a gold item) ---
    let goldResult = null;
    const isGold = !!taskData._is_gold;
    const goldId = taskData._gold_id || null;

    if (isGold && goldId) {
      try {
        const goldDocRef = doc(db, 'gold_standards', goldId);
        const goldSnap = await getDoc(goldDocRef);
        if (goldSnap.exists()) {
          const goldStandard = goldSnap.data();
          goldResult = evaluateGoldSubmission(taskType, taskData, goldStandard);
        }
      } catch (err) {
        console.error('[useTaskSubmission] Gold evaluation failed:', err);
        // Don't block submission on gold evaluation failure
      }
    }

    // Strip gold metadata from task data before writing (student should never see this)
    const { _is_gold, _gold_id, ...taskDataClean } = taskData;

    // --- 5a. For computer_use, extract and upload screenshots to Storage ---
    let cleanedTaskData = taskDataClean;
    if (taskType === 'computer_use_trajectory') {
      cleanedTaskData = await processComputerUseScreenshots(taskDataClean, userId, taskId);
    }

    // --- 5b. Build and write the task record ---
    const now = new Date().toISOString();
    const responsesProvenance = buildResponsesProvenance(cleanedTaskData);
    const taskRecord = {
      task_id: taskId,
      task_type: taskType,
      annotator,
      // Lab-grade dataset metadata
      consent: consentSnapshot,
      release_id: DEFAULT_RELEASE_ID,
      ...(responsesProvenance ? { responses_provenance: responsesProvenance } : {}),
      behavioral_metadata: {
        total_time_ms: behavioralData.total_time_ms || 0,
        device_type: behavioralData.device_type || 'desktop',
        browser: behavioralData.user_agent || '',
        screen_resolution: behavioralData.viewport_size || { width: 0, height: 0 },
        session_id: cleanedTaskData.session_id || taskId,
        started_at: behavioralData.task_started_at || now,
        completed_at: behavioralData.task_completed_at || now,
        time_per_section_ms: behavioralData.time_per_section_ms || {},
        scroll_events: behavioralData.scroll_events || [],
        max_scroll_depths: behavioralData.max_scroll_depths || {},
        keystroke_count: behavioralData.keystroke_count || 0,
        paste_events: behavioralData.paste_events || 0,
        undo_events: behavioralData.undo_events || 0,
        preference_changes: behavioralData.preference_changes || 0,
        rating_changes: behavioralData.rating_changes || 0,
        tab_hidden_events: behavioralData.tab_hidden_events || [],
        total_tab_hidden_ms: behavioralData.total_tab_hidden_ms || 0,
      },
      quality_score: qualityScore,
      badge_type: config.badge_type,
      status: 'completed',
      created_at: now,
      version: 1,
      // Gold standard metadata (used by Cloud Function for benchmark grading)
      ...(isGold
        ? {
            is_gold: true,
            gold_id: goldId,
            gold_accuracy: goldResult?.accuracy ?? null,
            gold_details: goldResult?.details ?? null,
          }
        : {}),
      // Spread cleaned task-specific data (screenshots now as Storage paths, not base64)
      ...cleanedTaskData,
    };

    const taskDocRef = doc(db, 'credential_tasks', taskId);
    await setDoc(taskDocRef, deepStripUndefined(taskRecord));

    // --- 6. Update drafted-accounts/{email} ---
    const accountUpdates = {
      [`tasksCompleted.${config.field_key}`]: increment(1),
      lastTaskCompletedAt: now,
    };

    // Fetch current badge info to check for new badges BEFORE updating
    const currentTaskBadges = accountData.taskBadges || [];
    const currentTasksCompleted = accountData.tasksCompleted || {};
    const previousCount = currentTasksCompleted[config.field_key] || 0;
    const newCount = previousCount + 1;

    // --- 7. Check badge progression ---
    // Fetch all quality scores for this task type to compute average
    const annotatorProfileRef = doc(db, 'annotator_profiles', userEmail); // userEmail already lowercased above
    const annotatorSnap = await getDoc(annotatorProfileRef);
    const existingProfile = annotatorSnap.exists() ? annotatorSnap.data() : null;

    const existingAvgQuality = existingProfile?.quality?.by_type?.[taskType] || 0;
    const existingTotalForType = existingProfile?.tasks_by_type?.[taskType] || 0;

    // Compute new rolling average quality for this task type
    const newAvgQuality =
      existingTotalForType > 0
        ? (existingAvgQuality * existingTotalForType + qualityScore) / (existingTotalForType + 1)
        : qualityScore;

    // Compute new overall average
    const existingOverallAvg = existingProfile?.quality?.overall_avg || 0;
    const existingTotalTasks = existingProfile?.total_tasks_completed || 0;
    const newOverallAvg =
      existingTotalTasks > 0
        ? (existingOverallAvg * existingTotalTasks + qualityScore) / (existingTotalTasks + 1)
        : qualityScore;

    // Determine badge level (computer use uses lower thresholds)
    const badgeLevel = computeBadgeLevel(newCount, newAvgQuality, 50, taskType);

    // Check if this is a new or upgraded badge
    const existingBadges = existingProfile?.badges || [];
    const currentBadgeForType = existingBadges.find((b) => b.badge_type === config.badge_type);
    const currentBadgeLevel = currentBadgeForType?.level || null;
    const badgeEarned = checkBadgeEarned(currentBadgeLevel, badgeLevel);

    // If badge earned, add to account badges
    if (badgeEarned && badgeLevel) {
      const badgeEntry = {
        badge_type: config.badge_type,
        level: badgeLevel,
        earned_at: now,
        task_type: taskType,
      };

      // Filter out any existing badge of same type (upgrade case)
      const updatedBadges = currentTaskBadges.filter((b) => b.badge_type !== config.badge_type);
      updatedBadges.push(badgeEntry);
      accountUpdates.taskBadges = updatedBadges;
    }

    await updateDoc(accountDocRef, accountUpdates);

    // --- 8. Update annotator_profiles/{email} ---
    const updatedBehavioralSignature = computeRollingBehavioralSignature(
      existingProfile?.behavioral_signature,
      behavioralData,
      taskData,
      existingTotalTasks,
    );

    const updatedBadgesArray = updateBadgesArray(
      existingBadges,
      config.badge_type,
      badgeLevel,
      newCount,
      newAvgQuality,
      now,
    );

    // --- Gold tracking update ---
    const updatedGoldTracking = computeUpdatedGoldTracking(
      existingProfile,
      isGold,
      goldId,
      goldResult?.accuracy ?? null,
    );

    // Compute attention_check_pass_rate from gold tracking
    const goldAccuracyAvg = updatedGoldTracking.gold_accuracy_avg || 0;
    const goldItemsCompleted = updatedGoldTracking.gold_items_completed || 0;
    const attentionCheckPassRate = goldItemsCompleted > 0 ? goldAccuracyAvg : 0;

    const annotatorProfileData = {
      user_id: userId,
      total_tasks_completed: (existingTotalTasks || 0) + 1,
      tasks_by_type: {
        ...(existingProfile?.tasks_by_type || {
          rlhf_preference_ranking: 0,
          computer_use_trajectory: 0,
          multilingual_evaluation: 0,
          process_supervision: 0,
          red_teaming: 0,
          tool_call_evaluation: 0,
          code_review: 0,
        }),
        [taskType]: (existingTotalForType || 0) + 1,
      },
      badges: updatedBadgesArray,
      quality: {
        overall_avg: Math.round(newOverallAvg * 100) / 100,
        by_type: {
          ...(existingProfile?.quality?.by_type || {}),
          [taskType]: Math.round(newAvgQuality * 100) / 100,
        },
        trend: existingProfile?.quality?.trend || 'stable',
        inter_annotator_agreement: existingProfile?.quality?.inter_annotator_agreement || 0,
        attention_check_pass_rate: Math.round(attentionCheckPassRate * 100) / 100,
        gold_accuracy: goldItemsCompleted > 0 ? Math.round(goldAccuracyAvg * 100) / 100 : 0,
        gold_items_completed: goldItemsCompleted,
      },
      gold_tracking: updatedGoldTracking,
      behavioral_signature: updatedBehavioralSignature,
      matching: {
        university: annotator.university,
        major: annotator.major,
        degree_level: annotator.degree_level,
        native_language: annotator.native_language,
        verified_languages: accountData.verifiedLanguages ||
          accountData.verified_languages || [annotator.native_language],
        domain_strengths: existingProfile?.matching?.domain_strengths || [],
        available_hours_per_week: existingProfile?.matching?.available_hours_per_week || null,
      },
      updated_at: now,
    };

    await setDoc(annotatorProfileRef, annotatorProfileData, { merge: true });

    // --- 9. Nova XP + leveling (unified across all task surfaces) ---
    // If the user has a Nova agent, award XP. No-op if they don't.
    // Failures here must not block the submission response.
    let xpResult = null;
    try {
      xpResult = await recordTrainingTask(userId, {
        taskType,
        qualityScore,
        isGold,
        goldAccuracy: goldResult?.accuracy ?? null,
      });
    } catch (err) {
      console.warn('[useTaskSubmission] Nova XP update failed (non-blocking):', err);
    }

    // --- 10. Certificate issuance (non-blocking) ---
    // Evaluates all tiers, idempotently issues any newly-earned certs.
    let certsIssued = [];
    try {
      // Re-read account data to include the badge updates written above
      const freshAccountSnap = await getDoc(accountDocRef);
      const freshAccount = freshAccountSnap.exists() ? freshAccountSnap.data() : accountData;
      certsIssued = await issueEarnedCertificates({
        userEmail,
        accountData: freshAccount,
        annotatorProfile: annotatorProfileData,
        totalXp: xpResult?.total_xp || 0,
      });
    } catch (err) {
      console.warn('[useTaskSubmission] Cert issuance failed (non-blocking):', err);
    }

    // Telemetry: emit submission event with the full behavioral + trajectory
    // summary so PostHog has a first-class record of every completed task.
    try {
      flushTrajectory('submit');
      telemetryCapture(TASK_EVENTS.TASK_SUBMITTED, {
        task_id: taskId,
        task_type: taskType,
        quality_score: qualityScore,
        badge_earned: !!badgeEarned,
        badge_level: badgeLevel || null,
        is_gold: !!isGold,
        gold_accuracy: goldResult?.accuracy ?? null,
        total_time_ms: behavioralData.total_time_ms || 0,
        keystroke_count: behavioralData.keystroke_count || 0,
        paste_events: behavioralData.paste_events || 0,
        undo_events: behavioralData.undo_events || 0,
        preference_changes: behavioralData.preference_changes || 0,
        rating_changes: behavioralData.rating_changes || 0,
        total_tab_hidden_ms: behavioralData.total_tab_hidden_ms || 0,
        xp_earned: xpResult?.xp_earned || 0,
        leveled_up: !!xpResult?.leveledUp,
        new_level: xpResult?.newLevel || null,
        total_xp: xpResult?.total_xp || 0,
        certs_issued_count: Array.isArray(certsIssued) ? certsIssued.length : 0,
        trajectory: getTrajectorySummary(),
      });
      if (badgeEarned && badgeLevel) {
        telemetryCapture(TASK_EVENTS.TASK_BADGE_EARNED, {
          task_type: taskType,
          badge_type: config.badge_type,
          level: badgeLevel,
        });
      }
    } catch (telemetryErr) {
      console.warn('[useTaskSubmission] Telemetry emit failed (non-blocking):', telemetryErr);
    }

    return {
      taskId,
      qualityScore,
      badgeEarned: !!badgeEarned,
      badgeLevel: badgeLevel || null,
      xpResult, // null if user has no Nova agent, or on failure
      certsIssued, // array of newly-issued certificates (may be empty)
    };
  } catch (error) {
    console.error('[useTaskSubmission] Submission failed:', error);
    try {
      telemetryCapture(TASK_EVENTS.TASK_SUBMIT_FAILED, {
        task_type: taskType,
        error_message: String(error?.message || error).slice(0, 300),
      });
    } catch {
      /* noop */
    }
    throw error;
  }
}

// --- Internal helpers ---

/**
 * Compute a rolling behavioral signature by blending existing averages
 * with new data from this task submission.
 */
function computeRollingBehavioralSignature(existingSig, behavioralData, taskData, previousTotal) {
  const existing = existingSig || {
    avg_time_per_task_ms: 0,
    avg_rationale_length: 0,
    consistency_score: 0,
    thoroughness_score: 0,
  };

  const n = previousTotal || 0;
  const totalTime = behavioralData.total_time_ms || 0;

  // Rationale length — pull from taskData if it has a rationale field
  const rationaleText = taskData.rationale || taskData.native_reference || '';
  const rationaleLength = typeof rationaleText === 'string' ? rationaleText.length : 0;

  // Thoroughness heuristic: based on scroll depth, time distribution, and correction density
  const maxScrollDepths = behavioralData.max_scroll_depths || {};
  const scrollValues = Object.values(maxScrollDepths);
  const avgScrollDepth =
    scrollValues.length > 0 ? scrollValues.reduce((sum, d) => sum + d, 0) / scrollValues.length : 0;

  // Factor in time (longer = more thorough, up to a point), scroll depth, and keystroke activity
  const timeScore = Math.min(1, totalTime / (15 * 60 * 1000)); // caps at 15 min
  const inputScore = Math.min(1, (behavioralData.keystroke_count || 0) / 500);
  const thoroughness = avgScrollDepth * 0.4 + timeScore * 0.3 + inputScore * 0.3;

  // Rolling averages: new_avg = (old_avg * n + new_value) / (n + 1)
  const blend = (oldAvg, newVal) => (n > 0 ? (oldAvg * n + newVal) / (n + 1) : newVal);

  return {
    avg_time_per_task_ms: Math.round(blend(existing.avg_time_per_task_ms, totalTime)),
    avg_rationale_length: Math.round(blend(existing.avg_rationale_length, rationaleLength)),
    consistency_score: existing.consistency_score, // requires cross-task comparison, updated by quality grading agent
    thoroughness_score: Math.round(blend(existing.thoroughness_score, thoroughness) * 100) / 100,
  };
}

/**
 * Recursively replace undefined values with null so Firestore doesn't reject the write.
 * Firestore's setDoc() throws on any undefined field anywhere in the document tree.
 */
function deepStripUndefined(obj) {
  if (Array.isArray(obj)) return obj.map(deepStripUndefined);
  if (obj !== null && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = v === undefined ? null : deepStripUndefined(v);
    }
    return out;
  }
  return obj;
}

/**
 * Update the badges array with a new or upgraded badge entry.
 * Returns the full updated array.
 */
function updateBadgesArray(existingBadges, badgeType, badgeLevel, tasksCompleted, avgQuality, now) {
  if (!badgeLevel) return existingBadges;

  // Remove any existing entry for this badge type (upgrade replaces)
  const filtered = existingBadges.filter((b) => b.badge_type !== badgeType);

  filtered.push({
    badge_type: badgeType,
    level: badgeLevel,
    earned_at: now,
    tasks_completed: tasksCompleted,
    avg_quality_score: Math.round(avgQuality * 100) / 100,
  });

  return filtered;
}
