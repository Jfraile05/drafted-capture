import { getLiveSession } from '../../src/shared/storage/live';
import type { PrivacyPermit } from '../../src/shared/privacy';
const hooks = () => (globalThis as any).__privacy;
export async function capturePermit(tabId: number | undefined, url: string): Promise<PrivacyPermit | null> {
  if (hooks()?.capturePermit) return hooks().capturePermit(tabId, url);
  const live = await getLiveSession();
  return live && live.state === 'capturing' && !live.privacy_gate ? {
    session_id: live.id, epoch: live.privacy_epoch ?? 0, tab_id: tabId ?? -1, url, signature: 'fixture',
  } : null;
}
export async function validatePermit(permit: PrivacyPermit) {
  if (hooks()?.validatePermit) return hooks().validatePermit(permit);
  const live = await getLiveSession();
  return live?.id === permit.session_id && live.state === 'capturing' && !live.privacy_gate && (live.privacy_epoch ?? 0) === permit.epoch;
}
export async function checkCurrentScreen(tabId?: number) { await hooks()?.checkCurrentScreen?.(tabId); }
export async function prepareResume(id: string, gateId?: string, automaticGateId?: string) { return hooks()?.prepareResume ? hooks().prepareResume(id, gateId, automaticGateId) : true; }
export async function invalidatePrivacyApproval(tabId?: number) { await hooks()?.invalidatePrivacyApproval?.(tabId); }
