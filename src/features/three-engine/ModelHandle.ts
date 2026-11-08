import type { Group, Mesh, Vector3 } from 'three';

/** Live Three.js objects for the current model, plus their original transforms (never overwritten). */
export class ModelHandle {
  group: Group | null = null;
  parts = new Map<string, Mesh>();
  baseline = new Map<string, { position: Vector3; scale: Vector3 }>();
  /** Increments whenever the set of registered parts really changes. */
  version = 0;
  /** Set by the pose controller: jump to the assembled pose without animation. */
  snapAssembled?: () => void;

  registerPart(id: string, mesh: Mesh | null): void {
    if (!mesh) {
      if (this.parts.delete(id)) { this.baseline.delete(id); this.version++; }
      return;
    }
    if (this.parts.get(id) === mesh) return;
    mesh.userData.partId = id;
    this.parts.set(id, mesh);
    this.baseline.set(id, { position: mesh.position.clone(), scale: mesh.scale.clone() });
    this.version++;
  }
}
