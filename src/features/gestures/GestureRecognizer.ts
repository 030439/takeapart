import { clamp01 } from './geometry';
import type { GestureConfig, HandFeatures, RawGesture } from './types';

export function effectiveThresholds(cfg: GestureConfig) {
  const k = 0.75 + cfg.sensitivity * 0.5; // sensitivity 0.5 -> 1.0
  return {
    pinchEnter: cfg.pinchEnter * k,
    pinchExit: cfg.pinchExit * k,
    fist: Math.min(0.95, cfg.fistThreshold / k),
    open: Math.min(0.95, cfg.openPalmThreshold / k),
    point: Math.min(0.95, cfg.pointThreshold / k),
  };
}

const NONE: RawGesture = { gesture: 'NONE', confidence: 0 };

/** Classifies one frame of features. Keeps only per-hand pinch state for hysteresis. */
export class GestureRecognizer {
  private pinching = new Map<string, boolean>();

  recognize(handKey: string, f: HandFeatures, cfg: GestureConfig): RawGesture {
    const t = effectiveThresholds(cfg);

    const was = this.pinching.get(handKey) ?? false;
    const pinching = was ? f.pinchRatio < t.pinchExit : f.pinchRatio < t.pinchEnter;
    this.pinching.set(handKey, pinching);
    if (pinching) {
      return { gesture: 'PINCH', confidence: 0.6 + 0.4 * clamp01(1 - f.pinchRatio / t.pinchExit) };
    }

    const [index, middle, ring, pinky] = f.extension;
    const meanCurl = 1 - f.meanExtension;
    const othersCurl = 1 - (middle + ring + pinky) / 3;

    const candidates: RawGesture[] = [];
    // Fist needs every finger reasonably curled, so a pointing finger never reads as a fist.
    if (meanCurl >= t.fist && Math.max(index, middle, ring, pinky) <= 0.5) {
      candidates.push({ gesture: 'FIST', confidence: meanCurl });
    }
    if (f.meanExtension >= t.open && f.thumbOpen >= 0.3) {
      candidates.push({ gesture: 'OPEN_PALM', confidence: f.meanExtension * (0.7 + 0.3 * f.thumbOpen) });
    }
    if (index >= t.point && othersCurl >= t.fist * 0.9) {
      candidates.push({ gesture: 'POINT', confidence: Math.min(index, othersCurl) });
    }
    if (candidates.length === 0) return NONE;
    return candidates.reduce((a, b) => (b.confidence > a.confidence ? b : a));
  }

  reset(handKey?: string): void {
    if (handKey) this.pinching.delete(handKey);
    else this.pinching.clear();
  }
}
