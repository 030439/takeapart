import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_INTERACTION_CONFIG, type InteractionConfig, type InteractionMode } from '@/features/three-engine/InteractionEngine';

export const useInteractionSettings = create<InteractionConfig & { set: (p: Partial<InteractionConfig>) => void }>()(
  persist(
    (set) => ({ ...DEFAULT_INTERACTION_CONFIG, set: (p) => set(p) }),
    { name: 'takeapart-interaction-settings', partialize: ({ set: _s, viewAspect: _v, ...rest }) => rest },
  ),
);

export const useInteractionStatus = create<{ mode: InteractionMode; detail: string | null; patch: (p: { mode: InteractionMode; detail: string | null }) => void }>()((set) => ({
  mode: 'idle',
  detail: null,
  patch: (p) => set(p),
}));
