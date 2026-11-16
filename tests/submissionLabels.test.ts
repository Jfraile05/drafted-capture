import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildEnrichment } from '../src/shared/enrichment';
import { workflowTitle } from '../src/shared/utils/format';
import { patchStepThoughts, submissionLabelFields } from '../src/shared/submissionLabels';
import type { Segment, Session, Step } from '../src/shared/types';

const task = (start: number, label: string, notes = ''): Segment => ({
  id: `task-${start}`,
  start_index: start,
  end_index: start,
  label,
  notes,
  category: 'workflow',
  created_at: '2026-11-11T00:00:00Z',
});
const session = (segments: Segment[] = []): Session =>
  ({
    id: 'workflow-one',
    intent: 'Client onboarding',
    steps: [0, 1, 2].map(
      (index) =>
        ({
          index,
          action: { type: 'type', text: 'RAW-TYPED-SECRET' },
          origin: { url: 'https://example.com/?token=RAW-URL-SECRET' },
          dom: { text: 'RAW-DOM-SECRET' },
          screenshot: { hash: 'RAW-SCREENSHOT' },
          annotation: null,
        }) as Step,
    ),
    segments,
  }) as Session;

describe('workflow guides', () => {
  it('uses the declared workflow name, a task name, then an honest fallback', () => {
    const value = session([task(0, 'Create client')]);
    assert.equal(workflowTitle(value), 'Client onboarding');
    value.intent = ' ';
    assert.equal(workflowTitle(value), 'Create client');
    value.segments = [];
    assert.equal(workflowTitle(value), 'Untitled workflow');
  });


});

describe('workflow context in submissions', () => {
  it('clears removed notes while preserving uploaded screenshots and other server fields', () => {
    const value = session();
    const existing = [
      { step_index: 0, thought: 'Old note', screenshot: 'stored/image.png', action: 'click' },
      { step_index: 1, thought: 'Other old note', screenshot: 'stored/other.png', action: 'type' },
      { step_index: 20, thought: 'Server-owned step', screenshot: '', action: 'wait' },
    ];
    const patched = patchStepThoughts(existing, value, { 1: { thought: 'Edited note' } });
    assert.equal(patched[0].thought, '');
    assert.equal(patched[1].thought, 'Edited note');
    assert.equal(patched[0].screenshot, 'stored/image.png');
    assert.equal(patched[1].action, 'type');
    assert.deepEqual(patched[2], existing[2]);
    assert.equal(existing[0].thought, 'Old note');
    assert.deepEqual(submissionLabelFields(value), {
      instruction: 'Client onboarding',
      category: null,
      summary: '',
    });
  });

  it('keeps task descriptions and step notes together at the task start', () => {
    const value = session([task(0, 'Create client', 'Check for duplicates first.')]);
    value.steps[0].annotation = {
      rating: 'correct',
      tags: [],
      notes: 'Search before creating.',
      annotator: 'user',
    };
    assert.deepEqual(buildEnrichment(value), {
      0: { thought: 'Create client\nCheck for duplicates first.\n\nSearch before creating.' },
    });
  });

  it('keeps overlapping task context and ignores ranges with no recorded start', () => {
    const value = session([
      task(0, 'First task'),
      task(0, 'Second task'),
      task(20, 'Invalid task'),
    ]);
    assert.deepEqual(buildEnrichment(value), { 0: { thought: 'First task\n\nSecond task' } });
  });
});
