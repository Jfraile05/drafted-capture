/**
 * Drafted Labs Certification Tiers
 *
 * Five tiers that map Nova XP + badge progression to shareable, verifiable
 * credentials. Each tier has an earn threshold deliberately tuned to student
 * psychology:
 *   - Tier 1 earns in ~1-2 hrs of good work (hook, dopamine loop)
 *   - Tier 2-3 reward specialization + breadth
 *   - Tier 4-5 are rare and gated by Nova XP *and* Gold badges
 *
 * Every certificate is written to certificates/{certId} and referenced
 * on drafted-accounts via an index. The verification page reads directly
 * from certificates — no auth required.
 */

import { levelForXp } from '../nova/levels';

// ─── Tier definitions ────────────────────────────────────────────
export const TIERS = [
  {
    id: 'computer_use_first_task',
    tier: 1,
    name: 'Certified Agent Instructor',
    short_name: 'Agent Instructor',
    tagline: 'You taught an AI agent how to use a computer.',
    accent: '#4DFFA0',
    computerUseOnly: true,
    skills: ['Computer Use Agent Training', 'Trajectory Annotation', 'Verified Task Instruction'],
    evidence_template: ({ taskCount, avgQuality }) =>
      `Verified computer-use agent instructor — recorded ${taskCount} annotated computer-use trajectory${taskCount === 1 ? '' : 's'} with ${avgQuality.toFixed(1)}/100 quality, demonstrating the ability to teach frontier AI agents how to navigate real software tasks end-to-end.`,
  },
  {
    id: 'computer_use_silver',
    tier: 2,
    name: 'AI-Native Specialist: Computer Use',
    short_name: 'Computer Use Specialist',
    tagline: 'Certified to train AI agents on real-world computer tasks.',
    accent: '#00E5A0',
    computerUseOnly: true,
    skills: [
      'Computer Use Agent Training',
      'Trajectory Annotation',
      'Agent Behavior Specification',
      'Human-in-the-loop Evaluation',
      'Verified Task Instruction',
    ],
    evidence_template: ({ taskCount, avgQuality }) =>
      `Demonstrated mastery in computer-use agent training — ${taskCount} verified computer-use trajectory${taskCount === 1 ? '' : 's'} completed with ${avgQuality.toFixed(1)}/100 accuracy. Certified to generate high-fidelity training signal for frontier agents operating in real software environments.`,
  },
  {
    id: 'computer_use_gold',
    tier: 3,
    name: 'AI-Native Agent Trainer: Computer Use',
    short_name: 'Agent Trainer',
    tagline: 'Gold-tier computer-use training data. Lab-grade. Verified.',
    accent: '#00C27A',
    computerUseOnly: true,
    skills: [
      'Computer Use Agent Training',
      'Trajectory Annotation',
      'Agent Behavior Specification',
      'Multi-step Task Decomposition',
      'Human-in-the-loop Evaluation',
      'Lab-Grade Training Data',
      'Verified Task Instruction',
    ],
    evidence_template: ({ taskCount, avgQuality }) =>
      `Gold-tier computer-use agent trainer — ${taskCount} verified trajectory${taskCount === 1 ? '' : 's'} completed at ${avgQuality.toFixed(1)}/100 quality. This practitioner generates lab-grade training signal for frontier computer-use agents, demonstrating expert-level task decomposition, instruction fidelity, and environment coverage across real software workflows.`,
  },
  {
    id: 'foundations',
    tier: 1,
    name: 'AI-Native Foundations',
    short_name: 'Foundations',
    tagline: 'Your journey training frontier AI begins here.',
    accent: '#2DA85F',
    skills: ['Model Training Data', 'Human Feedback Collection', 'Agent Training Basics'],
    evidence_template: ({ totalTasks, avgQuality }) =>
      `Verified expertise in foundational AI training — ${totalTasks} production task${totalTasks === 1 ? '' : 's'} completed with ${avgQuality.toFixed(1)}/100 quality, demonstrating hands-on capability in collecting and evaluating human feedback for frontier models.`,
  },
  {
    id: 'specialist',
    tier: 2,
    name: 'AI-Native Specialist: {BADGE_NAME}',
    short_name: '{BADGE_NAME} Specialist',
    tagline: 'Deep expertise in agent training and deployment.',
    accent: '#1E9B6A',
    specialization: true,
    skills: [],
    evidence_template: ({ taskCount, avgQuality, badgeType }) =>
      `Demonstrated mastery in specialized agent training — ${taskCount} verified ${badgeType} task${taskCount === 1 ? '' : 's'} completed with ${avgQuality.toFixed(1)}/100 accuracy, showing proficiency in ${badgeType.toLowerCase()} that directly enables frontier AI deployment.`,
  },
  {
    id: 'advanced',
    tier: 3,
    name: 'AI-Native Advanced',
    short_name: 'Advanced',
    tagline: 'Expert-level competency across multiple agent training vectors.',
    accent: '#1B7A5E',
    skills: [
      'Agent Training',
      'Model Evaluation',
      'Multi-modal Agents',
      'Deployment Validation',
      'Quality Assurance',
    ],
    evidence_template: ({ silverCount, totalTasks, avgQuality }) =>
      `Advanced AI-native expertise across ${silverCount} distinct agent training domains — ${totalTasks} verified task${totalTasks === 1 ? '' : 's'} completed with ${avgQuality.toFixed(1)}/100 aggregate quality. This credential recognizes practitioners capable of training and deploying agents across production frontiers.`,
  },
  {
    id: 'expert',
    tier: 4,
    name: 'AI-Native Expert',
    short_name: 'Expert',
    tagline: 'Top-tier mastery in AI-native agent infrastructure.',
    accent: '#136B52',
    skills: [
      'Agent Architecture',
      'Training Deployment',
      'Multi-Modal Systems',
      'Frontier Model Integration',
      'Production Deployment',
      'Agent Evaluation',
      'AI Safety & Alignment',
      'Quality at Scale',
    ],
    evidence_template: ({ totalTasks, avgQuality, novaLevel, goldBadges }) =>
      `Expert-level AI-native mastery — Nova Level ${novaLevel} achievement (${totalTasks}+ verified task${totalTasks === 1 ? '' : 's'}, ${avgQuality.toFixed(1)}/100 quality) with Gold-tier excellence in ${goldBadges} agent training domain${goldBadges === 1 ? '' : 's'}. Top-decile contributor capable of architecting and deploying production agent systems on frontier models.`,
  },
];

// Map badge_type → normalized skill tags (used for Tier 2 specialist certs)
const BADGE_SKILL_MAP = {
  'RLHF Evaluator': [
    'RLHF',
    'Preference Ranking',
    'Model Evaluation',
    'Human-in-the-loop Evaluation',
  ],
  'Computer Use Demonstrator': [
    'Computer Use Agents',
    'Trajectory Annotation',
    'Agent Training Data',
    'Human-in-the-loop Evaluation',
  ],
  'Multilingual Evaluator': [
    'Multilingual Evaluation',
    'Translation Quality',
    'Cross-lingual NLP',
    'Native-language Annotation',
  ],
  'Reasoning Verifier': [
    'Process Supervision',
    'Chain-of-thought Verification',
    'Step-level Annotation',
    'Model Evaluation',
  ],
  'Red Team Analyst': ['Red Teaming', 'AI Safety', 'Adversarial Testing', 'Model Evaluation'],
  'Agentic Trace Evaluator': [
    'Tool Use Evaluation',
    'Agent Traces',
    'Function Calling',
    'Model Evaluation',
  ],
};

// ─── Threshold evaluation ────────────────────────────────────────

/**
 * Count silver+ and gold badges in the annotator profile.
 */
function countBadges(badges) {
  const bAry = Array.isArray(badges) ? badges : [];
  let silver = 0;
  let gold = 0;
  for (const b of bAry) {
    if (b.level === 'gold') gold += 1;
    if (b.level === 'silver' || b.level === 'gold') silver += 1;
  }
  return { silver, gold };
}

/**
 * Get all silver+ badges grouped by badge_type (for Tier 2 specialist certs).
 */
function getSilverOrHigherBadges(badges) {
  const bAry = Array.isArray(badges) ? badges : [];
  return bAry.filter((b) => b.level === 'silver' || b.level === 'gold');
}

/**
 * Evaluate all tiers a user currently qualifies for.
 *
 * @param {object} input
 * @param {object} input.annotatorProfile - from annotator_profiles/{email}
 * @param {number} input.totalXp - from nova_agents/{uid}.total_xp (0 if no agent)
 * @returns {Array<{id: string, tier: number, badge_type?: string}>}
 *   List of every cert the user qualifies for right now. The caller diffs
 *   this against already-issued certs to decide what to award.
 */
export function evaluateEarnedTiers({ annotatorProfile, totalXp = 0 }) {
  const profile = annotatorProfile || {};
  const totalTasks = profile.total_tasks_completed || 0;
  const avgQuality = profile.quality?.overall_avg || 0;
  const badges = profile.badges || [];
  const { silver, gold } = countBadges(badges);
  const novaLevel = levelForXp(totalXp).level;

  const earned = [];

  // ── Computer Use fast-track certificates ──────────────────────────
  const cuTaskCount = profile.tasks_by_type?.computer_use_trajectory || 0;
  const cuBadge = badges.find((b) => b.badge_type === 'Computer Use Demonstrator') || null;
  const cuBadgeLevel = cuBadge?.level || null;

  // Tier: Certified Agent Instructor — earned on completing the very first CU task
  if (cuTaskCount >= 1) {
    earned.push({ id: 'computer_use_first_task', tier: 1 });
  }

  // Tier: Computer Use Specialist — earned when CU badge reaches silver (3 tasks, quality ≥ 70)
  if (cuBadgeLevel === 'silver' || cuBadgeLevel === 'gold') {
    earned.push({ id: 'computer_use_silver', tier: 2 });
  }

  // Tier: Agent Trainer: Computer Use — earned when CU badge reaches gold (8 tasks, quality ≥ 85)
  if (cuBadgeLevel === 'gold') {
    earned.push({ id: 'computer_use_gold', tier: 3 });
  }

  // ── General track ─────────────────────────────────────────────────

  // Level 1 — Foundations: 5 tasks, avg quality ≥ 60
  if (totalTasks >= 5 && avgQuality >= 60) {
    earned.push({ id: 'foundations', tier: 1 });
  }

  // Level 2 — Specialist: one cert per badge_type at silver+
  const silverBadges = getSilverOrHigherBadges(badges);
  for (const b of silverBadges) {
    // Computer Use Demonstrator has its own dedicated CU-specific certs above
    if (b.badge_type === 'Computer Use Demonstrator') continue;
    earned.push({
      id: 'specialist',
      tier: 2,
      badge_type: b.badge_type,
      badge_level: b.level,
    });
  }

  // Level 3 — Advanced: silver+ in 3+ distinct task types
  if (silver >= 3) {
    earned.push({ id: 'advanced', tier: 3 });
  }

  // Level 4 — Expert: Nova level 8+ AND 2+ gold badges AND 50+ tasks
  if (novaLevel >= 8 && gold >= 2 && totalTasks >= 50) {
    earned.push({ id: 'expert', tier: 4 });
  }

  return earned;
}

/**
 * Return the next tier the user is working toward, with current progress.
 * Used by the /tasks/certificates page to show "N tasks away" bars.
 */
export function getNextTierProgress({ annotatorProfile, totalXp = 0, issuedCertIds = [] }) {
  const profile = annotatorProfile || {};
  const totalTasks = profile.total_tasks_completed || 0;
  const avgQuality = profile.quality?.overall_avg || 0;
  const badges = profile.badges || [];
  const { silver, gold } = countBadges(badges);
  const novaLevel = levelForXp(totalXp).level;
  const issued = new Set(issuedCertIds);

  const cuTaskCount = profile.tasks_by_type?.computer_use_trajectory || 0;
  const cuBadge = badges.find((b) => b.badge_type === 'Computer Use Demonstrator') || null;
  const cuBadgeLevel = cuBadge?.level || null;

  const candidates = [];

  if (!issued.has('computer_use_first_task')) {
    candidates.push({
      id: 'computer_use_first_task',
      label: 'Certified Agent Instructor',
      progress: cuTaskCount >= 1 ? 1 : 0,
      requirement: cuTaskCount >= 1 ? 'Earned' : 'Complete your first Computer Use task',
    });
  }

  if (
    !issued.has('computer_use_silver') &&
    (cuBadgeLevel === 'silver' || cuBadgeLevel === 'gold' || cuTaskCount > 0)
  ) {
    const needTasks = Math.max(0, 3 - cuTaskCount);
    candidates.push({
      id: 'computer_use_silver',
      label: 'Computer Use Specialist',
      progress: Math.min(1, cuTaskCount / 3),
      requirement:
        needTasks > 0
          ? `Complete ${needTasks} more Computer Use task${needTasks === 1 ? '' : 's'} at quality ≥70`
          : 'Improve quality to ≥70',
    });
  }

  if (!issued.has('computer_use_gold') && cuTaskCount > 0) {
    const needTasks = Math.max(0, 8 - cuTaskCount);
    candidates.push({
      id: 'computer_use_gold',
      label: 'Agent Trainer: Computer Use',
      progress: Math.min(1, cuTaskCount / 8),
      requirement:
        needTasks > 0
          ? `Complete ${needTasks} more Computer Use task${needTasks === 1 ? '' : 's'} at quality ≥85`
          : 'Improve quality to ≥85',
    });
  }

  if (!issued.has('foundations')) {
    candidates.push({
      id: 'foundations',
      label: 'AI-Native Foundations',
      progress: Math.min(1, totalTasks / 5) * 0.5 + Math.min(1, avgQuality / 60) * 0.5,
      requirement: `Complete ${Math.max(0, 5 - totalTasks)} more task${5 - totalTasks === 1 ? '' : 's'} at quality ≥60`,
    });
  }

  if (!issued.has('advanced')) {
    candidates.push({
      id: 'advanced',
      label: 'AI-Native Advanced',
      progress: Math.min(1, silver / 3),
      requirement: `Reach Silver in ${Math.max(0, 3 - silver)} more task type${3 - silver === 1 ? '' : 's'}`,
    });
  }

  if (!issued.has('expert')) {
    candidates.push({
      id: 'expert',
      label: 'AI-Native Expert',
      progress:
        (Math.min(1, novaLevel / 8) + Math.min(1, gold / 2) + Math.min(1, totalTasks / 50)) / 3,
      requirement: [
        novaLevel < 8 && `Nova Level 8 (currently ${novaLevel})`,
        gold < 2 && `${2 - gold} more Gold badge${2 - gold === 1 ? '' : 's'}`,
        totalTasks < 50 && `${50 - totalTasks} more task${50 - totalTasks === 1 ? '' : 's'}`,
      ]
        .filter(Boolean)
        .join(' · '),
    });
  }

  // Return the closest-to-earn cert first
  return candidates.sort((a, b) => b.progress - a.progress);
}

// ─── Cert document builders ──────────────────────────────────────

/**
 * Return the tier definition for a cert id.
 * For Tier 2 specialist certs, interpolates badge name into template fields.
 */
export function resolveTierDefinition({ id, badge_type }) {
  const base = TIERS.find((t) => t.id === id);
  if (!base) return null;

  if (id === 'specialist' && badge_type) {
    return {
      ...base,
      name: base.name.replace('{BADGE_NAME}', badge_type),
      short_name: base.short_name.replace('{BADGE_NAME}', badge_type),
      skills: BADGE_SKILL_MAP[badge_type] || base.skills,
    };
  }

  return base;
}

/**
 * Build the public credential ID used in verification URLs.
 * Format: DL-{TIER_CODE}-{YEAR}-{SHORT_UUID}
 */
export function buildCredentialCode(tierId, certUuid, badgeType) {
  const year = new Date().getFullYear();
  const short = certUuid.replace(/-/g, '').slice(0, 6).toUpperCase();

  const codeMap = {
    foundations: 'FND',
    specialist: 'SPC',
    advanced: 'ADV',
    expert: 'EXP',
    computer_use_first_task: 'CU1',
    computer_use_silver: 'CUS',
    computer_use_gold: 'CUG',
  };
  const tierCode = codeMap[tierId] || 'CERT';

  // Specialist certs append a badge shortcode for readability
  if (tierId === 'specialist' && badgeType) {
    const badgeShort =
      {
        'RLHF Evaluator': 'RLHF',
        'Computer Use Demonstrator': 'CU',
        'Multilingual Evaluator': 'MUL',
        'Reasoning Verifier': 'RSN',
        'Red Team Analyst': 'RED',
        'Agentic Trace Evaluator': 'AGT',
      }[badgeType] || 'GEN';
    return `DL-${tierCode}-${badgeShort}-${year}-${short}`;
  }

  return `DL-${tierCode}-${year}-${short}`;
}

/**
 * Build the evidence statement used on the PDF + verification page.
 */
export function buildEvidenceStatement({ id, badge_type, stats }) {
  const def = resolveTierDefinition({ id, badge_type });
  if (!def) return '';
  try {
    return def.evidence_template({ ...stats, badgeType: badge_type });
  } catch {
    return '';
  }
}
