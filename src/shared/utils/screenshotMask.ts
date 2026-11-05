// Masks sensitive regions in a screenshot before it is hashed and stored.
// Regions come from the page (see content/sensitiveRegions.ts) in CSS pixels.
// Solid boxes, not blur: blurred small text can often be recovered.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Scale CSS pixel rects to image pixels, pad them, clamp to the image, and
 *  drop any that end up empty. */
export function toImageRects(
  rects: Rect[],
  scale: number,
  imageWidth: number,
  imageHeight: number,
  pad = 3,
): Rect[] {
  const out: Rect[] = [];
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor(r.x * scale) - pad);
    const y0 = Math.max(0, Math.floor(r.y * scale) - pad);
    const x1 = Math.min(imageWidth, Math.ceil((r.x + r.width) * scale) + pad);
    const y1 = Math.min(imageHeight, Math.ceil((r.y + r.height) * scale) + pad);
    if (x1 > x0 && y1 > y0) out.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
  }
  return out;
}

/** Paint solid boxes over `rects` (CSS pixels, relative to a viewport that is
 *  `viewportWidth` CSS pixels wide). Throws if the image cannot be edited, so
 *  the caller can drop the screenshot instead of storing it unmasked. */
export async function maskScreenshotBlob(
  blob: Blob,
  rects: Rect[],
  viewportWidth: number,
): Promise<Blob> {
  if (rects.length === 0) return blob;
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas unavailable');
    ctx.drawImage(bitmap, 0, 0);
    ctx.fillStyle = '#141414';
    const scale = bitmap.width / viewportWidth;
    for (const r of toImageRects(rects, scale, bitmap.width, bitmap.height)) {
      ctx.fillRect(r.x, r.y, r.width, r.height);
    }
    return await canvas.convertToBlob({ type: 'image/png' });
  } finally {
    bitmap.close();
  }
}
