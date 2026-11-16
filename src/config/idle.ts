export const IDLE_CONFIG = {
  defaultMs: 180000,
  minMs: 120000,
  maxMs: 180000,
  activityReportMs: 1000,
  alarmName: 'drafted-input-idle',
  notice:
    'Recording paused while you were away. Continue recording here? Opening a new safe page resumes automatically.',
} as const;
export function idleThreshold(value: number): number {
  return Number.isFinite(value)
    ? Math.max(IDLE_CONFIG.minMs, Math.min(IDLE_CONFIG.maxMs, value))
    : IDLE_CONFIG.defaultMs;
}
