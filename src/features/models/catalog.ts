import type { ComponentInfo, ProceduralModelMeta } from '@/types/model';

/** Built-in procedural demo objects. Real models are listed in public/models/manifest.json. */
export const MODEL_CATALOG: ProceduralModelMeta[] = [
  {
    id: 'demo-gear-assembly',
    name: 'Gear Assembly (demo)',
    category: 'machines',
    description: 'Procedural placeholder: two gears on a shaft. Not a real gearbox.',
    source: 'procedural',
    isPlaceholder: true,
    components: [
      { id: 'shaft', name: 'Shaft', description: 'Generic cylinder used as a shaft in this demo object.', geometry: { kind: 'cylinder', args: [0.1, 0.1, 0.9, 20] }, position: [-0.9, 0, 0], rotation: [Math.PI / 2, 0, 0], color: '#94a3b8' },
      { id: 'gear-a', name: 'Gear A', description: 'Large low-poly cylinder representing a gear in this demo.', parentId: 'shaft', geometry: { kind: 'cylinder', args: [0.8, 0.8, 0.25, 14] }, position: [-0.9, 0, 0], rotation: [Math.PI / 2, 0, 0], color: '#10b981' },
      { id: 'gear-b', name: 'Gear B', description: 'Small low-poly cylinder representing a gear in this demo.', geometry: { kind: 'cylinder', args: [0.5, 0.5, 0.25, 10] }, position: [0.55, 0, 0], rotation: [Math.PI / 2, 0, 0], color: '#34d399' },
      { id: 'bearing', name: 'Bearing ring', description: 'Torus used as a ring around Gear B in this demo.', parentId: 'gear-b', geometry: { kind: 'torus', args: [0.3, 0.05, 12, 24] }, position: [0.55, 0, 0.18], color: '#e2e8f0' },
    ],
  },
  {
    id: 'demo-piston-assembly',
    name: 'Piston Assembly (demo)',
    category: 'engines',
    description: 'Procedural placeholder: block, piston, rod and crank pin. Not a real engine.',
    source: 'procedural',
    isPlaceholder: true,
    explode: { axis: 'y', distance: 1.2 },
    overview: 'A demonstration object. Its parts are plain shapes with generic labels and say nothing about how a real engine works.',
    tutorials: [
      {
        id: 'piston-walkthrough',
        title: 'Explore the piston demo',
        summary: 'The select, explode, inspect and reassemble flow, on a demo object.',
        requiresComponents: true,
        needsCamera: false,
        steps: [
          { id: 'intro', title: 'About this demo', text: 'These parts are simple shapes standing in for an engine. Real engines get their descriptions from curated model metadata.', action: { type: 'read' } },
          { id: 'explode', title: 'Pull it apart', text: 'Drag the Explode slider to at least 75%.', action: { type: 'explode', min: 0.75 } },
          { id: 'piston', title: 'Select the piston', text: 'Select the part named Piston.', action: { type: 'select', component: 'piston' } },
          { id: 'inspect', title: 'Inspect its details', text: 'Read the Selected component panel. For this demo it shows only a generic label.', action: { type: 'read' } },
          { id: 'crank', title: 'Locate the crank pin', text: 'Select the part named Crank pin.', action: { type: 'select', component: 'crank' } },
          { id: 'assemble', title: 'Reassemble', text: 'Press Assemble to put everything back.', action: { type: 'assemble' } },
        ],
      },
    ],
    components: [
      { id: 'block', name: 'Block', description: 'Translucent box standing in for a cylinder block in this demo.', geometry: { kind: 'box', args: [1.2, 1.6, 1.2] }, position: [0, 0.5, 0], color: '#64748b', opacity: 0.35 },
      { id: 'piston', name: 'Piston', description: 'Cylinder standing in for a piston in this demo.', parentId: 'block', geometry: { kind: 'cylinder', args: [0.45, 0.45, 0.4, 24] }, position: [0, 0.9, 0], color: '#10b981' },
      { id: 'rod', name: 'Rod', description: 'Box standing in for a connecting rod in this demo.', parentId: 'piston', geometry: { kind: 'box', args: [0.12, 1.1, 0.12] }, position: [0, 0.2, 0], color: '#cbd5e1' },
      { id: 'crank', name: 'Crank pin', description: 'Sphere standing in for a crank journal in this demo.', geometry: { kind: 'sphere', args: [0.2, 24, 16] }, position: [0, -0.4, 0], color: '#34d399' },
    ],
  },
  {
    id: 'demo-layered-sphere',
    name: 'Layered Sphere (demo)',
    category: 'anatomy',
    description: 'Procedural placeholder: nested translucent spheres. Not anatomical.',
    source: 'procedural',
    isPlaceholder: true,
    components: [
      { id: 'outer', name: 'Outer layer', description: 'Largest translucent sphere in this demo.', geometry: { kind: 'sphere', args: [1, 32, 24] }, position: [0, 0, 0], color: '#38bdf8', opacity: 0.25 },
      { id: 'middle', name: 'Middle layer', description: 'Mid-size sphere nested inside the outer layer.', parentId: 'outer', geometry: { kind: 'sphere', args: [0.62, 32, 24] }, position: [0, 0, 0], color: '#10b981', opacity: 0.5 },
      { id: 'core', name: 'Core', description: 'Smallest sphere at the center of this demo.', parentId: 'middle', geometry: { kind: 'sphere', args: [0.3, 24, 16] }, position: [0, 0, 0], color: '#f8fafc' },
    ],
  },
];

export const componentsFromMeta = (m: ProceduralModelMeta): ComponentInfo[] =>
  m.components.map((c) => ({
    id: c.id, kind: 'part', nodeName: c.id, name: c.name, description: c.description, parentId: c.parentId, curated: false,
  }));
