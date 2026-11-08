import { describe, expect, it } from 'vitest';
import {
  boundsOf, hashString, mortonOrder, permute3, sampleSurface, type TriangleSource,
} from '../../src/features/particle-engine/surfaceSampler';
import {
  PARTICLE_COUNTS, buildTransition, clampCount, defaultPointSize, makeSeeds, makeVelocities, snapshotPositions,
} from '../../src/features/particle-engine/particlePresets';

/** Triangles given as [a, b, c] vertices plus optional per-vertex colours. */
function source(tris: number[][][], cols?: number[][][]): TriangleSource {
  const cross = (t: number[][]) => {
    const u = [0, 1, 2].map((k) => t[1][k] - t[0][k]), v = [0, 1, 2].map((k) => t[2][k] - t[0][k]);
    return 0.5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
  };
  return {
    triangleCount: tris.length,
    area: (i) => cross(tris[i]),
    fetch: (i, pos, col) => {
      tris[i].forEach((v, j) => v.forEach((x, k) => { pos[j * 3 + k] = x; }));
      (cols?.[i] ?? [[0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]]).forEach((v, j) => v.forEach((x, k) => { col[j * 3 + k] = x; }));
    },
  };
}

const quad = (a: number[], b: number[], c: number[], d: number[]) => [[a, b, c], [a, c, d]];
function cube() {
  const s = 1;
  const v = (x: number, y: number, z: number) => [x * s, y * s, z * s];
  return [
    ...quad(v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1)), ...quad(v(1, -1, -1), v(-1, -1, -1), v(-1, 1, -1), v(1, 1, -1)),
    ...quad(v(1, -1, 1), v(1, -1, -1), v(1, 1, -1), v(1, 1, 1)), ...quad(v(-1, -1, -1), v(-1, -1, 1), v(-1, 1, 1), v(-1, 1, -1)),
    ...quad(v(-1, 1, 1), v(1, 1, 1), v(1, 1, -1), v(-1, 1, -1)), ...quad(v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1), v(-1, -1, 1)),
  ];
}

describe('sampleSurface', () => {
  it('puts every sample on the surface and returns the requested count', () => {
    const s = sampleSurface(source(cube()), 5000, 1);
    expect(s.positions.length).toBe(15000);
    expect(s.totalArea).toBeCloseTo(24, 6);
    for (let i = 0; i < 5000; i++) {
      const m = Math.max(Math.abs(s.positions[i * 3]), Math.abs(s.positions[i * 3 + 1]), Math.abs(s.positions[i * 3 + 2]));
      expect(Math.abs(m - 1)).toBeLessThan(1e-5);
    }
  });
  it('is deterministic for a seed and differs between seeds', () => {
    const a = sampleSurface(source(cube()), 500, 7), b = sampleSurface(source(cube()), 500, 7), c = sampleSurface(source(cube()), 500, 8);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(Array.from(a.positions)).not.toEqual(Array.from(c.positions));
    expect(hashString('engine')).toBe(hashString('engine'));
    expect(hashString('engine')).not.toBe(hashString('gearbox'));
  });
  it('weights triangles by area and never picks zero-area triangles', () => {
    const tris = [
      [[0, 0, 0], [2, 0, 0], [0, 1, 0]],       // area 1, at x < 2
      [[10, 0, 0], [16, 0, 0], [10, 1, 0]],    // area 3, at x >= 10
      [[50, 0, 0], [60, 0, 0], [70, 0, 0]],    // degenerate, area 0
    ];
    const n = 20000;
    const s = sampleSurface(source(tris), n, 3);
    let big = 0;
    for (let i = 0; i < n; i++) {
      const x = s.positions[i * 3];
      expect(x).toBeLessThan(20);
      if (x >= 10) big++;
    }
    expect(Math.abs(big / n - 0.75)).toBeLessThan(0.02);
  });
  it('interpolates vertex colours and keeps a flat colour exact', () => {
    const tri = [[[0, 0, 0], [1, 0, 0], [0, 1, 0]]];
    const rgb = sampleSurface(source(tri, [[[1, 0, 0], [0, 1, 0], [0, 0, 1]]]), 200, 2);
    for (let i = 0; i < 200; i++) {
      const sum = rgb.colors[i * 3] + rgb.colors[i * 3 + 1] + rgb.colors[i * 3 + 2];
      expect(Math.abs(sum - 1)).toBeLessThan(1e-5);
    }
    const flat = sampleSurface(source(tri, [[[0.2, 0.4, 0.6], [0.2, 0.4, 0.6], [0.2, 0.4, 0.6]]]), 50, 2);
    expect(flat.colors[0]).toBeCloseTo(0.2, 6);
    expect(flat.colors[1]).toBeCloseTo(0.4, 6);
    expect(flat.colors[2]).toBeCloseTo(0.6, 6);
  });
  it('returns zeroed samples for an empty or zero-area source', () => {
    const e = sampleSurface(source([]), 10, 1);
    expect(e.totalArea).toBe(0);
    expect(Array.from(e.positions).every((v) => v === 0)).toBe(true);
    expect(sampleSurface(source([[[0, 0, 0], [1, 1, 1], [2, 2, 2]]]), 10, 1).totalArea).toBe(0);
  });
});

describe('mortonOrder', () => {
  it('is a permutation and groups spatial clusters together', () => {
    const pts: number[] = [];
    for (let i = 0; i < 100; i++) pts.push((i % 7) * 0.01, (i % 5) * 0.01, (i % 3) * 0.01);       // cluster near origin
    for (let i = 0; i < 100; i++) pts.push(10 + (i % 7) * 0.01, 10 + (i % 5) * 0.01, 10 + (i % 3) * 0.01); // cluster near (10,10,10)
    const order = mortonOrder(new Float32Array(pts));
    expect(Array.from(order).sort((a, b) => a - b)).toEqual(Array.from({ length: 200 }, (_, i) => i));
    const firstHalf = Array.from(order.slice(0, 100)).map((i) => i < 100);
    expect(firstHalf.every((v) => v === firstHalf[0])).toBe(true);
    expect(Array.from(mortonOrder(new Float32Array(pts)))).toEqual(Array.from(order));
  });
  it('permute3 reorders xyz triples', () => {
    expect(Array.from(permute3(new Float32Array([1, 2, 3, 4, 5, 6]), new Uint32Array([1, 0])))).toEqual([4, 5, 6, 1, 2, 3]);
  });
});

const N = 500;
const surface = sampleSurface(source(cube()), N, 11).positions;
const bounds = boundsOf(surface);
const vel = makeVelocities(surface, bounds, 5);
const ctx = { surface, rest: surface, vel, radius: bounds.radius };

describe('presets', () => {
  it('has bounded, finite, deterministic seeds and velocities', () => {
    const s = makeSeeds(N, 1);
    expect(s.length).toBe(N * 4);
    expect(Array.from(s).every((v) => v >= 0 && v < 1)).toBe(true);
    expect(Array.from(makeVelocities(surface, bounds, 5))).toEqual(Array.from(vel));
    for (let i = 0; i < N; i++) {
      const sp = Math.hypot(vel[i * 3], vel[i * 3 + 1], vel[i * 3 + 2]);
      expect(sp).toBeGreaterThan(0.59);
      expect(sp).toBeLessThan(1.41);
    }
  });
  it('reconstruct targets the exact surface samples and starts from the current positions', () => {
    const burst = buildTransition('burst', ctx);
    const t = buildTransition('reconstruct', { ...ctx, rest: burst.to });
    expect(t.to).toBe(surface);
    expect(t.from).toBe(burst.to);
    expect(t.from.length).toBe(N * 3);
  });
  it('dissolve starts and ends on the surface', () => {
    const t = buildTransition('dissolve', ctx);
    expect(t.from).toBe(surface);
    expect(t.to).toBe(surface);
    expect(t.params.arc).toBeGreaterThan(0);
  });
  it('burst sends particles outwards; disperse stays within its radius', () => {
    const dist = (a: Float32Array, i: number) => Math.hypot(a[i * 3] - bounds.center[0], a[i * 3 + 1] - bounds.center[1], a[i * 3 + 2] - bounds.center[2]);
    const burst = buildTransition('burst', ctx);
    let farther = 0;
    for (let i = 0; i < N; i++) if (dist(burst.to, i) > dist(surface, i)) farther++;
    expect(farther / N).toBeGreaterThan(0.95);
    const disp = buildTransition('disperse', ctx);
    for (let i = 0; i < N * 3; i++) {
      expect(Number.isFinite(disp.to[i])).toBe(true);
      expect(Math.abs(disp.to[i] - surface[i])).toBeLessThanOrEqual(1.4 * 0.7 * bounds.radius + 1e-6);
    }
  });
  it('transform ends exactly on the other model\'s samples', () => {
    const other = sampleSurface(source(cube().map((t) => t.map((v) => v.map((x) => x * 2)))), N, 99).positions;
    const t = buildTransition('transform', { ...ctx, target: other });
    expect(t.to).toBe(other);
    expect(t.to.length).toBe(surface.length);
  });
  it('limits and snaps particle counts', () => {
    expect(PARTICLE_COUNTS).toEqual([10000, 50000, 100000, 250000]);
    expect(clampCount(60000)).toBe(50000);
    expect(clampCount(250000, 100000)).toBe(100000);
    expect(clampCount(1)).toBe(10000);
    expect(defaultPointSize(250000, 1)).toBeLessThan(defaultPointSize(10000, 1));
  });
});

describe('snapshotPositions (mirrors the shader)', () => {
  const from = new Float32Array([0, 0, 0, 0, 0, 0]);
  const to = new Float32Array([2, 4, 6, 2, 4, 6]);
  it('is exactly `from` at progress 0 and exactly `to` at progress 1', () => {
    const out = new Float32Array(6);
    snapshotPositions(from, to, new Float32Array([0.9, 0, 0, 0, 0.1, 0, 0, 0]), 0, 0.5, out);
    expect(Array.from(out)).toEqual([0, 0, 0, 0, 0, 0]);
    snapshotPositions(from, to, new Float32Array([0.9, 0, 0, 0, 0.1, 0, 0, 0]), 1, 0.5, out);
    expect(Array.from(out)).toEqual([2, 4, 6, 2, 4, 6]);
  });
  it('delays particles by their seed and eases the rest', () => {
    const out = new Float32Array(6);
    snapshotPositions(from, to, new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]), 0.4, 0.5, out); // first has full delay
    expect(Array.from(out.slice(0, 3))).toEqual([0, 0, 0]);
    expect(out[3]).toBeGreaterThan(0);
    expect(out[3]).toBeLessThan(2);
  });
  it('a full burst -> reconstruct cycle lands exactly on the original surface', () => {
    const seeds = makeSeeds(N, 3);
    const burst = buildTransition('burst', ctx);
    const rest1 = new Float32Array(N * 3);
    snapshotPositions(burst.from, burst.to, seeds, 1, burst.params.stagger, rest1);
    const rec = buildTransition('reconstruct', { ...ctx, rest: rest1 });
    const end = new Float32Array(N * 3);
    snapshotPositions(rec.from, rec.to, seeds, 1, rec.params.stagger, end);
    expect(Array.from(end)).toEqual(Array.from(surface));
  });
});
