import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { BASE_SETUP, SETUPS } from '../src/shared/setups';
import { parseSetup, parseTheme, readTheme } from '../src/shared/theme';

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

  it('keeps a stored setup only when it still exists', () => {
    assert.equal(parseSetup('neon'), 'neon');
    assert.equal(parseSetup('paper'), 'paper');
    assert.equal(parseSetup('glass-light'), 'soft-graphite');
    assert.equal(parseSetup(null), 'soft-graphite');
  });
});

describe('setups', () => {
  it('has unique ids and includes the default', () => {
    const ids = SETUPS.map((setup) => setup.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.includes(BASE_SETUP));
  });

  it('has a light and a dark block for every setup except the default, and no extras', () => {
    const css = readFileSync('src/setups.css', 'utf8'); // tests run from the repo root
    const blocks = [
      ...css.matchAll(/^\[data-theme="(light|dark)"\]\[data-setup="([a-z-]+)"\]\s*\{/gm),
    ].map((m) => `${m[2]}/${m[1]}`);
    const expected = SETUPS.filter((s) => s.id !== BASE_SETUP).flatMap((s) => [
      `${s.id}/light`,
      `${s.id}/dark`,
    ]);
    assert.deepEqual([...blocks].sort(), [...expected].sort());
  });
});
