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

function canvasToBase64(canvas: Canvas): string {
  const buffer = canvas.toBuffer('image/png');
  return buffer.toString('base64');
}
