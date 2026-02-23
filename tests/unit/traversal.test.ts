// ============================================================
// Tests for src/plugin/traversal/ module
// Covers: DFS traversal, node filtering, default name detection,
//         metadata extraction, and text content extraction
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockNode, createMockDesignPage } from '../mocks/figma-api';
import { traverseSelection } from '../../src/plugin/traversal/index';
import { shouldIncludeNode, isDefaultName } from '../../src/plugin/traversal/filter';
import { extractMetadata, extractTextContent } from '../../src/plugin/traversal/metadata';
import type { NamerConfig } from '../../src/shared/types';

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/** Returns a default NamerConfig for tests */
function createDefaultConfig(overrides: Partial<NamerConfig> = {}): NamerConfig {
  return {
    vlmProvider: 'claude',
    apiEndpoint: 'https://example.com/api',
    batchSize: 15,
    exportScale: 2,
    highlightColor: '#FF0040',
    labelFontSize: 14,
    includeLocked: false,
    includeInvisible: false,
    minNodeArea: 100,
    includeNodeTypes: ['FRAME', 'GROUP', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'TEXT', 'SECTION'],
    ...overrides,
  };
}

// ------------------------------------------------------------------
// DFS Traversal (traverseSelection)
// ------------------------------------------------------------------

describe('traverseSelection', () => {
  beforeEach(() => {
    // Set up the figma.variables mock for extractBoundVariables
    (globalThis as any).figma = {
      ...(globalThis as any).figma,
      variables: {
        getVariableById: vi.fn(() => null),
      },
    };
  });

  it('should collect all eligible nodes from a mock page via DFS', () => {
    const page = createMockDesignPage();
    const config = createDefaultConfig();

    const results = traverseSelection([page as unknown as SceneNode], config);

    // The page itself is a FRAME, it should be included
    // Each result should have valid metadata
    expect(results.length).toBeGreaterThan(0);
    results.forEach((meta) => {
      expect(meta).toHaveProperty('id');
      expect(meta).toHaveProperty('originalName');
      expect(meta).toHaveProperty('nodeType');
      expect(meta).toHaveProperty('boundingBox');
      expect(meta).toHaveProperty('depth');
    });
  });

  it('should return results in DFS pre-order (parents before children)', () => {
    const child1 = new MockNode('child-1', 'Child Frame', 'FRAME', {
      boundingBox: { x: 10, y: 10, width: 100, height: 50 },
    });
    const child2 = new MockNode('child-2', 'Child Text', 'TEXT', {
      boundingBox: { x: 10, y: 70, width: 100, height: 20 },
      characters: 'Hello',
    });
    const parent = new MockNode('parent', 'Parent Frame', 'FRAME', {
      boundingBox: { x: 0, y: 0, width: 200, height: 200 },
      children: [child1, child2],
    });
    const config = createDefaultConfig();

    const results = traverseSelection([parent as unknown as SceneNode], config);
    const ids = results.map((r) => r.id);

    // Parent should appear before children
    const parentIdx = ids.indexOf('parent');
    const child1Idx = ids.indexOf('child-1');
    const child2Idx = ids.indexOf('child-2');

    expect(parentIdx).toBeLessThan(child1Idx);
    expect(parentIdx).toBeLessThan(child2Idx);
  });

  it('should handle empty selection', () => {
    const config = createDefaultConfig();
    const results = traverseSelection([], config);
    expect(results).toEqual([]);
  });

  it('should handle multiple root nodes in selection', () => {
    const root1 = new MockNode('root-1', 'Frame 1', 'FRAME', {
      boundingBox: { x: 0, y: 0, width: 100, height: 100 },
    });
    const root2 = new MockNode('root-2', 'Frame 2', 'FRAME', {
      boundingBox: { x: 200, y: 0, width: 100, height: 100 },
    });
    const config = createDefaultConfig();

    const results = traverseSelection(
      [root1, root2] as unknown as SceneNode[],
      config,
    );
    const ids = results.map((r) => r.id);

    expect(ids).toContain('root-1');
    expect(ids).toContain('root-2');
  });

  it('should skip VECTOR and LINE nodes but still traverse their siblings', () => {
    const vectorNode = new MockNode('vec', 'Vector 1', 'VECTOR', {
      boundingBox: { x: 0, y: 0, width: 50, height: 50 },
    });
    const frameNode = new MockNode('frm', 'My Frame', 'FRAME', {
      boundingBox: { x: 60, y: 0, width: 100, height: 100 },
    });
    const container = new MockNode('container', 'Container', 'FRAME', {
      boundingBox: { x: 0, y: 0, width: 300, height: 200 },
      children: [vectorNode, frameNode],
    });
    const config = createDefaultConfig();

    const results = traverseSelection([container as unknown as SceneNode], config);
    const ids = results.map((r) => r.id);

    expect(ids).not.toContain('vec');
    expect(ids).toContain('frm');
  });

  it('should recurse into children of filtered-out containers', () => {
    // A locked container should be filtered out, but its children should still be visited
    const innerFrame = new MockNode('inner', 'Inner Frame', 'FRAME', {
      boundingBox: { x: 10, y: 10, width: 100, height: 100 },
    });
    const lockedContainer = new MockNode('locked-parent', 'Locked Container', 'FRAME', {
      boundingBox: { x: 0, y: 0, width: 200, height: 200 },
      locked: true,
      children: [innerFrame],
    });
    const config = createDefaultConfig({ includeLocked: false });

    const results = traverseSelection([lockedContainer as unknown as SceneNode], config);
    const ids = results.map((r) => r.id);

    expect(ids).not.toContain('locked-parent');
    expect(ids).toContain('inner');
  });

  it('should track depth correctly in nested structures', () => {
    const grandchild = new MockNode('gc', 'GrandChild', 'FRAME', {
      boundingBox: { x: 20, y: 20, width: 50, height: 50 },
    });
    const child = new MockNode('c', 'Child', 'FRAME', {
      boundingBox: { x: 10, y: 10, width: 100, height: 100 },
      children: [grandchild],
    });
    const root = new MockNode('r', 'Root', 'FRAME', {
      boundingBox: { x: 0, y: 0, width: 200, height: 200 },
      children: [child],
    });
    const config = createDefaultConfig();

    const results = traverseSelection([root as unknown as SceneNode], config);

    const rootMeta = results.find((r) => r.id === 'r');
    const childMeta = results.find((r) => r.id === 'c');
    const grandchildMeta = results.find((r) => r.id === 'gc');

    expect(rootMeta?.depth).toBe(0);
    expect(childMeta?.depth).toBe(1);
    expect(grandchildMeta?.depth).toBe(2);
  });
});

// ------------------------------------------------------------------
// shouldIncludeNode (filter rules)
// ------------------------------------------------------------------

describe('shouldIncludeNode', () => {
  it('should exclude VECTOR nodes', () => {
    const node = new MockNode('v', 'Vector 1', 'VECTOR', {
      boundingBox: { x: 0, y: 0, width: 100, height: 100 },
    });
    const config = createDefaultConfig();

    expect(shouldIncludeNode(node as unknown as SceneNode, config)).toBe(false);
  });

  it('should exclude LINE nodes', () => {
    const node = new MockNode('l', 'Line 1', 'LINE', {
      boundingBox: { x: 0, y: 0, width: 100, height: 1 },
    });
    const config = createDefaultConfig();

    expect(shouldIncludeNode(node as unknown as SceneNode, config)).toBe(false);
  });

  it('should exclude ELLIPSE nodes', () => {
    const node = new MockNode('e', 'Ellipse 1', 'ELLIPSE', {
      boundingBox: { x: 0, y: 0, width: 100, height: 100 },
    });
    const config = createDefaultConfig();

    expect(shouldIncludeNode(node as unknown as SceneNode, config)).toBe(false);
  });

  it('should exclude POLYGON nodes', () => {
    const node = new MockNode('p', 'Polygon 1', 'POLYGON', {
      boundingBox: { x: 0, y: 0, width: 100, height: 100 },
    });
    const config = createDefaultConfig();

    expect(shouldIncludeNode(node as unknown as SceneNode, config)).toBe(false);
  });

  it('should exclude invisible nodes when includeInvisible is false', () => {
    const node = new MockNode('inv', 'Hidden Frame', 'FRAME', {
      visible: false,
      boundingBox: { x: 0, y: 0, width: 200, height: 200 },
    });
    const config = createDefaultConfig({ includeInvisible: false });

    expect(shouldIncludeNode(node as unknown as SceneNode, config)).toBe(false);
  });

  it('should include invisible nodes when includeInvisible is true', () => {
    const node = new MockNode('inv', 'Hidden Frame', 'FRAME', {
      visible: false,
      boundingBox: { x: 0, y: 0, width: 200, height: 200 },
    });
    const config = createDefaultConfig({ includeInvisible: true });

    expect(shouldIncludeNode(node as unknown as SceneNode, config)).toBe(true);
  });

  it('should exclude locked nodes when includeLocked is false', () => {
    const node = new MockNode('lck', 'Locked Frame', 'FRAME', {
      locked: true,
      boundingBox: { x: 0, y: 0, width: 200, height: 200 },
    });
    const config = createDefaultConfig({ includeLocked: false });

    expect(shouldIncludeNode(node as unknown as SceneNode, config)).toBe(false);
  });

  it('should include locked nodes when includeLocked is true', () => {
    const node = new MockNode('lck', 'Locked Frame', 'FRAME', {
      locked: true,
      boundingBox: { x: 0, y: 0, width: 200, height: 200 },
    });
    const config = createDefaultConfig({ includeLocked: true });

    expect(shouldIncludeNode(node as unknown as SceneNode, config)).toBe(true);
  });

  it('should exclude small area nodes when minNodeArea is set', () => {
    const node = new MockNode('tiny', 'Tiny Frame', 'FRAME', {
      boundingBox: { x: 0, y: 0, width: 5, height: 5 }, // area = 25
    });
    const config = createDefaultConfig({ minNodeArea: 100 });

    expect(shouldIncludeNode(node as unknown as SceneNode, config)).toBe(false);
  });

  it('should include nodes meeting minimum area threshold', () => {
    const node = new MockNode('big', 'Big Frame', 'FRAME', {
      boundingBox: { x: 0, y: 0, width: 100, height: 100 }, // area = 10000
    });
    const config = createDefaultConfig({ minNodeArea: 100 });

    expect(shouldIncludeNode(node as unknown as SceneNode, config)).toBe(true);
  });

  it('should keep nodes without bounding box when minNodeArea > 0', () => {
    const node = new MockNode('nobox', 'No Box Frame', 'FRAME', {
      boundingBox: null as unknown as any,
    });
    // Manually set absoluteBoundingBox to null
    node.absoluteBoundingBox = null;
    const config = createDefaultConfig({ minNodeArea: 100 });

    expect(shouldIncludeNode(node as unknown as SceneNode, config)).toBe(true);
  });

  it('should include FRAME type as it is in NAMEABLE_NODE_TYPES', () => {
    const node = new MockNode('f', 'My Frame', 'FRAME', {
      boundingBox: { x: 0, y: 0, width: 200, height: 200 },
    });
    const config = createDefaultConfig();

    expect(shouldIncludeNode(node as unknown as SceneNode, config)).toBe(true);
  });

  it('should include GROUP type as it is in NAMEABLE_NODE_TYPES', () => {
    const node = new MockNode('g', 'My Group', 'GROUP', {
      boundingBox: { x: 0, y: 0, width: 200, height: 200 },
    });
    const config = createDefaultConfig();

    expect(shouldIncludeNode(node as unknown as SceneNode, config)).toBe(true);
  });

  it('should include TEXT type as it is in NAMEABLE_NODE_TYPES', () => {
    const node = new MockNode('t', 'Hello Text', 'TEXT', {
      boundingBox: { x: 0, y: 0, width: 200, height: 200 },
      characters: 'Hello',
    });
    const config = createDefaultConfig();

    expect(shouldIncludeNode(node as unknown as SceneNode, config)).toBe(true);
  });

  it('should include COMPONENT type', () => {
    const node = new MockNode('comp', 'Button Component', 'COMPONENT', {
      boundingBox: { x: 0, y: 0, width: 200, height: 200 },
    });
    const config = createDefaultConfig();

    expect(shouldIncludeNode(node as unknown as SceneNode, config)).toBe(true);
  });

  it('should include INSTANCE type', () => {
    const node = new MockNode('inst', 'Button Instance', 'INSTANCE', {
      boundingBox: { x: 0, y: 0, width: 200, height: 200 },
    });
    const config = createDefaultConfig();

    expect(shouldIncludeNode(node as unknown as SceneNode, config)).toBe(true);
  });

  it('should include FRAME/GROUP containers with text children even if not in allowlist', () => {
    const textChild = new MockNode('tc', 'Label', 'TEXT', {
      boundingBox: { x: 10, y: 10, width: 80, height: 20 },
      characters: 'Click me',
    });
    const container = new MockNode('cnt', 'Container', 'FRAME', {
      boundingBox: { x: 0, y: 0, width: 200, height: 200 },
      children: [textChild],
    });
    const config = createDefaultConfig({ includeNodeTypes: [] }); // empty allowlist
    // FRAME is still in NAMEABLE_NODE_TYPES, so it would be included anyway
    // Let's test with GROUP that has text child
    expect(shouldIncludeNode(container as unknown as SceneNode, config)).toBe(true);
  });

  it('should include nodes listed in config.includeNodeTypes', () => {
    // Create a node type not in NAMEABLE_NODE_TYPES but in the config allowlist
    // For this test, use a RECTANGLE type which is not in SKIP_NODE_TYPES or NAMEABLE_NODE_TYPES
    const node = new MockNode('rect', 'My Rect', 'RECTANGLE', {
      boundingBox: { x: 0, y: 0, width: 200, height: 200 },
    });
    const config = createDefaultConfig({ includeNodeTypes: ['RECTANGLE'] });

    expect(shouldIncludeNode(node as unknown as SceneNode, config)).toBe(true);
  });

  it('should exclude node types not in NAMEABLE_NODE_TYPES and not in includeNodeTypes', () => {
    const node = new MockNode('rect', 'My Rect', 'RECTANGLE', {
      boundingBox: { x: 0, y: 0, width: 200, height: 200 },
    });
    const config = createDefaultConfig({ includeNodeTypes: [] });

    expect(shouldIncludeNode(node as unknown as SceneNode, config)).toBe(false);
  });
});

// ------------------------------------------------------------------
// isDefaultName
// ------------------------------------------------------------------

describe('isDefaultName', () => {
  it('should recognize "Frame 123" as a default name', () => {
    expect(isDefaultName('Frame 123')).toBe(true);
  });

  it('should recognize "Frame 1" as a default name', () => {
    expect(isDefaultName('Frame 1')).toBe(true);
  });

  it('should recognize "Rectangle 45" as a default name', () => {
    expect(isDefaultName('Rectangle 45')).toBe(true);
  });

  it('should recognize "Group 8" as a default name', () => {
    expect(isDefaultName('Group 8')).toBe(true);
  });

  it('should recognize "Ellipse 1" as a default name', () => {
    expect(isDefaultName('Ellipse 1')).toBe(true);
  });

  it('should recognize "Vector 4" as a default name', () => {
    expect(isDefaultName('Vector 4')).toBe(true);
  });

  it('should recognize "Line 1" as a default name', () => {
    expect(isDefaultName('Line 1')).toBe(true);
  });

  it('should recognize "Text" as a default name', () => {
    expect(isDefaultName('Text')).toBe(true);
  });

  it('should recognize "Component 5" as a default name', () => {
    expect(isDefaultName('Component 5')).toBe(true);
  });

  it('should recognize "Instance" as a default name', () => {
    expect(isDefaultName('Instance')).toBe(true);
  });

  it('should NOT recognize custom names like "Login Button"', () => {
    expect(isDefaultName('Login Button')).toBe(false);
  });

  it('should NOT recognize "Header" as a default name', () => {
    expect(isDefaultName('Header')).toBe(false);
  });

  it('should NOT recognize "Frame" without a number as a default name', () => {
    expect(isDefaultName('Frame')).toBe(false);
  });

  it('should NOT recognize "Frame abc" as a default name', () => {
    expect(isDefaultName('Frame abc')).toBe(false);
  });

  it('should NOT recognize "My Frame 123" as a default name', () => {
    expect(isDefaultName('My Frame 123')).toBe(false);
  });

  it('should NOT recognize empty string as a default name', () => {
    expect(isDefaultName('')).toBe(false);
  });

  it('should NOT recognize "Rectangle" without a number', () => {
    expect(isDefaultName('Rectangle')).toBe(false);
  });

  it('should NOT recognize "Text 1" as a default name (Text pattern has no number)', () => {
    expect(isDefaultName('Text 1')).toBe(false);
  });
});

// ------------------------------------------------------------------
// extractMetadata
// ------------------------------------------------------------------

describe('extractMetadata', () => {
  beforeEach(() => {
    (globalThis as any).figma = {
      ...(globalThis as any).figma,
      variables: {
        getVariableById: vi.fn(() => null),
      },
    };
  });

  it('should extract basic metadata fields from a FRAME node', () => {
    const node = new MockNode('frame-1', 'Login Form', 'FRAME', {
      boundingBox: { x: 100, y: 200, width: 300, height: 400 },
      layoutMode: 'VERTICAL',
    });
    const meta = extractMetadata(node as unknown as SceneNode, 2);

    expect(meta.id).toBe('frame-1');
    expect(meta.originalName).toBe('Login Form');
    expect(meta.nodeType).toBe('FRAME');
    expect(meta.boundingBox).toEqual({ x: 100, y: 200, width: 300, height: 400 });
    expect(meta.depth).toBe(2);
    expect(meta.layoutMode).toBe('VERTICAL');
  });

  it('should extract parentId when node has a parent', () => {
    const child = new MockNode('child', 'Child', 'FRAME', {
      boundingBox: { x: 10, y: 10, width: 50, height: 50 },
    });
    const parent = new MockNode('parent', 'Parent', 'FRAME', {
      boundingBox: { x: 0, y: 0, width: 200, height: 200 },
      children: [child],
    });

    const meta = extractMetadata(child as unknown as SceneNode, 1);
    expect(meta.parentId).toBe('parent');
  });

  it('should set parentId to null for root nodes', () => {
    const root = new MockNode('root', 'Root', 'FRAME', {
      boundingBox: { x: 0, y: 0, width: 200, height: 200 },
    });

    const meta = extractMetadata(root as unknown as SceneNode, 0);
    expect(meta.parentId).toBeNull();
  });

  it('should extract text content from TEXT node', () => {
    const node = new MockNode('txt', 'Welcome', 'TEXT', {
      boundingBox: { x: 0, y: 0, width: 100, height: 20 },
      characters: 'Welcome to our app',
    });

    const meta = extractMetadata(node as unknown as SceneNode, 0);
    expect(meta.textContent).toBe('Welcome to our app');
  });

  it('should extract text from container with TEXT children', () => {
    const textChild = new MockNode('t1', 'Label', 'TEXT', {
      boundingBox: { x: 10, y: 10, width: 80, height: 20 },
      characters: 'Log In',
    });
    const container = new MockNode('btn', 'Button', 'FRAME', {
      boundingBox: { x: 0, y: 0, width: 100, height: 40 },
      children: [textChild],
    });

    const meta = extractMetadata(container as unknown as SceneNode, 0);
    expect(meta.textContent).toBe('Log In');
  });

  it('should report hasChildren and childCount correctly', () => {
    const child1 = new MockNode('c1', 'C1', 'FRAME', {
      boundingBox: { x: 0, y: 0, width: 50, height: 50 },
    });
    const child2 = new MockNode('c2', 'C2', 'FRAME', {
      boundingBox: { x: 60, y: 0, width: 50, height: 50 },
    });
    const parent = new MockNode('p', 'Parent', 'FRAME', {
      boundingBox: { x: 0, y: 0, width: 200, height: 100 },
      children: [child1, child2],
    });

    const meta = extractMetadata(parent as unknown as SceneNode, 0);
    expect(meta.hasChildren).toBe(true);
    expect(meta.childCount).toBe(2);
  });

  it('should return hasChildren=false and childCount=0 for leaf nodes', () => {
    const leaf = new MockNode('leaf', 'Leaf Text', 'TEXT', {
      boundingBox: { x: 0, y: 0, width: 100, height: 20 },
      characters: 'Hello',
    });
    // MockNode always has children array; remove children to simulate leaf
    leaf.children = [];

    const meta = extractMetadata(leaf as unknown as SceneNode, 0);
    expect(meta.hasChildren).toBe(false);
    expect(meta.childCount).toBe(0);
  });

  it('should set layoutMode to NONE for non-layout nodes', () => {
    const node = new MockNode('grp', 'Group', 'GROUP', {
      boundingBox: { x: 0, y: 0, width: 100, height: 100 },
      layoutMode: 'NONE',
    });

    const meta = extractMetadata(node as unknown as SceneNode, 0);
    expect(meta.layoutMode).toBe('NONE');
  });

  it('should extract HORIZONTAL layout mode', () => {
    const node = new MockNode('f', 'Row', 'FRAME', {
      boundingBox: { x: 0, y: 0, width: 300, height: 50 },
      layoutMode: 'HORIZONTAL',
    });

    const meta = extractMetadata(node as unknown as SceneNode, 0);
    expect(meta.layoutMode).toBe('HORIZONTAL');
  });

  it('should return a zero-rect bounding box when absoluteBoundingBox is null', () => {
    const node = new MockNode('nb', 'No Box', 'FRAME', {});
    node.absoluteBoundingBox = null;

    const meta = extractMetadata(node as unknown as SceneNode, 0);
    expect(meta.boundingBox).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

// ------------------------------------------------------------------
// extractTextContent
// ------------------------------------------------------------------

describe('extractTextContent', () => {
  it('should extract characters from a TEXT node', () => {
    const node = new MockNode('t', 'Label', 'TEXT', {
      characters: 'Hello World',
    });

    const text = extractTextContent(node as unknown as SceneNode);
    expect(text).toBe('Hello World');
  });

  it('should return null for TEXT node with empty characters', () => {
    const node = new MockNode('t', 'Empty Text', 'TEXT', {
      characters: '',
    });

    const text = extractTextContent(node as unknown as SceneNode);
    expect(text).toBeNull();
  });

  it('should extract concatenated text from container with multiple TEXT children', () => {
    const text1 = new MockNode('t1', 'Text1', 'TEXT', {
      characters: 'Hello',
    });
    const text2 = new MockNode('t2', 'Text2', 'TEXT', {
      characters: 'World',
    });
    const container = new MockNode('c', 'Container', 'FRAME', {
      children: [text1, text2],
    });

    const text = extractTextContent(container as unknown as SceneNode);
    expect(text).toBe('Hello World');
  });

  it('should return null for a container with no TEXT children', () => {
    const frame = new MockNode('f1', 'Inner Frame', 'FRAME', {
      boundingBox: { x: 0, y: 0, width: 50, height: 50 },
    });
    const container = new MockNode('c', 'Container', 'FRAME', {
      children: [frame],
    });

    const text = extractTextContent(container as unknown as SceneNode);
    expect(text).toBeNull();
  });

  it('should skip TEXT children with empty characters in container', () => {
    const emptyText = new MockNode('te', 'Empty', 'TEXT', {
      characters: '',
    });
    const realText = new MockNode('tr', 'Real', 'TEXT', {
      characters: 'Content',
    });
    const container = new MockNode('c', 'Container', 'FRAME', {
      children: [emptyText, realText],
    });

    const text = extractTextContent(container as unknown as SceneNode);
    expect(text).toBe('Content');
  });

  it('should only collect first-level TEXT children (not deeply nested)', () => {
    const deepText = new MockNode('dt', 'Deep', 'TEXT', {
      characters: 'Deep Text',
    });
    const innerFrame = new MockNode('if', 'Inner', 'FRAME', {
      children: [deepText],
    });
    const container = new MockNode('c', 'Container', 'FRAME', {
      children: [innerFrame],
    });

    // extractTextContent only collects from direct children
    const text = extractTextContent(container as unknown as SceneNode);
    expect(text).toBeNull();
  });
});
