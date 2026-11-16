import './sync';
import { PRIVACY_CONFIG } from '../config/privacy';
// The hidden offscreen page owns the video stream while the popup is closed.
import { putRecording } from '../shared/storage/db';

interface RecordingMessage {
  target: 'offscreen';
  type: 'START_RECORDING' | 'PAUSE_RECORDING' | 'RESUME_RECORDING' | 'STOP_RECORDING';
  streamId?: string;
  sessionId?: string;
}

interface Recording {
  sessionId: string;
  recorder: MediaRecorder | null;
  stream: MediaStream | null;
  chunks: Blob[];
  paused: boolean;
  stopped: boolean;
  done: Promise<void>;
  finish: () => void;
}
let active: Recording | null = null;

chrome.runtime.onMessage.addListener((msg: RecordingMessage, _sender, sendResponse) => {
  if (
    msg?.target !== 'offscreen' ||
    !['START_RECORDING', 'PAUSE_RECORDING', 'RESUME_RECORDING', 'STOP_RECORDING'].includes(msg.type)
  )
    return;
  if (msg.type === 'START_RECORDING' && msg.streamId && msg.sessionId) {
    if (!PRIVACY_CONFIG.continuousVideoEnabled) {
      sendResponse({
        error: 'Continuous video is disabled while managed privacy gates are active.',
      });
      return;
    }
    void start(msg.streamId, msg.sessionId).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'STOP_RECORDING') {
    void stop().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (active && (msg.type === 'PAUSE_RECORDING' || msg.type === 'RESUME_RECORDING')) {
    active.paused = msg.type === 'PAUSE_RECORDING';
    applyPause(active);
  }
  sendResponse({ ok: true });
});

function applyPause(run: Recording): void {
  if (run.stopped) return;
  if (run.paused && run.recorder?.state === 'recording') run.recorder.pause();
  else if (!run.paused && run.recorder?.state === 'paused') run.recorder.resume();
}

async function start(streamId: string, sessionId: string): Promise<void> {
  if (active?.sessionId === sessionId && !active.stopped) return;
  if (active) await stop();
  let finish!: () => void;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const run: Recording = {
    sessionId,
    recorder: null,
    stream: null,
    chunks: [],
    paused: false,
    stopped: false,
    done,
    finish,
  };
  active = run;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        // @ts-expect-error - Chrome desktop capture constraints are not in lib.dom
        mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: streamId },
      },
    });
    if (run.stopped) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    run.stream = stream;
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((value) =>
      MediaRecorder.isTypeSupported(value),
    );
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
    run.recorder = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) run.chunks.push(event.data);
    };
    // Honor the newest intent even if a media state event arrives later.
    recorder.onpause = () => applyPause(run);
    recorder.onresume = () => applyPause(run);
    recorder.onstop = async () => {
      run.stopped = true;
      try {
        const blob = new Blob(run.chunks, { type: 'video/webm' });
        if (blob.size > 0) {
          await putRecording(run.sessionId, blob);
          void chrome.runtime
            .sendMessage({
              type: 'RECORDING_SAVED',
              sessionId: run.sessionId,
              size: blob.size,
            })
            .catch(() => {});
        }
      } catch (error) {
        console.error('[offscreen] failed to persist recording', error);
      } finally {
        for (const track of stream.getTracks()) track.stop();
        if (active === run) active = null;
        run.finish();
      }
    };
    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (active === run) void stop();
    });
    recorder.start(1000);
    applyPause(run);
  } catch (error) {
    run.stopped = true;
    for (const track of run.stream?.getTracks() ?? []) track.stop();
    if (active === run) active = null;
    run.finish();
    void chrome.runtime
      .sendMessage({ type: 'RECORDING_FAILED', error: String(error) })
      .catch(() => {});
  }
}

function stop(): Promise<void> {
  const run = active;
  if (!run) return Promise.resolve();
  run.stopped = true;
  if (!run.recorder) {
    // A pending getUserMedia result will stop its tracks instead of recording.
    active = null;
    run.finish();
  } else if (run.recorder.state !== 'inactive') {
    run.recorder.stop();
  }
  return run.done;
}
