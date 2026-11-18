import { idleThreshold } from '../config/idle';
import { PRIVACY_CONFIG } from '../config/privacy';
import { scanPrivacy } from '../content/privacyScan';
import type { PrivacyGate, PrivacyPermit, PrivacyPolicy, PrivacyReason } from '../shared/privacy';
import { privacyReasonsForUrl } from '../shared/privacy';
import { getLiveSession, getSettings, setLiveSession, withLiveLock } from '../shared/storage/live';
import type { LiveSession } from '../shared/types';
import { sha256 } from '../shared/utils/crypto';
import { siteAllowed } from '../shared/utils/siteAccess';
import { getPrivacyPolicy } from './privacyPolicy';
import { rebroadcastCaptureState, resumeCapture } from './session';

interface Inspection {
  tab_id: number;
  url: string;
  domain: string;
  signature: string;
  location: string;
  /** Sensitive reasons only. A failed check never asks the student to approve anything. */
  reasons: PrivacyReason[];
  /** The page could not be fully checked, so nothing from it is captured right now. */
  unavailable: boolean;
}

/** Sensitive content the student has not approved yet this session. */
function needsApproval(live: LiveSession, screen: Inspection): boolean {
  return screen.reasons.length > 0 && !live.privacy_approvals?.includes(screen.signature);
}

function leftGatedPage(gate: PrivacyGate, screen: Inspection): boolean {
  return gate.location
    ? gate.location !== screen.location
    : gate.tab_id !== screen.tab_id || gate.domain !== screen.domain;
}

const SITE_PAUSE_REASONS = new Set<PrivacyReason>(PRIVACY_CONFIG.sitePauseReasons);
/** Only an inbox on the page itself pauses. Fields are masked, not paused. */
const PAGE_PAUSE_REASONS = new Set<PrivacyReason>(['messaging', 'unavailable']);

function sitePauseReasons(url: string, policy: PrivacyPolicy): PrivacyReason[] {
  return privacyReasonsForUrl(url, policy).filter((reason) => SITE_PAUSE_REASONS.has(reason));
}

async function inspect(tab: chrome.tabs.Tab, url = tab.url ?? ''): Promise<Inspection | null> {
  if (tab.id === undefined || tab.incognito || !/^https?:\/\//.test(url)) return null;
  const policy = await getPrivacyPolicy();
  const reasons = new Set(sitePauseReasons(url, policy));
  const host = new URL(url).hostname;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const frames = await Promise.race([
      chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: scanPrivacy,
        args: [PRIVACY_CONFIG],
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Inspection timeout')),
          PRIVACY_CONFIG.inspectionTimeoutMs,
        );
      }),
    ]);
    // Single page apps (Google Flights, search) rewrite the URL constantly, so the
    // tab URL can lag the page. The top frame only has to be ready on the same site.
    const top = frames?.find((frame) => frame.frameId === 0)?.result;
    if (!top?.ready || hostOf(top.url) !== host) reasons.add('unavailable');
    for (const frame of frames ?? []) {
      const scan = frame.result;
      // A child frame that is still loading has nothing on screen yet.
      if (!scan || !scan.ready) continue;
      for (const reason of scan.reasons) if (PAGE_PAUSE_REASONS.has(reason)) reasons.add(reason);
      for (const reason of sitePauseReasons(scan.url, policy)) reasons.add(reason);
      for (const frameUrl of scan.frames)
        for (const reason of sitePauseReasons(frameUrl, policy)) reasons.add(reason);
    }
  } catch {
    reasons.add('unavailable');
  } finally {
    clearTimeout(timer);
  }
  const unavailable = reasons.delete('unavailable');
  const sortedReasons = [...reasons].sort();
  // One approval covers the site for the rest of the session, as long as the
  // same kinds of sensitive content are on screen. New kinds ask again.
  const signature = await sha256(
    new TextEncoder().encode(JSON.stringify([policy.version, host, sortedReasons])).buffer,
  );
  const location = await sha256(new TextEncoder().encode(JSON.stringify([tab.id, url])).buffer);
  return {
    tab_id: tab.id,
    url,
    domain: host,
    signature,
    location,
    reasons: sortedReasons,
    unavailable,
  };
}

function hostOf(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
}

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  return (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
}

async function gateScreen(sessionId: string, screen: Inspection, epoch: number): Promise<void> {
  const tab = await activeTab();
  if (tab?.id !== screen.tab_id || tab.url !== screen.url) return;
  await withLiveLock(async () => {
    const live = await getLiveSession();
    if (!live || live.id !== sessionId || (live.privacy_epoch ?? 0) !== epoch) return;
    if (!needsApproval(live, screen)) return;
    if (live.privacy_gate?.signature === screen.signature) return;
    live.privacy_gate = {
      id: crypto.randomUUID(),
      tab_id: screen.tab_id,
      domain: screen.domain,
      signature: screen.signature,
      location: screen.location,
      reasons: screen.reasons,
    };
    live.pause_reason = undefined;
    live.privacy_epoch = (live.privacy_epoch ?? 0) + 1;
    if (live.state === 'capturing') {
      const now = Date.now();
      const lastActivity = live.last_activity_at ?? now;
      const overdue = now - lastActivity >= idleThreshold((await getSettings()).idle_timeout_ms);
      live.paused_at = overdue
        ? Math.max(live.pauses?.at(-1)?.[1] ?? live.started_at, lastActivity)
        : now;
      live.state = 'paused';
    }
    await setLiveSession(live);
  });
  // Persist the pause first. Slow pages cannot hold up Stop or allow another frame.
  void rebroadcastCaptureState().catch(() => {});
}

/** Every frame and action needs a fresh inspection of the active page. */
export async function capturePermit(
  tabId: number | undefined,
  url: string,
): Promise<PrivacyPermit | null> {
  const live = await getLiveSession();
  if (!live || live.state !== 'capturing' || live.privacy_gate || tabId === undefined) return null;
  const tab = await activeTab();
  if (tab?.id !== tabId || tab.url !== url) return null;
  const screen = await inspect(tab);
  if (!screen) return null;
  if (needsApproval(live, screen)) {
    await gateScreen(live.id, screen, live.privacy_epoch ?? 0);
    return null;
  }
  // Skip this frame quietly. The next check after the page settles captures it.
  if (screen.unavailable) return null;
  return withLiveLock(async () => {
    const current = await getLiveSession();
    if (
      !current ||
      current.id !== live.id ||
      current.state !== 'capturing' ||
      current.privacy_gate ||
      (current.privacy_epoch ?? 0) !== (live.privacy_epoch ?? 0)
    )
      return null;
    return {
      session_id: live.id,
      epoch: live.privacy_epoch ?? 0,
      tab_id: tabId,
      url,
      signature: screen.signature,
    };
  });
}

export async function validatePermit(permit: PrivacyPermit): Promise<boolean> {
  const fresh = await capturePermit(permit.tab_id, permit.url);
  return (
    !!fresh &&
    fresh.session_id === permit.session_id &&
    fresh.epoch === permit.epoch &&
    fresh.signature === permit.signature
  );
}

/** Called at start, navigation, and page mutation, also while already gated. */
export async function checkCurrentScreen(navigationTabId?: number): Promise<void> {
  const live = await getLiveSession();
  if (
    !live ||
    (live.state !== 'capturing' &&
      !live.privacy_gate &&
      !(navigationTabId !== undefined && live.pause_reason === 'idle'))
  )
    return;
  const tab = await activeTab();
  if (!tab) return;
  if (navigationTabId !== undefined && tab.id !== navigationTabId) return;
  const screen = await inspect(tab);
  if (screen && needsApproval(live, screen)) {
    await gateScreen(live.id, screen, live.privacy_epoch ?? 0);
  } else if (
    screen &&
    !screen.unavailable &&
    live.state === 'paused' &&
    siteAllowed(screen.url, await getSettings(), tab)
  ) {
    const gate = live.privacy_gate;
    if (gate && leftGatedPage(gate, screen))
      await resumeCapture({ session_id: live.id }, undefined, false, gate.id);
    else if (!gate && live.pause_reason === 'idle' && navigationTabId !== undefined)
      await resumeCapture({ session_id: live.id }, undefined, true);
  }
}

/** Reinspect before resume. A normal Resume or shortcut never grants consent. */
export async function prepareResume(
  sessionId: string,
  gateId?: string,
  automaticGateId?: string,
): Promise<boolean> {
  const live = await getLiveSession();
  if (!live || live.id !== sessionId) return false;
  const tab = await activeTab();
  const screen = tab ? await inspect(tab) : null;
  if (!screen) {
    if (live.privacy_gate)
      throw new Error('Switch to a webpage and review the privacy prompt again.');
    return true;
  }
  const gate = live.privacy_gate;
  if (
    automaticGateId &&
    (!gate ||
      !leftGatedPage(gate, screen) ||
      screen.unavailable ||
      !siteAllowed(screen.url, await getSettings(), tab))
  )
    return false;
  if (
    needsApproval(live, screen) &&
    (!gateId || gate?.id !== gateId || gate.signature !== screen.signature)
  ) {
    await gateScreen(sessionId, screen, live.privacy_epoch ?? 0);
    return false;
  }
  return withLiveLock(async () => {
    const current = await getLiveSession();
    if (!current || current.id !== sessionId || current.privacy_gate?.id !== gate?.id) return false;
    if (
      automaticGateId &&
      (current.privacy_gate?.id !== automaticGateId ||
        (current.privacy_epoch ?? 0) !== (live.privacy_epoch ?? 0) ||
        needsApproval(current, screen))
    )
      return false;
    if (needsApproval(current, screen)) {
      if (current.privacy_gate?.signature !== screen.signature) return false;
      current.privacy_approvals = [...(current.privacy_approvals ?? []), screen.signature];
    }
    current.privacy_gate = undefined;
    current.privacy_epoch = (current.privacy_epoch ?? 0) + 1;
    await setLiveSession(current);
    return true;
  });
}

export async function keepPrivacyPaused(gateId: string): Promise<void> {
  await withLiveLock(async () => {
    const live = await getLiveSession();
    if (live?.privacy_gate?.id !== gateId) return;
    live.privacy_gate.kept_paused = true;
    await setLiveSession(live);
  });
  void rebroadcastCaptureState().catch(() => {});
}

export async function invalidatePrivacyApproval(tabId?: number): Promise<void> {
  if (tabId !== undefined && (await activeTab())?.id !== tabId) return;
  await withLiveLock(async () => {
    const live = await getLiveSession();
    if (!live) return;
    live.privacy_approvals = undefined;
    live.privacy_epoch = (live.privacy_epoch ?? 0) + 1;
    await setLiveSession(live);
  });
}
