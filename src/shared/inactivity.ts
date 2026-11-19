import { pauseTimestamp } from './activeTime';
import { ABANDONED_AFTER_MS } from './constants';
import type { LiveSession } from './types';

/** When a paused session will be stopped and submitted if nobody comes back. */
export function autoSubmitAt(live: LiveSession): number {
  return pauseTimestamp(live) + ABANDONED_AFTER_MS;
}

/** What the popup says under a paused session. Idle pauses say why it paused. */
export function pauseNotice(live: LiveSession, locale?: string): string {
  const time = new Date(autoSubmitAt(live)).toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return live.pause_reason === 'idle'
    ? `Paused because you were inactive. If you don't continue, Sidekick submits this session at ${time}.`
    : `Paused. If you don't resume, Sidekick submits this session at ${time}.`;
}
