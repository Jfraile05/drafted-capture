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
    <div className="border-b border-white/[0.06] px-4 py-3">
      <div className="card space-y-3 p-4">{children}</div>
    </div>
  );
}

function NoticeLine({ notice }: { notice: Notice }) {
  const color =
    notice.tone === 'error'
      ? 'text-coral'
      : notice.tone === 'ok'
        ? 'text-green'
        : 'text-text-muted';
  return (
    <output className={`flex items-start gap-2 text-sm ${color}`}>
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
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06]">
            <SignIn size={18} weight="duotone" className="text-text-muted" />
          </div>
          <div>
            <div className="font-semibold">Sign in to submit</div>
            <div className="text-sm text-text-muted">Open the popup and sign in to Drafted.</div>
          </div>
        </div>
      </Card>
    );
  }

  if (submitted) {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green/15">
            <CheckCircle size={20} weight="fill" className="text-green" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Submitted to Drafted</div>
            <div className="text-sm text-text-muted">
              {enrichedAt ? 'Labels added to the record' : 'Add your labels to improve it'}
            </div>
          </div>
          {score != null && (
            <div className="shrink-0 rounded-pill bg-green/15 px-3 py-1 text-center">
              <div className="text-base font-semibold leading-tight text-green">{score}</div>
              <div className="text-[10px] uppercase tracking-wide text-green/80">quality</div>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-btn border border-violet/30 bg-violet/15 px-4 py-2.5 text-sm font-medium text-violet transition-colors hover:bg-violet/25 disabled:opacity-50"
        >
          <Sparkle size={16} weight="fill" />
          {submitting ? 'Enriching...' : 'Enrich with my labels'}
        </button>
        {notice && <NoticeLine notice={notice} />}
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green/15">
          <CloudArrowUp size={20} weight="duotone" className="text-green" />
        </div>
        <div>
          <div className="font-semibold">Ready to submit</div>
          <div className="text-sm text-text-muted">Send this capture to Drafted.</div>
        </div>
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-btn bg-green px-4 py-2.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <CloudArrowUp size={16} weight="bold" />
        {submitting ? 'Submitting...' : 'Submit to Drafted'}
      </button>
      {notice && <NoticeLine notice={notice} />}
    </Card>
  );
}
