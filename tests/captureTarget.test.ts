import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import './stubs/chrome';
// The explicit extension uses the real queue instead of the coordinator's screenshot stub.
import { captureVisible, resetCaptureQueue } from '../src/shared/utils/captureQueue.ts';
import { __reset, __screenshots } from './stubs/db';

const opts = { windowId: 1, tabId: 7, url: 'https://delta.com/', dpr: 1 };
let active: any;
let calls: number;

beforeEach(() => {
  resetCaptureQueue();
  __reset();
  active = { id: 7, windowId: 1, url: opts.url, status: 'complete' };
  calls = 0;
  (chrome.tabs.query as any) = async () => [{ ...active }];
  (chrome.tabs.sendMessage as any) = async () => ({ rects: [], viewportWidth: 800 });
  (chrome.tabs.captureVisibleTab as any) = async () => { calls++; return 'data:image/png;base64,dGVzdA=='; };
  (globalThis as any).createImageBitmap = async () => ({ width: 800, height: 600, close() {} });
});

describe('screenshot target consistency', () => {
  it('stores a frame when the active tab and URL stay the same', async () => {
    assert.ok(await captureVisible(opts));
    assert.equal(calls, 1);
    assert.equal(__screenshots.size, 1);
  });

  it('drops requests for an inactive tab, changed URL, or loading page before capture', async () => {
    for (const patch of [{ id: 8 }, { url: 'https://amazon.es/' }, { status: 'loading' }, { pendingUrl: 'https://amazon.es/' }]) {
      active = { id: 7, url: opts.url, status: 'complete', ...patch };
      assert.equal(await captureVisible(opts), null);
    }
    assert.equal(calls, 0);
    assert.equal(__screenshots.size, 0);
  });

  it('drops a frame if the tab changes while sensitive regions are being read', async (t) => {
    t.mock.method(chrome.tabs, 'sendMessage', async () => {
      active.id = 8;
      return { rects: [], viewportWidth: 800 };
    });
    assert.equal(await captureVisible(opts), null);
    assert.equal(calls, 0);
  });

  it('drops a captured frame before storage if navigation occurred during capture', async (t) => {
    t.mock.method(chrome.tabs, 'captureVisibleTab', async () => {
      active.url = 'https://amazon.es/';
      return 'data:image/png;base64,dGVzdA==';
    });
    assert.equal(await captureVisible(opts), null);
    assert.equal(__screenshots.size, 0);
  });

  it('coalesces only requests with the same window, tab, and URL', async (t) => {
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    t.mock.method(chrome.tabs, 'sendMessage', async () => {
      await wait;
      return { rects: [], viewportWidth: 800 };
    });
    const first = captureVisible(opts);
    const same = captureVisible(opts);
    assert.equal(await captureVisible({ ...opts, tabId: 8 }), null);
    assert.equal(await captureVisible({ ...opts, windowId: 2 }), null);
    assert.equal(await captureVisible({ ...opts, url: 'https://amazon.es/' }), null);
    release();
    const [a, b] = await Promise.all([first, same]);
    assert.ok(a);
    assert.deepEqual(a, b);
    assert.equal(calls, 1);
  });
});
