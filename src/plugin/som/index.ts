// ============================================================
// Figma Namer - Module B: SoM (Set-of-Mark) Module Entry
// Re-exports the public API surface for the SoM renderer and
// anti-overlap algorithm.
// ============================================================

// ---- Renderer ----
export { renderSoMImage } from './renderer';
export type { SoMRenderParams } from './renderer';

// ---- Rendering helpers (exposed for testing / advanced use) ----
export {
  drawHighlightBox,
  drawLabel,
  loadImageFromBase64,
} from './renderer';

// ---- Anti-overlap algorithm ----
export { optimizeLabelPositions, calculateEnergy } from './anti-overlap';
export type { LabelPlacement, Rect } from './anti-overlap';

// ---- Geometric helpers (exposed for testing) ----
export {
  calculateOverlapArea,
  calculateBoundaryPenalty,
} from './anti-overlap';
