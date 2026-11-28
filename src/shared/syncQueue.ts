import { getCurrentUser } from './auth';
import { getSession, listSessions, updateSession } from './storage/db';
import { isPermissionDenied } from './submitErrors';
import { enrichArchivedSession, submitArchivedSession } from './submitManager';
import { submittedSessionOwner } from './submitToDrafted';
import { SYNC_CONFIG } from './syncConfig';
import { pendingSync } from './syncState';
import { uploadsWithoutProject } from './workflows';

export interface SyncDestination {
  projectId: string;
  orgId: string;
}

/** The archive is also the durable outbox. No separate enqueue write can be lost. */
export async function syncQueuedSessions(destination: SyncDestination): Promise<void> {
  await navigator.locks.request('drafted-sync-queue', async () => {
    const user = await getCurrentUser();
    if (!user) return;
    for (const candidate of (await listSessions()).reverse()) {
      let session = await getSession(candidate.id);
      if (!session || !pendingSync(session)) continue;
      if ((session.sync?.retry_at ?? 0) > Date.now()) continue;
      if (!session.metadata.owner_uid && session.submission?.drafted_task_id) {
        const owner = await submittedSessionOwner(session).catch(() => null);
        if (owner) {
          session = await updateSession(session.id, (current) => ({
            ...current,
            metadata: { ...current.metadata, owner_uid: owner },
          }));
        }
      }
      if (session.metadata.owner_uid !== user.uid) continue;
      if (
        !session.submission &&
        !session.metadata.workflow &&
        !session.metadata.drafted_project_id &&
        destination.projectId
      ) {
        session = await updateSession(session.id, (current) =>
          current.metadata.drafted_project_id
            ? current
            : {
                ...current,
                metadata: {
                  ...current.metadata,
                  drafted_project_id: destination.projectId,
                  drafted_org_id: destination.orgId || null,
                },
              },
        );
      }
      if (
        !session.submission &&
        !session.metadata.drafted_project_id &&
        !uploadsWithoutProject(session.metadata.workflow)
      )
        continue;
      const outcome = session.submission?.drafted_task_id
        ? await enrichArchivedSession(session.id)
        : await submitArchivedSession(session.id);
      if (outcome.ok) continue;
      // The record is on the server and its rules refuse this label save. Every
      // retry would be refused too, so stop. The labels stay on this device.
      if (session.submission?.drafted_task_id && isPermissionDenied(outcome.error)) {
        const revision = session.sync?.revision ?? 0;
        await updateSession(session.id, (current) =>
          current.sync
            ? {
                ...current,
                sync: { ...current.sync, synced_revision: revision, attempts: 0, retry_at: 0 },
              }
            : current,
        ).catch(() => {});
        continue;
      }
      await updateSession(session.id, (current) => {
        if (!current.sync) return current;
        const attempts = current.sync.attempts + 1;
        return {
          ...current,
          sync: {
            ...current.sync,
            attempts,
            retry_at:
              Date.now() +
              Math.min(
                SYNC_CONFIG.retryMaxMs,
                SYNC_CONFIG.retryBaseMs * 2 ** Math.min(attempts - 1, 10),
              ),
          },
        };
      }).catch(() => {});
    }
  });
}
