import { create } from 'zustand';
import { MODEL_CATALOG } from '@/features/models/catalog';
import { loadManifest } from '@/features/models/manifest';
import type { ModelMeta } from '@/types/model';

interface CatalogState {
  models: ModelMeta[];
  status: 'idle' | 'loading' | 'ready';
  errors: string[];
  load: () => Promise<void>;
}

/** Built-in demo objects plus whatever public/models/manifest.json lists. */
export const useCatalogStore = create<CatalogState>()((set, get) => ({
  models: [...MODEL_CATALOG],
  status: 'idle',
  errors: [],
  load: async () => {
    if (get().status !== 'idle') return;
    set({ status: 'loading' });
    const { models, errors } = await loadManifest(MODEL_CATALOG.map((m) => m.id));
    set({ models: [...MODEL_CATALOG, ...models], errors, status: 'ready' });
  },
}));
