import { angleDeg, clamp01, dist, isValidHand } from './geometry';
import type { HandFeatures, Vec3 } from './types';

/** [MCP, PIP, TIP] landmark indices for index, middle, ring, pinky. */
const FINGERS = [[5, 6, 8], [9, 10, 12], [13, 14, 16], [17, 18, 20]] as const;
const STRAIGHT_DEG = 165;
const CURLED_DEG = 90;

/**
 * Turns metric-space landmarks into scale-invariant measurements. Returns null when the
 * landmarks are missing, non-finite, or the hand is degenerate.
 */
export function computeFeatures(p: Vec3[]): HandFeatures | null {
  if (!isValidHand(p)) return null;
  const handSize = dist(p[0], p[9]);
  if (handSize < 1e-4) return null;

  const ext = FINGERS.map(([mcp, pip, tip]) =>
    clamp01((angleDeg(p[mcp], p[pip], p[tip]) - CURLED_DEG) / (STRAIGHT_DEG - CURLED_DEG)),
  ) as [number, number, number, number];

  return {
    handSize,
    pinchRatio: dist(p[4], p[8]) / handSize,
    extension: ext,
    thumbOpen: clamp01((dist(p[4], p[5]) / handSize - 0.5) / 0.5),
    meanExtension: (ext[0] + ext[1] + ext[2] + ext[3]) / 4,
  };
}
