import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_SETTINGS } from '../src/shared/constants';
import { hostMatches, siteAllowed } from '../src/shared/utils/siteAccess';

const settings = (patch: Partial<typeof DEFAULT_SETTINGS> = {}) => ({ ...DEFAULT_SETTINGS, ...patch });

describe('hostMatches', () => {
  it('matches an exact host, case-insensitively', () => {
    assert.equal(hostMatches('app.example.com', 'APP.example.com'), true);
  });

  it('does not match a host that merely ends with the pattern', () => {
    assert.equal(hostMatches('bank.com', 'notbank.com'), false);
    assert.equal(hostMatches('bank.com', 'bank.com.evil.io'), false);
  });

  it('wildcard matches subdomains but not the bare domain', () => {
    assert.equal(hostMatches('*.example.com', 'a.b.example.com'), true);
    assert.equal(hostMatches('*.example.com', 'example.com'), false);
    assert.equal(hostMatches('*.example.com', 'badexample.com'), false);
  });

  it('accepts a pasted URL or host:port as a pattern', () => {
    assert.equal(hostMatches('https://app.example.com/path', 'app.example.com'), true);
    assert.equal(hostMatches('app.example.com:8080', 'app.example.com'), true);
  });
});

describe('siteAllowed', () => {
  it('allows any normal page by default', () => {
    assert.equal(siteAllowed('https://example.com/', settings()), true);
  });

  it('keeps the existing blocklist behavior', () => {
    assert.equal(siteAllowed('https://bank.example.com/', settings({ domain_blocklist: ['bank.example.com'] })), false);
  });

  it('allowlist mode with an empty list captures nothing', () => {
    assert.equal(siteAllowed('https://example.com/', settings({ allowlist_only: true })), false);
  });

  it('allowlist mode captures only listed hosts', () => {
    const s = settings({ allowlist_only: true, domain_allowlist: ['crm.example.com', '*.corp.io'] });
    assert.equal(siteAllowed('https://crm.example.com/deals', s), true);
    assert.equal(siteAllowed('https://a.corp.io/', s), true);
    assert.equal(siteAllowed('https://mail.google.com/', s), false);
  });

  it('blocklist wins over allowlist', () => {
    const s = settings({
      allowlist_only: true,
      domain_allowlist: ['*.example.com'],
      domain_blocklist: ['pay.example.com'],
    });
    assert.equal(siteAllowed('https://pay.example.com/', s), false);
    assert.equal(siteAllowed('https://crm.example.com/', s), true);
  });

  it('never captures incognito tabs', () => {
    assert.equal(siteAllowed('https://example.com/', settings(), { incognito: true }), false);
  });

  it('never captures browser-internal pages in allowlist mode', () => {
    const s = settings({ allowlist_only: true, domain_allowlist: ['*'] });
    assert.equal(siteAllowed('chrome://settings', s), false);
  });
});
