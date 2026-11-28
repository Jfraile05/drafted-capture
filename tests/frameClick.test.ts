// A click inside a frame reports a position relative to that frame, but the
// screenshot is the whole tab. The step keeps the click and leaves the position out.
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { local, session } from './stubs/chrome';

const { handleCaptureEvent } = await import('../src/background/coordinator');
const { startCapture } = await import('../src/background/session');
const stubDb = (await import('./stubs/db')) as typeof import('./stubs/db');

const sender = (frameId: number) =>
  ({ tab: { id: 7, windowId: 1, url: 'https://claude.ai/chat' }, frameId }) as any;
const clicked = (type: 'click' | 'double_click' | 'right_click') =>
  ({
    event: { type, timestamp: Date.now(), client_x: 40, client_y: 50, button: 0, modifiers: [] },
    dom: null,
    dpr: 1,
  }) as any;

beforeEach(() => {
  for (const k of Object.keys(session.data)) delete session.data[k];
  for (const k of Object.keys(local.data)) delete local.data[k];
  stubDb.__reset();
});

describe('click positions from frames', () => {
  it('keeps the position of a click in the top frame', async () => {
    const live = await startCapture(undefined, 'productivity');
    await handleCaptureEvent(clicked('click'), sender(0));
    const stored = stubDb.__steps.get(live.id)?.[0];
    assert.deepEqual(stored?.action.coordinate, [40, 50]);
    assert.equal(stored?.origin.frame_id, 0);
  });

  it('records a click inside a frame without its frame-relative position', async () => {
    const live = await startCapture(undefined, 'productivity');
    for (const type of ['click', 'double_click', 'right_click'] as const) {
      const r = await handleCaptureEvent(clicked(type), sender(3));
      assert.equal(r.ok, true);
    }
    const stored = stubDb.__steps.get(live.id) ?? [];
    assert.deepEqual(
      stored.map((step) => step.action.type),
      ['click', 'double_click', 'right_click'],
    );
    for (const step of stored) {
      assert.equal(step.action.coordinate, undefined);
      assert.equal(step.origin.frame_id, 3);
    }
  });
});
