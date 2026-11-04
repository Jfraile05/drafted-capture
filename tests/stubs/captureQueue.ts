// Screenshot capture is the slow step in every handler. Tests control when it
// resolves through globalThis.__capture so they can pause or stop mid-capture.
export async function captureVisible(): Promise<null> {
  const hook = (globalThis as any).__capture as (() => Promise<void>) | undefined;
  if (hook) await hook();
  return null;
}
export function resetCaptureQueue(): void {}
