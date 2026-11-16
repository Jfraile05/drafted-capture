import assert from 'node:assert/strict';
import { beforeEach, it } from 'node:test';
import { local } from './stubs/chrome';
import { __reset, getSession, putSession, updateSession } from './stubs/db';
import { submission } from './stubs/submission';
import { syncQueuedSessions } from '../src/shared/syncQueue';
import { markSessionDirty, pendingSync } from '../src/shared/syncState';
import { DEMO } from '../src/demo/config';
import { fixtureSessions } from '../src/demo/fixtures';
import { submitSessionToDrafted, enrichSubmittedSession, readReceipts } from '../src/demo/submitToDrafted';

beforeEach(t=>{
  __reset();for(const key of Object.keys(local.data))delete local.data[key];
  submission.user={uid:DEMO.uid};submission.upload=submitSessionToDrafted;submission.enrich=enrichSubmittedSession;
  const locks=new Map<string,Promise<unknown>>();
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true,locks:{request:(name:string,fn:()=>Promise<unknown>)=>{const p=(locks.get(name)??Promise.resolve()).then(fn);locks.set(name,p.catch(()=>{}));return p}}}});
  t.mock.method(console,'error',()=>{});
});

it('retains an offline synthetic task, retries once, and updates its existing receipt after labeling',async()=>{
  const s=fixtureSessions(Date.now())[1];await putSession(s);
  await chrome.storage.local.set({[DEMO.offlineKey]:true});
  const queue=()=>syncQueuedSessions({projectId:'',orgId:''});
  await queue();assert.equal(Object.keys(await readReceipts()).length,0);
  assert.equal(pendingSync((await getSession(s.id))!),true);
  assert.equal((await getSession(s.id))!.sync!.attempts,1);
  await chrome.storage.local.set({[DEMO.offlineKey]:false});
  await updateSession(s.id,current=>({...current,sync:{...current.sync!,retry_at:0}}));
  await queue();assert.equal(pendingSync((await getSession(s.id))!),false);
  const receiptId=(await getSession(s.id))!.submission!.drafted_task_id;
  assert.match(receiptId,/^synthetic-receipt:/);assert.equal((await readReceipts())[receiptId].revision,1);
  await queue();assert.equal(Object.keys(await readReceipts()).length,1);
  await updateSession(s.id,current=>markSessionDirty({...current,segments:current.segments.map(v=>({...v,label:'Checked the keyboard prices'}))}));
  await queue();const ledger=await readReceipts();
  assert.equal(Object.keys(ledger).length,1);assert.equal(ledger[receiptId].revision,2);
  assert.equal(ledger[receiptId].labels[0],'Checked the keyboard prices');
  assert.equal(ledger[receiptId].earnings?.total_earnings_micro_usd,750000);
  assert.equal(pendingSync((await getSession(s.id))!),false);
});
