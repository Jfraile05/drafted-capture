// Minimal in-memory chrome mock shared by the tests. Storage values are cloned
// on the way in and out, like the real storage areas.
import { WORKFLOWS } from '../../src/shared/workflows';

export const workflowAccess = () => ({
  uid: 'student',
  workflows: WORKFLOWS.map((workflow) => ({
    ...workflow,
    project_id: `test-${workflow.id}`,
    org_id: 'test-org',
  })),
});

const area = () => {
  const data: Record<string, unknown> = {};
  const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  return {
    data,
    get: async (k: string) => {
      await Promise.resolve();
      return k in data ? { [k]: clone(data[k]) } : {};
    },
    set: async (o: Record<string, unknown>) => {
      await Promise.resolve();
      for (const [k, v] of Object.entries(o)) data[k] = clone(v);
    },
    remove: async (k: string) => {
      await Promise.resolve();
      delete data[k];
    },
  };
};

export const session = area();
export const local = area();
export const idleCalls: number[] = [];
export const alarmCreates: { name: string; info: { when?: number; periodInMinutes?: number } }[] =
  [];
export const alarmClears: string[] = [];

/** Open system notifications by id. */
export const notices = new Map<string, { title: string; buttons?: { title: string }[] }>();

(globalThis as any).chrome = {
  notifications: {
    create: async (id: string, options: { title: string; buttons?: { title: string }[] }) => {
      notices.set(id, options);
      return id;
    },
    clear: async (id: string) => notices.delete(id),
    getAll: (cb: (open: object) => void) =>
      cb(Object.fromEntries([...notices.keys()].map((id) => [id, true]))),
  },
  storage: { session, local },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
  alarms: {
    create: async (name: string, info: { when?: number; periodInMinutes?: number }) => {
      alarmCreates.push({ name, info });
    },
    clear: async (name: string) => {
      alarmClears.push(name);
      return true;
    },
  },
  tabs: { query: async () => [], sendMessage: async () => {}, get: async () => ({}) },
  scripting: { executeScript: async () => {} },
  windows: { getCurrent: async () => ({ width: 1200, height: 800 }) },
  runtime: {
    ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
    getContexts: async () => [{}],
    getManifest: () => ({ content_scripts: [] }),
    getURL: (path: string) => `chrome-extension://test/${path}`,
    sendMessage: async (message: { type: string }) =>
      message.type === 'WORKFLOW_ACCESS' ? workflowAccess() : { ok: true },
  },
  idle: { setDetectionInterval: (s: number) => idleCalls.push(s) },
};
