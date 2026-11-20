import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CrashGuard } from '../src/shared/CrashGuard';

describe('crash screen', () => {
  it('keeps the error so the screen can show what went wrong', () => {
    const state = CrashGuard.getDerivedStateFromError(new Error('Cannot read properties of undefined'));
    assert.equal(state.error?.message, 'Cannot read properties of undefined');
  });

  it('turns a thrown value that is not an Error into one', () => {
    const state = CrashGuard.getDerivedStateFromError('plain text');
    assert.equal(state.error?.message, 'plain text');
  });
});
