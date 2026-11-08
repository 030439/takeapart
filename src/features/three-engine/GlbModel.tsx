import { useEffect, useMemo } from 'react';
import { Html } from '@react-three/drei';
import { createPortal, type ThreeEvent } from '@react-three/fiber';
import { Vector3, type Color, type Mesh, type MeshStandardMaterial } from 'three';
import type { LoadedModel } from '@/features/models/ModelLoader';
import { forEachMaterial } from '@/features/models/modelUtils';
import { useModelRuntime } from '@/stores/modelRuntimeStore';
import { useParticleStore } from '@/stores/particleStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { ModelHandle } from './ModelHandle';

function PartLabel({ mesh, text }: { mesh: Mesh; text: string }) {
  const centre = useMemo(() => {
    mesh.geometry.computeBoundingBox();
    return mesh.geometry.boundingBox!.getCenter(new Vector3()).toArray() as [number, number, number];
  }, [mesh]);
  return createPortal(
    <Html position={centre} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
      <div className="glass rounded-md px-2 py-1 text-xs whitespace-nowrap">{text}</div>
    </Html>,
    mesh,
  );
}

/** Renders a loaded GLB. Parts are only interactive when the file really has separate meshes. */
export function GlbModel({ loaded, handle }: { loaded: LoadedModel; handle: ModelHandle }) {
  const supports = loaded.validation.supportsComponents;
  const selected = useWorkspaceStore((s) => s.selectedComponentId);
  const hovered = useWorkspaceStore((s) => s.hoveredComponentId);
  const labels = useWorkspaceStore((s) => s.labelsVisible);
  const select = useWorkspaceStore((s) => s.selectComponent);
  const setHovered = useWorkspaceStore((s) => s.setHovered);
  const selectedName = useModelRuntime((s) => s.components.find((c) => c.id === selected)?.name);

  // Expose parts to hand interaction only for multi-part models.
  useEffect(() => {
    if (!supports) return;
    loaded.meshes.forEach((m, id) => handle.registerPart(id, m));
    return () => {
      loaded.meshes.forEach((_, id) => handle.registerPart(id, null));
    };
  }, [loaded, handle, supports]);

  useEffect(() => {
    if (!supports) return;
    loaded.meshes.forEach((mesh, id) => {
      const on = id === selected || id === hovered;
      forEachMaterial(mesh, (mat) => {
        const m = mat as MeshStandardMaterial;
        if (!m.emissive) return;
        if (on) {
          m.emissive.set('#10b981');
          m.emissiveIntensity = id === selected ? 0.6 : 0.25;
        } else {
          const base = mat.userData.baseEmissive as Color | undefined;
          if (base) m.emissive.copy(base);
          else m.emissive.set('#000000');
          m.emissiveIntensity = (mat.userData.baseIntensity as number | undefined) ?? 1;
        }
      });
    });
  }, [loaded, supports, selected, hovered]);

  const partId = (e: ThreeEvent<MouseEvent | PointerEvent>) => e.object.userData.partId as string | undefined;
  const selectedMesh = selected ? loaded.meshes.get(selected) : undefined;

  return (
    <group ref={(g) => { handle.group = g; }}>
      <primitive
        object={loaded.root}
        onClick={(e: ThreeEvent<MouseEvent>) => { const id = partId(e); if (supports && id && useParticleStore.getState().state === 'solid') { e.stopPropagation(); select(id); } }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => { const id = partId(e); if (supports && id && useParticleStore.getState().state === 'solid') { e.stopPropagation(); setHovered(id); } }}
        onPointerOut={() => { if (supports) setHovered(null); }}
      />
      {labels && supports && selectedMesh && selectedName && <PartLabel mesh={selectedMesh} text={selectedName} />}
    </group>
  );
}
