// ============================================================
// Figma Namer - Figma API Mock
// Comprehensive mock of Figma Plugin API for testing
// ============================================================

import type { BoundingBox } from '../../src/shared/types';

/** Mock Figma node */
export class MockNode {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  locked: boolean;
  parent: MockNode | null;
  children: MockNode[];
  absoluteBoundingBox: BoundingBox | null;
  layoutMode: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  characters?: string;
  boundVariables: Record<string, any>;
  componentProperties: Record<string, any>;

  constructor(
    id: string,
    name: string,
    type: string,
    options: Partial<{
      visible: boolean;
      locked: boolean;
      children: MockNode[];
      boundingBox: BoundingBox;
      layoutMode: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
      characters: string;
      boundVariables: Record<string, any>;
      componentProperties: Record<string, any>;
    }> = {}
  ) {
    this.id = id;
    this.name = name;
    this.type = type;
    this.visible = options.visible ?? true;
    this.locked = options.locked ?? false;
    this.children = options.children ?? [];
    this.parent = null;
    this.absoluteBoundingBox = options.boundingBox ?? { x: 0, y: 0, width: 100, height: 50 };
    this.layoutMode = options.layoutMode ?? 'NONE';
    this.characters = options.characters;
    this.boundVariables = options.boundVariables ?? {};
    this.componentProperties = options.componentProperties ?? {};

    // Set parent references
    for (const child of this.children) {
      child.parent = this;
    }
  }

  findAll(predicate?: (node: MockNode) => boolean): MockNode[] {
    const results: MockNode[] = [];
    const traverse = (node: MockNode) => {
      if (!predicate || predicate(node)) {
        results.push(node);
      }
      for (const child of node.children) {
        traverse(child);
      }
    };
    for (const child of this.children) {
      traverse(child);
    }
    return results;
  }

  async exportAsync(settings: { format: string; constraint?: { type: string; value: number } }): Promise<Uint8Array> {
    // Return a minimal valid PNG (1x1 transparent pixel)
    return new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
      0x54, 0x78, 0x9c, 0x62, 0x00, 0x00, 0x00, 0x02,
      0x00, 0x01, 0xe5, 0x27, 0xde, 0xfc, 0x00, 0x00,
      0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
      0x60, 0x82,
    ]);
  }

  remove(): void {
    if (this.parent) {
      this.parent.children = this.parent.children.filter((c) => c.id !== this.id);
    }
  }
}

/** Build a realistic mock Figma page for testing */
export function createMockDesignPage(): MockNode {
  const loginButton = new MockNode('node-001', 'Rectangle 45', 'FRAME', {
    boundingBox: { x: 100, y: 500, width: 200, height: 48 },
    children: [
      new MockNode('node-001-text', 'Text', 'TEXT', {
        boundingBox: { x: 120, y: 510, width: 160, height: 28 },
        characters: 'Log In',
      }),
    ],
    boundVariables: { fills: { id: 'var-primary-color' } },
  });

  const emailInput = new MockNode('node-002', 'Frame 123', 'FRAME', {
    boundingBox: { x: 100, y: 350, width: 200, height: 44 },
    layoutMode: 'HORIZONTAL',
    children: [
      new MockNode('node-002-icon', 'Vector 4', 'VECTOR', {
        boundingBox: { x: 108, y: 360, width: 24, height: 24 },
      }),
      new MockNode('node-002-text', 'Text', 'TEXT', {
        boundingBox: { x: 140, y: 360, width: 150, height: 24 },
        characters: 'Enter your email',
      }),
    ],
  });

  const passwordInput = new MockNode('node-003', 'Frame 124', 'FRAME', {
    boundingBox: { x: 100, y: 420, width: 200, height: 44 },
    layoutMode: 'HORIZONTAL',
  });

  const logo = new MockNode('node-004', 'Group 8', 'GROUP', {
    boundingBox: { x: 150, y: 100, width: 100, height: 100 },
    children: [
      new MockNode('node-004-circle', 'Ellipse 1', 'ELLIPSE', {
        boundingBox: { x: 150, y: 100, width: 100, height: 100 },
      }),
    ],
  });

  const navBar = new MockNode('node-005', 'Frame 200', 'FRAME', {
    boundingBox: { x: 0, y: 0, width: 400, height: 60 },
    layoutMode: 'HORIZONTAL',
    children: [
      new MockNode('node-005-back', 'Rectangle 2', 'FRAME', {
        boundingBox: { x: 10, y: 15, width: 30, height: 30 },
      }),
      new MockNode('node-005-title', 'Text', 'TEXT', {
        boundingBox: { x: 150, y: 18, width: 100, height: 24 },
        characters: 'Welcome',
      }),
    ],
  });

  const decorativeLine = new MockNode('node-006', 'Line 1', 'LINE', {
    boundingBox: { x: 0, y: 59, width: 400, height: 1 },
  });

  const page = new MockNode('page-root', 'Login Screen', 'FRAME', {
    boundingBox: { x: 0, y: 0, width: 400, height: 800 },
    children: [navBar, decorativeLine, logo, emailInput, passwordInput, loginButton],
  });

  return page;
}

/** Create mock figma global object */
export function createMockFigmaGlobal() {
  const page = createMockDesignPage();

  return {
    currentPage: {
      selection: [page],
      findAll: page.findAll.bind(page),
    },
    getNodeById: (id: string): MockNode | null => {
      const found = page.findAll((n) => n.id === id);
      return found.length > 0 ? found[0] : null;
    },
    ui: {
      postMessage: vi.fn(),
      show: vi.fn(),
      resize: vi.fn(),
      on: vi.fn(),
    },
    showUI: vi.fn(),
    notify: vi.fn(),
    closePlugin: vi.fn(),
  };
}
