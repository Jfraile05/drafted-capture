import { useEffect, useState } from 'react';
import { sendMessage } from './hooks';
import { ARCHIVED_SESSION_CHANGE } from './storage/sessionUpdates';
import { pendingSync } from './syncState';
import type { Session } from './types';

function Status({ pending, localOnly = false }: { pending: boolean; localOnly?: boolean }) {
  return (
    <output className="inline-flex items-center gap-1.5 text-xs text-text-muted">
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${localOnly ? 'bg-text-faint' : pending ? 'bg-orange' : 'bg-green'}`}
      />
      {localOnly ? 'On this device' : pending ? 'Uploading' : 'Synced'}
    </output>
  );
}

export function SessionSyncStatus({ session }: { session: Session }) {
  if (session.metadata.workflow?.local_only) return <Status pending={false} localOnly />;
  if (!session.sync && !session.submission?.drafted_task_id) return null;
  return <Status pending={pendingSync(session)} />;
}

export function SyncStatus({ uid, localOnly = false }: { uid: string; localOnly?: boolean }) {
  const [pending, setPending] = useState<boolean | null>(null);
  useEffect(() => {
    if (localOnly) return;
    let version = 0;
    let closed = false;
    const refresh = async () => {
      const request = ++version;
      try {
        const sessions = await sendMessage<Session[]>('LIST_SESSIONS');
        if (!closed && request === version) {
          setPending(
            sessions.some((session) => session.metadata.owner_uid === uid && pendingSync(session)),
          );
        }
      } catch {
        // Keep the last known status until the worker reconnects.
      }
    };
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'session' && changes[ARCHIVED_SESSION_CHANGE]) void refresh();
    };
    chrome.storage.onChanged.addListener(onChange);
    window.addEventListener('focus', refresh);
    void refresh();
    return () => {
      closed = true;
      chrome.storage.onChanged.removeListener(onChange);
      window.removeEventListener('focus', refresh);
    };
  }, [uid, localOnly]);
  if (localOnly) return <Status pending={false} localOnly />;
  return pending === null ? null : <Status pending={pending} />;
}
