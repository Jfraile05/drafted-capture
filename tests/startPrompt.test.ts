import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { local, notices, session } from './stubs/chrome';
import { __reset } from './stubs/db';
import { START_PROMPT, handleStartPromptButton, noteBrowsing } from '../src/background/startPrompt';
import { startCapture, stopCapture } from '../src/background/session';
import { getLiveSession } from '../src/shared/storage/live';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../src/shared/constants';
import { selectWorkflow } from '../src/shared/workflows';

let now: number;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const browse = async (count: number, url = 'https://example.com/page') => {
  for (let i = 0; i < count; i++) {
    now += 1000;
    await noteBrowsing(url);
  }
};

beforeEach(async (t) => {
  for (const area of [local, session]) for (const key of Object.keys(area.data)) delete area.data[key];
  __reset();
  notices.clear();
  now = 10_000_000;
  t.mock.method(Date, 'now', () => now);
  local.data[STORAGE_KEYS.SETTINGS] = {
    ...DEFAULT_SETTINGS,
    consent_accepted: true,
  };
  await selectWorkflow('student', 'productivity');
});

describe('start recording prompt', () => {
  it('asks after a few page loads while Sidekick is off', async () => {
    await browse(START_PROMPT.pageLoads - 1);
    assert.equal(notices.size, 0);
    await browse(1);
    const notice = notices.get(START_PROMPT.notificationId);
    assert.ok(notice);
    assert.deepEqual(notice.buttons?.map((b) => b.title), ['Start recording', 'Not now']);
  });

  it('stays quiet when the student turned nudges off in settings', async () => {
    local.data[STORAGE_KEYS.SETTINGS] = { ...DEFAULT_SETTINGS, consent_accepted: true, start_nudges: false };
    await browse(START_PROMPT.pageLoads * 2);
    assert.equal(notices.size, 0);
  });

  it('asks at most once per cooldown', async () => {
    await browse(START_PROMPT.pageLoads);
    notices.clear();
    await browse(START_PROMPT.pageLoads * 3);
    assert.equal(notices.size, 0);
    now += START_PROMPT.cooldownMs;
    await browse(START_PROMPT.pageLoads);
    assert.equal(notices.size, 1);
  });

  it('only counts page loads inside the window', async () => {
    for (let i = 0; i < START_PROMPT.pageLoads; i++) {
      now += START_PROMPT.windowMs;
      await noteBrowsing('https://example.com');
    }
    assert.equal(notices.size, 0);
  });

  it('stays quiet while recording, before consent, without a workflow, or on non-web pages', async () => {
    await startCapture(undefined, 'productivity');
    await browse(START_PROMPT.pageLoads);
    assert.equal(notices.size, 0);
    await stopCapture();

    await browse(START_PROMPT.pageLoads, 'chrome://extensions');
    assert.equal(notices.size, 0);

    local.data[STORAGE_KEYS.SETTINGS] = { ...DEFAULT_SETTINGS, consent_accepted: false };
    await browse(START_PROMPT.pageLoads);
    assert.equal(notices.size, 0);

    local.data[STORAGE_KEYS.SETTINGS] = { ...DEFAULT_SETTINGS, consent_accepted: true };
    await selectWorkflow('student', 'not-assigned');
    await browse(START_PROMPT.pageLoads);
    assert.equal(notices.size, 0);
  });

  it('starts recording from the button and clears the prompt', async () => {
    await browse(START_PROMPT.pageLoads);
    assert.equal(handleStartPromptButton(START_PROMPT.notificationId, 0), true);
    for (let i = 0; i < 20 && !(await getLiveSession()); i++) await settle();
    const live = await getLiveSession();
    assert.equal(live?.state, 'capturing');
    assert.equal(live?.metadata.workflow?.id, 'productivity');
    assert.equal(notices.size, 0);
  });

  it('Not now just closes it, and other notifications are ignored', async () => {
    await browse(START_PROMPT.pageLoads);
    assert.equal(handleStartPromptButton('sidekick-idle:abc', 0), false);
    assert.equal(handleStartPromptButton(START_PROMPT.notificationId, 1), true);
    await settle();
    assert.equal(notices.size, 0);
    assert.equal(await getLiveSession(), null);
  });
});
