import { useEffect } from 'react';
import { commandBus } from '../gestures/gestureRuntime';
import { useLearningStore } from '@/stores/learningStore';
import { useModelRuntime } from '@/stores/modelRuntimeStore';
import { useParticleStore } from '@/stores/particleStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { HandGesture } from '@/types/learning';

const GESTURE_OF: Record<string, HandGesture | undefined> = { grab: 'pinch', inspect: 'point', assemble: 'palm', explode: 'fist' };

/** Turns what the learner does (store changes and hand commands) into tutorial events. Mount once. */
export function useLearningEvents(): void {
  useEffect(() => {
    const emit = useLearningStore.getState().event;

    const offWorkspace = useWorkspaceStore.subscribe((s, prev) => {
      if (s.selectedComponentId && s.selectedComponentId !== prev.selectedComponentId) {
        const c = useModelRuntime.getState().components.find((x) => x.id === s.selectedComponentId);
        emit({ type: 'select', componentId: s.selectedComponentId, nodeName: c?.nodeName });
      }
      if (s.explodeTarget !== prev.explodeTarget) emit({ type: 'explode', amount: s.explodeTarget });
      if (s.resetNonce !== prev.resetNonce) emit({ type: 'assemble' });
    });
    const offParticles = useParticleStore.subscribe((s, prev) => {
      if (s.state !== prev.state) emit({ type: 'particles', state: s.state });
    });
    let lastPoint = 0;
    const offHands = commandBus.subscribe((cmds) => {
      for (const c of cmds) {
        const g = GESTURE_OF[c.type];
        if (!g) continue;
        if (g === 'point') { if (performance.now() - lastPoint < 500) continue; lastPoint = performance.now(); } // 'inspect' repeats every frame
        emit({ type: 'hand', gesture: g });
      }
    });
    return () => { offWorkspace(); offParticles(); offHands(); };
  }, []);
}
