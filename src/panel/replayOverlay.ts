import { type Pause, activeOffset } from '../shared/activeTime';
import type { ScreenshotRef, Step } from '../shared/types';

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A CSS pixel point on the page, as percentages of the screenshot. */
export function pointPercent(
  [x, y]: [number, number],
  shot: ScreenshotRef,
): { left: number; top: number } {
  return { left: ((x * shot.dpr) / shot.width) * 100, top: ((y * shot.dpr) / shot.height) * 100 };
}

/** A CSS pixel rect on the page, as percentages of the screenshot. */
export function rectPercent(
  rect: { x: number; y: number; width: number; height: number },
  shot: ScreenshotRef,
): Box {
  return {
    left: ((rect.x * shot.dpr) / shot.width) * 100,
    top: ((rect.y * shot.dpr) / shot.height) * 100,
    width: ((rect.width * shot.dpr) / shot.width) * 100,
    height: ((rect.height * shot.dpr) / shot.height) * 100,
  };
}

/** Steps the student did up to `index`, newest first. Timed screenshots are
 *  left out: they are not actions. */
export function feedSteps(steps: Step[], index: number): number[] {
  const out: number[] = [];
  for (let i = Math.min(index, steps.length - 1); i >= 0; i--) {
    if (steps[i].action.type !== 'screenshot') out.push(i);
  }
  return out;
}

/** What to show for typed text. Sensitive fields are stored as "[redacted]". */
export function typedText(step: Step): string | null {
  const text = step.action.text;
  if (!text) return null;
  if (text === '[redacted]' || step.dom?.sensitive) return 'Hidden for privacy';
  return text;
}

/** Longest wait between two steps in replay. A longer gap (reading a page,
 *  thinking) is shortened to this so the replay never looks frozen. */
export const MAX_GAP_MS = 15_000;

/** How long replay waits on step `index` before the next one: the real time
 *  between the two steps, minus any pause, divided by the speed. */
export function stepDelay(
  steps: Step[],
  index: number,
  startedAt: number,
  pauses: Pause[] | undefined,
  speed: number,
): number {
  const step = steps[index];
  const next = steps[index + 1];
  if (!step || !next) return 1000 / speed;
  const gap =
    activeOffset(startedAt, pauses, next.timestamp) -
    activeOffset(startedAt, pauses, step.timestamp);
  return Math.max(100, Math.min(MAX_GAP_MS, gap) / speed);
}
