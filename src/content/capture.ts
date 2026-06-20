import { KEYSTROKE_DEBOUNCE_MS, SCROLL_THROTTLE_MS } from '../shared/constants';
import type { CaptureEventPayload, ModifierKey, RawEvent } from '../shared/types';
import { extractDOMContext } from './dom';

type CleanupFn = () => void;

let keystrokeBuffer: string[] = [];
let keystrokeTimer: ReturnType<typeof setTimeout> | null = null;
let keystrokeTarget: Element | null = null;
let lastScrollTime = 0;
let lastScrollX = 0;
let lastScrollY = 0;

function getModifiers(e: MouseEvent | KeyboardEvent): ModifierKey[] {
  const mods: ModifierKey[] = [];
  if (e.ctrlKey) mods.push('ctrl');
  if (e.shiftKey) mods.push('shift');
  if (e.altKey) mods.push('alt');
  if (e.metaKey) mods.push('meta');
  return mods;
}

function sendEvent(payload: CaptureEventPayload): void {
  try {
    chrome.runtime.sendMessage({ type: 'CAPTURE_EVENT', payload });
  } catch (err) {
    console.warn('[drafted.capture] sendMessage failed (context invalidated?)', err);
  }
}

function flushKeystrokeBuffer(): void {
  if (keystrokeBuffer.length === 0) return;
  const text = keystrokeBuffer.join('');
  const dom = keystrokeTarget ? extractDOMContext(keystrokeTarget) : null;

  const event: RawEvent = {
    type: 'type',
    client_x: dom?.rect.x ?? 0,
    client_y: dom?.rect.y ?? 0,
    text,
    modifiers: [],
    timestamp: Date.now(),
  };

  sendEvent({
    event,
    dom,
    dpr: window.devicePixelRatio,
  });

  keystrokeBuffer = [];
  keystrokeTarget = null;
  if (keystrokeTimer) {
    clearTimeout(keystrokeTimer);
    keystrokeTimer = null;
  }
}

function isPrintableKey(key: string, e: KeyboardEvent): boolean {
  return key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey;
}

export function startCapture(): CleanupFn {
  const cleanups: (() => void)[] = [];

  function addListener<K extends keyof DocumentEventMap>(
    eventName: K,
    handler: (e: DocumentEventMap[K]) => void,
  ): void {
    document.addEventListener(eventName, handler, { capture: true, passive: true });
    cleanups.push(() =>
      document.removeEventListener(eventName, handler, {
        capture: true,
      } as EventListenerOptions),
    );
  }

  addListener('click', (e: MouseEvent) => {
    if (keystrokeBuffer.length > 0) flushKeystrokeBuffer();
    const target = e.target as Element;
    const dom = target ? extractDOMContext(target) : null;
    const event: RawEvent = {
      type: 'click',
      client_x: e.clientX,
      client_y: e.clientY,
      button: e.button,
      modifiers: getModifiers(e),
      timestamp: Date.now(),
    };
    sendEvent({ event, dom, dpr: window.devicePixelRatio });
  });

  addListener('dblclick', (e: MouseEvent) => {
    if (keystrokeBuffer.length > 0) flushKeystrokeBuffer();
    const target = e.target as Element;
    const dom = target ? extractDOMContext(target) : null;
    const event: RawEvent = {
      type: 'double_click',
      client_x: e.clientX,
      client_y: e.clientY,
      button: e.button,
      modifiers: getModifiers(e),
      timestamp: Date.now(),
    };
    sendEvent({ event, dom, dpr: window.devicePixelRatio });
  });

  addListener('contextmenu', (e: MouseEvent) => {
    if (keystrokeBuffer.length > 0) flushKeystrokeBuffer();
    const target = e.target as Element;
    const dom = target ? extractDOMContext(target) : null;
    const event: RawEvent = {
      type: 'right_click',
      client_x: e.clientX,
      client_y: e.clientY,
      button: e.button,
      modifiers: getModifiers(e),
      timestamp: Date.now(),
    };
    sendEvent({ event, dom, dpr: window.devicePixelRatio });
  });

  addListener('auxclick', (e: MouseEvent) => {
    if (keystrokeBuffer.length > 0) flushKeystrokeBuffer();
    const target = e.target as Element;
    const dom = target ? extractDOMContext(target) : null;
    const actionType = e.button === 1 ? 'click' : 'right_click';
    const event: RawEvent = {
      type: actionType,
      client_x: e.clientX,
      client_y: e.clientY,
      button: e.button,
      modifiers: getModifiers(e),
      timestamp: Date.now(),
    };
    sendEvent({ event, dom, dpr: window.devicePixelRatio });
  });

  addListener('keydown', (e: KeyboardEvent) => {
    if (isPrintableKey(e.key, e)) {
      keystrokeTarget = e.target as Element;
      keystrokeBuffer.push(e.key);
      if (keystrokeTimer) clearTimeout(keystrokeTimer);
      keystrokeTimer = setTimeout(flushKeystrokeBuffer, KEYSTROKE_DEBOUNCE_MS);
    } else {
      if (keystrokeBuffer.length > 0) flushKeystrokeBuffer();
      const target = e.target as Element;
      const dom = target ? extractDOMContext(target) : null;
      const mods = getModifiers(e);
      let keyStr = e.key;
      if (mods.length > 0) {
        keyStr = [...mods, e.key].join('+');
      }
      const event: RawEvent = {
        type: 'key',
        client_x: 0,
        client_y: 0,
        key: keyStr,
        code: e.code,
        modifiers: mods,
        timestamp: Date.now(),
      };
      sendEvent({ event, dom, dpr: window.devicePixelRatio });
    }
  });

  addListener('scroll', () => {
    const now = Date.now();
    if (now - lastScrollTime < SCROLL_THROTTLE_MS) return;

    const currentX = window.scrollX;
    const currentY = window.scrollY;
    const deltaX = currentX - lastScrollX;
    const deltaY = currentY - lastScrollY;

    lastScrollX = currentX;
    lastScrollY = currentY;
    lastScrollTime = now;

    const event: RawEvent = {
      type: 'scroll',
      client_x: 0,
      client_y: 0,
      scroll_x: currentX,
      scroll_y: currentY,
      scroll_delta_x: deltaX,
      scroll_delta_y: deltaY,
      modifiers: [],
      timestamp: now,
    };

    sendEvent({ event, dom: null, dpr: window.devicePixelRatio });
  });

  const onBeforeUnload = (): void => {
    if (keystrokeBuffer.length > 0) flushKeystrokeBuffer();
    const event: RawEvent = {
      type: 'navigate',
      client_x: 0,
      client_y: 0,
      url: window.location.href,
      modifiers: [],
      timestamp: Date.now(),
    };
    sendEvent({ event, dom: null, dpr: window.devicePixelRatio });
  };
  window.addEventListener('beforeunload', onBeforeUnload);
  cleanups.push(() => window.removeEventListener('beforeunload', onBeforeUnload));

  lastScrollX = window.scrollX;
  lastScrollY = window.scrollY;

  return () => {
    if (keystrokeTimer) clearTimeout(keystrokeTimer);
    keystrokeBuffer = [];
    for (const cleanup of cleanups) cleanup();
  };
}
