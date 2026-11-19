import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUILD_ID, shouldReloadForBuild } from '../src/shared/buildCheck';

describe('stale background check', () => {
  const now = 1_000_000;

  it('leaves a matching background alone', () => {
    assert.equal(shouldReloadForBuild({ build: BUILD_ID }, false, undefined, now), false);
  });

  it('reloads when the background runs another build', () => {
    assert.equal(shouldReloadForBuild({ build: 'older' }, false, undefined, now), true);
  });

  it('reloads when the background is too old to know the check', () => {
    const error = 'Error: Error: Unknown message type: GET_BUILD';
    assert.equal(shouldReloadForBuild({ error }, false, undefined, now), true);
  });

  it('does not reload on other errors, during a recording, or twice in a minute', () => {
    assert.equal(shouldReloadForBuild({ error: 'offline' }, false, undefined, now), false);
    assert.equal(shouldReloadForBuild({ build: 'older' }, true, undefined, now), false);
    assert.equal(shouldReloadForBuild({ build: 'older' }, false, now - 30_000, now), false);
    assert.equal(shouldReloadForBuild({ build: 'older' }, false, now - 61_000, now), true);
  });
});
