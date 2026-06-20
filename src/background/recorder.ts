// ════════════════════════════════════════════════════════════════════════
//  Screen-recording controller (worker side).
//
//  Orchestrates the offscreen MediaRecorder:
//   - prompts the user once (desktopCapture) for a screen to record,
//   - spins up the offscreen document,
//   - tells it to start/stop, keyed to the capture session.
//
//  Recording is BEST-EFFORT and never blocks capture: if the user dismisses
//  the screen picker or the API is unavailable, screenshots + events still
//  record exactly as before. Video is an enrichment, not a requirement.
// ════════════════════════════════════════════════════════════════════════

const OFFSCREEN_PATH = 'src/offscreen/index.html';

let recording = false;

async function ensureOffscreen(): Promise<boolean> {
  try {
    const getContexts = (
      chrome.runtime as unknown as {
        getContexts?: (f: { contextTypes: string[] }) => Promise<unknown[]>;
      }
    ).getContexts;
    if (getContexts) {
      const contexts = await getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
      if (contexts && contexts.length > 0) return true;
    }
  } catch {
    // fall through to create
  }
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: 'Record the screen as computer-use training video while capture is on.',
    });
    return true;
  } catch (err) {
    // Most commonly: a document already exists (race) — treat as success.
    if (String(err).includes('Only a single offscreen')) return true;
    console.error('[recorder] failed to create offscreen document', err);
    return false;
  }
}

/** Prompt for a screen and begin recording into the given session. Resolves
 *  true if recording started, false if unavailable or user-cancelled. */
export async function startRecording(sessionId: string): Promise<boolean> {
  if (recording) return true;
  if (!chrome.desktopCapture?.chooseDesktopMedia) return false;

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

  const streamId = await new Promise<string>((resolve) => {
    try {
      chrome.desktopCapture.chooseDesktopMedia(
        ['screen', 'window', 'tab'],
        tab as chrome.tabs.Tab,
        (id) => resolve(id || ''),
      );
    } catch {
      resolve('');
    }
  });

  if (!streamId) return false; // user cancelled or unavailable

  const ready = await ensureOffscreen();
  if (!ready) return false;

  chrome.runtime
    .sendMessage({ target: 'offscreen', type: 'START_RECORDING', streamId, sessionId })
    .catch(() => {});
  recording = true;
  return true;
}

/** Stop recording. The offscreen doc persists the webm to IndexedDB on stop. */
export async function stopRecording(): Promise<void> {
  if (!recording) return;
  recording = false;
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'STOP_RECORDING' }).catch(() => {});
  // Give MediaRecorder a moment to flush + persist, then tear down the doc.
  setTimeout(() => {
    chrome.offscreen?.closeDocument?.().catch(() => {});
  }, 1500);
}

export function isRecording(): boolean {
  return recording;
}
