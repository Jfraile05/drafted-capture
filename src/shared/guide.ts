// Copy for the first-run guide. The times come from the same constants the
// extension runs on, so the guide cannot say 2 and 20 minutes after those change.

import { IDLE_CONFIG } from '../config/idle';
import { ABANDONED_AFTER_MS } from './constants';

const minutes = (ms: number) => Math.round(ms / 60_000);

export type GuideStepId = 'start' | 'stop' | 'check' | 'safety';

export interface GuideStep {
  id: GuideStepId;
  title: string;
  body: string;
  /** Shown once the practice button has been pressed. */
  after?: string;
  /** Steps with a practice button wait for it before Next. */
  practice: boolean;
}

export const GUIDE_STEPS: GuideStep[] = [
  {
    id: 'start',
    title: 'Press Start first',
    body: 'Pick your task, then press Start before you begin. Nothing is recorded until you do.',
    after: 'A green dot means Sidekick is recording. Now work like you normally would.',
    practice: true,
  },
  {
    id: 'stop',
    title: 'Press Stop when you finish',
    body: 'This is the one people forget. When your task is done, press Stop and save before you close Chrome.',
    after: 'Saved. Sidekick starts uploading it right away.',
    practice: true,
  },
  {
    id: 'check',
    title: 'Check that it uploaded',
    body: 'Look at the bottom of the popup. Orange Uploading means keep Chrome open. Green Synced means you are done.',
    after: 'Green Synced. That session is safe on our side.',
    practice: true,
  },
  {
    id: 'safety',
    title: 'Forgot? Sidekick has your back',
    body: 'It still pays to stop it yourself, but if you forget:',
    practice: false,
  },
];

export const SAFETY_NETS: string[] = [
  `No activity for ${minutes(IDLE_CONFIG.defaultMs)} minutes: Sidekick pauses.`,
  `No activity for ${minutes(ABANDONED_AFTER_MS)} minutes: Sidekick submits the session.`,
  'Chrome closed by mistake: the session is saved the next time Chrome opens.',
];

export const CLOSING_CHECK = 'Before you close Chrome, check that the popup says Synced.';
