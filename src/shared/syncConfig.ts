export const SYNC_CONFIG = {
  alarmName: 'drafted-sync',
  recoveryMinutes: 1,
  retryBaseMs: 60_000,
  retryMaxMs: 15 * 60_000,
} as const;
