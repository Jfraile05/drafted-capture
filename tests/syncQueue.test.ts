import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import './stubs/chrome';
import { syncQueuedSessions } from '../src/shared/syncQueue';
import { markSessionDirty, pendingSync } from '../src/shared/syncState';
import { LOCAL_WORKFLOW, WORKFLOWS, workflowSnapshot } from '../src/shared/workflows';
import type { Session } from '../src/shared/types';
import { __reset, getSession, putSession, updateSession } from './stubs/db';
import { submission } from './stubs/submission';

const destination = { projectId: 'project-b', orgId: 'org-b' };
const archived = (id = 'session-one', project: string | null = 'project-a') => ({
  id,
  metadata: { owner_uid: 'student', drafted_project_id: project, drafted_org_id: 'org-a' },
  steps: [{ index: 0, annotation: null }],
  segments: [],
  sync: { revision: 1, synced_revision: 0, attempts: 0, retry_at: 0 },
}) as unknown as Session;

beforeEach((t) => {
  __reset();
  submission.user = { uid: 'student' };
  submission.upload = async (session) => ({ taskId: session.id, qualityScore: 80, badgeEarned: false, badgeLevel: null });
  submission.enrich = async () => {};
  submission.owner = async () => null;
  const locks = new Map<string, Promise<unknown>>();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    locks: { request: (name: string, fn: () => Promise<unknown>) => {
      const promise = (locks.get(name) ?? Promise.resolve()).then(fn);
      locks.set(name, promise.catch(() => {}));
      return promise;
    } },
  } });
  t.mock.method(console, 'error', () => {});
});

describe('durable background uploads', () => {
  it('uploads a Generalist session on Stop without a project', async () => {
    const session = archived('generalist-upload', null);
    session.metadata.workflow = workflowSnapshot(LOCAL_WORKFLOW);
    await putSession(session);
    await syncQueuedSessions({ projectId: '', orgId: '' });
    const saved = await getSession(session.id);
    assert.equal(saved?.submission?.drafted_task_id, 'generalist-upload');
    assert.equal(pendingSync(saved!), false);
  });

  it('keeps a device-only Generalist session local even if a project destination is later supplied', async () => {
    const session = archived('generalist-session', 'real-project');
    session.metadata.workflow = workflowSnapshot({ ...LOCAL_WORKFLOW, local_only: true });
    await putSession(session);
    let uploads = 0;
    submission.upload = async () => { uploads++; throw new Error('Unexpected upload'); };
    await syncQueuedSessions(destination);
    const saved = await getSession(session.id);
    assert.ok(saved);
    assert.equal(uploads, 0);
    assert.equal(saved.submission, undefined);
    assert.equal(pendingSync(saved), false);
    assert.equal(markSessionDirty(saved).sync?.revision, saved.sync?.revision);
  });
  it('never routes a workflow session to a manually entered fallback project', async () => {
    const session = archived('missing-workflow-destination', null);
    session.metadata.workflow = { ...WORKFLOWS[0] };
    await putSession(session);
    await syncQueuedSessions(destination);
    const pending = await getSession(session.id);
    assert.equal(pending?.metadata.drafted_project_id, null);
    assert.equal(pending?.submission, undefined);
  });
  it('uploads all queued sessions to the project pinned when recorded', async () => {
    await putSession(archived());
    await putSession(archived('session-two'));
    const sent: Session[] = [];
    submission.upload = async (session) => {
      sent.push(session);
      return { taskId: session.id, qualityScore: 80, badgeEarned: false, badgeLevel: null };
    };
    await syncQueuedSessions(destination);
    assert.equal(sent.length, 2);
    assert.ok(sent.every((session) => session.metadata.drafted_project_id === 'project-a'));
    assert.equal(pendingSync((await getSession('session-one'))!), false);
    assert.equal(pendingSync((await getSession('session-two'))!), false);
  });

  it('retains failed uploads across queue restarts and retries when due', async (t) => {
    let now = 1_000;
    t.mock.method(Date, 'now', () => now);
    await putSession(archived());
    let calls = 0;
    submission.upload = async (session) => {
      if (++calls === 1) throw new Error('Offline');
      return { taskId: session.id, qualityScore: 80, badgeEarned: false, badgeLevel: null };
    };
    await syncQueuedSessions(destination);
    const queued = (await getSession('session-one'))!;
    assert.equal(queued.sync?.attempts, 1);
    assert.equal(queued.submission, undefined);
    await syncQueuedSessions(destination);
    assert.equal(calls, 1);
    now = queued.sync!.retry_at;
    await syncQueuedSessions(destination);
    assert.equal(calls, 2);
    assert.equal(pendingSync((await getSession('session-one'))!), false);
  });

  it('leaves unassigned sessions local until a project is selected', async () => {
    await putSession(archived('session-one', null));
    await syncQueuedSessions({ projectId: '', orgId: '' });
    assert.equal((await getSession('session-one'))?.submission, undefined);
    await syncQueuedSessions(destination);
    assert.equal((await getSession('session-one'))?.metadata.drafted_project_id, 'project-b');
    assert.equal(pendingSync((await getSession('session-one'))!), false);
  });

  it('does not upload another account or legacy records with no known owner', async () => {
    await putSession(archived());
    const legacy = archived('legacy');
    delete legacy.metadata.owner_uid;
    await putSession(legacy);
    submission.user = { uid: 'other-student' };
    let calls = 0;
    submission.upload = async () => { calls++; throw new Error('Unexpected upload'); };
    await syncQueuedSessions(destination);
    submission.user = null;
    await syncQueuedSessions(destination);
    assert.equal(calls, 0);
  });

  it('deduplicates overlapping queue wakeups', async () => {
    await putSession(archived());
    let calls = 0;
    submission.upload = async (session) => {
      calls++;
      return { taskId: session.id, qualityScore: 80, badgeEarned: false, badgeLevel: null };
    };
    await Promise.all([syncQueuedSessions(destination), syncQueuedSessions(destination)]);
    assert.equal(calls, 1);
  });

  it('does not mark edits made during an upload as synced', async () => {
    await putSession(archived());
    submission.upload = async (session) => {
      await updateSession(session.id, (current) => markSessionDirty({ ...current, intent: 'New name' }));
      return { taskId: session.id, qualityScore: 80, badgeEarned: false, badgeLevel: null };
    };
    await syncQueuedSessions(destination);
    assert.equal(pendingSync((await getSession('session-one'))!), true);
    let enriched = false;
    submission.enrich = async (session) => { enriched = true; assert.equal(session.intent, 'New name'); };
    await syncQueuedSessions(destination);
    assert.equal(enriched, true);
    assert.equal(pendingSync((await getSession('session-one'))!), false);
  });

  it('continues uploading other sessions after one fails', async () => {
    await putSession(archived());
    await putSession(archived('session-two'));
    submission.upload = async (session) => {
      if (session.id === 'session-two') throw new Error('Storage unavailable');
      return { taskId: session.id, qualityScore: 80, badgeEarned: false, badgeLevel: null };
    };
    await syncQueuedSessions(destination);
    assert.equal(pendingSync((await getSession('session-one'))!), false);
    assert.equal(pendingSync((await getSession('session-two'))!), true);
  });

  it('syncs edits to older submitted sessions only after verifying the original owner', async () => {
    const older = archived('older-session', null);
    delete older.metadata.owner_uid;
    delete older.sync;
    older.submission = { drafted_task_id: 'older-receipt', quality_score: 80, submitted_at: '2026-11-11', last_enriched_at: null };
    await putSession(markSessionDirty(older));
    let edits = 0;
    submission.enrich = async () => { edits++; };
    await syncQueuedSessions(destination);
    assert.equal(edits, 0);
    assert.equal(pendingSync((await getSession(older.id))!), true);
    submission.owner = async () => 'student';
    await syncQueuedSessions(destination);
    assert.equal(edits, 1);
    assert.equal(pendingSync((await getSession(older.id))!), false);
    assert.equal((await getSession(older.id))?.metadata.drafted_project_id, null);
  });

  it('does not claim another user’s older receipt', async () => {
    const older = archived('older-session');
    delete older.metadata.owner_uid;
    older.submission = { drafted_task_id: 'older-receipt', quality_score: 80, submitted_at: '2026-11-11', last_enriched_at: null };
    await putSession(older);
    submission.owner = async () => 'another-owner';
    submission.enrich = async () => { throw new Error('Must not send another owner’s edits'); };
    await syncQueuedSessions(destination);
    assert.equal((await getSession(older.id))?.metadata.owner_uid, 'another-owner');
    assert.equal(pendingSync((await getSession(older.id))!), true);
  });
});
