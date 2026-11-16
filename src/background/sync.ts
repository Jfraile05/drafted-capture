import { listSessions } from '../shared/storage/db';
import { getSettings } from '../shared/storage/live';
import { SYNC_CONFIG } from '../shared/syncConfig';
import { pendingSync } from '../shared/syncState';
import { ensureOffscreen } from './offscreen';

export async function requestBackgroundSync(): Promise<void> {
  if (!(await listSessions()).some(pendingSync)) return;
  await ensureOffscreen();
  const settings = await getSettings();
  await chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'SYNC_QUEUE',
    projectId: settings.drafted_project_id.trim(),
    orgId: settings.drafted_org_id.trim(),
  });
}

export function wakeSync(): void {
  void requestBackgroundSync().catch((error) => console.warn('[sync] will retry', error));
}

export async function initializeSync(): Promise<void> {
  await chrome.alarms.create(SYNC_CONFIG.alarmName, {
    periodInMinutes: SYNC_CONFIG.recoveryMinutes,
  });
  wakeSync();
}
