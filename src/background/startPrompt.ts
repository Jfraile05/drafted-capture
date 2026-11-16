// Suggests starting a recording when the student is browsing with Sidekick
// off. A few page loads in a short window count as "working". It asks at most
// once per cooldown, and never on pages the student blocked from capture.

import { getLiveSession, getSettings } from '../shared/storage/live';
import { siteAllowed } from '../shared/utils/siteAccess';
import { selectedWorkflow } from '../shared/workflows';
import { startCapture } from './session';
import { getWorkflowAccess } from './workflows';

export const START_PROMPT = {
  notificationId: 'sidekick-start',
  stateKey: 'drafted_start_prompt',
  pageLoads: 3,
  windowMs: 5 * 60_000,
  cooldownMs: 2 * 60 * 60_000,
} as const;

interface PromptState {
  loads: number[];
  last_prompt_at: number;
}

async function readState(): Promise<PromptState> {
  const value = (await chrome.storage.local.get(START_PROMPT.stateKey))[START_PROMPT.stateKey];
  return {
    loads: Array.isArray(value?.loads) ? value.loads : [],
    last_prompt_at: typeof value?.last_prompt_at === 'number' ? value.last_prompt_at : 0,
  };
}

/** Called for each finished page load. Shows the prompt once the threshold is met. */
export async function noteBrowsing(url: string, incognito?: boolean): Promise<void> {
  if (!/^https?:/.test(url)) return;
  if (await getLiveSession()) {
    await clearStartPrompt();
    return;
  }
  const settings = await getSettings();
  if (!settings.consent_accepted || !settings.start_nudges) return;
  if (!siteAllowed(url, settings, { incognito })) return;

  const now = Date.now();
  const state = await readState();
  state.loads = [...state.loads.filter((t) => now - t < START_PROMPT.windowMs), now];
  const due =
    state.loads.length >= START_PROMPT.pageLoads &&
    now - state.last_prompt_at >= START_PROMPT.cooldownMs;
  if (due) {
    state.loads = [];
    state.last_prompt_at = now;
  }
  await chrome.storage.local.set({ [START_PROMPT.stateKey]: state });
  if (!due || !chrome.notifications) return;

  // Only offer a one-click start when a workflow is already chosen.
  const access = await getWorkflowAccess().catch(() => null);
  const workflowId = access && (await selectedWorkflow(access.uid));
  const workflow = access?.workflows.find((item) => item.id === workflowId);
  if (!workflow) return;

  await chrome.notifications.create(START_PROMPT.notificationId, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title: 'Get paid for this?',
    message: `Looks like you're working. Start recording ${workflow.name} with Sidekick to earn while you browse.`,
    buttons: [{ title: 'Start recording' }, { title: 'Not now' }],
    priority: 1,
  });
}

/** Handles the prompt's buttons. Returns false for other notifications. */
export function handleStartPromptButton(notificationId: string, buttonIndex: number): boolean {
  if (notificationId !== START_PROMPT.notificationId) return false;
  void chrome.notifications.clear(notificationId);
  if (buttonIndex === 0) {
    startCapture().catch((err) => console.warn('[bg] start prompt failed:', err));
  }
  return true;
}

export async function clearStartPrompt(): Promise<void> {
  await chrome.notifications?.clear(START_PROMPT.notificationId);
}
