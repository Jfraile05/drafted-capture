// Finds the parts of the visible page that must not appear in a screenshot:
// sensitive fields, text inputs when "mask all inputs" is on, payment provider
// iframes, and any text that matches the redaction detectors (emails, phones,
// cards, SSNs, keys). Same-origin frames (including about:blank and srcdoc
// ones) are scanned too. Rects are in CSS pixels relative to the top viewport.
// If the scan runs out of time, `complete` is false and the caller drops the
// screenshot. Limits: cross-origin frames other than payment frames are not
// scanned, and text drawn in a canvas or inside a closed shadow root is not seen.

import { findSensitiveSpans } from '../shared/utils/redact';
import type { Rect } from '../shared/utils/screenshotMask';
import { isSensitiveFrame } from '../shared/utils/sensitiveFrames';
import { isSensitiveField } from './dom';

// Cheap test so most text nodes skip the full detectors.
const MAYBE_SENSITIVE = /@|\d{4}|Bearer|sk-|eyJ|gh[pousr]_|xox|AKIA|ASIA/;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);
const BUDGET_MS = 300;
const MAX_FRAME_DEPTH = 3;

export interface SensitiveRegions {
  rects: Rect[];
  viewportWidth: number;
  complete: boolean;
}

/** The visible part of a document in top viewport coordinates, and where that
 *  document's own viewport origin sits. */
interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
  dx: number;
  dy: number;
}

export function findSensitiveRegions(maskAllInputs: boolean): SensitiveRegions {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rects: Rect[] = [];
  const deadline = performance.now() + BUDGET_MS;

  const add = (r: DOMRect, box: Box): void => {
    const left = Math.max(r.left + box.dx, box.left);
    const top = Math.max(r.top + box.dy, box.top);
    const right = Math.min(r.right + box.dx, box.right);
    const bottom = Math.min(r.bottom + box.dy, box.bottom);
    if (right > left && bottom > top) {
      rects.push({ x: left, y: top, width: right - left, height: bottom - top });
    }
  };

  /** False if time ran out before the whole document was checked. */
  const scanDocument = (doc: Document, box: Box, depth: number): boolean => {
    for (const el of Array.from(doc.querySelectorAll('input, textarea'))) {
      const field = el as HTMLInputElement | HTMLTextAreaElement;
      if (!field.value) continue;
      // tagName, not instanceof: elements in a frame belong to that frame's window.
      const type = field.tagName === 'INPUT' ? (field as HTMLInputElement).type : 'textarea';
      if (
        maskAllInputs ||
        isSensitiveField(field, type) ||
        findSensitiveSpans(field.value).length > 0
      ) {
        add(field.getBoundingClientRect(), box);
      }
    }

    for (const frame of Array.from(doc.querySelectorAll('iframe, frame'))) {
      const el = frame as HTMLIFrameElement;
      const r = el.getBoundingClientRect();
      if (isSensitiveFrame({ src: el.src, title: el.title, name: el.name })) {
        add(r, box);
        continue;
      }
      let inner: Document | null = null;
      try {
        inner = el.contentDocument;
      } catch {
        inner = null;
      }
      if (!inner) continue; // Cross-origin: its content cannot be read from here.
      if (depth >= MAX_FRAME_DEPTH) {
        add(r, box);
        continue;
      }
      const style = el.ownerDocument.defaultView?.getComputedStyle(el);
      const dx = box.dx + r.left + el.clientLeft + Number.parseFloat(style?.paddingLeft ?? '0');
      const dy = box.dy + r.top + el.clientTop + Number.parseFloat(style?.paddingTop ?? '0');
      const inside: Box = {
        left: Math.max(dx, box.left),
        top: Math.max(dy, box.top),
        right: Math.min(dx + el.clientWidth, box.right),
        bottom: Math.min(dy + el.clientHeight, box.bottom),
        dx,
        dy,
      };
      if (inside.right <= inside.left || inside.bottom <= inside.top) continue;
      if (!scanDocument(inner, inside, depth + 1)) return false;
    }

    const root = doc.body ?? doc.documentElement;
    if (!root) return true;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = doc.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (performance.now() > deadline) return false;
      const text = node.nodeValue ?? '';
      if (text.length < 5 || !MAYBE_SENSITIVE.test(text)) continue;
      if (SKIP_TAGS.has(node.parentElement?.tagName ?? '')) continue;
      for (const [start, end] of findSensitiveSpans(text)) {
        range.setStart(node, start);
        range.setEnd(node, end);
        for (const r of Array.from(range.getClientRects())) add(r, box);
      }
    }
    return true;
  };

  const complete = scanDocument(
    document,
    { left: 0, top: 0, right: vw, bottom: vh, dx: 0, dy: 0 },
    0,
  );
  return { rects, viewportWidth: vw, complete };
}
