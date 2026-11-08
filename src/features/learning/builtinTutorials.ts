import type { Tutorial } from '../../types/learning';
import { parseTutorials } from './tutorial';

/**
 * Tutorials about using TakeApart itself. They contain no subject-matter facts about any model,
 * so they are safe for every model. Subject-matter tutorials come from each model's own metadata.
 */
const RAW = [
  {
    id: 'getting-started',
    title: 'Getting started',
    summary: 'Select a part, pull the model apart, and put it back together.',
    steps: [
      { id: 'orbit', title: 'Look around', text: 'Drag with the mouse to orbit the model and scroll to zoom. Press Next when you are ready.' },
      { id: 'select', title: 'Select a part', text: 'Click any part in the viewport or in the Component hierarchy. Its details appear under Selected component.', action: { type: 'select' } },
      { id: 'explode', title: 'Pull it apart', text: 'Drag the Explode slider to at least 50%, or press E until the parts separate.', action: { type: 'explode', min: 0.5 } },
      { id: 'assemble', title: 'Put it back together', text: 'Press Assemble (or A) to return every part to its original position.', action: { type: 'assemble' } },
    ],
  },
  {
    id: 'particles',
    title: 'Particles',
    summary: 'Turn the model into particles and rebuild it.',
    steps: [
      { id: 'dissolve', title: 'Turn it into particles', text: 'Press P, or use the sparkle button, to dissolve the model into particles.', action: { type: 'particles' } },
      { id: 'reconstruct', title: 'Rebuild the model', text: 'Press P again, or Reconstruct model in the Particles panel, to gather the particles back into the model.', action: { type: 'reconstruct' } },
    ],
  },
  {
    id: 'hand-control',
    title: 'Hand control',
    summary: 'Try each gesture. Needs the camera on.',
    steps: [
      { id: 'pinch', title: 'Pinch', text: 'Pinch your thumb and index finger together to grab a part. Pinch empty space to rotate the model.', action: { type: 'hand', gesture: 'pinch' } },
      { id: 'point', title: 'Point', text: 'Point with your index finger, other fingers curled, to highlight and select parts.', action: { type: 'hand', gesture: 'point' } },
      { id: 'palm', title: 'Open palm', text: 'Hold an open hand for half a second to assemble the model.', action: { type: 'hand', gesture: 'palm' } },
      { id: 'fist', title: 'Fist', text: 'Hold a closed fist to turn the model into particles.', action: { type: 'hand', gesture: 'fist' } },
    ],
  },
];

const parsed = parseTutorials(RAW, 'builtin');
if (parsed.errors.length) throw new Error(`Invalid built-in tutorials: ${parsed.errors.join('; ')}`);

export const BUILTIN_TUTORIALS: Tutorial[] = parsed.tutorials;
