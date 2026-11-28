import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewedSegment, validateConnection } from '../src/enterprise/sovereignBoundary';
import type { Session } from '../src/shared/types';
const session = {
  id: 'capture-session',
  steps: [
    { index: 0, timestamp: 1, action: { type: 'type', text: 'private-password' }, screenshot: { hash: 'raw-screen' }, origin: { url: 'https://crm.example.test/ticket?token=secret', title: 'private-title', tab_id: 1, frame_id: 0 }, dom: { sensitive: true, text: 'Password', tag: 'input', input_type: 'password' } },
    { index: 1, timestamp: 2, action: { type: 'click' }, screenshot: null, origin: { url: 'https://crm.example.test/ticket', title: '', tab_id: 1, frame_id: 0 }, dom: { text: 'Route to regional', tag: 'button' } },
    { index: 2, timestamp: 3, action: { type: 'click' }, origin: { url: 'https://personal.example.test/', tab_id: 1, frame_id: 0 }, dom: null },
  ],
  segments: [{ id: 'reviewed', start_index: 0, end_index: 1, label: 'Route ticket', notes: '' }, { id: 'personal', start_index: 2, end_index: 2, label: 'Personal page', notes: '' }],
} as unknown as Session;
test('Sovereign export contains exactly one reviewed minimized segment', () => {
  const value = reviewedSegment(session, 'reviewed', ['crm.example.test']);
  assert.equal(value.steps.length, 2);
  assert.equal(value.segments.length, 1);
  const text = JSON.stringify(value);
  for (const secret of ['private-password', 'raw-screen', 'private-title', 'token=secret', 'personal.example']) assert.ok(!text.includes(secret));
  assert.ok(text.includes('[sensitive]'));
});
test('Sovereign rejects out-of-scope segments and expired or unsafe connections', () => {
  assert.throws(() => reviewedSegment(session, 'personal', ['crm.example.test']), /outside/);
  const connection = { schema: 'sidekick.capture.connection.v1' as const, endpoint: 'http://127.0.0.1:8788', job_id: 'job_' + 'a'.repeat(32), access_token: 'short-lived', expires: Date.now()/1000+60, approved_origins: ['crm.example.test'] };
  assert.equal(validateConnection(connection), connection);
  assert.throws(() => validateConnection({ ...connection, expires: 0 }));
  assert.throws(() => validateConnection({ ...connection, endpoint: 'http://remote.example.test' }));
  assert.throws(() => validateConnection({ ...connection, endpoint: 'https://secret@remote.example.test' }));
});
