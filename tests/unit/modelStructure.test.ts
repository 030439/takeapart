import { describe, expect, it } from 'vitest';
import { extractComponents, fitTransform, normalizeName, resolveNode, validateStructure, type NodeLike } from '../../src/features/models/modelStructure';
import { parseManifest } from '../../src/features/models/manifest';

const node = (name: string, children: NodeLike[] = [], isMesh = false): NodeLike => ({ name, children, isMesh });
const mesh = (name: string) => node(name, [], true);

const tree = () =>
  node('Scene', [
    node('Assembly', [
      mesh('Base'),
      node('Tower', [mesh('Column'), mesh('Cap')]),
      node('', [mesh('Pin')]), // unnamed group: flattened
    ]),
    node('Lonely', [mesh('Single')]), // named group with one mesh: flattened
  ]);

describe('extractComponents', () => {
  it('finds meshes as parts and multi-mesh named groups as assemblies', () => {
    const c = extractComponents(tree());
    expect(c.filter((x) => x.kind === 'part').map((x) => x.nodeName)).toEqual(['Base', 'Column', 'Cap', 'Pin', 'Single']);
    expect(c.filter((x) => x.kind === 'assembly').map((x) => x.nodeName)).toEqual(['Assembly', 'Tower']);
  });
  it('records parent-child relationships', () => {
    const c = extractComponents(tree());
    const by = (n: string) => c.find((x) => x.nodeName === n)!;
    expect(by('Assembly').parentId).toBeUndefined();
    expect(by('Base').parentId).toBe(by('Assembly').id);
    expect(by('Column').parentId).toBe(by('Tower').id);
    expect(by('Tower').parentId).toBe(by('Assembly').id);
    expect(by('Pin').parentId).toBe(by('Assembly').id); // unnamed group flattened
    expect(by('Single').parentId).toBeUndefined();
  });
  it('gives unique ids and resolvable paths', () => {
    const root = tree();
    const c = extractComponents(root);
    expect(new Set(c.map((x) => x.id)).size).toBe(c.length);
    for (const x of c.filter((p) => p.kind === 'part')) expect(resolveNode(root, x.path)?.name).toBe(x.nodeName);
    expect(resolveNode(root, [9])).toBeNull();
  });
  it('uses curated text only where it exists and never invents descriptions', () => {
    const c = extractComponents(tree(), { column: { name: 'Column (curated)', description: 'Verified text' } });
    const col = c.find((x) => x.nodeName === 'Column')!;
    expect(col.name).toBe('Column (curated)');
    expect(col.description).toBe('Verified text');
    expect(col.curated).toBe(true);
    const cap = c.find((x) => x.nodeName === 'Cap')!;
    expect(cap.name).toBe('Cap');
    expect(cap.description).toBeUndefined();
    expect(cap.curated).toBe(false);
  });
  it('treats a mesh at the root as a single part', () => {
    expect(extractComponents(mesh('Whole')).map((x) => x.id)).toEqual(['root']);
  });
});

describe('validateStructure', () => {
  it('accepts multi-part models', () => {
    const v = validateStructure(extractComponents(tree()));
    expect(v.kind).toBe('multi-part');
    expect(v.supportsComponents).toBe(true);
    expect(v.meshCount).toBe(5);
  });
  it('flags a single merged mesh with a clear limitation', () => {
    const v = validateStructure(extractComponents(node('Scene', [mesh('Everything')])));
    expect(v.kind).toBe('single-mesh');
    expect(v.supportsComponents).toBe(false);
    expect(v.message).toContain('single merged mesh');
  });
  it('flags empty files', () => {
    const v = validateStructure(extractComponents(node('Scene', [node('Empty')])));
    expect(v.kind).toBe('empty');
    expect(v.supportsComponents).toBe(false);
  });
});

describe('helpers', () => {
  it('normalizes names the way GLTFLoader does', () => {
    expect(normalizeName(' Input Shaft.001 ')).toBe('input_shaft001');
  });
  it('fits a box to the target size and centres it', () => {
    const f = fitTransform([8, -1, -1], [12, 1, 1], 2); // 4 x 2 x 2 centred at (10, 0, 0)
    expect(f.scale).toBeCloseTo(0.5, 9);
    expect(f.offset[0]).toBeCloseTo(-5, 9);
    expect(f.offset[1]).toBeCloseTo(0, 9);
    expect(fitTransform([0, 0, 0], [0, 0, 0], 2).scale).toBe(1);
  });
});

describe('parseManifest', () => {
  const good = { id: 'gearbox', name: 'Gearbox', category: 'machines', description: 'd', file: 'machines/gearbox.glb' };
  it('accepts a valid entry and carries curated metadata', () => {
    const r = parseManifest({ version: 1, models: [{ ...good, components: { Shaft: { name: 'Shaft', related: ['Gear'] } } }] });
    expect(r.errors).toEqual([]);
    expect(r.models).toHaveLength(1);
    expect(r.models[0].source).toBe('glb');
    expect(r.models[0].curated?.Shaft.related).toEqual(['Gear']);
  });
  it('rejects a wrong version or shape', () => {
    expect(parseManifest({ version: 2, models: [] }).errors).toHaveLength(1);
    expect(parseManifest(null).models).toEqual([]);
  });
  it('skips and reports invalid entries', () => {
    const r = parseManifest({
      version: 1,
      models: [
        { ...good, id: 'Bad ID' },
        { ...good, id: 'a', category: 'cars' },
        { ...good, id: 'b', file: '../secret.glb' },
        { ...good, id: 'c', file: '/abs/x.glb' },
        { ...good, id: 'd', file: 'https://x.test/a.glb' },
        { ...good, id: 'e', file: 'x.obj' },
        { ...good, id: 'f', thumbnail: 'a/../b.png' },
        good,
      ],
    });
    expect(r.models.map((m) => m.id)).toEqual(['gearbox']);
    expect(r.errors).toHaveLength(7);
  });
  it('rejects duplicate ids and ids reserved by built-in models', () => {
    const r = parseManifest({ version: 1, models: [good, good, { ...good, id: 'demo-gear-assembly' }] }, ['demo-gear-assembly']);
    expect(r.models).toHaveLength(1);
    expect(r.errors).toHaveLength(2);
  });
});
