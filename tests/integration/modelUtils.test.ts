import { describe, expect, it } from 'vitest';
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from 'three';
import { centerAndScale, countTriangles, disposeObject } from '../../src/features/models/modelUtils';
import { extractComponents, validateStructure } from '../../src/features/models/modelStructure';

const box = (w: number, h: number, d: number, x = 0) => {
  const m = new Mesh(new BoxGeometry(w, h, d), new MeshStandardMaterial());
  m.position.x = x;
  return m;
};

describe('centerAndScale (real Three.js objects)', () => {
  it('centres the model at the origin and fits its longest side', () => {
    const root = new Group();
    root.add(box(4, 2, 2, 10));
    expect(centerAndScale(root, 2)).not.toBeNull();
    const b = new Box3().setFromObject(root);
    const c = b.getCenter(new (b.min.constructor as new () => typeof b.min)());
    expect(Math.abs(c.x)).toBeLessThan(1e-6);
    expect(b.getSize(c.clone()).x).toBeCloseTo(2, 6);
  });
  it('returns null for an object with no geometry', () => {
    expect(centerAndScale(new Group(), 2)).toBeNull();
  });
});

describe('disposeObject', () => {
  it('disposes geometry, materials and textures, and detaches the object', () => {
    const parent = new Group();
    const root = new Group();
    parent.add(root);
    const m = box(1, 1, 1);
    const mat = m.material as MeshStandardMaterial;
    mat.map = new Texture();
    root.add(m);
    const hits: string[] = [];
    m.geometry.addEventListener('dispose', () => hits.push('geometry'));
    mat.addEventListener('dispose', () => hits.push('material'));
    mat.map.addEventListener('dispose', () => hits.push('texture'));
    disposeObject(root);
    expect(hits.sort()).toEqual(['geometry', 'material', 'texture']);
    expect(root.parent).toBeNull();
  });
});

describe('hierarchy extraction on a real Object3D tree', () => {
  it('finds the parts and assemblies', () => {
    const scene = new Group();
    const asm = new Group(); asm.name = 'Engine';
    const a = box(1, 1, 1); a.name = 'Piston';
    const b = box(1, 1, 1, 2); b.name = 'Crank';
    asm.add(a, b);
    scene.add(asm);
    const c = extractComponents(scene);
    expect(c.map((x) => `${x.kind}:${x.nodeName}`)).toEqual(['assembly:Engine', 'part:Piston', 'part:Crank']);
    expect(validateStructure(c).supportsComponents).toBe(true);
    expect(countTriangles(scene)).toBe(24);
  });
  it('reports a single merged mesh as not separable', () => {
    const scene = new Group();
    const only = box(1, 1, 1); only.name = 'Everything';
    scene.add(only);
    expect(validateStructure(extractComponents(scene)).supportsComponents).toBe(false);
  });
});
