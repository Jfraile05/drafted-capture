import { useEffect, useState } from 'react';
import { type EarningsSummary, formatEarnings, formatHours } from '../shared/earnings';
import { sendMessage } from '../shared/hooks';
import { type QualitySummary, qualityColor } from '../shared/quality';
import { ARCHIVED_SESSION_CHANGE } from '../shared/storage/sessionUpdates';
import { fmtDuration } from '../shared/utils/format';

export default function EarningsDashboard({ uid, localOnly }: { uid: string; localOnly: boolean }) {
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [quality, setQuality] = useState<QualitySummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry starts a fresh read after a storage error.
  useEffect(() => {
    let closed = false;
    let version = 0;
    setSummary(null);
    setFailed(false);
    const refresh = async () => {
      const request = ++version;
      try {
        const result = await sendMessage<EarningsSummary>('GET_EARNINGS', { uid, localOnly });
        if (closed || request !== version) return;
        setSummary(result);
        setFailed(false);
        // Reviews arrive a little after upload and need the network, so they
        // never hold up or fail the money and hours.
        const reviewed = await sendMessage<QualitySummary>('GET_QUALITY', { uid, localOnly }).catch(
          () => null,
        );
        if (!closed && request === version) setQuality(reviewed);
      } catch {
        if (closed || request !== version) return;
        setSummary(null);
        setFailed(true);
      }
    };
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'session' && changes[ARCHIVED_SESSION_CHANGE]) void refresh();
    };
    chrome.storage.onChanged.addListener(onChange);
    window.addEventListener('focus', refresh);
    void refresh();
    return () => {
      closed = true;
      chrome.storage.onChanged.removeListener(onChange);
      window.removeEventListener('focus', refresh);
    };
  }, [uid, localOnly, retry]);

  return (
    <section
      aria-label="Earnings summary"
      aria-busy={!summary && !failed}
      className="mt-5 border-b border-white/[0.06] pb-4"
    >
      <dl className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] items-end gap-3">
        <div>
          <dt className="mb-1.5 text-xs text-text-muted">Estimated earnings</dt>
          <dd
            className="truncate text-[30px] font-semibold leading-none tracking-tight tabular-nums text-text"
            title={
              summary
                ? formatEarnings(
                    summary.total_earnings_micro_usd ?? summary.base_earnings_micro_usd,
                  )
                : undefined
            }
          >
            {summary
              ? formatEarnings(summary.total_earnings_micro_usd ?? summary.base_earnings_micro_usd)
              : failed
                ? 'N/A'
                : '...'}
          </dd>
        </div>
        <div>
          <dt className="mb-1.5 text-xs text-text-muted">Active hours</dt>
          <dd
            className="truncate text-[22px] font-medium leading-none tracking-tight tabular-nums text-text"
            title={summary ? `${fmtDuration(summary.active_ms)} recorded` : undefined}
          >
            {summary ? formatHours(summary.active_ms) : failed ? 'N/A' : '...'}
          </dd>
        </div>
        <div className="text-right">
          <dt className="mb-1.5 text-xs text-text-muted">Quality</dt>
          <dd
            className={`truncate text-[22px] font-medium leading-none tracking-tight tabular-nums ${qualityColor(quality?.average)}`}
            title={qualityTitle(quality)}
          >
            {quality?.average ?? (quality ? 'Soon' : '...')}
          </dd>
        </div>
      </dl>
      {summary?.annotation_bonus_micro_usd !== undefined && (
        <p className="mt-2 text-xs text-text-muted">
          Base {formatEarnings(summary.base_earnings_micro_usd)} · Annotation bonus{' '}
          {formatEarnings(summary.annotation_bonus_micro_usd)}
        </p>
      )}
      {failed ? (
        <p className="mt-2 flex items-center justify-between text-xs text-text-muted" role="alert">
          Totals couldn't load.
          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
            className="font-medium text-text hover:underline"
          >
            Try again
          </button>
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-text-faint">
          {localOnly
            ? 'Local estimate from saved tasks.'
            : 'Estimate from your tasks sent to Drafted.'}{' '}
          Pay is based on your active time. Open the review panel to see what raised or lowered each
          quality score.
        </p>
      )}
    </section>
  );
}

function qualityTitle(quality: QualitySummary | null): string | undefined {
  if (!quality) return undefined;
  const parts = [];
  if (quality.reviewed)
    parts.push(
      `Average of ${quality.reviewed} reviewed ${quality.reviewed === 1 ? 'task' : 'tasks'} out of 100`,
    );
  if (quality.waiting) parts.push(`${quality.waiting} still being reviewed`);
  return parts.join('. ') || 'Quality shows up a few minutes after a task uploads.';
}
