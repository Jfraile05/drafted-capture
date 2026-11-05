import { CheckCircle, CloudArrowUp, SignIn, Sparkle, WarningCircle } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
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
  error?: string;
  draftedTaskId?: string;
  qualityScore?: number | null;
}

interface Notice {
  tone: 'ok' | 'error' | 'info';
  text: string;
  /** Raw reason from the failure, shown small so it can be reported. */
  detail?: string;
}

/** "FirebaseError: Missing or insufficient permissions." -> the useful part. */
function shortReason(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw.replace(/^(Error|FirebaseError):\s*/i, '').slice(0, 140);
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="shrink-0 space-y-2 border-b border-white/[0.06] px-4 py-3">{children}</div>
  );
}

function NoticeLine({ notice }: { notice: Notice }) {
  const color =
    notice.tone === 'error'
      ? 'text-coral'
      : notice.tone === 'ok'
        ? 'text-[#00CA78]'
        : 'text-text-muted';
  return (
    <output className={`flex items-start gap-2 text-xs ${color}`}>
      {notice.tone === 'error' ? (
        <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0" />
      ) : (
        <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0" />
      )}
      <div>
        <div>{notice.text}</div>
        {notice.detail && <div className="mt-0.5 text-xs text-text-faint">{notice.detail}</div>}
      </div>
    </output>
  );
}

export function SubmitBar({ session, onSessionUpdate }: SubmitBarProps) {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const submitted = Boolean(session.submission?.drafted_task_id);
  const score = session.submission?.quality_score;
  const enrichedAt = session.submission?.last_enriched_at;

  const handleSubmit = async () => {
    setSubmitting(true);
    setNotice(null);
    try {
      const enrich = buildEnrichment(session);
      const res: SubmitOutcome = submitted
        ? await enrichArchivedSession(session.id, enrich)
        : await submitArchivedSession(session.id, enrich);
      if (res.ok) {
        setNotice({ tone: 'ok', text: submitted ? 'Record updated.' : 'Submitted.' });
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
        setNotice({ tone: 'info', text: 'Sign in from the popup to submit.' });
      } else {
        setNotice({
          tone: 'error',
          text: submitted ? "Couldn't update the record." : "Couldn't submit.",
          detail: shortReason(res.error),
        });
      }
    } catch (err) {
      setNotice({
        tone: 'error',
        text: 'Something went wrong. Try again.',
        detail: shortReason(String(err)),
      });
    }
    setSubmitting(false);
  };

  if (!user) {
    return (
      <Card>
        <p className="flex items-center gap-2 text-xs text-text-muted">
          <SignIn size={16} className="shrink-0" />
          Sign in from the popup to submit this session.
        </p>
      </Card>
    );
  }

  if (submitted) {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <CheckCircle size={18} weight="fill" className="shrink-0 text-[#00CA78]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text">
              Submitted{score != null ? `, quality ${score}` : ''}
            </p>
            <p className="text-xs text-text-muted">
              {enrichedAt ? 'Your labels are on the record.' : 'Add your labels to improve it.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="btn-ghost shrink-0 px-3 py-1.5 text-xs"
          >
            <Sparkle size={14} weight="fill" />
            {submitting ? 'Adding' : 'Add labels'}
          </button>
        </div>
        {notice && <NoticeLine notice={notice} />}
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text">Not submitted yet</p>
          <p className="text-xs text-text-muted">Send this session to your Drafted account.</p>
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="btn-primary shrink-0 px-3 py-1.5 text-xs"
        >
          <CloudArrowUp size={14} weight="bold" />
          {submitting ? 'Submitting' : 'Submit'}
        </button>
      </div>
      {notice && <NoticeLine notice={notice} />}
    </Card>
  );
}
