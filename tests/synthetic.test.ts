import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import './stubs/chrome';
import { fixtureImage, fixtureSessions } from '../src/demo/fixtures';
import { makeReceipt } from '../src/demo/submitToDrafted';
import { summarizeEarnings } from '../src/shared/earnings';
import { DEMO } from '../src/demo/config';
import { isDemoUrl } from '../src/demo/siteAccess';

describe('synthetic project',()=>{
  it('restricts capture to the exact synthetic hosts and port',()=>{
    assert.equal(isDemoUrl(`http://shop.localhost:${DEMO.port}/checkout`),true);
    for(const url of ['https://amazon.com','http://shop.localhost:80/','http://other.localhost:38425/','http://shop.localhost.evil.test:38425/','chrome://extensions'])assert.equal(isDemoUrl(url),false);
  });
  it('seeds 1.5 hours with a separate 25 cent bonus',()=>{
    const sessions=fixtureSessions(100000000);
    const total=summarizeEarnings(sessions,DEMO.uid,false);
    assert.equal(total.active_ms,5400000);assert.equal(total.base_earnings_micro_usd,1500000);
    assert.equal(total.annotation_bonus_micro_usd,250000);assert.equal(total.total_earnings_micro_usd,1750000);
    assert.equal(sessions.filter(s=>s.metadata.workflow?.annotation_opted_in).length,1);
  });
  it('uses stable receipt identity across label revisions without duplicate credit',()=>{
    const s=fixtureSessions(100000000)[1];const original=makeReceipt(s);
    s.sync!.revision++;s.segments[0].label='Reviewed sample';const revised=makeReceipt(s,{0:{thought:'Sample thought'}});
    assert.equal(original.id,revised.id);assert.equal(revised.revision,2);assert.equal(revised.labels[0],'Reviewed sample');
    assert.deepEqual(original.earnings,revised.earnings);assert.equal(revised.thoughts[0].thought,'Sample thought');
  });
  it('rejects real owners and destinations',()=>{
    const s=fixtureSessions(100000000)[0];s.metadata.owner_uid='real-user';assert.throws(()=>makeReceipt(s));
    s.metadata.owner_uid=DEMO.uid;s.metadata.drafted_project_id='real-project';assert.throws(()=>makeReceipt(s));
  });
  it('provides synthetic replay images and complete step/segment ranges',async()=>{
    for(const s of fixtureSessions(100000000)){
      assert.equal(s.steps.length,4);assert.equal(s.segments[0].end_index,3);
      for(const step of s.steps){const blob=fixtureImage(s,step);assert.equal(blob.type,'image/svg+xml');assert.match(await blob.text(),/No real student data/);}
    }
  });
});
