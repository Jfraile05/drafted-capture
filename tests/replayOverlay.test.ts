import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  feedSteps,
  MAX_GAP_MS,
  pointPercent,
  rectPercent,
  stepDelay,
  typedText,
} from '../src/panel/replayOverlay';
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

describe('replay timing', () => {
  const at = (timestamp: number) => ({ action: { type: 'click' }, timestamp }) as unknown as Step;
  const steps = [at(1000), at(3500), at(3550), at(60_000), at(70_000)];

  it('waits the real time between steps at 1x and divides it by the speed', () => {
    assert.equal(stepDelay(steps, 0, 0, [], 1), 2500);
    assert.equal(stepDelay(steps, 0, 0, [], 2), 1250);
  });

  it('keeps a tiny gap visible and shortens a long idle gap', () => {
    assert.equal(stepDelay(steps, 1, 0, [], 1), 100);
    assert.equal(stepDelay(steps, 2, 0, [], 1), MAX_GAP_MS);
  });

  it('leaves paused time out', () => {
    assert.equal(stepDelay(steps, 3, 0, [[62_000, 68_000]], 1), 4000);
  });
});
