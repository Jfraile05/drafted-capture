import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUILD_ID, backgroundIsStale } from '../src/shared/buildCheck';

describe('stale background check', () => {
  it('leaves a matching background alone', () => {
    assert.equal(backgroundIsStale({ build: BUILD_ID }), false);
  });

  it('flags a background running another build', () => {
    assert.equal(backgroundIsStale({ build: 'older' }), true);
  });

  it('flags a background too old to know the check', () => {
    assert.equal(backgroundIsStale({ error: 'Error: Error: Unknown message type: GET_BUILD' }), true);
  });

  it('does not flag other errors, such as being offline or the worker waking up', () => {
    assert.equal(backgroundIsStale({ error: 'Error: Could not establish connection' }), false);
    assert.equal(backgroundIsStale({}), false);
  });
});
