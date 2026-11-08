import { Plane, Quaternion, Raycaster, Vector2, Vector3, type Camera, type Material, type Mesh } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { PoseController } from '../explode-engine/PoseController';
import type { Vec3 } from '../gestures/types';
import type { Ndc } from './handMapping';
import type { SceneAdapter } from './InteractionEngine';
import type { ModelHandle } from './ModelHandle';

const UP = new Vector3(0, 1, 0);
const isSolid = (m: Mesh) => ((m.material as Material).opacity ?? 1) >= 0.5;

export class ThreeSceneAdapter implements SceneAdapter {
  private ray = new Raycaster();
  private plane = new Plane();
  private v = new Vector3();
  private fwd = new Vector3();
  private right = new Vector3();
  private q = new Quaternion();

  constructor(
    private camera: Camera,
    private handle: ModelHandle,
    private controls: OrbitControlsImpl | null,
    private pose: PoseController,
  ) {}

  pick(ndc: Ndc): string | null {
    this.ray.setFromCamera(new Vector2(ndc.x, ndc.y), this.camera);
    const hits = this.ray.intersectObjects([...this.handle.parts.values()], false);
    if (hits.length === 0) return null;
    // Translucent shells (opacity < 0.5) only win when nothing solid is behind the cursor.
    const hit = hits.find((h) => isSolid(h.object as Mesh)) ?? hits[0];
    return (hit.object.userData.partId as string | undefined) ?? null;
  }

  planePoint(ndc: Ndc, through: Vec3): Vec3 | null {
    this.camera.getWorldDirection(this.fwd);
    this.plane.setFromNormalAndCoplanarPoint(this.fwd, this.v.set(through.x, through.y, through.z));
    this.ray.setFromCamera(new Vector2(ndc.x, ndc.y), this.camera);
    const out = this.ray.ray.intersectPlane(this.plane, new Vector3());
    return out ? { x: out.x, y: out.y, z: out.z } : null;
  }

  partWorldPosition(id: string): Vec3 | null {
    const m = this.handle.parts.get(id);
    if (!m) return null;
    m.getWorldPosition(this.v);
    return { x: this.v.x, y: this.v.y, z: this.v.z };
  }

  setPartWorldPosition(id: string, p: Vec3): void {
    const m = this.handle.parts.get(id);
    if (!m?.parent) return;
    m.parent.worldToLocal(this.v.set(p.x, p.y, p.z));
    this.pose.setPartLocalPosition(id, this.v);
  }

  scalePart(id: string, factor: number): void {
    this.pose.sim.scalePart(id, factor);
    this.pose.applyOne(id);
  }

  rotateModel(dragX: number, dragY: number): void {
    const g = this.handle.group;
    if (!g) return;
    this.pose.sim.cancelAssemble();
    this.camera.matrixWorld.extractBasis(this.right, this.v, this.fwd);
    g.quaternion.premultiply(this.q.setFromAxisAngle(UP, dragX));
    g.quaternion.premultiply(this.q.setFromAxisAngle(this.right.normalize(), -dragY));
  }

  twistModel(rad: number): void {
    const g = this.handle.group;
    if (!g) return;
    this.pose.sim.cancelAssemble();
    this.camera.getWorldDirection(this.fwd);
    g.quaternion.premultiply(this.q.setFromAxisAngle(this.fwd.negate(), rad));
  }

  zoomCamera(ratio: number): void {
    const target = this.controls?.target ?? new Vector3();
    this.v.copy(this.camera.position).sub(target);
    const min = this.controls?.minDistance ?? 1.5;
    const max = this.controls?.maxDistance ?? 14;
    const len = Math.min(max, Math.max(min, this.v.length() / ratio));
    this.camera.position.copy(target).add(this.v.setLength(len));
    this.controls?.update();
  }

  selectedPart(): string | null { return useWorkspaceStore.getState().selectedComponentId; }
  select(id: string | null): void { useWorkspaceStore.getState().selectComponent(id); }
  hover(id: string | null): void { useWorkspaceStore.getState().setHovered(id); }
  getExplode(): number { return useWorkspaceStore.getState().explodeTarget; }
  setExplode(v: number): void { useWorkspaceStore.getState().setExplode(v); }

  /** Assemble: the store resets the explosion and bumps a counter that HandInteraction turns into the animation. */
  resetPose(): void { useWorkspaceStore.getState().assemble(); }
}
