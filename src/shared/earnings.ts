import { activeOffset } from './activeTime';
import type { Session } from './types';
import { annotationAvailable } from './workflows';

export interface SessionEarnings {
  currency: 'USD';
  active_ms: number;
  rate_cents_per_hour: number;
  base_earnings_micro_usd: number;
  annotation_bonus_micro_usd?: number;
  total_earnings_micro_usd?: number;
}

export interface EarningsSummary {
  active_ms: number;
  base_earnings_micro_usd: number;
  session_count: number;
  annotation_bonus_micro_usd?: number;
  total_earnings_micro_usd?: number;
}

/** The same estimate is used by the dashboard and the uploaded capture record. */
export function earningsForSession(session: Session): SessionEarnings | null {
  const rate = session.metadata.workflow?.hourly_rate_cents;
  if (rate === undefined || !Number.isSafeInteger(rate) || rate < 0) return null;
  if (
    !Number.isSafeInteger(session.started_at) ||
    !Number.isSafeInteger(session.ended_at) ||
    session.ended_at < session.started_at
  )
    return null;
  const activeMs = activeOffset(session.started_at, session.pauses, session.ended_at);
  const workflow = session.metadata.workflow;
  const bonus =
    workflow?.annotation_opted_in && annotationAvailable(workflow)
      ? workflow.annotation_rate_cents
      : 0;
  return earningsForActiveTime(activeMs, rate, bonus);
}

export function earningsForActiveTime(
  activeMs: number,
  rate: number | null,
  bonusRate = 0,
): SessionEarnings | null {
  if (
    rate === null ||
    !Number.isSafeInteger(rate) ||
    rate < 0 ||
    !Number.isSafeInteger(activeMs) ||
    activeMs < 0
  )
    return null;
  if (!Number.isSafeInteger(activeMs * rate)) return null;
  const base = Math.round((activeMs * rate) / 360);
  const bonus =
    Number.isSafeInteger(bonusRate) && bonusRate > 0 && Number.isSafeInteger(activeMs * bonusRate)
      ? Math.round((activeMs * bonusRate) / 360)
      : 0;
  return {
    currency: 'USD',
    active_ms: activeMs,
    rate_cents_per_hour: rate,
    // One cent is 10,000 microdollars; one hour is 3,600,000 milliseconds.
    // Keep sub-cent credit when adding short sessions, then format the total.
    base_earnings_micro_usd: base,
    ...(bonusRate > 0
      ? { annotation_bonus_micro_usd: bonus, total_earnings_micro_usd: base + bonus }
      : {}),
  };
}

export function summarizeEarnings(
  sessions: Session[],
  uid: string,
  localOnly: boolean,
): EarningsSummary {
  const total: EarningsSummary = { active_ms: 0, base_earnings_micro_usd: 0, session_count: 0 };
  if (!uid) return total;
  for (const session of sessions) {
    if (session.metadata.owner_uid !== uid) continue;
    if (!!session.metadata.workflow?.local_only !== localOnly) continue;
    const earnings = earningsForSession(session);
    if (!earnings) continue;
    total.active_ms += earnings.active_ms;
    total.base_earnings_micro_usd += earnings.base_earnings_micro_usd;
    total.session_count++;
    if (earnings.annotation_bonus_micro_usd !== undefined) {
      total.annotation_bonus_micro_usd =
        (total.annotation_bonus_micro_usd ?? 0) + earnings.annotation_bonus_micro_usd;
    }
  }
  if (total.annotation_bonus_micro_usd !== undefined)
    total.total_earnings_micro_usd =
      total.base_earnings_micro_usd + total.annotation_bonus_micro_usd;
  return total;
}

export function formatEarnings(microUsd: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    microUsd / 1_000_000,
  );
}

export function formatHours(activeMs: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(activeMs / 3_600_000);
}
