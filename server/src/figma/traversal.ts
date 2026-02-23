// ============================================================
// Figma Namer - REST API Node Traversal
// Adapted from src/plugin/traversal/ to work with JSON nodes
// from the Figma REST API instead of the Plugin API's SceneNode.
// ============================================================

import type { NamerConfig, NodeMetadata, BoundingBox, FigmaNode } from '@shared/types';
import { SKIP_NODE_TYPES, DEFAULT_NAME_PATTERNS } from '@shared/constants';

const MAX_TRAVERSAL_DEPTH = 40;
const MAX_NODE_COUNT = 500;

/**
 * Traverse a Figma REST API JSON node tree using DFS.
 * Returns metadata for nodes that pass filtering criteria.
 */
export function traverseFileTree(
  rootNodes: FigmaNode[],
  config: NamerConfig,
): NodeMetadata[] {
  const results: NodeMetadata[] = [];

  for (const node of rootNodes) {
    walkDFS(node, 0, null, config, results);
  }

  return results;
}

/** Node types that represent complete UI components — include them but skip their subtree */
const COMPONENT_BOUNDARY_TYPES = new Set(['INSTANCE', 'COMPONENT', 'COMPONENT_SET']);

function walkDFS(
  node: FigmaNode,
  depth: number,
  parentId: string | null,
  config: NamerConfig,
  results: NodeMetadata[],
): void {
  if (depth > MAX_TRAVERSAL_DEPTH) return;
  if (results.length >= MAX_NODE_COUNT) return;

  const included = shouldIncludeNode(node, config);
  if (included) {
    results.push(extractMetadata(node, depth, parentId));
  }

  // INSTANCE / COMPONENT / COMPONENT_SET are complete UI building blocks.
  // If we included one, skip its entire subtree — the internal structure
  // is an implementation detail and labelling it just creates noise.
  if (included && COMPONENT_BOUNDARY_TYPES.has(node.type)) {
    return; // don't recurse into children
  }

  if (node.children) {
    for (const child of node.children) {
      walkDFS(child, depth + 1, node.id, config, results);
    }
  }
}

/**
 * Filter logic adapted from src/plugin/traversal/filter.ts
 * Tuned for Web Dashboard: more selective to avoid labelling noise.
 */
export function shouldIncludeNode(
  node: FigmaNode,
  config: NamerConfig,
): boolean {
  if (SKIP_NODE_TYPES.has(node.type)) return false;

  if (!config.includeInvisible && node.visible === false) return false;

  if (!config.includeLocked && node.locked === true) return false;

  if (config.minNodeArea > 0 && node.absoluteBoundingBox) {
    const area = node.absoluteBoundingBox.width * node.absoluteBoundingBox.height;
    if (area < config.minNodeArea) return false;
  }

  // --- Component-level nodes: always include ---
  if (node.type === 'INSTANCE' || node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
    return true;
  }

  // --- SECTION: always include (top-level organiser) ---
  if (node.type === 'SECTION') return true;

  // --- TEXT: include only if it's a standalone text layer (not deeply nested) ---
  //     Text inside INSTANCE/COMPONENT is already skipped because we don't
  //     recurse into component subtrees.
  if (node.type === 'TEXT') return true;

  // --- FRAME / GROUP: be selective ---
  if (node.type === 'FRAME' || node.type === 'GROUP') {
    // Auto-layout wrapper frames with only one child are just structural — skip
    if (node.layoutMode && node.layoutMode !== 'NONE' && node.children?.length === 1) {
      return false;
    }
    // Frames that don't have a user-meaningful name (default "Frame 123") — include
    if (isDefaultName(node.name)) return true;
    // Named frames — the user already named them, skip (they don't need AI naming)
    return false;
  }

  // Custom includeNodeTypes from config
  if (config.includeNodeTypes?.length > 0 && config.includeNodeTypes.includes(node.type)) {
    return true;
  }

  return false;
}

function hasTextDescendant(node: FigmaNode): boolean {
  if (!node.children) return false;
  for (const child of node.children) {
    if (child.type === 'TEXT') return true;
    if (child.children && hasTextDescendant(child)) return true;
  }
  return false;
}

/**
 * Extract metadata from a FigmaNode (REST API JSON).
 */
export function extractMetadata(
  node: FigmaNode,
  depth: number,
  parentId: string | null,
): NodeMetadata {
  return {
    id: node.id,
    originalName: node.name,
    nodeType: node.type,
    boundingBox: node.absoluteBoundingBox || { x: 0, y: 0, width: 0, height: 0 },
    depth,
    parentId,
    textContent: extractTextContent(node),
    boundVariables: extractBoundVariables(node),
    componentProperties: extractComponentProperties(node),
    hasChildren: !!(node.children && node.children.length > 0),
    childCount: node.children?.length || 0,
    layoutMode: (node.layoutMode as 'HORIZONTAL' | 'VERTICAL') || 'NONE',
  };
}

export function extractTextContent(node: FigmaNode): string | null {
  if (node.type === 'TEXT' && node.characters) {
    return node.characters.length > 0 ? node.characters : null;
  }

  if (node.children) {
    const textParts: string[] = [];
    for (const child of node.children) {
      if (child.type === 'TEXT' && child.characters && child.characters.length > 0) {
        textParts.push(child.characters);
      }
    }
    if (textParts.length > 0) return textParts.join(' ');
  }

  return null;
}

export function extractBoundVariables(node: FigmaNode): string[] {
  if (!node.boundVariables) return [];

  const result: string[] = [];
  try {
    const vars = node.boundVariables as Record<string, unknown>;
    for (const key of Object.keys(vars)) {
      const binding = vars[key];
      if (!binding) continue;

      const aliases = Array.isArray(binding) ? binding : [binding];
      for (const alias of aliases) {
        if (alias && typeof alias === 'object' && 'id' in alias) {
          // In REST API, we don't have access to variable names directly
          // We store the ID for reference
          result.push(String((alias as { id: string }).id));
        }
      }
    }
  } catch {
    // Silently skip
  }
  return result;
}

function extractComponentProperties(node: FigmaNode): Record<string, string> {
  const props: Record<string, string> = {};
  if (!node.componentProperties) return props;

  try {
    for (const [key, prop] of Object.entries(node.componentProperties)) {
      if (prop && prop.value !== undefined && prop.value !== null) {
        props[key] = String(prop.value);
      }
    }
  } catch {
    // Defensive
  }
  return props;
}

export function isDefaultName(name: string): boolean {
  return DEFAULT_NAME_PATTERNS.some((pattern) => pattern.test(name));
}
