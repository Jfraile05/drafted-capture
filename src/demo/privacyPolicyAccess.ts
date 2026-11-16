// Remote publication is simulated with a local document in this build only.
export async function loadPrivacyPolicy(): Promise<unknown> {
  return (
    (await chrome.storage.local.get('synthetic_remote_policy')).synthetic_remote_policy ?? null
  );
}
