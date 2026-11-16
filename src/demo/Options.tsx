import { useEffect, useState } from 'react';
import { PRIVACY_CONFIG } from '../config/privacy';
import { Options as CaptureOptions } from '../options/Options';
import { formatEarnings } from '../shared/earnings';
import { BUILTIN_PRIVACY_POLICY } from '../shared/privacy';
import { listSessions, updateSession } from '../shared/storage/db';
import { getLiveSession } from '../shared/storage/live';
import { DEMO } from './config';
import { type SyntheticReceipt, readReceipts } from './submitToDrafted';

export function Options() {
  const [offline, setOffline] = useState(false);
  const [receipts, setReceipts] = useState<SyntheticReceipt[]>([]);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const refresh = () => {
      void chrome.storage.local.get(DEMO.offlineKey).then((v) => setOffline(!!v[DEMO.offlineKey]));
      void readReceipts().then((v) => setReceipts(Object.values(v)));
    };
    refresh();
    chrome.storage.onChanged.addListener(refresh);
    return () => chrome.storage.onChanged.removeListener(refresh);
  }, []);
  const run = (fn: () => Promise<void>) => void fn().catch((e) => setNotice(String(e)));
  async function setConnection() {
    await chrome.storage.local.set({ [DEMO.offlineKey]: !offline });
    if (offline) {
      for (const s of await listSessions())
        if (s.sync)
          await updateSession(s.id, (current) =>
            current.sync
              ? {
                  ...current,
                  sync: { ...current.sync, retry_at: 0 },
                }
              : current,
          );
      await chrome.runtime.sendMessage({ type: 'WAKE_SYNC' });
    }
    setNotice(
      offline
        ? 'Receiver online. Pending sessions retry automatically.'
        : 'Receiver offline. Stop a task or save a label to test queuing.',
    );
  }
  async function simulate(name: string) {
    if ((await getLiveSession())?.state !== 'capturing')
      throw new Error('Start or resume a task first.');
    await chrome.alarms.create(name, { when: Date.now() + 100 });
    setNotice(
      name.endsWith('idle')
        ? 'Simulated idle gap. Choose Continue on the same page, or open a new safe test page to resume.'
        : 'Simulated 24-hour clock. The session should stop automatically.',
    );
  }
  async function publishPolicy(add: boolean) {
    const cached = (await chrome.storage.local.get(PRIVACY_CONFIG.cacheKey))[
      PRIVACY_CONFIG.cacheKey
    ];
    const policy = structuredClone(BUILTIN_PRIVACY_POLICY);
    policy.version = Math.max(cached?.version ?? 1, Date.now()) + 1;
    if (add) policy.domains.banking.push('work.localhost');
    await chrome.storage.local.set({ synthetic_remote_policy: policy });
    await chrome.alarms.create(PRIVACY_CONFIG.alarmName, { when: Date.now() + 100 });
    setNotice(
      add
        ? 'Published simulated policy: the productivity test site now requires confirmation.'
        : 'Restored the bundled synthetic policy with a newer revision.',
    );
  }
  const total = receipts.reduce(
    (sum, r) =>
      sum + (r.earnings?.total_earnings_micro_usd ?? r.earnings?.base_earnings_micro_usd ?? 0),
    0,
  );
  return (
    <>
      <main className="mx-auto max-w-3xl space-y-5 p-6">
        <header>
          <p className="text-sm text-orange">Synthetic project · local only</p>
          <h1 className="mt-2 text-3xl font-semibold">Test the full loop.</h1>
          <p className="mt-3 text-sm text-text-muted">
            The real extension UI, recorder, privacy gate, timer, review tools and retry queue run
            against a local simulated receiver. No Firebase calls or real payments.
          </p>
        </header>
        <a
          className="btn-primary inline-flex"
          href={`http://localhost:${DEMO.port}/`}
          target="_blank"
          rel="noreferrer"
        >
          Open test workspace
        </a>
        <section className="space-y-3 rounded-card border border-white/10 p-4">
          <h2 className="font-medium">Test controls</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" onClick={() => run(setConnection)}>
              {offline ? 'Bring receiver online' : 'Take receiver offline'}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => run(() => simulate('synthetic-test-idle'))}
            >
              Simulate 3 minutes idle
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => run(() => simulate('synthetic-test-cap'))}
            >
              Simulate 24-hour cap
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => run(() => publishPolicy(true))}
            >
              Gate productivity site
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => run(() => publishPolicy(false))}
            >
              Restore privacy policy
            </button>
          </div>
          <output className="block text-sm text-text-muted">
            {notice || 'Use only the local test pages. Keep the production extension stopped.'}
          </output>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Simulated receipt ledger</h2>
          <p className="text-sm text-text-muted">
            {receipts.length} unique receipts · {formatEarnings(total)} simulated total ·{' '}
            {offline ? 'Offline' : 'Online'}
          </p>
          <p className="text-xs text-text-muted">
            A receipt confirms this local simulator accepted the revision. It does not prove
            delivery to Drafted. Label edits should update the same receipt, not add another.
          </p>
          {receipts.map((r) => (
            <details key={r.id} className="rounded-card border border-white/10 p-3">
              <summary className="cursor-pointer text-sm">
                {r.labels[0] || 'Recorded task'} · revision {r.revision} · {r.steps} steps
              </summary>
              <pre className="mt-3 overflow-auto whitespace-pre-wrap break-all text-xs text-text-muted">
                {JSON.stringify(r, null, 2)}
              </pre>
            </details>
          ))}
        </section>
      </main>
      <CaptureOptions />
    </>
  );
}
