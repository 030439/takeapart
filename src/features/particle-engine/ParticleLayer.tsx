import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils, type PerspectiveCamera } from 'three';
import { interactionBus } from '../three-engine/interactionBus';
import type { ModelHandle } from '../three-engine/ModelHandle';
import { useParticleStore } from '@/stores/particleStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { ParticleDirector } from './ParticleDirector';

/** Inside the Canvas. Persists across model changes so particles can morph from one model to the next. */
export function ParticleLayer({ handle, modelKey }: { handle: ModelHandle; modelKey: string | null }) {
  const director = useMemo(() => new ParticleDirector(), []);
  const pointer = useThree((s) => s.pointer);

  useEffect(() => { director.setHandle(handle); }, [director, handle]);
  useEffect(() => { director.setModelKey(modelKey); }, [director, modelKey]);
  useEffect(() => {
    const off = useParticleStore.subscribe((s, prev) => {
      if (s.command && s.command !== prev.command) director.command(s.command.type);
      if (s.count !== prev.count) director.setCount(s.count);
    });
    return () => { off(); director.dispose(); };
  }, [director]);

  useFrame((state, dt) => {
    const cam = state.camera as PerspectiveCamera;
    const pixelsPerUnit = (state.size.height * state.viewport.dpr) / (2 * Math.tan(MathUtils.degToRad(cam.fov) / 2));
    const handCursor = Object.values(interactionBus.latest.cursors).find((c) => c?.gesture === 'POINT')?.ndc;
    director.update({
      dt: Math.min(dt, 0.1), time: state.clock.elapsedTime, camera: state.camera, pixelsPerUnit,
      pointer: handCursor ?? { x: pointer.x, y: pointer.y }, paused: useWorkspaceStore.getState().paused,
    });
  });
  return null;
}
