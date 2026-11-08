import type { Color, Material, Mesh, Object3D, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ComponentInfo, GlbModelMeta, ModelStats, StructureValidation } from '@/types/model';
import { modelUrl } from './manifest';
import { extractComponents, resolveNode, validateStructure } from './modelStructure';
import { centerAndScale, countTriangles, disposeObject } from './modelUtils';

export type LoadErrorCode = 'not-found' | 'network' | 'invalid' | 'empty';

export class ModelLoadError extends Error {
  constructor(public readonly code: LoadErrorCode, message: string) {
    super(message);
    this.name = 'ModelLoadError';
  }
}

export interface LoadedModel {
  id: string;
  root: Object3D;
  components: ComponentInfo[];
  /** Component id -> mesh. */
  meshes: Map<string, Mesh>;
  validation: StructureValidation;
  stats: ModelStats;
  /** Pose after centring and scaling, used to undo manipulation. */
  baseline: Map<string, { position: Vector3; scale: Vector3 }>;
}

const TARGET_SIZE = 2.4;
type Emissive = Material & { emissive?: Color; emissiveIntensity?: number };

/** Loads, validates, normalises and caches GLB/GLTF models, and owns their disposal. */
export class ModelLoader {
  private gltf = new GLTFLoader();
  private cache = new Map<string, LoadedModel>();
  private inflight = new Map<string, { promise: Promise<LoadedModel>; listeners: Set<(p: number | null) => void> }>();
  private holds = new Map<string, number>();
  private order: string[] = [];

  /** `capacity` = how many unused parsed models to keep in memory. */
  constructor(private readonly capacity = 3) {}

  load(meta: GlbModelMeta, onProgress?: (p: number | null) => void): Promise<LoadedModel> {
    const hit = this.cache.get(meta.id);
    if (hit) {
      this.touch(meta.id);
      onProgress?.(1);
      return Promise.resolve(hit);
    }
    let f = this.inflight.get(meta.id);
    if (!f) {
      const listeners = new Set<(p: number | null) => void>();
      const promise = this.fetchAndPrepare(meta, (p) => listeners.forEach((l) => l(p)))
        .then((m) => { this.cache.set(meta.id, m); this.touch(meta.id); this.trim(); return m; })
        .finally(() => this.inflight.delete(meta.id));
      f = { promise, listeners };
      this.inflight.set(meta.id, f);
    }
    if (onProgress) f.listeners.add(onProgress);
    return f.promise;
  }

  /** Marks a model as in use so it cannot be evicted. Pair with `release`. */
  retain(id: string): void { this.holds.set(id, (this.holds.get(id) ?? 0) + 1); }

  release(id: string): void {
    const n = (this.holds.get(id) ?? 1) - 1;
    if (n <= 0) this.holds.delete(id);
    else this.holds.set(id, n);
    this.trim();
  }

  /** Restores part transforms on a cached model that was manipulated in an earlier session. */
  resetTransforms(m: LoadedModel): void {
    for (const [id, mesh] of m.meshes) {
      const b = m.baseline.get(id);
      if (b) { mesh.position.copy(b.position); mesh.scale.copy(b.scale); }
    }
  }

  disposeAll(): void {
    [...this.cache.keys()].forEach((id) => this.evict(id));
    this.holds.clear();
  }

  private touch(id: string): void { this.order = this.order.filter((x) => x !== id); this.order.push(id); }

  private trim(): void {
    while (this.cache.size > this.capacity) {
      const victim = this.order.find((id) => !this.holds.has(id) && this.cache.has(id));
      if (!victim) break;
      this.evict(victim);
    }
  }

  private evict(id: string): void {
    const m = this.cache.get(id);
    if (!m) return;
    disposeObject(m.root);
    this.cache.delete(id);
    this.order = this.order.filter((x) => x !== id);
  }

  /** Vite serves index.html for missing public files, so a 200 with HTML still means "not found". */
  private async assertReachable(url: string): Promise<void> {
    let res: Response;
    try {
      res = await fetch(url, { method: 'HEAD' });
    } catch {
      throw new ModelLoadError('network', 'The model file could not be reached. Check your connection and try again.');
    }
    if (res.status === 404 || (res.headers.get('content-type') ?? '').includes('text/html')) {
      throw new ModelLoadError('not-found', `Model file not found: ${url}`);
    }
    if (!res.ok && res.status !== 405) throw new ModelLoadError('network', `The model file could not be loaded (HTTP ${res.status}).`);
  }

  private async fetchAndPrepare(meta: GlbModelMeta, emit: (p: number | null) => void): Promise<LoadedModel> {
    const t0 = performance.now();
    const url = modelUrl(meta.filePath);
    await this.assertReachable(url);
    emit(null);

    let root: Object3D;
    try {
      const gltf = await this.gltf.loadAsync(url, (e) => emit(e.total > 0 ? e.loaded / e.total : null));
      root = gltf.scene;
    } catch {
      throw new ModelLoadError('invalid', 'The file could not be read as a valid GLB or GLTF model.');
    }

    // Give every mesh its own materials so highlighting one part never lights up the others.
    root.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      const own = (mat: Material) => {
        const c = mat.clone() as Emissive;
        if (c.emissive) { c.userData.baseEmissive = c.emissive.clone(); c.userData.baseIntensity = c.emissiveIntensity ?? 1; }
        return c;
      };
      m.material = Array.isArray(m.material) ? m.material.map(own) : own(m.material);
    });

    const extracted = extractComponents(root, meta.curated);
    const validation = validateStructure(extracted);
    if (validation.kind === 'empty') {
      disposeObject(root);
      throw new ModelLoadError('empty', 'The file loaded but contains no meshes to display.');
    }
    if (!centerAndScale(root, TARGET_SIZE)) {
      disposeObject(root);
      throw new ModelLoadError('empty', 'The model has no measurable geometry.');
    }

    const meshes = new Map<string, Mesh>();
    const baseline: LoadedModel['baseline'] = new Map();
    const components: ComponentInfo[] = [];
    for (const { path, ...info } of extracted) {
      components.push(info);
      if (info.kind !== 'part') continue;
      const mesh = resolveNode(root, path) as Mesh | null;
      if (!mesh) continue;
      mesh.userData.partId = info.id;
      meshes.set(info.id, mesh);
      baseline.set(info.id, { position: mesh.position.clone(), scale: mesh.scale.clone() });
    }

    return {
      id: meta.id, root, components, meshes, validation, baseline,
      stats: { meshes: validation.meshCount, triangles: countTriangles(root), loadMs: Math.round(performance.now() - t0) },
    };
  }
}

export const modelLoader = new ModelLoader();
