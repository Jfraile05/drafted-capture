import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { pauseCapture, resumeCapture, startCapture, stopCapture } from '../src/background/session';
import { activeElapsed } from '../src/shared/activeTime';
import { getLiveSession, setLiveSession, withLiveLock } from '../src/shared/storage/live';
import { session, workflowAccess } from './stubs/chrome';
import { __reset, __sessions } from './stubs/db';

beforeEach(() => {
  for (const key of Object.keys(session.data)) delete session.data[key];
  __reset();
});

async function currentSession() {
  const live = await getLiveSession();
  assert.ok(live);
  return live;
}

describe('session stopwatch', () => {
  it('waits for old cleanup before starting again, even after a duplicate Stop', async (t) => {
    const first = await startCapture(undefined, 'productivity');
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    t.mock.method(chrome.runtime, 'sendMessage', async (message: { type: string }) => {
      if (message.type === 'WORKFLOW_ACCESS') return workflowAccess();
      if (message.type === 'STOP_RECORDING') {
        entered();
        await gate;
      }
      return { ok: true };
    });
    const stopping = stopCapture();
    await ready;
    assert.equal(await stopCapture(), null);
    const starting = startCapture(undefined, 'productivity');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(await getLiveSession(), null);
    release();
    await stopping;
    const second = await starting;
    assert.notEqual(second.id, first.id);
    assert.equal((await getLiveSession())?.id, second.id);
  });

  it('does not replace an existing session on a repeated Start', async () => {
    const [first, second] = await Promise.all([startCapture(undefined, 'productivity'), startCapture(undefined, 'productivity')]);
    assert.equal(first.id, second.id);
    assert.equal((await getLiveSession())?.id, first.id);
  });

  it('uses the click timestamp and ignores controls for a different session', async (t) => {
    let now = 1000;
    t.mock.method(Date, 'now', () => now);
    const live = await startCapture(undefined, 'productivity');
    now = 15000;
    await pauseCapture({ requested_at: 13456, session_id: live.id });
    assert.equal((await getLiveSession())?.paused_at, 13456);
    now = 75000;
    await resumeCapture({ requested_at: 74000, session_id: live.id });
    assert.equal(activeElapsed(await currentSession(), now), 13456);
    await pauseCapture({ session_id: 'previous-session' });
    assert.equal((await getLiveSession())?.state, 'capturing');
    assert.equal(await stopCapture({ session_id: 'previous-session' }), null);
  });

  it('a slow Resume broadcast cannot finish after a newer Pause broadcast', async (t) => {
    await startCapture(undefined, 'productivity');
    await pauseCapture();
    const messages: boolean[] = [];
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    t.mock.method(chrome.tabs, 'query', async () => [{ id: 7, url: 'https://example.com' }]);
    t.mock.method(
      chrome.tabs,
      'sendMessage',
      async (_id: number, message: { payload: { capturing: boolean } }) => {
        messages.push(message.payload.capturing);
        if (messages.length === 1) {
          entered();
          await gate;
        }
      },
    );
    const resume = resumeCapture();
    await ready;
    const pause = pauseCapture();
    await withLiveLock(async () => {});
    assert.equal((await getLiveSession())?.state, 'paused');
    release();
    await Promise.all([resume, pause]);
    assert.deepEqual(messages, [true, false]);
    assert.equal((await getLiveSession())?.state, 'paused');
  });

  it('records Pause at request time even when the storage queue is busy', async (t) => {
    let now = 1000;
    t.mock.method(Date, 'now', () => now);
    await startCapture(undefined, 'productivity');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const busy = withLiveLock(() => gate);
    now = 13456;
    const pending = pauseCapture();
    now = 40000;
    release();
    await busy;
    const paused = await pending;
    assert.ok(paused);
    assert.equal(paused.paused_at, 13456);
    assert.equal(activeElapsed(paused, now), 12456);
  });

  it('keeps exact milliseconds across repeated pauses and fresh storage reads', async (t) => {
    let now = 1000;
    t.mock.method(Date, 'now', () => now);
    await startCapture(undefined, 'productivity');
    now = 13456;
    await pauseCapture();
    now = 74000;
    assert.equal(activeElapsed(await currentSession(), now), 12456);
    await pauseCapture();
    assert.equal((await getLiveSession())?.paused_at, 13456);
    await resumeCapture();
    assert.equal(activeElapsed(await currentSession(), now), 12456);
    await resumeCapture();
    assert.equal((await getLiveSession())?.pauses?.length, 1);
    now += 544;
    assert.equal(activeElapsed(await currentSession(), now), 13000);
    await pauseCapture();
    now += 90000;
    await resumeCapture();
    assert.equal(activeElapsed(await currentSession(), now), 13000);
  });

  it('resumes a legacy pause from its last known time instead of counting the gap', async (t) => {
    let now = 1000;
    t.mock.method(Date, 'now', () => now);
    const live = await startCapture(undefined, 'productivity');
    await setLiveSession({
      ...live,
      state: 'paused',
      recent: [
        { index: 0, type: 'click', timestamp: 13456, label: 'Click', url: 'https://example.com' },
      ],
    });
    now = 74000;
    const resumed = await resumeCapture();
    assert.ok(resumed);
    assert.equal(activeElapsed(resumed, now), 12456);
    assert.deepEqual(resumed?.pauses, [[13456, 74000]]);
  });

  it('archives the stopwatch duration even when there were no captured events', async (t) => {
    let now = 1000;
    t.mock.method(Date, 'now', () => now);
    await startCapture(undefined, 'productivity');
    now = 13456;
    const id = await stopCapture();
    assert.ok(id);
    assert.equal(__sessions.get(id)?.outcome.total_duration_ms, 12456);
    assert.equal(__sessions.get(id)?.ended_at, 13456);
  });

  it('does not count delayed cleanup as recording time', async (t) => {
    let now = 1000;
    t.mock.method(Date, 'now', () => now);
    const live = await startCapture(undefined, 'productivity');
    await setLiveSession({ ...live, step_count: 1 });
    t.mock.method(chrome.action, 'setBadgeText', async () => {
      now += 5000;
    });
    now = 13456;
    const id = await stopCapture();
    assert.ok(id);
    assert.equal(__sessions.get(id)?.ended_at, 13456);
  });
});
