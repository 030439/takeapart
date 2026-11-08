import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_PARTICLE_COUNT } from '@/features/particle-engine/particlePresets';

export type ParticleCommandType = 'toggle' | 'dissolve' | 'reconstruct' | 'burst' | 'disperse' | 'benchmark';
export interface BenchmarkResult { count: number; fps: number; frameMs: number; sampleMs: number }

interface ParticleState {
  /** 'solid' = the real model is shown. 'particles' = the model is hidden and particles stand in for it. */
  state: 'solid' | 'particles';
  busy: boolean;
  restKind: 'surface' | 'cloud';
  count: number;
  attract: boolean;
  supported: boolean;
  activeCount: number;
  command: { type: ParticleCommandType; nonce: number } | null;
  benchmark: { running: boolean; label: string | null; results: BenchmarkResult[]; error: string | null };
  patch: (p: Partial<Omit<ParticleState, 'patch' | 'dispatch' | 'handFist' | 'reconstructIfParticles'>>) => void;
  dispatch: (type: ParticleCommandType) => void;
  /** Fist: dissolve a solid model; burst particles that already exist. */
  handFist: () => void;
  reconstructIfParticles: () => void;
}

export const useParticleStore = create<ParticleState>()(
  persist(
    (set, get) => ({
      state: 'solid', busy: false, restKind: 'surface', count: DEFAULT_PARTICLE_COUNT, attract: false, supported: true, activeCount: 0,
      command: null,
      benchmark: { running: false, label: null, results: [], error: null },
      patch: (p) => set(p),
      dispatch: (type) => set((s) => ({ command: { type, nonce: (s.command?.nonce ?? 0) + 1 } })),
      handFist: () => get().dispatch(get().state === 'solid' ? 'dissolve' : 'burst'),
      reconstructIfParticles: () => { if (get().state === 'particles') get().dispatch('reconstruct'); },
    }),
    { name: 'takeapart-particles', partialize: (s) => ({ count: s.count }) },
  ),
);
