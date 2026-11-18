import { putScreenshot, putSession } from '../shared/storage/db';
import { DEMO, DEMO_WORKFLOWS } from './config';
import { fixtureImage, fixtureSessions } from './fixtures';
import { readLocal, writeLocal } from './storage';

export async function seedDemo(): Promise<void> {
  await navigator.locks.request('synthetic-seed', async () => {
    if (await readLocal(DEMO.seedKey)) return;
    for (const session of fixtureSessions(Date.now())) {
      for (const step of session.steps) {
        const blob = fixtureImage(session, step);
        if (step.screenshot) {
          step.screenshot.size = blob.size;
          await putScreenshot(step.screenshot.hash, blob);
        }
      }
      await putSession(session);
    }
    await writeLocal(DEMO.seedKey, true);
  });
}

export async function loadWorkflowAccess() {
  await seedDemo();
  void chrome.runtime.sendMessage({ type: 'WAKE_SYNC' }).catch(() => {});
  return { uid: DEMO.uid, workflows: structuredClone(DEMO_WORKFLOWS) };
}
