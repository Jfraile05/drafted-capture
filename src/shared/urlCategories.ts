import catalog from '../config/url-categories.json';
import type { Segment, Step, StepOrigin } from './types';

export type UrlCategory = keyof typeof catalog;

export interface SiteClassification {
  domain: string;
  category: UrlCategory;
}

const categories: Record<
  UrlCategory,
  { label: string; rules: { domains: string[]; path_prefix?: string }[] }
> = catalog;

// More specific hosts and paths take precedence over broader rules.
const rules = Object.entries(categories)
  .flatMap(([category, entry]) =>
    entry.rules.flatMap((rule) =>
      rule.domains.map((domain) => ({
        domain,
        path: rule.path_prefix ?? '',
        category: category as UrlCategory,
      })),
    ),
  )
  .sort((a, b) => b.domain.length - a.domain.length || b.path.length - a.path.length);

export function classifyUrl(value: string): SiteClassification {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return { domain: '', category: 'uncategorized' };
    }
    const domain = url.hostname
      .toLowerCase()
      .replace(/\.$/, '')
      .replace(/^www\./, '');
    const rule = rules.find(
      (rule) =>
        (domain === rule.domain || domain.endsWith(`.${rule.domain}`)) &&
        (!rule.path || url.pathname === rule.path || url.pathname.startsWith(`${rule.path}/`)),
    );
    return { domain, category: rule?.category ?? 'uncategorized' };
  } catch {
    return { domain: '', category: 'uncategorized' };
  }
}

export function siteForOrigin(origin: StepOrigin): SiteClassification {
  return origin.site ?? classifyUrl(origin.url);
}

export function categoryLabel(category: UrlCategory): string {
  return categories[category]?.label ?? categories.uncategorized.label;
}

export function tagSegment(segment: Segment, steps: Step[]): Segment {
  const sites = new Map<string, SiteClassification>();
  for (const step of steps) {
    if (step.index < segment.start_index || step.index > segment.end_index) continue;
    const site = siteForOrigin(step.origin);
    sites.set(`${site.domain}:${site.category}`, site);
  }
  return { ...segment, sites: [...sites.values()] };
}
