import { activeElapsed, pauseTimestamp } from './activeTime';
import { earningsForActiveTime } from './earnings';
import type { LiveSession } from './types';
import { annotationAvailable } from './workflows';

/** Only the clock and pinned rate are sent to the on-page ticker. */
export type EarningsClock = Pick<
  LiveSession,
  'id' | 'state' | 'started_at' | 'paused_at' | 'pauses' | 'pause_reason'
> & {
  hourly_rate_cents: number | null;
  annotation_rate_cents?: number;
};

export function earningsClock(live: LiveSession | null): EarningsClock | null {
  if (!live || live.state === 'idle') return null;
  return {
    id: live.id,
    state: live.state,
    pause_reason: live.pause_reason,
    started_at: live.started_at,
    paused_at: live.state === 'paused' ? pauseTimestamp(live) : undefined,
    pauses: live.pauses,
    hourly_rate_cents: live.metadata.workflow?.hourly_rate_cents ?? null,
    annotation_rate_cents:
      live.metadata.workflow?.annotation_opted_in && annotationAvailable(live.metadata.workflow)
        ? live.metadata.workflow.annotation_rate_cents
        : 0,
  };
}

export function liveEarnings(clock: EarningsClock, now: number) {
  return earningsForActiveTime(
    activeElapsed(clock, now),
    clock.hourly_rate_cents,
    clock.annotation_rate_cents,
  );
}
