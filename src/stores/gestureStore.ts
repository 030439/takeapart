import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_GESTURE_CONFIG, type CommandType, type GestureConfig, type HandGestureState } from '@/features/gestures/types';
import type { Handedness } from '@/features/hand-tracking/types';

/** Throttled, UI-facing gesture status. Real-time consumers use the buses in gestureRuntime. */
export interface GestureStatus {
  hands: Partial<Record<Handedness, HandGestureState>>;
  lastCommand: { type: CommandType; hand: Handedness; at: number } | null;
}

export const useGestureStore = create<GestureStatus & { patch: (p: Partial<GestureStatus>) => void }>()((set) => ({
  hands: {},
  lastCommand: null,
  patch: (p) => set(p),
}));

export const useGestureSettings = create<GestureConfig & { set: (p: Partial<GestureConfig>) => void }>()(
  persist(
    (set) => ({ ...DEFAULT_GESTURE_CONFIG, set: (p) => set(p) }),
    { name: 'takeapart-gesture-settings', partialize: ({ set: _s, ...rest }) => rest },
  ),
);
