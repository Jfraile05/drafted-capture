import { SCREENSHOT_MAX_DIMENSION } from '../constants';

export async function getImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  bitmap.close();
  return { width, height };
}

/** Resize a PNG blob so its longest edge ≤ SCREENSHOT_MAX_DIMENSION.
 *  Returns the original untouched if already small enough. Used only at
 *  export time — stored blobs keep full resolution. */
export async function resizeScreenshotBlob(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  if (width <= SCREENSHOT_MAX_DIMENSION && height <= SCREENSHOT_MAX_DIMENSION) {
    bitmap.close();
    return blob;
  }
  const scale = SCREENSHOT_MAX_DIMENSION / Math.max(width, height);
  const canvas = new OffscreenCanvas(Math.round(width * scale), Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return blob;
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/png' });
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
