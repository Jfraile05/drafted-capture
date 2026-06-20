import { Eye, EyeSlash, GearSix, ShieldCheck, UploadSimple } from '@phosphor-icons/react';
import { useState } from 'react';
import { useSettings } from '../shared/hooks';

export function Options() {
  const [settings, updateSettings] = useSettings();
  const [showApiKey, setShowApiKey] = useState(false);

  const handleDomainBlocklistChange = (value: string) => {
    const domains = value
      .split('\n')
      .map((d) => d.trim())
      .filter(Boolean);
    updateSettings({ domain_blocklist: domains });
  };

  const handleResetOnboarding = () => {
    updateSettings({ onboarding_complete: false });
    alert('Onboarding reset. Close this page and reopen the extension to see the welcome flow.');
  };

  const handleOpenPanel = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.sidePanel?.open({ windowId: tab.windowId });
    }
  };

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-3xl space-y-8">
        {/* Header */}
        <header className="space-y-2">
          <h1 className="wordmark text-3xl">
            drafted<span className="dot">.</span> Capture
          </h1>
          <p className="text-text-muted">
            Configure your ambient trajectory recorder. Changes save automatically.
          </p>
        </header>

        {/* Account Section */}
        <section className="card space-y-6 p-6">
          <div className="flex items-center gap-3">
            <ShieldCheck size={24} className="text-green" />
            <h2 className="text-xl font-semibold">Account</h2>
          </div>

          <div className="space-y-4">
            {/* API Key */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text-muted">
                Drafted API Key
                <div className="relative mt-2">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={settings.drafted_api_key}
                    onChange={(e) => updateSettings({ drafted_api_key: e.target.value })}
                    placeholder="sk_..."
                    className="w-full rounded-input border border-[var(--border)] bg-bg-input px-4 py-2.5 pr-12 font-mono text-sm text-text outline-none transition focus:border-[var(--border-active)] focus:ring-2 focus:ring-green/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted transition hover:text-text"
                  >
                    {showApiKey ? <EyeSlash size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
            </div>

            {/* Org ID */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text-muted">
                Organization ID
                <input
                  type="text"
                  value={settings.drafted_org_id}
                  onChange={(e) => updateSettings({ drafted_org_id: e.target.value })}
                  placeholder="org_..."
                  className="mt-2 w-full rounded-input border border-[var(--border)] bg-bg-input px-4 py-2.5 font-mono text-sm text-text outline-none transition focus:border-[var(--border-active)] focus:ring-2 focus:ring-green/10"
                />
              </label>
            </div>

            {/* Project ID */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text-muted">
                Project ID
                <input
                  type="text"
                  value={settings.drafted_project_id}
                  onChange={(e) => updateSettings({ drafted_project_id: e.target.value })}
                  placeholder="proj_..."
                  className="mt-2 w-full rounded-input border border-[var(--border)] bg-bg-input px-4 py-2.5 font-mono text-sm text-text outline-none transition focus:border-[var(--border-active)] focus:ring-2 focus:ring-green/10"
                />
              </label>
            </div>
          </div>
        </section>

        {/* Capture Section */}
        <section className="card space-y-6 p-6">
          <div className="flex items-center gap-3">
            <GearSix size={24} className="text-violet" />
            <h2 className="text-xl font-semibold">Capture</h2>
          </div>

          <div className="space-y-5">
            {/* Screenshot on Action */}
            <div className="flex items-center justify-between">
              <div>
                <div className="block font-medium">Screenshot on every action</div>
                <p className="text-sm text-text-muted">
                  Capture a screenshot each time you click, type, or scroll.
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.screenshot_on_action}
                onChange={(e) => updateSettings({ screenshot_on_action: e.target.checked })}
                className="h-5 w-5 cursor-pointer accent-green"
                aria-label="Screenshot on every action"
              />
            </div>

            {/* Screenshot Interval */}
            <div className="space-y-2">
              <div className="block font-medium">
                Screenshot interval (ms)
                <span className="ml-2 font-mono text-sm text-text-muted">
                  {settings.screenshot_interval_ms}
                </span>
              </div>
              <input
                type="range"
                min="1000"
                max="5000"
                step="100"
                value={settings.screenshot_interval_ms}
                onChange={(e) =>
                  updateSettings({ screenshot_interval_ms: Number.parseInt(e.target.value, 10) })
                }
                className="w-full"
                aria-label="Screenshot interval in milliseconds"
              />
              <p className="text-sm text-text-muted">
                Periodic screenshot cadence to catch passive state changes.
              </p>
            </div>

            {/* Mask All Inputs */}
            <div className="flex items-center justify-between">
              <div>
                <div className="block font-medium">Mask all input values</div>
                <p className="text-sm text-text-muted">
                  Hide all text input values (not just passwords).
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.mask_all_inputs}
                onChange={(e) => updateSettings({ mask_all_inputs: e.target.checked })}
                className="h-5 w-5 cursor-pointer accent-green"
                aria-label="Mask all input values"
              />
            </div>

            {/* Max Steps */}
            <div className="space-y-2">
              <label className="block font-medium">
                Max steps per session
                <input
                  type="number"
                  min="100"
                  max="10000"
                  step="100"
                  value={settings.max_steps}
                  onChange={(e) =>
                    updateSettings({ max_steps: Number.parseInt(e.target.value, 10) })
                  }
                  className="mt-2 w-full rounded-input border border-[var(--border)] bg-bg-input px-4 py-2.5 font-mono text-sm text-text outline-none transition focus:border-[var(--border-active)] focus:ring-2 focus:ring-violet/10"
                />
              </label>
              <p className="text-sm text-text-muted">
                Automatically stop capture after this many steps.
              </p>
            </div>

            {/* Max Duration */}
            <div className="space-y-2">
              <label className="block font-medium">
                Max duration (minutes)
                <input
                  type="number"
                  min="10"
                  max="480"
                  step="10"
                  value={Math.round(settings.max_duration_ms / 60000)}
                  onChange={(e) =>
                    updateSettings({ max_duration_ms: Number.parseInt(e.target.value, 10) * 60000 })
                  }
                  className="mt-2 w-full rounded-input border border-[var(--border)] bg-bg-input px-4 py-2.5 font-mono text-sm text-text outline-none transition focus:border-[var(--border-active)] focus:ring-2 focus:ring-violet/10"
                />
              </label>
              <p className="text-sm text-text-muted">
                Automatically stop capture after this many minutes.
              </p>
            </div>
          </div>
        </section>

        {/* Privacy Section */}
        <section className="card space-y-6 p-6">
          <div className="flex items-center gap-3">
            <ShieldCheck size={24} className="text-orange" />
            <h2 className="text-xl font-semibold">Privacy</h2>
          </div>

          <div className="space-y-2">
            <label className="block font-medium">
              Domain blocklist
              <textarea
                value={settings.domain_blocklist.join('\n')}
                onChange={(e) => handleDomainBlocklistChange(e.target.value)}
                placeholder={'banking.example.com\nmail.google.com\n*.stripe.com'}
                rows={5}
                className="mt-2 w-full rounded-input border border-[var(--border)] bg-bg-input px-4 py-2.5 font-mono text-sm text-text outline-none transition focus:border-[var(--border-active)] focus:ring-2 focus:ring-orange/10"
              />
            </label>
            <p className="text-sm text-text-muted">
              Domains to never capture on. One pattern per line. Wildcards supported.
            </p>
          </div>
        </section>

        {/* Export Section */}
        <section className="card space-y-6 p-6">
          <div className="flex items-center gap-3">
            <UploadSimple size={24} className="text-coral" />
            <h2 className="text-xl font-semibold">Export</h2>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-text-muted">
              Choose which formats to include when exporting a session.
            </p>

            <div className="space-y-3">
              {/* Anthropic */}
              <label className="flex cursor-pointer items-center gap-3 rounded-btn border border-[var(--border)] bg-bg-input p-3 transition hover:border-[var(--border-active)]">
                <input
                  type="checkbox"
                  checked={settings.export_formats.anthropic}
                  onChange={(e) =>
                    updateSettings({
                      export_formats: {
                        ...settings.export_formats,
                        anthropic: e.target.checked,
                      },
                    })
                  }
                  className="h-4 w-4 accent-green"
                />
                <div>
                  <div className="font-medium">Anthropic Messages</div>
                  <div className="text-xs text-text-muted">
                    Valid POST /v1/messages body with computer tool use
                  </div>
                </div>
              </label>

              {/* OpenAI */}
              <label className="flex cursor-pointer items-center gap-3 rounded-btn border border-[var(--border)] bg-bg-input p-3 transition hover:border-[var(--border-active)]">
                <input
                  type="checkbox"
                  checked={settings.export_formats.openai}
                  onChange={(e) =>
                    updateSettings({
                      export_formats: {
                        ...settings.export_formats,
                        openai: e.target.checked,
                      },
                    })
                  }
                  className="h-4 w-4 accent-green"
                />
                <div>
                  <div className="font-medium">OpenAI Responses</div>
                  <div className="text-xs text-text-muted">
                    Valid POST /v1/responses body with computer tool
                  </div>
                </div>
              </label>

              {/* Universal */}
              <label className="flex cursor-pointer items-center gap-3 rounded-btn border border-[var(--border)] bg-bg-input p-3 transition hover:border-[var(--border-active)]">
                <input
                  type="checkbox"
                  checked={settings.export_formats.universal}
                  onChange={(e) =>
                    updateSettings({
                      export_formats: {
                        ...settings.export_formats,
                        universal: e.target.checked,
                      },
                    })
                  }
                  className="h-4 w-4 accent-green"
                />
                <div>
                  <div className="font-medium">Drafted Universal</div>
                  <div className="text-xs text-text-muted">
                    Full Session JSON with all metadata, DOM, segments
                  </div>
                </div>
              </label>

              {/* Trajectory */}
              <label className="flex cursor-pointer items-center gap-3 rounded-btn border border-[var(--border)] bg-bg-input p-3 transition hover:border-[var(--border-active)]">
                <input
                  type="checkbox"
                  checked={settings.export_formats.trajectory}
                  onChange={(e) =>
                    updateSettings({
                      export_formats: {
                        ...settings.export_formats,
                        trajectory: e.target.checked,
                      },
                    })
                  }
                  className="h-4 w-4 accent-green"
                />
                <div>
                  <div className="font-medium">Trajectory v1</div>
                  <div className="text-xs text-text-muted">
                    Drafted Trajectory Episode Schema (dataset ingest format)
                  </div>
                </div>
              </label>
            </div>
          </div>
        </section>

        {/* Actions */}
        <section className="flex gap-4">
          <button
            type="button"
            onClick={handleOpenPanel}
            className="rounded-btn border border-[var(--border)] bg-bg-card px-4 py-2.5 text-sm font-medium text-text transition hover:border-[var(--border-active)] hover:bg-bg-card-hover"
          >
            Open Review Panel
          </button>
          <button
            type="button"
            onClick={handleResetOnboarding}
            className="rounded-btn border border-[var(--border)] bg-bg-card px-4 py-2.5 text-sm font-medium text-text-muted transition hover:border-[var(--border-active)] hover:bg-bg-card-hover hover:text-text"
          >
            Reset Onboarding
          </button>
        </section>

        {/* Footer */}
        <footer className="border-t border-[var(--border)] pt-6 text-center text-sm text-text-muted">
          <p>
            drafted<span className="text-green">.</span> Capture v1.0.0
          </p>
        </footer>
      </div>
    </div>
  );
}
