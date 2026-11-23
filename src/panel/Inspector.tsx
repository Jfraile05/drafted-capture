import { CheckCircle, Target } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { ANNOTATION_TAGS } from '../shared/constants';
import { sendMessage } from '../shared/hooks';
import type { Annotation, AnnotationRating, Session } from '../shared/types';
import { categoryLabel, siteForOrigin } from '../shared/urlCategories';
import { actionLabel, truncate } from '../shared/utils/format';
import { nearestScreenshotIndex } from './nearestScreenshot';
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
  const shotIndex = nearestScreenshotIndex(session.steps, stepIndex);
  const shot = shotIndex === null ? null : session.steps[shotIndex].screenshot;
  const borrowed = shotIndex !== null && shotIndex !== stepIndex;
  const screenshotUrl = useScreenshot(shot?.hash);

  const [rating, setRating] = useState<AnnotationRating>(step?.annotation?.rating ?? 'correct');
  const [tags, setTags] = useState<string[]>(step?.annotation?.tags ?? []);
  const [notes, setNotes] = useState(step?.annotation?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const savingRef = useRef(false);
  const editVersion = useRef(0);
  const saveContext = useRef<{ sessionId: string; stepIndex: number } | null>(null);

  useEffect(() => {
    saveContext.current = { sessionId: session.id, stepIndex };
    setSaved(false);
    setSaveError('');
    setSaving(false);
    savingRef.current = false;
    return () => {
      saveContext.current = null;
    };
  }, [session.id, stepIndex]);

  if (!step) return null;
  const site = siteForOrigin(step.origin);

  const clearSaveFeedback = () => {
    editVersion.current += 1;
    setSaved(false);
    setSaveError('');
  };

  const handleSaveAnnotation = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaved(false);
    setSaveError('');
    const submittedEditVersion = editVersion.current;
    const submittedContext = saveContext.current;
    const annotation: Annotation = {
      rating,
      tags: tags as Annotation['tags'],
      notes,
      annotator: 'user',
    };
    try {
      const updated = await sendMessage<Session | { error: string }>('UPDATE_ANNOTATION', {
        sessionId: session.id,
        stepIndex,
        annotation,
      });
      if (!updated || 'error' in updated) {
        throw new Error(updated && 'error' in updated ? updated.error : 'No save confirmation');
      }
      const stored = updated.steps?.[stepIndex]?.annotation;
      if (
        updated.id !== session.id ||
        !stored ||
        stored.rating !== annotation.rating ||
        stored.notes !== annotation.notes ||
        JSON.stringify(stored.tags) !== JSON.stringify(annotation.tags)
      ) {
        throw new Error('The saved label could not be confirmed');
      }
      if (saveContext.current !== submittedContext) return;
      onSessionUpdate(updated);
      if (editVersion.current === submittedEditVersion) setSaved(true);
    } catch (err) {
      console.error('Failed to save annotation:', err);
      if (saveContext.current === submittedContext) {
        setSaveError('Could not save label. Your changes are still here. Try again.');
      }
    } finally {
      if (saveContext.current === submittedContext) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  };

  const toggleTag = (tag: string) => {
    clearSaveFeedback();
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const coord = step.action.coordinate;
  let crosshairStyle: React.CSSProperties = {};
  if (coord && step.screenshot && screenshotUrl && !borrowed) {
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
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
      <header>
        <h2 className="break-words text-base font-semibold text-text">
          {actionLabel(step.action, step.dom)}
        </h2>
        <p
          className="truncate text-xs text-text-muted"
          title={[step.origin.title, step.origin.url].filter(Boolean).join('\n')}
        >
          {categoryLabel(site.category)}
          {site.domain ? ` · ${site.domain}` : ''}
        </p>
      </header>

      {/* Opening a step marks it as a possible task start. Only offer to end
          the task once you have moved to a different step. */}
      {rangeStart !== null && !(rangeEnd === null && rangeStart === stepIndex) && (
        <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
          <span>
            {rangeEnd === null
              ? `Task from step ${rangeStart + 1}`
              : `Steps ${Math.min(rangeStart, rangeEnd) + 1} to ${Math.max(rangeStart, rangeEnd) + 1} selected`}
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
            alt={`Screenshot of step ${(shotIndex ?? stepIndex) + 1}`}
            className="shot h-auto w-full"
          />
          {coord && !borrowed && (
            <div
              className="absolute"
              style={{ ...crosshairStyle, transform: 'translate(-50%, -50%)' }}
            >
              <Target size={24} weight="bold" className="text-white drop-shadow" />
            </div>
          )}
          {borrowed && (
            <p className="mt-1.5 text-xs text-text-faint">
              No screenshot was taken at this step. Showing step {(shotIndex ?? 0) + 1}.
            </p>
          )}
        </div>
      ) : (
        <p className="flex h-24 items-center justify-center rounded-btn border border-dashed border-ink/10 text-xs text-text-faint">
          No screenshots in this session
        </p>
      )}

      {((step.action.text?.length ?? 0) > 32 || (step.action.modifier_keys?.length ?? 0) > 0) && (
        <section>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
            {(step.action.text?.length ?? 0) > 32 && (
              <>
                <dt className="text-text-faint">Text</dt>
                <dd className="break-words font-mono text-text">
                  {truncate(step.action.text ?? '', 200)}
                </dd>
              </>
            )}
            {(step.action.modifier_keys?.length ?? 0) > 0 && (
              <>
                <dt className="text-text-faint">Key</dt>
                <dd className="font-mono text-text">
                  {[...(step.action.modifier_keys ?? []), step.action.key].join(' + ')}
                </dd>
              </>
            )}
          </dl>
        </section>
      )}

      {(coord || step.dom) && (
        <details>
          <summary className="cursor-pointer text-xs font-medium text-text-muted">
            Element details
          </summary>
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-xs">
            {coord && (
              <>
                <dt className="text-text-faint">Position</dt>
                <dd className="tabular-nums text-text">
                  {Math.round(coord[0])}, {Math.round(coord[1])}
                </dd>
              </>
            )}
            {step.dom && (
              <>
                <dt className="text-text-faint">Element</dt>
                <dd className="break-words text-text">
                  <span className="font-mono">&lt;{step.dom.tag}&gt;</span>
                  {step.dom.aria_label ? ` "${truncate(step.dom.aria_label, 60)}"` : ''}
                  {step.dom.aria_role ? `, ${step.dom.aria_role}` : ''}
                </dd>
                <dt className="text-text-faint">Selector</dt>
                <dd className="break-all font-mono text-text-muted">{step.dom.selector}</dd>
                <dt className="text-text-faint">State</dt>
                <dd className="text-text-muted">
                  {step.dom.visible ? 'Visible' : 'Hidden'},{' '}
                  {step.dom.interactive ? 'interactive' : 'not interactive'}
                </dd>
              </>
            )}
          </dl>
        </details>
      )}

      <section className="space-y-3">
        <h3 className="text-xs font-medium text-text-muted">Rate this step</h3>
        <div className="flex flex-wrap gap-1.5">
          {(['correct', 'suboptimal', 'incorrect', 'unclear'] as AnnotationRating[]).map((r) => (
            <button
              type="button"
              key={r}
              onClick={() => {
                clearSaveFeedback();
                setRating(r);
              }}
              aria-pressed={rating === r}
              className={`chip capitalize ${rating === r ? 'chip-on' : ''}`}
            >
              {r}
            </button>
          ))}
        </div>
        <details>
          <summary className="cursor-pointer text-xs text-text-muted">
            Feedback tags{tags.length > 0 ? ` (${tags.length})` : ''}
          </summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
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
        </details>
        <label htmlFor="step-notes" className="sr-only">
          Notes
        </label>
        <textarea
          id="step-notes"
          value={notes}
          onChange={(e) => {
            clearSaveFeedback();
            setNotes(e.target.value);
          }}
          placeholder="Add a note (optional)"
          className="field resize-none"
          rows={2}
        />
        <button
          type="button"
          onClick={handleSaveAnnotation}
          disabled={saving}
          className="btn-primary btn-lg w-full"
        >
          <CheckCircle
            key={saved ? 'saved' : 'unsaved'}
            size={16}
            weight={saved ? 'fill' : 'regular'}
            className={saved ? 'pop' : undefined}
          />
          <span aria-live="polite" aria-atomic="true">
            {saving ? 'Saving' : saved ? 'Rating saved' : 'Save rating'}
          </span>
        </button>
        {saveError && (
          <p role="alert" className="text-xs text-coral">
            {saveError}
          </p>
        )}
      </section>
    </div>
  );
}
