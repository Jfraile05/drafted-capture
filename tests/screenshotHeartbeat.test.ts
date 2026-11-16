import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import './stubs/chrome';
import { startScreenshotHeartbeat } from '../src/content/screenshotHeartbeat';

function page(t: TestContext, visible = true, topFrame = true) {
  const frame: Record<string, unknown> = {};
  frame.top = topFrame ? frame : {};
  (globalThis as any).window = frame;
  (globalThis as any).document = { visibilityState: visible ? 'visible' : 'hidden' };
  t.after(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
  });
  let now = 1000;
  let sequence = 0;
  const timers = new Map<number, { run: () => Promise<void>; delay: number }>();
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'setTimeout', (run: () => Promise<void>, delay: number) => {
    timers.set(++sequence, { run, delay });
    return sequence as any;
  });
  t.mock.method(globalThis, 'clearTimeout', (id: number) => {
    timers.delete(id);
  });
  return {
    timers,
    advance: (ms: number) => {
      now += ms;
    },
    run: async () => {
      const [id, timer] = timers.entries().next().value!;
      timers.delete(id);
      now += timer.delay;
      await timer.run();
    },
  };
}

describe('visible page screenshot heartbeat', () => {
  it('wakes the worker every 2 seconds and ignores obsolete interval settings', async (t) => {
    const clock = page(t);
    const send = t.mock.method(chrome.runtime, 'sendMessage', async (message: { type: string }) => {
      assert.equal(message.type, 'SCREENSHOT_TICK');
      clock.advance(400);
      return { interval_ms: 3000 };
    });
    const stop = startScreenshotHeartbeat();
    assert.equal([...clock.timers.values()][0].delay, 2000);
    await clock.run();
    assert.equal(send.mock.callCount(), 1);
    assert.equal([...clock.timers.values()][0].delay, 1600);
    stop();
    assert.equal(clock.timers.size, 0);
  });

  it('does not send from hidden pages or create timers in subframes', async (t) => {
    const clock = page(t, false);
    const send = t.mock.method(chrome.runtime, 'sendMessage', async () => ({}));
    const stop = startScreenshotHeartbeat();
    await clock.run();
    assert.equal(send.mock.callCount(), 0);
    stop();
    (globalThis as any).window.top = {};
    startScreenshotHeartbeat()();
    assert.equal(clock.timers.size, 0);
  });

  it('uses the worker deadline when a tick arrives just before it is due', async (t) => {
    const clock = page(t);
    t.mock.method(chrome.runtime, 'sendMessage', async () => ({
      interval_ms: 2000,
      next_capture_at: Date.now() + 3,
    }));
    const stop = startScreenshotHeartbeat();
    await clock.run();
    assert.equal([...clock.timers.values()][0].delay, 3);
    stop();
  });

  it('keeps the target cadence when worker latency varies between ticks', async (t) => {
    const clock = page(t);
    const captureTimes: number[] = [];
    t.mock.method(chrome.runtime, 'sendMessage', async () => {
      clock.advance(captureTimes.length === 0 ? 50 : 5);
      captureTimes.push(Date.now());
      const nextAt = Date.now() + 2000;
      clock.advance(400);
      return { interval_ms: 2000, next_capture_at: nextAt };
    });
    const stop = startScreenshotHeartbeat();
    await clock.run();
    await clock.run();
    assert.equal(captureTimes[1] - captureTimes[0], 2005);
    stop();
  });

  it('cannot restart its timer when Pause arrives during a worker response', async (t) => {
    const clock = page(t);
    let release!: (value: { interval_ms: number }) => void;
    t.mock.method(
      chrome.runtime,
      'sendMessage',
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const stop = startScreenshotHeartbeat();
    const pending = clock.run();
    stop();
    release({ interval_ms: 2000 });
    await pending;
    assert.equal(clock.timers.size, 0);
  });

  it('retries after a missing worker response instead of losing future ticks', async (t) => {
    const clock = page(t);
    const send = t.mock.method(chrome.runtime, 'sendMessage', async () => {
      if (send.mock.callCount() === 1) throw new Error('Worker restarted');
      return { interval_ms: 2000 };
    });
    const stop = startScreenshotHeartbeat();
    await clock.run();
    await clock.run();
    assert.equal(send.mock.callCount(), 2);
    stop();
  });
});
