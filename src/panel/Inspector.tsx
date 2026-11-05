import { CheckCircle, Target } from '@phosphor-icons/react';
import { useState } from 'react';
import { ANNOTATION_TAGS } from '../shared/constants';
import { sendMessage } from '../shared/hooks';
import type { Annotation, AnnotationRating, Session } from '../shared/types';
import { truncate } from '../shared/utils/format';
import { useScreenshot } from './useScreenshot';

interface InspectorProps {
  session: Session;
  stepIndex: number;
  rangeStart: number | null;
  rangeEnd: number | null;
  onSetRangeEnd: () => void;
  onClearRange: () => void;
  onSessionUpdate: (session: Session) => void;
}

export function Inspector({
  session,
  stepIndex,
  rangeStart,
  rangeEnd,
  onSetRangeEnd,
  onClearRange,
  onSessionUpdate,
}: InspectorProps) {
  const step = session.steps[stepIndex];
  const screenshotUrl = useScreenshot(step?.screenshot?.hash);

  const [rating, setRating] = useState<AnnotationRating>(step?.annotation?.rating ?? 'correct');
  const [tags, setTags] = useState<string[]>(step?.annotation?.tags ?? []);
  const [notes, setNotes] = useState(step?.annotation?.notes ?? '');
  const [saving, setSaving] = useState(false);

  if (!step) return null;

  const handleSaveAnnotation = async () => {
    setSaving(true);
    const annotation: Annotation = {
      rating,
      tags: tags as Annotation['tags'],
      notes,
      annotator: 'user',
    };
    try {
      const updated = await sendMessage<Session>('UPDATE_ANNOTATION', {
        sessionId: session.id,
        stepIndex,
        annotation,
      });
      onSessionUpdate(updated);
    } catch (err) {
      console.error('Failed to save annotation:', err);
    }
    setSaving(false);
  };

  const toggleTag = (tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const coord = step.action.coordinate;
  let crosshairStyle: React.CSSProperties = {};
  if (coord && step.screenshot && screenshotUrl) {
    const dpr = step.screenshot.dpr;
    const imgW = step.screenshot.width;
    const imgH = step.screenshot.height;
    const pixelX = coord[0] * dpr;
    const pixelY = coord[1] * dpr;
    const leftPercent = (pixelX / imgW) * 100;
    const topPercent = (pixelY / imgH) * 100;
    crosshairStyle = { left: `${leftPercent}%`, top: `${topPercent}%` };
  }

  return (
    <div className="max-h-[60vh] shrink-0 space-y-5 overflow-y-auto border-t border-white/[0.08] bg-bg-input px-4 py-4">
      {rangeStart !== null && (
        <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
          <span>
            {rangeEnd === null
              ? `Task starts at step ${rangeStart}`
              : `Steps ${Math.min(rangeStart, rangeEnd)} to ${Math.max(rangeStart, rangeEnd)} selected`}
          </span>
          <span className="flex gap-1">
            {rangeEnd === null && (
              <button type="button" onClick={onSetRangeEnd} className="chip">
                End task here
              </button>
            )}
            <button type="button" onClick={onClearRange} className="chip">
              Clear
            </button>
          </span>
        </div>
      )}

      {screenshotUrl ? (
        <div className="relative w-full">
          <img
            src={screenshotUrl}
            alt={`Screenshot of step ${stepIndex}`}
            className="h-auto w-full rounded-btn border border-white/[0.06]"
          />
          {coord && (
            <div
              className="absolute"
              style={{ ...crosshairStyle, transform: 'translate(-50%, -50%)' }}
            >
              <Target size={24} weight="bold" className="text-white drop-shadow" />
            </div>
          )}
        </div>
      ) : (
        <p className="flex h-24 items-center justify-center rounded-btn border border-dashed border-white/10 text-xs text-text-faint">
          No screenshot for this step
        </p>
      )}

      <section>
        <h2 className="mb-2 text-xs font-medium text-text-muted">Details</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
          <dt className="text-text-faint">Action</dt>
          <dd className="capitalize text-text">{step.action.type.replace('_', ' ')}</dd>
          {coord && (
            <>
              <dt className="text-text-faint">Position</dt>
              <dd className="tabular-nums text-text">
                {Math.round(coord[0])}, {Math.round(coord[1])}
              </dd>
            </>
          )}
          {step.action.text && (
            <>
              <dt className="text-text-faint">Text</dt>
              <dd className="break-words font-mono text-text">{truncate(step.action.text, 200)}</dd>
            </>
          )}
          {step.action.key && (
            <>
              <dt className="text-text-faint">Key</dt>
              <dd className="font-mono text-text">
                {[...(step.action.modifier_keys ?? []), step.action.key].join(' + ')}
              </dd>
            </>
          )}
          {step.dom && (
            <>
              <dt className="text-text-faint">Element</dt>
              <dd className="text-text">
                <span className="font-mono">&lt;{step.dom.tag}&gt;</span>
                {step.dom.aria_label ? ` "${truncate(step.dom.aria_label, 60)}"` : ''}
                {step.dom.aria_role ? `, ${step.dom.aria_role}` : ''}
              </dd>
              <dt className="text-text-faint">Selector</dt>
              <dd className="break-all font-mono text-text-muted">
                {truncate(step.dom.selector, 150)}
              </dd>
              <dt className="text-text-faint">State</dt>
              <dd className="text-text-muted">
                {step.dom.visible ? 'Visible' : 'Hidden'},{' '}
                {step.dom.interactive ? 'interactive' : 'not interactive'}
              </dd>
            </>
          )}
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-medium text-text-muted">Was this step right?</h2>
        <div className="flex flex-wrap gap-1.5">
          {(['correct', 'suboptimal', 'incorrect', 'unclear'] as AnnotationRating[]).map((r) => (
            <button
              type="button"
              key={r}
              onClick={() => setRating(r)}
              aria-pressed={rating === r}
              className={`chip capitalize ${rating === r ? 'chip-on' : ''}`}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ANNOTATION_TAGS.map((t) => (
            <button
              type="button"
              key={t.value}
              onClick={() => toggleTag(t.value)}
              aria-pressed={tags.includes(t.value)}
              className={`chip ${tags.includes(t.value) ? 'chip-on' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label htmlFor="step-notes" className="sr-only">
          Notes
        </label>
        <textarea
          id="step-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="field resize-none"
          rows={2}
        />
        <button
          type="button"
          onClick={handleSaveAnnotation}
          disabled={saving}
          className="btn-primary w-full"
        >
          <CheckCircle size={16} />
          {saving ? 'Saving' : 'Save label'}
        </button>
      </section>
    </div>
  );
}
