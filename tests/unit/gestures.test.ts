import { describe, expect, it } from 'vitest';
import type { Handedness, Landmark, TrackedHand } from '../../src/features/hand-tracking/types';
import { computeFeatures } from '../../src/features/gestures/GestureDetector';
import { GestureRecognizer } from '../../src/features/gestures/GestureRecognizer';
import { GestureSmoother, LandmarkSmoother } from '../../src/features/gestures/GestureSmoother';
import { GestureStateManager } from '../../src/features/gestures/GestureStateManager';
import { GestureMapper } from '../../src/features/gestures/GestureMapper';
import { GestureEngine } from '../../src/features/gestures/GestureEngine';
import { toMetric } from '../../src/features/gestures/geometry';
import { DEFAULT_GESTURE_CONFIG, type GestureEvent, type HandFeatures } from '../../src/features/gestures/types';

type Pose = 'open' | 'fist' | 'point' | 'pinch';
const P = (x: number, y: number): Landmark => ({ x, y, z: 0 });

/** Synthetic hand, wrist at the bottom, fingers pointing up, hand size 0.15. */
function pose(kind: Pose, handedness: Handedness = 'Right', dx = 0): TrackedHand {
  const bases: [number, number][] = [[0.46, 0.65], [0.5, 0.65], [0.54, 0.66], [0.58, 0.68]];
  const lm: Landmark[] = new Array(21);
  lm[0] = P(0.5, 0.8);
  const extendedFor = (i: number) => kind === 'open' || kind === 'pinch' || (kind === 'point' && i === 0);
  bases.forEach(([x, y], i) => {
    const o = 5 + i * 4;
    lm[o] = P(x, y);
    lm[o + 1] = P(x, y - 0.06);
    if (extendedFor(i)) { lm[o + 2] = P(x, y - 0.1); lm[o + 3] = P(x, y - 0.135); }
    else { lm[o + 2] = P(x, y - 0.035); lm[o + 3] = P(x, y - 0.005); }
  });
  lm[1] = P(0.46, 0.78); lm[2] = P(0.43, 0.74);
  if (kind === 'open') { lm[3] = P(0.4, 0.71); lm[4] = P(0.33, 0.68); }
  else if (kind === 'pinch') { lm[3] = P(0.44, 0.6); lm[4] = P(0.465, 0.515); }
  else { lm[3] = P(0.48, 0.72); lm[4] = P(0.52, 0.7); }
  return { handedness, score: 0.95, landmarks: lm.map((p) => ({ ...p, x: p.x + dx })), timestamp: 0 };
}

const classify = (kind: Pose) => {
  const f = computeFeatures(toMetric(pose(kind).landmarks, 1))!;
  return new GestureRecognizer().recognize('Right', f, DEFAULT_GESTURE_CONFIG);
};

describe('recognition', () => {
  it('recognizes pinch', () => expect(classify('pinch').gesture).toBe('PINCH'));
  it('recognizes fist', () => expect(classify('fist').gesture).toBe('FIST'));
  it('recognizes open palm', () => expect(classify('open').gesture).toBe('OPEN_PALM'));
  it('recognizes pointing', () => expect(classify('point').gesture).toBe('POINT'));
  it('reports confidence in 0..1', () => {
    for (const k of ['pinch', 'fist', 'open', 'point'] as Pose[]) {
      const c = classify(k).confidence;
      expect(c).toBeGreaterThan(0.6);
      expect(c).toBeLessThan(1.0001);
    }
  });
  it('gives no features for missing or non-finite landmarks', () => {
    expect(computeFeatures(toMetric(pose('open').landmarks.slice(0, 20), 1))).toBeNull();
    const bad = pose('open').landmarks; bad[8] = P(NaN, 0);
    expect(computeFeatures(toMetric(bad, 1))).toBeNull();
  });
});

describe('pinch hysteresis', () => {
  const feat = (pinchRatio: number): HandFeatures => ({ handSize: 0.15, pinchRatio, extension: [1, 1, 1, 1], thumbOpen: 1, meanExtension: 1 });
  it('stays pinched between the enter and exit thresholds, and releases above exit', () => {
    const r = new GestureRecognizer();
    const cfg = DEFAULT_GESTURE_CONFIG;
    expect(r.recognize('L', feat(0.3), cfg).gesture).not.toBe('PINCH'); // above enter: not started
    expect(r.recognize('L', feat(0.1), cfg).gesture).toBe('PINCH');
    expect(r.recognize('L', feat(0.33), cfg).gesture).toBe('PINCH'); // between enter and exit: held
    expect(r.recognize('L', feat(0.5), cfg).gesture).not.toBe('PINCH'); // above exit: released
    expect(r.recognize('L', feat(0.33), cfg).gesture).not.toBe('PINCH'); // must re-enter
  });
});

describe('smoothing', () => {
  it('a single flicker does not change the label', () => {
    const s = new GestureSmoother();
    const seq = ['FIST', 'FIST', 'POINT', 'FIST', 'FIST'] as const;
    let out = s.push('R', { gesture: 'FIST', confidence: 0.9 }, 5);
    for (const g of seq) out = s.push('R', { gesture: g, confidence: 0.9 }, 5);
    expect(out.gesture).toBe('FIST');
  });
  it('landmark EMA moves partway towards the new value', () => {
    const s = new LandmarkSmoother();
    s.smooth('R', [{ x: 0, y: 0, z: 0 }], 0.5);
    expect(s.smooth('R', [{ x: 1, y: 0, z: 0 }], 0.5)[0].x).toBeCloseTo(0.5, 5);
  });
});

describe('state manager', () => {
  const pos = { x: 0.5, y: 0.5, z: 0 };
  it('respects the activation time and the cooldown for one-shot gestures', () => {
    const m = new GestureStateManager();
    const starts: number[] = [];
    const run = (g: 'FIST' | 'NONE', t: number) => {
      const { events } = m.update('Right', { gesture: g, confidence: 0.9 }, pos, t, DEFAULT_GESTURE_CONFIG);
      events.filter((e) => e.phase === 'start').forEach(() => starts.push(t));
    };
    for (let t = 0; t <= 300; t += 50) run('FIST', t);
    expect(starts).toHaveLength(0); // still inside the 350 ms hold
    for (let t = 350; t <= 450; t += 50) run('FIST', t);
    expect(starts).toEqual([350]);
    run('NONE', 500);
    for (let t = 550; t <= 1300; t += 50) run('FIST', t);
    expect(starts).toEqual([350]); // blocked by the 1000 ms cooldown
    for (let t = 1350; t <= 1500; t += 50) run('FIST', t);
    expect(starts).toEqual([350, 1350]);
  });
  it('ends a gesture as soon as it stops being detected', () => {
    const m = new GestureStateManager();
    const cfg = DEFAULT_GESTURE_CONFIG;
    m.update('Right', { gesture: 'PINCH', confidence: 0.9 }, pos, 0, cfg);
    const a = m.update('Right', { gesture: 'PINCH', confidence: 0.9 }, pos, 100, cfg);
    expect(a.events.map((e) => e.phase)).toContain('start');
    const b = m.update('Right', { gesture: 'NONE', confidence: 0 }, pos, 133, cfg);
    expect(b.events.map((e) => e.phase)).toEqual(['end']);
  });
});

describe('mapper', () => {
  const ev = (gesture: GestureEvent['gesture'], phase: GestureEvent['phase']): GestureEvent =>
    ({ hand: 'Right', gesture, confidence: 1, position: { x: 0, y: 0, z: 0 }, timestamp: 0, phase, heldMs: 0 });
  it('maps events to commands', () => {
    const m = new GestureMapper();
    const t = (g: GestureEvent['gesture'], p: GestureEvent['phase']) => m.map([ev(g, p)])[0]?.type;
    expect(t('PINCH', 'start')).toBe('grab');
    expect(t('PINCH', 'update')).toBe('drag');
    expect(t('PINCH', 'end')).toBe('release');
    expect(t('POINT', 'start')).toBe('inspect');
    expect(t('POINT', 'end')).toBe('inspect_end');
    expect(t('OPEN_PALM', 'start')).toBe('assemble');
    expect(t('FIST', 'start')).toBe('explode');
    expect(t('FIST', 'update')).toBeUndefined();
  });
});

describe('engine', () => {
  const run = (engine: GestureEngine, frames: (t: number) => TrackedHand[], ms: number, from = 0) => {
    const events: GestureEvent[] = [];
    for (let t = from; t <= from + ms; t += 33) events.push(...engine.process(frames(t), 1, t).events);
    return events;
  };

  it('fires one explode for a held fist', () => {
    const e = new GestureEngine();
    const events = run(e, () => [pose('fist')], 1500);
    expect(events.filter((x) => x.gesture === 'FIST' && x.phase === 'start')).toHaveLength(1);
  });

  it('produces no events when landmarks are missing', () => {
    const e = new GestureEngine();
    const broken = pose('fist'); broken.landmarks = broken.landmarks.slice(0, 20);
    expect(run(e, () => [broken], 1000)).toHaveLength(0);
    expect(run(new GestureEngine(), () => [], 500)).toHaveLength(0);
  });

  it('tracks two hands independently', () => {
    const e = new GestureEngine();
    const events = run(e, () => [pose('fist', 'Left'), pose('pinch', 'Right')], 1000);
    const start = (hand: Handedness) => events.find((x) => x.hand === hand && x.phase === 'start')?.gesture;
    expect(start('Left')).toBe('FIST');
    expect(start('Right')).toBe('PINCH');
  });

  it('ends a pinch after the hand disappears for longer than the grace period', () => {
    const e = new GestureEngine();
    const held = run(e, () => [pose('pinch')], 600);
    expect(held.some((x) => x.gesture === 'PINCH' && x.phase === 'start')).toBe(true);
    const gone = run(e, () => [], 400, 700);
    expect(gone.filter((x) => x.gesture === 'PINCH' && x.phase === 'end')).toHaveLength(1);
  });

  it('flush ends active gestures', () => {
    const e = new GestureEngine();
    run(e, () => [pose('pinch')], 600);
    expect(e.flush(1000).events.map((x) => x.phase)).toEqual(['end']);
  });
});
