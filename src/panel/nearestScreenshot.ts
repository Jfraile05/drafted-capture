import type { Step } from '../shared/types';

/**
 * Index of the step whose screenshot to show for `index`. A step's own
 * screenshot wins. Some steps have none (new or closed tabs, or a capture
 * Chrome refused), so fall back to the closest earlier screenshot, then the
 * closest later one. That way step 1 shows the session's first screenshot.
 */
export function nearestScreenshotIndex(steps: Step[], index: number): number | null {
  if (steps[index]?.screenshot) return index;
  for (let i = index - 1; i >= 0; i--) if (steps[i].screenshot) return i;
  for (let i = index + 1; i < steps.length; i++) if (steps[i].screenshot) return i;
  return null;
}
