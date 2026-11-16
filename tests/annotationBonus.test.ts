import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { local, session, workflowAccess } from './stubs/chrome';
import { WORKFLOWS, LOCAL_WORKFLOW, workflowSnapshot, annotationAvailable, assignedWorkflows } from '../src/shared/workflows';
import { earningsForSession, summarizeEarnings } from '../src/shared/earnings';
import { earningsClock, liveEarnings } from '../src/shared/liveEarnings';
import { startCapture, stopCapture } from '../src/background/session';
import { __reset, __sessions } from './stubs/db';
const flagged={...LOCAL_WORKFLOW,annotation_enabled:true,annotation_rate_cents:50};
beforeEach(()=>{for(const a of [local,session])for(const k of Object.keys(a.data))delete a.data[k];__reset()});
describe('annotation bonus',()=>{
 it('stays disabled on every shipped workflow and rejects opt-in for an unflagged workflow',()=>{
  for(const workflow of [...WORKFLOWS,LOCAL_WORKFLOW]){
   assert.equal(annotationAvailable(workflow),false);
   assert.equal(workflowSnapshot({...workflow,project_id:null,org_id:null},true).annotation_opted_in,undefined);
  }
 });
 it('requires explicit opt-in and separates base and bonus after pauses',()=>{
  const captured:any={started_at:0,ended_at:3600000,pauses:[[600000,1200000]],metadata:{owner_uid:'student',workflow:workflowSnapshot(flagged,true)}};
  const earnings=earningsForSession(captured)!;
  assert.equal(earnings.active_ms,3000000);assert.equal(earnings.base_earnings_micro_usd,833333);
  assert.equal(earnings.annotation_bonus_micro_usd,416667);assert.equal(earnings.total_earnings_micro_usd,1250000);
  assert.deepEqual(liveEarnings(earningsClock({...captured,id:'s',state:'paused',paused_at:3600000})!,9999999),earnings);
  const total=summarizeEarnings([captured],'student',!!captured.metadata.workflow.local_only);
  assert.equal(total.annotation_bonus_micro_usd,416667);assert.equal(total.total_earnings_micro_usd,1250000);
  captured.metadata.workflow=workflowSnapshot(flagged,false);assert.equal(earningsForSession(captured)?.annotation_bonus_micro_usd,undefined);
 });
 it('supports a trusted per-project assignment override and ignores malformed overrides',()=>{
  const base={workflow_id:WORKFLOWS[0].id,project_id:'project',active:true};
  const valid=assignedWorkflows({assignments:[{...base,annotation:{enabled:true,rate_cents_per_hour:75}}]});
  assert.equal(annotationAvailable(valid[0]),true);assert.equal(valid[0].annotation_rate_cents,75);
  const invalid=assignedWorkflows({assignments:[{...base,annotation:{enabled:true,rate_cents_per_hour:-10}}]});
  assert.equal(annotationAvailable(invalid[0]),false);
 });
 it('pins the server-authorized bonus when starting and preserves it on archival',async(t)=>{
  t.mock.method(chrome.runtime,'sendMessage',async(message:any)=>message.type==='WORKFLOW_ACCESS'?{uid:'student',workflows:[flagged]}:{ok:true});
  const live=await startCapture(undefined,flagged.id,true);
  assert.equal(live.metadata.workflow?.annotation_opted_in,true);assert.equal(live.metadata.workflow?.annotation_rate_cents,50);
  await stopCapture();assert.equal(__sessions.get(live.id)?.metadata.workflow?.annotation_opted_in,true);
 });
});
