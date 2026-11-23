// The signed-in student's own name and email terms (see ownTerms in
// utils/redact.ts), kept for the browser session so every screenshot and step
// can mask them without a network call.

export const OWN_TERMS_KEY = 'own-identity-terms';

export async function getOwnTerms(): Promise<string[]> {
  const stored = (await chrome.storage.session.get(OWN_TERMS_KEY))[OWN_TERMS_KEY];
  return Array.isArray(stored) ? stored.filter((t): t is string => typeof t === 'string') : [];
}
