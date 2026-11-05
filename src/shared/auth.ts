// ════════════════════════════════════════════════════════════════════════
//  Auth module for the extension.
//
//  Email and password sign-in through Firebase. indexedDBLocalPersistence
//  means once logged in, onAuthStateChanged restores the user on every popup
//  open. The extension never reads another site's storage or tokens.
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

/** React hook for auth state. */
export function useAuth(): { user: User | null; loading: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u: User | null) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { user, loading };
}
