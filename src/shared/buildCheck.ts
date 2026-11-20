declare const __BUILD_ID__: string | undefined;

/** Changes with every production build. The popup and the background compare
 *  it to spot a background still running an older build. */
export const BUILD_ID = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

/**
 * When the files of an unpacked extension are replaced, Chrome can keep running
 * the old background script until the extension is reloaded, so the popup runs
 * the new build while the background runs the old one and newer requests fail.
 *
 * True when the background's answer to "what build are you?" shows that. The
 * popup only tells the person. It never reloads the extension on its own:
 * a reload closes the popup and blanks an open review panel.
 */
export function backgroundIsStale(answer: { build?: string; error?: string }): boolean {
  if (answer.build !== undefined) return answer.build !== BUILD_ID;
  // A background from before this check does not know the request.
  return answer.error?.includes('Unknown message type') === true;
}
