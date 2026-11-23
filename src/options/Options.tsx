import { CaretRight } from '@phosphor-icons/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import Brand from '../shared/Brand';
import SetupPicker, { SetupStack, useLook } from '../shared/SetupPicker';
import ThemeToggle from '../shared/ThemeToggle';
import { EXTENSION_VERSION, IS_BETA } from '../shared/constants';
import { useSettings } from '../shared/hooks';
import { findSetup } from '../shared/setups';

export function Options() {
  const [settings, updateSettings] = useSettings();
  // Chrome only opens the side panel when open() runs right inside the click,
  // so the window id is looked up ahead of time.
  const windowIdRef = useRef<number | null>(null);

  useEffect(() => {
    chrome.windows.getCurrent().then((win) => {
      windowIdRef.current = win.id ?? null;
    });
  }, []);

  const handleDomainAllowlistChange = (value: string) => {
    const domains = value
      .split('\n')
      .map((d) => d.trim())
      .filter(Boolean);
    updateSettings({ domain_allowlist: domains });
  };

  const handleResetOnboarding = () => {
    updateSettings({ onboarding_complete: false });
    alert('Done. Open the Sidekick popup to see the welcome screen.');
  };

  const handleOpenPanel = () => {
    const windowId = windowIdRef.current;
    if (windowId === null) return;
    chrome.sidePanel
      .open({ windowId })
      .catch((err) => console.error('Failed to open side panel:', err));
  };

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="stagger mx-auto max-w-xl space-y-10">
        <header className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h1>
              <Brand size="text-[32px]" />
            </h1>
            <ThemeToggle />
          </div>
          <p className="text-sm text-text-muted">
            Make Sidekick yours. Changes save as soon as you make them.
          </p>
        </header>

        <YourSetup />

        <Section title="While you record">
          <Toggle
            title="Show my earnings on the page"
            description="Watch your total tick up in the corner while you work. The timer stays either way."
            checked={settings.show_page_earnings}
            onChange={(v) => updateSettings({ show_page_earnings: v })}
          />
          <Toggle
            title="Celebrate every save"
            description="Confetti and a happy hop from Sidekick when a session is saved."
            checked={settings.celebrate_saves}
            onChange={(v) => updateSettings({ celebrate_saves: v })}
          />
        </Section>

        <Section title="Reminders">
          <Toggle
            title="Nudge me when I could be earning"
            description="If you browse for a few minutes without recording, Sidekick asks if you want to get paid for it. At most once every two hours."
            checked={settings.start_nudges}
            onChange={(v) => updateSettings({ start_nudges: v })}
          />
        </Section>

        <Section title="Privacy">
          <Toggle
            title="Hide everything I type"
            description="Passwords, card numbers, SSNs, emails, phone numbers and addresses are always hidden. Turn this on to hide all other typing too."
            checked={settings.mask_all_inputs}
            onChange={(v) => updateSettings({ mask_all_inputs: v })}
          />
          <Toggle
            title="Only record sites I pick"
            description="Sidekick ignores every other site. Incognito windows are never recorded."
            checked={settings.allowlist_only}
            onChange={(v) => updateSettings({ allowlist_only: v })}
          />
          {settings.allowlist_only && (
            <div className="py-4">
              <label htmlFor="allowlist" className="field-label">
                Sites to record, one per line
              </label>
              <textarea
                id="allowlist"
                value={settings.domain_allowlist.join('\n')}
                onChange={(e) => handleDomainAllowlistChange(e.target.value)}
                placeholder={'notion.so\n*.salesforce.com'}
                rows={4}
                className="field font-mono"
              />
              <p className="mt-2 text-xs text-text-muted">
                <span className="font-mono">*.example.com</span> covers subdomains only, so add{' '}
                <span className="font-mono">example.com</span> too if you need it.
                {settings.domain_allowlist.length === 0 &&
                  ' With no sites listed, nothing is recorded.'}
              </p>
            </div>
          )}
        </Section>

        <details className="group">
          <summary className="cursor-pointer list-none text-sm text-text-muted hover:text-text">
            <span className="inline-block transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-open:rotate-90">
              ›
            </span>{' '}
            Advanced
          </summary>
          <div className="mt-2 divide-y divide-ink/[0.06] border-t border-ink/[0.06]">
            <Toggle
              title="Screenshot on every action"
              description="Take a screenshot each time you click, type or scroll."
              checked={settings.screenshot_on_action}
              onChange={(v) => updateSettings({ screenshot_on_action: v })}
            />
            <div className="grid gap-4 py-4 sm:grid-cols-2">
              <div>
                <label htmlFor="max-steps" className="field-label">
                  Stop after this many steps
                </label>
                <input
                  id="max-steps"
                  type="number"
                  min="100"
                  max="100000"
                  step="1000"
                  value={settings.max_steps}
                  onChange={(e) =>
                    updateSettings({ max_steps: Number.parseInt(e.target.value, 10) })
                  }
                  className="field tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="max-minutes" className="field-label">
                  Stop after this many minutes
                </label>
                <input
                  id="max-minutes"
                  type="number"
                  min="10"
                  max="1440"
                  step="10"
                  value={Math.round(settings.max_duration_ms / 60000)}
                  onChange={(e) =>
                    updateSettings({
                      max_duration_ms: Number.parseInt(e.target.value, 10) * 60000,
                    })
                  }
                  className="field tabular-nums"
                />
              </div>
            </div>
          </div>
        </details>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/[0.06] pt-6">
          <div className="flex gap-2">
            <button type="button" onClick={handleOpenPanel} className="btn-ghost">
              Open review panel
            </button>
            <button
              type="button"
              onClick={handleResetOnboarding}
              className="btn-ghost text-text-muted"
            >
              Show welcome again
            </button>
          </div>
          <p className="text-xs text-text-faint">
            Sidekick {EXTENSION_VERSION}
            {IS_BETA && ' beta'} by Drafted Labs
          </p>
        </footer>
      </div>
    </div>
  );
}

function YourSetup() {
  const [open, setOpen] = useState(false);
  const look = useLook();
  return (
    <section>
      <h2 className="text-base font-semibold text-text">Your setup</h2>
      {open ? (
        <div className="surface view-in mt-3 p-4">
          <div className="mx-auto max-w-[420px]">
            <SetupPicker onClose={() => setOpen(false)} />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="surface lift mt-3 flex w-full items-center gap-3 p-3 text-left"
        >
          <SetupStack />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-text">Choose your setup</span>
            <span className="mt-0.5 block text-xs text-text-muted">
              You're using {findSetup(look.setup)?.name}, {look.theme}. Every setup has a light and
              a dark version, and the sun and moon button switches between them.
            </span>
          </span>
          <CaretRight size={16} className="shrink-0 text-text-muted" />
        </button>
      )}
    </section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-text">{title}</h2>
      <div className="mt-2 divide-y divide-ink/[0.06] border-t border-ink/[0.06]">{children}</div>
    </section>
  );
}

function Toggle({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-6 py-4">
      <span>
        <span className="block text-sm font-medium text-text">{title}</span>
        <span className="mt-0.5 block text-xs text-text-muted">{description}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-pill bg-ink/15 transition-colors duration-300 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-[0_1px_3px_rgba(0,0,0,0.25)] after:transition-transform after:duration-300 after:ease-[cubic-bezier(0.34,1.56,0.64,1)] peer-checked:bg-green peer-checked:after:translate-x-4 peer-checked:after:bg-bg peer-focus-visible:ring-2 peer-focus-visible:ring-green/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg motion-reduce:transition-none motion-reduce:after:transition-none"
      />
    </label>
  );
}
