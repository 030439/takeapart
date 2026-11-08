import type { CommandType, GestureEvent, InteractionCommand } from './types';

type Table = Partial<Record<GestureEvent['gesture'], Partial<Record<GestureEvent['phase'], CommandType>>>>;

/** Gesture event -> interaction command. The 3D side (Phase 4+) only ever sees commands. */
const TABLE: Table = {
  PINCH: { start: 'grab', update: 'drag', end: 'release' },
  POINT: { start: 'inspect', update: 'inspect', end: 'inspect_end' },
  OPEN_PALM: { start: 'assemble' },
  FIST: { start: 'explode' },
};

export class GestureMapper {
  map(events: GestureEvent[]): InteractionCommand[] {
    const out: InteractionCommand[] = [];
    for (const e of events) {
      const type = TABLE[e.gesture]?.[e.phase];
      if (type) out.push({ type, hand: e.hand, position: e.position, timestamp: e.timestamp });
    }
    return out;
  }
}
