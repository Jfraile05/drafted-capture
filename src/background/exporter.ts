// ════════════════════════════════════════════════════════════════════════
//  Export session to ZIP with selected formats + screenshots.
//
//  Loads the session + all screenshot blobs, runs each enabled converter,
//  zips everything with fflate, triggers chrome.downloads.download.
// ════════════════════════════════════════════════════════════════════════

import { zipSync } from 'fflate';
import { converters } from '../shared/converters';
import { getScreenshot, getSession } from '../shared/storage/db';
import type { ExportFormatFlags } from '../shared/types';

export async function exportSession(sessionId: string, formats: ExportFormatFlags): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) throw new Error('Session not found');

  console.log('[exporter] exporting session:', sessionId, formats);

  // Collect all unique screenshot hashes.
  const hashes = Array.from(
    new Set(session.steps.map((s) => s.screenshot?.hash).filter((h): h is string => Boolean(h))),
  );

  // Resolve blobs from IndexedDB.
  const screenshots = new Map<string, Blob>();
  await Promise.all(
    hashes.map(async (hash) => {
      const blob = await getScreenshot(hash);
      if (blob) screenshots.set(hash, blob);
    }),
  );

  // Run converters for enabled formats.
  const files: Record<string, Uint8Array> = {};
  const encoder = new TextEncoder();

  for (const [key, converter] of Object.entries(converters)) {
    if (formats[key as keyof ExportFormatFlags]) {
      const json = await converter.convert(session, screenshots);
      files[converter.filename] = encoder.encode(json);
    }
  }

  // Add screenshots folder.
  for (const [hash, blob] of screenshots.entries()) {
    const buffer = await blob.arrayBuffer();
    files[`screenshots/${hash}.png`] = new Uint8Array(buffer);
  }

  // Zip.
  const zipData = zipSync(files, { level: 6 });
  const zipBlob = new Blob([new Uint8Array(zipData)], { type: 'application/zip' });
  const zipUrl = URL.createObjectURL(zipBlob);

  // Download.
  const filename = `drafted-capture-${sessionId.slice(0, 8)}.zip`;
  await chrome.downloads.download({
    url: zipUrl,
    filename,
    saveAs: true,
  });

  console.log('[exporter] exported:', filename);
}
