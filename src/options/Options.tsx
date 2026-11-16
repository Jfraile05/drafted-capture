import { type ReactNode, useEffect, useRef } from 'react';
import Brand from '../shared/Brand';
import { EXTENSION_VERSION } from '../shared/constants';
import { useSettings } from '../shared/hooks';

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
      <div className="mx-auto max-w-2xl space-y-10">
        <header className="flex items-end justify-between gap-4">
          <h1>
            <Brand size="text-[32px]" />
          </h1>
          <p className="text-xs text-text-muted">Changes save automatically.</p>
        </header>

        <Section title="Capture">
          <Toggle
            title="Screenshot on every action"
            description="Take a screenshot each time you click, type or scroll."
            checked={settings.screenshot_on_action}
            onChange={(v) => updateSettings({ screenshot_on_action: v })}
          />
          <Toggle
            title="Mask all input values"
            description="Hide everything typed into fields, not just passwords."
            checked={settings.mask_all_inputs}
            onChange={(v) => updateSettings({ mask_all_inputs: v })}
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
                onChange={(e) => updateSettings({ max_steps: Number.parseInt(e.target.value, 10) })}
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
                  updateSettings({ max_duration_ms: Number.parseInt(e.target.value, 10) * 60000 })
                }
                className="field tabular-nums"
              />
            </div>
          </div>
        </Section>

        <Section title="Privacy">
          <Toggle
            title="Only capture allowed sites"
            description="Capture nothing except the domains listed below. With the list empty, nothing is captured. Incognito windows are never captured."
            checked={settings.allowlist_only}
            onChange={(v) => updateSettings({ allowlist_only: v })}
          />
          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div>
              <label htmlFor="allowlist" className="field-label">
                Allowed domains
              </label>
              <textarea
                id="allowlist"
                value={settings.domain_allowlist.join('\n')}
                onChange={(e) => handleDomainAllowlistChange(e.target.value)}
                placeholder={'crm.example.com\n*.corp.example.com'}
                rows={4}
                className="field font-mono"
              />
            </div>
          </div>
          <p className="pb-4 text-xs text-text-muted">
            One domain per line. <span className="font-mono">*.example.com</span> matches subdomains
            only, so list the bare domain too if you need it. Drafted manages sensitive-screen
            protection.
          </p>
        </Section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-6">
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
          <p className="text-xs text-text-faint">Sidekick {EXTENSION_VERSION} by Drafted Labs</p>
        </footer>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-text">{title}</h2>
      <div className="mt-2 divide-y divide-white/[0.06] border-t border-white/[0.06]">
        {children}
      </div>
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
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-white"
      />
    </label>
  );
}
