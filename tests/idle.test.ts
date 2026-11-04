// Auto-pause when the student walks away (chrome.idle).
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { idleCalls, local, session } from './stubs/chrome';

const { startCapture, pauseCapture } = await import('../src/background/session');
const { applyIdleDetection, pauseIfIdle } = await import('../src/background/idle');
const { getLiveSession } = await import('../src/shared/storage/live');

beforeEach(() => {
  for (const k of Object.keys(session.data)) delete session.data[k];
  for (const k of Object.keys(local.data)) delete local.data[k];
  idleCalls.length = 0;
});

describe('idle auto-pause', () => {
  it('pauses a capturing session when the user goes idle', async () => {
    await startCapture();
    await pauseIfIdle('idle');
    assert.equal((await getLiveSession())?.state, 'paused');
  });

  it('pauses when the screen locks', async () => {
    await startCapture();
    await pauseIfIdle('locked');
    assert.equal((await getLiveSession())?.state, 'paused');
  });

  it('does nothing when the user is active', async () => {
    await startCapture();
    await pauseIfIdle('active');
    assert.equal((await getLiveSession())?.state, 'capturing');
  });

  it('never resumes by itself when the user comes back', async () => {
    await startCapture();
    await pauseIfIdle('idle');
    await pauseIfIdle('active');
    assert.equal((await getLiveSession())?.state, 'paused');
  });

  it('leaves an already paused session alone', async () => {
    await startCapture();
    await pauseCapture();
    await pauseIfIdle('idle');
    assert.equal((await getLiveSession())?.state, 'paused');
  });

  it('is a no-op with no session', async () => {
    await pauseIfIdle('idle');
    assert.equal(await getLiveSession(), null);
  });
});

describe('idle detection interval', () => {
  it('uses the default of 5 minutes', async () => {
    await applyIdleDetection();
    assert.deepEqual(idleCalls, [300]);
  });

  it('follows the saved setting', async () => {
    local.data.settings = { idle_timeout_ms: 120_000 };
    await applyIdleDetection();
    assert.deepEqual(idleCalls, [120]);
  });

  it('never goes below Chrome minimum of 15 seconds', async () => {
    local.data.settings = { idle_timeout_ms: 1000 };
    await applyIdleDetection();
    assert.deepEqual(idleCalls, [15]);
  });
});
