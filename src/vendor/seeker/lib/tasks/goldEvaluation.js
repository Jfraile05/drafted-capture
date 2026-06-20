/**
 * Gold Standard Evaluation Functions
 *
 * Deterministic evaluation of student submissions against known-correct answers.
 * Pattern: OSWorld's getter-metric approach — extract outcome, compare against expected.
 *
 * Each function returns { accuracy: 0-100, details: { ...sub-scores } }
 */

import { editDistance } from './qualityScoring';

function clamp(val, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(val)));
}

// ─── RLHF Preference Ranking ────────────────────────────────────────────────

/**
 * Evaluate an RLHF preference submission against a gold standard.
 *
 * Gold expected_answer shape:
 * {
 *   correct_preference: 'response_a' | 'response_b',
 *   min_acceptable_ratings: { response_a: { helpfulness: 1-5, ... }, response_b: { ... } },
 *   rationale_must_mention: ['keyword1', 'keyword2'],
 * }
 *
 * Gold grading weights:
 * { preference_weight: 0.4, dimension_weight: 0.3, rationale_weight: 0.3 }
 */
export function evaluateRLHFGold(submission, goldStandard) {
  const expected = goldStandard.expected_answer;
  const weights = goldStandard.grading || {
    preference_weight: 0.4,
    dimension_weight: 0.3,
    rationale_weight: 0.3,
  };

  // 1. Preference correctness (binary)
  const preferenceCorrect = submission.preference === expected.correct_preference;
  const preferenceScore = preferenceCorrect ? 100 : 0;

  // 2. Dimension ratings in acceptable range
  const minRatings = expected.min_acceptable_ratings || {};
  const submittedRatings = submission.dimension_ratings || {};
  let ratingsInRange = 0;
  let totalDimensions = 0;

  for (const responseKey of ['response_a', 'response_b']) {
    const expectedMins = minRatings[responseKey] || {};
    const submitted = submittedRatings[responseKey] || {};
    for (const dim of ['helpfulness', 'accuracy', 'safety', 'instruction_following']) {
      if (expectedMins[dim] !== undefined) {
        totalDimensions++;
        // Rating is "in range" if it's at or above the minimum for the better response,
        // or at or below the maximum for the worse response
        if (responseKey === expected.correct_preference) {
          // Better response should have higher ratings
          if ((submitted[dim] || 0) >= expectedMins[dim]) ratingsInRange++;
        } else {
          // Worse response should have lower ratings (min here acts as max threshold)
          if ((submitted[dim] || 0) <= expectedMins[dim]) ratingsInRange++;
        }
      }
    }
  }
  const dimensionScore = totalDimensions > 0 ? (ratingsInRange / totalDimensions) * 100 : 50;

  // 3. Rationale mentions key concepts
  const keywords = expected.rationale_must_mention || [];
  const rationale = (submission.rationale || '').toLowerCase();
  let keywordsFound = 0;
  for (const keyword of keywords) {
    if (rationale.includes(keyword.toLowerCase())) keywordsFound++;
  }
  const rationaleScore = keywords.length > 0 ? (keywordsFound / keywords.length) * 100 : 50;

  // Weighted sum
  const accuracy = clamp(
    preferenceScore * weights.preference_weight +
      dimensionScore * weights.dimension_weight +
      rationaleScore * weights.rationale_weight,
  );

  return {
    accuracy,
    details: {
      preference_correct: preferenceCorrect,
      preference_score: preferenceScore,
      dimension_score: clamp(dimensionScore),
      dimensions_in_range: ratingsInRange,
      dimensions_total: totalDimensions,
      rationale_score: clamp(rationaleScore),
      keywords_found: keywordsFound,
      keywords_total: keywords.length,
    },
  };
}

// ─── Multilingual Evaluation ────────────────────────────────────────────────

/**
 * Evaluate a multilingual submission against a gold standard.
 *
 * Gold expected_answer shape:
 * {
 *   planted_errors: [{ type: 'grammar', location: 'sentence 2', severity: 'major', keyword: 'word' }],
 *   correct_rating_range: { fluency: [1, 3], accuracy: [2, 4], cultural_appropriateness: [3, 5], formality_match: [1, 3] },
 *   has_errors: true | false,
 * }
 */
export function evaluateMultilingualGold(submission, goldStandard) {
  const expected = goldStandard.expected_answer;
  const weights = goldStandard.grading || {
    error_detection_weight: 0.4,
    rating_weight: 0.3,
    false_positive_weight: 0.3,
  };

  const plantedErrors = expected.planted_errors || [];
  const submittedErrors = submission.error_annotations || [];

  // 1. Error detection — did they find the planted errors?
  let errorsDetected = 0;
  for (const planted of plantedErrors) {
    // Check if any submitted error matches (by keyword in correction/description, or error_type match)
    const found = submittedErrors.some((se) => {
      const matchesType =
        se.error_type &&
        planted.type &&
        se.error_type.toLowerCase().includes(planted.type.toLowerCase());
      const matchesKeyword =
        planted.keyword &&
        ((se.correction || '').toLowerCase().includes(planted.keyword.toLowerCase()) ||
          (se.text || '').toLowerCase().includes(planted.keyword.toLowerCase()));
      return matchesType || matchesKeyword;
    });
    if (found) errorsDetected++;
  }

  let errorDetectionScore;
  if (plantedErrors.length > 0) {
    errorDetectionScore = (errorsDetected / plantedErrors.length) * 100;
  } else {
    // No errors planted — student should find no errors
    errorDetectionScore =
      submittedErrors.length === 0 ? 100 : Math.max(0, 100 - submittedErrors.length * 25);
  }

  // 2. Ratings in expected range
  const ratingRanges = expected.correct_rating_range || {};
  const submittedRatings = submission.dimension_ratings || {};
  let ratingsCorrect = 0;
  let ratingsTotal = 0;
  for (const [dim, range] of Object.entries(ratingRanges)) {
    ratingsTotal++;
    const val = submittedRatings[dim];
    if (val !== undefined && val >= range[0] && val <= range[1]) {
      ratingsCorrect++;
    }
  }
  const ratingScore = ratingsTotal > 0 ? (ratingsCorrect / ratingsTotal) * 100 : 50;

  // 3. False positive penalty — errors reported that aren't planted
  const falsePositives = Math.max(0, submittedErrors.length - errorsDetected);
  const falsePositiveScore = Math.max(0, 100 - falsePositives * 30);

  const accuracy = clamp(
    errorDetectionScore * (weights.error_detection_weight || 0.4) +
      ratingScore * (weights.rating_weight || 0.3) +
      falsePositiveScore * (weights.false_positive_weight || 0.3),
  );

  return {
    accuracy,
    details: {
      errors_detected: errorsDetected,
      errors_planted: plantedErrors.length,
      error_detection_score: clamp(errorDetectionScore),
      rating_score: clamp(ratingScore),
      ratings_correct: ratingsCorrect,
      ratings_total: ratingsTotal,
      false_positives: falsePositives,
      false_positive_score: clamp(falsePositiveScore),
    },
  };
}

// ─── Reasoning Verification (Process Supervision) ───────────────────────────

/**
 * Evaluate a reasoning verification submission against a gold standard.
 *
 * Gold expected_answer shape:
 * {
 *   step_verdicts: ['+1', '+1', '-1', '+1'],  // PRM800K-style per step
 *   error_step_index: 2,                       // Index of first error (0-based)
 *   error_type: 'arithmetic',                  // Expected error classification
 * }
 */
export function evaluateReasoningGold(submission, goldStandard) {
  const expected = goldStandard.expected_answer;
  const weights = goldStandard.grading || {
    verdict_weight: 0.4,
    localization_weight: 0.3,
    correction_weight: 0.3,
  };

  const expectedVerdicts = expected.step_verdicts || [];
  const submittedVerifications = submission.step_verifications || [];

  // 1. Step verdict accuracy — how many verdicts match?
  let correctVerdicts = 0;
  const totalSteps = expectedVerdicts.length;
  for (let i = 0; i < totalSteps; i++) {
    const expectedVerdict = expectedVerdicts[i]; // '+1', '0', '-1'
    const submitted = submittedVerifications[i];
    if (!submitted) continue;

    const isExpectedCorrect = expectedVerdict === '+1';
    const submittedCorrect = submitted.verdict === 'correct';
    if (isExpectedCorrect === submittedCorrect) correctVerdicts++;
  }
  const verdictScore = totalSteps > 0 ? (correctVerdicts / totalSteps) * 100 : 0;

  // 2. Error localization — did they find the FIRST error? (PRM800K key metric)
  let localizationScore = 0;
  if (expected.error_step_index !== undefined && expected.error_step_index !== null) {
    const errorStepIdx = expected.error_step_index;
    const submittedAtError = submittedVerifications[errorStepIdx];
    if (submittedAtError && submittedAtError.verdict !== 'correct') {
      localizationScore = 100; // Found the error step
      // Bonus: identified correct error type
      if (
        expected.error_type &&
        submittedAtError.error_type &&
        submittedAtError.error_type.toLowerCase().includes(expected.error_type.toLowerCase())
      ) {
        localizationScore = 100; // Already max, but tracking for details
      }
    } else {
      // Check if they found an error at a nearby step (partial credit)
      const nearbyError = submittedVerifications.find(
        (v, i) => v.verdict !== 'correct' && Math.abs(i - errorStepIdx) <= 1,
      );
      localizationScore = nearbyError ? 50 : 0;
    }
  } else {
    // No error in this problem — all steps should be marked correct
    const allMarkedCorrect = submittedVerifications.every((v) => v.verdict === 'correct');
    localizationScore = allMarkedCorrect ? 100 : 50;
  }

  // 3. Correction quality — did they provide a valid correction for error steps?
  let correctionScore = 50; // Base
  if (expected.error_step_index !== undefined && expected.error_step_index !== null) {
    const errorVerification = submittedVerifications[expected.error_step_index];
    if (errorVerification?.correct_step && errorVerification.correct_step.length >= 20) {
      correctionScore = 100;
    } else if (errorVerification?.correct_step && errorVerification.correct_step.length >= 5) {
      correctionScore = 70;
    } else if (errorVerification?.verdict !== 'correct') {
      correctionScore = 40; // Identified error but no correction
    } else {
      correctionScore = 0; // Missed the error entirely
    }
  }

  const accuracy = clamp(
    verdictScore * (weights.verdict_weight || 0.4) +
      localizationScore * (weights.localization_weight || 0.3) +
      correctionScore * (weights.correction_weight || 0.3),
  );

  return {
    accuracy,
    details: {
      verdict_score: clamp(verdictScore),
      correct_verdicts: correctVerdicts,
      total_steps: totalSteps,
      localization_score: clamp(localizationScore),
      error_step_found:
        expected.error_step_index !== undefined
          ? submittedVerifications[expected.error_step_index]?.verdict !== 'correct'
          : null,
      correction_score: clamp(correctionScore),
    },
  };
}

// ─── Computer Use Trajectory ────────────────────────────────────────────────

/**
 * Evaluate a computer-use trajectory against a gold standard.
 *
 * Gold expected_answer shape:
 * {
 *   expected_urls: ['amazon.com/cart', 'amazon.com/dp/'],
 *   expected_step_range: [5, 15],
 *   must_complete: true,
 *   expected_actions: ['click', 'type', 'scroll'],  // optional
 * }
 */
export function evaluateComputerUseGold(submission, goldStandard) {
  const expected = goldStandard.expected_answer;
  const weights = goldStandard.grading || {
    completion_weight: 0.4,
    url_weight: 0.3,
    efficiency_weight: 0.3,
  };

  const trajectory = submission.trajectory || {};
  const steps = trajectory.steps || [];
  const urlsVisited = trajectory.urls_visited || steps.map((s) => s.url).filter(Boolean);
  const completion = submission.completion || {};

  // 1. Task completion
  let completionScore = 0;
  if (expected.must_complete) {
    completionScore = completion.status === 'completed' ? 100 : 0;
  } else {
    completionScore =
      completion.status === 'completed' ? 100 : completion.status === 'impossible' ? 50 : 20;
  }

  // 2. URLs reached — did the trajectory visit expected URLs?
  const expectedUrls = expected.expected_urls || [];
  let urlsReached = 0;
  for (const expectedUrl of expectedUrls) {
    const found = urlsVisited.some(
      (visited) => visited && visited.toLowerCase().includes(expectedUrl.toLowerCase()),
    );
    if (found) urlsReached++;
  }
  const urlScore = expectedUrls.length > 0 ? (urlsReached / expectedUrls.length) * 100 : 50;

  // 3. Step efficiency — steps within expected range
  const [minSteps, maxSteps] = expected.expected_step_range || [3, 30];
  const stepCount = steps.length;
  let efficiencyScore;
  if (stepCount >= minSteps && stepCount <= maxSteps) {
    efficiencyScore = 100;
  } else if (stepCount < minSteps) {
    efficiencyScore = Math.max(20, (stepCount / minSteps) * 80);
  } else {
    // Over max — diminishing score
    efficiencyScore = Math.max(30, 100 - ((stepCount - maxSteps) / maxSteps) * 50);
  }

  const accuracy = clamp(
    completionScore * (weights.completion_weight || 0.4) +
      urlScore * (weights.url_weight || 0.3) +
      efficiencyScore * (weights.efficiency_weight || 0.3),
  );

  return {
    accuracy,
    details: {
      completion_score: clamp(completionScore),
      task_completed: completion.status === 'completed',
      url_score: clamp(urlScore),
      urls_reached: urlsReached,
      urls_expected: expectedUrls.length,
      efficiency_score: clamp(efficiencyScore),
      step_count: stepCount,
      expected_step_range: [minSteps, maxSteps],
    },
  };
}

// ─── Red-Teaming / Adversarial Evaluation ──────────────────────────────────

/**
 * Evaluate a red-teaming submission against a gold standard.
 *
 * Gold expected_answer shape:
 * {
 *   correct_attack_vector: 'prompt_injection',
 *   acceptable_attack_vectors: ['prompt_injection'],  // optional alternates
 *   correct_harm_category: 'illegal_instructions' | null,
 *   min_acceptable_ratings: { refusal_appropriateness: [min, max], ... },
 *   analysis_must_mention: ['keyword1', 'keyword2'],
 * }
 */
export function evaluateRedTeamingGold(submission, goldStandard) {
  const expected = goldStandard.expected_answer;
  const weights = goldStandard.grading || {
    classification_weight: 0.4,
    rating_weight: 0.3,
    analysis_weight: 0.3,
  };

  // 1. Classification accuracy
  const acceptableVectors = expected.acceptable_attack_vectors || [expected.correct_attack_vector];
  const vectorCorrect = acceptableVectors.includes(submission.attack_vector);
  const vectorScore = vectorCorrect ? 100 : 0;

  let harmScore = 100;
  if (expected.correct_harm_category) {
    harmScore = submission.harm_category === expected.correct_harm_category ? 100 : 0;
  } else {
    // No harm category expected — student should not select one
    harmScore = !submission.harm_category || submission.attack_vector === 'none' ? 100 : 50;
  }
  const classificationScore = (vectorScore + harmScore) / 2;

  // 2. Rating accuracy — check each rating falls within expected range
  const ratingRanges = expected.min_acceptable_ratings || {};
  const submittedRatings = submission.response_ratings || {};
  let ratingsInRange = 0;
  let ratingsTotal = 0;
  for (const [dim, range] of Object.entries(ratingRanges)) {
    ratingsTotal++;
    const val = submittedRatings[dim];
    if (val !== undefined && val >= range[0] && val <= range[1]) {
      ratingsInRange++;
    }
  }
  const ratingScore = ratingsTotal > 0 ? (ratingsInRange / ratingsTotal) * 100 : 50;

  // 3. Analysis mentions key concepts
  const keywords = expected.analysis_must_mention || [];
  const analysis = (submission.analysis || '').toLowerCase();
  let keywordsFound = 0;
  for (const keyword of keywords) {
    if (analysis.includes(keyword.toLowerCase())) keywordsFound++;
  }
  const analysisScore = keywords.length > 0 ? (keywordsFound / keywords.length) * 100 : 50;

  const accuracy = clamp(
    classificationScore * (weights.classification_weight || 0.4) +
      ratingScore * (weights.rating_weight || 0.3) +
      analysisScore * (weights.analysis_weight || 0.3),
  );

  return {
    accuracy,
    details: {
      vector_correct: vectorCorrect,
      classification_score: clamp(classificationScore),
      rating_score: clamp(ratingScore),
      ratings_in_range: ratingsInRange,
      ratings_total: ratingsTotal,
      analysis_score: clamp(analysisScore),
      keywords_found: keywordsFound,
      keywords_total: keywords.length,
    },
  };
}

// ─── Tool Call / Agentic Trace Evaluation ──────────────────────────────────

/**
 * Evaluate a tool-call evaluation submission against a gold standard.
 *
 * Gold expected_answer shape:
 * {
 *   step_verdicts: [
 *     { tool_selection: 'correct', parameter_accuracy: 'correct', result_interpretation: 'correct' },
 *     { tool_selection: 'wrong_tool', parameter_accuracy: 'major_error', result_interpretation: 'misinterpreted' },
 *   ],
 *   expected_task_success: true | false,
 *   expected_overall_range: { tool_selection_quality: [min, max], efficiency: [min, max] },
 *   analysis_must_mention: ['keyword1'],
 * }
 */
export function evaluateToolCallGold(submission, goldStandard) {
  const expected = goldStandard.expected_answer;
  const weights = goldStandard.grading || {
    step_verdict_weight: 0.5,
    overall_weight: 0.25,
    analysis_weight: 0.25,
  };

  const expectedSteps = expected.step_verdicts || [];
  const submittedSteps = submission.step_evaluations || [];

  // 1. Step verdict accuracy — check all 3 verdicts per step
  let matchingVerdicts = 0;
  let totalVerdicts = 0;
  for (let i = 0; i < expectedSteps.length; i++) {
    const exp = expectedSteps[i];
    const sub = submittedSteps[i];
    if (!sub) continue;
    for (const key of ['tool_selection', 'parameter_accuracy', 'result_interpretation']) {
      if (exp[key] !== undefined) {
        totalVerdicts++;
        if (sub[key] === exp[key]) matchingVerdicts++;
      }
    }
  }
  const stepScore = totalVerdicts > 0 ? (matchingVerdicts / totalVerdicts) * 100 : 0;

  // 2. Overall assessment accuracy
  const overall = submission.overall_evaluation || {};
  let overallScore = 0;
  // Task success match
  if (expected.expected_task_success !== undefined) {
    overallScore += overall.task_success === expected.expected_task_success ? 50 : 0;
  } else {
    overallScore += 25;
  }
  // Overall ratings in expected ranges
  const overallRanges = expected.expected_overall_range || {};
  let overallInRange = 0;
  let overallTotal = 0;
  for (const [dim, range] of Object.entries(overallRanges)) {
    overallTotal++;
    const val = overall[dim];
    if (val !== undefined && val >= range[0] && val <= range[1]) {
      overallInRange++;
    }
  }
  if (overallTotal > 0) {
    overallScore += (overallInRange / overallTotal) * 50;
  } else {
    overallScore += 25;
  }

  // 3. Analysis quality
  const keywords = expected.analysis_must_mention || [];
  const suggestion = (overall.improvement_suggestion || '').toLowerCase();
  let keywordsFound = 0;
  for (const keyword of keywords) {
    if (suggestion.includes(keyword.toLowerCase())) keywordsFound++;
  }
  const analysisScore = keywords.length > 0 ? (keywordsFound / keywords.length) * 100 : 50;

  const accuracy = clamp(
    stepScore * (weights.step_verdict_weight || 0.5) +
      overallScore * (weights.overall_weight || 0.25) +
      analysisScore * (weights.analysis_weight || 0.25),
  );

  return {
    accuracy,
    details: {
      step_score: clamp(stepScore),
      matching_verdicts: matchingVerdicts,
      total_verdicts: totalVerdicts,
      overall_score: clamp(overallScore),
      task_success_correct:
        expected.expected_task_success !== undefined
          ? overall.task_success === expected.expected_task_success
          : null,
      analysis_score: clamp(analysisScore),
      keywords_found: keywordsFound,
      keywords_total: keywords.length,
    },
  };
}

// ─── Code Review ────────────────────────────────────────────────────────────

/**
 * Evaluate a code review submission against a gold standard.
 *
 * Gold expected_answer shape:
 * {
 *   required_bug_types: ['sql_injection', 'memory_leak'],  // must identify at least these
 *   min_bugs_found: 2,                                      // minimum bug count
 *   explanation_must_mention: ['parameterized', 'close'],   // keywords in explanation
 *   code_must_change: true,                                 // edited code differs from buggy
 * }
 */
export function evaluateCodeReviewGold(submission, goldStandard) {
  const expected = goldStandard.expected_answer;
  const weights = goldStandard.grading || {
    bug_detection_weight: 0.45,
    explanation_weight: 0.3,
    fix_weight: 0.25,
  };

  const submittedBugs = submission.bugs || [];
  const explanation = (submission.explanation || '').toLowerCase();
  const editedCode = submission.edited_code || submission.fixed_code || '';
  const buggyCode = goldStandard.task_data?.buggy_code || '';

  // 1. Bug detection — did they find the required bug types?
  const requiredTypes = expected.required_bug_types || [];
  let typesFound = 0;
  for (const reqType of requiredTypes) {
    const found = submittedBugs.some(
      (b) =>
        (b.type || '').toLowerCase().includes(reqType.toLowerCase()) ||
        (b.description || '').toLowerCase().includes(reqType.replace(/_/g, ' ').toLowerCase()),
    );
    if (found) typesFound++;
  }
  const typeScore = requiredTypes.length > 0 ? (typesFound / requiredTypes.length) * 100 : 50;

  // Volume check — did they find enough bugs?
  const minBugs = expected.min_bugs_found || 1;
  const volumeScore =
    submittedBugs.length >= minBugs ? 100 : (submittedBugs.length / minBugs) * 100;

  const bugScore = typeScore * 0.7 + volumeScore * 0.3;

  // 2. Explanation quality — mentions required keywords
  const keywords = expected.explanation_must_mention || [];
  let keywordsFound = 0;
  for (const kw of keywords) {
    if (explanation.includes(kw.toLowerCase())) keywordsFound++;
  }
  const explanationScore = keywords.length > 0 ? (keywordsFound / keywords.length) * 100 : 50;

  // Minimum length check — explanations under 20 chars get 0
  const explanationLengthScore = explanation.length >= 40 ? 100 : (explanation.length / 40) * 100;
  const finalExplanationScore = explanationScore * 0.7 + explanationLengthScore * 0.3;

  // 3. Code fix — did they actually change the code?
  let fixScore = 50;
  if (expected.code_must_change !== false) {
    const changed = editedCode.trim() !== buggyCode.trim() && editedCode.trim().length > 0;
    fixScore = changed ? 100 : 0;
  }

  const accuracy = clamp(
    bugScore * (weights.bug_detection_weight || 0.45) +
      finalExplanationScore * (weights.explanation_weight || 0.3) +
      fixScore * (weights.fix_weight || 0.25),
  );

  return {
    accuracy,
    details: {
      bug_score: clamp(bugScore),
      types_found: typesFound,
      types_required: requiredTypes.length,
      volume_score: clamp(volumeScore),
      bugs_submitted: submittedBugs.length,
      bugs_required: minBugs,
      explanation_score: clamp(finalExplanationScore),
      keywords_found: keywordsFound,
      keywords_total: keywords.length,
      fix_score: clamp(fixScore),
      code_changed: editedCode.trim() !== buggyCode.trim(),
    },
  };
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────

/**
 * Evaluate a submission against its gold standard.
 * @param {string} taskType - one of the task types
 * @param {object} submission - student's task data
 * @param {object} goldStandard - the gold standard document from Firestore
 * @returns {{ accuracy: number, details: object }}
 */
export function evaluateGoldSubmission(taskType, submission, goldStandard) {
  switch (taskType) {
    case 'rlhf_preference_ranking':
      return evaluateRLHFGold(submission, goldStandard);
    case 'multilingual_evaluation':
      return evaluateMultilingualGold(submission, goldStandard);
    case 'process_supervision':
      return evaluateReasoningGold(submission, goldStandard);
    case 'computer_use_trajectory':
      return evaluateComputerUseGold(submission, goldStandard);
    case 'red_teaming':
      return evaluateRedTeamingGold(submission, goldStandard);
    case 'tool_call_evaluation':
      return evaluateToolCallGold(submission, goldStandard);
    case 'code_review':
      return evaluateCodeReviewGold(submission, goldStandard);
    default:
      return { accuracy: 50, details: { error: `Unknown task type: ${taskType}` } };
  }
}
