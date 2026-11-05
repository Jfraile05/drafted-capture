// ════════════════════════════════════════════════════════════════════════
//  Offscreen recorder.
//
//  A service worker cannot hold a MediaStream or run MediaRecorder, and the
//  popup closes the moment you click away. An offscreen document is a hidden
//  page that persists for the life of the recording, so it is the right place
//  to run MediaRecorder. The worker passes us a desktopCapture stream id; we
//  record the whole screen across every tab, and on stop we persist the webm
//  straight into IndexedDB (keyed by session id) so the worker/panel can pick
//  it up without shuttling a large blob through message passing.
// ════════════════════════════════════════════════════════════════════════

import { putRecording } from '../shared/storage/db';

interface StartMsg {
  target: 'offscreen';
  type: 'START_RECORDING';
  streamId: string;
  sessionId: string;
}
interface StopMsg {
  target: 'offscreen';
  type: 'STOP_RECORDING';
}

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let activeSessionId: string | null = null;
let stream: MediaStream | null = null;

chrome.runtime.onMessage.addListener((msg: StartMsg | StopMsg) => {
  if (msg?.target !== 'offscreen') return;
  if (msg.type === 'START_RECORDING') {
    void start(msg.streamId, msg.sessionId);
  } else if (msg.type === 'STOP_RECORDING') {
    stop();
  }
});

async function start(streamId: string, sessionId: string): Promise<void> {
  try {
    activeSessionId = sessionId;
    chunks = [];
    // The desktopCapture stream id is consumed via getUserMedia with the
    // chromeMediaSource constraint (the documented MV3 pattern).
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        // @ts-expect-error - chromeMediaSource constraints are not in lib.dom
        mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: streamId },
      },
    });

    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) =>
      MediaRecorder.isTypeSupported(m),
    );
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 2_500_000,
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      if (activeSessionId && blob.size > 0) {
        try {
          await putRecording(activeSessionId, blob);
          chrome.runtime
            .sendMessage({ type: 'RECORDING_SAVED', sessionId: activeSessionId, size: blob.size })
            .catch(() => {});
        } catch (err) {
          console.error('[offscreen] failed to persist recording', err);
        }
      }
      for (const t of stream?.getTracks() ?? []) t.stop();
      stream = null;
      recorder = null;
      chunks = [];
      activeSessionId = null;
    };

    // If the user stops sharing via Chrome's own control, finalize too.
    stream.getVideoTracks()[0]?.addEventListener('ended', () => stop());

    recorder.start(1000); // 1s timeslice so chunks flush during long sessions
  } catch (err) {
    console.error('[offscreen] start failed', err);
    chrome.runtime.sendMessage({ type: 'RECORDING_FAILED', error: String(err) }).catch(() => {});
  }
}

function stop(): void {
  if (recorder && recorder.state !== 'inactive') {
    recorder.stop();
  }
}
