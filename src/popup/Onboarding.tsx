import { Browser, Export, Power } from '@phosphor-icons/react';
import { type ReactNode, useState } from 'react';
import Brand from '../shared/Brand';
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
    <div className="flex flex-col px-5 pb-5 pt-4">
      <header>
        <Brand size="text-2xl" />
        <h1 className="mt-6 text-base font-semibold text-text">How Sidekick works</h1>
      </header>

      <ol className="mt-5 space-y-4">
        <Step icon={<Power size={18} />} title="Turn it on">
          One click starts recording across all your tabs.
        </Step>
        <Step icon={<Browser size={18} />} title="Work as usual">
          Every click, keystroke, scroll and page becomes a step.
        </Step>
        <Step icon={<Export size={18} />} title="Review and label">
          Name the tasks you did, then submit or export them.
        </Step>
      </ol>

      <label className="mt-6 flex cursor-pointer items-start gap-3 border-t border-white/[0.06] pt-4">
        <input
          type="checkbox"
          checked={consented}
          onChange={(e) => setConsented(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-white"
        />
        <span className="text-xs leading-relaxed text-text-muted">
          I understand this records my browser activity (clicks, keystrokes, scrolls, navigation and
          screenshots) while capture is on, and I consent to submitting it as training data to my
          Drafted account. I will only capture work I am authorized to share.
        </span>
      </label>

      <button
        type="button"
        onClick={handleGetStarted}
        disabled={!consented}
        className="btn-primary mt-4 w-full"
      >
        Agree and get started
      </button>
    </div>
  );
}

function Step({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-text">
        {icon}
      </span>
      <div>
        <p className="text-sm font-semibold text-text">{title}</p>
        <p className="text-sm text-text-muted">{children}</p>
      </div>
    </li>
  );
}
