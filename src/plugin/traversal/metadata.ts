// ============================================================
// Figma Namer - Module A: Metadata Extraction
// Extracts structured metadata from Figma scene nodes
// ============================================================

import type { NodeMetadata, BoundingBox } from '../../shared/types';

/**
 * Extracts a full {@link NodeMetadata} record from a Figma scene node.
 *
 * @param node  - The Figma SceneNode to inspect.
 * @param depth - Current depth in the traversal tree (0 = root selection).
 * @returns A fully populated NodeMetadata object.
 */
export function extractMetadata(node: SceneNode, depth: number): NodeMetadata {
  const boundingBox = extractBoundingBox(node);

  return {
    id: node.id,
    originalName: node.name,
    nodeType: node.type,
    boundingBox,
    depth,
    parentId: node.parent ? node.parent.id : null,
    textContent: extractTextContent(node),
    boundVariables: extractBoundVariables(node),
    componentProperties: extractComponentProperties(node),
    hasChildren: hasChildren(node),
    childCount: getChildCount(node),
    layoutMode: extractLayoutMode(node),
  };
}

// ------------------------------------------------------------------
// Public helpers (exported for direct use / testing)
// ------------------------------------------------------------------

/**
 * Extracts text content from a node.
 *
 * - If the node is a TEXT node, returns its `characters` string directly.
 * - If the node is a container (FRAME, GROUP, COMPONENT, INSTANCE, etc.),
 *   attempts to collect text from all direct TEXT children, concatenated
 *   with a single space. Only the first level of text children is
 *   collected to avoid pulling in deeply nested unrelated text.
 * - Returns `null` if no text can be extracted.
 */
export function extractTextContent(node: SceneNode): string | null {
  // Direct TEXT node
  if (node.type === 'TEXT') {
    const text = (node as TextNode).characters;
    return text.length > 0 ? text : null;
  }

  // Container: try to gather text from children
  if ('children' in node) {
    const container = node as SceneNode & { children: readonly SceneNode[] };
    const textParts: string[] = [];

    for (const child of container.children) {
      if (child.type === 'TEXT') {
        const chars = (child as TextNode).characters;
        if (chars.length > 0) {
          textParts.push(chars);
        }
      }
    }

    if (textParts.length > 0) {
      return textParts.join(' ');
    }
  }

  return null;
}

/**
 * Extracts the names of design variables / tokens bound to a node.
 *
 * Figma exposes bound variables through `node.boundVariables`. Each
 * property key maps to either a single VariableAlias or an array of
 * them. We resolve each alias to its human-readable variable name
 * via `figma.variables.getVariableById`.
 *
 * @returns An array of variable names (e.g. ["Colors/Surface/Primary",
 *          "Spacing/md"]). Returns an empty array when no variables
 *          are bound or the API is unavailable.
 */
export function extractBoundVariables(node: SceneNode): string[] {
  const result: string[] = [];

  try {
    if (!('boundVariables' in node) || !node.boundVariables) {
      return result;
    }

    const boundVars = node.boundVariables as Record<
      string,
      VariableAlias | VariableAlias[]
    >;

    for (const key of Object.keys(boundVars)) {
      const binding = boundVars[key];
      if (!binding) continue;

      const aliases = Array.isArray(binding) ? binding : [binding];

      for (const alias of aliases) {
        if (!alias || !alias.id) continue;

        try {
          const variable = figma.variables.getVariableById(alias.id);
          if (variable && variable.name) {
            result.push(variable.name);
          }
        } catch (_e) {
          // Variable may have been deleted or the API call failed;
          // silently skip to avoid breaking the traversal.
        }
      }
    }
  } catch (_e) {
    // Defensive: boundVariables API may not be available in older
    // Figma versions or certain node types.
  }

  return result;
}

// ------------------------------------------------------------------
// Internal helpers
// ------------------------------------------------------------------

/**
 * Converts the node's `absoluteBoundingBox` into our own
 * {@link BoundingBox} shape. Falls back to a zero-rect when the
 * property is unavailable.
 */
function extractBoundingBox(node: SceneNode): BoundingBox {
  const box = node.absoluteBoundingBox;
  if (box) {
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    };
  }

  // Fallback for nodes that lack absoluteBoundingBox (e.g. pages,
  // guides, or certain boolean-op children).
  return { x: 0, y: 0, width: 0, height: 0 };
}

/**
 * Extracts component instance properties as a flat key-value map.
 *
 * For InstanceNode, Figma exposes `componentProperties` where each
 * key maps to a `ComponentProperty` object containing `value` and
 * `type`. We serialise the value to a string so the VLM prompt can
 * consume it uniformly.
 */
function extractComponentProperties(
  node: SceneNode,
): Record<string, string> {
  const props: Record<string, string> = {};

  if (node.type !== 'INSTANCE') {
    return props;
  }

  try {
    const instance = node as InstanceNode;
    const compProps = instance.componentProperties;

    if (!compProps) {
      return props;
    }

    for (const [key, prop] of Object.entries(compProps)) {
      if (prop && prop.value !== undefined && prop.value !== null) {
        props[key] = String(prop.value);
      }
    }
  } catch (_e) {
    // Defensive: componentProperties may throw for detached instances.
  }

  return props;
}

/**
 * Checks whether the node is a container that has children.
 */
function hasChildren(node: SceneNode): boolean {
  if ('children' in node) {
    const container = node as SceneNode & { children: readonly SceneNode[] };
    return container.children.length > 0;
  }
  return false;
}

/**
 * Returns the number of direct children, or 0 if the node cannot
 * contain children.
 */
function getChildCount(node: SceneNode): number {
  if ('children' in node) {
    return (node as SceneNode & { children: readonly SceneNode[] }).children.length;
  }
  return 0;
}

/**
 * Reads the auto-layout direction of a node.
 *
 * Only FRAME, COMPONENT, and COMPONENT_SET support `layoutMode`.
 * Returns 'NONE' for all other nodes or when auto-layout is not set.
 */
function extractLayoutMode(
  node: SceneNode,
): 'HORIZONTAL' | 'VERTICAL' | 'NONE' {
  if (
    'layoutMode' in node &&
    (node as FrameNode).layoutMode
  ) {
    const mode = (node as FrameNode).layoutMode;
    if (mode === 'HORIZONTAL' || mode === 'VERTICAL') {
      return mode;
    }
  }
  return 'NONE';
}
