import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { local, session as chromeSession, workflowAccess } from './stubs/chrome';
import { BUILTIN_PRIVACY_POLICY, parsePrivacyPolicy, privacyReasonsForUrl } from '../src/shared/privacy';
import { PRIVACY_CONFIG } from '../src/config/privacy';
// Use the actual guard and screenshot queue for these integration cases.
import * as privacy from '../src/background/privacy.ts';
import { captureVisible, resetCaptureQueue } from '../src/shared/utils/captureQueue.ts';
import { getPrivacyPolicy, refreshPrivacyPolicy } from '../src/background/privacyPolicy';
import { startCapture, resumeCapture, stopCapture, pauseCapture } from '../src/background/session';
import { getLiveSession, setLiveSession, currentSettings } from '../src/shared/storage/live';
import { handleCaptureEvent, handleIntervalScreenshot, handleTabUpdated } from '../src/background/coordinator';
import { __reset, __steps, __screenshots, __sessions } from './stubs/db';
import { checkInputIdle } from '../src/background/idle';
import { activeElapsed } from '../src/shared/activeTime';

let tab: any;
let reasons: string[];
let childFrames: any[];
let documentId: string;
let captures: number;
const raw = () => ({ event: { type: 'click', timestamp: Date.now(), client_x: 1, client_y: 1, modifiers: [] }, dom: null, dpr: 1 }) as any;
const sender = () => ({ tab, frameId: 0 }) as any;

beforeEach((t) => {
  for (const key of Object.keys(chromeSession.data)) delete chromeSession.data[key];
  for (const key of Object.keys(local.data)) delete local.data[key];
  __reset(); resetCaptureQueue();
  reasons = []; childFrames = []; documentId = 'document-1'; captures = 0;
  tab = { id: 7, windowId: 1, status: 'complete', active: true, url: 'https://example.com/' };
  (globalThis as any).__privacy = privacy;
  (globalThis as any).__capture = captureVisible;
  t.mock.method(chrome.runtime, 'sendMessage', async (message: any) => message.type === 'WORKFLOW_ACCESS' ? workflowAccess() : { ok: true });
  t.mock.method(chrome.tabs, 'query', async () => [tab]);
  t.mock.method(chrome.tabs, 'get', async () => tab);
  t.mock.method(chrome.tabs, 'sendMessage', async (_id: any, message: any) =>
    message.type === 'GET_SENSITIVE_REGIONS' ? { rects: [], viewportWidth: 800 } : { ok: true });
  t.mock.method(chrome.scripting, 'executeScript', async () => [{
    frameId: 0, documentId,
    result: { url: tab.url, reasons: [...reasons], ready: tab.status === 'complete', frames: childFrames.map((f) => f.result.url) },
  }, ...childFrames]);
  (chrome.tabs.captureVisibleTab as any) = async () => { captures++; return 'data:image/png;base64,dGVzdA=='; };
  (globalThis as any).createImageBitmap = async () => ({ width: 800, height: 600, close() {} });
});

describe('managed privacy policy', () => {
  it('ships a valid baseline and rejects malformed remote policies', () => {
    assert.ok(parsePrivacyPolicy(BUILTIN_PRIVACY_POLICY));
    for (const value of [null, {}, { ...BUILTIN_PRIVACY_POLICY, version: -1 },
      { ...BUILTIN_PRIVACY_POLICY, domains: { ...BUILTIN_PRIVACY_POLICY.domains, banking: ['.*'] } },
      { ...BUILTIN_PRIVACY_POLICY, paths: { payment: ['.*'] } },
    ]) assert.equal(parsePrivacyPolicy(value), null);
  });
  it('matches sensitive domains, their subdomains, and checkout, inbox, and login routes', () => {
    for (const [url, category] of [
      ['https://secure.chase.com/', 'banking'], ['https://shop.example/checkout', 'payment'],
      ['https://shop.example/#/payment', 'payment'], ['https://unknown.example/inbox', 'messaging'],
      ['https://mail.google.com/', 'messaging'], ['https://example.com/login', 'login'],
      ['https://mychart.com/', 'healthcare'], ['https://id.me/', 'government'],
      ['https://vault.bitwarden.com/', 'passwords'],
    ]) assert.ok(privacyReasonsForUrl(url, BUILTIN_PRIVACY_POLICY).includes(category as any), url);
    assert.deepEqual(privacyReasonsForUrl('https://chase.com.evil.example/', BUILTIN_PRIVACY_POLICY), []);
    assert.deepEqual(privacyReasonsForUrl('https://example.com/?next=/checkout', BUILTIN_PRIVACY_POLICY), []);
  });
  it('updates from the managed source, survives offline, and rejects rollback or malformed data', async (t) => {
    const next = structuredClone(BUILTIN_PRIVACY_POLICY);
    next.version++;
    next.domains.banking.push('newbank.example');
    t.mock.method(chrome.runtime, 'sendMessage', async () => next);
    await refreshPrivacyPolicy();
    assert.equal((await getPrivacyPolicy()).version, next.version);
    assert.ok(privacyReasonsForUrl('https://newbank.example', await getPrivacyPolicy()).includes('banking'));
    t.mock.method(chrome.runtime, 'sendMessage', async () => { throw Error('offline'); });
    await refreshPrivacyPolicy();
    assert.equal((await getPrivacyPolicy()).version, next.version);
    t.mock.method(chrome.runtime, 'sendMessage', async () => BUILTIN_PRIVACY_POLICY);
    await refreshPrivacyPolicy();
    assert.equal((await getPrivacyPolicy()).version, next.version);
    t.mock.method(chrome.runtime, 'sendMessage', async () => ({ version: 99, domains: {} }));
    await refreshPrivacyPolicy();
    assert.equal((await getPrivacyPolicy()).version, next.version);
  });
  it('ignores removed student blocklist and video settings', () => {
    const settings = currentSettings({ domain_blocklist: ['example.com'], record_video: true } as any);
    assert.equal('domain_blocklist' in settings, false);
    assert.equal('record_video' in settings, false);
  });
});

describe('privacy before persistence', () => {
  it('resumes automatically after leaving a gated page for a safe page, excluding the pause', async (t) => {
    let now=1000000;t.mock.method(Date,'now',()=>now);
    await startCapture(undefined,'productivity');now+=10000;
    tab.url='https://example.com/checkout';await privacy.checkCurrentScreen();
    const paused=(await getLiveSession())!;assert.equal(paused.state,'paused');
    await privacy.keepPrivacyPaused(paused.privacy_gate!.id);
    now+=30000;tab.url='https://example.com/products';await privacy.checkCurrentScreen();
    const live=(await getLiveSession())!;
    assert.equal(live.state,'capturing');assert.equal(live.privacy_gate,undefined);assert.equal(activeElapsed(live,now),10000);
  });
  it('does not auto-resume on the same page or another sensitive page',async()=>{
    await startCapture(undefined,'productivity');reasons=['payment'];await privacy.checkCurrentScreen();
    reasons=[];await privacy.checkCurrentScreen();assert.equal((await getLiveSession())?.state,'paused');
    tab.url='https://example.com/inbox';await handleTabUpdated(7,{url:tab.url,status:'complete'},tab);
    assert.equal((await getLiveSession())?.state,'paused');assert.ok((await getLiveSession())?.privacy_gate);
  });
  it('resumes an idle pause on foreground safe navigation, but preserves manual pauses',async(t)=>{
    let now=1000000;t.mock.method(Date,'now',()=>now);
    await startCapture(undefined,'productivity');now+=180000;await checkInputIdle();
    await privacy.checkCurrentScreen();assert.equal((await getLiveSession())?.state,'paused');
    await privacy.checkCurrentScreen(99);assert.equal((await getLiveSession())?.state,'paused');
    tab.url='https://example.com/new';await handleTabUpdated(7,{url:tab.url,status:'complete'},tab);
    assert.equal((await getLiveSession())?.state,'capturing');
    await pauseCapture();tab.url='https://example.com/other';await handleTabUpdated(7,{url:tab.url,status:'complete'},tab);
    assert.equal((await getLiveSession())?.state,'paused');
  });
  it('requires confirmation when an idle student opens a sensitive page',async(t)=>{
    let now=1000000;t.mock.method(Date,'now',()=>now);
    await startCapture(undefined,'productivity');now+=180000;await checkInputIdle();
    tab.url='https://example.com/checkout';await handleTabUpdated(7,{url:tab.url,status:'complete'},tab);
    assert.equal((await getLiveSession())?.state,'paused');assert.ok((await getLiveSession())?.privacy_gate?.reasons.includes('payment'));
  });
  it('a manual pause wins a race against automatic safe-page resume',async(t)=>{
    await startCapture(undefined,'productivity');tab.url='https://example.com/checkout';await privacy.checkCurrentScreen();
    tab.url='https://example.com/products';let inspections=0;
    t.mock.method(chrome.scripting,'executeScript',async()=>{
      if(++inspections===2)await pauseCapture();
      return [{frameId:0,documentId,result:{url:tab.url,reasons:[],ready:true,frames:[]}}];
    });
    await privacy.checkCurrentScreen(7);
    assert.equal((await getLiveSession())?.state,'paused');assert.equal((await getLiveSession())?.privacy_gate,undefined);
  });
  it('excludes overdue idle time when a privacy gate wins the alarm race', async (t) => {
    let now = 1000000;
    t.mock.method(Date, 'now', () => now);
    await startCapture(undefined, 'productivity');
    now += 240000;
    tab.url = 'https://example.com/checkout';
    await privacy.checkCurrentScreen();
    const live = (await getLiveSession())!;
    assert.equal(live.paused_at, 1000000);
    assert.equal(live.pause_reason, undefined);
    assert.ok(live.privacy_gate);
  });
  it('pauses on a banking site before an action or periodic frame is captured', async () => {
    tab.url = 'https://secure.chase.com/accounts';
    const started = await startCapture(undefined, 'productivity');
    assert.equal(started.state, 'paused');
    assert.ok(started.privacy_gate?.reasons.includes('banking'));
    assert.equal((await handleCaptureEvent(raw(), sender())).ok, false);
    await handleIntervalScreenshot();
    assert.equal(captures, 0);
    assert.equal(__screenshots.size, 0);
    assert.equal(__steps.get(started.id)?.length ?? 0, 0);
    await stopCapture();
    assert.equal(__sessions.get(started.id)?.steps.length, 0);
  });
  it('gates checkout and inbox navigation, including before the new document finishes loading', async () => {
    await startCapture(undefined, 'productivity');
    tab.url = 'https://example.com/checkout'; tab.status = 'loading';
    await handleTabUpdated(7, { url: tab.url, status: 'loading' }, tab);
    assert.equal((await getLiveSession())?.state, 'paused');
    assert.ok((await getLiveSession())?.privacy_gate?.reasons.includes('payment'));
    assert.equal(captures, 0);
    tab.url = 'https://example.com/inbox'; tab.status = 'complete';
    await privacy.checkCurrentScreen();
    assert.ok((await getLiveSession())?.privacy_gate?.reasons.includes('messaging'));
  });
  it('gates sensitive fields and a payment iframe on otherwise unknown domains', async () => {
    const live = await startCapture(undefined, 'productivity');
    reasons = ['address', 'government', 'login'];
    assert.equal((await handleCaptureEvent(raw(), sender())).ok, false);
    assert.deepEqual((await getLiveSession())?.privacy_gate?.reasons, ['address', 'government', 'login']);
    await stopCapture();
    reasons = [];
    childFrames = [{ frameId: 3, documentId: 'payment', result: { url: 'https://js.stripe.com/fields', reasons: [], ready: true, frames: [] } }];
    const second = await startCapture(undefined, 'productivity');
    assert.ok(second.privacy_gate?.reasons.includes('payment'));
    assert.equal(__steps.get(live.id)?.length ?? 0, 0);
    assert.equal(__screenshots.size, 0);
  });
  it('discards a screenshot if a sensitive form appears while capture is in flight', async (t) => {
    const live = await startCapture(undefined, 'productivity');
    t.mock.method(chrome.tabs, 'captureVisibleTab', async () => {
      captures++; reasons = ['payment'];
      return 'data:image/png;base64,dGVzdA==';
    });
    assert.equal((await handleCaptureEvent(raw(), sender())).ok, false);
    assert.equal(captures, 1);
    assert.equal(__screenshots.size, 0);
    assert.equal(__steps.get(live.id)?.length ?? 0, 0);
    assert.equal((await getLiveSession())?.state, 'paused');
  });
  it('stores ordinary frames and actions only after inspection', async () => {
    const live = await startCapture(undefined, 'productivity');
    assert.equal((await handleCaptureEvent(raw(), sender())).ok, true);
    assert.equal(__screenshots.size, 1);
    assert.equal(__steps.get(live.id)?.length, 1);
  });
  it('fails closed if a page cannot be inspected', async (t) => {
    const live = await startCapture(undefined, 'productivity');
    t.mock.method(chrome.scripting, 'executeScript', async () => { throw Error('Cannot inspect'); });
    assert.equal(await privacy.capturePermit(tab.id, tab.url), null);
    assert.ok((await getLiveSession())?.privacy_gate?.reasons.includes('unavailable'));
    assert.equal(__steps.get(live.id)?.length ?? 0, 0);
    assert.equal(captures, 0);
  });
});

describe('privacy confirmation', () => {
  it('does not let an older inspection undo a newer confirmation', async (t) => {
    tab.url = 'https://chase.com/';
    const live = await startCapture(undefined, 'productivity');
    const execute = chrome.scripting.executeScript;
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    const delayed = new Promise<void>(resolve => { release = resolve; });
    let first = true;
    t.mock.method(chrome.scripting, 'executeScript', async (args: any) => {
      if (first) { first = false; entered(); await delayed; }
      return execute(args);
    });
    const older = privacy.checkCurrentScreen();
    await waiting;
    await resumeCapture({ session_id: live.id }, live.privacy_gate!.id);
    release(); await older;
    assert.equal((await getLiveSession())?.state, 'capturing');
    assert.equal((await getLiveSession())?.privacy_gate, undefined);
  });

  it('keeps the gate through ordinary Resume, Keep paused, and storage reload, then accepts explicit confirmation', async () => {
    tab.url = 'https://chase.com/';
    const live = await startCapture(undefined, 'productivity');
    const gate = live.privacy_gate!;
    assert.equal((await resumeCapture())?.state, 'paused');
    await privacy.keepPrivacyPaused(gate.id);
    await setLiveSession(structuredClone(await getLiveSession()));
    assert.equal((await getLiveSession())?.privacy_gate?.kept_paused, true);
    assert.equal(await privacy.capturePermit(tab.id, tab.url), null);
    assert.equal((await resumeCapture({ session_id: live.id }, gate.id))?.state, 'capturing');
    assert.ok(await privacy.capturePermit(tab.id, tab.url));
  });
  it('rejects stale confirmation after navigation or a different document loads at the same URL', async () => {
    tab.url = 'https://chase.com/';
    const live = await startCapture(undefined, 'productivity');
    documentId = 'document-2';
    assert.equal((await resumeCapture({ session_id: live.id }, live.privacy_gate!.id))?.state, 'paused');
    const gate = (await getLiveSession())!.privacy_gate!;
    assert.notEqual(gate.id, live.privacy_gate!.id);
    tab.url = 'https://paypal.com/';
    assert.equal((await resumeCapture({ session_id: live.id }, gate.id))?.state, 'paused');
    assert.ok((await getLiveSession())?.privacy_gate?.reasons.includes('payment'));
  });
  it('revokes approval on navigation and remote policy updates', async () => {
    tab.url = 'https://chase.com/';
    const live = await startCapture(undefined, 'productivity');
    await resumeCapture({ session_id: live.id }, live.privacy_gate!.id);
    await privacy.invalidatePrivacyApproval();
    assert.equal(await privacy.capturePermit(tab.id, tab.url), null);
    const gate = (await getLiveSession())!.privacy_gate!;
    await resumeCapture({ session_id: live.id }, gate.id);
    const next = structuredClone(BUILTIN_PRIVACY_POLICY); next.version++;
    await chrome.storage.local.set({ [PRIVACY_CONFIG.cacheKey]: next });
    assert.equal(await privacy.capturePermit(tab.id, tab.url), null);
  });
  it('does not reuse a frame permit after Pause and Resume or in a replacement session', async () => {
    await startCapture(undefined, 'productivity');
    const permit = (await privacy.capturePermit(tab.id, tab.url))!;
    await pauseCapture(); await resumeCapture();
    assert.equal(await privacy.validatePermit(permit), false);
    await stopCapture(); await startCapture(undefined, 'productivity');
    assert.equal(await privacy.validatePermit(permit), false);
  });
});
