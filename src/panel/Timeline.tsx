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
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      {hasNoSegments && (
        <div className="card p-3 flex items-start gap-3 bg-violet/5 border border-violet/20">
          <Info size={18} weight="regular" className="text-violet flex-shrink-0 mt-0.5" />
          <div className="text-sm text-text-muted">
            <div className="font-medium text-text mb-1">No segments yet</div>
            Select a step, then shift+click another to mark a task, or label the whole session in
            Segments.
          </div>
        </div>
      )}
      {hasRange && onLabelRange && (
        <button
          type="button"
          onClick={onLabelRange}
          className="w-full card p-3 hover:bg-bg-card-hover transition-colors flex items-center gap-3"
        >
          <TagSimple size={18} weight="regular" className="text-violet flex-shrink-0" />
          <div className="text-sm font-medium text-text">Label these {rangeCount} steps</div>
        </button>
      )}
      {session.steps.map((step) => {
        const idx = step.index;
        const Icon = ACTION_ICON_COMPONENT[step.action.type];
        const prevStep = idx > 0 ? session.steps[idx - 1] : null;
        const gap = prevStep ? step.timestamp - prevStep.timestamp : 0;
        const showDivider = gap > 2000;
        const segColor = getSegmentColorForStep(idx);
        const inRange = isInRange(idx);

        return (
          <div key={step.index}>
            {showDivider && idx > 0 && (
              <div className="flex items-center gap-2 py-2">
                <div className="flex-1 h-px bg-white/[0.04]" />
                <div className="text-xs text-text-faint">{fmtDuration(gap)}</div>
                <div className="flex-1 h-px bg-white/[0.04]" />
              </div>
            )}
            <button
              type="button"
              onClick={(e) => handleClick(idx, e)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-btn transition-colors text-left ${
                selectedIndex === idx
                  ? 'bg-green/10 border border-green/30'
                  : inRange
                    ? 'bg-violet/10 border border-violet/30'
                    : 'hover:bg-bg-card border border-transparent'
              }`}
            >
              <div
                className="w-0.5 h-8 rounded-full"
                style={{
                  backgroundColor: segColor ?? 'rgba(255,255,255,0.08)',
                }}
              />
              {Icon && (
                <Icon size={18} weight="regular" className="text-text-muted flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-text truncate">{actionLabel(step.action)}</div>
                <div className="text-xs text-text-muted truncate">{hostOf(step.origin.url)}</div>
              </div>
              <div className="text-xs text-text-faint flex-shrink-0">
                {fmtDuration(step.timestamp - session.started_at)}
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}
