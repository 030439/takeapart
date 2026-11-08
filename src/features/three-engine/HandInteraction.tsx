import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { ExplodeConfig } from '@/types/model';
import { PoseController, resolveExplode } from '../explode-engine/PoseController';
import { gestureFrameBus } from '../gestures/gestureRuntime';
import { InteractionEngine, IDLE_OUTPUT } from './InteractionEngine';
import { interactionBus } from './interactionBus';
import { ModelHandle } from './ModelHandle';
import { ThreeSceneAdapter } from './ThreeSceneAdapter';
import { useInteractionSettings, useInteractionStatus } from '@/stores/interactionStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';

/** Lives inside the Canvas. Runs pose animation, and feeds gesture frames to the InteractionEngine. */
export function HandInteraction({ handle, explode }: { handle: ModelHandle; explode?: ExplodeConfig }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const size = useThree((s) => s.size);
  const settings = useInteractionSettings();
  const nonce = useWorkspaceStore((s) => s.resetNonce);
  const handledNonce = useRef(nonce);

  const pose = useMemo(() => new PoseController(handle, resolveExplode(explode)), [handle, explode]);
  const adapter = useMemo(() => new ThreeSceneAdapter(camera, handle, controls, pose), [camera, handle, controls, pose]);
  const engine = useMemo(() => new InteractionEngine(adapter), [adapter]);

  // Explosion amount is driven by the store (slider, keys, gestures all write to it).
  useEffect(() => {
    pose.sim.setExplodeTarget(useWorkspaceStore.getState().explodeTarget);
    return useWorkspaceStore.subscribe((s, prev) => {
      if (s.explodeTarget !== prev.explodeTarget) pose.sim.setExplodeTarget(s.explodeTarget);
    });
  }, [pose]);

  useEffect(() => {
    handle.snapAssembled = () => pose.snapAssembled();
    return () => { handle.snapAssembled = undefined; };
  }, [handle, pose]);

  useEffect(() => {
    if (nonce !== handledNonce.current) { handledNonce.current = nonce; pose.sim.assemble(); }
  }, [nonce, pose]);

  useEffect(() => {
    engine.setConfig({ ...settings, viewAspect: size.width / Math.max(1, size.height) });
  }, [engine, settings, size.width, size.height]);

  useEffect(() => {
    const off = gestureFrameBus.subscribe((frame) => {
      const out = engine.process(frame);
      interactionBus.publish(out);
      const st = useInteractionStatus.getState();
      if (st.mode !== out.mode || st.detail !== out.detail) st.patch({ mode: out.mode, detail: out.detail });
    });
    return () => {
      off();
      engine.cancelAll();
      interactionBus.publish(IDLE_OUTPUT);
      useInteractionStatus.getState().patch({ mode: 'idle', detail: null });
    };
  }, [engine]);

  useFrame((_, dt) => pose.tick(useWorkspaceStore.getState().paused ? 0 : Math.min(dt, 0.1)));
  return null;
}

export type { ModelHandle };
