import { Info, TagSimple } from '@phosphor-icons/react';
import { ACTION_ICON_COMPONENT } from '../shared/actionIcons';
import type { Session } from '../shared/types';
import { actionLabel, fmtDuration, hostOf } from '../shared/utils/format';
import { getSegmentColor } from './palette';

interface TimelineProps {
  session: Session;
  selectedIndex: number | null;
  rangeStart: number | null;
  rangeEnd: number | null;
  onStepSelect: (index: number) => void;
  onShiftStepSelect: (index: number) => void;
  onLabelRange?: () => void;
}

export function Timeline({
  session,
  selectedIndex,
  rangeStart,
  rangeEnd,
  onStepSelect,
  onShiftStepSelect,
  onLabelRange,
}: TimelineProps) {
  const handleClick = (index: number, e: React.MouseEvent) => {
    if (e.shiftKey && rangeStart !== null) {
      onShiftStepSelect(index);
    } else {
      onStepSelect(index);
    }
  };

  const getSegmentColorForStep = (index: number): string | null => {
    const segmentIndex = session.segments.findIndex(
      (seg) => index >= seg.start_index && index <= seg.end_index,
    );
    return segmentIndex >= 0 ? getSegmentColor(segmentIndex) : null;
  };

  const isInRange = (index: number): boolean => {
    if (rangeStart === null) return false;
    if (rangeEnd === null) return index === rangeStart;
    const [start, end] = rangeStart <= rangeEnd ? [rangeStart, rangeEnd] : [rangeEnd, rangeStart];
    return index >= start && index <= end;
  };

  const hasNoSegments = session.segments.length === 0;
  const hasRange = rangeStart !== null && rangeEnd !== null;
  const rangeCount = hasRange ? Math.abs((rangeEnd ?? 0) - (rangeStart ?? 0)) + 1 : 0;

  return (
    <div className="flex-1 overflow-y-auto py-2">
      {hasNoSegments && !hasRange && (
        <p className="flex items-start gap-2 px-4 pb-2 pt-1 text-xs text-text-muted">
          <Info size={14} className="mt-0.5 shrink-0" />
          Click a step, then shift+click another to mark the steps between them as a task.
        </p>
      )}
      {hasRange && onLabelRange && (
        <div className="px-3 pb-2">
          <button type="button" onClick={onLabelRange} className="btn-ghost w-full">
            <TagSimple size={16} />
            Name these {rangeCount} steps as a task
          </button>
        </div>
      )}
      <ol>
        {session.steps.map((step) => {
          const idx = step.index;
          const Icon = ACTION_ICON_COMPONENT[step.action.type];
          const prevStep = idx > 0 ? session.steps[idx - 1] : null;
          const gap = prevStep ? step.timestamp - prevStep.timestamp : 0;
          // Only mark real pauses, so the list isn't broken up between every step.
          const showDivider = gap > 30000;
          const segColor = getSegmentColorForStep(idx);
          const inRange = isInRange(idx);
          const selected = selectedIndex === idx;

          return (
            <li key={step.index}>
              {showDivider && (
                <p className="px-4 pb-1 pt-3 text-xs text-text-faint">{fmtDuration(gap)} later</p>
              )}
              <button
                type="button"
                onClick={(e) => handleClick(idx, e)}
                aria-pressed={selected}
                className={`flex w-full items-center gap-3 border-l-2 py-2 pl-3.5 pr-4 text-left transition-colors ${
                  selected
                    ? 'bg-white/[0.08]'
                    : inRange
                      ? 'bg-white/[0.04]'
                      : 'hover:bg-white/[0.03]'
                }`}
                style={{ borderLeftColor: segColor ?? 'transparent' }}
              >
                {Icon && <Icon size={16} className="shrink-0 text-text-muted" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-text">
                    {actionLabel(step.action)}
                  </span>
                  <span className="block truncate text-xs text-text-faint">
                    {hostOf(step.origin.url)}
                  </span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-text-faint">
                  {fmtDuration(step.timestamp - session.started_at)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
