import { Matrix4, type BufferAttribute, type InterleavedBufferAttribute, type Material, type Mesh, type Object3D } from 'three';
import type { TriangleSource } from './surfaceSampler';

type Attr = BufferAttribute | InterleavedBufferAttribute;
interface Entry {
  pos: Attr;
  col: Attr | null;
  index: Attr | null;
  m: Float32Array | number[];
  rgb: [number, number, number];
  start: number;
  triStart: number;
  triCount: number;
}

const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055);

/** Material colour in linear space. Textures are not sampled, so a textured white material gets a neutral tint instead. */
function materialRgb(mat: Material | undefined): [number, number, number] {
  const m = mat as (Material & { color?: { r: number; g: number; b: number }; map?: unknown }) | undefined;
  if (!m?.color) return [0.8, 0.85, 0.9];
  const { r, g, b } = m.color;
  if (m.map && r > 0.95 && g > 0.95 && b > 0.95) return [0.55, 0.62, 0.7];
  return [r, g, b];
}

/**
 * Exposes every mesh under `root` as one triangle list in `root`'s local space, using each mesh's current
 * transform (so an exploded or moved model is sampled as it looks right now). Skinning and morph targets are ignored.
 */
export function buildTriangleSource(root: Object3D): TriangleSource {
  root.updateMatrixWorld(true);
  const inv = new Matrix4().copy(root.matrixWorld).invert();
  const entries: Entry[] = [];
  let total = 0;

  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    const pos = g.getAttribute('position') as Attr | undefined;
    if (!pos) return;
    const index = g.getIndex() as Attr | null;
    const vertCount = index ? index.count : pos.count;
    const m = new Matrix4().multiplyMatrices(inv, mesh.matrixWorld).elements;
    const col = (g.getAttribute('color') as Attr | undefined) ?? null;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const groups = Array.isArray(mesh.material) && g.groups.length ? g.groups : [{ start: 0, count: vertCount, materialIndex: 0 }];
    for (const grp of groups) {
      const tris = Math.floor(Math.min(grp.count, vertCount - grp.start) / 3);
      if (tris <= 0) continue;
      entries.push({ pos, col, index, m, rgb: materialRgb(mats[grp.materialIndex ?? 0] ?? mats[0]), start: grp.start, triStart: total, triCount: tris });
      total += tris;
    }
  });

  let last = 0;
  const find = (i: number): Entry => {
    const e = entries[last];
    if (e && i >= e.triStart && i < e.triStart + e.triCount) return e;
    let lo = 0, hi = entries.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (entries[mid].triStart <= i) lo = mid; else hi = mid - 1; }
    last = lo;
    return entries[lo];
  };

  const vertex = (e: Entry, i: number, j: number, p: Float32Array, c: Float32Array | null) => {
    const raw = e.start + (i - e.triStart) * 3 + j;
    const v = e.index ? e.index.getX(raw) : raw;
    const x = e.pos.getX(v), y = e.pos.getY(v), z = e.pos.getZ(v);
    const m = e.m;
    p[j * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
    p[j * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    p[j * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    if (c) {
      const k = e.col;
      c[j * 3] = toSrgb(e.rgb[0] * (k ? k.getX(v) : 1));
      c[j * 3 + 1] = toSrgb(e.rgb[1] * (k ? k.getY(v) : 1));
      c[j * 3 + 2] = toSrgb(e.rgb[2] * (k ? k.getZ(v) : 1));
    }
  };

  const tmp = new Float32Array(9);
  return {
    triangleCount: total,
    area(i) {
      const e = find(i);
      for (let j = 0; j < 3; j++) vertex(e, i, j, tmp, null);
      const ux = tmp[3] - tmp[0], uy = tmp[4] - tmp[1], uz = tmp[5] - tmp[2];
      const vx = tmp[6] - tmp[0], vy = tmp[7] - tmp[1], vz = tmp[8] - tmp[2];
      return 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    },
    fetch(i, pos, col) {
      const e = find(i);
      for (let j = 0; j < 3; j++) vertex(e, i, j, pos, col);
    },
  };
}
