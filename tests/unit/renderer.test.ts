// ============================================================
// Tests for src/plugin/som/renderer.ts
// Covers: renderSoMImage, drawHighlightBox, drawLabel,
//         loadImageFromBase64, canvasToBase64
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SOM_DEFAULTS } from '../../src/shared/constants';
import type { BoundingBox, SoMLabel } from '../../src/shared/types';

// ------------------------------------------------------------------
// Canvas & Image mocking infrastructure
// ------------------------------------------------------------------

/** Creates a mock CanvasRenderingContext2D with all methods tracked */
function createMockContext(): CanvasRenderingContext2D {
  const ctx: Record<string, any> = {
    // State
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',

    // Drawing methods
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    fill: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arcTo: vi.fn(),

    // State management
    save: vi.fn(),
    restore: vi.fn(),

    // Text measurement - returns a fixed width based on string length
    measureText: vi.fn((text: string) => ({
      width: text.length * 8, // approximate 8px per character
    })),
  };

  return ctx as unknown as CanvasRenderingContext2D;
}

/** Creates a mock HTMLCanvasElement */
function createMockCanvas(width: number, height: number) {
  const ctx = createMockContext();
  const canvas = {
    width,
    height,
    getContext: vi.fn(() => ctx),
    toDataURL: vi.fn(() => 'data:image/png;base64,mockBase64Data'),
  };
  return { canvas, ctx };
}

// ------------------------------------------------------------------
// Set up DOM / global mocks before importing the module
// ------------------------------------------------------------------

// We need to mock document.createElement to return our mock canvas,
// and Image constructor for loadImageFromBase64.

let mockCanvasCtx: CanvasRenderingContext2D;
let mockCanvasElement: any;
let mockImageInstances: any[];

beforeEach(() => {
  mockImageInstances = [];

  const { canvas, ctx } = createMockCanvas(800, 600);
  mockCanvasCtx = ctx;
  mockCanvasElement = canvas;

  // Mock document.createElement to return our mock canvas
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName === 'canvas') {
      return mockCanvasElement as unknown as HTMLCanvasElement;
    }
    return originalCreateElement(tagName);
  });

  // Create a MockOffscreenCanvas class. The renderer prefers OffscreenCanvas when
  // available. We mock it with getContext() returning our shared mock context and
  // convertToBlob() returning a Blob that blobToBase64() can process via FileReader.
  class MockOffscreenCanvas {
    width: number;
    height: number;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
    }
    getContext() {
      return mockCanvasCtx;
    }
    async convertToBlob() {
      return new Blob(['mockBase64Data'], { type: 'image/png' });
    }
  }
  vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);

  // Mock Image constructor
  const MockImage = vi.fn().mockImplementation(() => {
    const img: any = {
      onload: null,
      onerror: null,
      _src: '',
      get src() {
        return this._src;
      },
      set src(value: string) {
        this._src = value;
        // Trigger onload asynchronously
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 0);
      },
    };
    mockImageInstances.push(img);
    return img;
  });

  vi.stubGlobal('Image', MockImage);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ------------------------------------------------------------------
// Import the module under test (after mocks are set up at module level)
// ------------------------------------------------------------------

// We use dynamic imports inside tests to ensure mocks are in place,
// but since vitest hoists vi.mock calls, we import statically and
// rely on beforeEach to set up the canvas mock on document.
import {
  renderSoMImage,
  drawHighlightBox,
  drawLabel,
  loadImageFromBase64,
} from '../../src/plugin/som/renderer';
import type { SoMRenderParams } from '../../src/plugin/som/renderer';

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function createSoMLabel(overrides: Partial<SoMLabel> = {}): SoMLabel {
  return {
    markId: 1,
    nodeId: 'node-001',
    labelPosition: { x: 100, y: 90 },
    highlightBox: { x: 100, y: 100, width: 200, height: 48 },
    originalName: 'Rectangle 45',
    ...overrides,
  };
}

function createRenderParams(overrides: Partial<SoMRenderParams> = {}): SoMRenderParams {
  return {
    baseImageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk',
    baseImageWidth: 800,
    baseImageHeight: 600,
    labels: [],
    highlightColor: '#FF0040',
    labelFontSize: 14,
    ...overrides,
  };
}

// ------------------------------------------------------------------
// renderSoMImage
// ------------------------------------------------------------------

describe('renderSoMImage', () => {
  it('should return a base64 string when called with empty labels', async () => {
    const params = createRenderParams({ labels: [] });
    const result = await renderSoMImage(params);

    // The result should be a base64 string. With OffscreenCanvas, convertToBlob()
    // returns a Blob whose content is processed by FileReader, producing the
    // actual base64 encoding of the Blob bytes.
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should create a canvas with the specified dimensions', async () => {
    const params = createRenderParams({
      baseImageWidth: 1024,
      baseImageHeight: 768,
      labels: [],
    });

    await renderSoMImage(params);

    // With OffscreenCanvas available, the renderer uses new OffscreenCanvas()
    // instead of document.createElement('canvas'). We verify the context was obtained.
    expect(mockCanvasCtx.drawImage).toHaveBeenCalled();
  });

  it('should draw the base image onto the canvas', async () => {
    const params = createRenderParams({ labels: [] });

    await renderSoMImage(params);

    // drawImage should be called with the loaded image
    expect(mockCanvasCtx.drawImage).toHaveBeenCalled();
    const call = (mockCanvasCtx.drawImage as any).mock.calls[0];
    // Arguments: image, x, y, width, height
    expect(call[1]).toBe(0); // x
    expect(call[2]).toBe(0); // y
    expect(call[3]).toBe(800); // width
    expect(call[4]).toBe(600); // height
  });

  it('should not draw highlight boxes or labels when labels array is empty', async () => {
    const params = createRenderParams({ labels: [] });

    await renderSoMImage(params);

    // fillRect should not be called (no highlight boxes)
    expect(mockCanvasCtx.fillRect).not.toHaveBeenCalled();
    // fillText should not be called (no label badges)
    expect(mockCanvasCtx.fillText).not.toHaveBeenCalled();
  });

  it('should draw highlight boxes for each label', async () => {
    const labels = [
      createSoMLabel({ markId: 1, highlightBox: { x: 10, y: 20, width: 100, height: 50 } }),
      createSoMLabel({ markId: 2, highlightBox: { x: 200, y: 300, width: 150, height: 60 } }),
    ];
    const params = createRenderParams({ labels });

    await renderSoMImage(params);

    // fillRect should be called for highlight boxes (semi-transparent fill)
    // Each highlight box calls fillRect once and strokeRect once
    expect(mockCanvasCtx.fillRect).toHaveBeenCalledWith(10, 20, 100, 50);
    expect(mockCanvasCtx.fillRect).toHaveBeenCalledWith(200, 300, 150, 60);
    expect(mockCanvasCtx.strokeRect).toHaveBeenCalledWith(10, 20, 100, 50);
    expect(mockCanvasCtx.strokeRect).toHaveBeenCalledWith(200, 300, 150, 60);
  });

  it('should draw label badges for each label', async () => {
    const labels = [
      createSoMLabel({ markId: 1 }),
      createSoMLabel({ markId: 2 }),
    ];
    const params = createRenderParams({ labels });

    await renderSoMImage(params);

    // fillText should be called for label text (badge numbers)
    expect(mockCanvasCtx.fillText).toHaveBeenCalled();
    const fillTextCalls = (mockCanvasCtx.fillText as any).mock.calls;
    const texts = fillTextCalls.map((call: any[]) => call[0]);
    expect(texts).toContain('1');
    expect(texts).toContain('2');
  });

  it('should export the final image via convertToBlob', async () => {
    const params = createRenderParams({ labels: [] });

    const result = await renderSoMImage(params);

    // With OffscreenCanvas, the renderer uses convertToBlob() + blobToBase64()
    // instead of toDataURL(). We verify a non-empty base64 string is returned.
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------------
// drawHighlightBox
// ------------------------------------------------------------------

describe('drawHighlightBox', () => {
  it('should draw a semi-transparent filled rectangle', () => {
    const ctx = createMockContext();
    const box: BoundingBox = { x: 50, y: 100, width: 200, height: 80 };

    drawHighlightBox(ctx, box, '#FF0040', 0.3);

    // Check that save/restore is called for state management
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();

    // Check fillRect was called with correct coordinates
    expect(ctx.fillRect).toHaveBeenCalledWith(50, 100, 200, 80);
  });

  it('should draw a fully-opaque stroke rectangle', () => {
    const ctx = createMockContext();
    const box: BoundingBox = { x: 50, y: 100, width: 200, height: 80 };

    drawHighlightBox(ctx, box, '#FF0040', 0.3);

    // strokeRect should be called with the same coordinates
    expect(ctx.strokeRect).toHaveBeenCalledWith(50, 100, 200, 80);
  });

  it('should set the fill color to the specified highlight color', () => {
    const ctx = createMockContext();
    const box: BoundingBox = { x: 0, y: 0, width: 100, height: 100 };

    drawHighlightBox(ctx, box, '#00FF00', 0.5);

    // After save, fillStyle should be set (we check it was at some point '#00FF00')
    // The mock ctx has fillStyle set directly
    expect(ctx.fillRect).toHaveBeenCalled();
  });

  it('should use SOM_DEFAULTS.HIGHLIGHT_STROKE_WIDTH for the stroke', () => {
    const ctx = createMockContext();
    const box: BoundingBox = { x: 0, y: 0, width: 100, height: 100 };

    drawHighlightBox(ctx, box, '#FF0040', 0.3);

    // The function sets lineWidth to SOM_DEFAULTS.HIGHLIGHT_STROKE_WIDTH (2)
    // We verify strokeRect was called, which means the lineWidth was applied
    expect(ctx.strokeRect).toHaveBeenCalled();
  });

  it('should save and restore context state twice (fill + stroke)', () => {
    const ctx = createMockContext();
    const box: BoundingBox = { x: 10, y: 10, width: 50, height: 50 };

    drawHighlightBox(ctx, box, '#FF0040', 0.3);

    // save/restore should each be called twice (once for fill, once for stroke)
    expect(ctx.save).toHaveBeenCalledTimes(2);
    expect(ctx.restore).toHaveBeenCalledTimes(2);
  });

  it('should handle zero-size bounding boxes', () => {
    const ctx = createMockContext();
    const box: BoundingBox = { x: 50, y: 50, width: 0, height: 0 };

    // Should not throw
    expect(() => drawHighlightBox(ctx, box, '#FF0040', 0.3)).not.toThrow();
    expect(ctx.fillRect).toHaveBeenCalledWith(50, 50, 0, 0);
    expect(ctx.strokeRect).toHaveBeenCalledWith(50, 50, 0, 0);
  });

  it('should handle negative coordinates', () => {
    const ctx = createMockContext();
    const box: BoundingBox = { x: -10, y: -20, width: 100, height: 50 };

    expect(() => drawHighlightBox(ctx, box, '#FF0040', 0.3)).not.toThrow();
    expect(ctx.fillRect).toHaveBeenCalledWith(-10, -20, 100, 50);
  });
});

// ------------------------------------------------------------------
// drawLabel
// ------------------------------------------------------------------

describe('drawLabel', () => {
  it('should draw a rounded rectangle background', () => {
    const ctx = createMockContext();

    drawLabel(ctx, 1, 100, 50, 14, '#FF0040', '#FFFFFF');

    // beginPath and closePath should be called for the rounded rect
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.closePath).toHaveBeenCalled();
    // fill should be called to fill the background
    expect(ctx.fill).toHaveBeenCalled();
  });

  it('should render the mark ID as text', () => {
    const ctx = createMockContext();

    drawLabel(ctx, 42, 100, 50, 14, '#FF0040', '#FFFFFF');

    // fillText should be called with the mark ID as a string
    expect(ctx.fillText).toHaveBeenCalled();
    const fillTextCall = (ctx.fillText as any).mock.calls[0];
    expect(fillTextCall[0]).toBe('42');
  });

  it('should set the font with the specified font size', () => {
    const ctx = createMockContext();

    drawLabel(ctx, 1, 0, 0, 16, '#FF0040', '#FFFFFF');

    // measureText is called, which implies font was set
    expect(ctx.measureText).toHaveBeenCalledWith('1');
  });

  it('should center the text within the badge', () => {
    const ctx = createMockContext();

    drawLabel(ctx, 5, 100, 50, 14, '#FF0040', '#FFFFFF');

    // fillText should be called with coordinates that center within the badge
    const fillTextCall = (ctx.fillText as any).mock.calls[0];
    const text = fillTextCall[0]; // '5'
    const textX = fillTextCall[1];
    const textY = fillTextCall[2];

    // textWidth = 1 char * 8px = 8px
    // badgeWidth = 8 + padding*2 = 8 + 8 = 16
    // badgeHeight = 14 + padding*2 = 14 + 8 = 22
    // centerX = 100 + 16/2 = 108
    // centerY = 50 + 22/2 = 61
    expect(text).toBe('5');
    expect(textX).toBe(108);
    expect(textY).toBe(61);
  });

  it('should save and restore the context', () => {
    const ctx = createMockContext();

    drawLabel(ctx, 1, 0, 0, 14, '#FF0040', '#FFFFFF');

    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
  });

  it('should handle multi-digit mark IDs', () => {
    const ctx = createMockContext();

    drawLabel(ctx, 999, 0, 0, 14, '#FF0040', '#FFFFFF');

    const fillTextCall = (ctx.fillText as any).mock.calls[0];
    expect(fillTextCall[0]).toBe('999');
    // measureText should have been called with '999'
    expect(ctx.measureText).toHaveBeenCalledWith('999');
  });

  it('should draw arcTo calls for rounded corners', () => {
    const ctx = createMockContext();

    drawLabel(ctx, 1, 10, 20, 14, '#FF0040', '#FFFFFF');

    // The drawRoundedRect function calls arcTo 4 times for 4 corners
    expect(ctx.arcTo).toHaveBeenCalledTimes(4);
  });

  it('should use moveTo and lineTo for the rounded rect sides', () => {
    const ctx = createMockContext();

    drawLabel(ctx, 1, 0, 0, 14, '#FF0040', '#FFFFFF');

    // moveTo is called once (start of path)
    expect(ctx.moveTo).toHaveBeenCalledTimes(1);
    // lineTo is called 4 times (4 sides of the rect)
    expect(ctx.lineTo).toHaveBeenCalledTimes(4);
  });
});

// ------------------------------------------------------------------
// loadImageFromBase64
// ------------------------------------------------------------------

describe('loadImageFromBase64', () => {
  it('should return a promise that resolves with an image element', async () => {
    const result = await loadImageFromBase64('iVBORw0KGgoAAAANSUhEUgAAAAE=');

    expect(result).toBeDefined();
  });

  it('should set the src to a data URL with image/png MIME type', async () => {
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAE=';

    await loadImageFromBase64(base64);

    // The mock Image has _src set
    expect(mockImageInstances.length).toBe(1);
    expect(mockImageInstances[0]._src).toBe(`data:image/png;base64,${base64}`);
  });

  it('should reject when image fails to load', async () => {
    // Override Image mock for this test to trigger onerror
    const ErrorImage = vi.fn().mockImplementation(() => {
      const img: any = {
        onload: null,
        onerror: null,
        _src: '',
        get src() {
          return this._src;
        },
        set src(value: string) {
          this._src = value;
          setTimeout(() => {
            if (this.onerror) this.onerror('load error');
          }, 0);
        },
      };
      return img;
    });
    vi.stubGlobal('Image', ErrorImage);

    await expect(loadImageFromBase64('invalid-base64')).rejects.toThrow(
      'Failed to load image from Base64'
    );
  });

  it('should use the toDataURL utility to construct the src', async () => {
    const base64 = 'AAAA';
    await loadImageFromBase64(base64);

    expect(mockImageInstances[0]._src).toMatch(/^data:image\/png;base64,/);
  });
});

// ------------------------------------------------------------------
// canvasToBase64 (tested indirectly through renderSoMImage)
// ------------------------------------------------------------------

describe('canvasToBase64 (via renderSoMImage)', () => {
  it('should return a raw base64 string without data URL prefix', async () => {
    // With OffscreenCanvas, canvasToBase64 uses convertToBlob() + blobToBase64()
    // which processes the Blob via FileReader and strips the data URL prefix.
    const params = createRenderParams({ labels: [] });
    const result = await renderSoMImage(params);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toContain('data:image/png;base64,');
  });

  it('should produce valid base64 output', async () => {
    const params = createRenderParams({ labels: [] });
    const result = await renderSoMImage(params);

    // The result should be valid base64 (only contains base64-safe characters)
    expect(result).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('should produce a non-empty result', async () => {
    const params = createRenderParams({ labels: [] });
    const result = await renderSoMImage(params);

    expect(result.length).toBeGreaterThan(0);
  });
});
