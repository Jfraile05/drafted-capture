import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { STORAGE_KEYS } from '../src/shared/constants';
import { observeLiveSession } from '../src/shared/observeLiveSession';
import type { LiveSession } from '../src/shared/types';

type ChangeListener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;
const listeners = new Set<ChangeListener>();
const reads: ((values: Record<string, unknown>) => void)[] = [];
const recording = { id: 'test-session', state: 'capturing', started_at: 1000 } as LiveSession;
const paused = { ...recording, state: 'paused', paused_at: 4750 } as LiveSession;
const resumed = {
  ...recording,
  pauses: [[4750, 20000]],
} as LiveSession;

function emit(
  value: LiveSession | null,
  area = 'session',
  key: string = STORAGE_KEYS.LIVE_SESSION,
) {
  for (const listener of listeners) {
    listener({ [key]: { newValue: value ?? undefined } }, area);
  }
}

function finishRead(index: number, value: LiveSession | null) {
  reads[index](value ? { [STORAGE_KEYS.LIVE_SESSION]: value } : {});
}

beforeEach(() => {
  listeners.clear();
  reads.length = 0;
  globalThis.chrome = {
    storage: {
      session: {
        get: (_key: string, callback: (values: Record<string, unknown>) => void) => {
          reads.push(callback);
        },
      },
      onChanged: {
        addListener: (listener: ChangeListener) => listeners.add(listener),
        removeListener: (listener: ChangeListener) => listeners.delete(listener),
      },
    },
  } as unknown as typeof chrome;
});

describe('live session subscription', () => {
  it('loads the stored state and follows later pause and resume updates', () => {
    const values: (LiveSession | null)[] = [];
    observeLiveSession((value) => values.push(value));
    finishRead(0, recording);
    emit(paused);
    emit(resumed);
    assert.deepEqual(values, [recording, paused, resumed]);
  });

  it('does not overwrite a pause with an older initial recording read', () => {
    const values: (LiveSession | null)[] = [];
    observeLiveSession((value) => values.push(value));
    emit(paused);
    finishRead(0, recording);
    assert.deepEqual(values, [paused]);
  });

  it('does not resurrect a stopped session when the initial read arrives late', () => {
    const values: (LiveSession | null)[] = [];
    observeLiveSession((value) => values.push(value));
    emit(null);
    finishRead(0, recording);
    assert.deepEqual(values, [null]);
  });

  it('ignores unrelated storage changes without dropping the initial read', () => {
    const values: (LiveSession | null)[] = [];
    observeLiveSession((value) => values.push(value));
    emit(paused, 'local');
    emit(paused, 'session', 'mascot_moment');
    finishRead(0, recording);
    assert.deepEqual(values, [recording]);
  });

  it('ignores a pending read and storage updates after the popup closes', () => {
    const values: (LiveSession | null)[] = [];
    const unsubscribe = observeLiveSession((value) => values.push(value));
    unsubscribe();
    finishRead(0, recording);
    emit(paused);
    assert.deepEqual(values, []);
    assert.equal(listeners.size, 0);
  });

  it('reopening reads the current paused state independently of the old popup', () => {
    const oldValues: (LiveSession | null)[] = [];
    const newValues: (LiveSession | null)[] = [];
    const close = observeLiveSession((value) => oldValues.push(value));
    close();
    observeLiveSession((value) => newValues.push(value));
    finishRead(1, paused);
    finishRead(0, recording);
    assert.deepEqual(oldValues, []);
    assert.deepEqual(newValues, [paused]);
  });
});
