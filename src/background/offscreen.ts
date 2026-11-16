let creating: Promise<void> | null = null;

export async function ensureOffscreen(): Promise<void> {
  if (creating) return creating;
  creating = (async () => {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    });
    if (contexts.length) return;
    await chrome.offscreen.createDocument({
      url: 'src/offscreen/index.html',
      reasons: [chrome.offscreen.Reason.BLOBS],
      justification: 'Process and upload saved capture blobs while the popup is closed.',
    });
  })();
  try {
    await creating;
  } finally {
    creating = null;
  }
}
