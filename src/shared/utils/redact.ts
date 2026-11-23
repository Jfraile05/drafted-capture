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
const SSN = /\b\d{3}([- ])\d{2}\1\d{4}\b/g;
// Plain digit runs only count right after a label, so order numbers and IDs
// stay readable. Group 1 is the number itself.
const LABELED_SSN = /\b(?:ssn|social security(?: number| no\.?)?)\s*#?\s*:?\s*(\d{9})\b/gi;
const LABELED_PHONE =
  /\b(?:phone|tel|telephone|mobile|cell|call|text|whatsapp)(?:\s*(?:number|no\.?|#))?\s*:?\s*(\+?\d{10,11})\b/gi;
const CARD_CANDIDATE = /\b(?:\d[ -]?){12,18}\d\b/g;
// Phone numbers need separators or a leading +, so plain digit runs like order
// numbers stay readable. North American (850) 555-0123 style, or international
// numbers that start with + and a country code.
const PHONE =
  /(?<![\w+])(?:(?:\+1[ .-]?)?(?:\(\d{3}\)[ .-]?|\d{3}[ .-])\d{3}[ .-]\d{4}|\+(?!1[ .-]?\(?\d{3})\d{1,3}(?:[ .-]?\d{1,4}){2,5})(?![\w-])/g;
const PHONE_DIGITS = { min: 10, max: 15 };

function isPhone(match: string): boolean {
  const digits = match.replace(/\D/g, '').length;
  return digits >= PHONE_DIGITS.min && digits <= PHONE_DIGITS.max;
}
const SENSITIVE_PARAM =
  /([?&#;]|^)((?:access_|id_|refresh_)?token|code|(?:api_?)?key|secret|passw(?:or)?d|pwd|auth|session(?:_?id)?|sid|signature|sig)=([^&#]*)/gi;

// The signed-in student's own name and email. No detector can find names in
// general, but the student's own name is the one most likely to be on screen
// (account menus, "Signed in as", profile pages), so it is masked everywhere.
const MIN_NAME_PART = 3;
const MIN_EMAIL_LOCAL = 4;

/** The words to mask for one student: each full name and its longer parts,
 *  the email, and the part of the email before the @. */
export function ownTerms(identity: {
  email?: string | null;
  names?: readonly string[];
}): string[] {
  const terms = new Set<string>();
  for (const raw of identity.names ?? []) {
    const name = raw.replace(/\s+/g, ' ').trim();
    if (name.length >= MIN_NAME_PART) terms.add(name);
    for (const part of name.split(' ')) if (part.length >= MIN_NAME_PART) terms.add(part);
  }
  const email = identity.email?.trim().toLowerCase() ?? '';
  if (email.includes('@')) {
    terms.add(email);
    const local = email.slice(0, email.indexOf('@'));
    if (local.length >= MIN_EMAIL_LOCAL) terms.add(local);
  }
  return [...terms];
}

/** One case-insensitive pattern for `ownTerms`, matching whole words only, so
 *  "Jordan" is masked but "Jordanian" is not. Null when there is nothing to match. */
export function ownPattern(terms: readonly string[]): RegExp | null {
  if (terms.length === 0) return null;
  const alternatives = [...terms]
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
}

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

export function redactText(text: string, own?: RegExp | null): string {
  let out = text;
  for (const p of SECRET_PATTERNS) out = out.replace(p, '[secret]');
  out = out.replace(EMAIL, '[email]');
  out = out.replace(SSN, '[ssn]');
  out = out.replace(CARD_CANDIDATE, (m) => {
    const digits = m.replace(/[ -]/g, '');
    return digits.length >= 13 && digits.length <= 19 && luhn(digits) ? '[card]' : m;
  });
  out = out.replace(PHONE, (m) => (isPhone(m) ? '[phone]' : m));
  out = out.replace(LABELED_SSN, (m, num: string) => `${m.slice(0, -num.length)}[ssn]`);
  out = out.replace(LABELED_PHONE, (m, num: string) => `${m.slice(0, -num.length)}[phone]`);
  if (own) out = out.replace(own, '[name]');
  return out;
}

/** [start, end) positions of the text `redactText` would replace, so the same
 *  text can be masked where it appears in a screenshot. */
export function findSensitiveSpans(text: string, own?: RegExp | null): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (const p of [...SECRET_PATTERNS, EMAIL, SSN, ...(own ? [own] : [])]) {
    for (const m of text.matchAll(p)) spans.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  }
  for (const m of text.matchAll(PHONE)) {
    if (isPhone(m[0])) spans.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  }
  for (const m of text.matchAll(CARD_CANDIDATE)) {
    const digits = m[0].replace(/[ -]/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) {
      spans.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
    }
  }
  for (const p of [LABELED_SSN, LABELED_PHONE]) {
    for (const m of text.matchAll(p)) {
      const end = (m.index ?? 0) + m[0].length;
      spans.push([end - m[1].length, end]);
    }
  }
  return spans;
}

export function redactUrl(url: string, own?: RegExp | null): string {
  if (!url) return url;
  return redactText(url.replace(SENSITIVE_PARAM, '$1$2=[redacted]'), own);
}

/** Scrub a step in place. `maskAllInputs` also hides ordinary typed text, and
 *  `own` (from `ownPattern`) hides the student's own name and email. */
export function redactStep(
  step: Step,
  opts: { maskAllInputs: boolean; own?: RegExp | null },
): void {
  const { action, dom, origin } = step;
  const own = opts.own;
  const sensitive = !!dom && (dom.sensitive === true || dom.input_type === 'password');

  if (action.type === 'type' && action.text !== undefined) {
    if (sensitive) action.text = '[redacted]';
    else if (opts.maskAllInputs) action.text = '•'.repeat(action.text.length);
    else action.text = redactText(action.text, own);
  }
  if (action.url) action.url = redactUrl(action.url, own);

  if (dom) {
    if (dom.input_value) {
      if (sensitive) dom.input_value = '[redacted]';
      else if (opts.maskAllInputs) dom.input_value = '•'.repeat(dom.input_value.length);
      else dom.input_value = redactText(dom.input_value, own);
    }
    if (dom.text) dom.text = redactText(dom.text, own);
    if (dom.aria_label) dom.aria_label = redactText(dom.aria_label, own);
    if (dom.field_label) dom.field_label = redactText(dom.field_label, own);
  }

  origin.url = redactUrl(origin.url, own);
  origin.title = redactText(origin.title, own);
}
