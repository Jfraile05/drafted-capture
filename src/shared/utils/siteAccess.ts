// Which pages may be captured. Pure functions so the rules are testable.

import type { Settings } from '../types';

/** Reduce a pasted URL or host:port to a bare lowercase hostname pattern. */
function normalizePattern(pattern: string): string {
  let p = pattern.trim().toLowerCase();
  p = p.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  p = p.split('/')[0];
  p = p.replace(/:\d+$/, '');
  return p;
}

/** Exact host match, or `*.example.com` for any subdomain (not the bare domain).
 *  A lone `*` matches every host. Anchored, so `bank.com` never matches `notbank.com`. */
export function hostMatches(pattern: string, hostname: string): boolean {
  const p = normalizePattern(pattern);
  const h = hostname.toLowerCase();
  if (!p) return false;
  if (p === '*') return true;
  if (p.startsWith('*.')) return h.endsWith(p.slice(1)) && h.length > p.length - 1;
  return h === p;
}

// The blocklist keeps its original (unanchored, regex) matching so existing
// user patterns behave exactly as before.
function isBlocklisted(hostname: string, blocklist: string[]): boolean {
  return blocklist.some((pattern) => new RegExp(pattern.replace(/\*/g, '.*')).test(hostname));
}

/** Whether capture may record anything for this page. The blocklist always wins,
 *  incognito is never captured, and in allowlist mode only listed hosts pass. */
export function siteAllowed(
  url: string,
  settings: Settings,
  tab: { incognito?: boolean } = {},
): boolean {
  if (tab.incognito) return false;

  let hostname = '';
  let protocol = '';
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
    protocol = parsed.protocol;
  } catch {
    // No usable URL (new tab still loading, about:blank). Only the default mode lets it through.
    return !settings.allowlist_only;
  }

  if (isBlocklisted(hostname, settings.domain_blocklist)) return false;
  if (!settings.allowlist_only) return true;
  if (protocol !== 'http:' && protocol !== 'https:') return false;
  return settings.domain_allowlist.some((pattern) => hostMatches(pattern, hostname));
}
