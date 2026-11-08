import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractComponents, validateStructure, type NodeLike } from '../../src/features/models/modelStructure';

const buf = readFileSync(new URL('../../public/models/samples/multipart-sample.glb', import.meta.url));

function parse() {
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  const binLen = buf.readUInt32LE(20 + jsonLen);
  return { json, bin: buf.subarray(binStart, binStart + binLen) };
}

describe('sample GLB', () => {
  it('has a valid GLB header and chunk layout', () => {
    expect(buf.readUInt32LE(0)).toBe(0x46546c67);
    expect(buf.readUInt32LE(4)).toBe(2);
    expect(buf.readUInt32LE(8)).toBe(buf.length);
    const jsonLen = buf.readUInt32LE(12);
    expect(buf.readUInt32LE(16)).toBe(0x4e4f534a);
    expect(buf.readUInt32LE(20 + jsonLen + 4)).toBe(0x004e4942);
  });
  it('has buffer views and accessors inside the binary chunk', () => {
    const { json, bin } = parse();
    expect(json.buffers[0].byteLength).toBeLessThanOrEqual(bin.length);
    for (const v of json.bufferViews) expect(v.byteOffset + v.byteLength).toBeLessThanOrEqual(bin.length);
    expect(json.accessors[0].count * 12).toBe(json.bufferViews[0].byteLength);
    expect(json.accessors[2].count * 2).toBe(json.bufferViews[2].byteLength);
  });
  it('has every triangle wound outward', () => {
    const { json, bin } = parse();
    const pos = new Float32Array(bin.buffer.slice(bin.byteOffset, bin.byteOffset + json.bufferViews[0].byteLength));
    const idx = new Uint16Array(bin.buffer.slice(bin.byteOffset + json.bufferViews[2].byteOffset, bin.byteOffset + json.bufferViews[2].byteOffset + json.bufferViews[2].byteLength));
    for (let t = 0; t < idx.length; t += 3) {
      const p = [0, 1, 2].map((k) => [0, 1, 2].map((a) => pos[idx[t + k] * 3 + a]));
      const e1 = p[1].map((v, i) => v - p[0][i]), e2 = p[2].map((v, i) => v - p[0][i]);
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const centre = p[0].map((_, i) => (p[0][i] + p[1][i] + p[2][i]) / 3);
      expect(n[0] * centre[0] + n[1] * centre[1] + n[2] * centre[2]).toBeGreaterThan(0);
    }
  });
  it('yields two assemblies and four parts through the hierarchy extractor', () => {
    const { json } = parse();
    const build = (i: number): NodeLike => ({
      name: json.nodes[i].name,
      isMesh: json.nodes[i].mesh !== undefined,
      children: (json.nodes[i].children ?? []).map(build),
    });
    const root: NodeLike = { name: 'Scene', children: json.scenes[0].nodes.map(build) };
    const c = extractComponents(root);
    expect(c.filter((x) => x.kind === 'assembly').map((x) => x.nodeName)).toEqual(['SampleAssembly', 'Tower']);
    expect(c.filter((x) => x.kind === 'part').map((x) => x.nodeName)).toEqual(['Base', 'Column', 'Cap', 'Pin']);
    expect(validateStructure(c).supportsComponents).toBe(true);
  });
});
