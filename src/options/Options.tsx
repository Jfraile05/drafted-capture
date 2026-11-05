import { Eye, EyeSlash } from '@phosphor-icons/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import Brand from '../shared/Brand';
import { useSettings } from '../shared/hooks';

export function Options() {
  const [settings, updateSettings] = useSettings();
  const [showApiKey, setShowApiKey] = useState(false);
  // Chrome only opens the side panel when open() runs right inside the click,
  // so the window id is looked up ahead of time.
  const windowIdRef = useRef<number | null>(null);

  useEffect(() => {
    chrome.windows.getCurrent().then((win) => {
      windowIdRef.current = win.id ?? null;
    });
  }, []);

  const handleDomainBlocklistChange = (value: string) => {
    const domains = value
      .split('\n')
      .map((d) => d.trim())
      .filter(Boolean);
    updateSettings({ domain_blocklist: domains });
  };

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
            <Brand size="text-2xl" />
          </h1>
          <p className="text-xs text-text-muted">Changes save automatically.</p>
        </header>

        <Section title="Account">
          <div className="space-y-4 py-4">
            <div>
              <label htmlFor="api-key" className="field-label">
                Drafted API key
              </label>
              <div className="relative">
                <input
                  id="api-key"
                  type={showApiKey ? 'text' : 'password'}
                  value={settings.drafted_api_key}
                  onChange={(e) => updateSettings({ drafted_api_key: e.target.value })}
                  placeholder="sk_..."
                  className="field pr-11 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="icon-btn absolute right-1 top-1/2 -translate-y-1/2"
                  aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                >
                  {showApiKey ? <EyeSlash size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="org-id" className="field-label">
                  Organization ID
                </label>
                <input
                  id="org-id"
                  type="text"
                  value={settings.drafted_org_id}
                  onChange={(e) => updateSettings({ drafted_org_id: e.target.value })}
                  placeholder="org_..."
                  className="field font-mono"
                />
              </div>
              <div>
                <label htmlFor="project-id" className="field-label">
                  Project ID
                </label>
                <input
                  id="project-id"
                  type="text"
                  value={settings.drafted_project_id}
                  onChange={(e) => updateSettings({ drafted_project_id: e.target.value })}
                  placeholder="proj_..."
                  className="field font-mono"
                />
              </div>
            </div>
          </div>
        </Section>

        <Section title="Capture">
          <Toggle
            title="Screenshot on every action"
            description="Take a screenshot each time you click, type or scroll."
            checked={settings.screenshot_on_action}
            onChange={(v) => updateSettings({ screenshot_on_action: v })}
          />
          <Toggle
            title="Record screen video"
            description="Also record the screen. Chrome asks which screen to share each time you start, and the video uploads with the session."
            checked={settings.record_video}
            onChange={(v) => updateSettings({ record_video: v })}
          />
          <Toggle
            title="Mask all input values"
            description="Hide everything typed into fields, not just passwords."
            checked={settings.mask_all_inputs}
            onChange={(v) => updateSettings({ mask_all_inputs: v })}
          />
          <div className="py-4">
            <div className="flex items-baseline justify-between">
              <label htmlFor="interval" className="text-sm font-medium text-text">
                Screenshot interval
              </label>
              <span className="text-sm tabular-nums text-text-muted">
                {(settings.screenshot_interval_ms / 1000).toFixed(1)} s
              </span>
            </div>
            <p className="mt-0.5 text-xs text-text-muted">
              How often to take a screenshot between actions, to catch changes on the page.
            </p>
            <input
              id="interval"
              type="range"
              min="1000"
              max="5000"
              step="100"
              value={settings.screenshot_interval_ms}
              onChange={(e) =>
                updateSettings({ screenshot_interval_ms: Number.parseInt(e.target.value, 10) })
              }
              className="mt-3 w-full accent-white"
            />
          </div>
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
            <div>
              <label htmlFor="blocklist" className="field-label">
                Never capture on
              </label>
              <textarea
                id="blocklist"
                value={settings.domain_blocklist.join('\n')}
                onChange={(e) => handleDomainBlocklistChange(e.target.value)}
                placeholder={'banking.example.com\nmail.google.com\n*.stripe.com'}
                rows={4}
                className="field font-mono"
              />
            </div>
          </div>
          <p className="pb-4 text-xs text-text-muted">
            One domain per line. <span className="font-mono">*.example.com</span> matches subdomains
            only, so list the bare domain too if you need it. The never-capture list always wins.
          </p>
        </Section>

        <Section title="Export formats">
          <Toggle
            title="Anthropic Messages"
            description="A /v1/messages request body with computer tool use."
            checked={settings.export_formats.anthropic}
            onChange={(v) =>
              updateSettings({ export_formats: { ...settings.export_formats, anthropic: v } })
            }
          />
          <Toggle
            title="OpenAI Responses"
            description="A /v1/responses request body with the computer tool."
            checked={settings.export_formats.openai}
            onChange={(v) =>
              updateSettings({ export_formats: { ...settings.export_formats, openai: v } })
            }
          />
          <Toggle
            title="Drafted Universal"
            description="The full session JSON with metadata, page elements and tasks."
            checked={settings.export_formats.universal}
            onChange={(v) =>
              updateSettings({ export_formats: { ...settings.export_formats, universal: v } })
            }
          />
          <Toggle
            title="Trajectory v1"
            description="The Drafted trajectory episode schema used for datasets."
            checked={settings.export_formats.trajectory}
            onChange={(v) =>
              updateSettings({ export_formats: { ...settings.export_formats, trajectory: v } })
            }
          />
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
          <p className="text-xs text-text-faint">Sidekick 1.0.0 by Drafted Labs</p>
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
