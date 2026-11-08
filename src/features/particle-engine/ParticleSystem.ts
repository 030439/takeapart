import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Points, ShaderMaterial } from 'three';
import vert from './shaders/particle.vert.glsl?raw';
import frag from './shaders/particle.frag.glsl?raw';
import { buildTransition, defaultPointSize, makeSeeds, makeVelocities, snapshotPositions, smooth, type TransitionKind } from './particlePresets';
import type { Bounds } from './surfaceSampler';

export interface SurfaceData { positions: Float32Array; colors: Float32Array; bounds: Bounds }

/**
 * GPU particle system: one Points draw call, all motion computed in the vertex shader.
 * The CPU only uploads buffers when a transition starts, never per frame.
 */
export class ParticleSystem {
  readonly points: Points<BufferGeometry, ShaderMaterial>;
  readonly count: number;
  onComplete?: (kind: TransitionKind) => void;

  private from: Float32Array;
  private to: Float32Array;
  private rest: Float32Array;
  private vel: Float32Array;
  private color: Float32Array;
  private colorTo: Float32Array;
  private seeds: Float32Array;
  private attrs: Record<'position' | 'aTo' | 'aColor' | 'aColorTo' | 'aVel', BufferAttribute>;
  private surface: Float32Array | null = null;
  private bounds: Bounds | null = null;
  private pending: SurfaceData | null = null;
  private progress = 1;
  private duration = 1;
  private stagger = 0;
  private kind: TransitionKind | null = null;
  playing = false;

  constructor(count: number, private readonly seed: number) {
    this.count = count;
    const n3 = count * 3;
    this.from = new Float32Array(n3);
    this.to = new Float32Array(n3);
    this.rest = new Float32Array(n3);
    this.vel = new Float32Array(n3);
    this.color = new Float32Array(n3);
    this.colorTo = new Float32Array(n3);
    this.seeds = makeSeeds(count, seed);
    const size = new Float32Array(count);
    for (let i = 0; i < count; i++) size[i] = 0.7 + 0.6 * this.seeds[i * 4 + 3];

    const dyn = (a: Float32Array) => new BufferAttribute(a, 3).setUsage(DynamicDrawUsage);
    this.attrs = { position: dyn(this.from), aTo: dyn(this.to), aColor: dyn(this.color), aColorTo: dyn(this.colorTo), aVel: dyn(this.vel) };
    const geo = new BufferGeometry();
    for (const [k, a] of Object.entries(this.attrs)) geo.setAttribute(k, a);
    geo.setAttribute('aSeed', new BufferAttribute(this.seeds, 4));
    geo.setAttribute('aSize', new BufferAttribute(size, 1));

    const mat = new ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uProgress: { value: 1 }, uStagger: { value: 0 }, uArc: { value: 0 }, uJitter: { value: 0 }, uShimmer: { value: 0 },
        uTime: { value: 0 }, uPointSize: { value: 0.02 }, uPixelsPerUnit: { value: 800 },
        uAttract: { value: 0 }, uAttractor: { value: [0, 0, 0] },
      },
    });
    this.points = new Points(geo, mat);
    this.points.frustumCulled = false; // positions are computed in the shader, so the CPU-side bounds are meaningless
    this.points.visible = false;
    this.points.userData.isParticles = true;
  }

  private get u() { return this.points.material.uniforms; }

  /** Sets the model surface the particles represent, and places the particles on it. */
  load(s: SurfaceData): void {
    this.surface = s.positions;
    this.bounds = s.bounds;
    this.vel.set(makeVelocities(s.positions, s.bounds, this.seed));
    this.color.set(s.colors);
    this.colorTo.set(s.colors);
    this.rest.set(s.positions);
    this.from.set(s.positions);
    this.to.set(s.positions);
    this.progress = 1;
    this.playing = false;
    this.u.uProgress.value = 1;
    this.u.uPointSize.value = defaultPointSize(this.count, s.bounds.radius);
    for (const a of Object.values(this.attrs)) a.needsUpdate = true;
  }

  /** Re-aims at a fresh sampling of the same model without moving the particles (used before reconstruction). */
  retarget(s: SurfaceData): void {
    this.surface = s.positions;
    this.bounds = s.bounds;
    this.color.set(s.colors);
    this.colorTo.set(s.colors);
    this.attrs.aColor.needsUpdate = true;
    this.attrs.aColorTo.needsUpdate = true;
  }

  get radius(): number { return this.bounds?.radius ?? 1; }

  start(kind: TransitionKind, target?: SurfaceData): void {
    if (!this.surface) return;
    if (this.playing) this.snapshotToRest();
    const tr = buildTransition(kind, { surface: this.surface, rest: this.rest, vel: this.vel, radius: this.radius, target: target?.positions });
    this.from.set(tr.from);
    this.to.set(tr.to);
    this.attrs.position.needsUpdate = true;
    this.attrs.aTo.needsUpdate = true;
    if (kind === 'transform' && target) {
      this.colorTo.set(target.colors);
      this.attrs.aColorTo.needsUpdate = true;
      this.pending = target;
    }
    this.kind = kind;
    this.duration = tr.params.duration;
    this.stagger = tr.params.stagger;
    this.progress = 0;
    this.playing = true;
    this.u.uProgress.value = 0;
    this.u.uStagger.value = tr.params.stagger;
    this.u.uArc.value = tr.params.arc;
    this.u.uJitter.value = tr.params.jitter;
    this.points.visible = true;
  }

  setAttract(local: [number, number, number], strength: number): void {
    this.u.uAttractor.value = local;
    this.u.uAttract.value = strength;
  }

  setShimmer(v: number): void { this.u.uShimmer.value = v; }
  setPixelsPerUnit(v: number): void { this.u.uPixelsPerUnit.value = v; }

  update(dt: number, time: number): void {
    this.u.uTime.value = time;
    if (!this.playing) return;
    this.progress = Math.min(1, this.progress + dt / this.duration);
    this.u.uProgress.value = this.progress;
    if (this.progress >= 1) this.finish();
  }

  /** CPU mirror of the shader at the current progress, so a new transition can start from where particles really are. */
  private snapshotToRest(): void {
    snapshotPositions(this.from, this.to, this.seeds, this.progress, this.stagger, this.rest);
    if (this.kind === 'transform') {
      for (let i = 0; i < this.count; i++) {
        const p = Math.min(1, Math.max(0, (this.progress - this.seeds[i * 4] * this.stagger) / Math.max(1 - this.stagger, 1e-4)));
        const e = smooth(p);
        for (let k = 0; k < 3; k++) this.color[i * 3 + k] = this.color[i * 3 + k] * (1 - e) + this.colorTo[i * 3 + k] * e;
      }
      this.colorTo.set(this.color);
      this.attrs.aColor.needsUpdate = true;
      this.attrs.aColorTo.needsUpdate = true;
      this.pending = null;
    }
  }

  private finish(): void {
    this.playing = false;
    this.rest.set(this.to);
    const kind = this.kind;
    if (kind === 'transform' && this.pending) {
      const s = this.pending;
      this.pending = null;
      this.surface = s.positions;
      this.bounds = s.bounds;
      this.color.set(this.colorTo);
      this.vel.set(makeVelocities(s.positions, s.bounds, this.seed));
      this.u.uPointSize.value = defaultPointSize(this.count, s.bounds.radius);
      this.attrs.aColor.needsUpdate = true;
      this.attrs.aVel.needsUpdate = true;
    }
    if (kind) this.onComplete?.(kind);
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.points.removeFromParent();
  }
}
