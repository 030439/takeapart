import type { Category, CuratedInfo, ExplodeConfig, GlbModelMeta } from '../../types/model';

export const MODEL_BASE = '/models/';
export const THUMB_BASE = '/thumbnails/';
export const MANIFEST_URL = `${MODEL_BASE}manifest.json`;
export const modelUrl = (file: string): string => MODEL_BASE + file;

const CATEGORIES: readonly Category[] = ['anatomy', 'engines', 'machines'];
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SAFE_PATH = /^[A-Za-z0-9_\-./]+$/;

export function isSafeRelativePath(p: unknown, ext: RegExp): p is string {
  return typeof p === 'string' && p.length < 200 && !p.startsWith('/') && !p.includes('..') && SAFE_PATH.test(p) && ext.test(p);
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

function parseCurated(raw: unknown, errors: string[], where: string): Record<string, CuratedInfo> | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) { errors.push(`${where}: "components" must be an object`); return undefined; }
  const out: Record<string, CuratedInfo> = {};
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    const o = v as Record<string, unknown> | null;
    if (!o || typeof o !== 'object' || !isStr(o.name)) { errors.push(`${where}: component "${key}" needs a "name"`); continue; }
    const info: CuratedInfo = { name: o.name };
    if (isStr(o.description)) info.description = o.description;
    if (isStr(o.purpose)) info.purpose = o.purpose;
    if (isStr(o.function)) info.function = o.function;
    if (Array.isArray(o.related)) info.related = o.related.filter(isStr);
    out[key] = info;
  }
  return out;
}

function parseExplode(raw: unknown): ExplodeConfig | null | undefined {
  if (raw === undefined) return undefined;
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const out: ExplodeConfig = {};
  if (o.distance !== undefined) {
    if (typeof o.distance !== 'number' || !(o.distance > 0 && o.distance <= 10)) return null;
    out.distance = o.distance;
  }
  if (o.axis !== undefined) {
    if (o.axis !== 'radial' && o.axis !== 'x' && o.axis !== 'y' && o.axis !== 'z') return null;
    out.axis = o.axis;
  }
  return out;
}

/** Validates manifest JSON. Bad entries are skipped and reported, never half-loaded. */
export function parseManifest(json: unknown, reservedIds: Iterable<string> = []): { models: GlbModelMeta[]; errors: string[] } {
  const errors: string[] = [];
  const models: GlbModelMeta[] = [];
  const seen = new Set(reservedIds);
  const root = json as { version?: unknown; models?: unknown } | null;
  if (!root || typeof root !== 'object' || root.version !== 1 || !Array.isArray(root.models)) {
    return { models, errors: ['manifest.json must be {"version": 1, "models": [...]}'] };
  }
  root.models.forEach((raw, i) => {
    const e = raw as Record<string, unknown> | null;
    const where = `models[${i}]${e && typeof e.id === 'string' ? ` (${e.id})` : ''}`;
    if (!e || typeof e !== 'object') { errors.push(`${where}: not an object`); return; }
    if (typeof e.id !== 'string' || !ID.test(e.id)) { errors.push(`${where}: "id" must be lowercase letters, digits and dashes`); return; }
    if (seen.has(e.id)) { errors.push(`${where}: duplicate id`); return; }
    if (!isStr(e.name) || !isStr(e.description)) { errors.push(`${where}: "name" and "description" are required`); return; }
    if (!CATEGORIES.includes(e.category as Category)) { errors.push(`${where}: "category" must be one of ${CATEGORIES.join(', ')}`); return; }
    if (!isSafeRelativePath(e.file, /\.(glb|gltf)$/i)) { errors.push(`${where}: "file" must be a relative .glb or .gltf path`); return; }
    if (e.thumbnail !== undefined && !isSafeRelativePath(e.thumbnail, /\.(png|jpe?g|webp|svg)$/i)) { errors.push(`${where}: invalid "thumbnail" path`); return; }
    const explode = parseExplode(e.explode);
    if (explode === null) { errors.push(`${where}: "explode" must be {distance?: 0..10, axis?: radial|x|y|z}`); return; }
    seen.add(e.id);
    models.push({
      id: e.id, name: e.name, category: e.category as Category, description: e.description,
      isPlaceholder: e.placeholder === true, source: 'glb', filePath: e.file,
      thumbnail: e.thumbnail as string | undefined, curated: parseCurated(e.components, errors, where), explode,
    });
  });
  return { models, errors };
}

/** Fetches the manifest. A missing manifest is not an error: it just means no GLB models are installed. */
export async function loadManifest(reservedIds: Iterable<string>): Promise<{ models: GlbModelMeta[]; errors: string[] }> {
  try {
    const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
    const type = res.headers.get('content-type') ?? '';
    if (res.status === 404 || type.includes('text/html')) return { models: [], errors: [] };
    if (!res.ok) return { models: [], errors: [`Could not load manifest.json (HTTP ${res.status}).`] };
    return parseManifest(await res.json(), reservedIds);
  } catch {
    return { models: [], errors: ['manifest.json could not be read as JSON.'] };
  }
}
