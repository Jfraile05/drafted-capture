import { GraduationCap, CheckCircle, PaperPlaneTilt } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import type { Session } from '../shared/types';
import { reviewedSegment, validateConnection, type SovereignConnection } from './sovereignBoundary';
import {isSovereignWorkspace,sendReviewedToBrowser} from './browserHandoff';

/** Explicit enterprise destination. This handler has no contributor-sync fallback. */
export function SovereignUpload({ session }: { session: Session }) {
  const [connection, setConnection] = useState<SovereignConnection | null>(null);
  const [connectionText, setConnectionText] = useState('');
  const [segmentId, setSegmentId] = useState('');
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [workspaces,setWorkspaces]=useState<chrome.tabs.Tab[]>([]);
  const [workspaceId,setWorkspaceId]=useState('');
  const segment = session.segments.find((s) => s.id === segmentId) ?? session.segments[0];
  useEffect(() => {
    chrome.storage.session.get('sovereign_connection').then((value) => {
      if (value.sovereign_connection?.expires > Date.now() / 1000) {
        setConnection(value.sovereign_connection);
      }
    });
  }, []);
  useEffect(() => { setConsent(false); setStatus(''); }, [session.id, segment?.id, workspaceId]);
  async function refreshWorkspaces(){const tabs=(await chrome.tabs.query({})).filter(tab=>isSovereignWorkspace(tab.url));setWorkspaces(tabs);if(tabs.length===1)setWorkspaceId(String(tabs[0].id));}
  useEffect(()=>{refreshWorkspaces().catch(error=>setStatus(error.message));},[]);
  const origins=segment?[...new Set(session.steps.filter(step=>step.index>=segment.start_index&&step.index<=segment.end_index).map(step=>{try{return new URL(step.origin.url).origin;}catch{return 'invalid origin';}}))]:[];
  async function sendToBrowser(){if(!segment||!consent)return;setBusy(true);setStatus('Sending reviewed example to Sovereign…');try{const tabId=Number(workspaceId);if(!workspaces.some(tab=>tab.id===tabId))throw new Error('Choose an open Sovereign workspace.');const payload=reviewedSegment(session,segment.id,origins);const receipt=await sendReviewedToBrowser(tabId,payload);setStatus(`Saved ${receipt.steps??0} workflow steps in Sovereign. Review and test them there before running.`);setConsent(false);}catch(error){setStatus((error as Error).message);}finally{setBusy(false);}}
  async function connect() {
    try {
      const value = validateConnection(JSON.parse(connectionText));
      await chrome.storage.session.set({ sovereign_connection: value });
      setConnection(value); setConnectionText(''); setStatus('Connected to this private job.');
    } catch (error) { setStatus((error as Error).message); }
  }
  async function upload() {
    if (!connection || !segment || !consent) return;
    setBusy(true); setStatus('Sending reviewed segment…');
    try {
      validateConnection(connection);
      const payload = reviewedSegment(session, segment.id, connection.approved_origins);
      const body = JSON.stringify(payload);
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
      const stable = Array.from(new Uint8Array(hash), (v) => v.toString(16).padStart(2, '0')).join('');
      const response = await fetch(new URL(`/v1/jobs/${connection.job_id}/capture`, connection.endpoint), {
        method: 'POST', credentials: 'omit', redirect: 'error',
        headers: { Authorization: `Bearer ${connection.access_token}`, 'Content-Type': 'application/json', 'Idempotency-Key': `capture:${stable}` }, body,
      });
      if (!response.ok) throw new Error(`Sidekick did not accept the segment (${response.status}). Check scope, consent, or token expiry.`);
      const result = await response.json();
      setStatus(`${result.evidence_ids.length} example sent. Verify the outcome in your Sidekick workspace.`);
      setConsent(false);
    } catch (error) { setStatus((error as Error).message); }
    finally { setBusy(false); }
  }
  return <details className="shrink-0 border-b border-white/[0.06] px-4 py-3">
    <summary className="flex cursor-pointer items-center gap-2 text-xs text-green"><GraduationCap size={16} />Send to Sovereign</summary>
    <div className="mt-3 space-y-3 text-xs text-text-muted">
      <p>Sovereign runs in your browser. Send one reviewed example directly to its workspace, then review and qualify the proposed workflow there. No export file or second extension is needed. This feed is separate from Capture’s contributor sync; recordings still follow your Capture privacy settings.</p>
      <label className="field-label" htmlFor="browser-segment">Reviewed segment</label><select id="browser-segment" className="field" value={segment?.id??''} onChange={e=>setSegmentId(e.target.value)}>{session.segments.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select>
      <p>{segment?`${segment.end_index-segment.start_index+1} recorded events. Screenshots, sensitive values, query strings and other segments are excluded.`:'Create and label a segment first.'}</p>
      {origins.length>0&&<p className="break-all">Recorded sites: {origins.join(', ')}</p>}
      <label className="field-label" htmlFor="sovereign-browser">Open browser workspace</label><select id="sovereign-browser" className="field" value={workspaceId} onChange={e=>setWorkspaceId(e.target.value)}><option value="">Choose a Sovereign workspace</option>{workspaces.map(tab=><option key={tab.id} value={tab.id}>{tab.title||'Sovereign workspace'}</option>)}</select>
      <button type="button" className="text-green" onClick={()=>refreshWorkspaces().catch(error=>setStatus(error.message))}>Refresh open workspaces</button>
      <label className="flex items-start gap-2"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>I reviewed this segment and authorize sending this minimized example to the selected Sovereign workspace.</label>
      <button type="button" className="btn-secondary flex items-center gap-2" disabled={busy||!consent||!segment||!workspaceId} onClick={sendToBrowser}><PaperPlaneTilt size={14}/>Send reviewed example</button>
      <details><summary className="cursor-pointer">Advanced: paired private runtime</summary>
      {!connection ? <><label className="field-label" htmlFor="sovereign-connection">Connection JSON from your Sovereign workspace</label><textarea id="sovereign-connection" className="field font-mono text-xs" rows={3} value={connectionText} onChange={(e) => setConnectionText(e.target.value)} /><button className="btn-secondary" type="button" onClick={connect}>Connect job</button></> : <>
        <div className="flex items-center gap-2"><CheckCircle size={15} /><span className="break-all">{connection.job_id}</span></div>
        <label className="field-label" htmlFor="sovereign-segment">Reviewed segment</label><select id="sovereign-segment" className="field" value={segment?.id ?? ''} onChange={(e) => setSegmentId(e.target.value)}>{session.segments.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        {segment && <p>{segment.end_index - segment.start_index + 1} steps will be minimized; screenshots, sensitive fields, URL query strings, and all other segments are excluded. Out-of-scope steps block upload.</p>}
        <label className="flex items-start gap-2"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />I reviewed this segment and authorize sending it to the paired private job.</label>
        <div className="flex gap-3"><button className="btn-secondary flex items-center gap-2" disabled={busy || !consent || !segment} type="button" onClick={upload}><PaperPlaneTilt size={14} />Send to Sidekick</button><button className="text-text-muted" type="button" onClick={async () => { await chrome.storage.session.remove('sovereign_connection'); setConnection(null); }}>Disconnect locally</button></div>
      </>}
      </details>
      {status && <p role="status">{status}</p>}
    </div>
  </details>;
}
