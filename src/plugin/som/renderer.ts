// ============================================================
// Figma Namer - Module B: SoM Canvas Renderer
// Renders Set-of-Mark overlays onto a design screenshot using
// the HTML Canvas API.  Runs inside the Plugin UI (iframe).
// ============================================================

import { SOM_DEFAULTS } from '../../shared/constants';
import type { SoMLabel, BoundingBox } from '../../shared/types';
import { toDataURL } from '../../utils/base64';
import { optimizeLabelPositions, type LabelPlacement } from './anti-overlap';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

/**
 * Unified rendering context type.
 * OffscreenCanvasRenderingContext2D is structurally compatible with
 * CanvasRenderingContext2D for the subset of the API we use, but
 * TypeScript treats them as distinct nominal types. We cast through
 * this alias so our drawing helpers accept either context.
 */
type RenderingContext2D = CanvasRenderingContext2D;

/** Parameters required by the main rendering function. */
export interface SoMRenderParams {
  /** Raw Base64-encoded PNG of the design screenshot (no data-URL prefix) */
  baseImageBase64: string;
  /** Width of the base image in pixels */
  baseImageWidth: number;
  /** Height of the base image in pixels */
  baseImageHeight: number;
  /** Array of SoM labels to render onto the image */
  labels: SoMLabel[];
  /** Highlight box colour in any CSS-compatible format (default: '#FF0040') */
  highlightColor: string;
  /** Font size for the numeric ID labels in pixels (default: 14) */
  labelFontSize: number;
}

// ------------------------------------------------------------------
// Main entry point
// ------------------------------------------------------------------

/**
 * Renders a SoM-annotated image by compositing:
 *   1. The original design screenshot as a base layer.
 *   2. Semi-transparent highlight rectangles around each labelled node.
 *   3. Numeric ID badges positioned via the anti-overlap algorithm.
 *
 * @returns A Base64-encoded PNG string (without the `data:` prefix).
 */
export async function renderSoMImage(params: SoMRenderParams): Promise<string> {
  const {
    baseImageBase64,
    baseImageWidth,
    baseImageHeight,
    labels,
    highlightColor,
    labelFontSize,
  } = params;

  // ---- 1. Create canvas & draw the base screenshot ----
  const canvas = createCanvas(baseImageWidth, baseImageHeight);
  const ctx = canvas.getContext('2d')! as RenderingContext2D;

  const baseImage = await loadImageFromBase64(baseImageBase64);
  ctx.drawImage(baseImage, 0, 0, baseImageWidth, baseImageHeight);

  if (labels.length === 0) {
    return canvasToBase64(canvas);
  }

  // ---- 2. Draw highlight boxes ----
  for (const label of labels) {
    drawHighlightBox(
      ctx,
      label.highlightBox,
      highlightColor,
      SOM_DEFAULTS.HIGHLIGHT_OPACITY,
    );
  }

  // ---- 3. Compute label badge dimensions & initial positions ----
  const padding = SOM_DEFAULTS.LABEL_PADDING;
  const font = `bold ${labelFontSize}px ${SOM_DEFAULTS.LABEL_FONT_FAMILY}`;
  ctx.font = font;

  const initialPlacements: LabelPlacement[] = labels.map((label) => {
    const text = String(label.markId);
    const textWidth = ctx.measureText(text).width;
    const badgeWidth = textWidth + padding * 2;
    const badgeHeight = labelFontSize + padding * 2;

    // Initial position: top-left corner of the highlight box
    return {
      markId: label.markId,
      x: label.highlightBox.x,
      y: label.highlightBox.y - badgeHeight, // sit just above the box
      width: badgeWidth,
      height: badgeHeight,
      anchorX: label.highlightBox.x,
      anchorY: label.highlightBox.y - badgeHeight,
    };
  });

  // ---- 4. Anti-overlap optimisation ----
  const optimized = optimizeLabelPositions(
    initialPlacements,
    baseImageWidth,
    baseImageHeight,
  );

  // ---- 5. Draw label badges ----
  for (const placement of optimized) {
    drawLabel(
      ctx,
      placement.markId,
      placement.x,
      placement.y,
      labelFontSize,
      highlightColor,
      SOM_DEFAULTS.LABEL_TEXT_COLOR,
    );
  }

  // ---- 6. Export as Base64 PNG ----
  return canvasToBase64(canvas);
}

// ------------------------------------------------------------------
// Drawing helpers
// ------------------------------------------------------------------

/**
 * Draws a semi-transparent highlight rectangle (stroke + fill) around
 * a node's bounding box.
 *
 * @param ctx     - 2D canvas rendering context.
 * @param box     - The bounding box to highlight.
 * @param color   - Stroke / fill colour (CSS colour string).
 * @param opacity - Fill opacity (0..1). The stroke is always fully opaque.
 */
export function drawHighlightBox(
  ctx: RenderingContext2D,
  box: BoundingBox,
  color: string,
  opacity: number,
): void {
  const { x, y, width, height } = box;

  // Semi-transparent fill
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
  ctx.restore();

  // Fully-opaque stroke
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = SOM_DEFAULTS.HIGHLIGHT_STROKE_WIDTH;
  ctx.strokeRect(x, y, width, height);
  ctx.restore();
}

/**
 * Draws a numeric ID badge - a rounded-rectangle pill with a solid
 * background colour and white centred text.
 *
 * @param ctx       - 2D canvas rendering context.
 * @param markId    - The numeric ID to display.
 * @param x         - Top-left X of the badge rectangle.
 * @param y         - Top-left Y of the badge rectangle.
 * @param fontSize  - Font size in pixels.
 * @param bgColor   - Badge background colour.
 * @param textColor - Text colour (usually white).
 */
export function drawLabel(
  ctx: RenderingContext2D,
  markId: number,
  x: number,
  y: number,
  fontSize: number,
  bgColor: string,
  textColor: string,
): void {
  const padding = SOM_DEFAULTS.LABEL_PADDING;
  const borderRadius = SOM_DEFAULTS.LABEL_BORDER_RADIUS;
  const text = String(markId);

  ctx.save();

  // Measure text to determine badge size
  ctx.font = `bold ${fontSize}px ${SOM_DEFAULTS.LABEL_FONT_FAMILY}`;
  const textMetrics = ctx.measureText(text);
  const badgeWidth = textMetrics.width + padding * 2;
  const badgeHeight = fontSize + padding * 2;

  // Draw rounded-rectangle background
  drawRoundedRect(ctx, x, y, badgeWidth, badgeHeight, borderRadius);
  ctx.fillStyle = bgColor;
  ctx.fill();

  // Draw text
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + badgeWidth / 2, y + badgeHeight / 2);

  ctx.restore();
}

// ------------------------------------------------------------------
// Image loading
// ------------------------------------------------------------------

/**
 * Creates an HTMLImageElement from a Base64-encoded image string.
 * Works in the browser/iframe environment.
 *
 * @param base64 - Raw Base64 string (no data-URL prefix).
 * @returns        Promise that resolves to the loaded HTMLImageElement.
 */
export function loadImageFromBase64(base64: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) =>
      reject(new Error(`Failed to load image from Base64: ${String(err)}`));
    img.src = toDataURL(base64, 'image/png');
  });
}

// ------------------------------------------------------------------
// Internal helpers
// ------------------------------------------------------------------

/**
 * Creates a Canvas element (or OffscreenCanvas where available) with
 * the specified dimensions.
 *
 * We prefer OffscreenCanvas for memory efficiency but fall back to a
 * standard HTMLCanvasElement for broader browser compatibility.
 */
function createCanvas(
  width: number,
  height: number,
): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Exports a canvas to a Base64 PNG string (without the data-URL prefix).
 *
 * Handles both HTMLCanvasElement.toDataURL() and
 * OffscreenCanvas.convertToBlob().
 */
async function canvasToBase64(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): Promise<string> {
  if (canvas instanceof OffscreenCanvas) {
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return blobToBase64(blob);
  }

  // HTMLCanvasElement path
  const dataUrl = (canvas as HTMLCanvasElement).toDataURL('image/png');
  // Strip the "data:image/png;base64," prefix
  return dataUrl.split(',')[1];
}

/**
 * Converts a Blob to a raw Base64 string (no data-URL prefix).
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // Strip the "data:...;base64," prefix
      resolve(dataUrl.split(',')[1]);
    };
    reader.onerror = () => reject(new Error('Failed to convert Blob to Base64'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Draws a rounded rectangle path on the given context.
 * Does NOT fill or stroke - the caller is responsible for that.
 */
function drawRoundedRect(
  ctx: RenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  // Clamp radius to avoid drawing artifacts on very small badges
  const r = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
