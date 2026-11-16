import type { Settings } from '../shared/types';
import { siteAllowed as originalSiteAllowed } from '../shared/utils/siteAccess';
import { DEMO } from './config';

export function isDemoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'http:' &&
      url.port === String(DEMO.port) &&
      DEMO.hosts.includes(url.hostname)
    );
  } catch {
    return false;
  }
}

export function siteAllowed(url: string, settings: Settings, tab: { incognito?: boolean } = {}) {
  return isDemoUrl(url) && originalSiteAllowed(url, settings, tab);
}
export { hostMatches } from '../shared/utils/siteAccess';
