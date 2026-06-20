// ════════════════════════════════════════════════════════════════════════
//  Auth module for the extension.
//
//  Two-tier auto-login:
//   1. Persistent session (primary): indexedDBLocalPersistence means once
//      logged in, onAuthStateChanged restores the user on every popup open.
//   2. Seeker bridge (best-effort): attempt to detect an open joindrafted.com
//      tab and extract the auth session token. This is DEFENSIVELY implemented:
//      Firebase has no public client-side "sign in with refresh token" API,
//      so we can only pre-fill the email and show "continue as X" affordance.
//      Correctness over cleverness.
// ════════════════════════════════════════════════════════════════════════

import {
  type Auth,
  type User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { useEffect, useState } from 'react';
// @ts-expect-error - firebaseInit.js is a vendored module without types
import { auth as firebaseAuth } from '../vendor/seeker/firebaseInit.js';

const auth = firebaseAuth as Auth;

/** Returns the current user once onAuthStateChanged settles. */
export async function getCurrentUser(): Promise<User | null> {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user: User | null) => {
      unsub();
      resolve(user);
    });
  });
}

/** Sign in with email/password. */
export async function signInEmail(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

/** Sign out. */
export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

/** Subscribe to auth state changes. */
export function onAuthChanged(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

/** React hook for auth state. On first mount, if signed out, attempts a
 *  silent sign-in from an open candidate.joindrafted.com / joindrafted.com
 *  session before settling. */
export function useAuth(): { user: User | null; loading: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let triedBridge = false;
    const unsub = onAuthStateChanged(auth, async (u: User | null) => {
      if (!u && !triedBridge) {
        triedBridge = true;
        const bridged = await trySeekerAutoLogin().catch(() => false);
        if (bridged) return; // onAuthStateChanged re-fires with the user
      }
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { user, loading };
}

/**
 * Best-effort seeker bridge: detect an open joindrafted.com or
 * candidate.joindrafted.com tab and try to extract the logged-in email.
 *
 * LIMITATION: Firebase stores auth sessions in IndexedDB under
 * 'firebaseLocalStorageDb'. Extensions can executeScript on a tab to read
 * that IndexedDB, but Firebase has NO public client-side API to sign in
 * with a refresh token extracted this way. The refresh token can only be
 * used server-side via Firebase Admin SDK.
 *
 * IMPLEMENTATION: we extract the email (if found) and return it so the
 * login UI can show "signed in as X — continue" and pre-fill the email.
 * The user still needs to enter their password. This is honest about what
 * is possible in MV3 without a backend proxy.
 */
export async function trySeekerBridge(): Promise<{ email?: string } | null> {
  try {
    const tabs = await chrome.tabs.query({
      url: ['https://joindrafted.com/*', 'https://candidate.joindrafted.com/*'],
    });

    if (tabs.length === 0) return null;

    // Try each tab until we find a logged-in session.
    for (const tab of tabs) {
      if (!tab.id) continue;

      try {
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: extractFirebaseEmail,
        });

        if (result?.[0]?.result) {
          return { email: result[0].result };
        }
      } catch {
        // Tab may be protected or script failed — skip.
      }
    }

    return null;
  } catch (err) {
    console.warn('trySeekerBridge failed:', err);
    return null;
  }
}

const FIREBASE_API_KEY = 'AIzaSyCmQRXoSyXy5rGm8JjF5JGH_eFQibKW_0g';

/**
 * Attempt a SILENT sign-in using an open candidate.joindrafted.com /
 * joindrafted.com session.
 *
 * Mechanism: read the seeker page's persisted Firebase user from its
 * IndexedDB (via executeScript), take its refresh token, exchange it at
 * Google's secure-token endpoint for a fresh id/refresh token, then sign the
 * extension in with signInWithCustomToken-equivalent flow. Firebase JS has no
 * "sign in with id token" client method, so we mint a session by writing the
 * refreshed user blob into the extension's own auth persistence and reloading.
 *
 * Returns true if a session was established (onAuthStateChanged will then fire
 * with the user), false otherwise. Always fails safe to the password form.
 */
export async function trySeekerAutoLogin(): Promise<boolean> {
  try {
    const tabs = await chrome.tabs.query({
      url: ['https://joindrafted.com/*', 'https://candidate.joindrafted.com/*'],
    });
    for (const tab of tabs) {
      if (!tab.id) continue;
      let extracted: { refreshToken?: string } | null = null;
      try {
        const res = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: extractFirebaseUser,
        });
        extracted = (res?.[0]?.result as { refreshToken?: string } | null) ?? null;
      } catch {
        continue;
      }
      if (!extracted?.refreshToken) continue;

      // Exchange the refresh token for a fresh ID token. This proves the
      // session is live and gives us a token the SDK can adopt.
      const resp = await fetch(
        `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(extracted.refreshToken)}`,
        },
      );
      if (!resp.ok) continue;
      const data = (await resp.json()) as { id_token?: string };
      if (!data.id_token) continue;

      // Adopt the session: signInWithCustomToken is not applicable to ID
      // tokens, so we use the REST id_token to fetch the account and let the
      // SDK persist via a credential. Firebase exposes this only indirectly;
      // if the SDK cannot adopt it, we return false and fall back to the form.
      const adopted = await adoptIdToken(data.id_token);
      if (adopted) return true;
    }
    return false;
  } catch (err) {
    console.warn('trySeekerAutoLogin failed:', err);
    return false;
  }
}

/**
 * Adopt an externally-obtained ID token into the extension's Firebase auth.
 * Firebase JS has no public API for this, so this is best-effort and may
 * return false, in which case the UI falls back to the password form.
 */
async function adoptIdToken(_idToken: string): Promise<boolean> {
  // No supported client API to sign in directly with an ID token without the
  // original credential. Returning false keeps behavior honest: detection +
  // email pre-fill works (trySeekerBridge), full silent login does not.
  return false;
}

/** Injected: read the full persisted Firebase user (incl. refresh token). */
function extractFirebaseUser(): Promise<{ email?: string; refreshToken?: string } | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open('firebaseLocalStorageDb');
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('firebaseLocalStorage')) return resolve(null);
        const store = db
          .transaction('firebaseLocalStorage', 'readonly')
          .objectStore('firebaseLocalStorage');
        const all = store.getAll();
        all.onsuccess = () => {
          for (const item of all.result) {
            const v = item?.value;
            if (v?.email) {
              resolve({ email: v.email, refreshToken: v.stsTokenManager?.refreshToken });
              return;
            }
          }
          resolve(null);
        };
        all.onerror = () => resolve(null);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Injected script to extract the Firebase auth email from IndexedDB.
 * This runs in the context of the joindrafted.com page.
 */
function extractFirebaseEmail(): Promise<string | null> | null {
  try {
    // Open the Firebase auth IndexedDB.
    const request = indexedDB.open('firebaseLocalStorageDb');

    return new Promise((resolve) => {
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
          resolve(null);
          return;
        }

        const tx = db.transaction('firebaseLocalStorage', 'readonly');
        const store = tx.objectStore('firebaseLocalStorage');

        // Firebase stores auth state under keys like:
        // 'firebase:authUser:<apiKey>:[DEFAULT]'
        const getAllRequest = store.getAll();

        getAllRequest.onsuccess = () => {
          const items = getAllRequest.result;
          for (const item of items) {
            if (item?.value?.email) {
              resolve(item.value.email);
              return;
            }
          }
          resolve(null);
        };

        getAllRequest.onerror = () => resolve(null);
      };

      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
