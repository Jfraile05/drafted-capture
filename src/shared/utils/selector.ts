export function buildCSSSelector(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;

    if (parent) {
      const currentTag = current.tagName;
      const siblings = Array.from(parent.children).filter((c: Element) => c.tagName === currentTag);
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current) + 1;
        selector += `:nth-child(${idx})`;
      }
    }

    parts.unshift(selector);
    current = parent;
  }

  const fullSelector = parts.join(' > ');

  try {
    if (document.querySelector(fullSelector) === element) {
      return fullSelector;
    }
  } catch {
    // fallback
  }

  return `body > ${fullSelector}`;
}

export function buildXPath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body && current !== document.documentElement) {
    let tag = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;

    if (parent) {
      const currentTag = current.tagName;
      const siblings = Array.from(parent.children).filter((c: Element) => c.tagName === currentTag);
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current) + 1;
        tag += `[${idx}]`;
      }
    }

    parts.unshift(tag);
    current = parent;
  }

  return `//${parts.join('/')}`;
}
