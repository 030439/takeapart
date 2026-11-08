import { describe, expect, it } from 'vitest';
import { normalizeResult, type RawHandResult } from '../../src/features/hand-tracking/normalize';
import { HAND_CONNECTIONS, LANDMARK_COUNT, LANDMARK_NAMES } from '../../src/features/hand-tracking/types';
import { mapCameraError } from '../../src/features/hand-tracking/CameraService';
import { FpsMeter, RollingAverage } from '../../src/lib/metrics';
import { FrameBus } from '../../src/lib/FrameBus';

const pts = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i / 100, y: 0.5, z: -0.1 }));
const raw = (label: string, n = 21): RawHandResult => ({
  landmarks: [pts(n)],
  handedness: [[{ categoryName: label, score: 0.9 }]],
});

describe('landmark constants', () => {
  it('has 21 named landmarks and valid connections', () => {
    expect(LANDMARK_NAMES).toHaveLength(LANDMARK_COUNT);
    for (const [a, b] of HAND_CONNECTIONS) {
      expect(a).toBeLessThan(LANDMARK_COUNT);
      expect(b).toBeLessThan(LANDMARK_COUNT);
    }
  });
});

describe('normalizeResult', () => {
  it('maps 21 landmarks, score and timestamp', () => {
    const [h] = normalizeResult(raw('Left'), 123, false);
    expect(h.landmarks).toHaveLength(21);
    expect(h.handedness).toBe('Left');
    expect(h.score).toBe(0.9);
    expect(h.timestamp).toBe(123);
  });
  it('swaps handedness for unmirrored input', () => {
    expect(normalizeResult(raw('Left'), 0, true)[0].handedness).toBe('Right');
    expect(normalizeResult(raw('Right'), 0, true)[0].handedness).toBe('Left');
  });
  it('skips hands with missing landmarks or labels', () => {
    expect(normalizeResult(raw('Left', 20), 0, false)).toHaveLength(0);
    expect(normalizeResult({ landmarks: [pts(21)], handedness: [] }, 0, false)).toHaveLength(0);
    expect(normalizeResult({ landmarks: [], handedness: [] }, 0, false)).toHaveLength(0);
  });
  it('handles two hands', () => {
    const r: RawHandResult = {
      landmarks: [pts(21), pts(21)],
      handedness: [[{ categoryName: 'Left', score: 0.8 }], [{ categoryName: 'Right', score: 0.7 }]],
    };
    expect(normalizeResult(r, 0, false).map((h) => h.handedness)).toEqual(['Left', 'Right']);
  });
});

describe('mapCameraError', () => {
  it.each([
    ['NotAllowedError', 'permission-denied'],
    ['NotFoundError', 'no-camera'],
    ['NotReadableError', 'in-use'],
    ['OverconstrainedError', 'overconstrained'],
    ['SomethingElse', 'unknown'],
  ])('%s -> %s', (name, code) => {
    expect(mapCameraError(new DOMException('x', name)).code).toBe(code);
  });
  it('handles non-error values', () => {
    expect(mapCameraError('boom').code).toBe('unknown');
  });
});

describe('metrics', () => {
  it('FpsMeter reports ~30 fps for 33.33ms ticks', () => {
    const m = new FpsMeter();
    for (let i = 0; i < 40; i++) m.tick(i * (1000 / 30));
    expect(m.fps).toBeCloseTo(30, 0);
  });
  it('FpsMeter is 0 with fewer than two ticks', () => {
    const m = new FpsMeter();
    expect(m.fps).toBe(0);
    m.tick(1);
    expect(m.fps).toBe(0);
  });
  it('RollingAverage keeps a window', () => {
    const a = new RollingAverage(2);
    [10, 20, 30].forEach((v) => a.push(v));
    expect(a.value).toBe(25);
  });
});

describe('FrameBus', () => {
  it('publishes to subscribers and unsubscribes', () => {
    const bus = new FrameBus(0);
    const seen: number[] = [];
    const off = bus.subscribe((v) => seen.push(v));
    bus.publish(1);
    off();
    bus.publish(2);
    expect(seen).toEqual([1]);
    expect(bus.latest).toBe(2);
  });
});
