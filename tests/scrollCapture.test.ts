// Scrolls report which way the page or an inner panel moved, and a scroll that
// moved nothing never becomes a step.
import assert from 'node:assert/strict';
import { beforeEach, describe, it, type TestContext } from 'node:test';

import { local, session } from './stubs/chrome';

const { startCapture: startPageCapture } = await import('../src/content/capture');
const { SCROLL_THROTTLE_MS } = await import('../src/shared/constants');
const { handleCaptureEvent } = await import('../src/background/coordinator');
const { startCapture } = await import('../src/background/session');
const stubDb = (await import('./stubs/db')) as typeof import('./stubs/db');
type RawEvent = import('../src/shared/types').RawEvent;

class FakeElement {
  scrollLeft = 0;
  scrollTop = 0;
}

// Each test starts well past the previous test's last scroll, so the
// throttle never carries over.
let clock = 1_000_000;

function page(t: TestContext) {
  const handlers = new Map<string, (e: { target: unknown }) => void>();
  const root = new FakeElement();
  const doc = {
    scrollingElement: root,
    addEventListener: (name: string, handler: (e: { target: unknown }) => void) =>
      handlers.set(name, handler),
    removeEventListener: (name: string) => handlers.delete(name),
  };
  const g = globalThis as any;
  g.Element = FakeElement;
  g.document = doc;
  g.window = {
    devicePixelRatio: 1,
    location: { href: 'https://claude.ai/chat' },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  clock += 60_000;
  let now = clock;
  t.mock.method(Date, 'now', () => now);
  const sent: RawEvent[] = [];
  t.mock.method(chrome.runtime, 'sendMessage', (message: { payload: { event: RawEvent } }) => {
    sent.push(message.payload.event);
  });
  const stop = startPageCapture();
  t.after(() => {
    stop();
    delete g.Element;
    delete g.document;
    delete g.window;
  });
  return {
    root,
    doc,
    sent,
    /** Fire a scroll event `after` ms past the last one. */
    scroll: (target: unknown, after = SCROLL_THROTTLE_MS) => {
      now += after;
      clock = now;
      handlers.get('scroll')?.({ target });
    },
  };
}

describe('scroll capture in the page', () => {
  it('records the direction of an inner panel scroll while the window stays still', (t) => {
    const p = page(t);
    const chat = new FakeElement();
    chat.scrollTop = 1180; // a chat opens scrolled near the bottom
    p.scroll(chat); // first sight: the starting position is unknown, so nothing is sent
    assert.equal(p.sent.length, 0);
    chat.scrollTop = 900;
    p.scroll(chat);
    assert.equal(p.sent.length, 1);
    assert.equal(p.sent[0].scroll_delta_y, -280);
    assert.equal(p.sent[0].scroll_delta_x, 0);
    assert.equal(p.sent[0].scroll_y, 900);
  });

  it('tracks each panel on its own', (t) => {
    const p = page(t);
    const sidebar = new FakeElement();
    const editor = new FakeElement();
    p.scroll(sidebar);
    p.scroll(editor);
    sidebar.scrollTop = 50;
    p.scroll(sidebar);
    editor.scrollLeft = 30;
    p.scroll(editor);
    assert.deepEqual(
      p.sent.map((e) => [e.scroll_delta_x, e.scroll_delta_y]),
      [
        [0, 50],
        [30, 0],
      ],
    );
  });

  it('measures page scrolls from where the page was when capture started', (t) => {
    const p = page(t);
    p.root.scrollTop = 400;
    p.scroll(p.doc);
    assert.equal(p.sent.length, 1);
    assert.equal(p.sent[0].scroll_delta_y, 400);
  });

  it('sends nothing when nothing moved', (t) => {
    const p = page(t);
    const panel = new FakeElement();
    p.scroll(p.doc);
    p.scroll(panel);
    p.scroll(panel);
    assert.equal(p.sent.length, 0);
  });

  it('keeps the throttle and reports the movement made in between', (t) => {
    const p = page(t);
    p.root.scrollTop = 100;
    p.scroll(p.doc);
    p.root.scrollTop = 150;
    p.scroll(p.doc, 10);
    p.root.scrollTop = 300;
    p.scroll(p.doc);
    assert.deepEqual(
      p.sent.map((e) => e.scroll_delta_y),
      [100, 200],
    );
  });
});

describe('scroll steps in the worker', () => {
  beforeEach(() => {
    for (const k of Object.keys(session.data)) delete session.data[k];
    for (const k of Object.keys(local.data)) delete local.data[k];
    stubDb.__reset();
  });

  const sender = { tab: { id: 7, windowId: 1, url: 'https://gemini.google.com/' }, frameId: 0 } as any;
  const scrolled = (dx: number, dy: number) =>
    ({
      event: {
        type: 'scroll',
        timestamp: Date.now(),
        client_x: 0,
        client_y: 0,
        scroll_delta_x: dx,
        scroll_delta_y: dy,
        modifiers: [],
      },
      dom: null,
      dpr: 1,
    }) as any;

  it('never turns a scroll that moved nothing into a direction', async () => {
    const live = await startCapture(undefined, 'productivity');
    const r = await handleCaptureEvent(scrolled(0, 0), sender);
    assert.equal(r.ok, false);
    assert.equal(stubDb.__steps.get(live.id)?.length ?? 0, 0);
  });

  it('stores the direction and distance of a real scroll', async () => {
    const live = await startCapture(undefined, 'productivity');
    await handleCaptureEvent(scrolled(0, -280), sender);
    const stored = stubDb.__steps.get(live.id)?.[0];
    assert.equal(stored?.action.scroll_direction, 'up');
    assert.equal(stored?.action.scroll_amount, 280);
  });
});
