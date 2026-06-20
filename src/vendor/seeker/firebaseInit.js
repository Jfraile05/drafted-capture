// ════════════════════════════════════════════════════════════════════════
//  Firebase init for the extension.
//
//  Same drafted-6c302 project the seeker app uses, so writes land in the
//  exact same Firestore + Storage. This is the single real init; the
//  sibling `firebase.js` shims at each vendored-code depth re-export from
//  here, so the vendored seeker modules ('../firebase', './firebase',
//  '../lib/firebase') resolve without edits.
//
//  Differences from the seeker's lib/firebase.js:
//   - no 'use client', no analytics (not available in a service worker /
//     extension page),
//   - auth uses indexedDBLocalPersistence so a login survives popup close
//     and is shared across popup, panel, and the service worker.
// ════════════════════════════════════════════════════════════════════════

import { getApps, initializeApp } from 'firebase/app';
import { getAuth, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
  uploadBytesResumable,
} from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyCmQRXoSyXy5rGm8JjF5JGH_eFQibKW_0g',
  authDomain: 'drafted-6c302.firebaseapp.com',
  projectId: 'drafted-6c302',
  storageBucket: 'drafted-6c302.appspot.com',
  messagingSenderId: '739427449972',
  appId: '1:739427449972:web:c02c6a8cdf544c30e52521',
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];

// initializeAuth with explicit IndexedDB persistence is the reliable choice
// inside an extension (no window.localStorage guarantees across contexts).
let auth;
try {
  auth = initializeAuth(app, { persistence: indexedDBLocalPersistence });
} catch {
  // Already initialized (e.g. re-import in same context).
  auth = getAuth(app);
}

const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage, ref, uploadBytes, uploadBytesResumable, getDownloadURL };
