// ============================================================
// Tests for src/plugin/som/anti-overlap.ts
// Covers: overlap area calculation, boundary penalty, energy
//         function, simulated annealing optimizer, edge cases
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  calculateOverlapArea,
  calculateBoundaryPenalty,
  calculateEnergy,
  optimizeLabelPositions,
} from '../../src/plugin/som/anti-overlap';
import type { LabelPlacement, Rect } from '../../src/plugin/som/anti-overlap';

// ------------------------------------------------------------------
// Helper
// ------------------------------------------------------------------

function makeLabelPlacement(
  markId: number,
  x: number,
  y: number,
  width: number,
  height: number,
  anchorX?: number,
  anchorY?: number,
): LabelPlacement {
  return {
    markId,
    x,
    y,
    width,
    height,
    anchorX: anchorX ?? x,
    anchorY: anchorY ?? y,
  };
}

// ------------------------------------------------------------------
// calculateOverlapArea
// ------------------------------------------------------------------

describe('calculateOverlapArea', () => {
  it('should return 0 for non-overlapping rectangles side by side', () => {
    const a: Rect = { x: 0, y: 0, width: 50, height: 50 };
    const b: Rect = { x: 60, y: 0, width: 50, height: 50 };

    expect(calculateOverlapArea(a, b)).toBe(0);
  });

  it('should return 0 for non-overlapping rectangles stacked vertically', () => {
    const a: Rect = { x: 0, y: 0, width: 50, height: 50 };
    const b: Rect = { x: 0, y: 60, width: 50, height: 50 };

    expect(calculateOverlapArea(a, b)).toBe(0);
  });

  it('should return 0 for rectangles touching at edge (no overlap)', () => {
    const a: Rect = { x: 0, y: 0, width: 50, height: 50 };
    const b: Rect = { x: 50, y: 0, width: 50, height: 50 };

    expect(calculateOverlapArea(a, b)).toBe(0);
  });

  it('should compute correct overlap for partially overlapping rectangles', () => {
    const a: Rect = { x: 0, y: 0, width: 50, height: 50 };
    const b: Rect = { x: 30, y: 20, width: 50, height: 50 };

    // X overlap: min(50,80) - max(0,30) = 50 - 30 = 20
    // Y overlap: min(50,70) - max(0,20) = 50 - 20 = 30
    // Area = 20 * 30 = 600
    expect(calculateOverlapArea(a, b)).toBe(600);
  });

  it('should compute correct overlap when one rectangle is fully inside another', () => {
    const outer: Rect = { x: 0, y: 0, width: 100, height: 100 };
    const inner: Rect = { x: 10, y: 10, width: 30, height: 30 };

    // Overlap should be the area of the inner rectangle
    expect(calculateOverlapArea(outer, inner)).toBe(900); // 30 * 30
  });

  it('should compute overlap for identical rectangles', () => {
    const a: Rect = { x: 0, y: 0, width: 40, height: 40 };
    const b: Rect = { x: 0, y: 0, width: 40, height: 40 };

    expect(calculateOverlapArea(a, b)).toBe(1600); // 40 * 40
  });

  it('should handle rectangles with negative coordinates', () => {
    const a: Rect = { x: -20, y: -20, width: 40, height: 40 };
    const b: Rect = { x: 0, y: 0, width: 40, height: 40 };

    // X overlap: min(20,40) - max(-20,0) = 20 - 0 = 20
    // Y overlap: min(20,40) - max(-20,0) = 20 - 0 = 20
    expect(calculateOverlapArea(a, b)).toBe(400);
  });

  it('should return 0 for zero-width rectangle', () => {
    const a: Rect = { x: 0, y: 0, width: 0, height: 50 };
    const b: Rect = { x: 0, y: 0, width: 50, height: 50 };

    expect(calculateOverlapArea(a, b)).toBe(0);
  });

  it('should return 0 for zero-height rectangle', () => {
    const a: Rect = { x: 0, y: 0, width: 50, height: 0 };
    const b: Rect = { x: 0, y: 0, width: 50, height: 50 };

    expect(calculateOverlapArea(a, b)).toBe(0);
  });
});

// ------------------------------------------------------------------
// calculateBoundaryPenalty
// ------------------------------------------------------------------

describe('calculateBoundaryPenalty', () => {
  it('should return 0 when label is fully within canvas', () => {
    const label: Rect = { x: 10, y: 10, width: 30, height: 20 };
    expect(calculateBoundaryPenalty(label, 100, 100)).toBe(0);
  });

  it('should return 0 when label exactly fills the canvas', () => {
    const label: Rect = { x: 0, y: 0, width: 100, height: 100 };
    expect(calculateBoundaryPenalty(label, 100, 100)).toBe(0);
  });

  it('should penalize left edge overflow', () => {
    const label: Rect = { x: -10, y: 10, width: 30, height: 20 };
    // Left overflow: 10 * 20 = 200
    expect(calculateBoundaryPenalty(label, 100, 100)).toBe(200);
  });

  it('should penalize top edge overflow', () => {
    const label: Rect = { x: 10, y: -15, width: 30, height: 20 };
    // Top overflow: 15 * 30 = 450
    expect(calculateBoundaryPenalty(label, 100, 100)).toBe(450);
  });

  it('should penalize right edge overflow', () => {
    const label: Rect = { x: 80, y: 10, width: 30, height: 20 };
    // Right overflow: (80+30) - 100 = 10; penalty = 10 * 20 = 200
    expect(calculateBoundaryPenalty(label, 100, 100)).toBe(200);
  });

  it('should penalize bottom edge overflow', () => {
    const label: Rect = { x: 10, y: 90, width: 30, height: 20 };
    // Bottom overflow: (90+20) - 100 = 10; penalty = 10 * 30 = 300
    expect(calculateBoundaryPenalty(label, 100, 100)).toBe(300);
  });

  it('should accumulate penalties for multiple edges overflowing', () => {
    // Label overflows top-left corner
    const label: Rect = { x: -5, y: -10, width: 30, height: 20 };
    // Left overflow: 5 * 20 = 100
    // Top overflow: 10 * 30 = 300
    const penalty = calculateBoundaryPenalty(label, 100, 100);
    expect(penalty).toBe(400);
  });

  it('should handle label completely outside the canvas', () => {
    const label: Rect = { x: -50, y: -50, width: 30, height: 20 };
    // Left overflow: 50 * 20 = 1000
    // Top overflow: 50 * 30 = 1500
    // Right: (-50 + 30) = -20, no overflow
    // Bottom: (-50 + 20) = -30, no overflow
    expect(calculateBoundaryPenalty(label, 100, 100)).toBe(2500);
  });

  it('should handle label overflowing all four edges (very large label)', () => {
    const label: Rect = { x: -10, y: -10, width: 200, height: 200 };
    const canvasW = 50;
    const canvasH = 50;
    // Left overflow: 10 * 200 = 2000
    // Top overflow: 10 * 200 = 2000
    // Right overflow: (-10 + 200) - 50 = 140; 140 * 200 = 28000
    // Bottom overflow: (-10 + 200) - 50 = 140; 140 * 200 = 28000
    expect(calculateBoundaryPenalty(label, canvasW, canvasH)).toBe(60000);
  });
});

// ------------------------------------------------------------------
// calculateEnergy
// ------------------------------------------------------------------

describe('calculateEnergy', () => {
  it('should return 0 energy for an empty placement list', () => {
    const energy = calculateEnergy([], 800, 600);
    expect(energy).toBe(0);
  });

  it('should return only distance penalty for a single non-overlapping label at anchor', () => {
    const labels = [makeLabelPlacement(1, 10, 10, 30, 20, 10, 10)];
    const energy = calculateEnergy(labels, 800, 600);

    // No overlap (only 1 label), no boundary penalty (within canvas),
    // distance = 0 (at anchor)
    expect(energy).toBe(0);
  });

  it('should include distance penalty when label is far from anchor', () => {
    const labels = [makeLabelPlacement(1, 100, 100, 30, 20, 10, 10)];
    const energy = calculateEnergy(labels, 800, 600);

    // distance = sqrt((100-10)^2 + (100-10)^2) = sqrt(16200) ~ 127.28
    // No overlap, no boundary -> energy = distance * DISTANCE_PENALTY_WEIGHT
    expect(energy).toBeGreaterThan(0);
  });

  it('should include overlap penalty for overlapping labels', () => {
    const labels = [
      makeLabelPlacement(1, 0, 0, 40, 20),
      makeLabelPlacement(2, 20, 0, 40, 20),
    ];

    const energy = calculateEnergy(labels, 800, 600);

    // overlap area: X: min(40,60) - max(0,20) = 20; Y: min(20,20) - max(0,0) = 20; area = 400
    // overlap penalty contributes significantly
    expect(energy).toBeGreaterThan(0);
  });

  it('should include boundary penalty for label outside canvas', () => {
    const labels = [makeLabelPlacement(1, -10, -10, 30, 20, -10, -10)];
    const energy = calculateEnergy(labels, 100, 100);

    // Boundary penalty: left 10*20=200, top 10*30=300 => total 500
    // distance = 0 (at anchor)
    expect(energy).toBeGreaterThan(0);
  });

  it('should have higher energy for more overlap', () => {
    const noOverlap = [
      makeLabelPlacement(1, 0, 0, 30, 20),
      makeLabelPlacement(2, 50, 0, 30, 20),
    ];
    const withOverlap = [
      makeLabelPlacement(1, 0, 0, 30, 20),
      makeLabelPlacement(2, 10, 0, 30, 20),
    ];

    const e1 = calculateEnergy(noOverlap, 800, 600);
    const e2 = calculateEnergy(withOverlap, 800, 600);

    expect(e2).toBeGreaterThan(e1);
  });
});

// ------------------------------------------------------------------
// optimizeLabelPositions
// ------------------------------------------------------------------

describe('optimizeLabelPositions', () => {
  it('should return empty array for 0 labels', () => {
    const result = optimizeLabelPositions([], 800, 600);
    expect(result).toEqual([]);
  });

  it('should return a copy of the single label for 1 label', () => {
    const labels = [makeLabelPlacement(1, 10, 10, 30, 20, 10, 10)];
    const result = optimizeLabelPositions(labels, 800, 600);

    expect(result).toHaveLength(1);
    expect(result[0].markId).toBe(1);
    // Should be a copy, not the same object reference
    expect(result[0]).not.toBe(labels[0]);
  });

  it('should not mutate the input array', () => {
    const labels = [
      makeLabelPlacement(1, 10, 10, 30, 20, 10, 10),
      makeLabelPlacement(2, 15, 10, 30, 20, 15, 10),
    ];
    const originalX1 = labels[0].x;
    const originalX2 = labels[1].x;

    optimizeLabelPositions(labels, 800, 600);

    // Input should not be mutated
    expect(labels[0].x).toBe(originalX1);
    expect(labels[1].x).toBe(originalX2);
  });

  it('should reduce energy for overlapping labels', () => {
    // Create labels that are heavily overlapping at the same position
    const labels = [
      makeLabelPlacement(1, 50, 50, 40, 20, 50, 50),
      makeLabelPlacement(2, 50, 50, 40, 20, 50, 50),
      makeLabelPlacement(3, 50, 50, 40, 20, 50, 50),
    ];

    const initialEnergy = calculateEnergy(labels, 800, 600);
    const optimized = optimizeLabelPositions(labels, 800, 600);
    const finalEnergy = calculateEnergy(optimized, 800, 600);

    // Energy should decrease (or at worst stay the same)
    expect(finalEnergy).toBeLessThanOrEqual(initialEnergy);
  });

  it('should preserve markId for all labels', () => {
    const labels = [
      makeLabelPlacement(1, 10, 10, 30, 20, 10, 10),
      makeLabelPlacement(2, 50, 50, 30, 20, 50, 50),
      makeLabelPlacement(3, 90, 90, 30, 20, 90, 90),
    ];

    const result = optimizeLabelPositions(labels, 800, 600);

    const markIds = result.map((l) => l.markId).sort();
    expect(markIds).toEqual([1, 2, 3]);
  });

  it('should return same number of labels as input', () => {
    const labels = [
      makeLabelPlacement(1, 0, 0, 30, 20, 0, 0),
      makeLabelPlacement(2, 0, 0, 30, 20, 0, 0),
      makeLabelPlacement(3, 0, 0, 30, 20, 0, 0),
      makeLabelPlacement(4, 0, 0, 30, 20, 0, 0),
    ];

    const result = optimizeLabelPositions(labels, 800, 600);
    expect(result).toHaveLength(4);
  });

  it('should handle labels at the same anchor position', () => {
    // Two labels anchored at the same spot and starting at the same position
    const labels = [
      makeLabelPlacement(1, 100, 100, 30, 20, 100, 100),
      makeLabelPlacement(2, 100, 100, 30, 20, 100, 100),
    ];

    const result = optimizeLabelPositions(labels, 800, 600);

    // After optimization, they should no longer be fully overlapping
    const overlapAfter = calculateOverlapArea(result[0], result[1]);
    const overlapBefore = calculateOverlapArea(labels[0], labels[1]);

    // The overlap should decrease (or at least not increase)
    expect(overlapAfter).toBeLessThanOrEqual(overlapBefore);
  });

  it('should keep labels near their anchors', () => {
    const labels = [
      makeLabelPlacement(1, 100, 100, 30, 20, 100, 100),
      makeLabelPlacement(2, 200, 200, 30, 20, 200, 200),
    ];

    const result = optimizeLabelPositions(labels, 800, 600);

    // Labels should remain reasonably close to their anchors
    for (const label of result) {
      const dx = Math.abs(label.x - label.anchorX);
      const dy = Math.abs(label.y - label.anchorY);
      // Should not drift too far from anchor (within a reasonable limit)
      expect(dx).toBeLessThan(200);
      expect(dy).toBeLessThan(200);
    }
  });
});
