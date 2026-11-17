import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { local } from './stubs/chrome';
import { qualityReviews } from '../src/background/quality';
import { parseQualityReview, summarizeQuality } from '../src/shared/quality';
import type { Session } from '../src/shared/types';
import { WORKFLOWS } from '../src/shared/workflows';

function archived(activeMs: number, taskId: string | null, owner = 'student'): Session {
  return {
    id: crypto.randomUUID(),
    started_at: 1000,
    ended_at: 1000 + activeMs,
    pauses: [],
    metadata: {
      owner_uid: owner,
      workflow: { ...WORKFLOWS[0], hourly_rate_cents: 100, local_only: true },
    },
    submission: taskId
      ? { drafted_task_id: taskId, submitted_at: '', quality_score: null, last_enriched_at: null }
      : null,
  } as Session;
}

const review = (score: number) => ({
  quality_score: score,
  overview: 'Steady work.',
  went_well: ['Compared prices'],
  hurt_quality: [],
  step_notes: [{ step: 2, effect: 'up', note: 'Used a filter' }],
});

beforeEach(() => {
  for (const key of Object.keys(local.data)) delete local.data[key];
});

describe('quality reviews', () => {
  it('reads the agent review and ignores failed or malformed ones', () => {
    assert.deepEqual(parseQualityReview(review(81)), review(81));
    assert.equal(parseQualityReview({ error: 'Bedrock down', reviewed_at: 'x' }), null);
    assert.equal(parseQualityReview(null), null);
    // Reviews written before student feedback existed still show the score.
    assert.deepEqual(parseQualityReview({ quality_score: 55, reasoning: 'admin notes' }), {
      quality_score: 55,
      overview: '',
      went_well: [],
      hurt_quality: [],
      step_notes: [],
    });
    const messy = parseQualityReview({
      ...review(70),
      step_notes: [{ step: 'x', effect: 'up', note: 'n' }, { step: 1, effect: 'sideways', note: 'n' }],
    });
    assert.deepEqual(messy?.step_notes, []);
  });

  it('averages quality by recorded time and counts sessions still waiting', () => {
    const sessions = [
      archived(3 * 3_600_000, 'a'),
      archived(1 * 3_600_000, 'b'),
      archived(3_600_000, 'c'),
      archived(3_600_000, null),
      archived(3_600_000, 'd', 'someone-else'),
    ];
    const reviews = { a: review(90), b: review(50), d: review(10) };
    assert.deepEqual(summarizeQuality(sessions, reviews, 'student', true), {
      average: 80,
      reviewed: 2,
      waiting: 1,
    });
    assert.deepEqual(summarizeQuality([], {}, 'student', true), {
      average: null,
      reviewed: 0,
      waiting: 0,
    });
  });

  it('fetches only reviews it has not saved yet and keeps them for offline use', async (t) => {
    const asked: string[][] = [];
    t.mock.method(chrome.runtime, 'sendMessage', async (message: any) => {
      if (message.type !== 'QUALITY_REVIEWS') return { ok: true };
      asked.push(message.taskIds);
      return { a: review(90), b: null };
    });
    assert.deepEqual(await qualityReviews(['a', 'b']), { a: review(90) });
    assert.deepEqual(await qualityReviews(['a', 'b']), { a: review(90) });
    assert.deepEqual(asked, [['a', 'b'], ['b']]);
    t.mock.method(chrome.runtime, 'sendMessage', async () => {
      throw new Error('offline');
    });
    assert.deepEqual(await qualityReviews(['a', 'b']), { a: review(90) });
  });
});
