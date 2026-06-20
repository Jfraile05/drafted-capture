// ════════════════════════════════════════════════════════════════════════
//  Bridge: a captured ambient Session -> the EXACT taskData shape the seeker
//  app's labs/browser flow produces, then submit it through the vendored
//  seeker submission pipeline so the record lands in the same Firestore
//  collection (credential_tasks), same Storage layout, same provenance,
//  badges, XP, and certificates.
//
//  The ONLY difference, per spec: every record gets capturedFromExtension:true.
//
//  Reference shape: drafted-seeker-nextjs/app/lab/browser/page.js handleSubmit
//  -> data_format 'screenshot_action_pairs_v2'.
// ════════════════════════════════════════════════════════════════════════

import { doc, getDoc, updateDoc } from 'firebase/firestore';
// @ts-expect-error - vendored JS module, no types
import { db } from '../vendor/seeker/firebaseInit.js';
// @ts-expect-error - vendored JS module, no types
import { submitTaskCore } from '../vendor/seeker/submitTaskCore.js';
import { getScreenshot } from './storage/db';
import type { Action, Session, Step } from './types';
import { blobToBase64 } from './utils/screenshot';

// ── Action mapping: extension ActionType -> seeker action.action_type ────────
//
// The seeker quality scorer + dataset reads `action.action_type` plus the
// type-specific fields below. We map faithfully; types the seeker has no
// notion of (tab_open/close/switch) collapse to the closest concept.

interface SeekerAction {
  action_type: string;
  coordinate?: [number, number];
  description?: string;
  text?: string;
  url?: string;
  key?: string;
  direction?: string;
}

function mapAction(action: Action): SeekerAction {
  switch (action.type) {
    case 'click':
    case 'double_click':
    case 'right_click':
      return {
        action_type: 'click',
        ...(action.coordinate ? { coordinate: action.coordinate } : {}),
      };
    case 'type':
      return { action_type: 'type', ...(action.text ? { text: action.text } : {}) };
    case 'key':
      return { action_type: 'key', ...(action.key ? { key: action.key } : {}) };
    case 'scroll':
      return {
        action_type: 'scroll',
        ...(action.scroll_direction ? { direction: action.scroll_direction } : {}),
      };
    case 'navigate':
    case 'tab_open':
    case 'tab_switch':
      return { action_type: 'navigate', ...(action.url ? { url: action.url } : {}) };
    case 'tab_close':
      return { action_type: 'navigate', description: 'closed tab' };
    case 'drag':
      return {
        action_type: 'click',
        ...(action.coordinate ? { coordinate: action.coordinate } : {}),
        description: 'drag',
      };
    case 'wait':
    case 'screenshot':
      return { action_type: 'wait' };
    default:
      return { action_type: 'wait' };
  }
}

// ── Screenshot resolve: ScreenshotRef hash -> base64 data URL ────────────────
// The vendored processComputerUseScreenshots() expects step.screenshot to be a
// `data:image/...;base64,...` string; it strips and uploads to Storage at
// annotated-screenshots/{uid}/{taskId}/{i}.jpg, exactly like the web flow.

async function screenshotDataUrl(step: Step): Promise<string | null> {
  if (!step.screenshot) return null;
  const blob = await getScreenshot(step.screenshot.hash);
  if (!blob) return null;
  // Service-worker-safe (no FileReader): arrayBuffer + btoa via blobToBase64.
  const base64 = await blobToBase64(blob);
  const type = blob.type || 'image/png';
  return `data:${type};base64,${base64}`;
}

// ── Build the seeker taskData from a captured Session ────────────────────────

export interface EnrichmentMap {
  // step index -> { thought, action overrides } applied when the user labels
  // a session after the fact. Optional; ambient submissions pass nothing.
  [stepIndex: number]: { thought?: string };
}

async function buildTaskData(session: Session, enrich?: EnrichmentMap) {
  // Map each captured step to a seeker trajectory step.
  const steps = await Promise.all(
    session.steps.map(async (step, i) => {
      const action = mapAction(step.action);
      const thought = enrich?.[step.index]?.thought?.trim() ?? '';
      return {
        step_index: i,
        timestamp_ms: step.timestamp,
        screenshot: await screenshotDataUrl(step),
        screenshot_dimensions: step.screenshot
          ? { width: step.screenshot.width, height: step.screenshot.height }
          : null,
        thought,
        action,
        duration_ms: step.duration_to_next ?? 0,
      };
    }),
  );

  const urlsVisited = [
    ...new Set(session.steps.map((s) => s.origin?.url).filter((u): u is string => Boolean(u))),
  ];

  // Derive a goal/instruction: a labeled segment wins, else the pre-capture
  // intent the user declared, else a neutral ambient-capture instruction.
  const firstSegment = session.segments?.[0];
  const instructionText =
    firstSegment?.label?.trim() || session.intent?.trim() || 'Ambient browser capture (unlabeled)';
  const category = firstSegment?.category ?? null;

  const env = session.environment;

  return {
    instruction: {
      text: instructionText,
      category,
      difficulty: null,
      instruction_id: null,
      expected_outcome: null,
    },
    trajectory: {
      steps,
      total_steps: steps.length,
      total_frames_captured: steps.length,
      total_duration_ms: session.ended_at - session.started_at,
      urls_visited: urlsVisited,
      recording_url: null,
      recording_size_bytes: 0,
      data_format: 'screenshot_action_pairs_v2',
    },
    completion: {
      status: 'completed',
      summary: firstSegment?.notes?.trim() || '',
    },
    environment: {
      os: env.os,
      browser: env.browser,
      screen_width: env.display_width,
      screen_height: env.display_height,
      viewport_width: env.display_width,
      viewport_height: env.display_height,
      device_pixel_ratio: env.device_pixel_ratio,
      user_agent: env.user_agent,
    },
    session_id: session.id,
    // The one spec-mandated difference from the web flow.
    capturedFromExtension: true,
  };
}

// ── Behavioral data (the third submitTask arg) ───────────────────────────────
// The web flow passes useTaskBehaviorTracker output. We synthesize the subset
// the pipeline reads, from real capture stats.

function buildBehavioralData(session: Session) {
  const totalMs = session.ended_at - session.started_at;
  const keystrokes = session.steps.filter(
    (s) => s.action.type === 'type' || s.action.type === 'key',
  ).length;
  return {
    total_time_ms: totalMs,
    device_type: 'desktop',
    user_agent: session.environment.user_agent,
    viewport_size: {
      width: session.environment.display_width,
      height: session.environment.display_height,
    },
    task_started_at: new Date(session.started_at).toISOString(),
    task_completed_at: new Date(session.ended_at).toISOString(),
    time_per_section_ms: {},
    scroll_events: [],
    max_scroll_depths: {},
    keystroke_count: keystrokes,
    paste_events: 0,
    undo_events: 0,
    preference_changes: 0,
    rating_changes: 0,
    tab_hidden_events: [],
    total_tab_hidden_ms: 0,
  };
}

export interface SubmitResult {
  taskId: string;
  qualityScore: number;
  badgeEarned: boolean;
  badgeLevel: string | null;
}

/**
 * Submit a captured Session to Drafted in the exact labs/browser format.
 * Requires the user to be signed in (submitTaskCore reads auth.currentUser).
 * Throws if not signed in or on write failure.
 */
export async function submitSessionToDrafted(
  session: Session,
  enrich?: EnrichmentMap,
): Promise<SubmitResult> {
  const taskData = await buildTaskData(session, enrich);
  const behavioralData = buildBehavioralData(session);
  return (await submitTaskCore(
    'computer_use_trajectory',
    taskData,
    behavioralData,
  )) as SubmitResult;
}

/**
 * Enrich an already-submitted record: re-derive the trajectory (now with the
 * user's per-step thoughts + segment-derived instruction) and patch the
 * existing credential_tasks doc. Relies on the owner-update Firestore rule.
 * Screenshots are NOT re-uploaded; their Storage paths already live on the doc,
 * so we only patch the fields the user can change (thoughts, instruction,
 * completion summary) plus an enriched_at stamp.
 */
export async function enrichSubmittedSession(
  session: Session,
  draftedTaskId: string,
  enrich: EnrichmentMap,
): Promise<void> {
  const taskRef = doc(db, 'credential_tasks', draftedTaskId);
  const snap = await getDoc(taskRef);
  if (!snap.exists()) throw new Error('Submitted record not found');
  const existing = snap.data() as {
    trajectory?: { steps?: Array<{ step_index: number; screenshot?: unknown }> };
  };
  const existingSteps = existing.trajectory?.steps ?? [];

  // Patch thoughts onto the existing steps in place (keep their uploaded
  // screenshot Storage paths untouched).
  const patchedSteps = existingSteps.map((s) => {
    const thought = enrich[s.step_index]?.thought?.trim();
    return thought ? { ...s, thought } : s;
  });

  const firstSegment = session.segments?.[0];
  const now = new Date().toISOString();

  await updateDoc(taskRef, {
    'trajectory.steps': patchedSteps,
    ...(firstSegment?.label
      ? {
          'instruction.text': firstSegment.label.trim(),
          'instruction.category': firstSegment.category ?? null,
        }
      : {}),
    ...(firstSegment?.notes ? { 'completion.summary': firstSegment.notes.trim() } : {}),
    enriched_at: now,
    enriched_from_extension: true,
  });
}
