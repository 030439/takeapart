import { Car, Cog, HeartPulse, Search, Star, type LucideIcon } from 'lucide-react';
import { filterModels } from '@/lib/filterModels';
import { THUMB_BASE } from './manifest';
import { useCatalogStore } from '@/stores/catalogStore';
import { useLibraryStore } from '@/stores/libraryStore';
import type { Category, LibraryFilter } from '@/types/model';

const ICONS: Record<Category, LucideIcon> = { anatomy: HeartPulse, engines: Car, machines: Cog };
const FILTERS: { id: LibraryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'anatomy', label: 'Anatomy' },
  { id: 'engines', label: 'Engines' },
  { id: 'machines', label: 'Machines' },
  { id: 'recent', label: 'Recent' },
  { id: 'favorites', label: 'Favorites' },
];

export function ModelLibrary({ onPick }: { onPick?: () => void }) {
  const { search, filter, favorites, recents, selectedModelId, setSearch, setFilter, selectModel, toggleFavorite } = useLibraryStore();
  const { models: all, errors } = useCatalogStore();
  const models = filterModels(all, { search, filter, favorites, recents });
  const onlyPlaceholders = all.every((m) => m.isPlaceholder);

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <label className="relative block">
        <Search size={16} className="absolute top-2.5 left-3 text-mute" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search models"
          aria-label="Search models"
          className="w-full rounded-lg border border-white/10 bg-card py-2 pr-3 pl-9 text-sm placeholder:text-mute"
        />
      </label>
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${filter === f.id ? 'border-accent bg-accent/15 text-accent2' : 'border-white/10 text-mute hover:text-ink'}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <ul className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {models.length === 0 && (
          <li className="p-4 text-center text-sm text-mute">No models match. Clear the search or pick another filter.</li>
        )}
        {models.map((m) => {
          const Icon = ICONS[m.category];
          const fav = favorites.includes(m.id);
          const thumb = m.source === 'glb' && m.thumbnail ? THUMB_BASE + m.thumbnail : null;
          return (
            <li key={m.id} className={`flex gap-3 rounded-xl border p-3 transition-colors ${m.id === selectedModelId ? 'border-accent bg-accent/10' : 'border-white/10 bg-card hover:border-white/20'}`}>
              <button onClick={() => { selectModel(m.id); onPick?.(); }} className="flex min-w-0 flex-1 gap-3 text-left">
                <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface text-accent2">
                  {thumb ? <img src={thumb} alt="" className="size-full object-cover" /> : <Icon size={22} />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{m.name}</span>
                  <span className="block text-xs text-accent2 capitalize">{m.category}{m.isPlaceholder ? ' · test object' : ''}</span>
                  <span className="mt-1 line-clamp-2 block text-xs text-mute">{m.description}</span>
                </span>
              </button>
              <button onClick={() => toggleFavorite(m.id)} aria-label={fav ? 'Remove favorite' : 'Add favorite'} aria-pressed={fav} className="self-start text-mute hover:text-accent2">
                <Star size={16} fill={fav ? 'currentColor' : 'none'} />
              </button>
            </li>
          );
        })}
      </ul>
      {onlyPlaceholders && (
        <p className="text-[11px] text-mute">Only demo and test objects are installed. Add GLB files and list them in public/models/manifest.json.</p>
      )}
      {errors.length > 0 && (
        <details className="text-[11px] text-amber-300">
          <summary>{errors.length} manifest problem{errors.length === 1 ? '' : 's'}</summary>
          <ul className="mt-1 list-disc pl-4">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
