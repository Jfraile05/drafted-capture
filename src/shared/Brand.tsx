// Sidekick brand: the animated mascot, the "sidekick." wordmark and the
// "By Drafted Labs" byline. The mascot is the 3D Sidekick (Sidekick3D.tsx)
// where WebGL works, and the flat 2D one below otherwise; the 2D animation CSS
// lives in styles.css under `.mascot`.

import {
  type ComponentType,
  type Ref,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type Sidekick3DType from './Sidekick3D';
import type { Sidekick3DHandle } from './Sidekick3D';
import { IS_BETA, STORAGE_KEYS } from './constants';
import { useLiveSession } from './hooks';
import type { Settings } from './types';

export type MascotState = 'waiting' | 'watching' | 'capturing' | 'paused' | 'done';

// The flat 2D Sidekick: the same character as the 3D one (white egg head, dark
// visor, mint eyes, ear pods and an antenna bulb), drawn for small sizes and as
// the fallback when WebGL or motion is off. The body is the same in every
// state; the eyes and the antenna bulb show the mood.
const BODY = `
  <defs>
    <radialGradient id="sk-shell" cx="38%" cy="28%" r="80%">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#E6ECE9"/><stop offset="1" stop-color="#B9C4BF"/>
    </radialGradient>
  </defs>
  <path d="M160 72 C160 42 148 24 124 22 C106 21 96 32 98 46" fill="none" stroke="#1B2422" stroke-width="7" stroke-linecap="round"/>
  <circle class="ms-bulb-glow" cx="98" cy="54" r="22" fill="#5CFFC4" opacity=".22"/>
  <circle class="ms-bulb" cx="98" cy="54" r="11" fill="#5CFFC4"/>
  <rect x="36" y="120" width="30" height="56" rx="13" fill="#1B2422"/>
  <rect x="254" y="120" width="30" height="56" rx="13" fill="#1B2422"/>
  <ellipse cx="42" cy="148" rx="4" ry="13" fill="none" stroke="#5CFFC4" stroke-width="3"/>
  <ellipse cx="278" cy="148" rx="4" ry="13" fill="none" stroke="#5CFFC4" stroke-width="3"/>
  <ellipse cx="160" cy="150" rx="106" ry="80" fill="url(#sk-shell)"/>
  <rect x="132" y="64" width="56" height="12" rx="5" fill="#1B2422"/>
  <rect x="136" y="61" width="48" height="3" rx="1.5" fill="#5CFFC4"/>
  <rect x="76" y="104" width="168" height="76" rx="38" fill="#3A4743"/>
  <rect x="81" y="109" width="158" height="66" rx="33" fill="#030807"/>
  <path d="M102 122 Q122 114 160 114" fill="none" stroke="#FFFFFF" stroke-opacity=".2" stroke-width="5" stroke-linecap="round"/>
`;

const EYES: Record<MascotState, string> = {
  waiting:
    '<rect x="128" y="122" width="20" height="40" rx="10"/><rect x="172" y="122" width="20" height="40" rx="10"/>',
  watching:
    '<rect x="127" y="120" width="22" height="44" rx="11"/><rect x="171" y="120" width="22" height="44" rx="11"/>',
  capturing:
    '<rect x="128" y="130" width="20" height="24" rx="10"/><rect x="172" y="130" width="20" height="24" rx="10"/>',
  paused:
    '<rect x="124" y="140" width="28" height="8" rx="4"/><rect x="168" y="140" width="28" height="8" rx="4"/>',
  done: '<path d="M126 150 Q138 128 150 150" fill="none" stroke="#5CFFC4" stroke-width="9" stroke-linecap="round"/><path d="M170 150 Q182 128 194 150" fill="none" stroke="#5CFFC4" stroke-width="9" stroke-linecap="round"/>',
};

/**
 * Layers, outside in. Each one owns a single animation so they never cancel
 * each other: the entrance runs once on mount, reactions (bounce on click, hop
 * when done) play on top of the idle loop instead of replacing it, the idle
 * loop keeps running through clicks and typing, and tilt and gaze follow the
 * cursor through CSS variables set without a React render.
 */
export function Mascot({
  state,
  className = '',
  follow = true,
  ref,
}: {
  state: MascotState;
  className?: string;
  /** Eyes and tilt track the cursor anywhere on the page. */
  follow?: boolean;
  ref?: Ref<HTMLSpanElement>;
}) {
  const elRef = useRef<HTMLSpanElement | null>(null);
  useFollowCursor(elRef, follow && state !== 'paused');

  const setRef = (node: HTMLSpanElement | null) => {
    elRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };

  return (
    <span ref={setRef} className={`mascot ${className}`} data-state={state} aria-hidden="true">
      <svg className="mascot-svg" viewBox="0 0 320 280" aria-hidden="true" focusable="false">
        <g className="ms-entrance">
          <ellipse cx="160" cy="262" rx="72" ry="8" fill="#000000" opacity="0.35" />
          <g className="ms-react">
            <g className="ms-motion">
              <g className="ms-tilt">
                <g className="ms-character">
                  <g
                    className="ms-shape"
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: static SVG from the constants above
                    dangerouslySetInnerHTML={{ __html: BODY }}
                  />
                  <g className="ms-gaze">
                    <g className="ms-eyes" fill="#5CFFC4">
                      <g className="ms-ack">
                        <g
                          className="ms-blink"
                          // biome-ignore lint/security/noDangerouslySetInnerHtml: static SVG from the constants above
                          dangerouslySetInnerHTML={{ __html: EYES[state] }}
                        />
                      </g>
                    </g>
                  </g>
                </g>
              </g>
            </g>
          </g>
        </g>
      </svg>
    </span>
  );
}

/** Plays a one-off reaction on top of whatever the mascot is doing. */
export function playReaction(el: HTMLElement | null, kind: 'petting' | 'celebrating') {
  if (!el) return;
  el.classList.remove('is-petting', 'is-celebrating');
  void el.offsetWidth; // lets the same reaction replay; the idle loop is untouched
  el.classList.add(`is-${kind}`);
  const done = () => el.classList.remove(`is-${kind}`);
  el.querySelector('.ms-react')?.addEventListener('animationend', done, { once: true });
}

const CONFETTI_COLORS = ['#00CA78', '#FF239B', '#1286FF', '#FFAE00', '#FFFFFF'];

/** A short confetti burst from the mascot, drawn above the page and then removed. */
function burstConfetti(from: HTMLElement | null) {
  if (!from || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = from.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:50';
  document.body.append(layer);
  let longest = 0;
  for (let i = 0; i < 60; i++) {
    const piece = document.createElement('span');
    const w = 5 + Math.random() * 4;
    piece.style.cssText = `position:absolute;left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;width:${w}px;height:${w * (Math.random() < 0.5 ? 1 : 1.8)}px;border-radius:${Math.random() < 0.3 ? '50%' : '2px'};background:${CONFETTI_COLORS[i % CONFETTI_COLORS.length]}`;
    layer.append(piece);
    // Pop out to the right and down, then drift slowly down with a sway and fade.
    const angle = (-35 + Math.random() * 125) * (Math.PI / 180);
    const reach = 60 + Math.random() * 170;
    const dx = Math.cos(angle) * reach;
    const dy = Math.sin(angle) * reach - 30;
    const sway = (Math.random() < 0.5 ? -1 : 1) * (12 + Math.random() * 18);
    const fall = 200 + Math.random() * 160;
    const spin = (Math.random() < 0.5 ? -1 : 1) * (240 + Math.random() * 360);
    const duration = 3000 + Math.random() * 1500;
    longest = Math.max(longest, duration);
    const at = (x: number, y: number, deg: number) =>
      `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${deg}deg)`;
    piece.animate(
      [
        { transform: at(0, 0, 0), opacity: 1, easing: 'cubic-bezier(.15,.8,.3,1)' },
        { transform: at(dx, dy, spin * 0.25), opacity: 1, offset: 0.15, easing: 'ease-in-out' },
        {
          transform: at(dx + sway, dy + fall * 0.4, spin * 0.5),
          offset: 0.45,
          easing: 'ease-in-out',
        },
        { transform: at(dx - sway, dy + fall * 0.75, spin * 0.75), opacity: 1, offset: 0.75 },
        { transform: at(dx, dy + fall, spin), opacity: 0 },
      ],
      { duration, fill: 'forwards' },
    );
  }
  setTimeout(() => layer.remove(), longest + 100);
}

// Short-lived moods that every extension page should show, not only the page
// that caused them: saving a session (blue) and a session just saved (green).
const MOMENT_KEY = 'mascot_moment';
/** `until` null means it lasts until cleared. */
type Moment = { state: 'capturing' | 'done'; until: number | null; at: number };

export function setMascotMoment(state: Moment['state'] | null, ms: number | null = 6000) {
  const value: Moment | null = state
    ? { state, until: ms === null ? null : Date.now() + ms, at: Date.now() }
    : null;
  chrome.storage.session.set({ [MOMENT_KEY]: value }).catch(() => {});
}

/** The mascot state for the live capture, shared by the popup, panel and settings. */
export function useMascotState(): MascotState {
  const live = useLiveSession();
  const [moment, setMoment] = useState<Moment | null>(null);
  const [, setNow] = useState(0);

  useEffect(() => {
    chrome.storage.session.get(MOMENT_KEY, (r) => setMoment(r[MOMENT_KEY] ?? null));
    const listener = (changes: { [k: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === 'session' && changes[MOMENT_KEY])
        setMoment(changes[MOMENT_KEY].newValue ?? null);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  // Re-render once the moment expires so the mascot goes back to waiting.
  useEffect(() => {
    if (!moment || moment.until === null) return;
    const t = setTimeout(() => setNow(Date.now()), Math.max(0, moment.until - Date.now()) + 50);
    return () => clearTimeout(t);
  }, [moment]);

  if (live?.state === 'capturing') return 'watching';
  if (live?.state === 'paused') return 'paused';
  if (moment && (moment.until === null || moment.until > Date.now())) return moment.state;
  return 'waiting';
}

// The cursor over the web page, so the eyes follow it outside the popup or
// side panel too. A tiny relay is injected into every frame of the active tab
// (it works in tabs opened before the extension was reloaded) and streams the
// cursor back over a port. Each extension page gets its own port, named with
// its id; the relay removes itself when that page closes.
type PageCursor = { sx: number; sy: number; ox: number; oy: number; w: number; top: boolean };
const cursorListeners = new Set<(c: PageCursor) => void>();
const PAGE_ID = crypto.randomUUID();
const PORT_NAME = `sidekick-cursor:${PAGE_ID}`;

/** Runs inside the web page. Must be self-contained: it is serialized by chrome.scripting. */
function cursorRelay(portName: string) {
  const w = window as unknown as { __sidekickRelays?: Record<string, boolean> };
  if (!w.__sidekickRelays) w.__sidekickRelays = {};
  const relays = w.__sidekickRelays;
  if (relays[portName]) return;
  let port: chrome.runtime.Port;
  try {
    port = chrome.runtime.connect({ name: portName });
  } catch {
    return;
  }
  relays[portName] = true;
  let frame = 0;
  let last: PointerEvent | null = null;
  const send = () => {
    frame = 0;
    if (!last) return;
    try {
      port.postMessage({
        sx: last.screenX,
        sy: last.screenY,
        ox: last.screenX - last.clientX,
        oy: last.screenY - last.clientY,
        w: window.innerWidth,
        top: window === window.top,
      });
    } catch {
      // The extension page closed between frames.
    }
  };
  const onMove = (e: PointerEvent) => {
    last = e;
    if (!frame) frame = requestAnimationFrame(send);
  };
  window.addEventListener('pointermove', onMove, { capture: true, passive: true });
  port.onDisconnect.addListener(() => {
    window.removeEventListener('pointermove', onMove, { capture: true });
    cancelAnimationFrame(frame);
    delete relays[portName];
  });
}

function onCursorPort(port: chrome.runtime.Port) {
  if (!port.name.startsWith('sidekick-cursor:')) return;
  // Another extension page's relay: let it go so it closes with that page.
  if (port.name !== PORT_NAME) return port.disconnect();
  port.onMessage.addListener((c: PageCursor) => {
    for (const fn of cursorListeners) fn(c);
  });
}

function injectActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (chrome.runtime.lastError || tab?.id === undefined || !cursorListeners.size) return;
    chrome.scripting
      .executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: cursorRelay,
        args: [PORT_NAME],
      })
      .catch(() => {
        // Chrome blocks scripts on its own pages (chrome://, the new tab page, the Web Store).
      });
  });
}

function onTabUpdated(_id: number, info: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) {
  if (info.status === 'complete' && tab.active) injectActiveTab();
}

function subscribePageCursor(fn: (c: PageCursor) => void) {
  cursorListeners.add(fn);
  if (cursorListeners.size === 1 && chrome.scripting) {
    chrome.runtime.onConnect.addListener(onCursorPort);
    chrome.tabs.onActivated.addListener(injectActiveTab);
    chrome.tabs.onUpdated.addListener(onTabUpdated);
    injectActiveTab();
  }
  return () => {
    cursorListeners.delete(fn);
    if (cursorListeners.size || !chrome.scripting) return;
    chrome.runtime.onConnect.removeListener(onCursorPort);
    chrome.tabs.onActivated.removeListener(injectActiveTab);
    chrome.tabs.onUpdated.removeListener(onTabUpdated);
  };
}

// The web page's visible area on screen, from the top frame's last report.
let pageViewport: { x: number; y: number; w: number } | null = null;

// Where this extension page sits on screen. Learned from the first pointer
// event inside it; until then, a side panel is assumed to sit right of the
// page and a popup at the page's top right corner.
let selfOrigin: { x: number; y: number } | null = null;

/** Eased cursor tracking, ported from the playground's trackPointer. */
function useFollowCursor(elRef: RefObject<HTMLSpanElement | null>, enabled: boolean) {
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const set = (x: number, y: number) => {
      el.style.setProperty('--look-x', `${x.toFixed(2)}px`);
      el.style.setProperty('--look-y', `${y.toFixed(2)}px`);
      el.style.setProperty('--tilt', `${(x * 0.35).toFixed(2)}deg`);
    };
    if (!enabled || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      set(0, 0);
      return;
    }
    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let frame = 0;
    const tick = () => {
      x += (targetX - x) * 0.14;
      y += (targetY - y) * 0.14;
      set(x, y);
      frame =
        Math.abs(targetX - x) > 0.03 || Math.abs(targetY - y) > 0.03
          ? requestAnimationFrame(tick)
          : 0;
    };
    const start = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const aim = (clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect();
      // Same reach as the playground hero, scaled to this mascot's size.
      const dx = (clientX - (r.left + r.width / 2)) / Math.max(r.width / 18, 1);
      const dy = (clientY - (r.top + r.height / 2)) / Math.max(r.height / 12, 1);
      targetX = Math.max(-7, Math.min(7, dx));
      targetY = Math.max(-4, Math.min(4, dy));
      start();
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      selfOrigin = { x: e.screenX - e.clientX, y: e.screenY - e.clientY };
      aim(e.clientX, e.clientY);
    };
    const onPageCursor = (c: PageCursor) => {
      if (c.top) pageViewport = { x: c.ox, y: c.oy, w: c.w };
      const page = pageViewport ?? { x: c.ox, y: c.oy, w: c.w };
      const origin = selfOrigin ?? {
        x: location.pathname.includes('panel') ? page.x + page.w : page.x + page.w - innerWidth,
        y: page.y,
      };
      aim(c.sx - origin.x, c.sy - origin.y);
    };
    // No reset when the cursor leaves this page: the eyes keep looking where it
    // went, and the relay from the web page takes over from there.
    window.addEventListener('pointermove', onMove);
    const unsubscribe = subscribePageCursor(onPageCursor);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      unsubscribe();
      set(0, 0);
    };
  }, [elRef, enabled]);
}

/** WebGL works and the user has not asked for less motion. */
function canShow3D(): boolean {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

/**
 * The same Sidekick as the one in the header (3D where WebGL works, the flat one
 * otherwise), but showing the mood you give it instead of the live capture state.
 * It does not follow the cursor. Click it for a boop.
 */
export function SidekickFigure({
  state,
  className = '',
}: {
  state: MascotState;
  className?: string;
}) {
  const handle = useRef<Sidekick3DHandle>(null);
  const [Three, setThree] = useState<ComponentType<Parameters<typeof Sidekick3DType>[0]> | null>(
    null,
  );
  useEffect(() => {
    if (!canShow3D()) return;
    let live = true;
    import('./Sidekick3D').then((m) => {
      if (live) setThree(() => m.default);
    });
    return () => {
      live = false;
    };
  }, []);
  const fallBackTo2D = useCallback(() => setThree(null), []);
  const noLook = useCallback(() => null, []);

  return (
    <button
      type="button"
      onClick={() => handle.current?.boop()}
      className={`${className} shrink-0 cursor-pointer`}
      aria-label="Sidekick"
    >
      {Three ? (
        <span className="block h-full w-full" aria-hidden="true">
          <Three ref={handle} state={state} getLook={noLook} onError={fallBackTo2D} />
        </span>
      ) : (
        <Mascot state={state} follow={false} className="h-full w-full" />
      )}
    </button>
  );
}

/** Mascot and wordmark, top left on every page. The mascot shows the live capture state. */
export default function Brand({
  size = 'text-xl',
  mascotSize = 'h-12 w-[52px]',
  className = '',
  flat = false,
}: {
  size?: string;
  mascotSize?: string;
  className?: string;
  /** Always use the 2D mascot (pages that do not need a live 3D one). */
  flat?: boolean;
}) {
  const state = useMascotState();
  const ref = useRef<HTMLSpanElement>(null);
  const lookRef = useRef<HTMLSpanElement>(null);
  const handle = useRef<Sidekick3DHandle>(null);
  const [Three, setThree] = useState<ComponentType<Parameters<typeof Sidekick3DType>[0]> | null>(
    null,
  );
  const threeRef = useRef(false);
  threeRef.current = Three !== null;

  // The 3D Sidekick loads after the page, so the 2D one shows first.
  useEffect(() => {
    if (flat || !canShow3D()) return;
    let live = true;
    import('./Sidekick3D').then((m) => {
      if (live) setThree(() => m.default);
    });
    return () => {
      live = false;
    };
  }, [flat]);
  const fallBackTo2D = useCallback(() => setThree(null), []);

  // The 3D Sidekick follows the same cursor as the 2D one, read from the CSS
  // variables useFollowCursor sets on its wrapper.
  useFollowCursor(lookRef, Three !== null && state !== 'paused');
  const getLook = useCallback(() => {
    const el = lookRef.current;
    if (!el) return null;
    const x = Number.parseFloat(el.style.getPropertyValue('--look-x')) || 0;
    const y = Number.parseFloat(el.style.getPropertyValue('--look-y')) || 0;
    return x === 0 && y === 0 ? null : { x: x / 7, y: y / 4 };
  }, []);

  const react = useCallback((kind: 'petting' | 'celebrating') => {
    if (!threeRef.current) return playReaction(ref.current, kind);
    if (kind === 'petting') handle.current?.boop();
    else handle.current?.celebrate();
  }, []);

  useEffect(() => {
    if (state !== 'done') return;
    chrome.storage.local.get(STORAGE_KEYS.SETTINGS, (saved) => {
      if (
        (saved[STORAGE_KEYS.SETTINGS] as Partial<Settings> | undefined)?.celebrate_saves === false
      )
        return;
      react('celebrating');
      // Confetti only in the popup, and only right after a save, not when it
      // opens already green. The side panel and settings just hop.
      if (!location.pathname.includes('/popup/')) return;
      chrome.storage.session.get(MOMENT_KEY, (r) => {
        const at = (r[MOMENT_KEY] as Moment | null)?.at ?? 0;
        if (Date.now() - at < 2500) burstConfetti(threeRef.current ? lookRef.current : ref.current);
      });
    });
  }, [state, react]);

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <button
        type="button"
        onClick={() => react('petting')}
        className={`${mascotSize} shrink-0 cursor-pointer`}
        aria-label="Sidekick"
      >
        {Three ? (
          <span ref={lookRef} className="block h-full w-full" aria-hidden="true">
            <Three ref={handle} state={state} getLook={getLook} onError={fallBackTo2D} />
          </span>
        ) : (
          <Mascot ref={ref} state={state} className="h-full w-full" />
        )}
      </button>
      <div className="flex flex-col leading-none text-left">
        <span className="flex items-center gap-2">
          <span className={`wordmark ${size}`}>
            sidekick<span className="dot">.</span>
          </span>
          {IS_BETA && <span className="beta-tag">Beta</span>}
        </span>
        <span className="byline">By Drafted Labs</span>
      </div>
    </div>
  );
}
