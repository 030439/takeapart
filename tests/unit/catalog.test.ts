import { describe, expect, it } from 'vitest';
import { MODEL_CATALOG } from '../../src/features/models/catalog';
import { filterModels } from '../../src/lib/filterModels';

describe('catalog', () => {
  it('has unique model ids', () => {
    const ids = MODEL_CATALOG.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('has unique component ids and valid parents per model', () => {
    for (const m of MODEL_CATALOG) {
      const ids = new Set(m.components.map((c) => c.id));
      expect(ids.size).toBe(m.components.length);
      for (const c of m.components) if (c.parentId) expect(ids.has(c.parentId)).toBe(true);
    }
  });
  it('flags procedural models as placeholders', () => {
    for (const m of MODEL_CATALOG) if (m.source === 'procedural') expect(m.isPlaceholder).toBe(true);
  });
});

describe('filterModels', () => {
  const base = { search: '', filter: 'all' as const, favorites: [] as string[], recents: [] as string[] };
  it('filters by category', () => {
    const out = filterModels(MODEL_CATALOG, { ...base, filter: 'engines' });
    expect(out.every((m) => m.category === 'engines')).toBe(true);
  });
  it('filters by search text', () => {
    expect(filterModels(MODEL_CATALOG, { ...base, search: 'gear' }).length).toBeGreaterThan(0);
    expect(filterModels(MODEL_CATALOG, { ...base, search: 'zzzz' })).toHaveLength(0);
  });
  it('returns recents in order and favorites only', () => {
    const [a, b] = MODEL_CATALOG;
    expect(filterModels(MODEL_CATALOG, { ...base, filter: 'recent', recents: [b.id, a.id] }).map((m) => m.id)).toEqual([b.id, a.id]);
    expect(filterModels(MODEL_CATALOG, { ...base, filter: 'favorites', favorites: [a.id] }).map((m) => m.id)).toEqual([a.id]);
  });
});
