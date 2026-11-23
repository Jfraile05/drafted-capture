import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseTheme, readTheme } from '../src/shared/theme';

describe('theme', () => {
  it('is dark unless light was picked', () => {
    assert.equal(parseTheme('light'), 'light');
    assert.equal(parseTheme('dark'), 'dark');
    assert.equal(parseTheme(null), 'dark');
    assert.equal(parseTheme('sepia'), 'dark');
  });

  it('falls back to dark when storage is unavailable', () => {
    // Node has no usable localStorage here, so reading must not throw.
    assert.equal(readTheme(), 'dark');
  });
});
