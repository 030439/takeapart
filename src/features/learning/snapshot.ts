import type { Snapshot } from '@/types/learning';
import { useModelRuntime } from '@/stores/modelRuntimeStore';
import { useParticleStore } from '@/stores/particleStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';

export function getSnapshot(): Snapshot {
  const w = useWorkspaceStore.getState();
  const sel = useModelRuntime.getState().components.find((c) => c.id === w.selectedComponentId);
  return { selectedNodeName: sel?.nodeName ?? null, explode: w.explodeTarget, particles: useParticleStore.getState().state };
}
