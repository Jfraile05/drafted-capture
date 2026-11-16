import { CheckCircle, PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { TASK_CATEGORIES } from '../shared/constants';
import { sendMessage } from '../shared/hooks';
import type { Segment, Session, TaskCategory } from '../shared/types';
import { categoryLabel, tagSegment } from '../shared/urlCategories';
import { getSegmentColor } from './palette';

interface SegmentsProps {
  session: Session;
  rangeStart: number | null;
  rangeEnd: number | null;
  onSessionUpdate: (session: Session) => void;
  onClearRange: () => void;
  onRangeChange: (start: number | null, end: number | null) => void;
}

export function Segments({
  session,
  rangeStart,
  rangeEnd,
  onSessionUpdate,
  onClearRange,
  onRangeChange,
}: SegmentsProps) {
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<TaskCategory>('workflow');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Segment | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false);
  const mounted = useRef(true);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const canCreate =
    rangeStart !== null &&
    rangeEnd !== null &&
    rangeStart >= 0 &&
    rangeEnd >= 0 &&
    rangeStart < session.steps.length &&
    rangeEnd < session.steps.length &&
    label.trim() !== '';

  const resetForm = () => {
    setLabel('');
    setCategory('workflow');
    setNotes('');
    setEditing(null);
    onClearRange();
  };

  const handleCreate = async () => {
    if (pending.current || !canCreate || rangeStart === null || rangeEnd === null) return;

    pending.current = true;
    setSaving(true);
    setNotice('');
    setError('');
    const [start, end] = rangeStart <= rangeEnd ? [rangeStart, rangeEnd] : [rangeEnd, rangeStart];

    const segment: Segment = {
      id: editing?.id ?? crypto.randomUUID(),
      start_index: start,
      end_index: end,
      label: label.trim(),
      category,
      notes: notes.trim(),
      created_at: editing?.created_at ?? new Date().toISOString(),
    };

    try {
      const updated = await sendMessage<Session>('SAVE_SEGMENT', {
        sessionId: session.id,
        segment,
      });
      const stored = updated?.segments?.find((saved) => saved.id === segment.id);
      if (
        updated?.id !== session.id ||
        !stored ||
        stored.label !== segment.label ||
        stored.notes !== segment.notes ||
        stored.category !== segment.category ||
        stored.start_index !== segment.start_index ||
        stored.end_index !== segment.end_index
      ) {
        throw new Error('The saved task could not be confirmed.');
      }
      onSessionUpdate(updated);
      if (mounted.current) {
        resetForm();
        setNotice(editing ? 'Task updated.' : 'Task saved.');
      }
    } catch (err) {
      console.error('Failed to create segment:', err);
      if (mounted.current) setError('Could not save the task. Your changes are still here.');
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  const handleDelete = async (segmentId: string) => {
    if (pending.current || !confirm('Delete this task? The recorded steps will be kept.')) return;
    pending.current = true;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const updated = await sendMessage<Session>('DELETE_SEGMENT', {
        sessionId: session.id,
        segmentId,
      });
      if (!updated?.segments || updated.segments.some((segment) => segment.id === segmentId)) {
        throw new Error('The deletion could not be confirmed.');
      }
      onSessionUpdate(updated);
      if (mounted.current) {
        if (editing?.id === segmentId) resetForm();
        setNotice('Task deleted. Recorded steps kept.');
      }
    } catch (err) {
      console.error('Failed to delete segment:', err);
      if (mounted.current) setError('Could not delete the task. Try again.');
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  const editTask = (segment: Segment) => {
    setEditing(segment);
    setLabel(segment.label);
    setCategory(segment.category ?? 'workflow');
    setNotes(segment.notes);
    onRangeChange(segment.start_index, segment.end_index);
    setNotice('');
    setError('');
    formRef.current?.scrollIntoView({ block: 'start' });
    formRef.current?.querySelector<HTMLInputElement>('#segment-label')?.focus();
  };

  return (
    <div className="h-full space-y-6 overflow-y-auto px-4 py-4">
      {session.segments.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-medium text-text-muted">Tasks in this session</h2>
          <ul>
            {[...session.segments]
              .sort((a, b) => a.start_index - b.start_index)
              .map((seg) => {
                const sites = seg.sites ?? tagSegment(seg, session.steps).sites ?? [];
                return (
                  <li
                    key={seg.id}
                    className="flex items-start gap-3 border-t border-white/[0.06] py-3 first:border-t-0 first:pt-0"
                  >
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: getSegmentColor(session.segments.indexOf(seg)) }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium text-text">{seg.label}</p>
                      <p className="text-xs text-text-muted">
                        Steps {seg.start_index + 1} to {seg.end_index + 1}
                        {seg.category
                          ? `, ${TASK_CATEGORIES.find((c) => c.value === seg.category)?.label.toLowerCase()}`
                          : ''}
                      </p>
                      {sites.length > 0 && (
                        <details className="mt-1 text-xs text-text-muted">
                          <summary className="cursor-pointer">Sites ({sites.length})</summary>
                          <ul className="mt-1 space-y-1">
                            {sites.map((site) => (
                              <li key={`${site.domain}:${site.category}`} className="break-words">
                                {categoryLabel(site.category)}
                                {site.domain ? ` · ${site.domain}` : ''}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                      {seg.notes && (
                        <p className="mt-1 whitespace-pre-wrap break-words text-xs text-text-muted">
                          {seg.notes}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => editTask(seg)}
                      disabled={saving}
                      className="icon-btn -mr-2 -mt-1.5 shrink-0"
                      aria-label={`Edit task ${seg.label}`}
                      title="Edit task"
                    >
                      <PencilSimple size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(seg.id)}
                      disabled={saving}
                      className="icon-btn -mr-2 -mt-1.5 shrink-0 text-text-faint hover:text-coral"
                      aria-label={`Delete task ${seg.label}`}
                      title="Delete task"
                    >
                      <Trash size={16} />
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>
      )}

      {notice && (
        <output className="flex items-center gap-2 text-xs text-green">
          <CheckCircle size={16} weight="fill" />
          {notice}
        </output>
      )}
      {error && (
        <p role="alert" className="text-xs text-coral">
          {error}
        </p>
      )}

      <form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault();
          void handleCreate();
        }}
      >
        <fieldset disabled={saving} className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-text">
              {editing ? 'Edit task' : 'New task'}
            </h2>
            <p className="mt-0.5 text-xs text-text-muted">
              Name a group of steps and say what they get done.
            </p>
          </div>

          <div>
            <label htmlFor="segment-label" className="field-label">
              Task name
            </label>
            <input
              id="segment-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Create a client record"
              className="field"
              required
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-text-muted">Steps</span>
              <button
                type="button"
                disabled={session.steps.length === 0}
                className="text-xs text-text-muted underline underline-offset-2 hover:text-text"
                onClick={() => {
                  onRangeChange(0, session.steps.length - 1);
                  if (!label.trim()) setLabel(session.intent?.trim() ?? '');
                }}
              >
                Use all {session.steps.length}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                aria-label="First step"
                type="number"
                min={1}
                max={session.steps.length}
                value={rangeStart === null ? '' : rangeStart + 1}
                onChange={(event) =>
                  onRangeChange(
                    event.target.value === '' ? null : Number(event.target.value) - 1,
                    rangeEnd,
                  )
                }
                className="field tabular-nums"
                placeholder="1"
              />
              <span className="shrink-0 text-xs text-text-faint">to</span>
              <input
                aria-label="Last step"
                type="number"
                min={1}
                max={session.steps.length}
                value={rangeEnd === null ? '' : rangeEnd + 1}
                onChange={(event) =>
                  onRangeChange(
                    rangeStart,
                    event.target.value === '' ? null : Number(event.target.value) - 1,
                  )
                }
                className="field tabular-nums"
                placeholder={String(session.steps.length)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="segment-notes" className="field-label">
              Notes <span className="font-normal text-text-faint">(optional)</span>
            </label>
            <textarea
              id="segment-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Decisions you made, and what a good result looks like"
              className="field resize-none"
              rows={2}
            />
          </div>

          <details>
            <summary className="cursor-pointer text-xs text-text-muted">
              Category (optional)
            </summary>
            <label htmlFor="segment-category" className="sr-only">
              Category
            </label>
            <select
              id="segment-category"
              value={category}
              onChange={(event) => setCategory(event.target.value as TaskCategory)}
              className="field mt-2"
            >
              {TASK_CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </details>

          <button type="submit" disabled={!canCreate || saving} className="btn-primary w-full">
            {editing ? <CheckCircle size={16} /> : <Plus size={16} weight="bold" />}
            {saving ? 'Saving' : editing ? 'Save changes' : 'Save task'}
          </button>
          {editing && (
            <button type="button" onClick={resetForm} className="btn-ghost w-full">
              Cancel editing
            </button>
          )}
        </fieldset>
      </form>
    </div>
  );
}
