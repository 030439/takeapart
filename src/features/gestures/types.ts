import type { Handedness, Landmark } from '../hand-tracking/types';

export type GestureType = 'PINCH' | 'POINT' | 'OPEN_PALM' | 'FIST' | 'NONE';
export type ActiveGesture = Exclude<GestureType, 'NONE'>;
export type Vec3 = Landmark;

export interface GestureConfig {
  /** 0..1. Higher makes every gesture easier to trigger. 0.5 uses the thresholds below as written. */
  sensitivity: number;
  minConfidence: number;
  /** 0..0.95 exponential smoothing of landmarks. 0 disables it. */
  landmarkSmoothing: number;
  /** Frames in the majority-vote window that stabilises the gesture label. */
  stabilityFrames: number;
  /** Pinch starts below `pinchEnter` and ends above `pinchExit` (thumb-index distance / hand size). */
  pinchEnter: number;
  pinchExit: number;
  /** Minimum mean finger curl for a fist. */
  fistThreshold: number;
  /** Minimum mean finger extension for an open palm. */
  openPalmThreshold: number;
  /** Minimum index extension for pointing. */
  pointThreshold: number;
  /** How long a gesture must be held before it activates. */
  activationMs: Record<ActiveGesture, number>;
  /** Minimum gap between triggers of one-shot gestures (fist, open palm). */
  cooldownMs: number;
  /** How long a missing hand keeps its state before its gesture ends. */
  lostGraceMs: number;
}

export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  sensitivity: 0.5,
  minConfidence: 0.6,
  landmarkSmoothing: 0.35,
  stabilityFrames: 5,
  pinchEnter: 0.25,
  pinchExit: 0.4,
  fistThreshold: 0.65,
  openPalmThreshold: 0.8,
  pointThreshold: 0.75,
  activationMs: { PINCH: 60, POINT: 120, FIST: 350, OPEN_PALM: 500 },
  cooldownMs: 1000,
  lostGraceMs: 150,
};

export interface HandFeatures {
  handSize: number;
  pinchRatio: number;
  /** Extension 0 (curled) to 1 (straight): index, middle, ring, pinky. */
  extension: [number, number, number, number];
  thumbOpen: number;
  meanExtension: number;
}

export interface RawGesture { gesture: GestureType; confidence: number }

export type GesturePhase = 'start' | 'update' | 'end';

/** Normalized gesture event. `position` is in the unmirrored camera frame (x, y in 0..1). */
export interface GestureEvent {
  hand: Handedness;
  gesture: ActiveGesture;
  confidence: number;
  position: Vec3;
  timestamp: number;
  phase: GesturePhase;
  heldMs: number;
}

export type CommandType = 'grab' | 'drag' | 'release' | 'inspect' | 'inspect_end' | 'assemble' | 'explode';

export interface InteractionCommand {
  type: CommandType;
  hand: Handedness;
  position: Vec3;
  timestamp: number;
}

export interface HandGestureState {
  /** Active gesture, or NONE if nothing has activated. */
  gesture: GestureType;
  confidence: number;
  /** Gesture currently being detected, which may still be waiting for its hold time. */
  candidate: GestureType;
  /** 0..1 progress towards activating `candidate`. */
  progress: number;
}

export interface GestureFrame {
  events: GestureEvent[];
  commands: InteractionCommand[];
  states: Partial<Record<Handedness, HandGestureState>>;
  /** Per-hand anchor point (pinch midpoint, index tip, or palm centre), unmirrored camera frame. */
  positions: Partial<Record<Handedness, Vec3>>;
  timestamp: number;
}
