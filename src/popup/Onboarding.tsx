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
    <div className="view-in flex flex-col px-5 pb-5 pt-4">
      <header>
        <Brand size="text-[32px]" />
        <h1 className="mt-6 text-base font-semibold text-text">How Sidekick works</h1>
      </header>

      <ol className="mt-5 space-y-4">
        <Step n={1} title="Start a task">
          Choose a workflow, then start your task.
        </Step>
        <Step n={2} title="Work as usual">
          Each click, keystroke, scroll and page becomes a step.
        </Step>
        <Step n={3} title="Sync automatically">
          Sessions upload to your Drafted project automatically. Review and label them anytime.
        </Step>
      </ol>

      <label className="mt-6 flex cursor-pointer items-start gap-3 border-t border-ink/[0.06] pt-4">
        <input
          type="checkbox"
          checked={consented}
          onChange={(e) => setConsented(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-white"
        />
        <span className="text-xs leading-relaxed text-text-muted">
          I understand this records my browser activity (clicks, keystrokes, scrolls, navigation and
          screenshots) while capture is on, and I consent to automatically uploading it as training
          data to my Drafted account. Each session I submit gets a quality review, which may be used
          for feedback and pay. I will only capture work I am authorized to share, and I agree to
          the{' '}
          <a
            href={chrome.runtime.getURL('src/terms/index.html')}
            target="_blank"
            rel="noreferrer"
            className="text-text underline underline-offset-2 hover:text-text"
          >
            Sidekick Terms of Use
          </a>
          .
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

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ink/15 text-xs font-semibold tabular-nums text-text-muted">
        {n}
      </span>
      <div>
        <p className="text-sm font-semibold text-text">{title}</p>
        <p className="text-sm text-text-muted">{children}</p>
      </div>
    </li>
  );
}
