declare const __BUILD_ID__: string | undefined;

/** Changes with every production build. The popup and the background compare
 *  it to spot a background still running an older build. */
export const BUILD_ID = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

export const BUILD_RELOAD_KEY = 'build_reload_at';
const RELOAD_COOLDOWN_MS = 60_000;

/**
 * When files are replaced under an unpacked extension without reloading it,
 * the popup runs the new build while the background keeps the old one, and
 * newer requests fail. Reload in that case, at most once a minute, and never
 * while a recording is open.
 */
export function shouldReloadForBuild(
  answer: { build?: string; error?: string },
  recording: boolean,
  lastReloadAt: number | undefined,
  now: number,
): boolean {
  if (recording) return false;
  if (lastReloadAt !== undefined && now - lastReloadAt < RELOAD_COOLDOWN_MS) return false;
  if (answer.build !== undefined) return answer.build !== BUILD_ID;
  // A background from before this check does not know the request.
  return answer.error?.includes('Unknown message type') === true;
}
