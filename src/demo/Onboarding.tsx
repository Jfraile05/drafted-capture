import { useState } from 'react';
import Brand from '../shared/Brand';
import { useSettings } from '../shared/hooks';

export default function Onboarding() {
  const [, update] = useSettings();
  const [accepted, setAccepted] = useState(false);
  return (
    <main className="p-5">
      <Brand size="text-[32px]" />
      <h1 className="mt-5 text-xl">Your synthetic workspace</h1>
      <p className="mt-3 text-sm text-text-muted">
        Three workflows, sample sessions, and a local submission simulator. No real account or
        backend is used.
      </p>
      <label className="mt-5 flex gap-2 text-sm">
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
        I understand Start records activity on the local test sites. Recordings stay on this device.
      </label>
      <button
        type="button"
        className="btn-primary mt-5 w-full"
        disabled={!accepted}
        onClick={() =>
          update({
            onboarding_complete: true,
            consent_accepted: true,
            consent_accepted_at: new Date().toISOString(),
          })
        }
      >
        Open synthetic project
      </button>
    </main>
  );
}
