import { create } from 'zustand';
import type { ComponentInfo, ModelStats, StructureValidation } from '@/types/model';

export interface ModelRuntime {
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** 0..1, or null when the size is unknown. */
  progress: number | null;
  error: string | null;
  components: ComponentInfo[];
  validation: StructureValidation | null;
  stats: ModelStats | null;
}

const INITIAL: ModelRuntime = { status: 'idle', progress: null, error: null, components: [], validation: null, stats: null };

/** State of the model currently on screen, whatever its source. */
export const useModelRuntime = create<ModelRuntime & { set: (p: Partial<ModelRuntime>) => void; reset: () => void }>()((set) => ({
  ...INITIAL,
  set: (p) => set(p),
  reset: () => set(INITIAL),
}));
