export type V3 = [number, number, number];
export type ExplodeAxis = 'radial' | 'x' | 'y' | 'z';
export interface ExplodeOptions { distance: number; axis: ExplodeAxis }

export const DEFAULT_EXPLODE: ExplodeOptions = { distance: 1.4, axis: 'radial' };
export const EXPLODE_LEVELS = [0, 0.25, 0.5, 0.75, 1] as const;

const len = (v: V3) => Math.hypot(v[0], v[1], v[2]);

/** Deterministic, evenly spread direction for parts that sit exactly at the model centre. */
function fallbackDir(i: number, n: number): V3 {
  const y = 1 - 2 * ((i + 0.5) / n);
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = Math.PI * (3 - Math.sqrt(5)) * i;
  return [Math.cos(theta) * r, y, Math.sin(theta) * r];
}

/**
 * Full-explosion offset for every part, in the model's frame. Directions point away from the centre of the
 * parts' bounding box; farther parts travel further (40% to 100% of `distance`). Same input, same output.
 */
export function computeExplosionVectors(parts: { id: string; center: V3 }[], o: ExplodeOptions): Map<string, V3> {
  const out = new Map<string, V3>();
  if (parts.length < 2) { parts.forEach((p) => out.set(p.id, [0, 0, 0])); return out; }

  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], p.center[a]); max[a] = Math.max(max[a], p.center[a]); }
  const c: V3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const rel = parts.map((p) => [p.center[0] - c[0], p.center[1] - c[1], p.center[2] - c[2]] as V3);
  const EPS = 1e-9;

  if (o.axis === 'radial') {
    const lens = rel.map(len);
    const maxLen = Math.max(...lens);
    parts.forEach((p, i) => {
      const degenerate = maxLen < EPS || lens[i] < maxLen * 1e-6;
      const dir: V3 = degenerate ? fallbackDir(i, parts.length) : [rel[i][0] / lens[i], rel[i][1] / lens[i], rel[i][2] / lens[i]];
      const t = maxLen < EPS ? 0 : lens[i] / maxLen;
      const mag = o.distance * (0.4 + 0.6 * t);
      out.set(p.id, [dir[0] * mag, dir[1] * mag, dir[2] * mag]);
    });
  } else {
    const a = { x: 0, y: 1, z: 2 }[o.axis];
    const maxAbs = Math.max(...rel.map((r) => Math.abs(r[a])));
    parts.forEach((p, i) => {
      const d = rel[i][a];
      const sign = Math.abs(d) < EPS ? (i % 2 === 0 ? 1 : -1) : Math.sign(d);
      const t = maxAbs < EPS ? 0 : Math.abs(d) / maxAbs;
      const v: V3 = [0, 0, 0];
      v[a] = sign * o.distance * (0.4 + 0.6 * t);
      out.set(p.id, v);
    });
  }
  return out;
}

/** Next preset level above (dir = 1) or below (dir = -1) `current`. */
export function nextLevel(current: number, dir: 1 | -1): number {
  const eps = 1e-6;
  if (dir === 1) return EXPLODE_LEVELS.find((l) => l > current + eps) ?? 1;
  return [...EXPLODE_LEVELS].reverse().find((l) => l < current - eps) ?? 0;
}
