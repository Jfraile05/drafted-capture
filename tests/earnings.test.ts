import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { local, session } from './stubs/chrome';
import { pauseCapture, resumeCapture, startCapture, stopCapture } from '../src/background/session';
import { earningsForSession, formatEarnings, summarizeEarnings } from '../src/shared/earnings';
import { getLiveSession, setLiveSession } from '../src/shared/storage/live';
import type { Session } from '../src/shared/types';
import { WORKFLOWS } from '../src/shared/workflows';
import { __reset, listSessions } from './stubs/db';

function archived(activeMs: number, rate = 100, owner = 'student', localOnly = true): Session {
  return {
    id: crypto.randomUUID(),
    started_at: 1000,
    ended_at: 1000 + activeMs,
    pauses: [],
    metadata: {
      owner_uid: owner,
      workflow: { ...WORKFLOWS[0], hourly_rate_cents: rate, local_only: localOnly },
    },
  } as Session;
}

beforeEach(() => {
  for (const area of [local, session]) {
    for (const key of Object.keys(area.data)) delete area.data[key];
  }
  __reset();
});

describe('estimated earnings', () => {
  it('uses active hours and the rate saved with the session', () => {
    const captured = archived(2 * 3_600_000, 250);
    captured.pauses = [[1000 + 3_600_000, 1000 + 5_400_000]];
    assert.deepEqual(earningsForSession(captured), {
      currency: 'USD',
      active_ms: 5_400_000,
      rate_cents_per_hour: 250,
      base_earnings_micro_usd: 3_750_000,
    });
  });

  it('aggregates different saved rates without rounding each session to cents', () => {
    const sessions = [archived(12_000), archived(12_000), archived(12_000), archived(3_600_000, 200)];
    const total = summarizeEarnings(sessions, 'student', true);
    assert.equal(total.active_ms, 3_636_000);
    assert.equal(total.session_count, 4);
    assert.equal(formatEarnings(total.base_earnings_micro_usd), '$2.01');
  });

  it('keeps accounts and local practice separate from project sessions', () => {
    const sessions = [
      archived(3_600_000),
      archived(3_600_000, 100, 'someone-else'),
      archived(7_200_000, 100, 'student', false),
    ];
    const practice = summarizeEarnings(sessions, 'student', true);
    assert.equal(practice.session_count, 1);
    assert.equal(formatEarnings(practice.base_earnings_micro_usd), '$1.00');
    const project = summarizeEarnings(sessions, 'student', false);
    assert.equal(project.session_count, 1);
    assert.equal(formatEarnings(project.base_earnings_micro_usd), '$2.00');
    assert.equal(summarizeEarnings(sessions, '', true).session_count, 0);
  });

  it('does not invent hours or earnings for legacy records with no rate or owner', () => {
    const unknownRate = archived(3_600_000);
    delete unknownRate.metadata.workflow;
    const unknownOwner = archived(3_600_000);
    delete unknownOwner.metadata.owner_uid;
    const total = summarizeEarnings([unknownRate, unknownOwner], 'student', true);
    assert.equal(total.active_ms, 0);
    assert.equal(total.base_earnings_micro_usd, 0);
    assert.equal(total.session_count, 0);
  });

  it('supports zero active time and the full 24-hour session', () => {
    assert.equal(formatEarnings(earningsForSession(archived(0))!.base_earnings_micro_usd), '$0.00');
    assert.equal(formatEarnings(earningsForSession(archived(86_400_000))!.base_earnings_micro_usd), '$24.00');
    const paused = archived(3_600_000);
    paused.pauses = [[paused.started_at, paused.ended_at]];
    assert.equal(earningsForSession(paused)?.active_ms, 0);
  });

  it('excludes invalid rates and timestamps instead of showing corrupt totals', () => {
    for (const rate of [-100, Number.NaN, Number.POSITIVE_INFINITY, 100.5]) {
      assert.equal(earningsForSession(archived(3_600_000, rate)), null);
    }
    for (const duration of [-1000, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(earningsForSession(archived(duration)), null);
    }
  });

  it('updates from the saved archive after stopping and excludes the entire pause', async (t) => {
    let now = 1000;
    t.mock.method(Date, 'now', () => now);
    await startCapture(undefined, 'productivity');
    now += 1_800_000;
    await setLiveSession({ ...(await getLiveSession())!, last_activity_at: now });
    await pauseCapture();
    now += 3_600_000;
    await resumeCapture();
    assert.equal(summarizeEarnings(await listSessions(), 'student', false).session_count, 0);
    now += 1_800_000;
    await setLiveSession({ ...(await getLiveSession())!, last_activity_at: now });
    await stopCapture();
    const total = summarizeEarnings(await listSessions(), 'student', false);
    assert.equal(total.session_count, 1);
    assert.equal(total.active_ms, 3_600_000);
    assert.equal(formatEarnings(total.base_earnings_micro_usd), '$1.00');
    assert.deepEqual(summarizeEarnings(await listSessions(), 'student', false), total);
  });
});
