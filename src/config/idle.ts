export const IDLE_CONFIG = {
  defaultMs: 120000,
  minMs: 120000,
  maxMs: 120000,
  activityReportMs: 1000,
  alarmName: 'drafted-input-idle',
  notice:
    'Paused because you were inactive. Continue recording here? Opening a new safe page resumes automatically. If nobody comes back, this session is submitted after 20 minutes.',
} as const;
export function idleThreshold(value: number): number {
  return Number.isFinite(value)
    ? Math.max(IDLE_CONFIG.minMs, Math.min(IDLE_CONFIG.maxMs, value))
    : IDLE_CONFIG.defaultMs;
}
