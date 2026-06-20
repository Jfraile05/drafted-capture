/**
 * Badge Computation for Credential Tasks
 * Determines badge levels based on task completion and quality
 */

const BADGE_REQUIREMENTS = {
  bronze: { tasks: 1, quality: 50, thoroughness: 0 },
  silver: { tasks: 5, quality: 70, thoroughness: 0 },
  gold: { tasks: 15, quality: 85, thoroughness: 75 },
};

// Computer use is harder — fewer tasks needed to earn each badge level.
const BADGE_REQUIREMENTS_COMPUTER_USE = {
  bronze: { tasks: 1, quality: 50, thoroughness: 0 },
  silver: { tasks: 3, quality: 70, thoroughness: 0 },
  gold: { tasks: 8, quality: 85, thoroughness: 75 },
};

const TASK_TYPE_BADGE_REQUIREMENTS = {
  computer_use_trajectory: BADGE_REQUIREMENTS_COMPUTER_USE,
};

const BADGE_NAMES = {
  rlhf_preference_ranking: 'RLHF Evaluator',
  computer_use_trajectory: 'Computer Use Demonstrator',
  multilingual_evaluation: 'Multilingual Evaluator',
  process_supervision: 'Reasoning Verifier',
  red_teaming: 'Red Team Analyst',
  tool_call_evaluation: 'Agentic Trace Evaluator',
};

const BADGE_ORDER = ['bronze', 'silver', 'gold'];

/**
 * Compute the badge level earned based on cumulative performance
 * @param {number} tasksCompleted - Total tasks of this type completed
 * @param {number} avgQualityScore - Average quality score (0-100)
 * @param {number} thoroughnessScore - Thoroughness metric (0-100)
 * @param {string} [taskType] - Optional task type to apply type-specific thresholds
 * @returns {'bronze' | 'silver' | 'gold' | null}
 */
export function computeBadgeLevel(
  tasksCompleted,
  avgQualityScore,
  thoroughnessScore = 50,
  taskType = null,
) {
  const req = TASK_TYPE_BADGE_REQUIREMENTS[taskType] || BADGE_REQUIREMENTS;
  if (
    tasksCompleted >= req.gold.tasks &&
    avgQualityScore >= req.gold.quality &&
    thoroughnessScore >= req.gold.thoroughness
  ) {
    return 'gold';
  }
  if (tasksCompleted >= req.silver.tasks && avgQualityScore >= req.silver.quality) {
    return 'silver';
  }
  if (tasksCompleted >= req.bronze.tasks && avgQualityScore >= req.bronze.quality) {
    return 'bronze';
  }
  return null;
}

/**
 * Check if a new badge level is higher than the current one
 * @param {string|null} currentBadge - Current badge level
 * @param {string|null} newLevel - New computed badge level
 * @returns {boolean} True if the badge level improved
 */
export function checkBadgeEarned(currentBadge, newLevel) {
  if (!newLevel) return false;
  if (!currentBadge) return true;
  return BADGE_ORDER.indexOf(newLevel) > BADGE_ORDER.indexOf(currentBadge);
}

/**
 * Get requirements for a specific badge level (default thresholds)
 */
export function getBadgeRequirements(level) {
  return BADGE_REQUIREMENTS[level] || null;
}

/**
 * Get badge requirements for a specific task type (uses type-specific thresholds if available)
 */
export function getBadgeRequirementsForType(taskType, level) {
  const req = TASK_TYPE_BADGE_REQUIREMENTS[taskType] || BADGE_REQUIREMENTS;
  return req[level] || null;
}

/**
 * Get the display name for a task type badge
 */
export function getBadgeName(taskType) {
  return BADGE_NAMES[taskType] || 'Task Specialist';
}

/**
 * Get all badge info for display
 */
export function getBadgeInfo(taskType) {
  const colors = {
    rlhf_preference_ranking: { accent: '#9B7FFF', label: 'Violet' },
    computer_use_trajectory: { accent: '#4DFFA0', label: 'Green' },
    multilingual_evaluation: { accent: '#F5A623', label: 'Orange' },
    process_supervision: { accent: '#00D4FF', label: 'Cyan' },
    red_teaming: { accent: '#FF6B6B', label: 'Red' },
    tool_call_evaluation: { accent: '#7C5CFC', label: 'Indigo' },
  };
  return {
    name: BADGE_NAMES[taskType] || 'Task Specialist',
    ...(colors[taskType] || { accent: '#00CFFF', label: 'Cyan' }),
  };
}
