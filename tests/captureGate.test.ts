// End to end through the coordinator: what actually lands in storage.
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { local, session } from './stubs/chrome';

const { handleCaptureEvent, handleTabCreated } = await import('../src/background/coordinator');
const { startCapture } = await import('../src/background/session');
const { getLiveSession, setSettings } = await import('../src/shared/storage/live');
const stubDb = (await import('./stubs/db')) as typeof import('./stubs/db');

const sender = (url: string, incognito = false) =>
  ({ tab: { id: 7, windowId: 1, url, incognito }, frameId: 0 }) as any;
const typed = (text: string, dom: any = null) =>
  ({
    event: { type: 'type', timestamp: 1, client_x: 0, client_y: 0, text, modifiers: [] },
    dom,
    dpr: 1,
  }) as any;

beforeEach(() => {
  for (const k of Object.keys(session.data)) delete session.data[k];
  for (const k of Object.keys(local.data)) delete local.data[k];
  stubDb.__reset();
});

describe('capture gate', () => {
  it('drops events from sites outside the allowlist', async () => {
    await setSettings({ allowlist_only: true, domain_allowlist: ['crm.example.com'] });
    const live = await startCapture();
    const r = await handleCaptureEvent(typed('x'), sender('https://mail.google.com/'));
    assert.equal(r.ok, false);
    assert.equal(stubDb.__steps.get(live.id)?.length ?? 0, 0);
  });

  it('stores events from allowed sites', async () => {
    await setSettings({ allowlist_only: true, domain_allowlist: ['crm.example.com'] });
    const live = await startCapture();
    const r = await handleCaptureEvent(typed('x'), sender('https://crm.example.com/'));
    assert.equal(r.ok, true);
    assert.equal(stubDb.__steps.get(live.id)?.length, 1);
  });

  it('drops incognito events', async () => {
    const live = await startCapture();
    const r = await handleCaptureEvent(typed('x'), sender('https://example.com/', true));
    assert.equal(r.ok, false);
    assert.equal(stubDb.__steps.get(live.id)?.length ?? 0, 0);
  });

  it('drops new tabs on blocked or non-allowlisted urls', async () => {
    await setSettings({ allowlist_only: true, domain_allowlist: ['crm.example.com'] });
    const live = await startCapture();
    await handleTabCreated({ id: 9, url: 'https://mail.google.com/' } as any);
    assert.equal(stubDb.__steps.get(live.id)?.length ?? 0, 0);
  });
});

describe('redaction in storage and the live feed', () => {
  it('stores a password as [redacted] and keeps it out of the recent label', async () => {
    const live = await startCapture();
    const dom = {
      selector: 'input', xpath: '/input', tag: 'input', text: null, aria_role: null,
      aria_label: null, rect: { x: 0, y: 0, width: 1, height: 1 }, visible: true,
      interactive: true, input_type: 'password', input_value: '•••••••',
    };
    await handleCaptureEvent(typed('hunter2', dom), sender('https://example.com/'));
    const stored = stubDb.__steps.get(live.id)?.[0];
    assert.equal(stored?.action.text, '[redacted]');
    const cur = await getLiveSession();
    assert.ok(!JSON.stringify(cur).includes('hunter2'));
  });

  it('stores an email as [email] and keeps it out of the recent label', async () => {
    const live = await startCapture();
    await handleCaptureEvent(typed('me@corp.com'), sender('https://example.com/?token=abc'));
    const stored = stubDb.__steps.get(live.id)?.[0];
    assert.equal(stored?.action.text, '[email]');
    assert.equal(stored?.origin.url, 'https://example.com/?token=[redacted]');
    const cur = await getLiveSession();
    assert.ok(!JSON.stringify(cur).includes('me@corp.com'));
    assert.ok(!JSON.stringify(cur).includes('token=abc'));
  });
});
