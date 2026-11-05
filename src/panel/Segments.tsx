import { Plus, Trash } from '@phosphor-icons/react';
import { useState } from 'react';
import { TASK_CATEGORIES } from '../shared/constants';
import { sendMessage } from '../shared/hooks';
import type { Segment, Session, TaskCategory } from '../shared/types';
import { getSegmentColor } from './palette';

interface SegmentsProps {
  session: Session;
  rangeStart: number | null;
  rangeEnd: number | null;
  onSessionUpdate: (session: Session) => void;
  onClearRange: () => void;
}

export function Segments({
  session,
  rangeStart,
  rangeEnd,
  onSessionUpdate,
  onClearRange,
}: SegmentsProps) {
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<TaskCategory | ''>('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const canCreate =
    rangeStart !== null &&
    rangeEnd !== null &&
    label.trim() !== '' &&
    category !== '' &&
    category !== null;

  const handleCreate = async () => {
    if (!canCreate || rangeStart === null || rangeEnd === null || !category) return;

    setSaving(true);
    const [start, end] = rangeStart <= rangeEnd ? [rangeStart, rangeEnd] : [rangeEnd, rangeStart];

    const segment: Segment = {
      id: crypto.randomUUID(),
      start_index: start,
      end_index: end,
      label: label.trim(),
      category: category as TaskCategory,
      notes: notes.trim(),
      created_at: new Date().toISOString(),
    };

    try {
      const updated = await sendMessage<Session>('SAVE_SEGMENT', {
        sessionId: session.id,
        segment,
      });
      onSessionUpdate(updated);
      setLabel('');
      setCategory('');
      setNotes('');
      onClearRange();
    } catch (err) {
      console.error('Failed to create segment:', err);
    }
    setSaving(false);
  };

  const handleDelete = async (segmentId: string) => {
    try {
      const updated = await sendMessage<Session>('DELETE_SEGMENT', {
        sessionId: session.id,
        segmentId,
      });
      onSessionUpdate(updated);
    } catch (err) {
      console.error('Failed to delete segment:', err);
    }
  };

  const hasRange = rangeStart !== null && rangeEnd !== null;

  return (
    <div className="h-full space-y-6 overflow-y-auto px-4 py-4">
      {session.segments.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-medium text-text-muted">Tasks in this session</h2>
          <ul>
            {session.segments.map((seg, idx) => (
              <li
                key={seg.id}
                className="flex items-start gap-3 border-t border-white/[0.06] py-3 first:border-t-0 first:pt-0"
              >
                <span
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: getSegmentColor(idx) }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text">{seg.label}</p>
                  <p className="text-xs text-text-muted">
                    {TASK_CATEGORIES.find((c) => c.value === seg.category)?.label ?? 'No category'},
                    steps {seg.start_index} to {seg.end_index}
                  </p>
                  {seg.notes && <p className="mt-1 text-xs text-text-muted">{seg.notes}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(seg.id)}
                  className="icon-btn -mr-2 -mt-1.5 text-text-faint hover:text-coral"
                  aria-label={`Delete task ${seg.label}`}
                  title="Delete task"
                >
                  <Trash size={16} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-text">Name a task</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            {hasRange
              ? `Steps ${Math.min(rangeStart ?? 0, rangeEnd ?? 0)} to ${Math.max(rangeStart ?? 0, rangeEnd ?? 0)} selected.`
              : 'First pick the steps: in Steps, click one, then shift+click another.'}
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
            placeholder="Fill out checkout form"
            className="field"
          />
        </div>

        <div>
          <label htmlFor="segment-category" className="field-label">
            Category
          </label>
          <select
            id="segment-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as TaskCategory | '')}
            className="field"
          >
            <option value="">Select a category</option>
            {TASK_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="segment-notes" className="field-label">
            Notes (optional)
          </label>
          <textarea
            id="segment-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="field resize-none"
            rows={2}
          />
        </div>

        <button
          type="button"
          onClick={handleCreate}
          disabled={!canCreate || saving}
          className="btn-primary w-full"
        >
          <Plus size={16} weight="bold" />
          {saving ? 'Saving' : 'Save task'}
        </button>
      </section>
    </div>
  );
}
