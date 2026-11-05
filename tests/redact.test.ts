import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Step } from '../src/shared/types';
import { redactStep, redactText, redactUrl } from '../src/shared/utils/redact';

describe('redactText', () => {
  it('redacts emails', () => {
    assert.equal(redactText('mail jane.doe+x@corp.co.uk now'), 'mail [email] now');
  });

  it('redacts card numbers that pass the Luhn check, with separators', () => {
    assert.equal(redactText('4111 1111 1111 1111'), '[card]');
    assert.equal(redactText('pay 4111-1111-1111-1111 ok'), 'pay [card] ok');
  });

  it('leaves long digit strings that fail Luhn alone', () => {
    assert.equal(redactText('order 1234567890123456'), 'order 1234567890123456');
  });

  it('redacts US social security numbers', () => {
    assert.equal(redactText('ssn 123-45-6789'), 'ssn [ssn]');
  });

  it('redacts common API keys and tokens', () => {
    assert.equal(redactText('AKIAIOSFODNN7EXAMPLE'), '[secret]');
    assert.equal(redactText('sk-abcdefghijklmnopqrstuvwx'), '[secret]');
    assert.equal(redactText(`ghp_${'a'.repeat(36)}`), '[secret]');
    assert.equal(redactText('Bearer abc.def-ghi_123'), '[secret]');
    assert.equal(
      redactText('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJl'),
      '[secret]',
    );
  });

  it('leaves ordinary text alone', () => {
    assert.equal(redactText('Click the Save button'), 'Click the Save button');
  });
});

describe('redactUrl', () => {
  it('redacts sensitive query and fragment values, keeps the rest', () => {
    assert.equal(
      redactUrl('https://x.com/cb?code=abc123&page=2&access_token=zzz#id_token=yyy'),
      'https://x.com/cb?code=[redacted]&page=2&access_token=[redacted]#id_token=[redacted]',
    );
  });

  it('redacts emails inside the url', () => {
    assert.equal(redactUrl('https://x.com/u?who=a@b.com'), 'https://x.com/u?who=[email]');
  });

  it('returns non-url input unchanged', () => {
    assert.equal(redactUrl(''), '');
  });
});

const baseDom = {
  selector: 'input',
  xpath: '/input',
  tag: 'input',
  text: null,
  aria_role: null,
  aria_label: null,
  rect: { x: 0, y: 0, width: 1, height: 1 },
  visible: true,
  interactive: true,
  input_type: 'text' as string | null,
  input_value: null as string | null,
};

function step(partial: Partial<Step>): Step {
  return {
    index: 0,
    timestamp: 1,
    duration_to_next: null,
    action: { type: 'wait' },
    screenshot: null,
    dom: null,
    origin: { tab_id: 1, frame_id: 0, url: 'https://x.com/', title: 'T' },
    annotation: null,
    ...partial,
  };
}
const opts = { maskAllInputs: false };

describe('redactStep', () => {
  it('replaces typed text in a password field', () => {
    const s = step({
      action: { type: 'type', text: 'hunter2' },
      dom: { ...baseDom, input_type: 'password', input_value: '•••••••' },
    });
    redactStep(s, opts);
    assert.equal(s.action.text, '[redacted]');
  });

  it('replaces typed text in a field flagged sensitive', () => {
    const s = step({
      action: { type: 'type', text: '123456' },
      dom: { ...baseDom, sensitive: true, input_value: '123456' },
    });
    redactStep(s, opts);
    assert.equal(s.action.text, '[redacted]');
    assert.equal(s.dom?.input_value, '[redacted]');
  });

  it('scrubs PII from typed text, dom text, values, labels, urls and titles', () => {
    const s = step({
      action: { type: 'type', text: 'me@corp.com' },
      dom: {
        ...baseDom,
        text: 'ssn 123-45-6789',
        input_value: 'me@corp.com',
        aria_label: 'card 4111111111111111',
      },
      origin: { tab_id: 1, frame_id: 0, url: 'https://x.com/?token=abc', title: 'Hi me@corp.com' },
    });
    redactStep(s, opts);
    assert.equal(s.action.text, '[email]');
    assert.equal(s.dom?.text, 'ssn [ssn]');
    assert.equal(s.dom?.input_value, '[email]');
    assert.equal(s.dom?.aria_label, 'card [card]');
    assert.equal(s.origin.url, 'https://x.com/?token=[redacted]');
    assert.equal(s.origin.title, 'Hi [email]');
  });

  it('redacts urls on navigate actions', () => {
    const s = step({ action: { type: 'navigate', url: 'https://x.com/?code=1' } });
    redactStep(s, opts);
    assert.equal(s.action.url, 'https://x.com/?code=[redacted]');
  });

  it('masks every input when maskAllInputs is on', () => {
    const s = step({
      action: { type: 'type', text: 'hello' },
      dom: { ...baseDom, input_value: 'hello' },
    });
    redactStep(s, { maskAllInputs: true });
    assert.equal(s.action.text, '•••••');
    assert.equal(s.dom?.input_value, '•••••');
  });

  it('does not touch clicks and plain text', () => {
    const s = step({ action: { type: 'click', coordinate: [1, 2] }, dom: { ...baseDom, text: 'Save' } });
    redactStep(s, opts);
    assert.deepEqual(s.action, { type: 'click', coordinate: [1, 2] });
    assert.equal(s.dom?.text, 'Save');
  });
});
