// ============================================================
// Figma Namer - Figma REST API Client
// Wraps the Figma REST API for file tree and image export
// ============================================================

const FIGMA_API_BASE = 'https://api.figma.com/v1';

export interface FigmaAPIOptions {
  token: string;
}

/**
 * Fetch a Figma file (or a subtree if nodeId is provided).
 */
export async function getFile(
  fileKey: string,
  token: string,
  nodeId?: string | null,
): Promise<any> {
  let url = `${FIGMA_API_BASE}/files/${fileKey}`;
  const params = new URLSearchParams();

  if (nodeId) {
    params.set('ids', nodeId);
  }
  // Only fetch needed data
  params.set('geometry', 'paths');

  const queryStr = params.toString();
  if (queryStr) url += `?${queryStr}`;

  const res = await fetch(url, {
    headers: { 'X-Figma-Token': token },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Figma API error ${res.status}: ${body}`);
  }

  return res.json();
}

/**
 * Request rendered images for a list of node IDs.
 * Returns a map of nodeId -> CDN image URL.
 */
export async function getImages(
  fileKey: string,
  token: string,
  nodeIds: string[],
  scale: number = 2,
  format: 'png' | 'jpg' | 'svg' = 'png',
): Promise<Record<string, string>> {
  const url = `${FIGMA_API_BASE}/images/${fileKey}?ids=${nodeIds.join(',')}&scale=${scale}&format=${format}`;

  const res = await fetch(url, {
    headers: { 'X-Figma-Token': token },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Figma Images API error ${res.status}: ${body}`);
  }

  const data = await res.json();

  if (data.err) {
    throw new Error(`Figma Images API: ${data.err}`);
  }

  return data.images || {};
}

/**
 * Download an image from a Figma CDN URL and return it as a Buffer.
 */
export async function downloadImage(cdnUrl: string): Promise<Buffer> {
  const res = await fetch(cdnUrl);

  if (!res.ok) {
    throw new Error(`Failed to download image: ${res.status}`);
  }

  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}
