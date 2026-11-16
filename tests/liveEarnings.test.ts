import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { earningsClock, liveEarnings } from '../src/shared/liveEarnings';
import { earningsForSession, summarizeEarnings } from '../src/shared/earnings';
import type { LiveSession, Session } from '../src/shared/types';

function live(patch: Partial<LiveSession> = {}): LiveSession {
  return { id: 'live', state: 'capturing', started_at: 1000, pauses: [],
    metadata: { owner_uid: 'student', workflow: { hourly_rate_cents: 100, local_only: true } },
    ...patch } as LiveSession;
}

describe('live earnings clock', () => {
  it('uses the pinned workflow rate and retains sub-cent amounts', () => {
    const clock = earningsClock(live())!;
    assert.equal(liveEarnings(clock, 3601000)?.base_earnings_micro_usd, 1000000);
    assert.equal(liveEarnings(clock, 2000)?.base_earnings_micro_usd, 278);
    clock.hourly_rate_cents = 250;
    assert.equal(liveEarnings(clock, 3601000)?.base_earnings_micro_usd, 2500000);
  });
  it('freezes manual and privacy pauses without losing fractional seconds on resume', () => {
    for (const privacy_gate of [undefined, { id: 'gate' }]) {
      const paused = live({ state: 'paused', paused_at: 2234, privacy_gate } as any);
      const a = liveEarnings(earningsClock(paused)!, 3000);
      assert.deepEqual(liveEarnings(earningsClock(paused)!, 900000), a);
      const resumed = live({ pauses: [[2234, 900000]] });
      assert.deepEqual(liveEarnings(earningsClock(resumed)!, 900000), a);
      assert.equal(liveEarnings(earningsClock(resumed)!, 900001)?.active_ms, 1235);
    }
  });
  it('catches up from timestamps after navigation, suspension, or worker restart', () => {
    const clock = JSON.parse(JSON.stringify(earningsClock(live({ pauses: [[2000, 4000]] }))));
    assert.equal(liveEarnings(clock, 10000)?.active_ms, 7000);
    assert.equal(liveEarnings(clock, 3604000)?.base_earnings_micro_usd, 1000278);
  });
  it('matches the saved session and its exact dashboard contribution after stopping', () => {
    for (const state of ['capturing', 'paused'] as const) {
      const current = live({ state, pauses: [[3000, 5000]], paused_at: state === 'paused' ? 15000 : undefined });
      const end = 20000;
      const saved = { ...current, ended_at: end, pauses: state === 'paused' ? [...current.pauses!, [15000, end]] : current.pauses } as Session;
      const ticker = liveEarnings(earningsClock(current)!, end)!;
      assert.deepEqual(ticker, earningsForSession(saved));
      const dashboard = summarizeEarnings([saved], 'student', true);
      assert.equal(ticker.active_ms, dashboard.active_ms);
      assert.equal(ticker.base_earnings_micro_usd, dashboard.base_earnings_micro_usd);
    }
  });
  it('clears on Stop and does not invent a missing or invalid rate', () => {
    assert.equal(earningsClock(null), null);
    assert.equal(earningsClock(live({ state: 'idle' })), null);
    const clock = earningsClock(live())!;
    for (const rate of [null, -1, NaN]) {
      clock.hourly_rate_cents = rate;
      assert.equal(liveEarnings(clock, 2000), null);
    }
  });
});
