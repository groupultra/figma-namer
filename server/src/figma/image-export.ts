// ============================================================
// Figma Namer - Image Export via REST API
// Fetches node render images from the Figma Images API
// ============================================================

import { getImages, downloadImage } from './client';

/**
 * Export a rendered PNG of a Figma node via the REST API.
 * Returns a Buffer of the image data.
 */
export async function exportNodeImage(
  fileKey: string,
  token: string,
  nodeId: string,
  scale: number = 2,
): Promise<Buffer> {
  const imageUrls = await getImages(fileKey, token, [nodeId], scale, 'png');
  const cdnUrl = imageUrls[nodeId];

  if (!cdnUrl) {
    throw new Error(`No image returned for node ${nodeId}`);
  }

  return downloadImage(cdnUrl);
}

/**
 * Export rendered PNGs for multiple nodes in one API call.
 * Returns a Map of nodeId -> Buffer.
 */
export async function exportMultipleNodeImages(
  fileKey: string,
  token: string,
  nodeIds: string[],
  scale: number = 2,
): Promise<Map<string, Buffer>> {
  const imageUrls = await getImages(fileKey, token, nodeIds, scale, 'png');
  const result = new Map<string, Buffer>();

  // Download images concurrently (with concurrency limit)
  const CONCURRENCY = 5;
  const entries = Object.entries(imageUrls).filter(([, url]) => url);

  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const batch = entries.slice(i, i + CONCURRENCY);
    const downloads = batch.map(async ([id, url]) => {
      const buf = await downloadImage(url);
      result.set(id, buf);
    });
    await Promise.all(downloads);
  }

  return result;
}
