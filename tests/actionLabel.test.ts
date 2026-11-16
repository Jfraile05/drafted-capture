import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Step } from '../src/shared/types';
import { actionLabel } from '../src/shared/utils/format';

const dom = (fields: Partial<NonNullable<Step['dom']>>) => fields as NonNullable<Step['dom']>;

describe('actionLabel', () => {
  it('names the element that was clicked instead of its coordinates', () => {
    assert.equal(
      actionLabel({ type: 'click', coordinate: [510, 220] }, dom({ text: '  Create\n contact ' })),
      'Click "Create contact"',
    );
  });

  it('prefers the accessible label over visible text', () => {
    assert.equal(
      actionLabel({ type: 'click' }, dom({ aria_label: 'Close dialog', text: 'X' })),
      'Click "Close dialog"',
    );
  });

  it('never shows text from a sensitive field', () => {
    assert.equal(
      actionLabel({ type: 'click' }, dom({ text: '4242', sensitive: true })),
      'Click on page',
    );
  });

  it('falls back to plain wording without coordinates', () => {
    assert.equal(actionLabel({ type: 'click', coordinate: [1, 2] }), 'Click on page');
    assert.equal(
      actionLabel({ type: 'navigate', url: 'https://app.hubspot.com/x' }),
      'Go to app.hubspot.com',
    );
  });
});
