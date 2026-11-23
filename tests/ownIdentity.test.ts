import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Step } from '../src/shared/types';
import {
  findSensitiveSpans,
  ownPattern,
  ownTerms,
  redactStep,
  redactText,
} from '../src/shared/utils/redact';

const jordan = ownPattern(
  ownTerms({ email: 'jordan.testperson@example.com', names: ['Jordan Testperson'] }),
);

describe('ownTerms', () => {
  it('uses the full name, each part, the email and its local part', () => {
    assert.deepEqual(
      ownTerms({ email: 'Jordan.Testperson@example.com', names: ['Jordan Testperson'] }).sort(),
      ['Jordan', 'Jordan Testperson', 'Testperson', 'jordan.testperson', 'jordan.testperson@example.com'].sort(),
    );
  });

  it('skips parts too short to match safely and drops duplicates', () => {
    assert.deepEqual(ownTerms({ email: 'al@x.io', names: ['Al Li', 'Al Li', ' '] }), ['Al Li', 'al@x.io']);
  });

  it('is empty without an identity', () => {
    assert.deepEqual(ownTerms({}), []);
    assert.equal(ownPattern([]), null);
  });
});

describe('own name and email', () => {
  it('redacts the student name anywhere in text, in any case', () => {
    assert.equal(redactText('Signed in as Jordan Testperson', jordan), 'Signed in as [name]');
    assert.equal(redactText('Hi JORDAN, welcome', jordan), 'Hi [name], welcome');
    assert.equal(redactText('Account: jordan.testperson', jordan), 'Account: [name]');
  });

  it('keeps the email label and leaves longer words alone', () => {
    assert.equal(redactText('mail jordan.testperson@example.com', jordan), 'mail [email]');
    assert.equal(redactText('Jordanian food', jordan), 'Jordanian food');
  });

  it('matches names with punctuation and accents', () => {
    const p = ownPattern(ownTerms({ names: ["Ana-María O'Neil"] }));
    assert.equal(redactText("Notes for Ana-María O'Neil.", p), 'Notes for [name].');
    assert.equal(redactText('Thanks Ana-María', p), 'Thanks [name]');
  });

  it('gives screenshot spans for the name', () => {
    const text = 'Advisor: Jordan Testperson';
    const spans = findSensitiveSpans(text, jordan);
    assert.ok(spans.some(([s, e]) => text.slice(s, e) === 'Jordan Testperson'));
    assert.deepEqual(findSensitiveSpans(text), []);
  });

  it('redacts the name in stored step text', () => {
    const step = {
      action: { type: 'click' },
      dom: { text: 'Jordan Testperson profile' },
      origin: { url: 'https://example.com/u/jordan.testperson', title: 'Jordan Testperson - Portal' },
    } as unknown as Step;
    redactStep(step, { maskAllInputs: false, own: jordan });
    assert.equal(step.dom?.text, '[name] profile');
    assert.equal(step.origin.title, '[name] - Portal');
    assert.equal(step.origin.url, 'https://example.com/u/[name]');
  });
});
