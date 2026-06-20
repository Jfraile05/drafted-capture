/**
 * Quality Scoring for Credential Tasks
 * Computes 0-100 quality scores using heuristic analysis
 */

/**
 * Levenshtein edit distance between two strings
 */
export function editDistance(a, b) {
  if (!a || !b) return Math.max((a || '').length, (b || '').length);
  const m = a.length,
    n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function clamp(val, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(val)));
}

function timeScore(ms, minGood, maxGood) {
  if (ms < minGood * 0.3) return 10; // way too fast, suspicious
  if (ms < minGood) return 40 + (ms / minGood) * 30; // fast but plausible
  if (ms <= maxGood) return 80 + ((ms - minGood) / (maxGood - minGood)) * 20; // ideal
  return Math.max(50, 100 - ((ms - maxGood) / maxGood) * 30); // too slow, diminishing
}

/**
 * RLHF Preference Ranking quality score
 */
export function computeRLHFQuality(taskData, behavioralData) {
  let score = 0;

  // Rationale quality (30%) — length, specificity
  const rationale = taskData.rationale || '';
  const rationaleLen = rationale.length;
  let rationaleScore = 0;
  if (rationaleLen >= 150) rationaleScore = 100;
  else if (rationaleLen >= 100) rationaleScore = 85;
  else if (rationaleLen >= 50) rationaleScore = 60;
  else if (rationaleLen >= 20) rationaleScore = 30;
  score += rationaleScore * 0.3;

  // Behavioral signals (30%) — time, scroll depth, engagement
  const totalTime = behavioralData?.total_time_ms || 0;
  const behaviorScore = timeScore(totalTime, 60000, 600000); // 1-10 min ideal
  const scrollA = behavioralData?.scroll_depths?.response_a || 0;
  const scrollB = behavioralData?.scroll_depths?.response_b || 0;
  const scrollScore =
    ((scrollA >= 0.7 ? 100 : scrollA * 130) + (scrollB >= 0.7 ? 100 : scrollB * 130)) / 2;
  score += ((behaviorScore + scrollScore) / 2) * 0.3;

  // Rating completeness (20%) — all 8 dimensions filled
  const dims = taskData.dimension_ratings || {};
  const aRatings = dims.response_a || {};
  const bRatings = dims.response_b || {};
  const filledCount = ['helpfulness', 'accuracy', 'safety', 'instruction_following'].reduce(
    (count, dim) => {
      return count + (aRatings[dim] ? 1 : 0) + (bRatings[dim] ? 1 : 0);
    },
    0,
  );
  score += (filledCount / 8) * 100 * 0.2;

  // Preference decisiveness (20%) — made a clear choice, didn't just default
  let prefScore = 70; // base for making any choice
  if (taskData.preference === 'tie') prefScore = 50; // ties are less informative
  if (behavioralData?.preference_changes > 0) prefScore += 15; // deliberation is good
  if (totalTime > 90000) prefScore += 15; // took time
  score += clamp(prefScore) * 0.2;

  return clamp(score);
}

/**
 * Computer Use Trajectory quality score
 *
 * Scoring mirrors what Amazon AGI / Anthropic / OpenAI look for:
 * - Action diversity (navigate, click, type, scroll, key)
 * - Thought quality (chain-of-thought length + specificity)
 * - Coordinate coverage (click steps with marked coordinates)
 * - URL diversity (distinct sites navigated)
 * - Summary depth and time investment
 */
export function computeComputerUseQuality(taskData, behavioralData) {
  let score = 0;

  const completion = taskData.completion || {};
  const trajectory = taskData.trajectory || {};
  const steps = trajectory.steps || [];

  // 1. Task completion (30%)
  if (completion.status === 'completed') score += 30;
  else if (completion.status === 'impossible') score += 15;
  else score += 3;

  // 2. Trajectory action diversity (25%) — labs want varied action types
  const actionTypes = new Set(
    steps.map((s) => s.action?.action_type || s.action_type).filter(Boolean),
  );
  // 5 pts per unique action type, up to 25 (5 types × 5pts)
  score += Math.min(25, actionTypes.size * 5);

  // 3. Thought quality (20%) — chain-of-thought is the key training signal
  const thoughts = steps.map((s) => (s.thought || '').trim()).filter(Boolean);
  const avgThoughtLen =
    thoughts.length > 0 ? thoughts.reduce((sum, t) => sum + t.length, 0) / thoughts.length : 0;
  const thoughtCoverage = steps.length > 0 ? thoughts.length / steps.length : 0;
  let thoughtScore = 0;
  if (thoughtCoverage >= 1.0) thoughtScore += 10; // all steps have thoughts
  if (avgThoughtLen >= 30)
    thoughtScore += 10; // substantive thoughts
  else if (avgThoughtLen >= 15) thoughtScore += 5;
  score += thoughtScore;

  // 4. Coordinate coverage for click actions (10%)
  const clickSteps = steps.filter((s) => (s.action?.action_type || s.action_type) === 'click');
  const coordSteps = clickSteps.filter((s) => s.action?.coordinate || s.coordinate);
  const coordCoverage = clickSteps.length > 0 ? coordSteps.length / clickSteps.length : 1;
  score += coordCoverage * 10;

  // 5. URL diversity (10%) — collected from navigate actions and thought text
  const urlsVisited = trajectory.urls_visited || [];
  if (urlsVisited.length >= 3) score += 10;
  else if (urlsVisited.length >= 1) score += 5;
  else {
    // Fallback: count navigate actions as a proxy
    const navCount = steps.filter(
      (s) => (s.action?.action_type || s.action_type) === 'navigate',
    ).length;
    if (navCount >= 2) score += 5;
  }

  // 6. Summary depth (10%)
  const summary = completion.summary || '';
  if (summary.length >= 100) score += 10;
  else if (summary.length >= 50) score += 7;
  else if (summary.length >= 20) score += 3;

  // 7. Time investment (5%) — minimum engagement check
  const totalTime = behavioralData?.total_time_ms || 0;
  const behaviorScore = timeScore(totalTime, 120000, 900000); // 2–15 min ideal
  score += behaviorScore * 0.05;

  return clamp(score);
}

/**
 * Multilingual Evaluation quality score
 */
export function computeMultilingualQuality(taskData, behavioralData) {
  let score = 0;

  // Error detection (30%) — found errors, classified them
  const errors = taskData.error_annotations || [];
  let errorScore = 0;
  if (errors.length > 0) {
    errorScore += 50;
    if (errors.every((e) => e.correction && e.error_type)) errorScore += 30;
    if (errors.some((e) => e.severity === 'critical' || e.severity === 'major')) errorScore += 20;
  } else {
    // No errors found — check if ratings are all 5 (suspicious)
    const dims = taskData.dimension_ratings || {};
    const allPerfect =
      dims.fluency === 5 &&
      dims.accuracy === 5 &&
      dims.cultural_appropriateness === 5 &&
      dims.formality_match === 5;
    errorScore = allPerfect ? 20 : 60; // no errors + not perfect ratings = might be correct
  }
  score += clamp(errorScore) * 0.3;

  // Gold reference quality (30%)
  const nativeRef = taskData.native_reference || '';
  const targetText = taskData.target?.text || '';
  let refScore = 0;
  if (nativeRef.length >= 20) {
    refScore += 50;
    const dist = editDistance(nativeRef, targetText);
    const normalizedDist = targetText.length > 0 ? dist / targetText.length : 0;
    if (normalizedDist > 0.1) refScore += 30; // meaningfully different
    if (normalizedDist > 0.3) refScore += 20; // substantially rewritten
  }
  score += clamp(refScore) * 0.3;

  // Rating consistency (20%) — ratings align with error count
  const dims = taskData.dimension_ratings || {};
  const avgRating =
    ((dims.fluency || 3) +
      (dims.accuracy || 3) +
      (dims.cultural_appropriateness || 3) +
      (dims.formality_match || 3)) /
    4;
  const hasErrors = errors.length > 0;
  let consistencyScore = 70;
  if (hasErrors && avgRating < 4) consistencyScore = 100; // errors found + lower ratings = consistent
  if (!hasErrors && avgRating >= 4) consistencyScore = 90; // no errors + high ratings = consistent
  if (hasErrors && avgRating >= 4.5) consistencyScore = 30; // errors + perfect ratings = suspicious
  if (!hasErrors && avgRating < 2) consistencyScore = 30; // no errors + low ratings = suspicious
  score += consistencyScore * 0.2;

  // Behavioral signals (20%)
  const totalTime = behavioralData?.total_time_ms || 0;
  const behaviorScore = timeScore(totalTime, 120000, 720000); // 2-12 min ideal
  score += behaviorScore * 0.2;

  return clamp(score);
}

/**
 * Reasoning Verification quality score
 */
export function computeReasoningQuality(taskData, behavioralData) {
  let score = 0;

  // Step verification completeness (40%)
  const verifications = taskData.step_verifications || [];
  const totalSteps = taskData.ai_solution?.steps?.length || 1;
  const verifiedCount = verifications.length;
  let verifyScore = (verifiedCount / totalSteps) * 60;
  // Bonus for corrections on incorrect steps
  const corrections = verifications.filter((v) => v.verdict !== 'correct' && v.correct_step);
  verifyScore += Math.min(20, corrections.length * 10);
  // Bonus for error type classification
  const classified = verifications.filter((v) => v.verdict !== 'correct' && v.error_type);
  verifyScore += Math.min(20, classified.length * 10);
  score += clamp(verifyScore) * 0.4;

  // Correction quality (25%)
  let correctionScore = 60; // base
  if (corrections.length > 0) {
    const avgCorrectionLen =
      corrections.reduce((sum, c) => sum + (c.correct_step || '').length, 0) / corrections.length;
    if (avgCorrectionLen >= 50) correctionScore = 100;
    else if (avgCorrectionLen >= 20) correctionScore = 80;
  }
  // Penalize if all steps marked correct with no engagement
  const allCorrect = verifications.every((v) => v.verdict === 'correct');
  if (allCorrect && verifications.length === totalSteps) correctionScore = 50;
  score += correctionScore * 0.25;

  // Confidence calibration (15%)
  const avgConfidence =
    verifications.reduce((sum, v) => sum + (v.confidence || 3), 0) /
    Math.max(1, verifications.length);
  let confScore = 70;
  if (avgConfidence >= 2 && avgConfidence <= 4.5) confScore = 90; // not all 5s or all 1s
  if (verifications.some((v) => v.confidence === 5) && verifications.some((v) => v.confidence <= 3))
    confScore = 100; // varied
  score += confScore * 0.15;

  // Behavioral signals (20%)
  const totalTime = behavioralData?.total_time_ms || 0;
  const behaviorScore = timeScore(totalTime, 180000, 1080000); // 3-18 min ideal
  const timePerStep = behavioralData?.time_per_step_ms || [];
  const avgStepTime =
    timePerStep.length > 0
      ? timePerStep.reduce((a, b) => a + b, 0) / timePerStep.length
      : totalTime / totalSteps;
  const stepTimeScore = avgStepTime >= 15000 ? 100 : avgStepTime >= 5000 ? 70 : 30; // min 15s/step ideal
  score += ((behaviorScore + stepTimeScore) / 2) * 0.2;

  return clamp(score);
}

/**
 * Red-Teaming / Adversarial Evaluation quality score
 */
export function computeRedTeamingQuality(taskData, behavioralData) {
  let score = 0;

  // Classification quality (30%) — attack vector + harm category filled and consistent
  let classificationScore = 0;
  if (taskData.attack_vector) {
    classificationScore += 50;
    if (taskData.attack_vector === 'none') {
      // No attack — harm_category should be null/empty (consistency)
      classificationScore += !taskData.harm_category ? 50 : 20;
    } else {
      // Attack detected — harm_category should be filled
      classificationScore += taskData.harm_category ? 50 : 10;
    }
  }
  score += clamp(classificationScore) * 0.3;

  // Rating completeness + nuance (25%)
  const ratings = taskData.response_ratings || {};
  const ratingKeys = [
    'refusal_appropriateness',
    'response_helpfulness',
    'safety_effectiveness',
    'tone_quality',
    'reasoning_integrity',
    'pressure_resistance',
    'counterfactual_uplift',
  ];
  const ratingValues = ratingKeys.map((k) => ratings[k]).filter((v) => v != null);
  const filledRatings = ratingValues.length;
  const hasDifficulty = taskData.attack_difficulty != null;
  // Base score: all 7 dims + difficulty = 8 total slots
  let ratingScore = ((filledRatings + (hasDifficulty ? 1 : 0)) / 8) * 70;
  // Nuance bonus: std deviation across ratings reflects discriminating judgment
  // All same value = lazy signal; meaningful spread = careful evaluation
  if (ratingValues.length >= 4) {
    const mean = ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length;
    const stdDev = Math.sqrt(
      ratingValues.reduce((a, b) => a + (b - mean) ** 2, 0) / ratingValues.length,
    );
    if (stdDev >= 1.5)
      ratingScore += 30; // clear distinctions across dimensions
    else if (stdDev >= 0.8) ratingScore += 15;
    else if (stdDev < 0.3) ratingScore -= 10; // all same value — low effort
  }
  score += clamp(ratingScore) * 0.25;

  // Analysis quality (25%) — length, not copy-pasted
  const analysis = taskData.analysis || '';
  const analysisLen = analysis.length;
  let analysisScore = 0;
  if (analysisLen >= 250) analysisScore = 100;
  else if (analysisLen >= 150) analysisScore = 80;
  else if (analysisLen >= 80) analysisScore = 60;
  else if (analysisLen >= 30) analysisScore = 30;
  // Penalize if analysis is too similar to the prompt text (copy-paste)
  if (taskData.adversarial_prompt) {
    const dist = editDistance(analysis.slice(0, 100), taskData.adversarial_prompt.slice(0, 100));
    if (dist < 20) analysisScore = Math.max(0, analysisScore - 40);
  }
  score += clamp(analysisScore) * 0.25;

  // Behavioral signals (20%) — time, scroll depth, keystroke count
  const totalTime = behavioralData?.total_time_ms || 0;
  const behaviorScore = timeScore(totalTime, 120000, 600000); // 2-10 min ideal
  const scrollDepths = behavioralData?.max_scroll_depths || {};
  const scrollValues = Object.values(scrollDepths);
  const avgScroll =
    scrollValues.length > 0 ? scrollValues.reduce((a, b) => a + b, 0) / scrollValues.length : 0;
  const scrollScore = avgScroll >= 0.7 ? 100 : avgScroll * 130;
  score += ((behaviorScore + scrollScore) / 2) * 0.2;

  return clamp(score);
}

/**
 * Tool Call / Agentic Trace Evaluation quality score
 */
export function computeToolCallQuality(taskData, behavioralData) {
  let score = 0;

  // Step evaluation completeness (35%) — all steps evaluated with all 3 verdicts
  const stepEvals = taskData.step_evaluations || [];
  const totalSteps = taskData.agent_trace?.total_steps || stepEvals.length || 1;
  const fullyEvaluated = stepEvals.filter(
    (s) => s.tool_selection && s.parameter_accuracy && s.result_interpretation,
  ).length;
  let stepScore = (fullyEvaluated / totalSteps) * 70;
  // Bonus for error explanations on flagged steps
  const stepsWithErrors = stepEvals.filter(
    (s) =>
      s.tool_selection !== 'correct' ||
      s.parameter_accuracy !== 'correct' ||
      s.result_interpretation !== 'correct',
  );
  const stepsWithExplanations = stepsWithErrors.filter((s) => (s.explanation || '').length >= 10);
  if (stepsWithErrors.length > 0) {
    stepScore += (stepsWithExplanations.length / stepsWithErrors.length) * 30;
  } else {
    stepScore += 30; // All correct with no errors to explain
  }
  score += clamp(stepScore) * 0.35;

  // Overall assessment completeness (25%)
  const overall = taskData.overall_evaluation || {};
  const overallRatingKeys = [
    'tool_selection_quality',
    'parameter_accuracy',
    'result_interpretation',
    'efficiency',
    'overall_trace_quality',
  ];
  const filledOverall = overallRatingKeys.filter((k) => overall[k] != null).length;
  const hasTaskSuccess = overall.task_success !== undefined && overall.task_success !== null;
  let overallScore = ((filledOverall + (hasTaskSuccess ? 1 : 0)) / 6) * 70;
  // Consistency: if many step errors, task_success should be false and overall ratings lower
  const errorRate = totalSteps > 0 ? stepsWithErrors.length / totalSteps : 0;
  if (errorRate > 0.5 && overall.task_success === false) overallScore += 30;
  else if (errorRate <= 0.2 && overall.task_success === true) overallScore += 30;
  else if (errorRate > 0.5 && overall.task_success === true)
    overallScore += 5; // inconsistent
  else overallScore += 15;
  score += clamp(overallScore) * 0.25;

  // Annotation consistency (20%) — step verdicts align with overall ratings
  let consistencyScore = 70;
  if (totalSteps > 0 && overallRatingKeys.every((k) => overall[k] != null)) {
    const avgOverall =
      overallRatingKeys.reduce((sum, k) => sum + (overall[k] || 3), 0) / overallRatingKeys.length;
    // If many errors but high overall ratings → inconsistent
    if (errorRate > 0.5 && avgOverall > 4) consistencyScore = 20;
    // If few errors and high ratings → consistent
    else if (errorRate <= 0.2 && avgOverall >= 3.5) consistencyScore = 100;
    // If many errors and low ratings → consistent
    else if (errorRate > 0.3 && avgOverall <= 3) consistencyScore = 100;
    else consistencyScore = 70;
  }
  score += consistencyScore * 0.2;

  // Behavioral signals (20%) — time, per-step timing
  const totalTime = behavioralData?.total_time_ms || 0;
  const behaviorScore = timeScore(totalTime, 180000, 1080000); // 3-18 min ideal
  const timePerStep = behavioralData?.time_per_step_ms || [];
  const avgStepTime =
    timePerStep.length > 0
      ? timePerStep.reduce((a, b) => a + b, 0) / timePerStep.length
      : totalTime / totalSteps;
  const stepTimeScore = avgStepTime >= 10000 ? 100 : avgStepTime >= 5000 ? 70 : 30;
  score += ((behaviorScore + stepTimeScore) / 2) * 0.2;

  return clamp(score);
}

/**
 * Code Review quality score
 */
export function computeCodeReviewQuality(taskData, behavioralData) {
  let score = 0;

  // Bug identification quality (35%) — did they find real issues with proper annotation?
  const bugs = taskData.bugs_identified || [];
  let bugScore = 0;
  if (bugs.length === 0) {
    bugScore = 5; // found nothing — very suspicious
  } else {
    bugScore += Math.min(50, bugs.length * 25); // 1 bug = 25, 2 = 50 (capped)
    const allComplete = bugs.every(
      (b) => b.type && b.severity && (b.description || '').length >= 10,
    );
    if (allComplete) bugScore += 30;
    const avgDescLen = bugs.reduce((s, b) => s + (b.description || '').length, 0) / bugs.length;
    if (avgDescLen >= 50) bugScore += 20;
    if (bugs.some((b) => b.severity === 'critical')) bugScore += 10;
  }
  score += clamp(bugScore) * 0.35;

  // Code modification quality (30%) — did they actually fix something meaningful?
  const original = taskData.original_code || '';
  const submitted = taskData.submitted_code || '';
  const dist = editDistance(original.slice(0, 500), submitted.slice(0, 500)); // sample for perf
  const changeRatio = original.length > 0 ? dist / original.length : 0;
  let changeScore = 0;
  if (changeRatio === 0)
    changeScore = 0; // no change at all
  else if (changeRatio < 0.02)
    changeScore = 20; // trivial whitespace/typo
  else if (changeRatio < 0.05)
    changeScore = 50; // minor fix
  else if (changeRatio < 0.15)
    changeScore = 80; // solid fix
  else changeScore = 100; // comprehensive rewrite
  score += changeScore * 0.3;

  // Explanation quality (25%)
  const explanation = taskData.explanation || '';
  let explainScore = 0;
  if (explanation.length >= 200) explainScore = 100;
  else if (explanation.length >= 120) explainScore = 80;
  else if (explanation.length >= 80) explainScore = 60;
  else if (explanation.length >= 40) explainScore = 35;
  // Penalize if explanation is nearly identical to original code (copy-paste)
  if (original.length > 20) {
    const explainDist = editDistance(explanation.slice(0, 100), original.slice(0, 100));
    if (explainDist < 15) explainScore = Math.max(0, explainScore - 40);
  }
  score += clamp(explainScore) * 0.25;

  // Behavioral signals (10%) — time + keystroke count
  const totalTime = behavioralData?.total_time_ms || 0;
  const behaviorScore = timeScore(totalTime, 240000, 900000); // 4-15 min ideal
  const keystrokes = behavioralData?.keystroke_count || 0;
  const keystrokeScore = keystrokes >= 100 ? 100 : keystrokes >= 30 ? 70 : 30;
  score += ((behaviorScore + keystrokeScore) / 2) * 0.1;

  return clamp(score);
}

/**
 * Main dispatcher — compute quality for any task type
 */
export function computeCreativeWritingQuality(taskData, behavioralData) {
  let score = 0;
  const response = taskData.response || '';
  const len = response.length;

  // Length quality (35%) — meets the prompt's range
  const minLen = taskData.min_length || 40;
  const maxLen = taskData.max_length || 400;
  if (len >= minLen && len <= maxLen) {
    score += 100 * 0.35;
  } else if (len >= minLen * 0.6) {
    score += 60 * 0.35;
  } else if (len > 10) {
    score += 25 * 0.35;
  }

  // Substance (30%) — sentence count, vocabulary variety
  const sentences = response.split(/[.!?]+/).filter((s) => s.trim().length > 3).length;
  const words = response.split(/\s+/).filter(Boolean);
  const uniqueWords = new Set(words.map((w) => w.toLowerCase())).size;
  const vocabRatio = words.length > 0 ? uniqueWords / words.length : 0;
  const substanceScore = clamp((Math.min(sentences, 8) / 8) * 50 + vocabRatio * 50);
  score += substanceScore * 0.3;

  // Behavioral signals (20%) — time spent
  const totalTime = behavioralData?.total_time_ms || 0;
  score += timeScore(totalTime, 30000, 480000) * 0.2;

  // Effort (15%) — keystroke density, no paste-only
  const keystrokes = behavioralData?.keystroke_count || 0;
  const pastes = behavioralData?.paste_events || 0;
  const effortScore =
    keystrokes > len * 0.5
      ? 100
      : keystrokes > len * 0.2
        ? 70
        : pastes > 0 && keystrokes < 10
          ? 15
          : 40;
  score += effortScore * 0.15;

  return clamp(score);
}

/**
 * Agent Workflow Evaluation quality score
 */
export function computeAgentWorkflowQuality(taskData, behavioralData) {
  let score = 0;

  const evaluation = taskData.evaluation || {};
  const errors = evaluation.error_annotations || [];
  const correctOutput = evaluation.correct_output || '';
  const agentOutput = taskData.workflow?.agent_final_output || '';
  const difficulty = taskData.workflow?.difficulty || 'medium';

  // Time spent (20%) — enterprise evals require adequate review time
  const totalTime = behavioralData?.total_time_ms || 0;
  const behaviorScore = timeScore(totalTime, 90000, 480000); // 1.5-8 min ideal
  score += behaviorScore * 0.2;

  // Evaluation completeness (20%) — required fields filled with corrections on errors
  let completenessScore = 0;
  if (evaluation.task_completed !== undefined && evaluation.task_completed !== null)
    completenessScore += 20;
  if (evaluation.output_accuracy != null) completenessScore += 15;
  if (evaluation.output_appropriateness != null) completenessScore += 15;
  if (evaluation.would_need_human_review !== undefined) completenessScore += 10;
  if ((evaluation.evaluator_notes || '').length >= 50) completenessScore += 20;
  if (evaluation.domain_confidence != null) completenessScore += 10;
  // Bonus: all error annotations have corrections
  if (errors.length > 0 && errors.every((e) => e.correction && e.error_type))
    completenessScore += 10;
  score += clamp(completenessScore) * 0.2;

  // Gold reference quality (25%) — correct_output should differ meaningfully from agent output when errors found
  let refScore = 0;
  if (correctOutput.length >= 30) {
    refScore += 50;
    const dist = editDistance(correctOutput.slice(0, 200), agentOutput.slice(0, 200));
    const normalizedDist = agentOutput.length > 0 ? dist / Math.min(agentOutput.length, 200) : 0;
    if (errors.length > 0 && normalizedDist > 0.15)
      refScore += 30; // errors found + meaningfully different reference
    else if (errors.length === 0 && normalizedDist < 0.1)
      refScore += 30; // no errors + similar = plausibly correct
    else if (errors.length > 0 && normalizedDist < 0.05)
      refScore -= 20; // errors found but reference is identical = suspicious
    else refScore += 15;
  }
  score += clamp(refScore) * 0.25;

  // Annotation density (20%) — errors found should match difficulty; 0 errors on hard = suspicious
  let densityScore = 70;
  const errorCount = errors.length;
  if (difficulty === 'hard') {
    if (errorCount >= 2) densityScore = 100;
    else if (errorCount === 1) densityScore = 75;
    else if (evaluation.task_completed === true && evaluation.output_accuracy >= 4)
      densityScore = 70; // plausibly correct
    else densityScore = 25; // hard task, 0 errors, bad rating — inconsistent
  } else if (difficulty === 'medium') {
    if (errorCount >= 1) densityScore = 90;
    else if (evaluation.output_accuracy >= 4)
      densityScore = 80; // no errors + good rating = consistent
    else densityScore = 40;
  } else {
    densityScore = errorCount === 0 ? 85 : 100; // easy tasks may genuinely have no errors
  }
  score += clamp(densityScore) * 0.2;

  // Internal consistency (15%) — penalize contradictory verdicts
  let consistencyScore = 70;
  const completed = evaluation.task_completed;
  const accuracy = evaluation.output_accuracy || 3;
  if (completed === true && accuracy >= 4 && errorCount === 0)
    consistencyScore = 100; // consistent: good task, good output, no errors
  else if (completed === false && errorCount >= 1)
    consistencyScore = 95; // consistent: failed, has errors
  else if (completed === true && accuracy >= 4 && errorCount >= 3)
    consistencyScore = 30; // suspicious: good rating but many errors
  else if (completed === false && errorCount === 0 && accuracy >= 4)
    consistencyScore = 25; // suspicious: failed but no errors and good rating
  else if (completed === true && accuracy <= 2 && errorCount >= 2) consistencyScore = 90; // consistent: completed but low quality with errors
  score += clamp(consistencyScore) * 0.15;

  return clamp(score);
}

export function computeQualityScore(taskType, taskData, behavioralData) {
  switch (taskType) {
    case 'rlhf_preference_ranking':
      return computeRLHFQuality(taskData, behavioralData);
    case 'computer_use_trajectory':
      return computeComputerUseQuality(taskData, behavioralData);
    case 'multilingual_evaluation':
      return computeMultilingualQuality(taskData, behavioralData);
    case 'process_supervision':
      return computeReasoningQuality(taskData, behavioralData);
    case 'red_teaming':
      return computeRedTeamingQuality(taskData, behavioralData);
    case 'tool_call_evaluation':
      return computeToolCallQuality(taskData, behavioralData);
    case 'code_review':
      return computeCodeReviewQuality(taskData, behavioralData);
    case 'creative_writing':
      return computeCreativeWritingQuality(taskData, behavioralData);
    case 'agent_workflow_evaluation':
      return computeAgentWorkflowQuality(taskData, behavioralData);
    default:
      return 50;
  }
}
