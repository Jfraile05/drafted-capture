import type { Session } from './types';

export function pendingSync(session: Session): boolean {
  if (session.metadata.workflow?.local_only) return false;
  return Boolean(session.sync && session.sync.synced_revision < session.sync.revision);
}

/** Called inside the same IndexedDB transaction that saves an edit. */
export function markSessionDirty(session: Session): Session {
  if (session.metadata.workflow?.local_only) return session;
  if (!session.sync && !session.submission?.drafted_task_id) return session;
  return {
    ...session,
    sync: {
      synced_revision: session.sync?.synced_revision ?? 0,
      revision: (session.sync?.revision ?? 0) + 1,
      attempts: 0,
      retry_at: 0,
    },
  };
}
