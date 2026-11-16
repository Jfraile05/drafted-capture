import type { PRIVACY_CONFIG } from '../config/privacy';
import type { PrivacyReason } from '../shared/privacy';

export interface PrivacyScan {
  url: string;
  reasons: PrivacyReason[];
  frames: string[];
  ready: boolean;
}

/** Self-contained so Chrome can execute the same detector in every frame. */
export function scanPrivacy(
  config: Pick<
    typeof PRIVACY_CONFIG,
    'selectors' | 'fieldTerms' | 'inboxHeadingPattern' | 'maxScanElements' | 'scanBudgetMs'
  >,
): PrivacyScan {
  const result: PrivacyScan = {
    url: location.href,
    reasons: [],
    frames: [],
    ready: document.readyState !== 'loading',
  };
  const reasons = new Set<PrivacyReason>();
  const roots: (Document | ShadowRoot)[] = [document];
  const deadline = performance.now() + config.scanBudgetMs;
  const inboxHeading = new RegExp(config.inboxHeadingPattern, 'i');
  const candidates = `h1, h2, h3, [role="heading"], ${config.selectors.messaging}`;
  let count = 0;
  const visible = (el: Element) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < innerHeight &&
      rect.left < innerWidth &&
      style.visibility !== 'hidden' &&
      style.display !== 'none'
    );
  };
  for (const root of roots) {
    for (const el of root.querySelectorAll('*')) {
      if (el.id === 'drafted-overlay-host' || el.id === 'drafted-privacy-host') continue;
      if (++count > config.maxScanElements || performance.now() > deadline) {
        reasons.add('unavailable');
        break;
      }
      if (el.shadowRoot) roots.push(el.shadowRoot);
      const field =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement;
      const frame = el instanceof HTMLIFrameElement || el instanceof HTMLFrameElement;
      // Layout reads are the slow part, so only measure elements that could matter.
      if (!field && !frame && !el.matches(candidates)) continue;
      if (!visible(el)) continue;
      for (const [reason, selector] of Object.entries(config.selectors)) {
        if (el.matches(selector)) reasons.add(reason as PrivacyReason);
      }
      if (field) {
        const description = [
          el.name,
          el.id,
          el.getAttribute('aria-label'),
          el.getAttribute('placeholder'),
          ...Array.from(el.labels ?? [], (label) => label.textContent),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .replace(/[_-]/g, ' ');
        for (const [reason, terms] of Object.entries(config.fieldTerms)) {
          if (terms.some((term) => description.includes(term)))
            reasons.add(reason as PrivacyReason);
        }
      }
      if (
        el.matches('h1, h2, h3, [role="heading"]') &&
        inboxHeading.test(el.textContent?.trim() ?? '')
      )
        reasons.add('messaging');
      if (frame) result.frames.push(el.src || 'about:blank');
    }
  }
  result.reasons = [...reasons].sort();
  return result;
}
