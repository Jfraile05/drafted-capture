import { DownloadSimple, Trash } from '@phosphor-icons/react';
import { useState } from 'react';
import { sendMessage } from '../shared/hooks';
import type { ExportFormatFlags, Session } from '../shared/types';

interface ExportProps {
  session: Session;
  onDelete: () => void;
}

// Submitting lives in the bar at the top of every session (SubmitBar), so this
// tab only covers downloading and deleting.
export function Export({ session, onDelete }: ExportProps) {
  const [formats, setFormats] = useState<ExportFormatFlags>({
    anthropic: true,
    openai: true,
    universal: true,
    trajectory: true,
  });
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const toggleFormat = (key: keyof ExportFormatFlags) => {
    setFormats((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await sendMessage('EXPORT_SESSION', {
        id: session.id,
        formats,
      });
    } catch (err) {
      console.error('Failed to export:', err);
    }
    setExporting(false);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await sendMessage('DELETE_SESSION', { id: session.id });
      onDelete();
    } catch (err) {
      console.error('Failed to delete:', err);
      setDeleting(false);
    }
  };

  const formatLabels: Record<keyof ExportFormatFlags, string> = {
    anthropic: 'Anthropic format',
    openai: 'OpenAI format',
    universal: 'Universal JSON',
    trajectory: 'Trajectory triples',
  };

  return (
    <div className="h-full space-y-8 overflow-y-auto px-4 py-4">
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-text">Download</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            A .zip with the formats you pick and every screenshot.
          </p>
        </div>
        <fieldset className="space-y-1">
          <legend className="sr-only">Formats</legend>
          {(Object.keys(formats) as (keyof ExportFormatFlags)[]).map((key) => (
            <label key={key} className="flex cursor-pointer items-center gap-3 py-1.5">
              <input
                type="checkbox"
                checked={formats[key]}
                onChange={() => toggleFormat(key)}
                className="h-4 w-4 accent-white"
              />
              <span className="text-sm text-text">{formatLabels[key]}</span>
            </label>
          ))}
        </fieldset>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || !Object.values(formats).some((v) => v)}
          className="btn-primary w-full"
        >
          <DownloadSimple size={16} weight="bold" />
          {exporting ? 'Preparing download' : 'Download .zip'}
        </button>
      </section>

      <section className="space-y-3 border-t border-white/[0.06] pt-6">
        <div>
          <h2 className="text-sm font-semibold text-text">Delete session</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Removes every step, task and screenshot from this browser. This cannot be undone.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="btn-danger w-full"
        >
          <Trash size={16} />
          {deleting ? 'Deleting' : 'Delete session'}
        </button>
      </section>
    </div>
  );
}
