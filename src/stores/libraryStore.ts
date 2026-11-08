import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LibraryFilter } from '@/types/model';
import { MODEL_CATALOG } from '@/features/models/catalog';

interface LibraryState {
  selectedModelId: string;
  search: string;
  filter: LibraryFilter;
  favorites: string[];
  recents: string[];
  setSearch: (q: string) => void;
  setFilter: (f: LibraryFilter) => void;
  selectModel: (id: string) => void;
  toggleFavorite: (id: string) => void;
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set) => ({
      selectedModelId: MODEL_CATALOG[0].id,
      search: '',
      filter: 'all',
      favorites: [],
      recents: [],
      setSearch: (search) => set({ search }),
      setFilter: (filter) => set({ filter }),
      selectModel: (id) =>
        set((s) => ({ selectedModelId: id, recents: [id, ...s.recents.filter((r) => r !== id)].slice(0, 8) })),
      toggleFavorite: (id) =>
        set((s) => ({ favorites: s.favorites.includes(id) ? s.favorites.filter((f) => f !== id) : [...s.favorites, id] })),
    }),
    { name: 'takeapart-library', partialize: (s) => ({ favorites: s.favorites, recents: s.recents }) },
  ),
);
