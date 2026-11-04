// 24 hour hard cap per session.
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { alarmClears, alarmCreates, local, session } from './stubs/chrome';

const { enforceSessionCap, sessionCapMs, startCapture, stopCapture } = await import('../src/background/session');
const { ALARM_SESSION_CAP, DEFAULT_SETTINGS, MAX_SESSION_MS } = await import('../src/shared/constants');
const { getLiveSession, setLiveSession } = await import('../src/shared/storage/live');

const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  for (const k of Object.keys(session.data)) delete session.data[k];
  for (const k of Object.keys(local.data)) delete local.data[k];
  alarmCreates.length = 0;
  alarmClears.length = 0;
});

describe('24 hour cap', () => {
  it('the default session limit is a full day', () => {
    assert.equal(MAX_SESSION_MS, 24 * HOUR);
    assert.equal(DEFAULT_SETTINGS.max_duration_ms, 24 * HOUR);
  });

  it('a saved limit above 24 hours is clamped to 24 hours', () => {
    assert.equal(sessionCapMs({ ...DEFAULT_SETTINGS, max_duration_ms: 72 * HOUR }), 24 * HOUR);
    assert.equal(sessionCapMs({ ...DEFAULT_SETTINGS, max_duration_ms: 2 * HOUR }), 2 * HOUR);
  });

  it('start schedules one alarm at the exact end time', async () => {
    const live = await startCapture();
    const cap = alarmCreates.find((a) => a.name === ALARM_SESSION_CAP);
    assert.ok(cap, 'cap alarm created');
    assert.equal(cap.info.when, live.started_at + 24 * HOUR);
  });

  it('stop clears the cap alarm', async () => {
    await startCapture();
    await stopCapture();
    assert.ok(alarmClears.includes(ALARM_SESSION_CAP));
  });

  it('the cap fires on a paused session too, since the clock is wall time', async () => {
    const live = await startCapture();
    await setLiveSession({ ...live, state: 'paused', started_at: Date.now() - 25 * HOUR });
    assert.equal(await enforceSessionCap(), true);
    assert.equal(await getLiveSession(), null);
  });

  it('a session under the cap is left running', async () => {
    const live = await startCapture();
    await setLiveSession({ ...live, started_at: Date.now() - 23 * HOUR });
    assert.equal(await enforceSessionCap(), false);
    assert.equal((await getLiveSession())?.state, 'capturing');
  });

  it('a stale alarm does not stop a brand new session', async () => {
    await startCapture();
    assert.equal(await enforceSessionCap(), false);
    assert.equal((await getLiveSession())?.state, 'capturing');
  });

  it('no session is a no-op', async () => {
    assert.equal(await enforceSessionCap(), false);
  });
});
