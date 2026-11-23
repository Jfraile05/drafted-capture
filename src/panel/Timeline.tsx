import { ArrowDown, ArrowUp, Info, TagSimple } from '@phosphor-icons/react';
import { useEffect, useRef } from 'react';
import { ACTION_ICON_COMPONENT } from '../shared/actionIcons';
import { activeOffset } from '../shared/activeTime';
import type { StepNote } from '../shared/quality';
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
  /** Steps the quality review said raised or lowered the score. */
  stepNotes?: StepNote[];
}

export function Timeline({
  session,
  selectedIndex,
  rangeStart,
  rangeEnd,
  onStepSelect,
  onShiftStepSelect,
  onLabelRange,
  stepNotes = [],
}: TimelineProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const notes = new Map(stepNotes.map((note) => [note.step, note]));

  // Coming back from a step's details: show that step instead of the top.
  useEffect(() => {
    if (selectedIndex === null) return;
    listRef.current
      ?.querySelector(`[data-step="${selectedIndex}"]`)
      ?.scrollIntoView({ block: 'center' });
  }, [selectedIndex]);

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
          Click a step to see its screenshot. Shift-click a second step to group the steps between
          them into a task.
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
      <ol ref={listRef}>
        {session.steps.map((step) => {
          const idx = step.index;
          const Icon = ACTION_ICON_COMPONENT[step.action.type];
          const prevStep = idx > 0 ? session.steps[idx - 1] : null;
          const gap = prevStep ? step.timestamp - prevStep.timestamp : 0;
          // Only mark real pauses, so the list isn't broken up between every step.
          const showDivider = gap > 30000;
          // Name the site once when it changes, not on every row.
          const host = hostOf(step.origin.url);
          const hostChanged = !prevStep || hostOf(prevStep.origin.url) !== host;
          const showHost = hostChanged;
          const segColor = getSegmentColorForStep(idx);
          const inRange = isInRange(idx);
          const selected = selectedIndex === idx;
          const note = notes.get(idx);

          return (
            <li key={step.index}>
              {(showDivider || showHost) && (
                <p className="flex items-center gap-2 px-4 pb-1 pt-3 text-xs text-text-faint">
                  {showHost && <span className="truncate font-medium text-text-muted">{host}</span>}
                  {showDivider && <span className="shrink-0">{fmtDuration(gap)} later</span>}
                </p>
              )}
              <button
                type="button"
                data-step={idx}
                onClick={(e) => handleClick(idx, e)}
                aria-pressed={selected}
                className={`flex w-[calc(100%-0.5rem)] items-center gap-3 rounded-r-[12px] border-l-2 py-2.5 pl-3.5 pr-3.5 text-left transition-[background-color,box-shadow,transform] duration-200 active:scale-[0.99] ${
                  selected ? 'row-on' : inRange ? 'bg-ink/[0.05]' : 'hover:bg-ink/[0.04]'
                }`}
                style={{ borderLeftColor: segColor ?? 'transparent' }}
              >
                {Icon && <Icon size={16} className="shrink-0 text-text-muted" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-text">
                    {actionLabel(step.action, step.dom)}
                  </span>
                  {note && (
                    <span
                      className={`mt-0.5 flex items-start gap-1 text-xs ${note.effect === 'up' ? 'text-green' : 'text-coral'}`}
                    >
                      {note.effect === 'up' ? (
                        <ArrowUp
                          size={12}
                          weight="bold"
                          className="mt-0.5 shrink-0"
                          aria-label="Raised quality"
                        />
                      ) : (
                        <ArrowDown
                          size={12}
                          weight="bold"
                          className="mt-0.5 shrink-0"
                          aria-label="Lowered quality"
                        />
                      )}
                      {note.note}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-text-faint">
                  {fmtDuration(activeOffset(session.started_at, session.pauses, step.timestamp))}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
