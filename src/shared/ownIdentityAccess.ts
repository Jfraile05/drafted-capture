import { doc, getDoc } from 'firebase/firestore';
// @ts-expect-error - vendored JS module, no types
import { db } from '../vendor/seeker/firebaseInit.js';
import { getCurrentUser } from './auth';

/** The signed-in student's email and name, so their own name can be masked on
 *  every page they record. The name comes from their Drafted profile, with the
 *  sign-in display name as a fallback. Null when nobody is signed in. */
export async function loadOwnIdentity(): Promise<{ email: string | null; names: string[] } | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const names = [user.displayName ?? ''];
  if (user.email) {
    try {
      const profile = (
        await getDoc(doc(db, 'drafted-accounts', user.email.toLowerCase().trim()))
      ).data();
      names.push(
        [profile?.firstName, profile?.lastName].filter((v) => typeof v === 'string').join(' '),
      );
    } catch {
      // Profile unreadable: the sign-in name and email still apply.
    }
  }
  return { email: user.email, names };
}
