export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Triangles of a model, in whatever frame the caller wants the samples in. */
export interface TriangleSource {
  triangleCount: number;
  area(i: number): number;
  /** Fills `pos` (9 floats: three xyz vertices) and `col` (9 floats: three rgb vertex colours, display-ready). */
  fetch(i: number, pos: Float32Array, col: Float32Array): void;
}

export interface SurfaceSamples { positions: Float32Array; colors: Float32Array; totalArea: number }

/**
 * Area-weighted uniform sampling of a triangle surface. Deterministic for a given seed.
 * A source with no area yields zeroed positions and totalArea 0.
 */
export function sampleSurface(src: TriangleSource, count: number, seed: number): SurfaceSamples {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const T = src.triangleCount;
  const cdf = new Float64Array(T);
  let total = 0;
  for (let i = 0; i < T; i++) {
    const a = src.area(i);
    if (a > 0 && Number.isFinite(a)) total += a;
    cdf[i] = total;
  }
  if (total <= 0) { colors.fill(0.8); return { positions, colors, totalArea: 0 }; }

  const rnd = mulberry32(seed);
  const p = new Float32Array(9), c = new Float32Array(9);
  for (let n = 0; n < count; n++) {
    const r = rnd() * total;
    let lo = 0, hi = T - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] > r) hi = mid; else lo = mid + 1; }
    src.fetch(lo, p, c);
    const u = Math.sqrt(rnd()), r2 = rnd();
    const wa = 1 - u, wb = u * (1 - r2), wc = u * r2;
    for (let k = 0; k < 3; k++) {
      positions[n * 3 + k] = wa * p[k] + wb * p[3 + k] + wc * p[6 + k];
      colors[n * 3 + k] = wa * c[k] + wb * c[3 + k] + wc * c[6 + k];
    }
  }
  return { positions, colors, totalArea: total };
}

export interface Bounds { min: [number, number, number]; max: [number, number, number]; center: [number, number, number]; radius: number }

export function boundsOf(positions: Float32Array): Bounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], positions[i + k]);
    max[k] = Math.max(max[k], positions[i + k]);
  }
  if (positions.length === 0) return { min: [0, 0, 0], max: [0, 0, 0], center: [0, 0, 0], radius: 1 };
  const center: [number, number, number] = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
  return { min, max, center, radius: Math.max(radius, 1e-3) };
}

const part1by2 = (v: number) => {
  let x = v & 0x3ff;
  x = (x | (x << 16)) & 0x030000ff;
  x = (x | (x << 8)) & 0x0300f00f;
  x = (x | (x << 4)) & 0x030c30c3;
  x = (x | (x << 2)) & 0x09249249;
  return x;
};

/** Indices that order points along a Morton (Z-order) curve, so neighbours in the list are neighbours in space. */
export function mortonOrder(positions: Float32Array): Uint32Array {
  const n = positions.length / 3;
  const b = boundsOf(positions);
  const ext = [0, 1, 2].map((k) => Math.max(b.max[k] - b.min[k], 1e-9));
  let keys = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const q = [0, 1, 2].map((k) => Math.min(1023, Math.max(0, Math.floor(((positions[i * 3 + k] - b.min[k]) / ext[k]) * 1023))));
    keys[i] = (part1by2(q[0]) | (part1by2(q[1]) << 1) | (part1by2(q[2]) << 2)) >>> 0;
  }
  // LSD radix sort on the 30-bit keys: stable and O(n).
  let idx = new Uint32Array(n).map((_, i) => i);
  let tmp = new Uint32Array(n);
  for (let pass = 0; pass < 4; pass++) {
    const shift = pass * 8;
    const counts = new Uint32Array(257);
    for (let i = 0; i < n; i++) counts[((keys[idx[i]] >>> shift) & 255) + 1]++;
    for (let i = 0; i < 256; i++) counts[i + 1] += counts[i];
    for (let i = 0; i < n; i++) tmp[counts[(keys[idx[i]] >>> shift) & 255]++] = idx[i];
    [idx, tmp] = [tmp, idx];
  }
  keys = new Uint32Array(0);
  return idx;
}

export function permute3(arr: Float32Array, order: Uint32Array): Float32Array {
  const out = new Float32Array(arr.length);
  for (let i = 0; i < order.length; i++) {
    out[i * 3] = arr[order[i] * 3];
    out[i * 3 + 1] = arr[order[i] * 3 + 1];
    out[i * 3 + 2] = arr[order[i] * 3 + 2];
  }
  return out;
}
