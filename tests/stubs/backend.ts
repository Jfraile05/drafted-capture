export const backend = {
  records: new Map<string, any>(),
  uploads: [] as string[],
  failUpload: false,
  failCommit: false,
  failRead: false,
};
export const auth = { currentUser: { uid: 'student', email: 'student@example.invalid' } };
export const db = {};
export const storage = {};
export const doc = (_db: unknown, collection: string, id: string) => `${collection}/${id}`;
const snapshot = (path: string) => ({
  exists: () => backend.records.has(path),
  data: () => structuredClone(backend.records.get(path)),
});
export const getDoc = async (path: string) => snapshot(path);
export const getDocFromServer = async (path: string) => {
  if (backend.failRead) throw new Error('Server unavailable');
  return snapshot(path);
};
export const ref = (_storage: unknown, path: string) => path;
export async function uploadBytes(path: string) {
  if (backend.failUpload) throw new Error('Storage offline');
  backend.uploads.push(path);
}
export const getDownloadURL = async (path: string) => `https://storage.example.invalid/${path}`;
export const increment = (value: number) => ({ increment: value });
function patch(value: any, updates: any) {
  for (const [path, update] of Object.entries(updates)) {
    const keys = path.split('.');
    let current = value;
    for (const key of keys.slice(0, -1)) current = current[key] ??= {};
    const key = keys.at(-1)!;
    current[key] = update && typeof update === 'object' && 'increment' in update
      ? (current[key] ?? 0) + update.increment : update;
  }
  return value;
}
export async function updateDoc(path: string, updates: any) {
  backend.records.set(path, patch(structuredClone(backend.records.get(path)), updates));
}
export async function runTransaction(_db: unknown, callback: (tx: any) => Promise<any>) {
  const writes: Array<() => void> = [];
  const result = await callback({
    get: getDoc,
    set: (path: string, value: any) => writes.push(() => backend.records.set(path, structuredClone(value))),
    update: (path: string, value: any) => writes.push(() => {
      backend.records.set(path, patch(structuredClone(backend.records.get(path)), value));
    }),
  });
  if (backend.failCommit) throw new Error('Transaction unavailable');
  for (const write of writes) write();
  return result;
}
export const ensureAccountDocument = async () => ({ healed: false });
export const buildAnnotatorBlock = ({ userId }: { userId: string }) => ({ annotator_id: userId });
export const buildResponsesProvenance = () => null;
export const CONSENT_VERSION = 'test';
export const DEFAULT_RELEASE_ID = 'test';
export const computeQualityScore = () => 80;
export const computeBadgeLevel = () => null;
export const checkBadgeEarned = () => false;
export const evaluateGoldSubmission = () => null;
export const computeUpdatedGoldTracking = () => ({});
export const recordTrainingTask = async () => null;
export const issueEarnedCertificates = async () => [];
export const flushTrajectory = () => {};
export const getTrajectorySummary = () => ({});
export const capture = () => {};
export const TASK_EVENTS = {};
