import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { nearestScreenshotIndex } from '../src/panel/nearestScreenshot';
import type { Step } from '../src/shared/types';

// Only `screenshot` matters to the helper.
const steps = (shots: boolean[]) =>
  shots.map((has) => ({ screenshot: has ? { hash: 'h' } : null }) as unknown as Step);

describe('nearestScreenshotIndex', () => {
  it('uses the step own screenshot when it has one', () => {
    assert.equal(nearestScreenshotIndex(steps([true, true, true]), 1), 1);
  });

  it('shows the first screenshot on step 1 when step 1 has none', () => {
    assert.equal(nearestScreenshotIndex(steps([false, false, true, true]), 0), 2);
  });

  it('prefers the closest earlier screenshot', () => {
    assert.equal(nearestScreenshotIndex(steps([true, false, false, true]), 2), 0);
  });

  it('returns null when the session has no screenshots', () => {
    assert.equal(nearestScreenshotIndex(steps([false, false]), 1), null);
  });
});
