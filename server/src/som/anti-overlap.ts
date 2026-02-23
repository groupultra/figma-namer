// ============================================================
// Figma Namer - Anti-Overlap Algorithm (server copy)
// Pure math, no platform dependencies - copied from
// src/plugin/som/anti-overlap.ts
// ============================================================

import { ANTI_OVERLAP } from '@shared/constants';

export interface LabelPlacement {
  markId: number;
  x: number;
  y: number;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

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

export function optimizeLabelPositions(
  labels: LabelPlacement[],
  canvasWidth: number,
  canvasHeight: number,
): LabelPlacement[] {
  if (labels.length <= 1) {
    return labels.map((l) => ({ ...l }));
  }

  const placements: LabelPlacement[] = labels.map((l) => ({ ...l }));
  const directions = precomputeDirections(NUDGE_ANGLES, NUDGE_RADIUS);

  let temperature = INITIAL_TEMPERATURE;
  let currentEnergy = calculateEnergy(placements, canvasWidth, canvasHeight);

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const idx = Math.floor(Math.random() * placements.length);
    const label = placements[idx];
    const origX = label.x;
    const origY = label.y;

    let bestDx = 0;
    let bestDy = 0;
    let bestEnergy = currentEnergy;

    for (const [dx, dy] of directions) {
      label.x = origX + dx;
      label.y = origY + dy;

      const candidateEnergy = calculateEnergy(placements, canvasWidth, canvasHeight);
      if (candidateEnergy < bestEnergy) {
        bestEnergy = candidateEnergy;
        bestDx = dx;
        bestDy = dy;
      }
    }

    label.x = origX;
    label.y = origY;

    if (bestEnergy < currentEnergy) {
      label.x = origX + bestDx;
      label.y = origY + bestDy;
      currentEnergy = bestEnergy;
    } else if (bestDx !== 0 || bestDy !== 0) {
      const delta = bestEnergy - currentEnergy;
      const acceptanceProbability = Math.exp(-delta / temperature);
      if (Math.random() < acceptanceProbability) {
        label.x = origX + bestDx;
        label.y = origY + bestDy;
        currentEnergy = bestEnergy;
      }
    }

    temperature *= COOLING_RATE;
  }

  return placements;
}

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
    for (let j = i + 1; j < n; j++) {
      overlapPenalty += calculateOverlapArea(a, placements[j]);
    }
    boundaryPenalty += calculateBoundaryPenalty(a, canvasWidth, canvasHeight);
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

export function calculateBoundaryPenalty(
  label: Rect,
  canvasWidth: number,
  canvasHeight: number,
): number {
  let penalty = 0;
  if (label.x < 0) penalty += -label.x * label.height;
  if (label.y < 0) penalty += -label.y * label.width;
  const rightOverflow = label.x + label.width - canvasWidth;
  if (rightOverflow > 0) penalty += rightOverflow * label.height;
  const bottomOverflow = label.y + label.height - canvasHeight;
  if (bottomOverflow > 0) penalty += bottomOverflow * label.width;
  return penalty;
}

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
