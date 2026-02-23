// ============================================================
// Figma Namer - Module A: Node Filter
// Determines which nodes should be included during traversal
// ============================================================

import type { NamerConfig } from '../../shared/types';
import { SKIP_NODE_TYPES, NAMEABLE_NODE_TYPES, DEFAULT_NAME_PATTERNS } from '../../shared/constants';

/**
 * Determines whether a given Figma node should be included in the
 * traversal results based on the provided configuration and a set
 * of heuristic rules.
 *
 * Filtering rules (applied in order):
 *  1. Skip node types in SKIP_NODE_TYPES (VECTOR, LINE, ELLIPSE, etc.)
 *  2. Skip invisible nodes unless config.includeInvisible is true
 *  3. Skip locked nodes unless config.includeLocked is true
 *  4. Skip nodes whose area is smaller than config.minNodeArea
 *  5. Always keep nodes whose type is in NAMEABLE_NODE_TYPES
 *  6. Always keep FRAME / GROUP containers that contain text children
 *  7. If config.includeNodeTypes is provided, use it as an allowlist
 */
export function shouldIncludeNode(
  node: SceneNode,
  config: NamerConfig,
): boolean {
  // ---- 1. Hard-skip certain primitive / shape types ----
  if (SKIP_NODE_TYPES.has(node.type)) {
    return false;
  }

  // ---- 2. Visibility check ----
  if (!config.includeInvisible && 'visible' in node && !node.visible) {
    return false;
  }

  // ---- 3. Lock check ----
  if (!config.includeLocked && 'locked' in node && (node as SceneNode & { locked: boolean }).locked) {
    return false;
  }

  // ---- 4. Minimum area check ----
  if (config.minNodeArea > 0) {
    const box = node.absoluteBoundingBox;
    if (box) {
      const area = box.width * box.height;
      if (area < config.minNodeArea) {
        return false;
      }
    }
    // If absoluteBoundingBox is null we cannot measure the area,
    // so we keep the node rather than silently dropping it.
  }

  // ---- 5. Nameable-type allowlist ----
  if (NAMEABLE_NODE_TYPES.has(node.type)) {
    return true;
  }

  // ---- 6. Containers with text children are always interesting ----
  if (
    (node.type === 'FRAME' || node.type === 'GROUP') &&
    hasTextDescendant(node)
  ) {
    return true;
  }

  // ---- 7. User-specified allowlist in config ----
  if (
    config.includeNodeTypes &&
    config.includeNodeTypes.length > 0 &&
    config.includeNodeTypes.includes(node.type)
  ) {
    return true;
  }

  // Default: exclude anything not explicitly matched above
  return false;
}

/**
 * Returns `true` if the node name matches one of the known Figma
 * default name patterns (e.g. "Frame 123", "Rectangle 45").
 *
 * This is useful for identifying layers that the designer has not
 * yet given a meaningful name.
 */
export function isDefaultName(name: string): boolean {
  return DEFAULT_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

// ------------------------------------------------------------------
// Internal helpers
// ------------------------------------------------------------------

/**
 * Recursively checks whether a node (typically a FRAME or GROUP)
 * contains at least one TEXT child at any depth.
 */
function hasTextDescendant(node: SceneNode): boolean {
  if (!('children' in node)) {
    return false;
  }

  const container = node as SceneNode & { children: readonly SceneNode[] };
  for (const child of container.children) {
    if (child.type === 'TEXT') {
      return true;
    }
    if ('children' in child && hasTextDescendant(child)) {
      return true;
    }
  }

  return false;
}
