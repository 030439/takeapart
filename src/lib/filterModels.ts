import type { LibraryFilter, ModelMeta } from '@/types/model';

export function filterModels(
  models: ModelMeta[],
  opts: { search: string; filter: LibraryFilter; favorites: string[]; recents: string[] },
): ModelMeta[] {
  const q = opts.search.trim().toLowerCase();
  let out = models;
  if (opts.filter === 'favorites') out = out.filter((m) => opts.favorites.includes(m.id));
  else if (opts.filter === 'recent') out = opts.recents.map((id) => models.find((m) => m.id === id)).filter((m): m is ModelMeta => !!m);
  else if (opts.filter !== 'all') out = out.filter((m) => m.category === opts.filter);
  if (q) out = out.filter((m) => `${m.name} ${m.description} ${m.category}`.toLowerCase().includes(q));
  return out;
}
