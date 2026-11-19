import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { feedSteps, pointPercent, rectPercent, typedText } from '../src/panel/replayOverlay';
import type { ScreenshotRef, Step } from '../src/shared/types';

const shot = { width: 2000, height: 1000, dpr: 2 } as ScreenshotRef;
const step = (type: string, extra: Partial<Step> = {}) =>
  ({ action: { type }, ...extra }) as unknown as Step;

describe('replay overlay positions', () => {
  it('places a click by its CSS pixels on a high density screenshot', () => {
    assert.deepEqual(pointPercent([500, 250], shot), { left: 50, top: 50 });
  });

  it('places a typed field box the same way', () => {
    assert.deepEqual(rectPercent({ x: 100, y: 50, width: 200, height: 25 }, shot), {
      left: 10,
      top: 10,
      width: 20,
      height: 5,
    });
  });
});

describe('replay action feed', () => {
  it('lists actions up to the current step, newest first, without timed screenshots', () => {
    const steps = [step('navigate'), step('screenshot'), step('click'), step('type'), step('scroll')];
    assert.deepEqual(feedSteps(steps, 3), [3, 2, 0]);
    assert.deepEqual(feedSteps(steps, 1), [0]);
  });
});

describe('replay typed text', () => {
  it('shows what was typed', () => {
    assert.equal(typedText(step('type', { action: { type: 'type', text: 'Boston' } })), 'Boston');
  });

  it('never shows text from a sensitive field', () => {
    assert.equal(
      typedText(step('type', { action: { type: 'type', text: '[redacted]' } })),
      'Hidden for privacy',
    );
    assert.equal(
      typedText(
        step('type', {
          action: { type: 'type', text: 'abc' },
          dom: { sensitive: true } as Step['dom'],
        }),
      ),
      'Hidden for privacy',
    );
  });
});
