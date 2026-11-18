export const PRIVACY_CONFIG = {
  collection: 'capture_config',
  document: 'privacy',
  cacheKey: 'drafted-managed-privacy',
  alarmName: 'drafted-privacy-refresh',
  refreshMinutes: 60,
  inspectionTimeoutMs: 2000,
  observerDebounceMs: 150,
  maxScanElements: 50000,
  scanBudgetMs: 100,
  continuousVideoEnabled: false,
  prompt: 'This screen may contain sensitive information. Are you sure you want to record this?',
  // Whole sites where pages are mostly private (balances, messages, records), so
  // recording pauses until the student approves. Everything else keeps recording
  // and has personal details masked instead (see content/sensitiveRegions.ts).
  sitePauseReasons: ['banking', 'government', 'healthcare', 'messaging', 'passwords'],
  selectors: {
    messaging:
      '[aria-label="Inbox" i], [data-testid="inbox" i], [role="main"][aria-label*="inbox" i], [role="heading"][aria-label="Inbox" i]',
  },
  inboxHeadingPattern:
    '^(inbox|bandeja de entrada|boîte de réception|posteingang|caixa de entrada)(\\s*\\(\\d+\\))?$',
} as const;
