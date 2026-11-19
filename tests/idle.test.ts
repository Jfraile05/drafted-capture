import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { idleCalls, local, notices, session } from './stubs/chrome';
import { startCapture, pauseCapture, resumeCapture, stopCapture } from '../src/background/session';
import { applyIdleDetection, pauseIfIdle, checkInputIdle, recordActivity } from '../src/background/idle';
import { getLiveSession, setLiveSession } from '../src/shared/storage/live';
import { activeElapsed } from '../src/shared/activeTime';
import { __reset, __sessions } from './stubs/db';
let now: number;
beforeEach(t => {
  for (const area of [local,session]) for (const key of Object.keys(area.data)) delete area.data[key];
  __reset(); idleCalls.length = 0; notices.clear(); now=1000000;
  t.mock.method(Date,'now',()=>now);
  t.mock.method(chrome.tabs,'query',async()=>[{id:7}]);
});
const input = async (id:string) => recordActivity(id,now,{tab:{id:7},frameId:0} as any);
describe('input-based idle',()=>{
  it('asks to continue with a system notification, and clears it on Continue',async()=>{
    const live=await startCapture(undefined,'productivity');
    now+=120001; await checkInputIdle();
    const notice=notices.get(`sidekick-idle:${live.id}`);
    assert.ok(notice); assert.deepEqual(notice.buttons?.map((b)=>b.title),['Continue recording','Keep paused']);
    await resumeCapture({session_id:live.id});
    assert.equal((await getLiveSession())?.state,'capturing'); assert.equal(notices.size,0);
  });
  it('does not notify on a manual pause, and clears the notice on Keep paused or Stop',async()=>{
    const live=await startCapture(undefined,'productivity');
    await pauseCapture(); assert.equal(notices.size,0);
    await resumeCapture({session_id:live.id});
    now+=120001; await checkInputIdle(); assert.equal(notices.size,1);
    await pauseCapture({session_id:live.id}); assert.equal(notices.size,0);
    now+=1000; await resumeCapture({session_id:live.id}); now+=120001; await checkInputIdle(); assert.equal(notices.size,1);
    await stopCapture(); assert.equal(notices.size,0);
  });
  it('backdates idle time and requires Continue on the same page',async()=>{
    const live=await startCapture(undefined,'productivity');
    now+=60000; await input(live.id);
    now+=119999;await checkInputIdle(); assert.equal((await getLiveSession())?.state,'capturing');
    now++; await checkInputIdle();const paused=(await getLiveSession())!;
    assert.equal(paused.state,'paused');assert.equal(paused.pause_reason,'idle');assert.equal(paused.paused_at,1060000);
    assert.equal(activeElapsed(paused,now),60000);
    now+=10000; await input(live.id);
    assert.equal((await getLiveSession())?.state,'paused');
    await resumeCapture({session_id:live.id});const resumed=(await getLiveSession())!;
    assert.equal(resumed.state,'capturing');assert.equal(activeElapsed(resumed,now),60000);
    now+=5000;await stopCapture(); assert.equal(__sessions.get(live.id)?.outcome.total_duration_ms,65000);
  });
  it('recovers idle detection from persisted last input after worker suspension',async()=>{
    const live=await startCapture(undefined,'productivity');now+=120001;
    await setLiveSession(structuredClone(await getLiveSession()));await checkInputIdle();
    assert.equal((await getLiveSession())?.paused_at,live.started_at);
  });
  it('does not auto-resume manual or privacy pauses',async()=>{
    const live=await startCapture(undefined,'productivity');await pauseCapture();now+=10;await input(live.id);
    assert.equal((await getLiveSession())?.state,'paused');
    const gated=(await getLiveSession())!;gated.pause_reason='idle';gated.privacy_gate={id:'gate'} as any;await setLiveSession(gated);
    now+=10;await input(live.id);assert.equal((await getLiveSession())?.state,'paused');
  });
  it('ignores stale sessions, background tabs, incognito, and system active events',async()=>{
    const live=await startCapture(undefined,'productivity');now+=120000;await checkInputIdle();
    await recordActivity('old',now,{tab:{id:7}} as any);
    await recordActivity(live.id,now,{tab:{id:8}} as any);
    await recordActivity(live.id,now,{tab:{id:7,incognito:true}} as any);
    await pauseIfIdle('active');assert.equal((await getLiveSession())?.state,'paused');
  });
  it('pauses on lock and supports Stop while idle with zero idle pay',async()=>{
    const live=await startCapture(undefined,'productivity');now+=30000;await pauseIfIdle('locked');
    assert.equal((await getLiveSession())?.state,'paused');now+=10000;await stopCapture();
    assert.equal(__sessions.get(live.id)?.outcome.total_duration_ms,0);
  });
  it('always uses two minutes',async()=>{
    await applyIdleDetection();local.data.settings={idle_timeout_ms:1000};await applyIdleDetection();
    local.data.settings={idle_timeout_ms:900000};await applyIdleDetection();
    assert.deepEqual(idleCalls,[120,120,120]);
  });
  it('excludes idle time when Stop arrives before a delayed alarm',async()=>{
    const live=await startCapture(undefined,'productivity');now+=60000;await input(live.id);
    now+=240000;await stopCapture();
    assert.equal(__sessions.get(live.id)?.outcome.total_duration_ms,60000);
  });
  it('an explicit pause cancels automatic idle resume',async()=>{
    const live=await startCapture(undefined,'productivity');now+=120000;await checkInputIdle();
    await pauseCapture();now+=1000;await input(live.id);
    assert.equal((await getLiveSession())?.state,'paused');
    assert.equal((await getLiveSession())?.pause_reason,undefined);
  });
  it('preserves accrued time when upgrading a session with no input clock',async()=>{
    const live=await startCapture(undefined,'productivity');delete live.last_activity_at;
    await setLiveSession(live);now+=3600000;await checkInputIdle();
    assert.equal((await getLiveSession())?.state,'capturing');
    now+=120000;await checkInputIdle();
    assert.equal(activeElapsed((await getLiveSession())!,now),3600000);
  });
  it('manual Pause also excludes inactivity before a delayed alarm',async()=>{
    const live=await startCapture(undefined,'productivity');now+=60000;await input(live.id);
    now+=240000;await pauseCapture();
    const paused=(await getLiveSession())!;
    assert.equal(activeElapsed(paused,now),60000);assert.equal(paused.pause_reason,undefined);
  });
});
