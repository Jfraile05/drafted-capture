import type { DOMContext } from '../shared/types';
import { buildCSSSelector, buildXPath } from '../shared/utils/selector';

const SENSITIVE_AUTOCOMPLETE =
  /(^|\s)(cc-[a-z-]+|one-time-code|current-password|new-password)(\s|$)/i;
const SENSITIVE_NAME = /passw|pwd|card.?(num|no)|cvv|cvc|security.?code|ssn|social.?sec/i;

/** Password, card, one-time-code, and similar fields: typed text is never stored. */
export function isSensitiveField(
  el: HTMLInputElement | HTMLTextAreaElement,
  inputType: string,
): boolean {
  if (inputType === 'password') return true;
  if (SENSITIVE_AUTOCOMPLETE.test(el.getAttribute('autocomplete') ?? '')) return true;
  return SENSITIVE_NAME.test(`${el.name} ${el.id}`);
}

export function extractDOMContext(element: Element): DOMContext | null {
  if (
    element === document.documentElement ||
    element === document.body ||
    !document.contains(element)
  ) {
    return null;
  }

  try {
    const tag = element.tagName.toLowerCase();
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const visibility = style.visibility;
    const display = style.display;
    const visible = visibility !== 'hidden' && display !== 'none';

    const ariaRole = element.getAttribute('role');
    const ariaLabel = element.getAttribute('aria-label');

    const interactiveTags = ['a', 'button', 'input', 'select', 'textarea'];
    const interactiveRoles = ['button', 'link', 'textbox', 'checkbox', 'radio', 'tab', 'menuitem'];
    const contentEditable = element.getAttribute('contenteditable');
    const interactive =
      interactiveTags.includes(tag) ||
      (ariaRole && interactiveRoles.includes(ariaRole)) ||
      contentEditable === 'true' ||
      contentEditable === '';

    let inputType: string | null = null;
    let inputValue: string | null = null;
    let sensitive = false;

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      inputType = element instanceof HTMLInputElement ? element.type : 'textarea';
      sensitive = isSensitiveField(element, inputType);
      const value = element.value;
      if (element instanceof HTMLInputElement && element.type === 'password') {
        inputValue = value ? '•'.repeat(value.length) : '';
      } else {
        inputValue = value;
      }
    }

    const textNode = Array.from(element.childNodes).find(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
    );
    const text = textNode?.textContent?.trim() || null;

    return {
      selector: buildCSSSelector(element),
      xpath: buildXPath(element),
      tag,
      text,
      aria_role: ariaRole,
      aria_label: ariaLabel,
      rect: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      visible,
      interactive,
      input_type: inputType,
      input_value: inputValue,
      ...(sensitive ? { sensitive } : {}),
    };
  } catch (err) {
    console.warn('[drafted.capture] extractDOMContext failed', err);
    return null;
  }
}
