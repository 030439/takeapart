import type { V3 } from './explosionVectors';

interface Part { base: V3; vec: V3; manual: V3; scale: number }

export const MIN_SCALE = 0.3;
export const MAX_SCALE = 3;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const isZero = (v: V3) => v[0] === 0 && v[1] === 0 && v[2] === 0;

/**
 * Pure animation state for part positions and scales:
 *   position = base + explosionVector * explodeAmount + manualOffset
 * Base transforms are never modified, so any number of explode/assemble cycles returns exactly to the start.
 */
export class PoseSimulation {
  explodeTarget = 0;
  explodeCurrent = 0;
  assembling = false;
  private parts = new Map<string, Part>();
  private dirty = false;

  setParts(list: { id: string; base: V3; vec: V3 }[]): void {
    this.parts.clear();
    for (const p of list) this.parts.set(p.id, { base: [...p.base], vec: [...p.vec], manual: [0, 0, 0], scale: 1 });
    this.dirty = true;
  }

  ids(): string[] { return [...this.parts.keys()]; }

  setExplodeTarget(v: number): void { this.explodeTarget = clamp01(v); }

  /** Animate everything back to the original pose: explosion, manual moves, scales. */
  assemble(): void { this.explodeTarget = 0; this.assembling = true; }

  /** Jump straight to the assembled pose with no animation (used just before particles reconstruct the model). */
  snapAssembled(): void {
    this.explodeTarget = 0;
    this.explodeCurrent = 0;
    this.assembling = false;
    for (const p of this.parts.values()) { p.manual = [0, 0, 0]; p.scale = 1; }
    this.dirty = true;
  }

  /** Any direct manipulation stops an assemble animation in progress. */
  cancelAssemble(): void { this.assembling = false; }

  /** Place a part at `local` (in its parent's space) by adjusting its manual offset. */
  setLocalPosition(id: string, local: V3): void {
    const p = this.parts.get(id);
    if (!p) return;
    const e = this.explodeCurrent;
    p.manual = [local[0] - p.base[0] - p.vec[0] * e, local[1] - p.base[1] - p.vec[1] * e, local[2] - p.base[2] - p.vec[2] * e];
    this.assembling = false;
    this.dirty = true;
  }

  scalePart(id: string, factor: number): void {
    const p = this.parts.get(id);
    if (!p) return;
    p.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, p.scale * factor));
    this.assembling = false;
    this.dirty = true;
  }

  position(id: string): V3 {
    const p = this.parts.get(id);
    if (!p) return [0, 0, 0];
    const e = this.explodeCurrent;
    return [p.base[0] + p.vec[0] * e + p.manual[0], p.base[1] + p.vec[1] * e + p.manual[1], p.base[2] + p.vec[2] * e + p.manual[2]];
  }

  scaleOf(id: string): number { return this.parts.get(id)?.scale ?? 1; }

  /**
   * Advance by `dt` seconds. `rotationSettled` says whether the model's rotation is already back at identity,
   * so an assemble animation only finishes once everything has settled. `k` is the easing factor for the
   * caller to apply to rotation while `assembling`.
   */
  step(dt: number, rotationSettled = true): { changed: boolean; k: number } {
    const prev = this.explodeCurrent;
    let cur = prev + (this.explodeTarget - prev) * (1 - Math.exp(-7 * dt));
    if (Math.abs(this.explodeTarget - cur) < 5e-4) cur = this.explodeTarget;
    this.explodeCurrent = cur;
    let changed = cur !== prev || this.dirty;
    this.dirty = false;

    let k = 0;
    if (this.assembling) {
      k = 1 - Math.exp(-8 * dt);
      let settled = true;
      for (const p of this.parts.values()) {
        if (!isZero(p.manual)) {
          p.manual = p.manual.map((v) => { const n = v * (1 - k); return Math.abs(n) < 1e-5 ? 0 : n; }) as V3;
          changed = true;
          if (!isZero(p.manual)) settled = false;
        }
        if (p.scale !== 1) {
          let s = p.scale + (1 - p.scale) * k;
          if (Math.abs(1 - s) < 1e-4) s = 1;
          p.scale = s;
          changed = true;
          if (s !== 1) settled = false;
        }
      }
      if (settled && rotationSettled && this.explodeCurrent === this.explodeTarget) this.assembling = false;
    }
    return { changed, k };
  }
}
