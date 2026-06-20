/**
 * Dataset Provenance Constants
 *
 * Single source of truth for the metadata fields that make Drafted's
 * annotation data lab-grade and legally compliant for commercial release.
 *
 * Every credential_tasks record stamps these fields at write time so we
 * can later filter, version, and export consent-respecting datasets.
 *
 * See `Project Nova` Notion spec, "Six gaps to close" section.
 */

// ─── Consent ────────────────────────────────────────────────────────────────

/**
 * Bump this any time the consent text in the consent gate changes
 * (app/tasks/page.js → handleConsent). Old records retain their original
 * version so we can prove what each annotator agreed to at the moment
 * they submitted.
 */
export const CONSENT_VERSION = 'v1.0';

/**
 * Plain-English summary of what v1.0 covers. Kept here so the consent
 * gate UI and the consent metadata stay in lockstep.
 */
export const CONSENT_TEXT_V1 = `
You permit Drafted to license your pseudonymized annotations
(answers, ratings, behavioral signals, university tier, major domain) to
research organizations. Your name, email, and exact university are never
shared. You can withdraw consent for future tasks at any time; previously
submitted records remain in any datasets already released.
`.trim();

// ─── Dataset Release Tagging ────────────────────────────────────────────────

/**
 * All newly written tasks default to 'unreleased'. The export pipeline
 * (scripts/exportDataset.js) bumps this to a real release ID like
 * 'drafted_rlhf_2026_q2_v1' when a snapshot is shipped to a buyer.
 */
export const DEFAULT_RELEASE_ID = 'unreleased';

// ─── Response Provenance ────────────────────────────────────────────────────

/**
 * Default provenance for responses pulled from the curated prompt bank
 * (lib/tasks/promptBank.js). All current bank entries were authored or
 * lightly edited by Drafted staff, so we tag them as human_authored
 * with a known source. Newer prompts that are LLM-generated MUST override
 * this by setting a `provenance` field on the response object directly.
 */
export const DEFAULT_RESPONSE_PROVENANCE = {
  source: 'drafted_prompt_bank_v1',
  authored_by: 'human',
  model_id: null,
  model_version: null,
  generated_at: null,
};

/**
 * Build the responses_provenance block to attach to a task record.
 * Pulls per-side provenance off the prompt object if present, falling
 * back to DEFAULT_RESPONSE_PROVENANCE.
 *
 * Supports the shapes used today:
 *   - RLHF / red-teaming: { response_a, response_b }
 *   - Multilingual: { source, target } where target is the model output
 *   - Tool-call: { trace } authored by some agent
 *
 * @param {object} taskData - the cleaned task data being persisted
 * @returns {object|null}
 */
export function buildResponsesProvenance(taskData) {
  if (!taskData) return null;

  // RLHF / red-teaming style
  if (taskData.response_a || taskData.response_b) {
    return {
      response_a: taskData.response_a?.provenance || DEFAULT_RESPONSE_PROVENANCE,
      response_b: taskData.response_b?.provenance || DEFAULT_RESPONSE_PROVENANCE,
    };
  }

  // Multilingual style: target is the model-generated translation
  if (taskData.target && typeof taskData.target === 'object') {
    const inferredModel = taskData.target.generation_method || null;
    return {
      target: taskData.target.provenance || {
        ...DEFAULT_RESPONSE_PROVENANCE,
        // generation_method ('neural_mt', 'human_translation', etc.) is our
        // closest approximation of model_id for legacy multilingual prompts.
        source: inferredModel ? `legacy:${inferredModel}` : DEFAULT_RESPONSE_PROVENANCE.source,
        authored_by: inferredModel === 'human_translation' ? 'human' : 'unknown',
        model_id: inferredModel && inferredModel !== 'human_translation' ? inferredModel : null,
      },
    };
  }

  // Tool-call style: trace is authored by some agent
  if (taskData.trace || taskData.trajectory) {
    return {
      trace: taskData.trace_provenance || DEFAULT_RESPONSE_PROVENANCE,
    };
  }

  return null;
}

// ─── Annotator Pseudonymization ─────────────────────────────────────────────

/**
 * Build the pseudonymous annotator block that gets stored on each task
 * record. We deliberately DO NOT include email or any other PII —
 * Firebase UIDs are random opaque strings (28 chars) and serve as the
 * stable cross-record annotator identifier, matching the pattern used
 * by Anthropic's HH-RLHF (`worker_id`) and OpenAI Summarize-from-Feedback.
 *
 * Demographic fields included (university, major, native_language) are
 * the categorical signals labs need for stratification but cannot be used
 * to re-identify a single individual on their own.
 *
 * @param {object} args
 * @param {string} args.userId - Firebase UID
 * @param {object} args.accountData - drafted-accounts/{email} document
 * @returns {object}
 */
export function buildAnnotatorBlock({ userId, accountData }) {
  return {
    annotator_id: userId, // Firebase UID — stable, opaque, no PII
    university: accountData.university || '',
    major: accountData.major || '',
    degree_level: accountData.degreeLevel || accountData.degree_level || 'undergrad',
    native_language: accountData.nativeLanguage || accountData.native_language || 'en',
    year: accountData.year || accountData.graduationYear || '',
    // NOTE: email intentionally omitted. If a buyer needs to reach a
    // top performer, that goes through Drafted's recruiting flow with
    // separate per-task consent — never via the dataset itself.
  };
}
