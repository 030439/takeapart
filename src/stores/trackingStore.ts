import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface TrackingStatus {
  camera: 'off' | 'requesting' | 'active' | 'error';
  cameraError: string | null;
  tracker: 'idle' | 'loading' | 'ready' | 'error';
  trackerError: string | null;
  delegate: 'GPU' | 'CPU' | null;
  devices: { id: string; label: string }[];
  left: boolean;
  right: boolean;
  leftScore: number;
  rightScore: number;
  fps: number;
  inferenceMs: number;
}

export const IDLE_STATUS: TrackingStatus = {
  camera: 'off', cameraError: null, tracker: 'idle', trackerError: null, delegate: null,
  devices: [], left: false, right: false, leftScore: 0, rightScore: 0, fps: 0, inferenceMs: 0,
};

export const useTrackingStore = create<TrackingStatus & { patch: (p: Partial<TrackingStatus>) => void }>()((set) => ({
  ...IDLE_STATUS,
  patch: (p) => set(p),
}));

export interface TrackingSettings {
  deviceId: string;
  width: number;
  height: number;
  frameRate: number;
  targetFps: number;
  mirrored: boolean;
  showLandmarks: boolean;
  minDetection: number;
  minPresence: number;
  minTracking: number;
  set: (p: Partial<Omit<TrackingSettings, 'set'>>) => void;
}

export const useTrackingSettings = create<TrackingSettings>()(
  persist(
    (set) => ({
      deviceId: '', width: 640, height: 480, frameRate: 30, targetFps: 30,
      mirrored: true, showLandmarks: true,
      minDetection: 0.5, minPresence: 0.5, minTracking: 0.5,
      set: (p) => set(p),
    }),
    { name: 'takeapart-tracking-settings', partialize: ({ set: _s, ...rest }) => rest },
  ),
);
