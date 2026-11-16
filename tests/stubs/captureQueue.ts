// Screenshot capture is the slow step in every handler. Tests control when it
// resolves through globalThis.__capture so they can pause or stop mid-capture.
import type { ScreenshotRef } from '../../src/shared/types';

export async function captureVisible(opts?: unknown): Promise<ScreenshotRef | null> {
  const hook = (globalThis as any).__capture as ((opts?: unknown) => Promise<ScreenshotRef | void>) | undefined;
  return (await hook?.(opts)) ?? null;
}
export function resetCaptureQueue(): void {}
