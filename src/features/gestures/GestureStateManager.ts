import type { Handedness } from '../hand-tracking/types';
import { clamp01 } from './geometry';
import type { ActiveGesture, GestureConfig, GestureEvent, GesturePhase, GestureType, HandGestureState, RawGesture, Vec3 } from './types';

/** Gestures that fire once and are rate-limited by the cooldown. */
const ONE_SHOT: ReadonlySet<GestureType> = new Set(['FIST', 'OPEN_PALM']);
const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

interface HandState {
  active: GestureType;
  activeSince: number;
  candidate: GestureType;
  candidateSince: number;
  confidence: number;
  position: Vec3;
  lastTrigger: Partial<Record<ActiveGesture, number>>;
}

/**
 * Per-hand state machine. A gesture activates after its hold time (and cooldown, for one-shots),
 * and ends as soon as it is no longer the detected gesture.
 */
export class GestureStateManager {
  private states = new Map<Handedness, HandState>();

  update(hand: Handedness, stable: RawGesture, position: Vec3, now: number, cfg: GestureConfig) {
    const s = this.states.get(hand) ?? {
      active: 'NONE' as GestureType, activeSince: 0, candidate: 'NONE' as GestureType, candidateSince: now,
      confidence: 0, position: ZERO, lastTrigger: {},
    };
    this.states.set(hand, s);
    const events: GestureEvent[] = [];
    const emit = (gesture: ActiveGesture, phase: GesturePhase) =>
      events.push({ hand, gesture, confidence: s.confidence, position: s.position, timestamp: now, phase, heldMs: now - s.activeSince });

    if (stable.gesture !== s.candidate) {
      s.candidate = stable.gesture;
      s.candidateSince = now;
    }

    if (s.active !== 'NONE' && s.candidate !== s.active) {
      emit(s.active as ActiveGesture, 'end');
      s.active = 'NONE';
    }

    let progress = 0;
    if (s.candidate !== 'NONE') {
      const g = s.candidate as ActiveGesture;
      if (s.candidate === s.active) {
        s.confidence = stable.confidence;
        s.position = position;
        emit(g, 'update');
        progress = 1;
      } else {
        const need = cfg.activationMs[g];
        const waited = now - s.candidateSince;
        const last = s.lastTrigger[g];
        const cooling = ONE_SHOT.has(g) && last !== undefined && now - last < cfg.cooldownMs;
        progress = need === 0 ? 1 : clamp01(waited / need);
        if (waited >= need && !cooling) {
          s.active = g;
          s.activeSince = now;
          s.confidence = stable.confidence;
          s.position = position;
          if (ONE_SHOT.has(g)) s.lastTrigger[g] = now;
          emit(g, 'start');
          progress = 1;
        }
      }
    }

    const state: HandGestureState = {
      gesture: s.active,
      confidence: s.active !== 'NONE' ? s.confidence : stable.confidence,
      candidate: s.candidate,
      progress,
    };
    return { events, state };
  }

  /** Ends any active gesture for a hand and forgets it (hand lost or tracking stopped). */
  release(hand: Handedness, now: number): GestureEvent[] {
    const s = this.states.get(hand);
    this.states.delete(hand);
    if (!s || s.active === 'NONE') return [];
    return [{
      hand, gesture: s.active as ActiveGesture, confidence: s.confidence, position: s.position,
      timestamp: now, phase: 'end', heldMs: now - s.activeSince,
    }];
  }

  hands(): Handedness[] { return [...this.states.keys()]; }
}
