import type { ComponentInfo, CuratedInfo, StructureValidation } from '../../types/model';

/** The slice of THREE.Object3D this module needs, so the logic is testable without Three.js. */
export interface NodeLike {
  name: string;
  children: NodeLike[];
  isMesh?: boolean;
}

export interface ExtractedComponent extends ComponentInfo {
  /** Child-index path from the root to the node. */
  path: number[];
}

/** Matches how three's GLTFLoader sanitises node names (spaces become underscores, reserved characters are dropped). */
export const normalizeName = (n: string): string => n.trim().toLowerCase().replace(/\s+/g, '_').replace(/[[\]./:]/g, '');

const countMeshes = (n: NodeLike): number => (n.isMesh ? 1 : 0) + n.children.reduce((s, c) => s + countMeshes(c), 0);

export function resolveNode<T extends NodeLike>(root: T, path: number[]): T | null {
  let node: NodeLike = root;
  for (const i of path) {
    const next: NodeLike | undefined = node.children[i];
    if (!next) return null;
    node = next;
  }
  return node as T;
}

/**
 * Components are the meshes. Named groups holding two or more meshes become assemblies (parents in the
 * hierarchy); unnamed or single-mesh groups are flattened. Display text comes only from `curated`
 * metadata, never from guessing at node names.
 */
export function extractComponents(root: NodeLike, curated?: Record<string, CuratedInfo>): ExtractedComponent[] {
  const lookup = new Map(Object.entries(curated ?? {}).map(([k, v]) => [normalizeName(k), v]));
  const out: ExtractedComponent[] = [];

  const make = (node: NodeLike, id: string, kind: 'part' | 'assembly', path: number[], parentId?: string): ExtractedComponent => {
    const info = lookup.get(normalizeName(node.name));
    const nodeName = node.name || '(unnamed mesh)';
    return {
      id, kind, nodeName, name: info?.name ?? nodeName, description: info?.description, purpose: info?.purpose,
      function: info?.function, related: info?.related, parentId, curated: !!info, path,
    };
  };

  const walk = (node: NodeLike, path: number[], parentId?: string) => {
    let next = parentId;
    if (path.length === 0) {
      if (node.isMesh) out.push(make(node, 'root', 'part', path));
    } else if (node.isMesh) {
      out.push(make(node, path.join('.'), 'part', path, parentId));
    } else if (node.name.trim() !== '' && countMeshes(node) >= 2) {
      const id = `g${path.join('.')}`;
      out.push(make(node, id, 'assembly', path, parentId));
      next = id;
    }
    node.children.forEach((c, i) => walk(c, [...path, i], next));
  };
  walk(root, []);
  return out;
}

export function validateStructure(components: ComponentInfo[]): StructureValidation {
  const parts = components.filter((c) => c.kind === 'part');
  const curatedCount = parts.filter((c) => c.curated).length;
  if (parts.length === 0) {
    return { kind: 'empty', supportsComponents: false, meshCount: 0, curatedCount, message: 'The file contains no meshes.' };
  }
  if (parts.length === 1) {
    return {
      kind: 'single-mesh', supportsComponents: false, meshCount: 1, curatedCount,
      message: 'This model is a single merged mesh. You can rotate and inspect it, but its individual components cannot be selected or disassembled.',
    };
  }
  return { kind: 'multi-part', supportsComponents: true, meshCount: parts.length, curatedCount };
}

/** Uniform scale and translation that centre a bounding box at the origin and fit its longest side to `target`. */
export function fitTransform(min: [number, number, number], max: [number, number, number], target: number) {
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const longest = Math.max(...size);
  const scale = longest > 1e-9 ? target / longest : 1;
  const offset = [0, 1, 2].map((i) => -((min[i] + max[i]) / 2) * scale) as [number, number, number];
  return { scale, offset };
}
