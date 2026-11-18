// Offscreen pages have no chrome.storage, so demo code that runs there asks the
// service worker (src/demo/background.ts) to read and write it instead.
export const SYNTHETIC_STORAGE = 'SYNTHETIC_STORAGE';

export async function readLocal<T>(key: string): Promise<T | undefined> {
  if (chrome.storage?.local) return (await chrome.storage.local.get(key))[key] as T | undefined;
  const reply = await chrome.runtime.sendMessage({ type: SYNTHETIC_STORAGE, key });
  return reply?.value as T | undefined;
}

export async function writeLocal(key: string, value: unknown): Promise<void> {
  if (chrome.storage?.local) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }
  await chrome.runtime.sendMessage({ type: SYNTHETIC_STORAGE, key, value, write: true });
}
