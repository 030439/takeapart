import { mulberry32, type Bounds } from './surfaceSampler';

export const PARTICLE_COUNTS = [10_000, 50_000, 100_000, 250_000] as const;
export const DEFAULT_PARTICLE_COUNT = 50_000;

/** Snaps to the nearest allowed density that does not exceed `max`. */
export function clampCount(n: number, max: number = PARTICLE_COUNTS[PARTICLE_COUNTS.length - 1]): number {
  const allowed = PARTICLE_COUNTS.filter((c) => c <= max);
  if (allowed.length === 0) return PARTICLE_COUNTS[0];
  return allowed.reduce((best, c) => (Math.abs(c - n) < Math.abs(best - n) ? c : best));
}

/** World-space point size that keeps the surface looking filled as the count changes. */
export const defaultPointSize = (count: number, radius: number): number => radius * 0.018 * Math.sqrt(50_000 / count);

export const smooth = (p: number): number => p * p * (3 - 2 * p);

/** Per-particle random seeds: x start delay, y speed/attraction weight, z phase, w size jitter. */
export function makeSeeds(count: number, seed: number): Float32Array {
  const rnd = mulberry32(seed ^ 0x9e3779b9);
  const s = new Float32Array(count * 4);
  for (let i = 0; i < s.length; i++) s[i] = rnd();
  return s;
}

/** Outward directions with random spread and speed (0.6 to 1.4). Deterministic. */
export function makeVelocities(surface: Float32Array, b: Bounds, seed: number): Float32Array {
  const rnd = mulberry32(seed ^ 0x85ebca6b);
  const n = surface.length / 3;
  const v = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let dx = surface[i * 3] - b.center[0], dy = surface[i * 3 + 1] - b.center[1], dz = surface[i * 3 + 2] - b.center[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    // random unit vector (Marsaglia would be exact; this is uniform enough for visual spread)
    const z = rnd() * 2 - 1, t = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    dx += 0.35 * r * Math.cos(t); dy += 0.35 * z; dz += 0.35 * r * Math.sin(t);
    const m = Math.hypot(dx, dy, dz) || 1;
    const speed = 0.6 + 0.8 * rnd();
    v[i * 3] = (dx / m) * speed; v[i * 3 + 1] = (dy / m) * speed; v[i * 3 + 2] = (dz / m) * speed;
  }
  return v;
}

export type TransitionKind = 'dissolve' | 'gather' | 'reconstruct' | 'burst' | 'disperse' | 'transform';

export interface TransitionParams { duration: number; stagger: number; arc: number; jitter: number }
export interface TransitionContext { surface: Float32Array; rest: Float32Array; vel: Float32Array; radius: number; target?: Float32Array }
/** Returned arrays may alias the inputs and must not be mutated. */
export interface Transition { from: Float32Array; to: Float32Array; params: TransitionParams }

/**
 * Start and end positions for each effect. The GPU does the in-between motion:
 *   dissolve    surface -> surface, lifting off and settling (model breaks into particles)
 *   gather      current -> surface, staying particles
 *   reconstruct current -> surface, then the solid model replaces the particles
 *   burst       current -> flung outwards
 *   disperse    current -> slow drift
 *   transform   current -> another model's surface
 */
export function buildTransition(kind: TransitionKind, c: TransitionContext): Transition {
  const r = c.radius;
  const offset = (scale: number) => {
    const out = new Float32Array(c.rest.length);
    for (let i = 0; i < out.length; i++) out[i] = c.rest[i] + c.vel[i] * r * scale;
    return out;
  };
  switch (kind) {
    case 'dissolve':
      return { from: c.surface, to: c.surface, params: { duration: 1.6, stagger: 0.6, arc: r * 0.35, jitter: r * 0.05 } };
    case 'gather':
      return { from: c.rest, to: c.surface, params: { duration: 1.6, stagger: 0.5, arc: r * 0.15, jitter: r * 0.04 } };
    case 'reconstruct':
      return { from: c.rest, to: c.surface, params: { duration: 1.8, stagger: 0.5, arc: r * 0.15, jitter: r * 0.04 } };
    case 'burst':
      return { from: c.rest, to: offset(2.2), params: { duration: 1.4, stagger: 0.25, arc: r * 0.3, jitter: r * 0.03 } };
    case 'disperse':
      return { from: c.rest, to: offset(0.7), params: { duration: 3, stagger: 0.8, arc: 0, jitter: r * 0.1 } };
    case 'transform':
      return { from: c.rest, to: c.target ?? c.surface, params: { duration: 2.2, stagger: 0.6, arc: r * 0.5, jitter: r * 0.05 } };
  }
}

/** CPU mirror of the shader's interpolation (without arc/jitter), used to resume from an interrupted transition. */
export function snapshotPositions(from: Float32Array, to: Float32Array, seeds: Float32Array, progress: number, stagger: number, out: Float32Array): void {
  const n = from.length / 3;
  for (let i = 0; i < n; i++) {
    const p = Math.min(1, Math.max(0, (progress - seeds[i * 4] * stagger) / Math.max(1 - stagger, 1e-4)));
    const e = smooth(p);
    for (let k = 0; k < 3; k++) out[i * 3 + k] = from[i * 3 + k] * (1 - e) + to[i * 3 + k] * e;
  }
}
