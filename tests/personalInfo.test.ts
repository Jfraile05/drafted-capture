import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isSensitiveField } from '../src/content/dom';
import { findSensitiveSpans, redactText } from '../src/shared/utils/redact';
import { isSensitiveFrame } from '../src/shared/utils/sensitiveFrames';

const field = (attrs: {
  name?: string;
  id?: string;
  autocomplete?: string;
  label?: string;
  placeholder?: string;
}) =>
  ({
    name: attrs.name ?? '',
    id: attrs.id ?? '',
    labels: attrs.label ? [{ textContent: attrs.label }] : [],
    getAttribute: (key: string) =>
      key === 'autocomplete'
        ? (attrs.autocomplete ?? null)
        : key === 'placeholder'
          ? (attrs.placeholder ?? null)
          : null,
  }) as unknown as HTMLInputElement;

describe('phone numbers', () => {
  it('redacts common phone formats', () => {
    for (const phone of [
      '(850) 555-0123',
      '850-555-0123',
      '850.555.0123',
      '850 555 0123',
      '+1 850 555 0123',
      '+1-850-555-0123',
      '+44 20 7946 0958',
    ]) {
      assert.equal(redactText(`call ${phone} today`), 'call [phone] today', phone);
    }
  });

  it('leaves dates, prices, times, flights and order numbers alone', () => {
    for (const text of [
      '2026-11-17',
      '$1,299.00',
      'Flight DL 1234',
      '10:30 - 11:45',
      'order 1234567890',
      'ssn 123-45-6789 stays an ssn',
    ]) {
      assert.ok(!redactText(text).includes('[phone]'), text);
    }
  });

  it('marks phone numbers for masking in screenshots', () => {
    const text = 'Reach me at (850) 555-0123.';
    const [[start, end]] = findSensitiveSpans(text);
    assert.equal(text.slice(start, end), '(850) 555-0123');
  });
});

describe('labeled numbers without separators', () => {
  it('redacts SSNs and phone numbers that follow a label', () => {
    assert.equal(redactText('SSN: 123456789'), 'SSN: [ssn]');
    assert.equal(redactText('Social Security Number 123456789'), 'Social Security Number [ssn]');
    assert.equal(redactText('ssn 123 45 6789'), 'ssn [ssn]');
    assert.equal(redactText('Phone: 8505550123'), 'Phone: [phone]');
    assert.equal(redactText('mobile #+18505550123'), 'mobile #[phone]');
  });

  it('leaves unlabeled digit runs alone', () => {
    for (const text of ['order 1234567890', 'invoice 123456789', 'ref 8505550123']) {
      assert.equal(redactText(text), text, text);
    }
  });

  it('marks only the number for masking in screenshots', () => {
    const text = 'Phone: 8505550123';
    const [[start, end]] = findSensitiveSpans(text);
    assert.equal(text.slice(start, end), '8505550123');
  });
});

describe('personal form fields', () => {
  it('treats contact, address, birthday and ID fields as sensitive', () => {
    for (const autocomplete of [
      'tel',
      'tel-national',
      'email',
      'street-address',
      'address-line1',
      'postal-code',
      'bday',
      'shipping cc-number',
    ]) {
      assert.ok(isSensitiveField(field({ autocomplete }), 'text'), autocomplete);
    }
    for (const name of ['passport_number', 'routingNumber', 'account-number', 'dob', 'date_of_birth', 'tax_id']) {
      assert.ok(isSensitiveField(field({ name }), 'text'), name);
    }
    for (const name of ['name', 'first_name', 'lastName', 'home_address', 'street', 'zip_code']) {
      assert.ok(isSensitiveField(field({ name }), 'text'), name);
    }
    for (const autocomplete of ['name', 'given-name', 'address-level2']) {
      assert.ok(isSensitiveField(field({ autocomplete }), 'text'), autocomplete);
    }
    for (const label of ['Name', 'Full name *', 'Address:', 'Address line 2', 'Date of birth', 'Phone number']) {
      assert.ok(isSensitiveField(field({ name: 'f_83a', label }), 'text'), label);
    }
    assert.ok(isSensitiveField(field({ placeholder: 'Street address' }), 'text'));
    assert.ok(isSensitiveField(field({}), 'email'));
    assert.ok(isSensitiveField(field({}), 'tel'));
  });

  it('leaves ordinary fields alone', () => {
    for (const name of ['search', 'q', 'destination', 'quantity', 'promo_code', 'username', 'filename']) {
      assert.equal(isSensitiveField(field({ name }), 'text'), false, name);
    }
    for (const label of ['Workflow name', 'Search', 'City', 'Project name']) {
      assert.equal(isSensitiveField(field({ label }), 'text'), false, label);
    }
  });
});

describe('payment frames', () => {
  it('recognizes embedded card fields from payment providers', () => {
    for (const frame of [
      { src: 'https://js.stripe.com/v3/elements-inner-card.html' },
      { src: 'https://assets.braintreegateway.com/web/3.97/html/hosted-fields-frame.min.html' },
      { src: 'https://checkoutshopper-live.adyen.com/checkoutshopper/securedfields/x.html' },
      { src: 'https://pci-connect.squareup.com/v2/iframe' },
      { src: 'https://js.checkout.com/frames/v2/inline.html' },
      { src: 'about:blank', title: 'Secure card payment input frame' },
      { src: '', name: 'braintree-hosted-field-number' },
    ]) {
      assert.ok(isSensitiveFrame(frame), JSON.stringify(frame));
    }
  });

  it('ignores ads, video and maps', () => {
    for (const frame of [
      { src: 'https://www.youtube.com/embed/abc' },
      { src: 'https://googleads.g.doubleclick.net/pagead/ads' },
      { src: 'https://www.google.com/maps/embed?pb=1' },
      { src: 'https://stripe.com.evil.example/card' },
    ]) {
      assert.equal(isSensitiveFrame(frame), false, JSON.stringify(frame));
    }
  });
});
