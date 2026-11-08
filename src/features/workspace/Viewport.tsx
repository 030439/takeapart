import { useEffect, useMemo, type RefObject } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { ModelMeta } from '@/types/model';
import { ProceduralModel } from '@/features/three-engine/ProceduralModel';
import { HandInteraction } from '@/features/three-engine/HandInteraction';
import { GlbModel } from '@/features/three-engine/GlbModel';
import type { LoadedModel } from '@/features/models/ModelLoader';
import { ModelHandle } from '@/features/three-engine/ModelHandle';
import { useWorkspaceStore } from '@/stores/workspaceStore';

export interface ViewportActions {
  reset: () => void;
  zoom: (factor: number) => void;
}

function ActionBridge({ actions }: { actions: RefObject<ViewportActions | null> }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  useEffect(() => {
    actions.current = {
      reset: () => controls?.reset(),
      zoom: (f) => { camera.position.multiplyScalar(f); controls?.update(); },
    };
    return () => { actions.current = null; };
  }, [actions, camera, controls]);
  return null;
}

export function Viewport({ model, loaded, actions }: { model: ModelMeta; loaded: LoadedModel | null; actions: RefObject<ViewportActions | null> }) {
  const grid = useWorkspaceStore((s) => s.gridVisible);
  const select = useWorkspaceStore((s) => s.selectComponent);
  const handle = useMemo(() => new ModelHandle(), [model.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Canvas
      camera={{ position: [3.5, 2.5, 4], fov: 45 }}
      dpr={[1, 2]}
      onPointerMissed={() => select(null)}
    >
      <color attach="background" args={['#080b12']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 5]} intensity={1.4} />
      <directionalLight position={[-4, 2, -3]} intensity={0.4} color="#34d399" />
      {model.source === 'procedural' ? (
        <ProceduralModel key={model.id} model={model} handle={handle} />
      ) : (
        loaded && <GlbModel key={model.id} loaded={loaded} handle={handle} />
      )}
      {grid && (
        <Grid position={[0, -1.2, 0]} args={[20, 20]} cellColor="#1f2a3b" sectionColor="#10b981" sectionThickness={1} fadeDistance={14} infiniteGrid />
      )}
      <OrbitControls makeDefault enableDamping minDistance={1.5} maxDistance={14} />
      <ActionBridge actions={actions} />
      <HandInteraction handle={handle} explode={model.explode} />
    </Canvas>
  );
}
