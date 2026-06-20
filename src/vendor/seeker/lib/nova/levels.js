/**
 * Nova XP + Leveling system.
 *
 * Pure helpers — no React, no Firestore. Everything here is deterministic
 * so the same inputs always produce the same XP + level result.
 *
 * Design principles:
 * - Volume is always rewarded (base +10 XP per task, never negative)
 * - Quality is rewarded with a tiered bonus (0 / 5 / 15 / 30 / 50)
 * - XP is monotonic — past progress is never undone by a bad task
 * - Levels follow a Candy Crush curve (soft early, steep late)
 * - Difficulty pools gate prompt selection per level
 */

// ─── Level table ─────────────────────────────────────────────────
// Ten named levels, threshold = total_xp needed to *enter* that level.
// Colors map to BLOCK_PRESETS in app/nova/components/CompetingBlock.jsx.
export const LEVELS = [
  { level: 1, threshold: 0, name: 'Spark', color: 'white', tagline: 'First light.' },
  { level: 2, threshold: 50, name: 'Apprentice', color: 'lime', tagline: 'Getting the feel.' },
  { level: 3, threshold: 150, name: 'Trainer', color: 'lime', tagline: 'Your reps compound.' },
  { level: 4, threshold: 350, name: 'Annotator', color: 'cyan', tagline: 'Reliable signal.' },
  {
    level: 5,
    threshold: 700,
    name: 'Calibrator',
    color: 'cyan',
    tagline: 'Your judgment sharpens.',
  },
  {
    level: 6,
    threshold: 1200,
    name: 'Signal-smith',
    color: 'violet',
    tagline: 'The rubric bends to you.',
  },
  { level: 7, threshold: 2000, name: 'Evaluator', color: 'violet', tagline: 'Lab-grade work.' },
  {
    level: 8,
    threshold: 3000,
    name: 'Architect',
    color: 'amber',
    tagline: 'Building training data at scale.',
  },
  {
    level: 9,
    threshold: 4500,
    name: 'Artisan',
    color: 'amber',
    tagline: 'Precision becomes effortless.',
  },
  { level: 10, threshold: 6500, name: 'Luminary', color: 'crimson', tagline: 'Top of the curve.' },
];

export const MAX_NAMED_LEVEL = LEVELS[LEVELS.length - 1].level;

/**
 * For levels beyond the named table, generate a record on the fly.
 * Thresholds follow the same quadratic curve: each level costs ~500 more XP
 * than the previous gap (last gap is 6500-4500=2000, then +500 each step).
 * Colors cycle through the palette; names follow "Luminary II", "Luminary III"…
 */
export function getLevelEntry(level) {
  const lvl = Math.max(1, Math.round(level));
  const named = LEVELS.find((l) => l.level === lvl);
  if (named) return named;

  // Generate threshold for levels > 10 using escalating gaps
  // Last named gap: L9→L10 = 2000 XP. Each level beyond adds 500 XP to the gap.
  let threshold = 6500;
  let gap = 2000;
  for (let i = MAX_NAMED_LEVEL + 1; i <= lvl; i++) {
    gap += 500;
    threshold += gap;
  }

  const EXTENDED_COLORS = ['crimson', 'violet', 'amber', 'cyan', 'lime'];
  const color = EXTENDED_COLORS[(lvl - MAX_NAMED_LEVEL - 1) % EXTENDED_COLORS.length];
  const suffix =
    lvl - MAX_NAMED_LEVEL === 1
      ? 'II'
      : lvl - MAX_NAMED_LEVEL === 2
        ? 'III'
        : `${lvl - MAX_NAMED_LEVEL + 1}`;

  return {
    level: lvl,
    threshold,
    name: `Luminary ${suffix}`,
    color,
    tagline: 'Beyond the curve.',
  };
}

/**
 * Compute the XP threshold for any level (named or extended).
 */
export function thresholdForLevel(level) {
  return getLevelEntry(level).threshold;
}

/**
 * Compute threshold for the level AFTER a given level.
 */
export function thresholdForNextLevel(level) {
  return getLevelEntry(level + 1).threshold;
}

// ─── XP formula ──────────────────────────────────────────────────
export const XP_BASE = 10;
export const XP_GOLD_BONUS = 10;
export const XP_FIRST_OF_TYPE_BONUS = 20;

// Task types that earn a multiplier on all XP components.
// Computer use is the most demanding and strategically important task type.
export const TASK_XP_MULTIPLIERS = {
  computer_use_trajectory: 2,
};

/**
 * Quality tier → bonus XP. Bad tasks get nothing extra, but never negative.
 */
export function qualityBonusXp(qualityScore) {
  const s = Number(qualityScore) || 0;
  if (s < 50) return 0;
  if (s < 65) return 5;
  if (s < 80) return 15;
  if (s < 90) return 30;
  return 50;
}

/**
 * Compute XP for a single task submission.
 *
 * @param {object} args
 * @param {number} args.qualityScore - 0–100 from computeQualityScore()
 * @param {boolean} [args.isGold]
 * @param {number} [args.goldAccuracy] - 0–100 from goldEvaluation
 * @param {boolean} [args.isFirstOfType] - true when this is the agent's first task of this type
 * @param {string|null} [args.taskType] - task type key; used to apply per-type XP multipliers
 * @returns {{ taskXp: number, breakdown: object }}
 */
export function computeTaskXp({
  qualityScore,
  isGold = false,
  goldAccuracy = null,
  isFirstOfType = false,
  taskType = null,
}) {
  const base = XP_BASE;
  const quality = qualityBonusXp(qualityScore);
  const gold = isGold && goldAccuracy != null && goldAccuracy >= 70 ? XP_GOLD_BONUS : 0;
  const firstOfType = isFirstOfType ? XP_FIRST_OF_TYPE_BONUS : 0;
  const multiplier = (taskType && TASK_XP_MULTIPLIERS[taskType]) || 1;

  const taskXp = Math.round((base + quality + gold + firstOfType) * multiplier);

  return {
    taskXp,
    breakdown: { base, quality, gold, firstOfType, multiplier },
  };
}

// ─── Level resolution ────────────────────────────────────────────
/**
 * Find the current level state for a given total XP.
 * Levels are unbounded — once past L10 Luminary, extended levels generate
 * dynamically (Luminary II, III, IV…) with escalating XP gaps.
 *
 * Returns: { level, name, color, tagline, currentThreshold, nextThreshold,
 *            xpIntoLevel, xpForNextLevel, progress }
 * `isMax` is always false — there is no ceiling.
 */
export function levelForXp(totalXp) {
  const xp = Math.max(0, Number(totalXp) || 0);

  // Walk named levels first (most common path)
  let currentLevel = 1;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].threshold) {
      currentLevel = LEVELS[i].level;
      break;
    }
  }

  // Climb extended levels until we find the right one
  while (true) {
    const nextEntry = getLevelEntry(currentLevel + 1);
    if (xp < nextEntry.threshold) break;
    currentLevel++;
  }

  const current = getLevelEntry(currentLevel);
  const next = getLevelEntry(currentLevel + 1);

  const xpIntoLevel = xp - current.threshold;
  const xpForNextLevel = next.threshold - current.threshold;
  const progress = Math.min(1, xpIntoLevel / xpForNextLevel);

  return {
    level: current.level,
    name: current.name,
    color: current.color,
    tagline: current.tagline,
    currentThreshold: current.threshold,
    nextThreshold: next.threshold,
    nextName: next.name,
    xpIntoLevel,
    xpForNextLevel,
    progress,
    isMax: false,
  };
}

/**
 * Detect a level-up between two XP totals.
 * Returns { leveledUp: boolean, newLevel: number | null, prevLevel: number }
 */
export function didLevelUp(prevXp, nextXp) {
  const prev = levelForXp(prevXp).level;
  const now = levelForXp(nextXp).level;
  return {
    leveledUp: now > prev,
    newLevel: now > prev ? now : null,
    prevLevel: prev,
  };
}

// ─── Difficulty gating ───────────────────────────────────────────
/**
 * Probability weights for selecting a prompt's difficulty tier based on level.
 * Values sum to 1.0.
 *
 * Soft by design — the selector should fall back to adjacent tiers when the
 * picked bucket is empty (see promptBank.js widening logic).
 */
export function difficultyPoolForLevel(level) {
  const lvl = Number(level) || 1;
  if (lvl <= 2) return { easy: 1.0, medium: 0.0, hard: 0.0 };
  if (lvl <= 4) return { easy: 0.7, medium: 0.3, hard: 0.0 };
  if (lvl <= 6) return { easy: 0.2, medium: 0.6, hard: 0.2 };
  return { easy: 0.0, medium: 0.3, hard: 0.7 };
}

/**
 * Given weights and a random roll [0, 1), return the picked tier.
 * Separated so the caller (or tests) can inject a deterministic roll.
 */
export function pickDifficultyTier(weights, roll = Math.random()) {
  const tiers = ['easy', 'medium', 'hard'];
  let acc = 0;
  for (const t of tiers) {
    acc += weights[t] || 0;
    if (roll < acc) return t;
  }
  return tiers[tiers.length - 1];
}

// Adjacency for widening fallback — order matters (nearest first)
export const DIFFICULTY_WIDENING = {
  easy: ['easy', 'medium', 'hard'],
  medium: ['medium', 'easy', 'hard'],
  hard: ['hard', 'medium', 'easy'],
};
