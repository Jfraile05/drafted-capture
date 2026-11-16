import type { User } from 'firebase/auth';
import { DEMO } from './config';

const user = { uid: DEMO.uid, email: DEMO.email } as User;
export async function getCurrentUser() {
  return user;
}
export function useAuth() {
  return { user, loading: false };
}
export function onAuthChanged(cb: (value: User | null) => void) {
  const timer = setTimeout(() => cb(user), 0);
  return () => clearTimeout(timer);
}
export async function signInEmail(): Promise<User> {
  return user;
}
// The demo footer opens test controls instead of signing out a real account.
export async function signOutUser() {
  await chrome.runtime.openOptionsPage();
}
