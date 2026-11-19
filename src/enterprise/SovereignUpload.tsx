import { GraduationCap, CheckCircle, PaperPlaneTilt } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import type { Session } from '../shared/types';
import { reviewedSegment, validateConnection, type SovereignConnection } from './sovereignBoundary';

/** Explicit enterprise destination. This handler has no contributor-sync fallback. */
export function SovereignUpload({ session }: { session: Session }) {
  const [connection, setConnection] = useState<SovereignConnection | null>(null);
  const [connectionText, setConnectionText] = useState('');
  const [segmentId, setSegmentId] = useState('');
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const segment = session.segments.find((s) => s.id === segmentId) ?? session.segments[0];
  useEffect(() => {
    chrome.storage.session.get('sovereign_connection').then((value) => {
      if (value.sovereign_connection?.expires > Date.now() / 1000) {
        setConnection(value.sovereign_connection);
      }
    });
  }, []);
  useEffect(() => { setConsent(false); setStatus(''); }, [session.id, segment?.id]);
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
    <summary className="flex cursor-pointer items-center gap-2 text-xs text-green"><GraduationCap size={16} />Teach my private Sidekick</summary>
    <div className="mt-3 space-y-3 text-xs text-text-muted">
      <p>This sends a reviewed segment to Sovereign. It is separate from this recorder’s existing contributor sync. For capture that never enters contributor storage, use the dedicated Sovereign extension.</p>
      {!connection ? <><label className="field-label" htmlFor="sovereign-connection">Connection JSON from your Sovereign workspace</label><textarea id="sovereign-connection" className="field font-mono text-xs" rows={3} value={connectionText} onChange={(e) => setConnectionText(e.target.value)} /><button className="btn-secondary" type="button" onClick={connect}>Connect job</button></> : <>
        <div className="flex items-center gap-2"><CheckCircle size={15} /><span className="break-all">{connection.job_id}</span></div>
        <label className="field-label" htmlFor="sovereign-segment">Reviewed segment</label><select id="sovereign-segment" className="field" value={segment?.id ?? ''} onChange={(e) => setSegmentId(e.target.value)}>{session.segments.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        {segment && <p>{segment.end_index - segment.start_index + 1} steps will be minimized; screenshots, sensitive fields, URL query strings, and all other segments are excluded. Out-of-scope steps block upload.</p>}
        <label className="flex items-start gap-2"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />I reviewed this segment and authorize sending it to the paired private job.</label>
        <div className="flex gap-3"><button className="btn-secondary flex items-center gap-2" disabled={busy || !consent || !segment} type="button" onClick={upload}><PaperPlaneTilt size={14} />Send to Sidekick</button><button className="text-text-muted" type="button" onClick={async () => { await chrome.storage.session.remove('sovereign_connection'); setConnection(null); }}>Disconnect locally</button></div>
      </>}
      {status && <p role="status">{status}</p>}
    </div>
  </details>;
}
