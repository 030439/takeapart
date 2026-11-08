import type { Landmark } from '../hand-tracking/types';
import type { Vec3 } from './types';

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Angle at vertex `b` between rays b->a and b->c, in degrees. Returns 0 for degenerate input. */
export function angleDeg(a: Vec3, b: Vec3, c: Vec3): number {
  const ux = a.x - b.x, uy = a.y - b.y, uz = a.z - b.z;
  const vx = c.x - b.x, vy = c.y - b.y, vz = c.z - b.z;
  const lu = Math.hypot(ux, uy, uz), lv = Math.hypot(vx, vy, vz);
  if (lu < 1e-9 || lv < 1e-9) return 0;
  const cos = Math.min(1, Math.max(-1, (ux * vx + uy * vy + uz * vz) / (lu * lv)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Landmarks are normalized per axis, so scale x and z by the frame aspect to get isotropic distances. */
export const toMetric = (lm: Landmark[], aspect: number): Vec3[] =>
  lm.map((p) => ({ x: p.x * aspect, y: p.y, z: p.z * aspect }));

export const isValidHand = (lm: Landmark[]): boolean =>
  lm.length === 21 && lm.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));

export const mid = (a: Vec3, b: Vec3): Vec3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
