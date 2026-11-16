import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { ARCHIVED_SESSION_CHANGE } from '../src/shared/storage/sessionUpdates';
import { enrichArchivedSession, submitArchivedSession } from '../src/shared/submitManager';
import type { Session } from '../src/shared/types';
import { session as sessionStorage } from './stubs/chrome';
import { __reset, __sessions, getSession, putSession, updateSession } from './stubs/db';
import { submission } from './stubs/submission';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const receipt = {
  drafted_task_id: 'server-receipt',
  submitted_at: '2026-11-10T10:00:00.000Z',
  quality_score: 80,
  last_enriched_at: null,
};

const archived = () =>
  ({
    id: 'capture-one',
    metadata: { owner_uid: 'student', drafted_project_id: 'project-one' },
    sync: { revision: 1, synced_revision: 0, attempts: 0, retry_at: 0 },
    started_at: 1000,
    steps: [{ index: 0, annotation: null }],
    segments: [],
  }) as unknown as Session;

beforeEach((t) => {
  __reset();
  for (const key of Object.keys(sessionStorage.data)) delete sessionStorage.data[key];
  submission.user = { uid: 'student' };
  submission.upload = async () => ({
    taskId: 'server-receipt',
    qualityScore: 80,
    badgeEarned: false,
    badgeLevel: null,
  });
  submission.enrich = async () => {};
  const locks = new Map<string, Promise<unknown>>();
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      locks: {
        request: (name: string, callback: () => Promise<unknown>) => {
          const pending = (locks.get(name) ?? Promise.resolve()).then(callback);
          locks.set(
            name,
            pending.catch(() => {}),
          );
          return pending;
        },
      },
    },
  });
  t.mock.method(console, 'error', () => {});
});

describe('submission receipts', () => {
  it('preserves labels and tasks saved while an upload is pending', async () => {
    await putSession(archived());
    const started = deferred();
    const finish = deferred();
    submission.upload = async () => {
      started.resolve();
      await finish.promise;
      return { taskId: 'server-receipt', qualityScore: 80, badgeEarned: false, badgeLevel: null };
    };
    const uploading = submitArchivedSession('capture-one');
    await started.promise;
    await updateSession('capture-one', (current) => {
      current.steps[0].annotation = {
        rating: 'correct',
        tags: [],
        notes: 'New label',
        annotator: 'user',
      };
      current.intent = 'Updated task';
      return current;
    });
    finish.resolve();
    assert.equal((await uploading).ok, true);
    const saved = await getSession('capture-one');
    assert.equal(saved?.steps[0].annotation?.notes, 'New label');
    assert.equal(saved?.intent, 'Updated task');
    assert.equal(saved?.submission?.drafted_task_id, 'server-receipt');
    assert.equal(
      (sessionStorage.data[ARCHIVED_SESSION_CHANGE] as { id: string }).id,
      'capture-one',
    );
  });

  it('serializes simultaneous submissions and reuses the first receipt', async () => {
    await putSession(archived());
    let uploads = 0;
    submission.upload = async () => {
      uploads++;
      await Promise.resolve();
      return { taskId: 'one-record', qualityScore: 80, badgeEarned: false, badgeLevel: null };
    };
    const results = await Promise.all([
      submitArchivedSession('capture-one'),
      submitArchivedSession('capture-one'),
    ]);
    assert.equal(uploads, 1);
    assert.deepEqual(
      results.map((result) => result.draftedTaskId),
      ['one-record', 'one-record'],
    );
    assert.equal(results[1].reason, 'already_submitted');
  });

  it('does not persist a success receipt when the server rejects the upload', async () => {
    await putSession(archived());
    submission.upload = async () => {
      throw new Error('Upload failed');
    };
    assert.equal((await submitArchivedSession('capture-one')).ok, false);
    assert.equal((await getSession('capture-one'))?.submission, undefined);
  });

  it('rejects a success response without a record ID', async () => {
    await putSession(archived());
    submission.upload = async () => ({
      taskId: '',
      qualityScore: 80,
      badgeEarned: false,
      badgeLevel: null,
    });
    assert.equal((await submitArchivedSession('capture-one')).ok, false);
    assert.equal((await getSession('capture-one'))?.submission, undefined);
  });

  it('keeps a successful receipt when refreshing other views fails', async (t) => {
    await putSession(archived());
    t.mock.method(chrome.storage.session, 'set', async () => {
      throw new Error('View closed');
    });
    assert.equal((await submitArchivedSession('capture-one')).ok, true);
    assert.equal((await getSession('capture-one'))?.submission?.drafted_task_id, 'server-receipt');
  });

  it('does not resurrect a session deleted during upload', async () => {
    await putSession(archived());
    submission.upload = async () => {
      __sessions.delete('capture-one');
      return { taskId: 'server-receipt', qualityScore: 80, badgeEarned: false, badgeLevel: null };
    };
    assert.equal((await submitArchivedSession('capture-one')).ok, false);
    assert.equal(await getSession('capture-one'), undefined);
  });

  it('preserves edits made while labels are being sent', async () => {
    await putSession({ ...archived(), submission: receipt });
    submission.enrich = async () => {
      await updateSession('capture-one', (current) => ({ ...current, intent: 'A newer edit' }));
    };
    assert.equal(
      (await enrichArchivedSession('capture-one', { 0: { thought: 'Sent label' } })).ok,
      true,
    );
    const saved = await getSession('capture-one');
    assert.equal(saved?.intent, 'A newer edit');
    assert.equal(saved?.submission?.submitted_at, receipt.submitted_at);
    assert.ok(saved?.submission?.last_enriched_at);
  });

  it('submits an unsubmitted labeled session without requesting a nested lock', async () => {
    await putSession(archived());
    assert.equal(
      (await enrichArchivedSession('capture-one', { 0: { thought: 'Label' } })).ok,
      true,
    );
  });

  it('does not upload while signed out', async () => {
    await putSession(archived());
    submission.user = null;
    submission.upload = async () => {
      throw new Error('Unexpected upload');
    };
    assert.deepEqual(await submitArchivedSession('capture-one'), {
      ok: false,
      reason: 'not_signed_in',
    });
  });
});
