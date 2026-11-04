// Regression tests for "Stop and Pause get stuck".
//
// Every capture handler reads the live session, awaits a slow screenshot, then
// writes the whole session object back. A Pause or Stop that lands during that
// await used to be overwritten by the stale write, so the popup flipped back to
// "capturing" and kept recording.
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { session } from './stubs/chrome';

const { handleCaptureEvent } = await import('../src/background/coordinator');
const { pauseCapture, resumeCapture, startCapture, stopCapture } = await import('../src/background/session');
const { getLiveSession } = await import('../src/shared/storage/live');
const stubDb = (await import('./stubs/db')) as typeof import('./stubs/db');

const sender = { tab: { id: 7, windowId: 1, url: 'https://example.com/' }, frameId: 0 } as any;
const click = (n: number) =>
  ({
    event: { type: 'click', timestamp: 1000 + n, client_x: 5, client_y: 5, button: 0, modifiers: [] },
    dom: null,
    dpr: 1,
  }) as any;

// Lets a test hold the screenshot step open, then release it.
function holdCapture() {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  (globalThis as any).__capture = () => gate;
  return release;
}
const tick = () => new Promise<void>((r) => setTimeout(r, 5));

beforeEach(async () => {
  (globalThis as any).__capture = undefined;
  for (const k of Object.keys(session.data)) delete session.data[k];
  stubDb.__reset();
});

describe('stop and pause survive an in-flight capture', () => {
  it('Pause during a screenshot stays paused', async () => {
    await startCapture();
    const release = holdCapture();
    const pending = handleCaptureEvent(click(1), sender);
    await tick();

    await pauseCapture();
    release();
    await pending;

    assert.equal((await getLiveSession())?.state, 'paused');
  });

  it('Stop during a screenshot stays stopped and leaves no orphan steps', async () => {
    const started = await startCapture();
    const release = holdCapture();
    const pending = handleCaptureEvent(click(1), sender);
    await tick();

    await stopCapture();
    release();
    await pending;

    assert.equal(await getLiveSession(), null);
    assert.equal(stubDb.__steps.has(started.id), false);
  });

  it('Resume then Stop during a screenshot also ends idle', async () => {
    await startCapture();
    await pauseCapture();
    await resumeCapture();
    const release = holdCapture();
    const pending = handleCaptureEvent(click(1), sender);
    await tick();

    await stopCapture();
    release();
    await pending;

    assert.equal(await getLiveSession(), null);
  });

  it('Two simultaneous events keep every step with unique indexes', async () => {
    const started = await startCapture();
    await Promise.all([handleCaptureEvent(click(1), sender), handleCaptureEvent(click(2), sender)]);

    const steps = stubDb.__steps.get(started.id) ?? [];
    assert.equal(steps.length, 2);
    assert.deepEqual(steps.map((s) => s.index).sort(), [0, 1]);
    assert.equal((await getLiveSession())?.step_count, 2);
  });
});
