import { Box3, Texture, Vector3, type Material, type Mesh, type Object3D } from 'three';
import { fitTransform } from './modelStructure';

export function forEachMaterial(mesh: Mesh, fn: (m: Material) => void): void {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  mats.forEach((m) => { if (m) fn(m); });
}

/** Frees GPU resources held by every mesh under `root` and detaches it from its parent. */
export function disposeObject(root: Object3D): void {
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.geometry?.dispose();
    forEachMaterial(m, (mat) => {
      for (const v of Object.values(mat)) if (v instanceof Texture) v.dispose();
      mat.dispose();
    });
  });
  root.removeFromParent();
}

export function countTriangles(root: Object3D): number {
  let t = 0;
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    t += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
  });
  return Math.round(t);
}

/** Scales `root` uniformly so its longest side equals `target`, and centres its bounding box at the origin. */
export function centerAndScale(root: Object3D, target: number): { scale: number } | null {
  root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(root);
  if (box.isEmpty()) return null;
  const { scale, offset } = fitTransform(box.min.toArray() as [number, number, number], box.max.toArray() as [number, number, number], target);
  root.scale.multiplyScalar(scale);
  root.position.multiplyScalar(scale).add(new Vector3(...offset));
  root.updateMatrixWorld(true);
  return { scale };
}
