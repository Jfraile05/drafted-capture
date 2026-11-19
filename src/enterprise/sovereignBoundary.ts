import type { Session } from '../shared/types';
export interface SovereignConnection {
  schema: 'sidekick.capture.connection.v1'; endpoint: string; job_id: string;
  access_token: string; expires: number; approved_origins: string[];
}
export function validateConnection(value: SovereignConnection): SovereignConnection {
  const url = new URL(value.endpoint);
  if (value.schema !== 'sidekick.capture.connection.v1' || !/^job_[a-f0-9]{32}$/.test(value.job_id) || !value.access_token || value.expires <= Date.now() / 1000 || !Array.isArray(value.approved_origins)) throw new Error('Use a current job-scoped connection from Sovereign.');
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new Error('The connection must use HTTPS or loopback, without credentials in the URL.');
  return value;
}
const scrub = (text: string | null | undefined) => String(text ?? '').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]').replace(/\b(?:\d[ -]?){13,19}\b/g, '[card]').replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[ssn]').slice(0, 1000);
const approvedOrigin = (value: string) => value.includes('://') ? new URL(value).origin : value === '127.0.0.1' || value === 'localhost' ? 'http://127.0.0.1:8791' : 'https://' + value;
export function reviewedSegment(session: Session, segmentId: string, origins: string[]) {
  const segment = session.segments.find((s) => s.id === segmentId);
  if (!segment) throw new Error('Select one complete reviewed segment.');
  const selected = session.steps.filter((s) => s.index >= segment.start_index && s.index <= segment.end_index);
  if (!selected.length) throw new Error('The segment has no recorded steps.');
  for (const step of selected) {
    if (!origins.map(approvedOrigin).includes(new URL(step.origin.url).origin)) throw new Error('A segment step is outside this job’s approved origins.');
    if (step.action.url && !origins.map(approvedOrigin).includes(new URL(step.action.url).origin)) throw new Error('A navigation leaves this job’s approved origins.');
  }
  const steps = selected.map((step) => {
    const url = new URL(step.origin.url);
    const sensitive = step.dom?.sensitive || /password|card|credit|secret|token|otp|ssn/i.test([step.dom?.input_type, step.dom?.field_label].join(' '));
    const action = { ...step.action };
    if (action.text) action.text = sensitive ? '[sensitive]' : scrub(action.text);
    if (action.url) { const target = new URL(action.url); action.url = target.origin + target.pathname; }
    return { index: step.index, timestamp: step.timestamp, action, screenshot: null,
      origin: { url: url.origin + url.pathname, title: '', tab_id: step.origin.tab_id, frame_id: step.origin.frame_id },
      dom: { tag: step.dom?.tag, text: scrub(step.dom?.text), aria_label: scrub(step.dom?.aria_label || step.dom?.field_label), aria_role: step.dom?.aria_role, sensitive: !!sensitive },
      annotation: step.annotation ? { rating: step.annotation.rating, notes: scrub(step.annotation.notes) } : null };
  });
  const value = { id: `${session.id}:${segment.id}`, source: 'human', steps, segments: [{ id: segment.id, start_index: segment.start_index, end_index: segment.end_index, label: scrub(segment.label), notes: scrub(segment.notes) }] };
  if (new TextEncoder().encode(JSON.stringify(value)).length > 1_000_000) throw new Error('Reviewed segment exceeds 1 MB. Choose a shorter segment.');
  return value;
}
