import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { IDLE_CONFIG } from '../src/config/idle';
import { ABANDONED_AFTER_MS } from '../src/shared/constants';
import { CLOSING_CHECK, GUIDE_STEPS, SAFETY_NETS } from '../src/shared/guide';

const allText = () =>
  [
    ...GUIDE_STEPS.flatMap((s) => [s.title, s.body, s.after ?? '']),
    ...SAFETY_NETS,
    CLOSING_CHECK,
  ].join('\n');

describe('first-run guide', () => {
  it('teaches start, stop, check and the safety net, in that order', () => {
    assert.deepEqual(
      GUIDE_STEPS.map((s) => s.id),
      ['start', 'stop', 'check', 'safety'],
    );
  });

  it('gives the first three steps a practice button and a result line', () => {
    for (const step of GUIDE_STEPS.slice(0, 3)) {
      assert.equal(step.practice, true, step.id);
      assert.ok(step.after, step.id);
    }
    assert.equal(GUIDE_STEPS[3].practice, false);
  });

  it('quotes the pause and auto-submit times the extension really uses', () => {
    const [pause, submit] = SAFETY_NETS;
    assert.match(pause, new RegExp(`${IDLE_CONFIG.defaultMs / 60_000} minutes`));
    assert.match(submit, new RegExp(`${ABANDONED_AFTER_MS / 60_000} minutes`));
  });

  it('names the same Synced and Uploading labels the popup shows', () => {
    assert.match(allText(), /Uploading/);
    assert.match(allText(), /Synced/);
  });

  it('uses no em or en dashes', () => {
    assert.doesNotMatch(allText(), /[–—]/);
  });
});
