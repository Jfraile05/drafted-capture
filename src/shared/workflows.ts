import localWorkflowConfig from '../config/local-workflow.json';
import configuredWorkflows from '../config/workflows.json';

export interface WorkflowDefinition {
  id: string;
  name: string;
  hourly_rate_cents: number;
  annotation_enabled: boolean;
  /** Hourly annotation bonus, separate from the base hourly rate. */
  annotation_rate_cents: number;
  annotation_opted_in?: boolean;
  /** Local practice sessions never enter the upload queue. */
  local_only?: boolean;
}

export interface AvailableWorkflow extends WorkflowDefinition {
  project_id: string | null;
  org_id: string | null;
}

export interface WorkflowAccess {
  uid: string;
  workflows: AvailableWorkflow[];
}

export const WORKFLOWS: readonly WorkflowDefinition[] = configuredWorkflows;
export const LOCAL_WORKFLOW_ENABLED = localWorkflowConfig.enabled;
/** When true, Generalist sessions upload to Drafted on Stop like any other task,
 *  without a project. When false they stay on this device. */
export const LOCAL_WORKFLOW_UPLOADS = localWorkflowConfig.upload === true;
export const LOCAL_WORKFLOW: AvailableWorkflow = {
  ...localWorkflowConfig.workflow,
  ...(LOCAL_WORKFLOW_UPLOADS ? {} : { local_only: true }),
  project_id: null,
  org_id: null,
};

/** Generalist sessions may upload without a Drafted project. */
export function uploadsWithoutProject(workflow: WorkflowDefinition | undefined): boolean {
  return LOCAL_WORKFLOW_UPLOADS && workflow?.id === LOCAL_WORKFLOW.id && !workflow.local_only;
}
export const WORKFLOW_ASSIGNMENTS_COLLECTION = 'capture_workflow_assignments';
export const WORKFLOW_SELECTION_KEY = 'selected_workflow';

/** Assignment documents are written by Drafted, never by the extension. */
export function assignedWorkflows(
  data: unknown,
  catalog: readonly WorkflowDefinition[] = WORKFLOWS,
): AvailableWorkflow[] {
  if (!data || typeof data !== 'object' || !('assignments' in data)) return [];
  if (!Array.isArray(data.assignments)) return [];
  const assignments = data.assignments;
  return catalog.flatMap((workflow) => {
    const matches = assignments.filter(
      (value) => value && typeof value === 'object' && value.workflow_id === workflow.id,
    );
    // Ambiguous destinations must not silently pick one project.
    if (matches.length !== 1) return [];
    const assignment = matches[0];
    if (
      assignment.active !== true ||
      typeof assignment.project_id !== 'string' ||
      !assignment.project_id.trim() ||
      (assignment.org_id != null && typeof assignment.org_id !== 'string')
    )
      return [];
    return [
      {
        ...workflow,
        ...(assignment.annotation &&
        typeof assignment.annotation.enabled === 'boolean' &&
        Number.isSafeInteger(assignment.annotation.rate_cents_per_hour) &&
        assignment.annotation.rate_cents_per_hour >= 0
          ? {
              annotation_enabled: assignment.annotation.enabled,
              annotation_rate_cents: assignment.annotation.rate_cents_per_hour,
            }
          : {}),
        project_id: assignment.project_id.trim(),
        org_id: assignment.org_id?.trim() || null,
      },
    ];
  });
}

export function annotationAvailable(workflow: WorkflowDefinition): boolean {
  return (
    workflow.annotation_enabled === true &&
    Number.isSafeInteger(workflow.annotation_rate_cents) &&
    workflow.annotation_rate_cents > 0
  );
}

export function workflowSnapshot(workflow: AvailableWorkflow, optedIn = false): WorkflowDefinition {
  const { project_id, org_id, annotation_opted_in, ...snapshot } = workflow;
  return {
    ...snapshot,
    ...(optedIn && annotationAvailable(workflow) ? { annotation_opted_in: true } : {}),
  };
}

export function workflowRateLabel(cents: number): string {
  return `${new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)}/hour`;
}

export async function selectedWorkflow(uid: string): Promise<string | null> {
  const value = (await chrome.storage.local.get(WORKFLOW_SELECTION_KEY))[WORKFLOW_SELECTION_KEY];
  return value?.uid === uid && typeof value.workflow_id === 'string' ? value.workflow_id : null;
}

export async function selectWorkflow(uid: string, workflowId: string): Promise<void> {
  await chrome.storage.local.set({
    [WORKFLOW_SELECTION_KEY]: { uid, workflow_id: workflowId },
  });
}
