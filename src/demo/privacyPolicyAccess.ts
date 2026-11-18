import { readLocal } from './storage';

// Remote publication is simulated with a local document in this build only.
export async function loadPrivacyPolicy(): Promise<unknown> {
  return (await readLocal('synthetic_remote_policy')) ?? null;
}
