import { doc, getDocFromServer } from 'firebase/firestore';
// @ts-expect-error - vendored JS module, no types
import { db } from '../vendor/seeker/firebaseInit.js';
import { getCurrentUser } from './auth';
import {
  type AvailableWorkflow,
  LOCAL_WORKFLOW,
  LOCAL_WORKFLOW_ENABLED,
  WORKFLOW_ASSIGNMENTS_COLLECTION,
  type WorkflowAccess,
  assignedWorkflows,
} from './workflows';

/** Right after signing in from the popup, the offscreen document takes up to a
 *  second to see the new login. Wait for it instead of reporting signed out. */
async function signedInUser(waitMs: number) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const user = await getCurrentUser();
    if (user || Date.now() >= deadline) return user;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/** Real assignments always use the server. Generalist needs only a signed-in account. */
export async function loadWorkflowAccess(
  localMode = LOCAL_WORKFLOW_ENABLED,
  authWaitMs = 5000,
): Promise<WorkflowAccess> {
  const user = await signedInUser(authWaitMs);
  if (!user) throw new Error('Sign in before starting a task.');
  let workflows: AvailableWorkflow[];
  try {
    const assignment = await getDocFromServer(doc(db, WORKFLOW_ASSIGNMENTS_COLLECTION, user.uid));
    workflows = assignedWorkflows(assignment.exists() ? assignment.data() : null);
  } catch (error) {
    // Without a server answer only Generalist is safe to offer.
    if (!localMode) throw error;
    workflows = [];
  }
  if ((await getCurrentUser())?.uid !== user.uid) {
    throw new Error('Your account changed. Open Sidekick again.');
  }
  // Assigned projects first, then Generalist, which is open to everyone.
  return {
    uid: user.uid,
    workflows: localMode ? [...workflows, { ...LOCAL_WORKFLOW }] : workflows,
  };
}
