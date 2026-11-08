import type { Handedness, TrackedHand } from '../hand-tracking/types';
import { computeFeatures } from './GestureDetector';
import { GestureMapper } from './GestureMapper';
import { GestureRecognizer } from './GestureRecognizer';
import { GestureSmoother, LandmarkSmoother } from './GestureSmoother';
import { GestureStateManager } from './GestureStateManager';
import { isValidHand, mid, toMetric } from './geometry';
import {
  DEFAULT_GESTURE_CONFIG,
  type GestureConfig, type GestureEvent, type GestureFrame, type GestureType, type HandGestureState, type RawGesture, type Vec3,
} from './types';

const NONE: RawGesture = { gesture: 'NONE', confidence: 0 };

function positionFor(gesture: GestureType, lm: Vec3[]): Vec3 {
  if (gesture === 'PINCH') return mid(lm[4], lm[8]);
  if (gesture === 'POINT') return lm[8];
  const ids = [0, 5, 9, 17];
  return {
    x: ids.reduce((s, i) => s + lm[i].x, 0) / ids.length,
    y: ids.reduce((s, i) => s + lm[i].y, 0) / ids.length,
    z: ids.reduce((s, i) => s + lm[i].z, 0) / ids.length,
  };
}

/** Pure, framework-free pipeline: landmarks in, gesture events and interaction commands out. */
export class GestureEngine {
  private cfg: GestureConfig;
  private recognizer = new GestureRecognizer();
  private landmarks = new LandmarkSmoother();
  private labels = new GestureSmoother();
  private states = new GestureStateManager();
  private mapper = new GestureMapper();
  private lastSeen = new Map<Handedness, number>();

  constructor(cfg: Partial<GestureConfig> = {}) {
    this.cfg = { ...DEFAULT_GESTURE_CONFIG, ...cfg, activationMs: { ...DEFAULT_GESTURE_CONFIG.activationMs, ...cfg.activationMs } };
  }

  get config(): GestureConfig { return this.cfg; }

  setConfig(patch: Partial<GestureConfig>): void {
    this.cfg = { ...this.cfg, ...patch, activationMs: { ...this.cfg.activationMs, ...patch.activationMs } };
  }

  /** `aspect` = video width / height. `now` in ms, monotonically increasing. */
  process(hands: TrackedHand[], aspect: number, now: number): GestureFrame {
    const events: GestureEvent[] = [];
    const states: Partial<Record<Handedness, HandGestureState>> = {};
    const positions: Partial<Record<Handedness, Vec3>> = {};
    const seen = new Set<Handedness>();

    for (const hand of hands) {
      const key = hand.handedness;
      if (seen.has(key)) continue; // duplicate label in one frame: keep the first
      seen.add(key);
      this.lastSeen.set(key, now);

      let raw: RawGesture = NONE;
      let pos: Vec3 = { x: 0, y: 0, z: 0 };
      if (isValidHand(hand.landmarks)) {
        const smooth = this.landmarks.smooth(key, hand.landmarks, this.cfg.landmarkSmoothing);
        const feats = computeFeatures(toMetric(smooth, aspect));
        if (feats) raw = this.recognizer.recognize(key, feats, this.cfg);
        if (raw.confidence < this.cfg.minConfidence) raw = NONE;
        const stable = this.labels.push(key, raw, this.cfg.stabilityFrames);
        pos = positionFor(stable.gesture, smooth);
        positions[key] = pos;
        const r = this.states.update(key, stable, pos, now, this.cfg);
        events.push(...r.events);
        states[key] = r.state;
      } else {
        // Missing or malformed landmarks never produce a gesture.
        const stable = this.labels.push(key, NONE, this.cfg.stabilityFrames);
        const r = this.states.update(key, stable, pos, now, this.cfg);
        events.push(...r.events);
        states[key] = r.state;
      }
    }

    for (const key of this.states.hands()) {
      if (seen.has(key)) continue;
      if (now - (this.lastSeen.get(key) ?? 0) > this.cfg.lostGraceMs) {
        events.push(...this.states.release(key, now));
        this.landmarks.reset(key);
        this.labels.reset(key);
        this.recognizer.reset(key);
        this.lastSeen.delete(key);
      }
    }

    return { events, commands: this.mapper.map(events), states, positions, timestamp: now };
  }

  /** Ends every active gesture immediately, e.g. when the camera stops. */
  flush(now: number): GestureFrame {
    const events: GestureEvent[] = [];
    for (const key of this.states.hands()) events.push(...this.states.release(key, now));
    this.landmarks.reset();
    this.labels.reset();
    this.recognizer.reset();
    this.lastSeen.clear();
    return { events, commands: this.mapper.map(events), states: {}, positions: {}, timestamp: now };
  }
}
