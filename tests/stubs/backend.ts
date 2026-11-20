export const backend = {
  records: new Map<string, any>(),
  uploads: [] as string[],
  /** What is in Storage, by path. */
  files: new Map<string, Blob>(),
  /** Refuse an upload to a path that already has a file, like the screenshot rules. */
  denyOverwrite: false,
  /** Fail every upload after this many have succeeded. */
  failAfter: Number.POSITIVE_INFINITY,
  /** Upload attempts, including failed ones, and the most running at once. */
  attempts: 0,
  inFlight: 0,
  maxInFlight: 0,
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
export async function uploadBytes(path: string, blob?: Blob) {
  backend.attempts++;
  if (backend.failUpload || backend.uploads.length >= backend.failAfter)
    throw new Error('Storage offline');
  if (backend.denyOverwrite && backend.files.has(path)) throw new Error('storage/unauthorized');
  backend.maxInFlight = Math.max(backend.maxInFlight, ++backend.inFlight);
  await new Promise((resolve) => setTimeout(resolve, 0));
  backend.inFlight--;
  backend.uploads.push(path);
  if (blob) backend.files.set(path, blob);
}
export async function getMetadata(path: string) {
  const file = backend.files.get(path);
  if (!file) throw new Error('storage/object-not-found');
  return { size: file.size };
}
export async function getBytes(path: string) {
  const file = backend.files.get(path);
  if (!file) throw new Error('storage/object-not-found');
  return file.arrayBuffer();
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
