import { Plane, Raycaster, Vector2, Vector3, type Camera, type Mesh, type Object3D } from 'three';
import { useParticleStore, type BenchmarkResult, type ParticleCommandType } from '@/stores/particleStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { ModelHandle } from '../three-engine/ModelHandle';
import { buildTriangleSource } from './meshSource';
import { PARTICLE_COUNTS, clampCount, type TransitionKind } from './particlePresets';
import { ParticleSystem, type SurfaceData } from './ParticleSystem';
import { boundsOf, hashString, mortonOrder, permute3, sampleSurface } from './surfaceSampler';

const store = () => useParticleStore.getState();

export interface DirectorFrame {
  dt: number;
  time: number;
  camera: Camera;
  pixelsPerUnit: number;
  /** NDC of the hand's pointing cursor if present, otherwise the mouse. */
  pointer: { x: number; y: number };
  paused: boolean;
}

interface Bench {
  counts: number[];
  i: number;
  sys: ParticleSystem | null;
  elapsed: number;
  frames: number;
  time: number;
  sampleMs: number;
  results: BenchmarkResult[];
}

/**
 * Orchestrates the particle effects on the current model: sampling, state, transitions, attraction and the
 * benchmark. It owns no React state; the UI talks to it through useParticleStore.
 */
export class ParticleDirector {
  private handle: ModelHandle | null = null;
  private system: ParticleSystem | null = null;
  private modelKey: string | null = null;
  private goingSolid = false;
  private pendingTransform = false;
  private attractStrength = 0;
  private bench: Bench | null = null;
  private ray = new Raycaster();
  private plane = new Plane();
  private fwd = new Vector3();
  private tmp = new Vector3();
  private lastActive = -1;

  setHandle(h: ModelHandle): void { this.handle = h; }

  /** Key of the model that is fully present in the scene, or null while it loads. */
  setModelKey(key: string | null): void {
    if (key === this.modelKey) return;
    this.modelKey = key;
    if (store().state === 'particles' && key) this.pendingTransform = true;
  }

  command(type: ParticleCommandType): void {
    const s = store();
    switch (type) {
      case 'toggle': if (s.state === 'solid' || this.goingSolid) this.dissolve(); else this.reconstruct(); break;
      case 'dissolve': this.dissolve(); break;
      case 'reconstruct': this.reconstruct(); break;
      case 'burst': this.run('burst'); break;
      case 'disperse': this.run('disperse'); break;
      case 'benchmark': this.startBenchmark(); break;
    }
  }

  setCount(n: number): void {
    if (this.system && this.system.count === n) return;
    this.system?.dispose();
    this.system = null;
    if (store().state === 'particles') {
      if (this.ensure()) {
        this.system!.start('dissolve');
        store().patch({ busy: true });
      }
    }
  }

  dispose(): void {
    this.system?.dispose();
    this.system = null;
    this.bench?.sys?.dispose();
    this.bench = null;
    this.pendingTransform = false;
    this.goingSolid = false;
    this.lastActive = -1;
    if (this.handle?.group) this.setMeshesVisible(this.handle.group, true);
    store().patch({ state: 'solid', busy: false, activeCount: 0 });
  }

  update(f: DirectorFrame): void {
    const g = this.handle?.group ?? null;
    const sys = this.system;
    if (sys && g && sys.points.parent !== g) g.add(sys.points);

    if (this.pendingTransform && sys && g) this.tryTransform(sys, g);

    const dt = f.paused ? 0 : f.dt;
    if (sys) {
      sys.setPixelsPerUnit(f.pixelsPerUnit);
      sys.update(dt, f.time);
      const particles = store().state === 'particles';
      sys.points.visible = !this.bench && (particles || sys.playing);
      sys.setShimmer(particles && !sys.playing ? sys.radius * 0.006 : 0);
      this.updateAttraction(sys, g, f, particles);
    }
    if (this.bench) this.tickBenchmark(f.dt, f.time);

    const active = sys && sys.points.visible ? sys.count : 0;
    if (active !== this.lastActive) { this.lastActive = active; store().patch({ activeCount: active }); }
  }

  // ---- sampling ----

  private sample(count: number, key: string): SurfaceData | null {
    const g = this.handle?.group;
    if (!g) return null;
    let hasMesh = false;
    g.traverse((o) => { if ((o as Mesh).isMesh) hasMesh = true; });
    if (!hasMesh) return null;
    const raw = sampleSurface(buildTriangleSource(g), count, hashString(key));
    if (raw.totalArea <= 0) return null;
    const order = mortonOrder(raw.positions); // spatially coherent order makes model-to-model morphs look like morphs
    const positions = permute3(raw.positions, order);
    return { positions, colors: permute3(raw.colors, order), bounds: boundsOf(positions) };
  }

  /** Makes sure a system of the right size exists and is loaded with the model as it looks right now. */
  private ensure(): boolean {
    const s = store();
    const count = clampCount(s.count);
    const data = this.sample(count, this.modelKey ?? 'model');
    if (!data) return false;
    if (!this.system || this.system.count !== count) {
      this.system?.dispose();
      this.system = new ParticleSystem(count, hashString(this.modelKey ?? 'model'));
      this.system.onComplete = (k) => this.onDone(k);
      this.handle?.group?.add(this.system.points);
    }
    this.system.load(data);
    return true;
  }

  // ---- effects ----

  private dissolve(): void {
    const s = store();
    if (s.state === 'solid') {
      if (!this.ensure()) return;
      if (this.handle?.group) this.setMeshesVisible(this.handle.group, false);
      this.goingSolid = false;
      this.system!.start('dissolve');
      s.patch({ state: 'particles', busy: true });
    } else if (this.system) {
      this.goingSolid = false;
      this.system.start('gather'); // cancels a reconstruction in progress
      s.patch({ busy: true });
    }
  }

  private reconstruct(): void {
    const s = store();
    if (s.state === 'solid' || !this.system) return;
    // Rebuild from the assembled pose, so particles gather into the complete model.
    this.handle?.snapAssembled?.();
    useWorkspaceStore.getState().resetExplode();
    const data = this.sample(this.system.count, this.modelKey ?? 'model');
    if (data) this.system.retarget(data);
    this.goingSolid = true;
    this.system.start('reconstruct');
    s.patch({ busy: true });
  }

  private run(kind: 'burst' | 'disperse'): void {
    if (store().state !== 'particles' || !this.system) return;
    this.goingSolid = false;
    this.system.start(kind);
    store().patch({ busy: true });
  }

  private tryTransform(sys: ParticleSystem, g: Object3D): void {
    let hasMesh = false;
    g.traverse((o) => { if ((o as Mesh).isMesh) hasMesh = true; });
    if (!hasMesh) return; // new model still loading: the old particles stay where they are
    const data = this.sample(sys.count, this.modelKey ?? 'model');
    if (!data) return;
    this.pendingTransform = false;
    this.setMeshesVisible(g, false);
    this.goingSolid = false;
    sys.start('transform', data);
    store().patch({ busy: true });
  }

  private onDone(kind: TransitionKind): void {
    const s = store();
    if (kind === 'reconstruct') {
      if (this.handle?.group) this.setMeshesVisible(this.handle.group, true);
      if (this.system) this.system.points.visible = false;
      this.goingSolid = false;
      s.patch({ state: 'solid', busy: false, restKind: 'surface' });
    } else if (kind === 'burst' || kind === 'disperse') {
      s.patch({ busy: false, restKind: 'cloud' });
    } else {
      s.patch({ busy: false, restKind: 'surface' });
    }
  }

  private setMeshesVisible(g: Object3D, v: boolean): void {
    g.traverse((o) => { if ((o as Mesh).isMesh) o.visible = v; });
  }

  // ---- attraction ----

  private updateAttraction(sys: ParticleSystem, g: Object3D | null, f: DirectorFrame, particles: boolean): void {
    const want = store().attract && particles && !this.bench ? 1 : 0;
    this.attractStrength += (want - this.attractStrength) * (1 - Math.exp(-6 * f.dt));
    if (this.attractStrength < 1e-3 && want === 0) { this.attractStrength = 0; sys.setAttract([0, 0, 0], 0); return; }
    if (!g) return;
    f.camera.getWorldDirection(this.fwd);
    g.getWorldPosition(this.tmp);
    this.plane.setFromNormalAndCoplanarPoint(this.fwd, this.tmp);
    this.ray.setFromCamera(new Vector2(f.pointer.x, f.pointer.y), f.camera);
    const hit = this.ray.ray.intersectPlane(this.plane, new Vector3());
    if (!hit) return;
    g.worldToLocal(hit);
    sys.setAttract([hit.x, hit.y, hit.z], this.attractStrength);
  }

  // ---- benchmark ----

  private startBenchmark(): void {
    if (this.bench || !this.handle?.group) return;
    store().patch({ benchmark: { running: true, label: 'Starting…', results: [], error: null } });
    this.bench = { counts: [...PARTICLE_COUNTS], i: -1, sys: null, elapsed: 0, frames: 0, time: 0, sampleMs: 0, results: [] };
    this.nextBench();
  }

  private nextBench(): void {
    const b = this.bench;
    const g = this.handle?.group;
    if (!b || !g) return;
    b.sys?.dispose();
    b.sys = null;
    b.i++;
    if (b.i >= b.counts.length) {
      store().patch({ benchmark: { running: false, label: null, results: b.results, error: null } });
      this.bench = null;
      return;
    }
    const n = b.counts[b.i];
    const t0 = performance.now();
    const data = this.sample(n, 'benchmark');
    if (!data) {
      store().patch({ benchmark: { running: false, label: null, results: b.results, error: 'This model has no surface to sample.' } });
      this.bench = null;
      return;
    }
    const sys = new ParticleSystem(n, 1234);
    sys.load(data);
    g.add(sys.points);
    sys.onComplete = (k) => sys.start(k === 'burst' ? 'reconstruct' : 'burst'); // keep it moving for the whole measurement
    sys.start('burst');
    b.sampleMs = performance.now() - t0;
    b.sys = sys;
    b.elapsed = 0; b.frames = 0; b.time = 0;
    store().patch({ benchmark: { running: true, label: `Testing ${n.toLocaleString()} particles…`, results: b.results, error: null } });
  }

  private tickBenchmark(dt: number, time: number): void {
    const b = this.bench;
    if (!b?.sys) return;
    b.sys.update(dt, time);
    b.elapsed += dt;
    const WARMUP = 0.4, MEASURE = 1.6;
    if (b.elapsed > WARMUP) { b.frames++; b.time += dt; }
    if (b.elapsed >= WARMUP + MEASURE && b.frames > 0) {
      b.results.push({ count: b.counts[b.i], fps: b.frames / b.time, frameMs: (b.time / b.frames) * 1000, sampleMs: b.sampleMs });
      this.nextBench();
    }
  }
}
