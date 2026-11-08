import { Box3, Quaternion, Vector3 } from 'three';
import type { ExplodeConfig } from '@/types/model';
import type { ModelHandle } from '../three-engine/ModelHandle';
import { computeExplosionVectors, DEFAULT_EXPLODE, type ExplodeOptions, type V3 } from './explosionVectors';
import { PoseSimulation } from './PoseSimulation';

const IDENTITY = new Quaternion();

export const resolveExplode = (c?: ExplodeConfig): ExplodeOptions => ({
  distance: c?.distance ?? DEFAULT_EXPLODE.distance,
  axis: c?.axis ?? DEFAULT_EXPLODE.axis,
});

/** Applies PoseSimulation results to the real meshes and builds explosion vectors from their geometry. */
export class PoseController {
  readonly sim = new PoseSimulation();
  private built = -1;

  constructor(private readonly handle: ModelHandle, private readonly opts: ExplodeOptions) {}

  setPartLocalPosition(id: string, local: Vector3): void {
    this.sim.setLocalPosition(id, [local.x, local.y, local.z]);
    this.applyOne(id);
  }

  applyOne(id: string): void {
    const mesh = this.handle.parts.get(id);
    const base = this.handle.baseline.get(id);
    if (!mesh || !base) return;
    const p = this.sim.position(id);
    mesh.position.set(p[0], p[1], p[2]);
    mesh.scale.copy(base.scale).multiplyScalar(this.sim.scaleOf(id));
  }

  snapAssembled(): void {
    this.sim.snapAssembled();
    for (const id of this.sim.ids()) this.applyOne(id);
  }

  /** Call every frame. */
  tick(dt: number): void {
    if (this.handle.version !== this.built) this.rebuild();
    const g = this.handle.group;
    const rotationSettled = !g || 1 - Math.abs(g.quaternion.w) < 1e-6;
    const wasAssembling = this.sim.assembling;
    const { changed, k } = this.sim.step(dt, rotationSettled);
    if (wasAssembling && g && !rotationSettled) {
      g.quaternion.slerp(IDENTITY, k);
      if (1 - Math.abs(g.quaternion.w) < 1e-6) g.quaternion.identity();
    }
    if (changed) for (const id of this.sim.ids()) this.applyOne(id);
  }

  /** Runs when parts are (re)registered, before the user can have moved anything, so centres are the assembled ones. */
  private rebuild(): void {
    const g = this.handle.group;
    if (!g) return;
    g.updateMatrixWorld(true);
    const entries = [...this.handle.parts].filter(([id]) => this.handle.baseline.has(id));
    const centres = entries.map(([id, mesh]) => {
      const c = new Box3().setFromObject(mesh).getCenter(new Vector3());
      g.worldToLocal(c);
      return { id, center: [c.x, c.y, c.z] as V3 };
    });
    const vecs = computeExplosionVectors(centres, this.opts);
    this.sim.setParts(
      entries.map(([id, mesh]) => {
        const base = this.handle.baseline.get(id)!.position;
        const c = centres.find((x) => x.id === id)!.center;
        const v = vecs.get(id) ?? [0, 0, 0];
        // Express the group-space offset in the part's parent space (handles scaled or rotated parents in GLB files).
        const p0 = g.localToWorld(new Vector3(c[0], c[1], c[2]));
        const p1 = g.localToWorld(new Vector3(c[0] + v[0], c[1] + v[1], c[2] + v[2]));
        mesh.parent?.worldToLocal(p0);
        mesh.parent?.worldToLocal(p1);
        p1.sub(p0);
        return { id, base: [base.x, base.y, base.z] as V3, vec: [p1.x, p1.y, p1.z] as V3 };
      }),
    );
    this.built = this.handle.version;
    for (const id of this.sim.ids()) this.applyOne(id);
  }
}
