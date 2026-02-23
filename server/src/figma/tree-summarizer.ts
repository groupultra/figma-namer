// ============================================================
// Figma Namer - Condensed Tree Summarizer
// Generates a compact text summary of the Figma file tree
// for LLM structure analysis (Round 0)
// ============================================================

import type { FigmaNode } from '@shared/types';

const MAX_DEPTH = 4;

interface NodeSummary {
  id: string;
  name: string;
  type: string;
  width: number;
  height: number;
  childCount: number;
}

/**
 * Build a condensed text summary of a Figma node tree.
 * Only preserves: id, name, type, dimensions, child count.
 * Max depth 4 — deeper children are aggregated.
 * Output is indented text (cheaper in tokens than JSON).
 *
 * Typical output: < 3000 tokens for a file with ~50 top-level frames.
 */
export function buildCondensedTreeSummary(rootNodes: FigmaNode[]): string {
  const lines: string[] = [];

  for (const node of rootNodes) {
    buildNodeSummary(node, 0, lines);
  }

  return lines.join('\n');
}

function buildNodeSummary(
  node: FigmaNode,
  depth: number,
  lines: string[],
): void {
  const indent = '  '.repeat(depth);
  const bbox = node.absoluteBoundingBox;
  const w = bbox ? Math.round(bbox.width) : 0;
  const h = bbox ? Math.round(bbox.height) : 0;
  const childCount = node.children?.length ?? 0;

  lines.push(`${indent}[${node.id}] "${node.name}" ${node.type} ${w}x${h} children=${childCount}`);

  if (!node.children || node.children.length === 0) return;

  if (depth >= MAX_DEPTH) {
    // Aggregate children by type
    const typeCounts: Record<string, number> = {};
    for (const child of node.children) {
      typeCounts[child.type] = (typeCounts[child.type] || 0) + 1;
    }
    const summary = Object.entries(typeCounts)
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');
    lines.push(`${indent}  ... ${node.children.length} children: ${summary}`);
    return;
  }

  for (const child of node.children) {
    buildNodeSummary(child, depth + 1, lines);
  }
}
