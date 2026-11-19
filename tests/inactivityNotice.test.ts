import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { IDLE_CONFIG, idleThreshold } from '../src/config/idle';
import { ABANDONED_AFTER_MS } from '../src/shared/constants';
import { autoSubmitAt, pauseNotice } from '../src/shared/inactivity';
import type { LiveSession } from '../src/shared/types';

const MIN = 60 * 1000;
const paused = (extra: Partial<LiveSession> = {}) =>
  ({ state: 'paused', started_at: 1_000_000, paused_at: 1_600_000, ...extra }) as LiveSession;

describe('pausing for inactivity', () => {
  it('pauses after 2 minutes, whatever the saved setting says', () => {
    assert.equal(IDLE_CONFIG.defaultMs, 2 * MIN);
    assert.equal(idleThreshold(2 * MIN), 2 * MIN);
    assert.equal(idleThreshold(3 * MIN), 2 * MIN);
    assert.equal(idleThreshold(10 * MIN), 2 * MIN);
    assert.equal(idleThreshold(Number.NaN), 2 * MIN);
  });

  it('submits 20 minutes after the pause', () => {
    assert.equal(ABANDONED_AFTER_MS, 20 * MIN);
    assert.equal(autoSubmitAt(paused()), 1_600_000 + 20 * MIN);
  });
});

describe('what the popup says under a paused session', () => {
  it('says why it paused and when it will submit after inactivity', () => {
    const text = pauseNotice(paused({ pause_reason: 'idle' }), 'en-US');
    assert.match(text, /^Paused because you were inactive\./);
    assert.match(text, /Sidekick submits this session at \d{1,2}:\d{2}\s?(AM|PM)\./);
  });

  it('tells a manual pause when it will submit too', () => {
    const text = pauseNotice(paused(), 'en-US');
    assert.match(text, /^Paused\. If you don't resume, Sidekick submits this session at/);
    assert.doesNotMatch(text, /inactive/);
  });
});
