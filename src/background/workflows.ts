import type { WorkflowAccess } from '../shared/workflows';
import { ensureOffscreen } from './offscreen';

export async function getWorkflowAccess(): Promise<WorkflowAccess> {
  await ensureOffscreen();
  const response = await chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'WORKFLOW_ACCESS',
  });
  if (!response?.uid || !Array.isArray(response.workflows)) {
    throw new Error('Could not check your workflow access. Try again when you are online.');
  }
  return response;
}
