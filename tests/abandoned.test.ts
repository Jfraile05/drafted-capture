// A session left alone for 20 minutes is stopped and submitted, and a session
// left open when Chrome closed is finished the next time it starts.
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { alarmClears, alarmCreates, local, session } from './stubs/chrome';

const { pauseCapture, recoverLostSession, resumeCapture, startCapture, stopCapture, stopIfAbandoned } =
  await import('../src/background/session');
const { ABANDONED_AFTER_MS, ALARM_ABANDONED, STORAGE_KEYS } = await import(
  '../src/shared/constants'
);
const { getSession } = await import('../src/shared/storage/db');
const { getLiveSession, setLiveSession } = await import('../src/shared/storage/live');

const MIN = 60 * 1000;

beforeEach(async () => {
  await stopCapture().catch(() => {});
  for (const k of Object.keys(session.data)) delete session.data[k];
  for (const k of Object.keys(local.data)) delete local.data[k];
  alarmCreates.length = 0;
  alarmClears.length = 0;
});

describe('20 minute inactive stop', () => {
  it('is 20 minutes', () => {
    assert.equal(ABANDONED_AFTER_MS, 20 * MIN);
  });

  it('stops a session paused for over 20 minutes, ending it at the pause', async () => {
    const live = await startCapture(undefined, 'productivity');
    const pausedAt = Date.now() - 25 * MIN;
    await setLiveSession({ ...live, state: 'paused', paused_at: pausedAt });
    assert.equal(await stopIfAbandoned(), true);
    assert.equal(await getLiveSession(), null);
    const saved = await getSession(live.id);
    assert.ok(saved, 'session was archived');
    assert.equal(saved.ended_at, pausedAt);
    assert.equal(saved.sync?.synced_revision, 0, 'queued for upload');
  });

  it('leaves a session paused for less than 20 minutes alone', async () => {
    const live = await startCapture(undefined, 'productivity');
    await setLiveSession({ ...live, state: 'paused', paused_at: Date.now() - 10 * MIN });
    assert.equal(await stopIfAbandoned(), false);
    assert.equal((await getLiveSession())?.state, 'paused');
  });

  it('stops a session still marked capturing when the computer slept past 20 minutes', async () => {
    const live = await startCapture(undefined, 'productivity');
    const last = Date.now() - 40 * MIN;
    await setLiveSession({ ...live, started_at: last - 30 * MIN, last_activity_at: last });
    assert.equal(await stopIfAbandoned(), true);
    assert.equal((await getSession(live.id))?.ended_at, last);
  });

  it('leaves a session with recent activity alone', async () => {
    const live = await startCapture(undefined, 'productivity');
    await setLiveSession({ ...live, last_activity_at: Date.now() - 2 * MIN });
    assert.equal(await stopIfAbandoned(), false);
    assert.equal((await getLiveSession())?.state, 'capturing');
  });

  it('does nothing without a session', async () => {
    assert.equal(await stopIfAbandoned(), false);
  });

  it('pause sets the alarm 20 minutes out, resume and stop clear it', async () => {
    const live = await startCapture(undefined, 'productivity');
    await pauseCapture();
    const paused = await getLiveSession();
    const alarm = alarmCreates.filter((a) => a.name === ALARM_ABANDONED).at(-1);
    assert.ok(alarm, 'alarm created on pause');
    assert.equal(alarm.info.when, (paused?.paused_at ?? 0) + 20 * MIN);

    alarmClears.length = 0;
    await resumeCapture();
    assert.ok(alarmClears.includes(ALARM_ABANDONED), 'cleared on resume');

    await pauseCapture();
    alarmClears.length = 0;
    await stopCapture({ session_id: live.id });
    assert.ok(alarmClears.includes(ALARM_ABANDONED), 'cleared on stop');
  });
});

describe('a session left open when Chrome closed', () => {
  it('is saved and queued for upload at the next start', async () => {
    const live = await startCapture(undefined, 'productivity');
    // Chrome quits: session storage is emptied, local storage is not.
    for (const k of Object.keys(session.data)) delete session.data[k];
    assert.equal(await getLiveSession(), null);

    assert.equal(await recoverLostSession(), true);
    const saved = await getSession(live.id);
    assert.ok(saved, 'session was archived');
    assert.equal(saved.metadata.drafted_project_id, live.metadata.drafted_project_id);
    assert.equal(saved.sync?.synced_revision, 0, 'queued for upload');
    assert.equal(local.data[STORAGE_KEYS.LIVE_BACKUP], undefined, 'backup removed');
  });

  it('ends at the last activity, not at the restart', async () => {
    const live = await startCapture(undefined, 'productivity');
    const last = Date.now() - 3 * 60 * MIN;
    await setLiveSession({ ...live, started_at: last - 30 * MIN, last_activity_at: last });
    for (const k of Object.keys(session.data)) delete session.data[k];
    await recoverLostSession();
    assert.equal((await getSession(live.id))?.ended_at, last);
  });

  it('does nothing while the session is still live', async () => {
    await startCapture(undefined, 'productivity');
    assert.equal(await recoverLostSession(), false);
    assert.equal((await getLiveSession())?.state, 'capturing');
  });

  it('only drops the leftover copy when the session was already saved', async () => {
    const live = await startCapture(undefined, 'productivity');
    const backup = local.data[STORAGE_KEYS.LIVE_BACKUP];
    await stopCapture({ session_id: live.id });
    local.data[STORAGE_KEYS.LIVE_BACKUP] = backup;
    assert.equal(await recoverLostSession(), false);
    assert.equal(local.data[STORAGE_KEYS.LIVE_BACKUP], undefined);
  });

  it('does nothing when no session was open', async () => {
    assert.equal(await recoverLostSession(), false);
  });

  it('a normal stop leaves no copy behind', async () => {
    const live = await startCapture(undefined, 'productivity');
    await stopCapture({ session_id: live.id });
    assert.equal(local.data[STORAGE_KEYS.LIVE_BACKUP], undefined);
  });
});
