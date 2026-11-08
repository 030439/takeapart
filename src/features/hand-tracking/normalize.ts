import { LANDMARK_COUNT, type Handedness, type TrackedHand } from './types';

/** Structural subset of MediaPipe's HandLandmarkerResult, so this stays testable without the library. */
export interface RawHandResult {
  landmarks: { x: number; y: number; z: number }[][];
  handedness: { categoryName: string; score: number }[][];
}

/**
 * MediaPipe assumes a mirrored (selfie) input image when labelling hands. We feed raw,
 * unmirrored frames, so labels must be swapped to match the user's real left/right hand.
 */
export function normalizeResult(raw: RawHandResult, timestamp: number, swapHandedness: boolean): TrackedHand[] {
  const out: TrackedHand[] = [];
  raw.landmarks.forEach((lm, i) => {
    const cat = raw.handedness[i]?.[0];
    if (!cat || lm.length !== LANDMARK_COUNT) return;
    let hand: Handedness = cat.categoryName === 'Left' ? 'Left' : 'Right';
    if (swapHandedness) hand = hand === 'Left' ? 'Right' : 'Left';
    out.push({
      handedness: hand,
      score: cat.score,
      landmarks: lm.map((p) => ({ x: p.x, y: p.y, z: p.z })),
      timestamp,
    });
  });
  return out;
}
