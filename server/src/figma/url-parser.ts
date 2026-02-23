// ============================================================
// Figma Namer - URL Parser
// Parses Figma URLs into fileKey and optional nodeId
// ============================================================

export interface ParsedFigmaUrl {
  fileKey: string;
  nodeId: string | null;
}

/**
 * Parse a Figma file URL into its components.
 *
 * Supported URL formats:
 *  - https://www.figma.com/design/XXXXX/Name
 *  - https://www.figma.com/file/XXXXX/Name
 *  - https://www.figma.com/design/XXXXX/Name?node-id=1-2
 *  - https://www.figma.com/design/XXXXX/Name?node-id=1%3A2
 *  - https://figma.com/design/XXXXX/Name?node-id=1-2&t=xxx
 */
export function parseFigmaUrl(url: string): ParsedFigmaUrl {
  const trimmed = url.trim();

  // Match /file/ or /design/ patterns
  const pathMatch = trimmed.match(
    /figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/,
  );

  if (!pathMatch) {
    throw new Error(
      'Invalid Figma URL. Expected format: https://www.figma.com/design/<fileKey>/...',
    );
  }

  const fileKey = pathMatch[1];

  // Extract node-id from query params
  let nodeId: string | null = null;
  try {
    const urlObj = new URL(trimmed);
    const rawNodeId = urlObj.searchParams.get('node-id');
    if (rawNodeId) {
      // Figma uses both "1-2" (URL encoded) and "1:2" formats
      // REST API expects "1:2" format
      nodeId = rawNodeId.replace(/-/g, ':');
    }
  } catch {
    // If URL parsing fails, try regex fallback
    const nodeIdMatch = trimmed.match(/[?&]node-id=([^&]+)/);
    if (nodeIdMatch) {
      nodeId = decodeURIComponent(nodeIdMatch[1]).replace(/-/g, ':');
    }
  }

  return { fileKey, nodeId };
}
