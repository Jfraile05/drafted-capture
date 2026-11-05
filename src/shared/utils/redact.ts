// On-device redaction. Runs in the service worker before a step is stored, so
// nothing sensitive reaches IndexedDB, the live feed, exports, or an upload.
// Screenshots are not redacted here: they are pixels, and stay governed by the
// allowlist and blocklist.

import type { Step } from '../types';

const SECRET_PATTERNS: RegExp[] = [
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{36,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/g,
];
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
const CARD_CANDIDATE = /\b(?:\d[ -]?){12,18}\d\b/g;
const SENSITIVE_PARAM =
  /([?&#;]|^)((?:access_|id_|refresh_)?token|code|(?:api_?)?key|secret|passw(?:or)?d|pwd|auth|session(?:_?id)?|sid|signature|sig)=([^&#]*)/gi;

function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

export function redactText(text: string): string {
  let out = text;
  for (const p of SECRET_PATTERNS) out = out.replace(p, '[secret]');
  out = out.replace(EMAIL, '[email]');
  out = out.replace(SSN, '[ssn]');
  out = out.replace(CARD_CANDIDATE, (m) => {
    const digits = m.replace(/[ -]/g, '');
    return digits.length >= 13 && digits.length <= 19 && luhn(digits) ? '[card]' : m;
  });
  return out;
}

export function redactUrl(url: string): string {
  if (!url) return url;
  return redactText(url.replace(SENSITIVE_PARAM, '$1$2=[redacted]'));
}

/** Scrub a step in place. `maskAllInputs` also hides ordinary typed text. */
export function redactStep(step: Step, opts: { maskAllInputs: boolean }): void {
  const { action, dom, origin } = step;
  const sensitive = !!dom && (dom.sensitive === true || dom.input_type === 'password');

  if (action.type === 'type' && action.text !== undefined) {
    if (sensitive) action.text = '[redacted]';
    else if (opts.maskAllInputs) action.text = '•'.repeat(action.text.length);
    else action.text = redactText(action.text);
  }
  if (action.url) action.url = redactUrl(action.url);

  if (dom) {
    if (dom.input_value) {
      if (sensitive) dom.input_value = '[redacted]';
      else if (opts.maskAllInputs) dom.input_value = '•'.repeat(dom.input_value.length);
      else dom.input_value = redactText(dom.input_value);
    }
    if (dom.text) dom.text = redactText(dom.text);
    if (dom.aria_label) dom.aria_label = redactText(dom.aria_label);
  }

  origin.url = redactUrl(origin.url);
  origin.title = redactText(origin.title);
}
