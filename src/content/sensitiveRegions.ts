// Finds the parts of the visible page that must not appear in a screenshot:
// sensitive fields, text inputs when "mask all inputs" is on, and any text that
// matches the redaction detectors (emails, cards, SSNs, keys). Rects are in CSS
// pixels relative to the viewport. Limits: top frame only, and text drawn in a
// canvas or inside a closed shadow root is not seen.

import { findSensitiveSpans } from '../shared/utils/redact';
import type { Rect } from '../shared/utils/screenshotMask';
import { isSensitiveField } from './dom';

// Cheap test so most text nodes skip the full detectors.
const MAYBE_SENSITIVE = /@|\d{4}|Bearer|sk-|eyJ|gh[pousr]_|xox|AKIA|ASIA/;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);
const MAX_TEXT_NODES = 4000;
const BUDGET_MS = 200;

export interface SensitiveRegions {
  rects: Rect[];
  viewportWidth: number;
}

export function findSensitiveRegions(maskAllInputs: boolean): SensitiveRegions {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rects: Rect[] = [];
  const add = (r: DOMRect): void => {
    if (r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh) {
      rects.push({ x: r.left, y: r.top, width: r.width, height: r.height });
    }
  };
  const deadline = performance.now() + BUDGET_MS;

  for (const el of Array.from(document.querySelectorAll('input, textarea'))) {
    const field = el as HTMLInputElement | HTMLTextAreaElement;
    if (!field.value) continue;
    const type = field instanceof HTMLInputElement ? field.type : 'textarea';
    if (
      maskAllInputs ||
      isSensitiveField(field, type) ||
      findSensitiveSpans(field.value).length > 0
    ) {
      add(field.getBoundingClientRect());
    }
  }

  const root = document.body ?? document.documentElement;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let visited = 0;
  for (
    let node = walker.nextNode();
    node && visited < MAX_TEXT_NODES && performance.now() < deadline;
    node = walker.nextNode()
  ) {
    visited++;
    const text = node.nodeValue ?? '';
    if (text.length < 5 || !MAYBE_SENSITIVE.test(text)) continue;
    if (SKIP_TAGS.has(node.parentElement?.tagName ?? '')) continue;
    for (const [start, end] of findSensitiveSpans(text)) {
      range.setStart(node, start);
      range.setEnd(node, end);
      for (const r of Array.from(range.getClientRects())) add(r);
    }
  }

  return { rects, viewportWidth: vw };
}
