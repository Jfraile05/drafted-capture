'use client';

/**
 * Account self-heal helper.
 *
 * A small but load-bearing safety net for a state we should never be in:
 * a user has a valid Firebase Auth account but no `drafted-accounts/{email}`
 * Firestore profile document. That state is normally created during
 * onboarding (StepSuccess) but can be left dangling if the Firestore write
 * fails after the Auth user is created, or if an account was provisioned by
 * a script that only wrote the Auth side.
 *
 * When this happens the entire dashboard stays stuck on "Loading your
 * profile..." and every task submission throws "User account not found".
 * Instead of bricking the user, we write a minimal stub document so
 * downstream code (profile snapshot, role-add effects, task submission,
 * badges, certs) can run normally. The user can edit anything that was
 * left blank from the dashboard's regular edit modals.
 *
 * Idempotent by design: if the doc already exists, we leave it alone and
 * just return what's there.
 */

import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Ensure a `drafted-accounts/{email}` document exists for the given
 * authenticated user. Creates a minimal stub if one is missing.
 *
 * @param {import('firebase/auth').User} currentUser - Firebase Auth user.
 * @param {object} [options]
 * @param {string} [options.source] - Where the self-heal was triggered
 *   from (e.g. 'auth_context', 'task_submission', 'profile_snapshot'). Stored
 *   on the doc so we can audit how often each path fires.
 * @returns {Promise<{ healed: boolean, data: object|null, error?: Error }>}
 *   `healed: true` means we just wrote a stub. `healed: false` means the
 *   doc already existed (no-op) or we failed to write.
 */
export async function ensureAccountDocument(currentUser, options = {}) {
  if (!currentUser?.email) {
    return { healed: false, data: null };
  }

  const email = currentUser.email.toLowerCase().trim();
  const userDocRef = doc(db, 'drafted-accounts', email);

  try {
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      return { healed: false, data: snap.data() };
    }
  } catch (err) {
    console.error('[accountSelfHeal] Failed to read profile before heal:', err);
    return { healed: false, data: null, error: err };
  }

  // Best-effort name extraction from the Firebase Auth profile. The user can
  // always edit these via the dashboard once they're unblocked.
  const displayName = (currentUser.displayName || '').trim();
  const [firstName = '', ...rest] = displayName.split(/\s+/);
  const lastName = rest.join(' ');

  const stub = {
    email,
    uid: currentUser.uid,
    firstName: firstName || '',
    lastName: lastName || '',
    university: '',
    major: '',
    graduationMonth: '',
    graduationYear: null,
    linkedInURL: '',
    gitHubURL: '',
    websiteURL: '',
    companyOptions: [],
    video1: '',
    video2: '',
    video3: '',
    resume: '',
    experience: [],
    emailVerified: !!currentUser.emailVerified,
    accountSelfHealed: true,
    accountSelfHealedAt: new Date().toISOString(),
    accountSelfHealedSource: options.source || 'unknown',
    createdAt: serverTimestamp(),
  };

  try {
    // merge:true so a parallel write that lands first (e.g. role-add effect
    // creating just { specialRoles: [...] }) is preserved instead of clobbered.
    await setDoc(userDocRef, stub, { merge: true });
    console.warn(
      `[accountSelfHeal] Wrote stub profile for ${email} (source=${options.source || 'unknown'}).`,
    );
    return { healed: true, data: stub };
  } catch (err) {
    console.error('[accountSelfHeal] Failed to write stub profile:', err);
    return { healed: false, data: null, error: err };
  }
}
