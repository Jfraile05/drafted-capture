import { CloudArrowUp, DownloadSimple, Sparkle, Trash } from '@phosphor-icons/react';
import { useState } from 'react';
import { sendMessage } from '../shared/hooks';
import { enrichArchivedSession, submitArchivedSession } from '../shared/submitManager';
import type { ExportFormatFlags, Session } from '../shared/types';
import { buildEnrichment } from './enrichment';

interface ExportProps {
  session: Session;
  onDelete: () => void;
}

interface SubmitOutcome {
  ok: boolean;
  reason?: string;
  draftedTaskId?: string;
  qualityScore?: number | null;
}

export function Export({ session, onDelete }: ExportProps) {
  const [formats, setFormats] = useState<ExportFormatFlags>({
    anthropic: true,
    openai: true,
    universal: true,
    trajectory: true,
  });
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const submitted = Boolean(session.submission?.drafted_task_id);

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const enrich = buildEnrichment(session);
      // Runs in the panel (a DOM context) where Firebase auth is reliable.
      const res: SubmitOutcome = submitted
        ? await enrichArchivedSession(session.id, enrich)
        : await submitArchivedSession(session.id, enrich);
      if (res.ok) {
        setSubmitMsg(submitted ? 'Record updated on Drafted.' : 'Submitted to Drafted.');
      } else if (res.reason === 'not_signed_in') {
        setSubmitMsg('Sign in from the popup to submit.');
      } else {
        setSubmitMsg('Submission failed. Try again.');
      }
    } catch {
      setSubmitMsg('Submission failed. Try again.');
    }
    setSubmitting(false);
  };

  const toggleFormat = (key: keyof ExportFormatFlags) => {
    setFormats((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await sendMessage('EXPORT_SESSION', {
        id: session.id,
        formats,
      });
    } catch (err) {
      console.error('Failed to export:', err);
    }
    setExporting(false);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await sendMessage('DELETE_SESSION', { id: session.id });
      onDelete();
    } catch (err) {
      console.error('Failed to delete:', err);
      setDeleting(false);
    }
  };

  const formatLabels: Record<keyof ExportFormatFlags, string> = {
    anthropic: 'Anthropic format',
    openai: 'OpenAI format',
    universal: 'Universal JSON',
    trajectory: 'Trajectory triples',
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CloudArrowUp size={18} weight="duotone" className="text-green" />
          <span className="text-sm font-medium text-text">Drafted training data</span>
        </div>
        {submitted ? (
          <div className="text-xs text-text-muted">
            Submitted to your Drafted account
            {session.submission?.quality_score != null
              ? ` · quality ${session.submission.quality_score}`
              : ''}
            . Label steps in the timeline, then enrich to add your reasoning.
          </div>
        ) : (
          <div className="text-xs text-text-muted">
            Saves this session to your Drafted account in the same lab format as the browser tasks,
            with capturedFromExtension set. Sign in from the popup first.
          </div>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green/20 text-green rounded-btn hover:bg-green/30 transition-colors disabled:opacity-50"
        >
          {submitted ? (
            <Sparkle size={20} weight="regular" />
          ) : (
            <CloudArrowUp size={20} weight="regular" />
          )}
          {submitting ? 'Working...' : submitted ? 'Enrich with my labels' : 'Submit to Drafted'}
        </button>
        {submitMsg && <div className="text-xs text-text-muted">{submitMsg}</div>}
      </div>

      <div className="card p-4 space-y-3">
        <div className="text-sm font-medium text-text">Export formats</div>
        <div className="space-y-2">
          {(Object.keys(formats) as (keyof ExportFormatFlags)[]).map((key) => (
            <label key={key} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formats[key]}
                onChange={() => toggleFormat(key)}
                className="w-4 h-4 rounded border-white/[0.06] bg-bg-input text-green focus:ring-green/30"
              />
              <span className="text-sm text-text">{formatLabels[key]}</span>
            </label>
          ))}
        </div>

        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || !Object.values(formats).some((v) => v)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green/20 text-green rounded-btn hover:bg-green/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <DownloadSimple size={20} weight="regular" />
          {exporting ? 'Exporting...' : 'Download .zip'}
        </button>
      </div>

      <div className="card p-4 space-y-3">
        <div className="text-sm font-medium text-coral">Danger zone</div>
        <div className="text-xs text-text-muted">
          Deleting this session will remove all steps, segments, and screenshots. This cannot be
          undone.
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-coral/20 text-coral rounded-btn hover:bg-coral/30 transition-colors disabled:opacity-50"
        >
          <Trash size={20} weight="regular" />
          {deleting ? 'Deleting...' : 'Delete session'}
        </button>
      </div>
    </div>
  );
}
