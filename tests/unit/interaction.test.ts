import { describe, expect, it } from 'vitest';
import { CursorFilter, handToNdc } from '../../src/features/three-engine/handMapping';
import { TwoHandTracker } from '../../src/features/three-engine/twoHand';
import { InteractionEngine, DEFAULT_INTERACTION_CONFIG, type SceneAdapter } from '../../src/features/three-engine/InteractionEngine';
import type { GestureEvent, GestureFrame, GestureType, Vec3 } from '../../src/features/gestures/types';
import type { Handedness } from '../../src/features/hand-tracking/types';

const map = { gain: 1, margin: 0, mirrorX: true };

describe('handToNdc', () => {
  it('maps the frame centre to the viewport centre', () => {
    const n = handToNdc({ x: 0.5, y: 0.5 }, map);
    expect(n.x).toBeCloseTo(0, 6);
    expect(n.y).toBeCloseTo(0, 6);
  });
  it('mirrors x and flips y', () => {
    const n = handToNdc({ x: 0.25, y: 0.25 }, map); // raw left/top of the camera frame
    expect(n.x).toBeCloseTo(0.5, 6); // appears on the right after mirroring
    expect(n.y).toBeCloseTo(0.5, 6); // up
  });
  it('clamps to the interaction boundary and honours margin and gain', () => {
    expect(handToNdc({ x: -1, y: 2 }, map)).toEqual({ x: 1, y: -1 });
    const m = handToNdc({ x: 0.9, y: 0.5 }, { gain: 1, margin: 0.1, mirrorX: false });
    expect(m.x).toBeCloseTo(1, 6); // reaches the edge before the frame edge
    const g = handToNdc({ x: 0.6, y: 0.5 }, { gain: 2, margin: 0, mirrorX: false });
    expect(g.x).toBeCloseTo(0.4, 6);
  });
});

describe('CursorFilter', () => {
  it('moves partway and resets', () => {
    const f = new CursorFilter();
    f.smooth('R', { x: 0, y: 0 }, 0.5);
    expect(f.smooth('R', { x: 1, y: 0 }, 0.5).x).toBeCloseTo(0.5, 6);
    f.reset('R');
    expect(f.smooth('R', { x: 1, y: 0 }, 0.5).x).toBe(1);
  });
});

describe('TwoHandTracker', () => {
  it('reports scale > 1 when hands move apart and < 1 when they approach', () => {
    const t = new TwoHandTracker();
    t.start({ x: -0.4, y: 0 }, { x: 0.4, y: 0 }, 1);
    expect(t.update({ x: -0.6, y: 0 }, { x: 0.6, y: 0 }, 1).scale).toBeCloseTo(1.5, 6);
    expect(t.update({ x: -0.3, y: 0 }, { x: 0.3, y: 0 }, 1).scale).toBeCloseTo(0.5, 6);
  });
  it('reports a positive twist for a counter-clockwise turn and wraps across +-pi', () => {
    const t = new TwoHandTracker();
    t.start({ x: -0.4, y: 0 }, { x: 0.4, y: 0 }, 1);
    expect(t.update({ x: -0.4, y: -0.1 }, { x: 0.4, y: 0.1 }, 1).twist).toBeGreaterThan(0);
    const w = new TwoHandTracker();
    w.start({ x: 0.4, y: 0.01 }, { x: -0.4, y: -0.01 }, 1); // angle just under +-pi
    expect(Math.abs(w.update({ x: 0.4, y: -0.01 }, { x: -0.4, y: 0.01 }, 1).twist)).toBeLessThan(0.1);
  });
});

/** Records every call; the "scene" is a flat plane so planePoint(ndc) = (2x, 2y, 0). */
function mockAdapter(opts: { pick?: string | null; partPos?: Vec3; selected?: string | null; explode?: number } = {}) {
  const calls: { fn: string; args: unknown[] }[] = [];
  let selected = opts.selected ?? null;
  let explode = opts.explode ?? 0;
  const rec = (fn: string, ...args: unknown[]) => calls.push({ fn, args });
  const adapter: SceneAdapter = {
    pick: () => (opts.pick === undefined ? null : opts.pick),
    planePoint: (ndc) => ({ x: ndc.x * 2, y: ndc.y * 2, z: 0 }),
    partWorldPosition: () => opts.partPos ?? { x: 0, y: 0, z: 0 },
    setPartWorldPosition: (id, p) => rec('setPos', id, p),
    scalePart: (id, f) => rec('scale', id, f),
    rotateModel: (x, y) => rec('rotate', x, y),
    twistModel: (r) => rec('twist', r),
    zoomCamera: (r) => rec('zoom', r),
    selectedPart: () => selected,
    select: (id) => { selected = id; rec('select', id); },
    hover: (id) => rec('hover', id),
    getExplode: () => explode,
    setExplode: (v) => { explode = v; rec('explode', v); },
    resetPose: () => rec('reset'),
  };
  return { adapter, calls, of: (fn: string) => calls.filter((c) => c.fn === fn) };
}

const cfg = { ...DEFAULT_INTERACTION_CONFIG, margin: 0, cursorSmoothing: 0, viewAspect: 1, pointSelectDelayMs: 0 };
const raw = (ndcX: number, ndcY: number) => ({ x: 0.5 - ndcX / 2, y: 0.5 - ndcY / 2, z: 0 }); // inverse of handToNdc, mirrored

function frame(hands: Partial<Record<Handedness, { gesture: GestureType; at: [number, number] }>>, events: Array<[Handedness, GestureEvent['gesture'], GestureEvent['phase']]> = [], commands: GestureFrame['commands'] = [], ts = 0): GestureFrame {
  const states: GestureFrame['states'] = {}, positions: GestureFrame['positions'] = {};
  for (const h of ['Left', 'Right'] as const) {
    const s = hands[h];
    if (!s) continue;
    states[h] = { gesture: s.gesture, confidence: 0.9, candidate: s.gesture, progress: 1 };
    positions[h] = raw(s.at[0], s.at[1]);
  }
  return {
    events: events.map(([hand, gesture, phase]) => ({ hand, gesture, phase, confidence: 0.9, position: positions[hand] ?? { x: 0, y: 0, z: 0 }, timestamp: 0, heldMs: 0 })),
    commands, states, positions, timestamp: ts,
  };
}

describe('InteractionEngine: single hand', () => {
  it('pinching a part selects it and drags it, preserving the grab offset', () => {
    const m = mockAdapter({ pick: 'p1', partPos: { x: 1, y: 0, z: 0 } });
    const e = new InteractionEngine(m.adapter, cfg);
    e.process(frame({ Right: { gesture: 'PINCH', at: [0, 0] } }, [['Right', 'PINCH', 'start']]));
    expect(m.of('select')[0].args[0]).toBe('p1');
    const out = e.process(frame({ Right: { gesture: 'PINCH', at: [0.2, 0] } }, [['Right', 'PINCH', 'update']]));
    const p = m.of('setPos').at(-1)!.args[1] as Vec3;
    expect(p.x).toBeCloseTo(1.4, 6); // part started at x=1, hand moved plane-x by 0.4
    expect(out.mode).toBe('dragging');
  });

  it('stops moving the part after release', () => {
    const m = mockAdapter({ pick: 'p1' });
    const e = new InteractionEngine(m.adapter, cfg);
    e.process(frame({ Right: { gesture: 'PINCH', at: [0, 0] } }, [['Right', 'PINCH', 'start']]));
    e.process(frame({ Right: { gesture: 'NONE', at: [0.3, 0] } }, [['Right', 'PINCH', 'end']]));
    const before = m.of('setPos').length;
    e.process(frame({ Right: { gesture: 'NONE', at: [0.6, 0] } }));
    expect(m.of('setPos')).toHaveLength(before);
  });

  it('pinching empty space rotates the model by the hand movement', () => {
    const m = mockAdapter({ pick: null });
    const e = new InteractionEngine(m.adapter, cfg);
    e.process(frame({ Right: { gesture: 'PINCH', at: [0, 0] } }, [['Right', 'PINCH', 'start']]));
    e.process(frame({ Right: { gesture: 'PINCH', at: [0.1, -0.05] } }));
    const [x, y] = m.of('rotate').at(-1)!.args as number[];
    expect(x).toBeCloseTo(0.1 * cfg.rotateSpeed, 6);
    expect(y).toBeCloseTo(-0.05 * cfg.rotateSpeed, 6);
  });

  it('pointing highlights continuously, selects on start, and clears the highlight on end', () => {
    const m = mockAdapter({ pick: 'p2' });
    const e = new InteractionEngine(m.adapter, cfg);
    e.process(frame({ Right: { gesture: 'POINT', at: [0, 0] } }, [['Right', 'POINT', 'start']]));
    expect(m.of('select')[0].args[0]).toBe('p2');
    expect(m.of('hover').at(-1)!.args[0]).toBe('p2');
    e.process(frame({ Right: { gesture: 'NONE', at: [0, 0] } }, [['Right', 'POINT', 'end']]));
    expect(m.of('hover').at(-1)!.args[0]).toBeNull();
  });

  it('open palm (assemble) restores the pose', () => {
    const m = mockAdapter();
    const e = new InteractionEngine(m.adapter, cfg);
    e.process(frame({ Left: { gesture: 'OPEN_PALM', at: [0, 0] } }, [], [{ type: 'assemble', hand: 'Left', position: { x: 0, y: 0, z: 0 }, timestamp: 0 }]));
    expect(m.of('reset')).toHaveLength(1);
  });

  it('does nothing when hand control is disabled', () => {
    const m = mockAdapter({ pick: 'p1' });
    const e = new InteractionEngine(m.adapter, { ...cfg, enabled: false });
    const out = e.process(frame({ Right: { gesture: 'PINCH', at: [0, 0] } }, [['Right', 'PINCH', 'start']]));
    expect(m.calls).toHaveLength(0);
    expect(out.mode).toBe('idle');
  });
});

describe('InteractionEngine: two hands', () => {
  const both = (l: [number, number], r: [number, number], events: Array<[Handedness, GestureEvent['gesture'], GestureEvent['phase']]> = []) =>
    frame({ Left: { gesture: 'PINCH', at: l }, Right: { gesture: 'PINCH', at: r } }, events);

  it('zooms the camera when hands spread and nothing is selected', () => {
    const m = mockAdapter({ pick: null });
    const e = new InteractionEngine(m.adapter, cfg);
    e.process(frame({ Left: { gesture: 'PINCH', at: [-0.4, 0] } }, [['Left', 'PINCH', 'start']]));
    e.process(both([-0.4, 0], [0.4, 0], [['Right', 'PINCH', 'start']]));
    const out = e.process(both([-0.6, 0], [0.6, 0]));
    expect(out.mode).toBe('two-hand');
    expect(m.of('zoom').at(-1)!.args[0]).toBeCloseTo(1.5, 6);
    expect(m.of('scale')).toHaveLength(0);
  });

  it('scales the selected part instead of zooming, and twists the model', () => {
    const m = mockAdapter({ pick: null, selected: 'p1' });
    const e = new InteractionEngine(m.adapter, cfg);
    e.process(frame({ Left: { gesture: 'PINCH', at: [-0.4, 0] } }, [['Left', 'PINCH', 'start']]));
    e.process(both([-0.4, 0], [0.4, 0], [['Right', 'PINCH', 'start']]));
    e.process(both([-0.4, -0.2], [0.4, 0.2]));
    expect(m.of('scale').at(-1)!.args[0]).toBe('p1');
    expect(m.of('zoom')).toHaveLength(0);
    expect((m.of('twist').at(-1)!.args[0] as number)).toBeGreaterThan(0);
  });

  it('does not drag with the remaining hand after one hand releases, until it pinches again', () => {
    const m = mockAdapter({ pick: 'p1' });
    const e = new InteractionEngine(m.adapter, cfg);
    e.process(frame({ Left: { gesture: 'PINCH', at: [-0.4, 0] } }, [['Left', 'PINCH', 'start']]));
    e.process(both([-0.4, 0], [0.4, 0], [['Right', 'PINCH', 'start']]));
    e.process(frame({ Left: { gesture: 'NONE', at: [-0.4, 0] }, Right: { gesture: 'PINCH', at: [0.4, 0] } }, [['Left', 'PINCH', 'end']]));
    const before = m.of('setPos').length;
    const out = e.process(frame({ Left: { gesture: 'NONE', at: [-0.4, 0] }, Right: { gesture: 'PINCH', at: [0.6, 0] } }));
    expect(m.of('setPos')).toHaveLength(before);
    expect(out.mode).toBe('idle');
  });
});

describe('InteractionEngine: explode and assemble', () => {
  const cmd = (type: 'explode' | 'assemble') => [{ type, hand: 'Right' as const, position: { x: 0, y: 0, z: 0 }, timestamp: 0 }];

  it('a fist command explodes fully', () => {
    const m = mockAdapter();
    const e = new InteractionEngine(m.adapter, cfg);
    e.process(frame({ Right: { gesture: 'FIST', at: [0, 0] } }, [], cmd('explode')));
    expect(m.of('explode').at(-1)!.args[0]).toBe(1);
  });

  it('delays point selection so two-hand control can claim the gesture first', () => {
    const m = mockAdapter({ pick: 'p1' });
    const e = new InteractionEngine(m.adapter, { ...cfg, pointSelectDelayMs: 200 });
    e.process(frame({ Right: { gesture: 'POINT', at: [0, 0] } }, [['Right', 'POINT', 'start']], [], 0));
    e.process(frame({ Right: { gesture: 'POINT', at: [0, 0] } }, [], [], 100));
    expect(m.of('select')).toHaveLength(0);
    expect(m.of('hover').at(-1)!.args[0]).toBe('p1'); // highlight is immediate
    e.process(frame({ Right: { gesture: 'POINT', at: [0, 0] } }, [], [], 250));
    expect(m.of('select')).toHaveLength(1);
  });

  const bothPoint = (l: [number, number], r: [number, number], events: Array<[Handedness, GestureEvent['gesture'], GestureEvent['phase']]> = [], ts = 0) =>
    frame({ Left: { gesture: 'POINT', at: l }, Right: { gesture: 'POINT', at: r } }, events, [], ts);

  it('two pointing hands set the explosion by their spread, clamped to 0..1, without selecting', () => {
    const m = mockAdapter({ pick: 'p1', explode: 0.5 });
    const e = new InteractionEngine(m.adapter, { ...cfg, pointSelectDelayMs: 200 });
    e.process(frame({ Left: { gesture: 'POINT', at: [-0.2, 0] } }, [['Left', 'POINT', 'start']], [], 0));
    const out = e.process(bothPoint([-0.2, 0], [0.2, 0], [['Right', 'POINT', 'start']], 50));
    expect(out.mode).toBe('exploding');
    e.process(bothPoint([-0.4, 0], [0.4, 0], [], 100)); // spread grew by 0.4
    expect(m.of('explode').at(-1)!.args[0] as number).toBeCloseTo(0.9, 6);
    e.process(bothPoint([-0.9, 0], [0.9, 0], [], 150));
    expect(m.of('explode').at(-1)!.args[0]).toBe(1);
    e.process(bothPoint([-0.05, 0], [0.05, 0], [], 200)); // spread shrank from 0.4 to 0.1
    expect(m.of('explode').at(-1)!.args[0] as number).toBeCloseTo(0.2, 6);
    e.process(bothPoint([-0.05, 0], [0.05, 0], [], 600)); // well past the select delay
    expect(m.of('select')).toHaveLength(0);
  });

  it('clamps the explosion at 0 when the hands close past the starting level', () => {
    const m = mockAdapter({ explode: 0.1 });
    const e = new InteractionEngine(m.adapter, cfg);
    e.process(frame({ Left: { gesture: 'POINT', at: [-0.4, 0] } }, [['Left', 'POINT', 'start']], [], 0));
    e.process(bothPoint([-0.4, 0], [0.4, 0], [['Right', 'POINT', 'start']], 50));
    e.process(bothPoint([-0.05, 0], [0.05, 0], [], 100)); // spread 0.8 -> 0.1 would be -0.6
    expect(m.of('explode').at(-1)!.args[0]).toBe(0);
  });

  it('after one hand stops pointing, the other does not select or change the explosion', () => {
    const m = mockAdapter({ pick: 'p1', explode: 0.5 });
    const e = new InteractionEngine(m.adapter, { ...cfg, pointSelectDelayMs: 200 });
    e.process(frame({ Left: { gesture: 'POINT', at: [-0.2, 0] } }, [['Left', 'POINT', 'start']], [], 0));
    e.process(bothPoint([-0.2, 0], [0.2, 0], [['Right', 'POINT', 'start']], 50));
    e.process(frame({ Left: { gesture: 'NONE', at: [-0.2, 0] }, Right: { gesture: 'POINT', at: [0.2, 0] } }, [['Left', 'POINT', 'end']], [], 100));
    const n = m.calls.length;
    const out = e.process(frame({ Left: { gesture: 'NONE', at: [-0.2, 0] }, Right: { gesture: 'POINT', at: [0.9, 0] } }, [], [], 600));
    expect(m.calls.length).toBe(n);
    expect(out.mode).toBe('idle');
  });

  it('open palm assembles', () => {
    const m = mockAdapter();
    const e = new InteractionEngine(m.adapter, cfg);
    e.process(frame({ Left: { gesture: 'OPEN_PALM', at: [0, 0] } }, [], cmd('assemble')));
    expect(m.of('reset')).toHaveLength(1);
  });
});
