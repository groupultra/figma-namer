// ============================================================
// Figma Namer - Module B: Anti-Overlap Algorithm
// Simulated Annealing-based label placement optimizer
// Prevents SoM numeric labels from overlapping each other
// or escaping canvas boundaries, while keeping them close
// to their anchor elements.
// ============================================================

import { ANTI_OVERLAP } from '../../shared/constants';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

/** Describes the current placement of a single SoM label. */
export interface LabelPlacement {
  /** SoM numeric ID shown inside the label badge */
  markId: number;
  /** Top-left X of the label rectangle */
  x: number;
  /** Top-left Y of the label rectangle */
  y: number;
  /** Label badge width (computed from text metrics + padding) */
  width: number;
  /** Label badge height */
  height: number;
  /** Original anchor X - typically the top-left corner of the highlight box */
  anchorX: number;
  /** Original anchor Y */
  anchorY: number;
}

/** Axis-aligned rectangle used for overlap / boundary calculations. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ------------------------------------------------------------------
// Constants (imported from shared but aliased here for readability)
// ------------------------------------------------------------------

const {
  MAX_ITERATIONS,
  INITIAL_TEMPERATURE,
  COOLING_RATE,
  NUDGE_RADIUS,
  NUDGE_ANGLES,
  OVERLAP_PENALTY_WEIGHT,
  BOUNDARY_PENALTY_WEIGHT,
  DISTANCE_PENALTY_WEIGHT,
} = ANTI_OVERLAP;

// ------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------

/**
 * Optimizes label positions using Simulated Annealing so that labels:
 *   1. Do not overlap each other
 *   2. Stay within canvas boundaries
 *   3. Remain as close as possible to their original anchor points
 *
 * The function is pure - it does not mutate the input array but
 * returns a new array of placements with optimized (x, y) values.
 *
 * @param labels       - Initial label placements (typically anchored to
 *                       highlight-box corners).
 * @param canvasWidth  - Width of the canvas in pixels.
 * @param canvasHeight - Height of the canvas in pixels.
 * @returns            - New array of LabelPlacement with adjusted positions.
 */
export function optimizeLabelPositions(
  labels: LabelPlacement[],
  canvasWidth: number,
  canvasHeight: number,
): LabelPlacement[] {
  // Nothing to optimise for 0 or 1 labels
  if (labels.length <= 1) {
    return labels.map((l) => ({ ...l }));
  }

  // Deep-copy so we never mutate the caller's data
  const placements: LabelPlacement[] = labels.map((l) => ({ ...l }));

  // Pre-compute the fixed set of directional offsets we will probe on
  // each perturbation step. Generating them once avoids repeated
  // trigonometry inside the hot loop.
  const directions = precomputeDirections(NUDGE_ANGLES, NUDGE_RADIUS);

  let temperature = INITIAL_TEMPERATURE;
  let currentEnergy = calculateEnergy(placements, canvasWidth, canvasHeight);

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    // Pick a random label to perturb
    const idx = Math.floor(Math.random() * placements.length);
    const label = placements[idx];
    const origX = label.x;
    const origY = label.y;

    // Try each candidate direction and keep the best improvement
    let bestDx = 0;
    let bestDy = 0;
    let bestEnergy = currentEnergy;

    for (const [dx, dy] of directions) {
      // Tentatively move
      label.x = origX + dx;
      label.y = origY + dy;

      const candidateEnergy = calculateEnergy(placements, canvasWidth, canvasHeight);
      if (candidateEnergy < bestEnergy) {
        bestEnergy = candidateEnergy;
        bestDx = dx;
        bestDy = dy;
      }
    }

    // Restore original position before deciding
    label.x = origX;
    label.y = origY;

    // Accept or reject the best move found
    if (bestEnergy < currentEnergy) {
      // Improvement - always accept
      label.x = origX + bestDx;
      label.y = origY + bestDy;
      currentEnergy = bestEnergy;
    } else if (bestDx !== 0 || bestDy !== 0) {
      // Worse - accept with Boltzmann probability
      const delta = bestEnergy - currentEnergy;
      const acceptanceProbability = Math.exp(-delta / temperature);
      if (Math.random() < acceptanceProbability) {
        label.x = origX + bestDx;
        label.y = origY + bestDy;
        currentEnergy = bestEnergy;
      }
    }

    // Cool down
    temperature *= COOLING_RATE;
  }

  return placements;
}

// ------------------------------------------------------------------
// Energy function
// ------------------------------------------------------------------

/**
 * Computes the total energy of the current configuration.
 *
 * Energy = sum-of-pairwise-overlap-areas * OVERLAP_PENALTY_WEIGHT
 *        + sum-of-boundary-penalties     * BOUNDARY_PENALTY_WEIGHT
 *        + sum-of-anchor-distances       * DISTANCE_PENALTY_WEIGHT
 *
 * A lower energy value indicates a better label arrangement.
 */
export function calculateEnergy(
  placements: LabelPlacement[],
  canvasWidth: number,
  canvasHeight: number,
): number {
  let overlapPenalty = 0;
  let boundaryPenalty = 0;
  let distancePenalty = 0;

  const n = placements.length;

  for (let i = 0; i < n; i++) {
    const a = placements[i];

    // -- Pairwise overlap (only check each pair once) --
    for (let j = i + 1; j < n; j++) {
      overlapPenalty += calculateOverlapArea(a, placements[j]);
    }

    // -- Boundary penalty --
    boundaryPenalty += calculateBoundaryPenalty(a, canvasWidth, canvasHeight);

    // -- Distance from anchor --
    const dx = a.x - a.anchorX;
    const dy = a.y - a.anchorY;
    distancePenalty += Math.sqrt(dx * dx + dy * dy);
  }

  return (
    overlapPenalty * OVERLAP_PENALTY_WEIGHT +
    boundaryPenalty * BOUNDARY_PENALTY_WEIGHT +
    distancePenalty * DISTANCE_PENALTY_WEIGHT
  );
}

// ------------------------------------------------------------------
// Geometric helpers
// ------------------------------------------------------------------

/**
 * Returns the overlapping area (in px^2) between two axis-aligned
 * rectangles. Returns 0 when they do not overlap.
 */
export function calculateOverlapArea(a: Rect, b: Rect): number {
  const xOverlap = Math.max(
    0,
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
  );
  const yOverlap = Math.max(
    0,
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  );
  return xOverlap * yOverlap;
}

/**
 * Computes a penalty proportional to the area of the label that
 * falls outside the canvas boundaries. Returns 0 when the label
 * is fully within bounds.
 */
export function calculateBoundaryPenalty(
  label: Rect,
  canvasWidth: number,
  canvasHeight: number,
): number {
  let penalty = 0;

  // Left edge overflow
  if (label.x < 0) {
    penalty += (-label.x) * label.height;
  }

  // Top edge overflow
  if (label.y < 0) {
    penalty += (-label.y) * label.width;
  }

  // Right edge overflow
  const rightOverflow = (label.x + label.width) - canvasWidth;
  if (rightOverflow > 0) {
    penalty += rightOverflow * label.height;
  }

  // Bottom edge overflow
  const bottomOverflow = (label.y + label.height) - canvasHeight;
  if (bottomOverflow > 0) {
    penalty += bottomOverflow * label.width;
  }

  return penalty;
}

// ------------------------------------------------------------------
// Internal helpers
// ------------------------------------------------------------------

/**
 * Pre-computes (dx, dy) offsets evenly distributed around a circle
 * of the given radius. This avoids calling sin/cos inside the hot
 * SA loop.
 *
 * @param numAngles - Number of evenly-spaced directions.
 * @param radius    - Maximum displacement in pixels.
 * @returns         - Array of [dx, dy] tuples.
 */
function precomputeDirections(
  numAngles: number,
  radius: number,
): Array<[number, number]> {
  const dirs: Array<[number, number]> = [];
  const step = (2 * Math.PI) / numAngles;

  for (let i = 0; i < numAngles; i++) {
    const angle = step * i;
    dirs.push([
      Math.round(Math.cos(angle) * radius),
      Math.round(Math.sin(angle) * radius),
    ]);
  }

  return dirs;
}
