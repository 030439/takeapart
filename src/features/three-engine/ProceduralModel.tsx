import { useCallback, useState } from 'react';
import { Html } from '@react-three/drei';
import type { Mesh } from 'three';
import type { ComponentMeta, PartGeometry, ProceduralModelMeta } from '@/types/model';
import { useParticleStore } from '@/stores/particleStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { ModelHandle } from './ModelHandle';

function Geometry({ g }: { g: PartGeometry }) {
  switch (g.kind) {
    case 'cylinder': return <cylinderGeometry args={g.args} />;
    case 'box': return <boxGeometry args={g.args} />;
    case 'sphere': return <sphereGeometry args={g.args} />;
    case 'torus': return <torusGeometry args={g.args} />;
  }
}

function Part({ part, handle }: { part: ComponentMeta; handle: ModelHandle }) {
  const selected = useWorkspaceStore((s) => s.selectedComponentId === part.id);
  const handHover = useWorkspaceStore((s) => s.hoveredComponentId === part.id);
  const guide = useWorkspaceStore((s) => s.guideComponentId === part.id);
  const labels = useWorkspaceStore((s) => s.labelsVisible);
  const select = useWorkspaceStore((s) => s.selectComponent);
  const [hover, setHover] = useState(false);
  const register = useCallback((m: Mesh | null) => handle.registerPart(part.id, m), [handle, part.id]);
  const active = selected || hover || handHover;
  return (
    <mesh
      ref={register}
      position={part.position}
      rotation={part.rotation}
      onClick={(e) => { if (useParticleStore.getState().state !== 'solid') return; e.stopPropagation(); select(part.id); }}
      onPointerOver={(e) => { if (useParticleStore.getState().state !== 'solid') return; e.stopPropagation(); setHover(true); }}
      onPointerOut={() => setHover(false)}
    >
      <Geometry g={part.geometry} />
      <meshStandardMaterial
        color={part.color}
        metalness={0.3}
        roughness={0.5}
        transparent={part.opacity !== undefined}
        opacity={part.opacity ?? 1}
        emissive={active ? '#10b981' : guide ? '#38bdf8' : '#000000'}
        emissiveIntensity={selected ? 0.6 : guide ? 0.5 : 0.25}
      />
      {labels && selected && (
        <Html center distanceFactor={8} style={{ pointerEvents: 'none' }}>
          <div className="glass rounded-md px-2 py-1 text-xs whitespace-nowrap">{part.name}</div>
        </Html>
      )}
    </mesh>
  );
}

export function ProceduralModel({ model, handle }: { model: ProceduralModelMeta; handle: ModelHandle }) {
  return (
    <group ref={(g) => { handle.group = g; }}>
      {model.components.map((c) => <Part key={c.id} part={c} handle={handle} />)}
    </group>
  );
}
