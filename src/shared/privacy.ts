import builtin from '../config/privacy-policy.json';

export type PrivacyReason = keyof typeof builtin.domains | 'address' | 'unavailable';
export interface PrivacyPolicy {
  version: number;
  domains: Record<keyof typeof builtin.domains, string[]>;
  paths: Partial<Record<PrivacyReason, string[]>>;
}
export const BUILTIN_PRIVACY_POLICY: PrivacyPolicy = builtin;
export interface PrivacyGate {
  id: string;
  tab_id: number;
  domain: string;
  signature: string;
  /** Hash of the tab and URL, used only to recognize leaving a gated page. */
  location?: string;
  reasons: PrivacyReason[];
  kept_paused?: boolean;
}
export interface PrivacyPermit {
  session_id: string;
  epoch: number;
  tab_id: number;
  url: string;
  signature: string;
}

export function parsePrivacyPolicy(value: unknown): PrivacyPolicy | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as PrivacyPolicy;
  if (!Number.isSafeInteger(p.version) || p.version < 1 || !p.domains || !p.paths) return null;
  const domains = {} as PrivacyPolicy['domains'];
  for (const key of Object.keys(builtin.domains) as (keyof typeof builtin.domains)[]) {
    const list = p.domains[key];
    if (!Array.isArray(list) || !list.length || list.length > 2000) return null;
    if (
      !list.every(
        (v) =>
          typeof v === 'string' &&
          v.length <= 253 &&
          /^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/.test(v),
      )
    )
      return null;
    domains[key] = [...new Set(list)];
  }
  const paths: PrivacyPolicy['paths'] = {};
  for (const [key, list] of Object.entries(p.paths)) {
    if (!Object.hasOwn(builtin.domains, key) || !Array.isArray(list) || list.length > 100)
      return null;
    if (!list.every((v) => typeof v === 'string' && /^[a-z0-9-]{1,60}$/.test(v))) return null;
    paths[key as PrivacyReason] = [...new Set(list)];
  }
  return { version: p.version, domains, paths };
}

export function privacyReasonsForUrl(value: string, policy: PrivacyPolicy): PrivacyReason[] {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    const parts = `${url.pathname}/${url.hash.slice(1).split('?')[0]}`.toLowerCase().split('/');
    const reasons = new Set<PrivacyReason>();
    for (const [category, domains] of Object.entries(policy.domains)) {
      if (domains.some((domain) => host === domain || host.endsWith(`.${domain}`)))
        reasons.add(category as PrivacyReason);
    }
    for (const [category, paths] of Object.entries(policy.paths)) {
      if (paths.some((path) => parts.includes(path))) reasons.add(category as PrivacyReason);
    }
    return [...reasons].sort();
  } catch {
    return [];
  }
}
