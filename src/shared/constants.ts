// ============================================================
// Figma Namer - Constants
// ============================================================

/** Plugin UI dimensions */
export const UI_WIDTH = 480;
export const UI_HEIGHT = 640;

/** Temporary overlay layer name (for SoM marks on Figma canvas) */
export const SOM_OVERLAY_LAYER_NAME = '__FigmaNamer_SoM_Overlay__';

/** SoM rendering defaults */
export const SOM_DEFAULTS = {
  HIGHLIGHT_STROKE_WIDTH: 2,
  HIGHLIGHT_OPACITY: 0.3,
  LABEL_BG_COLOR: '#FF0040',
  LABEL_TEXT_COLOR: '#FFFFFF',
  LABEL_PADDING: 4,
  LABEL_FONT_SIZE: 14,
  LABEL_FONT_FAMILY: 'Arial, sans-serif',
  LABEL_BORDER_RADIUS: 3,
} as const;

/** Anti-overlap algorithm parameters */
export const ANTI_OVERLAP = {
  MAX_ITERATIONS: 200,
  INITIAL_TEMPERATURE: 100,
  COOLING_RATE: 0.95,
  NUDGE_RADIUS: 20,
  NUDGE_ANGLES: 12,
  OVERLAP_PENALTY_WEIGHT: 10,
  BOUNDARY_PENALTY_WEIGHT: 5,
  DISTANCE_PENALTY_WEIGHT: 1,
} as const;

/** VLM batching limits */
export const BATCH = {
  MAX_NODES_PER_BATCH: 15,
  MAX_IMAGE_DIMENSION: 4096,
  MAX_PAYLOAD_SIZE_MB: 20,
} as const;

/** Figma node types we care about for naming */
export const NAMEABLE_NODE_TYPES = new Set([
  'FRAME',
  'GROUP',
  'COMPONENT',
  'COMPONENT_SET',
  'INSTANCE',
  'TEXT',
  'SECTION',
]);

/** Figma node types to skip during traversal */
export const SKIP_NODE_TYPES = new Set([
  'VECTOR',
  'LINE',
  'ELLIPSE',
  'POLYGON',
  'STAR',
  'BOOLEAN_OPERATION',
  'SLICE',
  'STAMP',
]);

/** Default name patterns that indicate unnamed/default layers */
export const DEFAULT_NAME_PATTERNS = [
  /^Frame \d+$/,
  /^Group \d+$/,
  /^Rectangle \d+$/,
  /^Ellipse \d+$/,
  /^Vector \d+$/,
  /^Line \d+$/,
  /^Text$/,
  /^Component \d+$/,
  /^Instance$/,
];
