// Light or dark look for the popup, side panel and settings. The choice lives
// in localStorage (shared by every extension page, read synchronously so the
// first paint is already right) and pages that are open together stay in sync.

export type Theme = 'light' | 'dark';

const KEY = 'sidekick-theme';

/** Dark unless the user picked light. */
export function parseTheme(value: string | null): Theme {
  return value === 'light' ? 'light' : 'dark';
}

export function readTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(KEY));
  } catch {
    return 'dark';
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

/** Call once per page before rendering. */
export function initTheme() {
  applyTheme(readTheme());
  window.addEventListener('storage', (event) => {
    if (event.key === KEY) applyTheme(parseTheme(event.newValue));
  });
}

/**
 * Switches theme. The new look grows out of `origin` in a circle, while the
 * sun and moon icon morphs on its own CSS transition.
 */
export function toggleTheme(origin?: HTMLElement) {
  const next: Theme = readTheme() === 'light' ? 'dark' : 'light';
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Storage blocked: still switch for this page.
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduceMotion) {
    applyTheme(next);
    return;
  }

  const rect = origin?.getBoundingClientRect();
  const x = rect ? rect.left + rect.width / 2 : window.innerWidth;
  const y = rect ? rect.top + rect.height / 2 : 0;
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  const transition = document.startViewTransition(() => applyTheme(next));
  transition.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        {
          duration: 650,
          easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      );
    })
    .catch(() => {});
}
