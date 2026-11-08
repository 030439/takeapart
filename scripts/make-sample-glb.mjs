// Writes public/models/samples/multipart-sample.glb: four boxes in two assemblies.
// A test asset for the loader. It is not a real machine.
import { mkdirSync, writeFileSync } from 'node:fs';

const faces = [
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
];
const pos = [], nor = [], idx = [];
faces.forEach(([n, u, v], f) => {
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    for (let k = 0; k < 3; k++) pos.push(n[k] * 0.5 + u[k] * 0.5 * a + v[k] * 0.5 * b);
    nor.push(...n);
  }
  const o = f * 4;
  idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
});
const P = Buffer.from(new Float32Array(pos).buffer);
const N = Buffer.from(new Float32Array(nor).buffer);
const I = Buffer.from(new Uint16Array(idx).buffer);
const bin = Buffer.concat([P, N, I]);

const colors = [[0.55, 0.6, 0.68, 1], [0.06, 0.73, 0.5, 1], [0.2, 0.83, 0.6, 1], [0.8, 0.84, 0.88, 1]];
const parts = [
  ['Base', [0, -0.55, 0], [2, 0.3, 1.2]], ['Column', [0, 0.1, 0], [0.4, 1.2, 0.4]],
  ['Cap', [0, 0.85, 0], [0.9, 0.25, 0.9]], ['Pin', [0.9, 0.1, 0], [0.15, 0.15, 1.6]],
];
const json = {
  asset: { version: '2.0', generator: 'takeapart make-sample-glb' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [
    { name: 'SampleAssembly', children: [1, 2, 5] },
    { name: 'Base', mesh: 0, translation: parts[0][1], scale: parts[0][2] },
    { name: 'Tower', children: [3, 4] },
    { name: 'Column', mesh: 1, translation: parts[1][1], scale: parts[1][2] },
    { name: 'Cap', mesh: 2, translation: parts[2][1], scale: parts[2][2] },
    { name: 'Pin', mesh: 3, translation: parts[3][1], scale: parts[3][2] },
  ],
  meshes: parts.map(([name], i) => ({ name, primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: i }] })),
  materials: colors.map((c) => ({ pbrMetallicRoughness: { baseColorFactor: c, metallicFactor: 0.3, roughnessFactor: 0.5 } })),
  accessors: [
    { bufferView: 0, componentType: 5126, count: 24, type: 'VEC3', min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
    { bufferView: 1, componentType: 5126, count: 24, type: 'VEC3' },
    { bufferView: 2, componentType: 5123, count: 36, type: 'SCALAR' },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: P.length, target: 34962 },
    { buffer: 0, byteOffset: P.length, byteLength: N.length, target: 34962 },
    { buffer: 0, byteOffset: P.length + N.length, byteLength: I.length, target: 34963 },
  ],
  buffers: [{ byteLength: bin.length }],
};

const pad = (b, byte) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, byte)]);
const jsonChunk = pad(Buffer.from(JSON.stringify(json)), 0x20);
const binChunk = pad(bin, 0);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
const chunk = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32LE(data.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, data]); };

mkdirSync('public/models/samples', { recursive: true });
writeFileSync('public/models/samples/multipart-sample.glb', Buffer.concat([header, chunk(0x4e4f534a, jsonChunk), chunk(0x004e4942, binChunk)]));
console.log('wrote public/models/samples/multipart-sample.glb');
