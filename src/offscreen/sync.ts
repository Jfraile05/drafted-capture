import { onAuthChanged } from '../shared/auth';
import { loadOwnIdentity } from '../shared/ownIdentityAccess';
import { loadPrivacyPolicy } from '../shared/privacyPolicyAccess';
import { loadQualityReviews } from '../shared/qualityAccess';
import { type SyncDestination, syncQueuedSessions } from '../shared/syncQueue';
import { loadWorkflowAccess } from '../shared/workflowAccess';

let destination: SyncDestination = { projectId: '', orgId: '' };
let running = false;
let requested = false;

function kick(): void {
  requested = true;
  if (running) return;
  running = true;
  void (async () => {
    try {
      while (requested) {
        requested = false;
        await syncQueuedSessions(destination);
      }
    } catch (error) {
      console.warn('[sync] queue retained for retry', error);
    } finally {
      running = false;
    }
  })();
}

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.target !== 'offscreen') return;
  if (message.type === 'PRIVACY_POLICY') {
    void loadPrivacyPolicy().then(respond, () => respond(null));
    return true;
  }
  if (message.type === 'OWN_IDENTITY') {
    void loadOwnIdentity().then(respond, () => respond(null));
    return true;
  }
  if (message.type === 'WORKFLOW_ACCESS') {
    void loadWorkflowAccess().then(respond, () =>
      respond({ error: 'Workflow access is unavailable.' }),
    );
    return true;
  }
  if (message.type === 'QUALITY_REVIEWS') {
    void loadQualityReviews(message.taskIds).then(respond, () => respond({}));
    return true;
  }
  if (message.type === 'SYNC_QUEUE') {
    destination = { projectId: message.projectId, orgId: message.orgId };
    kick();
    respond({ ok: true });
  }
});

onAuthChanged(() => {
  void chrome.runtime.sendMessage({ type: 'WAKE_SYNC' }).catch(() => {});
});
window.addEventListener('online', () => {
  void chrome.runtime.sendMessage({ type: 'WAKE_SYNC' }).catch(() => {});
});
