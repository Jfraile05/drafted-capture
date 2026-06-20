import { Browser, Export, Power } from '@phosphor-icons/react';
import { useState } from 'react';
import { useSettings } from '../shared/hooks';

export default function Onboarding() {
  const [, updateSettings] = useSettings();
  const [consented, setConsented] = useState(false);

  const handleGetStarted = () => {
    if (!consented) return;
    updateSettings({
      onboarding_complete: true,
      consent_accepted: true,
      consent_accepted_at: new Date().toISOString(),
    });
  };

  return (
    <div className="p-5 space-y-6 atmosphere">
      <header className="text-center">
        <h1 className="wordmark text-2xl mb-2">
          drafted<span className="dot">.</span>
        </h1>
        <p className="text-text-muted text-sm">ambient trajectory capture</p>
      </header>

      <div className="card p-5 space-y-5">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-dim flex items-center justify-center">
            <Power className="text-green" size={20} weight="duotone" />
          </div>
          <div className="flex-1">
            <h3 className="text-text font-semibold mb-1">flip it on</h3>
            <p className="text-text-muted text-xs leading-relaxed">
              one tap starts capturing everything across all your tabs
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-dim flex items-center justify-center">
            <Browser className="text-green" size={20} weight="duotone" />
          </div>
          <div className="flex-1">
            <h3 className="text-text font-semibold mb-1">do anything</h3>
            <p className="text-text-muted text-xs leading-relaxed">
              browse, type, click, scroll. every action becomes a step
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-dim flex items-center justify-center">
            <Export className="text-green" size={20} weight="duotone" />
          </div>
          <div className="flex-1">
            <h3 className="text-text font-semibold mb-1">review and label later</h3>
            <p className="text-text-muted text-xs leading-relaxed">
              segment the timeline, annotate steps, export lab-ready JSON
            </p>
          </div>
        </div>

        <div className="pt-3 border-t border-border space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consented}
              onChange={(e) => setConsented(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-border bg-bg-input text-green focus:ring-green/30"
            />
            <span className="text-text-muted text-xs leading-relaxed">
              I understand this records my browser activity (clicks, keystrokes, scrolls,
              navigation, and screenshots) while capture is on, and I consent to submitting it as
              training data to my Drafted account. I will only capture work I am authorized to
              share.
            </span>
          </label>

          <button
            type="button"
            onClick={handleGetStarted}
            disabled={!consented}
            className="w-full py-3 bg-green text-bg font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            agree and get started
          </button>
        </div>
      </div>
    </div>
  );
}
