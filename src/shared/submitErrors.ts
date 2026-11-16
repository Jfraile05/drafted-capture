/** True when Firestore refused the write because of its security rules. */
export function isPermissionDenied(raw: string | undefined): boolean {
  return Boolean(raw && /permission-denied|insufficient permissions/i.test(raw));
}
