import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { local, session } from './stubs/chrome';
import { classifyUrl, categoryLabel, siteForOrigin, tagSegment } from '../src/shared/urlCategories';
import type { Segment, Step } from '../src/shared/types';
import { handleCaptureEvent, handleTabActivated, handleTabUpdated, handleIntervalScreenshot } from '../src/background/coordinator';
import { startCapture, stopCapture, pauseCapture } from '../src/background/session';
import { setSettings } from '../src/shared/storage/live';
import { __reset, __steps, __sessions } from './stubs/db';

const step = (index: number, url: string): Step => ({
  index, timestamp: Date.now(), duration_to_next: null,
  action: { type: 'screenshot' }, screenshot: null, dom: null, annotation: null,
  origin: { tab_id: 7, frame_id: 0, title: '', url },
});
const segment = (start_index = 0, end_index = 2): Segment => ({
  id: 'task', start_index, end_index, label: 'Compare options', category: 'research',
  notes: 'Keep this note', created_at: '2026-11-13',
});

beforeEach(() => {
  for (const key of Object.keys(session.data)) delete session.data[key];
  for (const key of Object.keys(local.data)) delete local.data[key];
  __reset();
  (globalThis as any).__capture = undefined;
});

describe('URL categories', () => {
  it('classifies known sites and normalizes the domain without storing URL parameters', () => {
    for (const [url, domain, category] of [
      ['https://WWW.DELTA.COM./flights?token=secret#results', 'delta.com', 'flight_booking'],
      ['https://booking.delta.com/', 'booking.delta.com', 'flight_booking'],
      ['https://www.amazon.co.jp/cart', 'amazon.co.jp', 'shopping'],
      ['https://amazon.es/', 'amazon.es', 'shopping'],
      ['https://mail.google.com/mail/u/0', 'mail.google.com', 'email'],
      ['https://secure.chase.com/', 'secure.chase.com', 'banking'],
      ['https://booking.com/', 'booking.com', 'travel'],
      ['https://docs.google.com/spreadsheets/d/example', 'docs.google.com', 'productivity'],
      ['https://figma.com/', 'figma.com', 'productivity'],
      ['https://school.instructure.com/', 'school.instructure.com', 'education'],
    ]) assert.deepEqual(classifyUrl(url), { domain, category });
  });

  it('prefers specific paths and host rules, respecting path boundaries', () => {
    assert.equal(classifyUrl('https://google.com/travel/flights/search?x=1').category, 'flight_booking');
    assert.equal(classifyUrl('https://google.com/travel/hotels').category, 'travel');
    assert.equal(classifyUrl('https://google.com/travel/flights-other').category, 'travel');
    assert.equal(classifyUrl('https://google.com/traveller').category, 'uncategorized');
    assert.equal(classifyUrl('https://outlook.office.com/').category, 'email');
    assert.equal(classifyUrl('https://office.com/').category, 'productivity');
  });

  it('never treats a domain lookalike or a query containing a known URL as a match', () => {
    for (const url of [
      'https://notdelta.com/', 'https://delta.com.example.net/',
      'https://example.net/?url=https://delta.com/', 'https://delta.com@example.net/',
    ]) assert.equal(classifyUrl(url).category, 'uncategorized');
  });

  it('retains unknown web domains and handles invalid or internal URLs cleanly', () => {
    assert.deepEqual(classifyUrl('https://new.example:8443/path'), { domain: 'new.example', category: 'uncategorized' });
    for (const url of ['', 'not a URL', 'chrome://settings', 'about:blank', 'file:///tmp/example', 'data:text/html,hello']) {
      assert.deepEqual(classifyUrl(url), { domain: '', category: 'uncategorized' });
    }
    assert.equal(categoryLabel('uncategorized'), 'Uncategorized');
  });

  it('keeps the recorded tag and derives a fallback for older sessions', () => {
    const origin = step(0, 'https://delta.com').origin;
    assert.deepEqual(siteForOrigin(origin), { domain: 'delta.com', category: 'flight_booking' });
    origin.site = { domain: 'delta.com', category: 'uncategorized' };
    assert.equal(siteForOrigin(origin).category, 'uncategorized');
  });

  it('tags only the inclusive task range, deduplicates sites, and preserves manual labels', () => {
    const steps = [step(0, 'https://delta.com'), step(1, 'https://amazon.es'), step(2, 'https://amazon.es/cart'), step(3, 'https://new.example')];
    const tagged = tagSegment(segment(), steps);
    assert.deepEqual(tagged.sites, [
      { domain: 'delta.com', category: 'flight_booking' },
      { domain: 'amazon.es', category: 'shopping' },
    ]);
    assert.equal(tagged.category, 'research');
    assert.equal(tagged.label, 'Compare options');
    assert.equal(tagged.notes, 'Keep this note');
    assert.deepEqual(tagSegment({ ...tagged, start_index: 3, end_index: 3 }, steps).sites,
      [{ domain: 'new.example', category: 'uncategorized' }]);
    assert.deepEqual(tagSegment(segment(), []).sites, []);
  });

  it('keeps both categories when a task spans different sections of one site', () => {
    assert.deepEqual(tagSegment(segment(0, 1), [
      step(0, 'https://google.com/travel/flights'), step(1, 'https://google.com/travel/hotels'),
    ]).sites, [
      { domain: 'google.com', category: 'flight_booking' },
      { domain: 'google.com', category: 'travel' },
    ]);
  });
});

describe('stored site tags', () => {
  it('does not hold Pause behind an unresponsive page on load completion', { timeout: 2000 }, async (t) => {
    await startCapture(undefined, 'productivity');
    t.mock.method(chrome.tabs, 'sendMessage', () => new Promise(() => {}));
    await handleTabUpdated(7, { status: 'complete' }, { id: 7, url: 'https://delta.com/' } as any);
    const paused = await pauseCapture();
    assert.equal(paused?.state, 'paused');
  });

  it('records URL changes before completion and handles completion without duplicate steps', async (t) => {
    const live = await startCapture('Compare options', 'productivity');
    const sent: any[] = [];
    t.mock.method(chrome.tabs, 'sendMessage', async (...args: any[]) => { sent.push(args); });
    const tab = { id: 7, windowId: 1, url: 'https://old.example', status: 'loading' } as any;
    await handleTabUpdated(7, { url: 'https://delta.com/search', status: 'loading' }, tab);
    assert.deepEqual(__steps.get(live.id)?.[0].origin.site, { domain: 'delta.com', category: 'flight_booking' });
    assert.equal(__steps.get(live.id)?.[0].screenshot, null);
    await handleTabUpdated(7, { status: 'complete' }, { ...tab, url: 'https://delta.com/search', status: 'complete' });
    assert.equal(__steps.get(live.id)?.length, 1);
    assert.ok(sent.some(([id, message]) => id === 7 && message.type === 'SET_CAPTURE' && message.payload.capturing));
    await handleTabUpdated(7, { url: 'https://amazon.es/cart' }, { ...tab, status: 'complete' });
    assert.deepEqual(__steps.get(live.id)?.[1].origin.site, { domain: 'amazon.es', category: 'shopping' });
    await stopCapture();
    assert.deepEqual(__sessions.get(live.id)?.segments[0].sites, [
      { domain: 'delta.com', category: 'flight_booking' },
      { domain: 'amazon.es', category: 'shopping' },
    ]);
  });

  it('tags tab switches and periodic frames from the current site', async (t) => {
    const live = await startCapture(undefined, 'productivity');
    const tab = { id: 7, windowId: 1, url: 'https://delta.com/' } as any;
    t.mock.method(chrome.tabs, 'get', async () => tab);
    t.mock.method(chrome.tabs, 'query', async () => [tab]);
    (globalThis as any).__capture = async () => ({ hash: 'frame', width: 800, height: 600, dpr: 1, size: 10, timestamp: Date.now() });
    await handleTabActivated({ tabId: 7, windowId: 1 });
    tab.url = 'https://docs.google.com/';
    await handleIntervalScreenshot();
    const stored = __steps.get(live.id)!;
    assert.equal(stored[0].origin.site?.category, 'flight_booking');
    assert.equal(stored[1].origin.site?.category, 'productivity');
    assert.ok(stored.every((s) => s.screenshot));
  });

  it('tags action frames on unknown sites without bypassing allowlist or pause', async () => {
    const live = await startCapture(undefined, 'productivity');
    const sender = { tab: { id: 7, windowId: 1, url: 'https://new.example/?token=private' }, frameId: 0 } as any;
    await handleCaptureEvent({ event: { type: 'click', timestamp: Date.now(), client_x: 0, client_y: 0, modifiers: [] }, dom: null, dpr: 1 } as any, sender);
    assert.deepEqual(__steps.get(live.id)?.[0].origin.site, { domain: 'new.example', category: 'uncategorized' });
    assert.ok(!JSON.stringify(__steps.get(live.id)).includes('private'));
    await setSettings({ allowlist_only: true, domain_allowlist: ['new.example'] });
    await handleTabUpdated(7, { url: 'https://delta.com/', status: 'loading' }, sender.tab);
    assert.equal(__steps.get(live.id)?.length, 1);
    await pauseCapture();
    await handleTabUpdated(7, { url: 'https://amazon.es/', status: 'complete' }, sender.tab);
    assert.equal(__steps.get(live.id)?.length, 1);
  });
});
