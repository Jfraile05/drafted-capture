// ════════════════════════════════════════════════════════════════════════
//  The live session's steps, saved in chunks.
//
//  One list per session meant every new step rewrote all the steps before it.
//  That is fine for twenty minutes and a problem for three hours: at one step
//  a second, the list grows past seven megabytes and every write sends all of
//  it. Here a step only touches the chunk it belongs to, so each write stays
//  the same size however long the session runs.
//
//  The store is passed in so the logic can be tested without IndexedDB.
// ════════════════════════════════════════════════════════════════════════

import type { Step } from '../types';

/** Steps per chunk. About 350 KB, so a write is small and the work is bounded. */
export const STEP_CHUNK = 500;

export interface StepKV {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

const chunkKey = (id: string, index: number) => `${id}#${index}`;
const countKey = (id: string) => `${id}#count`;

export function createStepLog(kv: StepKV) {
  async function write(id: string, steps: Step[]): Promise<void> {
    const chunks = Math.ceil(steps.length / STEP_CHUNK);
    const old = (await kv.get<number>(countKey(id))) ?? 0;
    for (let i = 0; i < chunks; i++)
      await kv.set(chunkKey(id, i), steps.slice(i * STEP_CHUNK, (i + 1) * STEP_CHUNK));
    for (let i = chunks; i < Math.ceil(old / STEP_CHUNK); i++) await kv.del(chunkKey(id, i));
    await kv.set(countKey(id), steps.length);
  }

  /** How many steps there are. A session started before chunking kept one list
   *  under its own id: move it over the first time it is touched. */
  async function count(id: string): Promise<number> {
    const n = await kv.get<number>(countKey(id));
    if (n !== undefined) return n;
    const legacy = await kv.get<Step[]>(id);
    if (!Array.isArray(legacy)) return 0;
    await write(id, legacy);
    await kv.del(id);
    return legacy.length;
  }

  async function get(id: string): Promise<Step[]> {
    const n = await count(id);
    const steps: Step[] = [];
    for (let i = 0; i * STEP_CHUNK < n; i++)
      steps.push(...((await kv.get<Step[]>(chunkKey(id, i))) ?? []));
    return steps.slice(0, n);
  }

  /** Adds a step and returns how many there are now. Callers take turns, as before.
   *  The position is written from the count, so retrying after a crash between the
   *  two writes cannot leave a step twice. */
  async function append(id: string, step: Step): Promise<number> {
    const n = await count(id);
    const index = Math.floor(n / STEP_CHUNK);
    const chunk = ((await kv.get<Step[]>(chunkKey(id, index))) ?? []).slice(
      0,
      n - index * STEP_CHUNK,
    );
    // Stamp the previous step's duration now that we know when the next arrived.
    if (n > 0) {
      const prevIndex = Math.floor((n - 1) / STEP_CHUNK);
      if (prevIndex === index) {
        const prev = chunk[chunk.length - 1];
        if (prev) prev.duration_to_next = step.timestamp - prev.timestamp;
      } else {
        const prevChunk = (await kv.get<Step[]>(chunkKey(id, prevIndex))) ?? [];
        const prev = prevChunk[prevChunk.length - 1];
        if (prev) {
          prev.duration_to_next = step.timestamp - prev.timestamp;
          await kv.set(chunkKey(id, prevIndex), prevChunk);
        }
      }
    }
    chunk.push(step);
    await kv.set(chunkKey(id, index), chunk);
    await kv.set(countKey(id), n + 1);
    return n + 1;
  }

  async function clear(id: string): Promise<void> {
    const n = (await kv.get<number>(countKey(id))) ?? 0;
    for (let i = 0; i * STEP_CHUNK < n; i++) await kv.del(chunkKey(id, i));
    await kv.del(countKey(id));
    await kv.del(id);
  }

  return { get, append, clear, set: write };
}
