import { doc, getDocFromServer } from 'firebase/firestore';
// @ts-expect-error - vendored JS module, no types
import { db } from '../vendor/seeker/firebaseInit.js';
import { getCurrentUser } from './auth';
import {
  LOCAL_WORKFLOW,
  LOCAL_WORKFLOW_ENABLED,
  WORKFLOW_ASSIGNMENTS_COLLECTION,
  type WorkflowAccess,
  assignedWorkflows,
} from './workflows';

/** Real assignments always use the server. Local practice needs only a signed-in account. */
export async function loadWorkflowAccess(
  localMode = LOCAL_WORKFLOW_ENABLED,
): Promise<WorkflowAccess> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Sign in before starting a task.');
  if (localMode) return { uid: user.uid, workflows: [{ ...LOCAL_WORKFLOW }] };
  const assignment = await getDocFromServer(doc(db, WORKFLOW_ASSIGNMENTS_COLLECTION, user.uid));
  if ((await getCurrentUser())?.uid !== user.uid) {
    throw new Error('Your account changed. Open Sidekick again.');
  }
  return {
    uid: user.uid,
    workflows: assignedWorkflows(assignment.exists() ? assignment.data() : null),
  };
}
