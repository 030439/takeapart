import type { Tutorial } from './learning';

export type Category = 'anatomy' | 'engines' | 'machines';

export type PartGeometry =
  | { kind: 'cylinder'; args: [radiusTop: number, radiusBottom: number, height: number, segments: number] }
  | { kind: 'box'; args: [number, number, number] }
  | { kind: 'sphere'; args: [radius: number, widthSeg: number, heightSeg: number] }
  | { kind: 'torus'; args: [radius: number, tube: number, radialSeg: number, tubularSeg: number] };

export interface ComponentMeta {
  id: string;
  name: string;
  description: string;
  parentId?: string;
  geometry: PartGeometry;
  position: [number, number, number];
  rotation?: [number, number, number];
  color: string;
  opacity?: number;
}

/** Per-model explosion settings. `distance` is in model units (models are scaled to about 2.4 across). */
export interface ExplodeConfig {
  distance?: number;
  axis?: 'radial' | 'x' | 'y' | 'z';
}

interface ModelBase {
  id: string;
  name: string;
  category: Category;
  description: string;
  /** True for demonstration or test objects that are NOT real anatomical/mechanical models. */
  isPlaceholder: boolean;
  explode?: ExplodeConfig;
  /** Curated overview and where it came from. Shown only when supplied. */
  overview?: string;
  sources?: string[];
  tutorials?: Tutorial[];
}

/** Built in code. Always placeholders. */
export interface ProceduralModelMeta extends ModelBase {
  source: 'procedural';
  components: ComponentMeta[];
}

/** Curated educational content for one node of a GLB, keyed by node name in the manifest. */
export interface CuratedInfo {
  name: string;
  description?: string;
  purpose?: string;
  function?: string;
  /** Names of related components. */
  related?: string[];
}

/** Loaded from a .glb/.gltf listed in public/models/manifest.json. Components come from the file itself. */
export interface GlbModelMeta extends ModelBase {
  source: 'glb';
  /** Path relative to /models/. */
  filePath: string;
  /** Path relative to /thumbnails/. */
  thumbnail?: string;
  curated?: Record<string, CuratedInfo>;
}

export type ModelMeta = ProceduralModelMeta | GlbModelMeta;

/** One selectable part or grouping in the model currently on screen, whatever its source. */
export interface ComponentInfo {
  id: string;
  kind: 'part' | 'assembly';
  /** Node name as stored in the file. */
  nodeName: string;
  /** Curated name when available, otherwise the node name. */
  name: string;
  description?: string;
  purpose?: string;
  function?: string;
  related?: string[];
  parentId?: string;
  /** True only when the text above came from curated metadata. */
  curated: boolean;
}

export interface StructureValidation {
  kind: 'multi-part' | 'single-mesh' | 'empty';
  supportsComponents: boolean;
  meshCount: number;
  curatedCount: number;
  message?: string;
}

export interface ModelStats { meshes: number; triangles: number; loadMs: number }

export type LibraryFilter = 'all' | Category | 'recent' | 'favorites';
