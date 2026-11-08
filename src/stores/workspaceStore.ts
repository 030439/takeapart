import { create } from 'zustand';
import { nextLevel } from '@/features/explode-engine/explosionVectors';
import { useModelRuntime } from './modelRuntimeStore';
import { useParticleStore } from './particleStore';

/** Explosion needs separate components, and a visible solid model (not particles). */
const canExplode = () =>
  useModelRuntime.getState().validation?.supportsComponents === true && useParticleStore.getState().state === 'solid';

interface WorkspaceState {
  gridVisible: boolean;
  labelsVisible: boolean;
  selectedComponentId: string | null;
  hoveredComponentId: string | null;
  /** Requested explosion amount, 0..1. The 3D layer animates towards it. */
  explodeTarget: number;
  /** Incremented to ask the 3D layer to run the assemble animation. */
  resetNonce: number;
  /** Space pauses pose and particle animation. */
  paused: boolean;
  togglePaused: () => void;
  toggleGrid: () => void;
  toggleLabels: () => void;
  selectComponent: (id: string | null) => void;
  setHovered: (id: string | null) => void;
  setExplode: (v: number) => void;
  stepExplode: (dir: 1 | -1) => void;
  /** Sets the explosion to 0 without animation-triggering side effects (used when a model changes). */
  resetExplode: () => void;
  assemble: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  gridVisible: true,
  labelsVisible: true,
  selectedComponentId: null,
  hoveredComponentId: null,
  explodeTarget: 0,
  resetNonce: 0,
  paused: false,
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  toggleGrid: () => set((s) => ({ gridVisible: !s.gridVisible })),
  toggleLabels: () => set((s) => ({ labelsVisible: !s.labelsVisible })),
  selectComponent: (selectedComponentId) => set({ selectedComponentId }),
  setHovered: (hoveredComponentId) => set({ hoveredComponentId }),
  setExplode: (v) => { if (canExplode()) set({ explodeTarget: Math.min(1, Math.max(0, v)) }); },
  stepExplode: (dir) => { if (canExplode()) set((s) => ({ explodeTarget: nextLevel(s.explodeTarget, dir) })); },
  resetExplode: () => set({ explodeTarget: 0 }),
  assemble: () => {
    set((s) => ({ explodeTarget: 0, resetNonce: s.resetNonce + 1 }));
    useParticleStore.getState().reconstructIfParticles();
  },
}));
