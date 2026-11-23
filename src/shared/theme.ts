// The look of the popup, side panel and settings: a setup (see setups.ts) in
// its light or dark version. Both choices live in localStorage (shared by every
// extension page, read synchronously so the first paint is already right) and
// pages that are open together stay in sync.

import { BASE_SETUP, type Mode, findSetup } from './setups';

export type Theme = Mode;
export type Look = { theme: Theme; setup: string };

const KEY = 'sidekick-theme';
const SETUP_KEY = 'sidekick-setup';

/** Dark unless the user picked light. */
export function parseTheme(value: string | null): Theme {
  return value === 'light' ? 'light' : 'dark';
}

/** A stored setup id if it still exists, otherwise the default. */
export function parseSetup(value: string | null): string {
  return findSetup(value)?.id ?? BASE_SETUP;
}

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the change still applies to this page.
  }
}

export function readTheme(): Theme {
  return parseTheme(load(KEY));
}

function readLook(): Look {
  return { theme: readTheme(), setup: parseSetup(load(SETUP_KEY)) };
}

// What the page shows right now. React reads it with useLook().
let look: Look = { theme: 'dark', setup: BASE_SETUP };
const listeners = new Set<() => void>();

export function currentLook(): Look {
  return look;
}

export function subscribeLook(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function applyLook(next: Look) {
  look = next;
  const root = document.documentElement;
  root.dataset.theme = next.theme;
  if (next.setup === BASE_SETUP) delete root.dataset.setup;
  else root.dataset.setup = next.setup;
  for (const listener of listeners) listener();
}

/** Call once per page before rendering. */
export function initTheme() {
  applyLook(readLook());
  window.addEventListener('storage', (event) => {
    if (event.key === KEY || event.key === SETUP_KEY) applyLook(readLook());
  });
}

/** The new look grows out of `origin` in a circle. */
function reveal(next: Look, origin?: HTMLElement) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduceMotion) {
    applyLook(next);
    return;
  }

  const rect = origin?.getBoundingClientRect();
  const x = rect ? rect.left + rect.width / 2 : window.innerWidth;
  const y = rect ? rect.top + rect.height / 2 : 0;
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  const transition = document.startViewTransition(() => applyLook(next));
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

/**
 * Switches the current setup between its light and dark version. The sun and
 * moon icon morphs on its own CSS transition.
 */
export function toggleTheme(origin?: HTMLElement) {
  const theme: Theme = look.theme === 'light' ? 'dark' : 'light';
  save(KEY, theme);
  reveal({ theme, setup: look.setup }, origin);
}

/** Puts on a setup in its light or dark version. */
export function chooseSetup(id: string, theme: Theme, origin?: HTMLElement) {
  const setup = findSetup(id);
  if (!setup) return;
  save(KEY, theme);
  save(SETUP_KEY, setup.id);
  reveal({ theme, setup: setup.id }, origin);
}
