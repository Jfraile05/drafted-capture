import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findSensitiveSpans } from '../src/shared/utils/redact';
import { toImageRects } from '../src/shared/utils/screenshotMask';

describe('findSensitiveSpans', () => {
  it('returns the position of an email inside a sentence', () => {
    const text = 'write to jane@corp.com today';
    const spans = findSensitiveSpans(text);
    assert.equal(spans.length, 1);
    assert.equal(text.slice(spans[0][0], spans[0][1]), 'jane@corp.com');
  });

  it('finds a card number with separators and ignores one that fails Luhn', () => {
    const ok = 'card 4111 1111 1111 1111 end';
    const [[s, e]] = findSensitiveSpans(ok);
    assert.equal(ok.slice(s, e), '4111 1111 1111 1111');
    assert.deepEqual(findSensitiveSpans('order 1234567890123456'), []);
  });

  it('finds secrets and SSNs', () => {
    assert.equal(findSensitiveSpans('key sk-abcdefghijklmnopqrstuvwx').length, 1);
    assert.equal(findSensitiveSpans('ssn 123-45-6789').length, 1);
  });

  it('returns nothing for ordinary text', () => {
    assert.deepEqual(findSensitiveSpans('Click the Save button'), []);
  });
});

describe('toImageRects', () => {
  it('scales css pixels to image pixels and pads', () => {
    const [r] = toImageRects([{ x: 10, y: 20, width: 100, height: 30 }], 2, 2000, 1000, 3);
    assert.deepEqual(r, { x: 17, y: 37, width: 206, height: 66 });
  });

  it('clamps rects to the image', () => {
    const [r] = toImageRects([{ x: -5, y: -5, width: 50, height: 50 }], 1, 100, 100, 0);
    assert.deepEqual(r, { x: 0, y: 0, width: 45, height: 45 });
  });

  it('drops rects that fall outside the image', () => {
    assert.deepEqual(toImageRects([{ x: 500, y: 500, width: 10, height: 10 }], 1, 100, 100, 0), []);
  });
});
