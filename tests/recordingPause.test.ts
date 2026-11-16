import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { startRecording, resumeRecording } from '../src/background/recorder';
import { PRIVACY_CONFIG } from '../src/config/privacy';

let listener: (message: unknown, sender: unknown, respond: (value: unknown) => void) => unknown;
let mediaRequests = 0;
Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
  getUserMedia: async () => { mediaRequests++; throw Error('Video must not start'); },
} });
const sent: unknown[] = [];
globalThis.chrome = { runtime: {
  onMessage: { addListener: (callback: typeof listener) => { listener = callback; } },
  sendMessage: async (message: unknown) => { sent.push(message); },
} } as any;
await import('../src/offscreen/index');

describe('continuous video cannot bypass privacy gates', () => {
  it('does not open a screen picker or start or resume video from the worker', async () => {
    assert.equal(PRIVACY_CONFIG.continuousVideoEnabled, false);
    assert.equal(await startRecording('session'), false);
    await resumeRecording();
    assert.equal(sent.length, 0);
  });
  it('rejects direct offscreen recording requests without requesting a stream', async () => {
    let response: any;
    listener({ target: 'offscreen', type: 'START_RECORDING', sessionId: 'session', streamId: 'stream' }, {}, value => { response = value; });
    assert.match(response.error, /disabled/);
    assert.equal(mediaRequests, 0);
  });
});
