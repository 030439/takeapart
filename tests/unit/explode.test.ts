import { describe, expect, it } from 'vitest';
import { computeExplosionVectors, nextLevel, type V3 } from '../../src/features/explode-engine/explosionVectors';
import { MAX_SCALE, MIN_SCALE, PoseSimulation } from '../../src/features/explode-engine/PoseSimulation';
import { parseManifest } from '../../src/features/models/manifest';

const radial = { distance: 1, axis: 'radial' as const };
const len = (v: V3) => Math.hypot(v[0], v[1], v[2]);

describe('computeExplosionVectors', () => {
  it('moves parts directly away from the centre', () => {
    const v = computeExplosionVectors([{ id: 'a', center: [-1, 0, 0] }, { id: 'b', center: [1, 0, 0] }], radial);
    expect(v.get('a')![0]).toBeLessThan(0);
    expect(v.get('b')![0]).toBeGreaterThan(0);
    expect(v.get('a')![1]).toBeCloseTo(0, 9);
    expect(len(v.get('b')!)).toBeCloseTo(1, 9); // farthest part travels the full distance
  });
  it('sends farther parts further, but inner parts still move', () => {
    const v = computeExplosionVectors(
      [{ id: 'far', center: [4, 0, 0] }, { id: 'mid', center: [2, 0, 0] }, { id: 'neg', center: [-4, 0, 0] }],
      radial,
    );
    expect(len(v.get('far')!)).toBeGreaterThan(len(v.get('mid')!));
    expect(len(v.get('mid')!)).toBeGreaterThan(0.4 - 1e-9);
  });
  it('gives parts at the exact centre a deterministic non-zero direction', () => {
    const parts = ['a', 'b', 'c'].map((id) => ({ id, center: [0, 0, 0] as V3 }));
    const one = computeExplosionVectors(parts, radial);
    const two = computeExplosionVectors(parts, radial);
    for (const id of ['a', 'b', 'c']) {
      expect(len(one.get(id)!)).toBeGreaterThan(0.3);
      expect(one.get(id)).toEqual(two.get(id));
    }
    expect(one.get('a')).not.toEqual(one.get('b'));
  });
  it('constrains movement to one axis when asked', () => {
    const v = computeExplosionVectors(
      [{ id: 'low', center: [0.3, -2, 0.1] }, { id: 'high', center: [-0.2, 2, 0.4] }],
      { distance: 1, axis: 'y' },
    );
    expect(v.get('low')).toEqual([0, -1, 0]);
    expect(v.get('high')).toEqual([0, 1, 0]);
  });
  it('does not move a lone part', () => {
    expect(computeExplosionVectors([{ id: 'a', center: [1, 2, 3] }], radial).get('a')).toEqual([0, 0, 0]);
    expect(computeExplosionVectors([], radial).size).toBe(0);
  });
});

describe('nextLevel', () => {
  it('steps through the 25/50/75/100 presets and clamps', () => {
    expect(nextLevel(0, 1)).toBe(0.25);
    expect(nextLevel(0.25, 1)).toBe(0.5);
    expect(nextLevel(0.6, 1)).toBe(0.75);
    expect(nextLevel(1, 1)).toBe(1);
    expect(nextLevel(1, -1)).toBe(0.75);
    expect(nextLevel(0.3, -1)).toBe(0.25);
    expect(nextLevel(0, -1)).toBe(0);
  });
});

function sim() {
  const s = new PoseSimulation();
  s.setParts([
    { id: 'a', base: [1, 0, 0], vec: [1, 0, 0] },
    { id: 'b', base: [-1, 0.5, 0], vec: [-1, 0, 0.5] },
  ]);
  return s;
}
const run = (s: PoseSimulation, until: () => boolean, rotationSettled = true) => {
  for (let i = 0; i < 2000 && !until(); i++) s.step(1 / 60, rotationSettled);
};

describe('PoseSimulation', () => {
  it('animates monotonically to each level and reaches it exactly', () => {
    const s = sim();
    s.setExplodeTarget(0.5);
    let prev = 0;
    for (let i = 0; i < 600; i++) { s.step(1 / 60); expect(s.explodeCurrent).toBeGreaterThan(prev - 1e-12); prev = s.explodeCurrent; }
    expect(s.explodeCurrent).toBe(0.5);
    expect(s.position('a')).toEqual([1.5, 0, 0]);
    s.setExplodeTarget(1);
    run(s, () => s.explodeCurrent === 1);
    expect(s.position('b')).toEqual([-2, 0.5, 0.5]);
  });

  it('returns exactly to the original positions after repeated explode/assemble cycles', () => {
    const s = sim();
    for (let cycle = 0; cycle < 6; cycle++) {
      s.setExplodeTarget(1);
      run(s, () => s.explodeCurrent === 1);
      expect(s.position('a')).toEqual([2, 0, 0]);
      s.assemble();
      run(s, () => !s.assembling);
      expect(s.assembling).toBe(false);
      expect(s.position('a')).toEqual([1, 0, 0]);
      expect(s.position('b')).toEqual([-1, 0.5, 0]);
    }
  });

  it('keeps manual moves while exploding and clears them on assemble', () => {
    const s = sim();
    s.setExplodeTarget(1);
    run(s, () => s.explodeCurrent === 1);
    s.setLocalPosition('a', [5, 1, 0]);
    expect(s.position('a')).toEqual([5, 1, 0]);
    s.setExplodeTarget(0.5); // the moved part follows the explosion level, offset preserved
    run(s, () => s.explodeCurrent === 0.5);
    expect(s.position('a')[0]).toBeCloseTo(4.5, 9);
    s.assemble();
    run(s, () => !s.assembling);
    expect(s.position('a')).toEqual([1, 0, 0]);
  });

  it('clamps scale and restores it on assemble', () => {
    const s = sim();
    s.scalePart('a', 100);
    expect(s.scaleOf('a')).toBe(MAX_SCALE);
    s.scalePart('a', 0.0001);
    expect(s.scaleOf('a')).toBe(MIN_SCALE);
    s.assemble();
    run(s, () => !s.assembling);
    expect(s.scaleOf('a')).toBe(1);
  });

  it('assemble waits for rotation to settle, and direct manipulation cancels it', () => {
    const s = sim();
    s.scalePart('a', 2);
    s.assemble();
    run(s, () => s.scaleOf('a') === 1, false);
    expect(s.assembling).toBe(true); // rotation not settled yet
    s.step(1 / 60, true);
    expect(s.assembling).toBe(false);

    const t = sim();
    t.setLocalPosition('a', [9, 9, 9]);
    t.assemble();
    t.step(1 / 60);
    t.cancelAssemble();
    const before = t.position('a');
    t.step(1 / 60);
    expect(t.position('a')).toEqual(before);
  });

  it('snapAssembled returns to the original pose instantly', () => {
    const s = sim();
    s.setExplodeTarget(1);
    run(s, () => s.explodeCurrent === 1);
    s.setLocalPosition('a', [9, 9, 9]);
    s.scalePart('a', 2);
    s.snapAssembled();
    expect(s.position('a')).toEqual([1, 0, 0]);
    expect(s.scaleOf('a')).toBe(1);
    expect(s.explodeCurrent).toBe(0);
    expect(s.assembling).toBe(false);
  });

  it('ignores unknown part ids', () => {
    const s = sim();
    s.setLocalPosition('nope', [1, 1, 1]);
    s.scalePart('nope', 2);
    expect(s.position('nope')).toEqual([0, 0, 0]);
  });
});

describe('manifest explode config', () => {
  const base = { id: 'x', name: 'X', category: 'engines', description: 'd', file: 'a.glb' };
  it('accepts valid explode settings', () => {
    const r = parseManifest({ version: 1, models: [{ ...base, explode: { distance: 2, axis: 'y' } }] });
    expect(r.errors).toEqual([]);
    expect(r.models[0].explode).toEqual({ distance: 2, axis: 'y' });
  });
  it('rejects bad distance or axis', () => {
    const r = parseManifest({ version: 1, models: [{ ...base, id: 'a', explode: { distance: -1 } }, { ...base, id: 'b', explode: { axis: 'w' } }, { ...base, id: 'c', explode: 5 }] });
    expect(r.models).toHaveLength(0);
    expect(r.errors).toHaveLength(3);
  });
});
