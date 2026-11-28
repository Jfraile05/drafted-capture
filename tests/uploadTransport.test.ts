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
  backend.files.clear();
  backend.denyOverwrite = false;
  backend.failAfter = Number.POSITIVE_INFINITY;
  backend.attempts = 0;
  backend.inFlight = 0;
  backend.maxInFlight = 0;
  backend.failCommit = false;
  backend.failUpload = false;
  backend.denyUpdate = false;
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

  it('uploads a session of two thousand screenshots a few at a time, with only paths on the record', async () => {
    const captured = session();
    captured.steps = Array.from({ length: 2000 }, (_, i) => ({
      ...captured.steps[0],
      index: i,
      timestamp: 2000 + i * 1000,
    }));
    const result = await submitSessionToDrafted(captured);
    const saved = backend.records.get(`credential_tasks/${result.taskId}`);
    // This many steps is more than a record holds comfortably, so they went to a file.
    assert.equal(saved.trajectory.total_steps, 2000);
    assert.equal(backend.uploads.filter((p) => p.startsWith('annotated-screenshots/')).length, 2000);
    assert.ok(backend.maxInFlight <= 6, `${backend.maxInFlight} uploads ran at once`);
    assert.ok(backend.maxInFlight > 1, 'uploads ran in parallel');
    const text = JSON.stringify(saved);
    assert.doesNotMatch(text, /data:image/);
    assert.doesNotMatch(text, /screenshot_blob/);
    const all = JSON.parse(await backend.files.get(saved.trajectory.steps_storage_path)!.text());
    assert.equal(all.length, 2000);
    assert.equal(all[1999].screenshot, 'annotated-screenshots/student/session-stable-id/1999.jpg');
    assert.equal(all[1999].screenshot_storage_path, all[1999].screenshot);
  });

  const longSession = (count: number) => {
    const captured = session();
    captured.metadata.workflow = { ...WORKFLOWS[0] };
    captured.ended_at = 2000 + count * 1000;
    captured.steps = Array.from({ length: count }, (_, i) => ({
      ...captured.steps[0],
      index: i,
      timestamp: 2000 + i * 1000,
      origin: { tab_id: 1, frame_id: 0, title: 'Chart', url: i % 4 ? 'https://www.tradingview.com/chart/' : 'https://mail.example.com/' },
    }));
    return captured;
  };

  it('uploads a multi-hour session: the record stays small and every step is in the file', async () => {
    const captured = longSession(12000); // about 3.5 hours at one step a second
    const result = await submitSessionToDrafted(captured);
    const saved = backend.records.get(`credential_tasks/${result.taskId}`);
    assert.ok(JSON.stringify(saved).length < 500_000, `record is ${JSON.stringify(saved).length} bytes`);
    assert.equal(saved.trajectory.total_steps, 12000);
    assert.equal(saved.trajectory.steps_truncated, true);
    assert.equal(saved.trajectory.steps_stored_count, 12000);
    assert.equal(saved.trajectory.steps.length, 200);
    assert.equal(saved.trajectory.steps_storage_path, 'sidekick-steps/student/session-stable-id.json');
    const all = JSON.parse(await backend.files.get(saved.trajectory.steps_storage_path)!.text());
    assert.equal(all.length, 12000);
    assert.deepEqual(all.slice(0, 200), saved.trajectory.steps);
    assert.equal(all[11999].step_index, 11999);
    // Time per site is on the record, so the dashboard need not read the file.
    const total = Object.values(saved.trajectory.domain_ms as Record<string, number>).reduce((a, b) => a + b, 0);
    assert.ok(saved.trajectory.domain_ms['tradingview.com'] > 0);
    assert.ok(saved.trajectory.domain_ms['mail.example.com'] > 0);
    assert.equal(total, 11999 * 1000);
  });

  it('keeps a session of about a thousand steps on the record, which needs nothing new on the server', async () => {
    const captured = longSession(1040); // Raul's session
    const result = await submitSessionToDrafted(captured);
    const saved = backend.records.get(`credential_tasks/${result.taskId}`);
    assert.equal(saved.trajectory.steps.length, 1040);
    assert.equal(saved.trajectory.steps_storage_path, undefined);
    assert.ok(JSON.stringify(saved).length < 1_000_000);
    assert.equal(backend.uploads.some((p) => p.startsWith('sidekick-steps/')), false);
  });

  it('keeps a short session inside the record, as before', async () => {
    const result = await submitSessionToDrafted(session());
    const saved = backend.records.get(`credential_tasks/${result.taskId}`);
    assert.equal(saved.trajectory.steps.length, 1);
    assert.equal(saved.trajectory.steps_storage_path, undefined);
    assert.equal(backend.uploads.some((p) => p.startsWith('sidekick-steps/')), false);
  });

  it('resumes after an upload dropped part way, sending only what is missing', async () => {
    const captured = longSession(300);
    backend.failAfter = 120;
    await assert.rejects(submitSessionToDrafted(captured), /Storage offline/);
    const stored = backend.uploads.length;
    assert.ok(stored >= 100 && stored < 300, `${stored} stored before the drop`);
    // Screenshots cannot be overwritten, so the retry must skip the stored ones.
    backend.failAfter = Number.POSITIVE_INFINITY;
    backend.denyOverwrite = true;
    captured.sync = { revision: 1, synced_revision: 0, attempts: 1, retry_at: 0 };
    const result = await submitSessionToDrafted(captured);
    const screenshots = backend.uploads.filter((p) => p.startsWith('annotated-screenshots/'));
    assert.equal(screenshots.length, 300, 'each screenshot uploaded exactly once');
    assert.equal(new Set(screenshots).size, 300);
    assert.equal(backend.records.get(`credential_tasks/${result.taskId}`).trajectory.total_steps, 300);
  });

  it('recovers when a crash left screenshots stored and the retry flag was never set', async () => {
    const captured = longSession(50);
    backend.failAfter = 20;
    await assert.rejects(submitSessionToDrafted(captured), /Storage offline/);
    backend.failAfter = Number.POSITIVE_INFINITY;
    backend.denyOverwrite = true; // attempts is still 0, so nothing is skipped up front
    const result = await submitSessionToDrafted(captured);
    assert.equal(backend.records.get(`credential_tasks/${result.taskId}`).trajectory.total_steps, 50);
    assert.equal(backend.uploads.filter((p) => p.startsWith('annotated-screenshots/')).length, 50);
  });

  it('does not hide a real failure behind the overwrite check', async () => {
    const captured = longSession(5);
    backend.failUpload = true;
    await assert.rejects(submitSessionToDrafted(captured), /Storage offline/);
  });

  it('edits to a multi-hour session update the file and the first steps on the record', async () => {
    const captured = longSession(1500);
    const result = await submitSessionToDrafted(captured);
    captured.segments = [{ id: 'task', start_index: 0, end_index: 1499, label: 'Trade review', category: 'research', notes: '', created_at: '2026-11-13' }];
    await enrichSubmittedSession(captured, result.taskId, { 1400: { thought: 'checked the chart' } });
    const record = backend.records.get(`credential_tasks/${result.taskId}`);
    const all = JSON.parse(await backend.files.get(record.trajectory.steps_storage_path)!.text());
    assert.equal(all.length, 1500);
    assert.equal(all[1400].thought, 'checked the chart');
    assert.equal(all[0].segments.length, 1);
    assert.equal(record.trajectory.steps.length, 200);
    assert.equal(record.trajectory.steps[0].segments.length, 1);
    assert.equal(record.instruction.text, 'Trade review');
  });

  it('uploads a long session whose screenshots are too large to send as one string', async () => {
    // Glaul's 20 minute TradingView session: about a thousand large screenshots.
    // Sent as base64 text in one record these pass the engine's string limit.
    await putScreenshot('big', new Blob([new Uint8Array(650 * 1024)], { type: 'image/png' }));
    const captured = session();
    captured.steps = Array.from({ length: 1040 }, (_, i) => ({
      ...captured.steps[0],
      index: i,
      timestamp: 2000 + i * 1000,
      screenshot: { hash: 'big', width: 1920, height: 1080, dpr: 1 },
    }));
    const result = await submitSessionToDrafted(captured);
    assert.equal(backend.records.get(`credential_tasks/${result.taskId}`).trajectory.steps.length, 1040);
    assert.equal(backend.uploads.length, 1040);
  });

  it('stops starting uploads after the first one fails, so a bad connection fails fast', async () => {
    const captured = session();
    captured.steps = Array.from({ length: 1000 }, (_, i) => ({
      ...captured.steps[0],
      index: i,
      timestamp: 2000 + i * 1000,
    }));
    backend.failUpload = true;
    await assert.rejects(submitSessionToDrafted(captured), /Storage offline/);
    assert.ok(backend.attempts <= 6, `${backend.attempts} uploads were started`);
    assert.equal(backend.records.has('credential_tasks/session-stable-id'), false);
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

  it('leaves the steps file alone when the rules refuse a label save', async () => {
    const captured = longSession(1500);
    const result = await submitSessionToDrafted(captured);
    const path = backend.records.get(`credential_tasks/${result.taskId}`).trajectory.steps_storage_path;
    const file = backend.files.get(path);
    const attempts = backend.attempts;
    backend.denyUpdate = true;
    await assert.rejects(
      enrichSubmittedSession(captured, result.taskId, { 1400: { thought: 'checked the chart' } }),
      /permission-denied/,
    );
    assert.equal(backend.attempts, attempts);
    assert.equal(backend.files.get(path), file);
    assert.equal(backend.records.get(`credential_tasks/${result.taskId}`).enriched_at, undefined);
  });

  it('keeps an upload receipt when the rules refuse the labels sent after it', async () => {
    await submitSessionToDrafted(session());
    const changed = session();
    changed.intent = 'Updated workflow';
    changed.sync = { revision: 2, synced_revision: 0, attempts: 1, retry_at: 0 };
    backend.denyUpdate = true;
    const result = await submitSessionToDrafted(changed);
    assert.equal(result.taskId, 'session-stable-id');
    assert.notEqual(backend.records.get('credential_tasks/session-stable-id').instruction.text, 'Updated workflow');
  });

  it('uploads a click recorded inside a frame without a position', async () => {
    const captured = session();
    captured.steps[0].action = { type: 'click', button: 'left' };
    const result = await submitSessionToDrafted(captured);
    const saved = backend.records.get(`credential_tasks/${result.taskId}`);
    assert.deepEqual(saved.trajectory.steps[0].action, { action_type: 'click' });
  });

  it('does not upload any data under a different signed-in account', async () => {
    auth.currentUser.uid = 'other-student';
    await assert.rejects(submitSessionToDrafted(session()), /Account changed/);
    assert.equal(backend.uploads.length, 0);
  });
});
