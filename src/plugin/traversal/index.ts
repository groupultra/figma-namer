// ============================================================
// Figma Namer - Module A: Node Traversal Entry Point
// DFS traversal over the user's selection, yielding filtered
// and enriched NodeMetadata records.
// ============================================================

import type { NamerConfig, NodeMetadata } from '../../shared/types';
import { shouldIncludeNode } from './filter';
import { extractMetadata } from './metadata';

/**
 * Traverses all nodes within the user's current selection using
 * depth-first search and returns metadata for every node that
 * passes the filter criteria.
 *
 * The traversal walks the full subtree of each selected root node,
 * recursing into children of any container type (FRAME, GROUP,
 * COMPONENT, COMPONENT_SET, INSTANCE, SECTION, etc.).
 *
 * Filtering is delegated to {@link shouldIncludeNode} and metadata
 * extraction to {@link extractMetadata}.
 *
 * @param selection - The user's current selection (`figma.currentPage.selection`).
 * @param config    - Runtime configuration (batch size, filter toggles, etc.).
 * @returns An ordered array of {@link NodeMetadata} for every included node.
 *          The order follows DFS pre-order: parents appear before their children.
 */
export function traverseSelection(
  selection: readonly SceneNode[],
  config: NamerConfig,
): NodeMetadata[] {
  const results: NodeMetadata[] = [];

  for (const rootNode of selection) {
    walkDFS(rootNode, 0, config, results);
  }

  return results;
}

// ------------------------------------------------------------------
// Internal DFS implementation
// ------------------------------------------------------------------

/**
 * Recursive DFS walker.
 *
 * For every visited node:
 *  1. Check if the node passes the filter.
 *  2. If yes, extract its metadata and push to results.
 *  3. Regardless of inclusion, recurse into children so that a
 *     skipped container's children still get a chance to be included.
 *
 * The "recurse regardless" strategy ensures that, e.g., a locked
 * FRAME (which is itself filtered out) does not silently suppress
 * all of its descendants.
 *
 * @param node    - Current node being visited.
 * @param depth   - Current depth (0 = direct selection root).
 * @param config  - User / default configuration.
 * @param results - Accumulator array mutated in-place.
 */
/** Maximum recursion depth to prevent stack overflow on deeply nested designs */
const MAX_TRAVERSAL_DEPTH = 100;

/** Maximum number of nodes to process to prevent runaway traversals */
const MAX_NODE_COUNT = 5000;

function walkDFS(
  node: SceneNode,
  depth: number,
  config: NamerConfig,
  results: NodeMetadata[],
): void {
  // Guard against excessively deep nesting (stack overflow protection)
  if (depth > MAX_TRAVERSAL_DEPTH) {
    return;
  }

  // Guard against excessively large selections
  if (results.length >= MAX_NODE_COUNT) {
    return;
  }

  // ---- Evaluate this node ----
  if (shouldIncludeNode(node, config)) {
    results.push(extractMetadata(node, depth));
  }

  // ---- Recurse into children if this is a container ----
  if ('children' in node) {
    const container = node as SceneNode & { children: readonly SceneNode[] };
    for (const child of container.children) {
      walkDFS(child, depth + 1, config, results);
    }
  }
}

// Re-export submodule utilities for convenient barrel access
export { shouldIncludeNode, isDefaultName } from './filter';
export { extractMetadata, extractTextContent, extractBoundVariables } from './metadata';
