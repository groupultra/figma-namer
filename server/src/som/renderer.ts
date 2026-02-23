// ============================================================
// Figma Namer - SoM Server-side Renderer
// Uses @napi-rs/canvas for Node.js canvas operations
// Adapted from src/plugin/som/renderer.ts
// ============================================================

import { createCanvas, loadImage, type Canvas, type SKRSContext2D } from '@napi-rs/canvas';
import { SOM_DEFAULTS } from '@shared/constants';
import type { SoMLabel, BoundingBox } from '@shared/types';
import { optimizeLabelPositions, type LabelPlacement } from './anti-overlap';

export interface SoMRenderParams {
  /** Raw Base64-encoded PNG (no data-URL prefix) */
  baseImageBase64: string;
  baseImageWidth: number;
  baseImageHeight: number;
  labels: SoMLabel[];
  highlightColor: string;
  labelFontSize: number;
}

/**
 * Render a SoM-annotated image server-side using @napi-rs/canvas.
 * Returns a Base64-encoded PNG string (without data: prefix).
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

  // 1. Create canvas & draw base image
  const canvas = createCanvas(baseImageWidth, baseImageHeight);
  const ctx = canvas.getContext('2d');

  const imgBuffer = Buffer.from(baseImageBase64, 'base64');
  const baseImage = await loadImage(imgBuffer);
  ctx.drawImage(baseImage, 0, 0, baseImageWidth, baseImageHeight);

  if (labels.length === 0) {
    return canvasToBase64(canvas);
  }

  // 2. Draw highlight boxes
  for (const label of labels) {
    drawHighlightBox(ctx, label.highlightBox, highlightColor, SOM_DEFAULTS.HIGHLIGHT_OPACITY);
  }

  // 3. Compute label badge dimensions
  const padding = SOM_DEFAULTS.LABEL_PADDING;
  const font = `bold ${labelFontSize}px ${SOM_DEFAULTS.LABEL_FONT_FAMILY}`;
  ctx.font = font;

  const initialPlacements: LabelPlacement[] = labels.map((label) => {
    const text = String(label.markId);
    const textWidth = ctx.measureText(text).width;
    const badgeWidth = textWidth + padding * 2;
    const badgeHeight = labelFontSize + padding * 2;

    return {
      markId: label.markId,
      x: label.highlightBox.x,
      y: label.highlightBox.y - badgeHeight,
      width: badgeWidth,
      height: badgeHeight,
      anchorX: label.highlightBox.x,
      anchorY: label.highlightBox.y - badgeHeight,
    };
  });

  // 4. Anti-overlap optimization
  const optimized = optimizeLabelPositions(initialPlacements, baseImageWidth, baseImageHeight);

  // 5. Draw labels
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

  // 6. Export
  return canvasToBase64(canvas);
}

function drawHighlightBox(
  ctx: SKRSContext2D,
  box: BoundingBox,
  color: string,
  opacity: number,
): void {
  const { x, y, width, height } = box;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = SOM_DEFAULTS.HIGHLIGHT_STROKE_WIDTH;
  ctx.strokeRect(x, y, width, height);
  ctx.restore();
}

function drawLabel(
  ctx: SKRSContext2D,
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
  ctx.font = `bold ${fontSize}px ${SOM_DEFAULTS.LABEL_FONT_FAMILY}`;
  const textMetrics = ctx.measureText(text);
  const badgeWidth = textMetrics.width + padding * 2;
  const badgeHeight = fontSize + padding * 2;

  drawRoundedRect(ctx, x, y, badgeWidth, badgeHeight, borderRadius);
  ctx.fillStyle = bgColor;
  ctx.fill();

  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + badgeWidth / 2, y + badgeHeight / 2);

  ctx.restore();
}

function drawRoundedRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
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

/**
 * Render highlight boxes and numbered labels on a full page image.
 * Used as Image 3 in the agentic flow — shows WHERE components are on the page.
 */
export async function renderPageHighlights(params: {
  pageImageBase64: string;
  pageImageWidth: number;
  pageImageHeight: number;
  /** Bounding box of the page node (for coordinate offset) */
  pageBBox: BoundingBox;
  labels: SoMLabel[];
  highlightColor: string;
  labelFontSize: number;
  exportScale: number;
}): Promise<string> {
  const {
    pageImageBase64,
    pageImageWidth,
    pageImageHeight,
    pageBBox,
    labels,
    highlightColor,
    labelFontSize,
    exportScale,
  } = params;

  const canvas = createCanvas(pageImageWidth, pageImageHeight);
  const ctx = canvas.getContext('2d');

  const imgBuffer = Buffer.from(pageImageBase64, 'base64');
  const baseImage = await loadImage(imgBuffer);
  ctx.drawImage(baseImage, 0, 0, pageImageWidth, pageImageHeight);

  if (labels.length === 0) return canvasToBase64(canvas);

  // Convert labels to page-relative coordinates
  const relativeLabels = labels.map((label) => ({
    ...label,
    highlightBox: {
      x: (label.highlightBox.x - pageBBox.x) * exportScale,
      y: (label.highlightBox.y - pageBBox.y) * exportScale,
      width: label.highlightBox.width * exportScale,
      height: label.highlightBox.height * exportScale,
    },
  }));

  // Draw semi-transparent highlight boxes
  for (const label of relativeLabels) {
    drawHighlightBox(ctx, label.highlightBox, highlightColor, SOM_DEFAULTS.HIGHLIGHT_OPACITY);
  }

  // Draw numbered labels
  const font = `bold ${labelFontSize}px ${SOM_DEFAULTS.LABEL_FONT_FAMILY}`;
  ctx.font = font;

  for (const label of relativeLabels) {
    drawLabel(
      ctx,
      label.markId,
      label.highlightBox.x,
      Math.max(0, label.highlightBox.y - labelFontSize - SOM_DEFAULTS.LABEL_PADDING * 2),
      labelFontSize,
      highlightColor,
      SOM_DEFAULTS.LABEL_TEXT_COLOR,
    );
  }

  return canvasToBase64(canvas);
}

/**
 * Render a grid of component crops, each with a numbered label.
 * Used as Image 2 in the agentic flow — close-up view of each component.
 */
export async function renderComponentGrid(
  components: Array<{ markId: number; imageBuffer: Buffer }>,
  maxColumns: number = 3,
  cellPadding: number = 12,
  labelFontSize: number = 16,
): Promise<string> {
  if (components.length === 0) {
    // Return 1x1 blank image
    const blank = createCanvas(1, 1);
    return canvasToBase64(blank);
  }

  // Load all component images to get dimensions
  const loaded = await Promise.all(
    components.map(async (comp) => {
      const img = await loadImage(comp.imageBuffer);
      return { markId: comp.markId, img, width: img.width, height: img.height };
    }),
  );

  // Layout: grid with max columns
  const cols = Math.min(maxColumns, loaded.length);
  const rows = Math.ceil(loaded.length / cols);

  // Find max cell dimensions
  const maxCellWidth = Math.max(...loaded.map(l => l.width));
  const maxCellHeight = Math.max(...loaded.map(l => l.height));

  // Cap cell size to avoid huge images
  const cellWidth = Math.min(maxCellWidth, 600);
  const cellHeight = Math.min(maxCellHeight, 600);

  const labelHeight = labelFontSize + SOM_DEFAULTS.LABEL_PADDING * 2 + 4;
  const totalWidth = cols * (cellWidth + cellPadding) + cellPadding;
  const totalHeight = rows * (cellHeight + labelHeight + cellPadding) + cellPadding;

  const canvas = createCanvas(totalWidth, totalHeight);
  const ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  for (let i = 0; i < loaded.length; i++) {
    const { markId, img, width, height } = loaded[i];
    const col = i % cols;
    const row = Math.floor(i / cols);

    const cellX = cellPadding + col * (cellWidth + cellPadding);
    const cellY = cellPadding + row * (cellHeight + labelHeight + cellPadding);

    // Draw label above
    drawLabel(ctx, markId, cellX, cellY, labelFontSize, SOM_DEFAULTS.LABEL_BG_COLOR, SOM_DEFAULTS.LABEL_TEXT_COLOR);

    // Draw component image (fit within cell)
    const imgY = cellY + labelHeight;
    const scale = Math.min(cellWidth / width, cellHeight / height, 1);
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    const offsetX = cellX + (cellWidth - drawWidth) / 2;
    const offsetY = imgY + (cellHeight - drawHeight) / 2;

    // Cell border
    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 1;
    ctx.strokeRect(cellX, imgY, cellWidth, cellHeight);

    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
  }

  return canvasToBase64(canvas);
}

function canvasToBase64(canvas: Canvas): string {
  const buffer = canvas.toBuffer('image/png');
  return buffer.toString('base64');
}
