export interface Ndc { x: number; y: number }

export interface MappingConfig {
  /** Higher = less hand travel needed to cross the viewport. */
  gain: number;
  /** Fraction of the camera frame ignored at each edge, so the viewport edge is reachable. */
  margin: number;
  /** Mirror x so moving your hand right moves the cursor right. */
  mirrorX: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Maps a normalized camera-frame point (unmirrored, y down) to viewport NDC (x right, y up, -1..1). */
export function handToNdc(p: { x: number; y: number }, cfg: MappingConfig): Ndc {
  const half = Math.max(0.05, 0.5 - cfg.margin);
  const x = cfg.mirrorX ? 1 - p.x : p.x;
  return {
    x: clamp(((x - 0.5) / half) * cfg.gain, -1, 1),
    y: clamp(-((p.y - 0.5) / half) * cfg.gain, -1, 1),
  };
}

/** Exponential smoothing of cursor positions, per hand. */
export class CursorFilter {
  private prev = new Map<string, Ndc>();
  smooth(key: string, p: Ndc, smoothing: number): Ndc {
    const q = this.prev.get(key);
    const a = 1 - clamp(smoothing, 0, 0.95);
    const out = q ? { x: q.x + a * (p.x - q.x), y: q.y + a * (p.y - q.y) } : p;
    this.prev.set(key, out);
    return out;
  }
  reset(key?: string): void {
    if (key) this.prev.delete(key);
    else this.prev.clear();
  }
}
