import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { local, session, workflowAccess } from './stubs/chrome';
import { pauseCapture, resumeCapture, startCapture, stopCapture } from '../src/background/session';
import { activeElapsed } from '../src/shared/activeTime';
import { getLiveSession } from '../src/shared/storage/live';
import { loadWorkflowAccess } from '../src/shared/workflowAccess';
import {
  LOCAL_WORKFLOW,
  WORKFLOWS,
  assignedWorkflows,
  selectWorkflow,
  selectedWorkflow,
  workflowRateLabel,
} from '../src/shared/workflows';
import { backend } from './stubs/backend';
import { __reset, __sessions } from './stubs/db';
import { submission } from './stubs/submission';
import { pendingSync } from '../src/shared/syncState';

const grant = (workflow_id: string, project_id = 'assigned-project') => ({
  workflow_id, project_id, org_id: 'assigned-org', active: true,
});

beforeEach(() => {
  for (const area of [local, session]) {
    for (const key of Object.keys(area.data)) delete area.data[key];
  }
  backend.records.clear();
  backend.failRead = false;
  submission.user = { uid: 'student' };
  __reset();
});

describe('assignment-only workflow catalog', () => {
  it('defines exactly the three requested workflows at $1/hour with no annotation bonus', () => {
    assert.deepEqual(WORKFLOWS.map((item) => item.name), [
      'Flight Booking', 'Online Shopping', 'Productivity',
    ]);
    assert.ok(WORKFLOWS.every((item) => item.hourly_rate_cents === 100 && !item.annotation_enabled));
    assert.equal(workflowRateLabel(100), '$1/hour');
    assert.equal(workflowRateLabel(125), '$1.25/hour');
  });

  it('shows only assigned, active workflows with real destinations', () => {
    const values = assignedWorkflows({ assignments: [
      grant('flight-booking'),
      { ...grant('online-shopping'), active: false },
      grant('productivity', ''),
      grant('unknown'),
    ] });
    assert.deepEqual(values.map((item) => item.id), ['flight-booking']);
    assert.equal(values[0].project_id, 'assigned-project');
    assert.equal(values[0].org_id, 'assigned-org');
  });

  it('fails closed for missing, malformed, or ambiguous assignment records', () => {
    for (const data of [null, {}, { assignments: true }, { assignments: [null] }, {
      assignments: [grant('productivity', 'a'), grant('productivity', 'b')],
    }]) assert.deepEqual(assignedWorkflows(data), []);
  });

  it('adding a workflow needs only a catalog entry and assignment', () => {
    const fourth = { ...WORKFLOWS[0], id: 'new-workflow', name: 'New workflow' };
    assert.deepEqual(
      assignedWorkflows({ assignments: [grant(fourth.id)] }, [...WORKFLOWS, fourth]).map((item) => item.id),
      ['new-workflow'],
    );
  });

  it('reads only the signed-in account assignment and never invents eligibility', async () => {
    backend.records.set('capture_workflow_assignments/someone-else', { assignments: [grant('productivity')] });
    assert.deepEqual((await loadWorkflowAccess(false)).workflows, []);
    backend.records.set('capture_workflow_assignments/student', { assignments: [grant('flight-booking')] });
    assert.deepEqual((await loadWorkflowAccess(false)).workflows.map((item) => item.id), ['flight-booking']);
    backend.records.delete('capture_workflow_assignments/student');
    assert.deepEqual((await loadWorkflowAccess(false)).workflows, []);
  });

  it('rejects unauthenticated and offline reads instead of using cached eligibility', async () => {
    submission.user = null;
    await assert.rejects(loadWorkflowAccess(false, 0), /Sign in/);
    submission.user = { uid: 'student' };
    backend.failRead = true;
    await assert.rejects(loadWorkflowAccess(false), /Server unavailable/);
  });

  it('discards an assignment response if the signed-in account changed during the read', async () => {
    backend.records.set('capture_workflow_assignments/student', { assignments: [grant('productivity')] });
    const pending = loadWorkflowAccess(false);
    queueMicrotask(() => { submission.user = { uid: 'other-student' }; });
    await assert.rejects(pending, /account changed/);
  });

  it('waits for a sign in that reaches the background a moment late', async () => {
    submission.user = null;
    setTimeout(() => { submission.user = { uid: 'student' }; }, 300);
    assert.equal((await loadWorkflowAccess(true, 2000)).uid, 'student');
  });

  it('lists assigned projects first, then Generalist', async () => {
    backend.records.set('capture_workflow_assignments/student', { assignments: [grant('flight-booking'), grant('productivity')] });
    assert.deepEqual((await loadWorkflowAccess(true)).workflows.map((item) => item.id), ['flight-booking', 'productivity', 'generalist']);
  });

  it('keeps remembered selection isolated between accounts', async () => {
    await selectWorkflow('student', 'productivity');
    assert.equal(await selectedWorkflow('student'), 'productivity');
    assert.equal(await selectedWorkflow('other-student'), null);
  });
});

describe('workflow start enforcement', () => {
  it('records, pauses, resumes and saves Generalist without a backend assignment', async (t) => {
    backend.failRead = true;
    const access = await loadWorkflowAccess();
    assert.deepEqual(access.workflows, [LOCAL_WORKFLOW]);
    t.mock.method(chrome.runtime, 'sendMessage', async (message: {type: string}) =>
      message.type === 'WORKFLOW_ACCESS' ? loadWorkflowAccess() : {ok: true},
    );
    let now = 1000;
    t.mock.method(Date, 'now', () => now);
    const live = await startCapture(undefined, 'generalist');
    now += 2345;
    await pauseCapture();
    now += 60000;
    await resumeCapture();
    assert.equal(activeElapsed((await getLiveSession())!, now), 2345);
    now += 1000;
    const id = await stopCapture();
    assert.equal(id, live.id);
    const saved = __sessions.get(id!);
    assert.ok(saved);
    assert.equal(saved.intent, 'Generalist');
    assert.equal(saved.metadata.drafted_project_id, null);
    // Generalist now uploads on Stop, so the archive is queued for Drafted.
    assert.equal(saved.metadata.workflow?.local_only, undefined);
    assert.equal(saved.outcome.total_duration_ms, 3345);
    assert.equal(pendingSync(saved), true);
    assert.equal(await getLiveSession(), null);
    assert.equal(backend.records.size, 0);
  });

  it('still requires sign-in for Generalist', async () => {
    submission.user = null;
    await assert.rejects(loadWorkflowAccess(undefined, 0), /Sign in/);
  });
  it('requires a selection even when invoked without the popup', async () => {
    await assert.rejects(startCapture(), /Choose a workflow/);
    assert.equal(await getLiveSession(), null);
  });

  it('rejects unknown, unavailable, and revoked selections before capturing', async (t) => {
    await assert.rejects(startCapture(undefined, 'unassigned'), /Choose a workflow/);
    await selectWorkflow('student', 'productivity');
    t.mock.method(chrome.runtime, 'sendMessage', async () => ({ uid: 'student', workflows: [] }));
    await assert.rejects(startCapture(), /Choose a workflow/);
    assert.equal(await getLiveSession(), null);
  });

  it('fails closed when the access service cannot answer', async (t) => {
    t.mock.method(chrome.runtime, 'sendMessage', async () => ({ error: 'Offline' }));
    await assert.rejects(startCapture(undefined, 'productivity'), /Could not check/);
    assert.equal(await getLiveSession(), null);
  });

  it('pins the assigned destination and rate, ignoring manually entered legacy IDs', async () => {
    local.data.settings = { drafted_project_id: 'wrong-project', drafted_org_id: 'wrong-org' };
    const live = await startCapture(undefined, 'flight-booking');
    assert.equal(live.intent, 'Flight Booking');
    assert.equal(live.metadata.workflow?.hourly_rate_cents, 100);
    assert.equal(live.metadata.drafted_project_id, 'test-flight-booking');
    assert.equal(live.metadata.drafted_org_id, 'test-org');
    local.data.settings = { drafted_project_id: 'another-project' };
    const id = await stopCapture();
    assert.ok(id);
    assert.deepEqual(__sessions.get(id)?.metadata, live.metadata);
  });

  it('rechecks current access when restarting with a remembered workflow', async (t) => {
    await startCapture(undefined, 'online-shopping');
    await stopCapture();
    const access = workflowAccess();
    access.workflows = access.workflows.filter((item) => item.id !== 'online-shopping');
    t.mock.method(chrome.runtime, 'sendMessage', async () => access);
    await assert.rejects(startCapture(), /Choose a workflow/);
    assert.equal(await getLiveSession(), null);
  });
});
