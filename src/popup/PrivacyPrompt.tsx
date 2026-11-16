import { useState } from 'react';
import { PRIVACY_CONFIG } from '../config/privacy';
import { sendMessage } from '../shared/hooks';
import type { PrivacyGate } from '../shared/privacy';

export function PrivacyPrompt({
  gate,
  sessionId,
  onStop,
  stopping,
}: {
  gate: PrivacyGate;
  sessionId: string;
  onStop: () => void;
  stopping: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const decide = async (type: 'CONFIRM_PRIVACY' | 'KEEP_PRIVACY_PAUSED') => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await sendMessage(type, { gateId: gate.id, sessionId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not confirm. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Recording paused for privacy" className="space-y-3">
      <p className="text-sm leading-relaxed text-text">{PRIVACY_CONFIG.prompt}</p>
      <button
        type="button"
        className="btn-primary w-full"
        disabled={busy || stopping}
        onClick={() => decide('CONFIRM_PRIVACY')}
      >
        Resume recording
      </button>
      <button
        type="button"
        className="btn-ghost w-full"
        disabled={busy || stopping || gate.kept_paused}
        onClick={() => decide('KEEP_PRIVACY_PAUSED')}
      >
        Keep paused
      </button>
      {error && (
        <p role="alert" className="text-xs text-coral">
          {error}
        </p>
      )}
      <button type="button" className="btn-ghost w-full" onClick={onStop} disabled={stopping}>
        Stop and save
      </button>
    </section>
  );
}
