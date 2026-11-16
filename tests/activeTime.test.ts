import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { activeElapsed, activeOffset, nextTimerTick } from '../src/shared/activeTime';

describe('activeElapsed', () => {
  it('counts wall time when never paused', () => {
    assert.equal(activeElapsed({ started_at: 1000 }, 6000), 5000);
  });

  it('stays fixed while paused, however much time passes', () => {
    const live = { started_at: 1000, paused_at: 4000 };
    assert.equal(activeElapsed(live, 5000), 3000);
    assert.equal(activeElapsed(live, 500000), 3000);
  });

  it('picks up from the same number after resuming', () => {
    // Paused at 2s, resumed 60s later: right after resume it still reads 2s.
    const live = { started_at: 0, pauses: [[2000, 62000]] as [number, number][] };
    assert.equal(activeElapsed(live, 62000), 2000);
    assert.equal(activeElapsed(live, 63000), 3000);
  });

  it('freezes an older paused session without a pause timestamp across reopening', () => {
    const live = { state: 'paused' as const, started_at: 1000, recent: [{ timestamp: 13456 }] };
    assert.equal(activeElapsed(live, 14000), 12456);
    assert.equal(activeElapsed(JSON.parse(JSON.stringify(live)), 74000), 12456);
  });

  it('preserves the fractional second through a long pause', () => {
    const live = { started_at: 1000, pauses: [[13456, 3600000]] as [number, number][] };
    assert.equal(activeElapsed(live, 3600000), 12456);
    assert.equal(activeElapsed(live, 3600543), 12999);
    assert.equal(activeElapsed(live, 3600544), 13000);
    assert.equal(nextTimerTick(activeElapsed(live, 3600000)), 544);
    assert.equal(nextTimerTick(activeElapsed(live, 3600544)), 1000);
  });
});

describe('activeOffset', () => {
  const pauses: [number, number][] = [
    [10000, 20000],
    [30000, 35000],
  ];

  it('leaves out only the pauses before the step', () => {
    assert.equal(activeOffset(0, pauses, 5000), 5000);
    assert.equal(activeOffset(0, pauses, 25000), 15000);
    assert.equal(activeOffset(0, pauses, 40000), 25000);
  });

  it('works for old sessions saved without pauses', () => {
    assert.equal(activeOffset(1000, undefined, 4000), 3000);
  });
});
