export type HandGesture = 'pinch' | 'point' | 'palm' | 'fist';

/** What the learner must do to complete a step. Every action can be verified from app state or events. */
export type StepAction =
  | { type: 'read' }                                  // acknowledged with Next
  | { type: 'select'; component?: string }            // select a part (by node name), or any part
  | { type: 'explode'; min: number }                  // explosion amount at least `min`
  | { type: 'assemble' }                              // assemble, or bring the explosion back to 0
  | { type: 'particles' }                             // turn the model into particles
  | { type: 'reconstruct' }                           // turn particles back into the model
  | { type: 'hand'; gesture: HandGesture };           // perform a hand gesture (needs the camera)

export interface TutorialStep { id: string; title: string; text: string; action: StepAction }

export interface Tutorial {
  id: string;
  title: string;
  summary?: string;
  steps: TutorialStep[];
  /** Needs a model with separate components. Inferred from the steps. */
  requiresComponents: boolean;
  /** Has hand-gesture steps. Inferred from the steps. */
  needsCamera: boolean;
}

export type LearningEvent =
  | { type: 'select'; componentId: string; nodeName?: string }
  | { type: 'explode'; amount: number }
  | { type: 'assemble' }
  | { type: 'particles'; state: 'particles' | 'solid' }
  | { type: 'hand'; gesture: HandGesture };

/** Current app state, for steps whose condition may already hold when the step begins. */
export interface Snapshot { selectedNodeName: string | null; explode: number; particles: 'solid' | 'particles' }

/** Serialisable progress through one tutorial. */
export interface SessionState {
  tutorialId: string;
  index: number;
  done: boolean[];
  skipped: boolean[];
  finished: boolean;
}
