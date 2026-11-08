import { FrameBus } from '@/lib/FrameBus';
import { IDLE_OUTPUT, type InteractionOutput } from './InteractionEngine';

/** Cursor positions and mode, published every gesture frame. Read outside React by the cursor overlay. */
export const interactionBus = new FrameBus<InteractionOutput>(IDLE_OUTPUT);
