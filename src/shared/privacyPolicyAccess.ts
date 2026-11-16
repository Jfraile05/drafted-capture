import { doc, getDocFromServer } from 'firebase/firestore';
import { PRIVACY_CONFIG } from '../config/privacy';
// @ts-expect-error - vendored JS module, no types
import { db } from '../vendor/seeker/firebaseInit.js';

export async function loadPrivacyPolicy(): Promise<unknown> {
  const snapshot = await getDocFromServer(
    doc(db, PRIVACY_CONFIG.collection, PRIVACY_CONFIG.document),
  );
  return snapshot.exists() ? snapshot.data() : null;
}
