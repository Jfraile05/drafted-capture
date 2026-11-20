import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { STEP_CHUNK, createStepLog } from '../src/shared/storage/stepChunks';
import type { Step } from '../src/shared/types';

function memory() {
  const data = new Map<string, unknown>();
  const writes: number[] = [];
  return {
    data,
    writes,
    kv: {
      get: async <T>(key: string) => structuredClone(data.get(key)) as T | undefined,
      set: async (key: string, value: unknown) => {
        if (Array.isArray(value)) writes.push(value.length);
        data.set(key, structuredClone(value));
      },
      del: async (key: string) => {
        data.delete(key);
      },
    },
  };
}

const step = (i: number) =>
  ({ index: i, timestamp: 1000 + i * 1000, action: { type: 'click' } }) as unknown as Step;

describe('steps saved in chunks', () => {
  it('keeps every step in order across chunk boundaries and stamps each duration', async () => {
    const { kv } = memory();
    const log = createStepLog(kv);
    const total = STEP_CHUNK * 2 + 37;
    for (let i = 0; i < total; i++) assert.equal(await log.append('s', step(i)), i + 1);
    const steps = await log.get('s');
    assert.equal(steps.length, total);
    assert.deepEqual(
      steps.map((x) => x.index),
      Array.from({ length: total }, (_, i) => i),
    );
    for (let i = 0; i < total - 1; i++) assert.equal(steps[i].duration_to_next, 1000, `step ${i}`);
    assert.equal(steps[total - 1].duration_to_next, undefined);
  });

  it('writes the same small amount per step however long the session is', async () => {
    const { kv, writes } = memory();
    const log = createStepLog(kv);
    for (let i = 0; i < STEP_CHUNK * 6; i++) await log.append('s', step(i));
    assert.ok(Math.max(...writes) <= STEP_CHUNK, `largest write was ${Math.max(...writes)} steps`);
  });

  it('moves a session saved as one list over to chunks', async () => {
    const { kv, data } = memory();
    const legacy = Array.from({ length: STEP_CHUNK + 5 }, (_, i) => step(i));
    data.set('old', legacy);
    const log = createStepLog(kv);
    assert.equal(await log.append('old', step(STEP_CHUNK + 5)), STEP_CHUNK + 6);
    const steps = await log.get('old');
    assert.equal(steps.length, STEP_CHUNK + 6);
    assert.equal(steps[STEP_CHUNK + 5].index, STEP_CHUNK + 5);
    assert.equal(data.has('old'), false, 'old list removed');
  });

  it('cannot leave a step twice when a write is retried after a crash', async () => {
    const { kv, data } = memory();
    const log = createStepLog(kv);
    for (let i = 0; i < 3; i++) await log.append('s', step(i));
    // A crash after the chunk was written but before the count was.
    data.set('s#count', 2);
    await log.append('s', step(2));
    assert.deepEqual(
      (await log.get('s')).map((x) => x.index),
      [0, 1, 2],
    );
  });

  it('reads an empty session as no steps, and clears everything it saved', async () => {
    const { kv, data } = memory();
    const log = createStepLog(kv);
    assert.deepEqual(await log.get('none'), []);
    for (let i = 0; i < STEP_CHUNK + 3; i++) await log.append('s', step(i));
    await log.clear('s');
    assert.deepEqual(await log.get('s'), []);
    assert.deepEqual([...data.keys()], []);
  });

  it('replaces a whole list and drops chunks that are no longer needed', async () => {
    const { kv } = memory();
    const log = createStepLog(kv);
    for (let i = 0; i < STEP_CHUNK * 2; i++) await log.append('s', step(i));
    await log.set('s', [step(0), step(1)]);
    assert.equal((await log.get('s')).length, 2);
  });
});
