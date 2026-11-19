import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isSovereignWorkspace,sendReviewedToBrowser} from '../src/enterprise/browserHandoff';
test('browser destination is closed to other hosts, lookalikes and private runtimes',()=>{
  assert.ok(isSovereignWorkspace('https://draftedsovereign.netlify.app/workspace/job_a'));
  for(const url of ['https://draftedsovereign.netlify.app.evil.test/','http://draftedsovereign.netlify.app/','https://evil.test/?next=https://draftedsovereign.netlify.app/','http://localhost:8788','https://draftedsovereign.netlify.app/practice.html']) assert.equal(isSovereignWorkspace(url),false);
});
test('handoff requires readback acknowledgement and validates the actual current tab',async()=>{
  let url='https://draftedsovereign.netlify.app/workspace/job_a';let receipt:unknown={ok:true,id:'capture_'+'a'.repeat(64),steps:4};let calls=0;
  Object.assign(globalThis,{chrome:{tabs:{get:async()=>({url})},scripting:{executeScript:async()=>{calls++;return [{result:receipt}];}}}});
  assert.equal((await sendReviewedToBrowser(1,{steps:[]})).steps,4);
  receipt={ok:true,id:'made-up'};await assert.rejects(()=>sendReviewedToBrowser(1,{}),/confirm/);
  url='https://evil.test/';await assert.rejects(()=>sendReviewedToBrowser(1,{}),/Open a Sovereign/);assert.equal(calls,2);
});
