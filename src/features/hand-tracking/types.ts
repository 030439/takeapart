export interface Landmark { x: number; y: number; z: number }
export type Handedness = 'Left' | 'Right';

/** One tracked hand. Landmark x/y are normalized 0..1 in the (unmirrored) camera frame. */
export interface TrackedHand {
  handedness: Handedness;
  score: number;
  landmarks: Landmark[];
  timestamp: number;
}

/** One processed camera frame. `aspect` is videoWidth / videoHeight. */
export interface HandFrame { hands: TrackedHand[]; aspect: number; timestamp: number }

export const LANDMARK_NAMES = [
  'Wrist', 'Thumb CMC', 'Thumb MCP', 'Thumb IP', 'Thumb tip',
  'Index MCP', 'Index PIP', 'Index DIP', 'Index tip',
  'Middle MCP', 'Middle PIP', 'Middle DIP', 'Middle tip',
  'Ring MCP', 'Ring PIP', 'Ring DIP', 'Ring tip',
  'Pinky MCP', 'Pinky PIP', 'Pinky DIP', 'Pinky tip',
] as const;

export const LANDMARK_COUNT = 21;
export const WRIST = 0;
export const FINGERTIPS = [4, 8, 12, 16, 20] as const;

export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
