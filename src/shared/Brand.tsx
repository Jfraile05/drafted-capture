// Sidekick brand: the animated mascot, the "sidekick." wordmark and the
// "By Drafted Labs" byline. Each character is a flat shape with two eyes;
// their animation CSS lives in styles.css under `.mascot`.

import { type Ref, type RefObject, useEffect, useRef, useState } from 'react';
import { IS_BETA, STORAGE_KEYS } from './constants';
import { useLiveSession } from './hooks';
import type { Settings } from './types';

export type MascotState = 'waiting' | 'watching' | 'capturing' | 'paused' | 'done';

const SHAPES: Record<MascotState, string> = {
  waiting:
    '<path d="M117 62 H203 Q254 62 254 113 V181 Q254 232 203 232 H117 Q66 232 66 181 V113 Q66 62 117 62Z" fill="#FFFFFF"/>',
  watching:
    '<path d="M141 60 Q163 43 183 62 L245 121 Q267 142 248 166 L193 226 Q174 246 151 229 L77 177 Q52 159 70 134Z" fill="#FF239B"/>',
  capturing:
    '<path d="M160 76 C205 38 263 88 229 138 C272 181 221 243 171 216 C125 254 65 211 87 161 C43 121 99 56 143 80 Q152 84 160 76Z" fill="#1286FF"/>',
  paused:
    '<path d="M80 72 Q116 58 160 80 Q204 58 240 72 Q254 78 248 96 Q232 144 248 194 Q254 214 234 222 Q194 236 160 216 Q126 236 86 222 Q66 214 72 194 Q88 144 72 96 Q66 78 80 72Z" fill="#FFAE00"/>',
  done: '<circle cx="160" cy="145" r="88" fill="#00CA78"/>',
};

const EYES: Record<MascotState, string> = {
  waiting:
    '<rect x="119" y="120" width="24" height="48" rx="12"/><rect x="177" y="116" width="24" height="48" rx="12"/>',
  watching:
    '<rect x="125" y="119" width="23" height="43" rx="11.5"/><rect x="181" y="115" width="23" height="43" rx="11.5"/>',
  capturing:
    '<rect x="121" y="121" width="24" height="46" rx="12"/><rect x="177" y="125" width="24" height="46" rx="12"/>',
  paused:
    '<rect x="117" y="140" width="29" height="15" rx="7.5"/><rect x="176" y="136" width="29" height="15" rx="7.5"/>',
  done: '<rect x="121" y="119" width="24" height="39" rx="12"/><rect x="178" y="115" width="24" height="39" rx="12"/>',
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
          <g className="ms-react">
            <g className="ms-motion">
              <g className="ms-tilt">
                <g className="ms-character">
                  <g
                    className="ms-shape"
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: static SVG from the constants above
                    dangerouslySetInnerHTML={{ __html: SHAPES[state] }}
                  />
                  <g className="ms-gaze">
                    <g className="ms-eyes" fill="#000000">
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

/** Mascot and wordmark, top left on every page. The mascot shows the live capture state. */
export default function Brand({
  size = 'text-xl',
  mascotSize = 'h-12 w-[52px]',
  className = '',
}: {
  size?: string;
  mascotSize?: string;
  className?: string;
}) {
  const state = useMascotState();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (state !== 'done') return;
    chrome.storage.local.get(STORAGE_KEYS.SETTINGS, (saved) => {
      if (
        (saved[STORAGE_KEYS.SETTINGS] as Partial<Settings> | undefined)?.celebrate_saves === false
      )
        return;
      playReaction(ref.current, 'celebrating');
      // Confetti only in the popup, and only right after a save, not when it
      // opens already green. The side panel and settings just hop.
      if (!location.pathname.includes('/popup/')) return;
      chrome.storage.session.get(MOMENT_KEY, (r) => {
        const at = (r[MOMENT_KEY] as Moment | null)?.at ?? 0;
        if (Date.now() - at < 2500) burstConfetti(ref.current);
      });
    });
  }, [state]);

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <button
        type="button"
        onClick={() => playReaction(ref.current, 'petting')}
        className={`${mascotSize} shrink-0 cursor-pointer`}
        aria-label="Sidekick"
      >
        <Mascot ref={ref} state={state} className="h-full w-full" />
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
