import { PRIVACY_CONFIG } from '../config/privacy';
import { BUILTIN_PRIVACY_POLICY, type PrivacyPolicy, parsePrivacyPolicy } from '../shared/privacy';
import { ensureOffscreen } from './offscreen';

export async function getPrivacyPolicy(): Promise<PrivacyPolicy> {
  const stored = (await chrome.storage.local.get(PRIVACY_CONFIG.cacheKey))[PRIVACY_CONFIG.cacheKey];
  const cached = parsePrivacyPolicy(stored);
  return cached && cached.version >= BUILTIN_PRIVACY_POLICY.version
    ? cached
    : BUILTIN_PRIVACY_POLICY;
}

export async function refreshPrivacyPolicy(): Promise<void> {
  try {
    await ensureOffscreen();
    const result = await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'PRIVACY_POLICY',
    });
    const policy = parsePrivacyPolicy(result);
    if (policy && policy.version > (await getPrivacyPolicy()).version) {
      await chrome.storage.local.set({ [PRIVACY_CONFIG.cacheKey]: policy });
    }
  } catch {
    // Retain the last valid policy offline. The bundled policy is always available.
  }
}
