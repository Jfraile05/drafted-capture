import { OWN_TERMS_KEY, getOwnTerms } from '../shared/storage/ownTerms';
import { ownTerms } from '../shared/utils/redact';
import { ensureOffscreen } from './offscreen';

/** Load the student's own name and email terms and keep them for the browser
 *  session. On failure the last saved terms stay, and the other detectors
 *  still apply. */
export async function refreshOwnTerms(): Promise<void> {
  try {
    await ensureOffscreen();
    const identity = await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'OWN_IDENTITY',
    });
    if (!identity) return;
    await chrome.storage.session.set({ [OWN_TERMS_KEY]: ownTerms(identity) });
  } catch {
    // Offline or signed out: keep what we have.
  }
}

/** For a service worker that wakes after a browser restart mid-session. */
export async function refreshOwnTermsIfMissing(): Promise<void> {
  if ((await getOwnTerms()).length === 0) await refreshOwnTerms();
}
