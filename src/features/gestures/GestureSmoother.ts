import type { RawGesture, Vec3 } from './types';

/** Exponential moving average per landmark. */
export class LandmarkSmoother {
  private prev = new Map<string, Vec3[]>();

  smooth(key: string, pts: Vec3[], smoothing: number): Vec3[] {
    const p = this.prev.get(key);
    if (smoothing <= 0 || !p || p.length !== pts.length) {
      this.prev.set(key, pts);
      return pts;
    }
    const a = 1 - Math.min(0.95, smoothing);
    const out = pts.map((q, i) => ({
      x: p[i].x + a * (q.x - p[i].x),
      y: p[i].y + a * (q.y - p[i].y),
      z: p[i].z + a * (q.z - p[i].z),
    }));
    this.prev.set(key, out);
    return out;
  }

  reset(key?: string): void {
    if (key) this.prev.delete(key);
    else this.prev.clear();
  }
}

/** Majority vote over the last N frames, so a single misclassified frame cannot change the label. */
export class GestureSmoother {
  private hist = new Map<string, RawGesture[]>();

  push(key: string, raw: RawGesture, frames: number): RawGesture {
    const h = this.hist.get(key) ?? [];
    h.push(raw);
    while (h.length > Math.max(1, frames)) h.shift();
    this.hist.set(key, h);

    const counts = new Map<string, number>();
    h.forEach((r) => counts.set(r.gesture, (counts.get(r.gesture) ?? 0) + 1));
    let best = h[h.length - 1].gesture;
    let bestCount = counts.get(best) ?? 0;
    for (const [g, c] of counts) if (c > bestCount) { best = g as RawGesture['gesture']; bestCount = c; }

    const mine = h.filter((r) => r.gesture === best);
    const confidence = mine.reduce((s, r) => s + r.confidence, 0) / mine.length;
    return { gesture: best, confidence };
  }

  reset(key?: string): void {
    if (key) this.hist.delete(key);
    else this.hist.clear();
  }
}
