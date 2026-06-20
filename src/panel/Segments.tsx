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

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-text">
          <Plus size={18} weight="regular" />
          New segment
        </div>

        {rangeStart !== null && rangeEnd !== null ? (
          <div className="text-xs text-text-muted bg-violet/10 px-3 py-2 rounded-btn">
            Steps {Math.min(rangeStart, rangeEnd)} to {Math.max(rangeStart, rangeEnd)}
          </div>
        ) : (
          <div className="text-xs text-text-faint italic">
            Select a range in the timeline (click start, shift+click end or use "Set end")
          </div>
        )}

        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Segment label"
          className="w-full bg-bg-input text-sm text-text px-3 py-2 rounded-btn border border-white/[0.06] focus:border-green/30 outline-none"
        />

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as TaskCategory | '')}
          className="w-full bg-bg-input text-sm text-text px-3 py-2 rounded-btn border border-white/[0.06] focus:border-green/30 outline-none"
        >
          <option value="">Select category</option>
          {TASK_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes"
          className="w-full bg-bg-input text-sm text-text px-3 py-2 rounded-btn border border-white/[0.06] focus:border-green/30 outline-none resize-none"
          rows={3}
        />

        <button
          type="button"
          onClick={handleCreate}
          disabled={!canCreate || saving}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green/20 text-green rounded-btn hover:bg-green/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Create segment'}
        </button>
      </div>

      <div className="space-y-2">
        {session.segments.length === 0 && (
          <div className="text-center text-text-muted text-sm py-8">
            No segments yet. Create one above.
          </div>
        )}
        {session.segments.map((seg, idx) => {
          const color = getSegmentColor(idx);
          return (
            <div key={seg.id} className="card p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div
                    className="w-1 h-full rounded-full flex-shrink-0 mt-1"
                    style={{ backgroundColor: color, minHeight: '2rem' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text">{seg.label}</div>
                    <div className="text-xs text-text-muted mt-1">
                      {TASK_CATEGORIES.find((c) => c.value === seg.category)?.label ?? 'Unknown'} ·
                      Steps {seg.start_index} to {seg.end_index}
                    </div>
                    {seg.notes && (
                      <div className="text-xs text-text-muted mt-2 bg-bg-input px-2 py-1 rounded">
                        {seg.notes}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(seg.id)}
                  className="p-1.5 rounded-btn hover:bg-coral/20 text-coral transition-colors flex-shrink-0"
                  title="Delete segment"
                >
                  <Trash size={16} weight="regular" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
