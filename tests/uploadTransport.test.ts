import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import './stubs/chrome';
import { enrichSubmittedSession, submitSessionToDrafted } from '../src/shared/submitToDrafted';
import { earningsForSession, summarizeEarnings } from '../src/shared/earnings';
import type { Session } from '../src/shared/types';
import { LOCAL_WORKFLOW, WORKFLOWS, workflowSnapshot } from '../src/shared/workflows';
import { auth, backend } from './stubs/backend';
import { __reset, putScreenshot } from './stubs/db';

const session = (): Session => ({
  id: 'session-stable-id', source: 'human', started_at: 1000, ended_at: 5000,
  environment: { os: 'Mac', browser: 'Chrome', display_width: 800, display_height: 600, device_pixel_ratio: 1, user_agent: 'Chrome', browser_version: '1', locale: 'en', timezone: 'UTC' },
  steps: [{ index: 0, timestamp: 2000, action: { type: 'click', coordinate: [20, 30] }, screenshot: { hash: 'frame', width: 800, height: 600, dpr: 1 }, dom: null, annotation: null }],
  segments: [],
  outcome: { total_steps: 1, total_duration_ms: 4000, tabs_touched: 1, domains_touched: [] },
  metadata: { extension_version: '1.0.4', owner_uid: 'student', drafted_project_id: 'project-one', drafted_org_id: 'org-one', created_at: '2026-11-11' },
});

beforeEach(async (t) => {
  __reset();
  backend.records.clear();
  backend.uploads.length = 0;
  backend.failCommit = false;
  backend.failUpload = false;
  auth.currentUser.uid = 'student';
  backend.records.set('drafted-accounts/student@example.invalid', {});
  await putScreenshot('frame', new Blob(['image bytes'], { type: 'image/png' }));
  t.mock.method(console, 'error', () => {});
});

describe('automatic upload transport', () => {
  it('preserves automatic site tags through upload and task range edits', async () => {
    const captured = session();
    captured.steps[0].origin = { tab_id: 7, frame_id: 0, title: 'Flights', url: 'https://delta.com/' };
    captured.steps.push({
      ...captured.steps[0], index: 1, timestamp: 3000,
      origin: { tab_id: 8, frame_id: 0, title: 'Shopping', url: 'https://amazon.es/' },
    });
    captured.segments = [{ id: 'task', start_index: 0, end_index: 1, label: 'Compare', category: 'research', notes: '', created_at: '2026-11-13' }];
    const result = await submitSessionToDrafted(captured);
    const saved = backend.records.get(`credential_tasks/${result.taskId}`);
    assert.deepEqual(saved.trajectory.steps[0].origin.site, { domain: 'delta.com', category: 'flight_booking' });
    assert.deepEqual(saved.trajectory.steps[1].origin.site, { domain: 'amazon.es', category: 'shopping' });
    assert.deepEqual(saved.trajectory.steps[0].segments[0].sites, [
      { domain: 'delta.com', category: 'flight_booking' },
      { domain: 'amazon.es', category: 'shopping' },
    ]);
    captured.segments[0].end_index = 0;
    await enrichSubmittedSession(captured, result.taskId, {});
    const updated = backend.records.get(`credential_tasks/${result.taskId}`);
    assert.deepEqual(updated.trajectory.steps[0].segments[0].sites,
      [{ domain: 'delta.com', category: 'flight_booking' }]);
    assert.equal(updated.trajectory.steps[0].segments[0].category, 'research');
    assert.deepEqual(updated.trajectory.steps[0].origin, saved.trajectory.steps[0].origin);
    assert.equal(updated.trajectory.steps[0].screenshot, 'annotated-screenshots/student/session-stable-id/0.jpg');
  });

  it('rejects a device-only Generalist session before uploading files or creating a receipt', async () => {
    const captured = session();
    captured.metadata.workflow = workflowSnapshot({ ...LOCAL_WORKFLOW, local_only: true });
    await assert.rejects(submitSessionToDrafted(captured), /only on this device/);
    assert.equal(backend.uploads.length, 0);
    assert.equal(backend.records.has('credential_tasks/session-stable-id'), false);
  });
  it('stores the full mapped session and pinned project, then returns a server receipt', async () => {
    const captured = session();
    captured.metadata.workflow = { ...WORKFLOWS[0] };
    const result = await submitSessionToDrafted(captured);
    const saved = backend.records.get(`credential_tasks/${result.taskId}`);
    assert.equal(result.taskId, 'session-stable-id');
    assert.equal(saved.drafted_project_id, 'project-one');
    assert.equal(saved.drafted_org_id, 'org-one');
    assert.equal(saved.trajectory.steps.length, 1);
    assert.equal(saved.trajectory.steps[0].screenshot, 'annotated-screenshots/student/session-stable-id/0.jpg');
    assert.deepEqual(saved.trajectory.steps[0].action.coordinate, [20, 30]);
    assert.equal(saved.behavioral_metadata.total_time_ms, 4000);
    assert.deepEqual(saved.capture_metadata.workflow, captured.metadata.workflow);
    assert.deepEqual(saved.capture_earnings_estimate, earningsForSession(captured));
  });

  it('writes the same paused-time and earnings estimate the dashboard sums', async () => {
    const captured = session();
    captured.metadata.workflow = { ...WORKFLOWS[0], hourly_rate_cents: 250 };
    captured.pauses = [[2000, 3000]];
    const result = await submitSessionToDrafted(captured);
    const saved = backend.records.get(`credential_tasks/${result.taskId}`);
    const total = summarizeEarnings([captured], 'student', false);
    assert.equal(saved.capture_earnings_estimate.active_ms, total.active_ms);
    assert.equal(saved.capture_earnings_estimate.base_earnings_micro_usd, total.base_earnings_micro_usd);
    assert.equal(saved.behavioral_metadata.total_time_ms, total.active_ms);
    assert.equal(total.active_ms, 3000);
  });

  it('reuses a remote receipt after a lost local acknowledgement without duplicate credit', async () => {
    const first = await submitSessionToDrafted(session());
    const second = await submitSessionToDrafted(session());
    assert.equal(first.taskId, second.taskId);
    assert.equal([...backend.records.keys()].filter((key) => key.startsWith('credential_tasks/')).length, 1);
    assert.equal(backend.records.get('drafted-accounts/student@example.invalid').tasksCompleted.computer_use_trajectory, 1);
    assert.equal(backend.uploads.length, 1);
  });

  it('fails the entire upload when a captured screenshot fails or is missing', async () => {
    backend.failUpload = true;
    await assert.rejects(submitSessionToDrafted(session()), /Storage offline/);
    assert.equal(backend.records.has('credential_tasks/session-stable-id'), false);
    __reset();
    await assert.rejects(submitSessionToDrafted(session()), /screenshot is missing/);
  });

  it('retries a failed transaction without leaving a receipt or duplicate account credit', async () => {
    backend.failCommit = true;
    await assert.rejects(submitSessionToDrafted(session()), /Transaction unavailable/);
    assert.equal(backend.records.has('credential_tasks/session-stable-id'), false);
    assert.equal(backend.records.get('drafted-accounts/student@example.invalid').tasksCompleted, undefined);
    backend.failCommit = false;
    await submitSessionToDrafted(session());
    assert.equal(backend.records.get('drafted-accounts/student@example.invalid').tasksCompleted.computer_use_trajectory, 1);
  });

  it('rejects a remote receipt for a different owner or project', async () => {
    await submitSessionToDrafted(session());
    const changed = session();
    changed.metadata.drafted_project_id = 'other-project';
    await assert.rejects(submitSessionToDrafted(changed), /does not match/);
    const record = backend.records.get('credential_tasks/session-stable-id');
    record.annotator.annotator_id = 'other-owner';
    await assert.rejects(submitSessionToDrafted(session()), /does not match/);
  });

  it('sends newer labels after recovering an older remote receipt', async () => {
    await submitSessionToDrafted(session());
    const changed = session();
    changed.intent = 'Updated workflow';
    changed.sync = { revision: 2, synced_revision: 0, attempts: 1, retry_at: 0 };
    await submitSessionToDrafted(changed);
    const saved = backend.records.get('credential_tasks/session-stable-id');
    assert.equal(saved.instruction.text, 'Updated workflow');
    assert.equal(backend.records.get('drafted-accounts/student@example.invalid').tasksCompleted.computer_use_trajectory, 1);
  });

  it('does not upload any data under a different signed-in account', async () => {
    auth.currentUser.uid = 'other-student';
    await assert.rejects(submitSessionToDrafted(session()), /Account changed/);
    assert.equal(backend.uploads.length, 0);
  });
});
