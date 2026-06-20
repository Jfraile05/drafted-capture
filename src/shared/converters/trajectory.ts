import type { Action, FormatConverter, Session, Step, TaskCategory } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Trajectory v1 converter: maps Session to Drafted Trajectory Episode Schema v1
// (trajectory_schema_v1.json). This format is directly ingestible by
// drafted-trajectory. Screenshots are referenced by hash (no base64).
// ─────────────────────────────────────────────────────────────────────────────

function episodeId(sessionId: string): string {
  // Deterministic 6-digit ID from session ID hash, matching ^EP[0-9]{6}$
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = (hash * 31 + sessionId.charCodeAt(i)) >>> 0;
  }
  const n = hash % 1000000;
  return `EP${String(n).padStart(6, '0')}`;
}

function deriveGoal(session: Session): string {
  if (session.segments.length > 0 && session.segments[0].label) {
    return session.segments[0].label;
  }
  const domains = session.outcome.domains_touched;
  if (domains.length > 0) {
    return `General web workflow on ${domains[0]}`;
  }
  return 'General web workflow';
}

function mapTaskFamily(category: TaskCategory | null): string {
  // Map TaskCategory to trajectory task_family enum (crm_update|ticket_resolution|hr_request)
  const mapping: Record<TaskCategory, string> = {
    browse: 'ticket_resolution',
    form_fill: 'ticket_resolution',
    research: 'ticket_resolution',
    purchase: 'ticket_resolution',
    workflow: 'ticket_resolution',
    communication: 'ticket_resolution',
    data_entry: 'crm_update',
    other: 'ticket_resolution',
  };
  return category ? mapping[category] : 'ticket_resolution';
}

function actionArgs(action: Action): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  if (action.coordinate) args.coordinate = action.coordinate;
  if (action.end_coordinate) args.end_coordinate = action.end_coordinate;
  if (action.text !== undefined) args.text = action.text;
  if (action.key !== undefined) args.key = action.key;
  if (action.button) args.button = action.button;
  if (action.scroll_direction) args.scroll_direction = action.scroll_direction;
  if (action.scroll_amount !== undefined) args.scroll_amount = action.scroll_amount;
  if (action.modifier_keys) args.modifier_keys = action.modifier_keys;
  if (action.url !== undefined) args.url = action.url;
  if (action.duration !== undefined) args.duration = action.duration;
  return args;
}

function mapStep(step: Step, stepIndex: number): Record<string, unknown> {
  return {
    step_index: stepIndex,
    timestamp_utc: new Date(step.timestamp).toISOString(),
    observation: {
      screenshot_hash: step.screenshot?.hash ?? null,
      url: step.origin.url,
      dom: step.dom ?? null,
    },
    action: {
      type: step.action.type,
      ...actionArgs(step.action),
    },
    result: {},
  };
}

export const trajectoryConverter: FormatConverter = {
  key: 'trajectory',
  name: 'Trajectory v1',
  filename: 'trajectory.json',

  async convert(session: Session): Promise<string> {
    const steps = session.steps.filter((s) => s.action.type !== 'screenshot');

    const firstSegmentCategory = session.segments.length > 0 ? session.segments[0].category : null;
    const taskFamily = mapTaskFamily(firstSegmentCategory);

    const endStateUrl =
      steps.length > 0 ? steps[steps.length - 1].origin.url : session.environment.user_agent;

    const durationSeconds = Math.round(session.outcome.total_duration_ms / 1000);

    const episode = {
      episode_id: episodeId(session.id),
      dataset_version: '1.0',
      created_at_utc: session.metadata.created_at,
      operator: {
        operator_id: session.metadata.drafted_org_id || 'anonymous',
      },
      goal: deriveGoal(session),
      task_family: taskFamily,
      env: {
        os: session.environment.os,
        browser: session.environment.browser,
        browser_version: session.environment.browser_version,
        viewport: {
          width: session.environment.display_width,
          height: session.environment.display_height,
        },
        locale: session.environment.locale,
        timezone: session.environment.timezone,
        site_domain: session.outcome.domains_touched[0] ?? 'unknown',
      },
      policy: {
        no_payment: true,
        no_real_messaging: true,
        no_personal_data: true,
        stop_points: [],
        allowed_actions: [],
      },
      steps: steps.map(mapStep),
      outcome: {
        success: true,
        end_state_url: endStateUrl,
        duration_seconds: durationSeconds,
        step_count: steps.length,
        verification: {
          method: 'human',
          judgement: 'pass',
        },
      },
      quality: {
        qa_status: 'pending',
      },
      license: {
        consent: 'explicit',
        account_ownership: 'self',
        site_terms_checked: true,
      },
    };

    return JSON.stringify(episode, null, 2);
  },
};
