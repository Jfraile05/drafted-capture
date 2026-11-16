export const PRIVACY_CONFIG = {
  collection: 'capture_config',
  document: 'privacy',
  cacheKey: 'drafted-managed-privacy',
  alarmName: 'drafted-privacy-refresh',
  refreshMinutes: 60,
  inspectionTimeoutMs: 2000,
  observerDebounceMs: 150,
  maxScanElements: 12000,
  scanBudgetMs: 100,
  continuousVideoEnabled: false,
  prompt: 'This screen may contain sensitive information. Are you sure you want to record this?',
  selectors: {
    payment:
      'input[autocomplete*="cc-" i], input[name*="card" i], input[id*="card-number" i], input[name*="cvv" i], input[name*="cvc" i], input[placeholder*="card number" i]',
    login:
      'input[type="password"], input[autocomplete~="current-password" i], input[autocomplete~="new-password" i], input[autocomplete~="one-time-code" i]',
    address:
      'input[autocomplete~="street-address" i], textarea[autocomplete~="street-address" i], input[autocomplete*="address-line" i], input[name*="address" i], textarea[name*="address" i]',
    government:
      'input[name*="ssn" i], input[id*="ssn" i], input[autocomplete="social-security-number"], input[placeholder*="social security" i], input[name*="passport" i]',
    messaging:
      '[aria-label="Inbox" i], [data-testid="inbox" i], [role="main"][aria-label*="inbox" i], [role="heading"][aria-label="Inbox" i]',
  },
  fieldTerms: {
    payment: [
      'card number',
      'credit card',
      'debit card',
      'cardholder',
      'cvv',
      'cvc',
      'routing number',
      'iban',
    ],
    address: ['street address', 'address line', 'shipping address', 'billing address'],
    government: ['social security', 'ssn', 'passport', 'national id'],
    login: ['password', 'verification code', 'one time code'],
  },
  inboxHeadingPattern:
    '^(inbox|bandeja de entrada|boîte de réception|posteingang|caixa de entrada)(\\s*\\(\\d+\\))?$',
} as const;
