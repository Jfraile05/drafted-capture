/** A finished pause, as [paused at, resumed at] in ms. */
export type Pause = [number, number];

type SessionClock = {
  state?: 'idle' | 'capturing' | 'paused';
  started_at: number;
  pauses?: Pause[];
  paused_at?: number;
  recent?: { timestamp: number }[];
};

/** Older paused sessions have no exact pause timestamp. Freeze them at the
 * last known activity, rather than counting time spent away from the popup. */
export function pauseTimestamp(live: SessionClock): number {
  return (
    live.paused_at ??
    Math.max(
      live.started_at,
      ...(live.pauses ?? []).map((pause) => pause[1]),
      ...(live.recent ?? []).map((step) => step.timestamp),
    )
  );
}

/** Recording time from `startedAt` up to `t`, leaving out every pause that
 *  overlaps it. Used for the live timer, step times and session length, so
 *  paused time never counts anywhere. */
export function activeOffset(startedAt: number, pauses: Pause[] | undefined, t: number): number {
  let paused = 0;
  for (const [from, to] of pauses ?? []) {
    if (from >= t) continue;
    paused += Math.min(to, t) - from;
  }
  return Math.max(0, t - startedAt - paused);
}

/** Live recording time so far. While paused it stays fixed at the moment
 *  Pause was pressed. */
export function activeElapsed(live: SessionClock, now: number): number {
  const end = live.state === 'paused' ? pauseTimestamp(live) : (live.paused_at ?? now);
  return activeOffset(live.started_at, live.pauses, end);
}

/** Preserve the fractional second and repaint at its next boundary. */
export function nextTimerTick(elapsed: number): number {
  return 1000 - (elapsed % 1000);
}
