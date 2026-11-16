import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { alarmCreates, local, session } from './stubs/chrome';
import { handleIntervalScreenshot } from '../src/background/coordinator';
import {
  pauseCapture,
  rebroadcastCaptureState,
  startCapture,
  stopCapture,
} from '../src/background/session';
import { getLiveSession, setLiveSession, setSettings } from '../src/shared/storage/live';
import { __reset, __steps } from './stubs/db';

const tab = { id: 7, windowId: 1, url: 'https://example.com/', active: true };
const sender = { tab, frameId: 0 } as chrome.runtime.MessageSender;
const screenshot = { hash: 'frame', width: 800, height: 600, dpr: 1, size: 100, timestamp: 1000 };

beforeEach(() => {
  for (const key of Object.keys(session.data)) delete session.data[key];
  for (const key of Object.keys(local.data)) delete local.data[key];
  alarmCreates.length = 0;
  __reset();
  (globalThis as any).__capture = async () => screenshot;
});

describe('periodic screenshot cadence', () => {
  it('shares one interval between page ticks and the fallback alarm', async (t) => {
    let now = 1000;
    t.mock.method(Date, 'now', () => now);
    t.mock.method(chrome.tabs, 'query', async () => [tab]);
    const live = await startCapture(undefined, 'productivity');
    await handleIntervalScreenshot(sender);
    await handleIntervalScreenshot();
    assert.equal(__steps.get(live.id)?.length, 1);
    now += 1999;
    assert.equal((await handleIntervalScreenshot()).next_capture_at, 3000);
    assert.equal(__steps.get(live.id)?.length, 1);
    now += 1;
    await handleIntervalScreenshot(sender);
    assert.equal(__steps.get(live.id)?.length, 2);
    assert.ok(
      alarmCreates.some(
        (alarm) => alarm.name === 'screenshot-tick' && alarm.info.periodInMinutes === 1,
      ),
    );
  });

  it('rejects iframe and inactive-tab ticks without blocking the active tab', async (t) => {
    t.mock.method(chrome.tabs, 'query', async () => [tab]);
    const live = await startCapture(undefined, 'productivity');
    await handleIntervalScreenshot({ ...sender, frameId: 2 });
    await handleIntervalScreenshot({ ...sender, tab: { ...tab, id: 8 } } as any);
    assert.equal(__steps.get(live.id)?.length ?? 0, 0);
    await handleIntervalScreenshot(sender);
    assert.equal(__steps.get(live.id)?.length, 1);
  });

  it('coalesces overlapping ticks and discards a frame completed after Pause', async (t) => {
    t.mock.method(chrome.tabs, 'query', async () => [tab]);
    const live = await startCapture(undefined, 'productivity');
    let entered!: () => void;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    (globalThis as any).__capture = async () => {
      calls++;
      entered();
      await gate;
      return screenshot;
    };
    const pending = handleIntervalScreenshot(sender);
    await ready;
    await handleIntervalScreenshot();
    await pauseCapture();
    release();
    await pending;
    assert.equal(calls, 1);
    assert.equal(__steps.get(live.id)?.length ?? 0, 0);
    assert.equal((await getLiveSession())?.state, 'paused');
    await handleIntervalScreenshot(sender);
    assert.equal(calls, 1);
  });

  it('uses fixed two-second cadence after worker recovery despite a saved override', async (t) => {
    t.mock.method(chrome.tabs, 'query', async () => [tab]);
    await chrome.storage.local.set({ settings: { screenshot_interval_ms: 3000 } });
    const live = await startCapture(undefined, 'productivity');
    await setLiveSession({ ...live, id: 'restored-session' });
    await rebroadcastCaptureState();
    assert.equal((await handleIntervalScreenshot(sender)).interval_ms, 2000);
    assert.equal(__steps.get('restored-session')?.length, 1);
    await stopCapture();
    await handleIntervalScreenshot(sender);
    assert.equal(await getLiveSession(), null);
  });

  it('stops at the step limit even without new user actions', async (t) => {
    t.mock.method(chrome.tabs, 'query', async () => [tab]);
    await setSettings({ max_steps: 1 });
    await startCapture(undefined, 'productivity');
    await handleIntervalScreenshot(sender);
    await handleIntervalScreenshot(sender);
    assert.equal(await getLiveSession(), null);
  });
});
