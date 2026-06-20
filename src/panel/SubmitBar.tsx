import { CheckCircle, CloudArrowUp, SignIn, Sparkle } from '@phosphor-icons/react';
import { useState } from 'react';
import { useAuth } from '../shared/auth';
import { enrichArchivedSession, submitArchivedSession } from '../shared/submitManager';
import type { Session } from '../shared/types';
import { buildEnrichment } from './enrichment';

interface SubmitBarProps {
  session: Session;
  onSessionUpdate: (session: Session) => void;
}

interface SubmitOutcome {
  ok: boolean;
  reason?: string;
  draftedTaskId?: string;
  qualityScore?: number | null;
}

export function SubmitBar({ session, onSessionUpdate }: SubmitBarProps) {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const submitted = Boolean(session.submission?.drafted_task_id);

  const handleSubmit = async () => {
    setSubmitting(true);
    setMsg(null);
    try {
      const enrich = buildEnrichment(session);
      const res: SubmitOutcome = submitted
        ? await enrichArchivedSession(session.id, enrich)
        : await submitArchivedSession(session.id, enrich);
      if (res.ok) {
        setMsg(submitted ? 'Record updated.' : 'Submitted.');
        // Refresh session state to pick up the submission field.
        const updated = { ...session };
        if (!submitted && res.draftedTaskId) {
          updated.submission = {
            drafted_task_id: res.draftedTaskId,
            submitted_at: new Date().toISOString(),
            quality_score: res.qualityScore ?? null,
            last_enriched_at: null,
          };
        } else if (submitted) {
          if (updated.submission) {
            updated.submission.last_enriched_at = new Date().toISOString();
          }
        }
        onSessionUpdate(updated);
      } else if (res.reason === 'not_signed_in') {
        setMsg('Sign in from the popup to submit.');
      } else {
        setMsg('Failed. Try again.');
      }
    } catch {
      setMsg('Failed. Try again.');
    }
    setSubmitting(false);
  };

  if (!user) {
    return (
      <div className="border-b border-white/[0.06] bg-bg-card px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <SignIn size={16} weight="regular" className="text-text-faint" />
          Sign in from the popup to submit
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="border-b border-white/[0.06] bg-bg-card px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle size={16} weight="fill" className="text-green" />
          <span className="text-green">
            Submitted
            {session.submission?.quality_score != null
              ? ` (quality ${session.submission.quality_score})`
              : ''}
          </span>
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="flex items-center gap-2 px-3 py-1.5 bg-violet/20 text-violet text-sm rounded-btn hover:bg-violet/30 transition-colors disabled:opacity-50"
        >
          <Sparkle size={14} weight="regular" />
          {submitting ? 'Enriching...' : 'Enrich with my labels'}
        </button>
        {msg && <div className="text-xs text-text-muted ml-2">{msg}</div>}
      </div>
    );
  }

  return (
    <div className="border-b border-white/[0.06] bg-bg-card px-4 py-2 flex items-center justify-between">
      <div className="text-sm text-text-muted">Ready to submit to Drafted</div>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="flex items-center gap-2 px-3 py-1.5 bg-green/20 text-green text-sm rounded-btn hover:bg-green/30 transition-colors disabled:opacity-50"
      >
        <CloudArrowUp size={14} weight="regular" />
        {submitting ? 'Submitting...' : 'Submit to Drafted'}
      </button>
      {msg && <div className="text-xs text-text-muted ml-2">{msg}</div>}
    </div>
  );
}
