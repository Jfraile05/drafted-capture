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
    <div className="border-t border-white/[0.06] overflow-y-auto p-4 space-y-4 max-h-[60vh]">
      {rangeStart !== null && (
        <div className="card p-3 flex items-center justify-between">
          <div className="text-sm text-text-muted">
            {rangeEnd === null
              ? `Range start: Step ${rangeStart}`
              : `Range: ${Math.min(rangeStart, rangeEnd)} to ${Math.max(rangeStart, rangeEnd)}`}
          </div>
          <div className="flex gap-2">
            {rangeEnd === null && (
              <button
                type="button"
                onClick={onSetRangeEnd}
                className="text-xs px-3 py-1 bg-violet/20 text-violet rounded-btn hover:bg-violet/30 transition-colors"
              >
                Set end
              </button>
            )}
            <button
              type="button"
              onClick={onClearRange}
              className="text-xs px-3 py-1 bg-text-faint/20 text-text-muted rounded-btn hover:bg-text-faint/30 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="card p-4">
        <div className="text-xs text-text-muted mb-2">Screenshot</div>
        {screenshotUrl ? (
          <div className="relative w-full">
            <img
              src={screenshotUrl}
              alt="Step screenshot"
              className="w-full h-auto rounded-btn border border-white/[0.06]"
            />
            {coord && (
              <div
                className="absolute"
                style={{ ...crosshairStyle, transform: 'translate(-50%, -50%)' }}
              >
                <Target size={24} weight="bold" className="text-green ring animate-pulse" />
                <div
                  className="absolute inset-0 rounded-full ring"
                  style={{ boxShadow: '0 0 0 0 rgba(77,255,160,0.45)' }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-32 bg-bg-input rounded-btn border border-white/[0.06] flex items-center justify-center text-text-faint text-sm">
            No screenshot
          </div>
        )}
      </div>

      <div className="card p-4 space-y-3">
        <div className="text-xs text-text-muted">Action</div>
        <div className="text-sm text-text">
          <span className="font-medium capitalize">{step.action.type.replace('_', ' ')}</span>
        </div>
        {coord && (
          <div className="text-xs text-text-muted">
            Coordinate: ({Math.round(coord[0])}, {Math.round(coord[1])})
          </div>
        )}
        {step.action.text && (
          <div className="text-xs bg-bg-input px-3 py-2 rounded-btn font-mono break-words">
            {truncate(step.action.text, 200)}
          </div>
        )}
        {step.action.key && (
          <div className="text-xs bg-bg-input px-3 py-2 rounded-btn font-mono">
            {step.action.key}
          </div>
        )}
        {step.action.modifier_keys && step.action.modifier_keys.length > 0 && (
          <div className="flex gap-2">
            {step.action.modifier_keys.map((mod) => (
              <span key={mod} className="text-xs px-2 py-1 bg-violet/20 text-violet rounded-btn">
                {mod}
              </span>
            ))}
          </div>
        )}
      </div>

      {step.dom && (
        <div className="card p-4 space-y-2">
          <div className="text-xs text-text-muted">DOM Context</div>
          <div className="text-xs">
            <span className="text-text-muted">Tag:</span>{' '}
            <span className="text-text font-mono">&lt;{step.dom.tag}&gt;</span>
          </div>
          <div className="text-xs font-mono text-text-muted break-all">
            {truncate(step.dom.selector, 150)}
          </div>
          {step.dom.aria_role && (
            <div className="text-xs">
              <span className="text-text-muted">Role:</span>{' '}
              <span className="text-text">{step.dom.aria_role}</span>
            </div>
          )}
          {step.dom.aria_label && (
            <div className="text-xs">
              <span className="text-text-muted">Label:</span>{' '}
              <span className="text-text">{truncate(step.dom.aria_label, 80)}</span>
            </div>
          )}
          <div className="flex gap-3 text-xs">
            <div className="flex items-center gap-1">
              <div
                className={`w-2 h-2 rounded-full ${step.dom.visible ? 'bg-green' : 'bg-text-faint'}`}
              />
              <span className="text-text-muted">Visible</span>
            </div>
            <div className="flex items-center gap-1">
              <div
                className={`w-2 h-2 rounded-full ${step.dom.interactive ? 'bg-green' : 'bg-text-faint'}`}
              />
              <span className="text-text-muted">Interactive</span>
            </div>
          </div>
        </div>
      )}

      <div className="card p-4 space-y-3">
        <div className="text-xs text-text-muted">Annotation</div>
        <div>
          <div className="text-xs text-text-muted mb-2">Rating</div>
          <div className="flex gap-2">
            {(['correct', 'suboptimal', 'incorrect', 'unclear'] as AnnotationRating[]).map((r) => (
              <button
                type="button"
                key={r}
                onClick={() => setRating(r)}
                className={`text-xs px-3 py-1 rounded-btn capitalize transition-colors ${
                  rating === r
                    ? 'bg-green/20 text-green border border-green/30'
                    : 'bg-bg-input text-text-muted hover:bg-bg-card'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs text-text-muted mb-2">Tags</div>
          <div className="flex flex-wrap gap-2">
            {ANNOTATION_TAGS.map((t) => (
              <button
                type="button"
                key={t.value}
                onClick={() => toggleTag(t.value)}
                className={`text-xs px-3 py-1 rounded-btn transition-colors ${
                  tags.includes(t.value)
                    ? 'bg-violet/20 text-violet border border-violet/30'
                    : 'bg-bg-input text-text-muted hover:bg-bg-card'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs text-text-muted mb-2">Notes</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes..."
            className="w-full bg-bg-input text-sm text-text px-3 py-2 rounded-btn border border-white/[0.06] focus:border-green/30 outline-none resize-none"
            rows={3}
          />
        </div>

        <button
          type="button"
          onClick={handleSaveAnnotation}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green/20 text-green rounded-btn hover:bg-green/30 transition-colors disabled:opacity-50"
        >
          <CheckCircle size={18} weight="regular" />
          {saving ? 'Saving...' : 'Save annotation'}
        </button>
      </div>
    </div>
  );
}
