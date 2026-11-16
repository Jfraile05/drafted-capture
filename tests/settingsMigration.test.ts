// Moving installs off the old 5,000 step and 4 hour defaults.
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { local } from './stubs/chrome';

const { getSettings, migrateLegacyLimits } = await import('../src/shared/storage/live');
const { DEFAULT_SETTINGS, LEGACY_MAX_DURATION_MS, LEGACY_MAX_STEPS } = await import(
  '../src/shared/constants'
);

const saved = () => local.data.settings as Record<string, unknown>;

beforeEach(() => {
  for (const k of Object.keys(local.data)) delete local.data[k];
});

describe('legacy limit migration', () => {
  it('moves the old defaults to the new ones and keeps other settings', async () => {
    local.data.settings = {
      max_steps: LEGACY_MAX_STEPS,
      max_duration_ms: LEGACY_MAX_DURATION_MS,
      record_video: true,
    };
    await migrateLegacyLimits();
    assert.equal(saved().max_steps, DEFAULT_SETTINGS.max_steps);
    assert.equal(saved().max_duration_ms, DEFAULT_SETTINGS.max_duration_ms);
    assert.equal(saved().record_video, undefined);
  });

  it('leaves values someone chose alone', async () => {
    local.data.settings = { max_steps: 1000, max_duration_ms: 2 * 60 * 60 * 1000 };
    await migrateLegacyLimits();
    assert.equal(saved().max_steps, 1000);
    assert.equal(saved().max_duration_ms, 2 * 60 * 60 * 1000);
  });

  it('does nothing when nothing was ever saved', async () => {
    await migrateLegacyLimits();
    assert.equal(local.data.settings, undefined);
    assert.equal('screenshot_interval_ms' in await getSettings(), false);
  });

  it('removes the retired screenshot interval and export options', async () => {
    local.data.settings = { screenshot_interval_ms: 2500, export_formats: { universal: true }, mask_all_inputs: true };
    await migrateLegacyLimits();
    assert.equal('screenshot_interval_ms' in saved(), false);
    assert.equal('export_formats' in saved(), false);
    assert.equal(saved().mask_all_inputs, true);
    await migrateLegacyLimits();
    assert.equal('screenshot_interval_ms' in saved(), false);
    assert.equal('export_formats' in saved(), false);
  });

  it('ignores all saved custom screenshot intervals', async () => {
    for (const interval of [1000, 1800, 3000, 5000]) {
      local.data.settings = { screenshot_interval_ms: interval };
      await migrateLegacyLimits();
      assert.equal('screenshot_interval_ms' in await getSettings(), false);
      assert.equal('screenshot_interval_ms' in saved(), false);
    }
  });
});
