// Minimal in-memory chrome mock shared by the tests. Storage values are cloned
// on the way in and out, like the real storage areas.
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
export const alarmCreates: { name: string; info: { when?: number; periodInMinutes?: number } }[] = [];
export const alarmClears: string[] = [];

(globalThis as any).chrome = {
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
  runtime: { getManifest: () => ({ content_scripts: [] }) },
  idle: { setDetectionInterval: (s: number) => idleCalls.push(s) },
};
